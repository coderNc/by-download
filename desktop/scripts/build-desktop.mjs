import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readdir, readlink, rename, rm, symlink, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(desktopDir, "..");
const frontendDir = path.join(rootDir, "frontend");
const backendDir = path.join(rootDir, "backend");
const distDir = path.join(desktopDir, ".dist");
const frontendDistDir = path.join(distDir, "frontend");
const backendDistDir = path.join(distDir, "backend");
const buildDir = path.join(desktopDir, ".build");

const DESKTOP_HOST = "127.0.0.1";
const DESKTOP_API_URL = "http://127.0.0.1:16333/api";
const DESKTOP_WS_URL = "ws://127.0.0.1:16333/ws/progress";

function pythonExecutable() {
  if (process.env.PYTHON_EXECUTABLE) {
    return process.env.PYTHON_EXECUTABLE;
  }
  const localCandidates =
    process.platform === "win32"
      ? [path.join(rootDir, ".venv", "Scripts", "python.exe")]
      : [
          path.join(rootDir, ".venv", "bin", "python"),
          path.join(rootDir, ".venv", "bin", "python3"),
        ];

  for (const candidate of localCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return process.platform === "win32" ? "python" : "python3";
}

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function backendExecutableName() {
  return process.platform === "win32" ? "by-downloader-api.exe" : "by-downloader-api";
}

function resolveFrontendServerRoot(baseDir) {
  const candidates = [
    baseDir,
    path.join(baseDir, "frontend"),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "server.js"))) {
      return candidate;
    }
  }

  return baseDir;
}

async function walkSymlinks(rootDir, onSymlink) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isSymbolicLink()) {
      await onSymlink(fullPath);
      continue;
    }
    if (entry.isDirectory()) {
      await walkSymlinks(fullPath, onSymlink);
    }
  }
}

async function materializeSymlinks(rootDir) {
  let changed = true;

  while (changed) {
    changed = false;
    const pending = [];

    await walkSymlinks(rootDir, async (fullPath) => {
      pending.push(fullPath);
    });

    for (const fullPath of pending) {
      const linkTarget = await readlink(fullPath);
      const absoluteTarget = path.resolve(path.dirname(fullPath), linkTarget);
      const stats = await lstat(absoluteTarget);

      await unlink(fullPath);
      if (stats.isDirectory()) {
        await cp(absoluteTarget, fullPath, {
          recursive: true,
          dereference: false,
          verbatimSymlinks: true,
        });
      } else {
        await cp(absoluteTarget, fullPath, {
          dereference: false,
          verbatimSymlinks: true,
        });
      }
      changed = true;
    }
  }
}

async function normalizeStandaloneNodeModules(frontendBaseDir) {
  const rootNodeModulesDir = path.join(frontendBaseDir, "node_modules");
  const hiddenPnpmDir = path.join(rootNodeModulesDir, ".pnpm");
  const visiblePnpmDir = path.join(rootNodeModulesDir, "pnpm-store");

  if (!existsSync(hiddenPnpmDir)) {
    return;
  }

  await rm(visiblePnpmDir, { recursive: true, force: true });
  await rename(hiddenPnpmDir, visiblePnpmDir);

  await walkSymlinks(frontendBaseDir, async (fullPath) => {
    const currentTarget = await readlink(fullPath);
    if (!currentTarget.includes(".pnpm")) {
      return;
    }

    const nextTarget = currentTarget.replace("/.pnpm/", "/pnpm-store/").replace(".pnpm/", "pnpm-store/");
    if (nextTarget === currentTarget) {
      return;
    }

    await unlink(fullPath);
    await symlink(nextTarget, fullPath);
  });
}

async function populateServerNodeModules(frontendBaseDir, frontendServerRoot) {
  const rootNodeModulesDir = path.join(frontendBaseDir, "node_modules");
  const rootStoreDir = path.join(rootNodeModulesDir, "pnpm-store");
  const serverNodeModulesDir = path.join(frontendServerRoot, "node_modules");

  if (!existsSync(rootStoreDir)) {
    return;
  }

  await rm(serverNodeModulesDir, { recursive: true, force: true });
  await mkdir(serverNodeModulesDir, { recursive: true });

  const storePackages = await readdir(rootStoreDir, { withFileTypes: true });
  for (const storePackage of storePackages) {
    if (!storePackage.isDirectory() || storePackage.name === "node_modules") {
      continue;
    }

    const packageNodeModulesDir = path.join(rootStoreDir, storePackage.name, "node_modules");
    if (!existsSync(packageNodeModulesDir)) {
      continue;
    }

    const directPackages = await readdir(packageNodeModulesDir, { withFileTypes: true });
    for (const directPackage of directPackages) {
      const directPackagePath = path.join(packageNodeModulesDir, directPackage.name);

      if (directPackage.isDirectory()) {
        const targetPath = path.join(serverNodeModulesDir, directPackage.name);
        if (!existsSync(targetPath)) {
          await cp(directPackagePath, targetPath, {
            recursive: true,
            dereference: false,
            verbatimSymlinks: true,
          });
        }
        continue;
      }

      if (directPackage.isSymbolicLink() && directPackage.name.startsWith("@")) {
        const scopeTargetDir = path.join(serverNodeModulesDir, directPackage.name);
        await mkdir(scopeTargetDir, { recursive: true });
        const scopedPackages = await readdir(directPackagePath, { withFileTypes: true });
        for (const scopedPackage of scopedPackages) {
          if (!scopedPackage.isDirectory()) {
            continue;
          }
          const targetPath = path.join(scopeTargetDir, scopedPackage.name);
          if (existsSync(targetPath)) {
            continue;
          }
          await cp(path.join(directPackagePath, scopedPackage.name), targetPath, {
            recursive: true,
            dereference: false,
            verbatimSymlinks: true,
          });
        }
      }
    }
  }

  await materializeSymlinks(serverNodeModulesDir);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? rootDir,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function buildFrontend() {
  await run(
    pnpmCommand(),
    ["exec", "next", "build", "--webpack"],
    {
      cwd: frontendDir,
      env: {
        NEXT_PUBLIC_API_URL: DESKTOP_API_URL,
        NEXT_PUBLIC_WS_URL: DESKTOP_WS_URL,
      },
    },
  );

  await rm(frontendDistDir, { recursive: true, force: true });
  await cp(path.join(frontendDir, ".next", "standalone"), frontendDistDir, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
  });
  await normalizeStandaloneNodeModules(frontendDistDir);
  const frontendServerRoot = resolveFrontendServerRoot(frontendDistDir);
  await populateServerNodeModules(frontendDistDir, frontendServerRoot);
  await mkdir(path.join(frontendServerRoot, ".next"), { recursive: true });
  await cp(path.join(frontendDir, ".next", "static"), path.join(frontendServerRoot, ".next", "static"), {
    recursive: true,
  });
  await cp(path.join(frontendDir, "public"), path.join(frontendServerRoot, "public"), {
    recursive: true,
  });
}

async function buildBackend() {
  const python = pythonExecutable();
  const pyinstallerWorkDir = path.join(buildDir, "pyinstaller");
  const pyinstallerDistDir = path.join(pyinstallerWorkDir, "dist");
  const pyinstallerSpecDir = path.join(pyinstallerWorkDir, "spec");

  await rm(pyinstallerWorkDir, { recursive: true, force: true });
  await rm(backendDistDir, { recursive: true, force: true });
  await mkdir(backendDistDir, { recursive: true });

  await run(
    python,
    [
      "-m",
      "PyInstaller",
      "--noconfirm",
      "--clean",
      "--onefile",
      "--name",
      "by-downloader-api",
      path.join(backendDir, "desktop_server.py"),
      "--distpath",
      pyinstallerDistDir,
      "--workpath",
      path.join(pyinstallerWorkDir, "build"),
      "--specpath",
      pyinstallerSpecDir,
      "--paths",
      backendDir,
      "--collect-all",
      "yt_dlp",
      "--hidden-import",
      "uvicorn.logging",
      "--hidden-import",
      "uvicorn.loops.auto",
      "--hidden-import",
      "uvicorn.protocols.http.auto",
      "--hidden-import",
      "uvicorn.protocols.websockets.auto",
      "--hidden-import",
      "uvicorn.lifespan.on",
      "--hidden-import",
      "aiosqlite",
      "--hidden-import",
      "sqlite3",
    ],
    {
      cwd: rootDir,
      env: {
        PYINSTALLER_CONFIG_DIR: path.join(pyinstallerWorkDir, "config"),
      },
    },
  );

  await cp(
    path.join(pyinstallerDistDir, backendExecutableName()),
    path.join(backendDistDir, backendExecutableName()),
  );
}

async function main() {
  await mkdir(distDir, { recursive: true });
  await buildFrontend();
  await buildBackend();
  console.log("Desktop resources prepared in desktop/.dist");
  console.log(`Desktop frontend will use ${DESKTOP_API_URL} and ${DESKTOP_WS_URL}`);
  console.log(`Packaged desktop app will serve the UI on http://${DESKTOP_HOST}:16334`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
