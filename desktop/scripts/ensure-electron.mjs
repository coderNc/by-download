import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopDir = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

function getPlatformPath(platform) {
  switch (platform) {
    case "darwin":
    case "mas":
      return "Electron.app/Contents/MacOS/Electron";
    case "win32":
      return "electron.exe";
    case "linux":
    case "freebsd":
    case "openbsd":
      return "electron";
    default:
      throw new Error(`Unsupported Electron platform: ${platform}`);
  }
}

function log(message) {
  process.stdout.write(`[ensure-electron] ${message}\n`);
}

function findCachedElectronZip(cacheRoot, zipName) {
  if (!existsSync(cacheRoot)) {
    return null;
  }

  const stack = [cacheRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(candidate);
        continue;
      }
      if (entry.isFile() && entry.name === zipName) {
        return candidate;
      }
    }
  }

  return null;
}

async function ensureElectronRuntime() {
  const electronPackagePath = require.resolve("electron/package.json", { paths: [desktopDir] });
  const electronPackageDir = path.dirname(electronPackagePath);
  const electronRequire = createRequire(electronPackagePath);
  const electronPackage = require(electronPackagePath);
  const { downloadArtifact } = electronRequire("@electron/get");
  const extract = electronRequire("extract-zip");
  const version = electronPackage.version;
  const platform = process.env.npm_config_platform || process.platform;
  const arch = process.env.npm_config_arch || process.arch;
  const platformPath = getPlatformPath(platform);
  const distDir = path.join(electronPackageDir, "dist");
  const executablePath = path.join(distDir, platformPath);
  const versionFile = path.join(distDir, "version");
  const pathFile = path.join(electronPackageDir, "path.txt");

  const cacheRoot = path.join(desktopDir, ".build", "electron-cache");
  const zipName = `electron-v${version}-${platform}-${arch}.zip`;
  const stableCacheZip = path.join(cacheRoot, zipName);
  const cachedWorkspaceZip = findCachedElectronZip(cacheRoot, zipName);
  const localCandidates = [
    stableCacheZip,
    cachedWorkspaceZip,
    path.join(os.homedir(), "Library", "Caches", "electron", zipName),
    path.join(os.homedir(), ".cache", "electron", zipName),
  ].filter(Boolean);

  await mkdir(cacheRoot, { recursive: true });
  log(`Checking Electron runtime v${version} for ${platform}-${arch}`);

  if (existsSync(executablePath) && existsSync(versionFile) && existsSync(pathFile) && existsSync(stableCacheZip)) {
    log(`Electron runtime already available: ${executablePath}`);
    log(`Electron archive ready in stable cache: ${stableCacheZip}`);
    return;
  }

  let zipPath = localCandidates.find((candidate) => existsSync(candidate));
  if (!zipPath) {
    let lastLoggedBucket = -1;
    const logProgress = (progress) => {
      const percent = typeof progress.percent === "number" ? progress.percent : 0;
      const bucket = Math.floor(percent * 100);
      if (bucket < 0 || bucket === lastLoggedBucket || bucket % 10 !== 0) {
        return;
      }
      lastLoggedBucket = bucket;
      const totalMb = progress.total ? (progress.total / 1024 / 1024).toFixed(1) : "?";
      const transferredMb = progress.transferred ? (progress.transferred / 1024 / 1024).toFixed(1) : "0.0";
      log(`Downloading Electron runtime: ${bucket}% (${transferredMb} / ${totalMb} MB)`);
    };

    const mirror = process.env.ELECTRON_MIRROR || "https://npmmirror.com/mirrors/electron/";
    try {
      log(`Downloading Electron runtime from mirror: ${mirror}`);
      zipPath = await downloadArtifact({
        version,
        artifactName: "electron",
        platform,
        arch,
        cacheRoot,
        unsafelyDisableChecksums: true,
        mirrorOptions: {
          mirror,
          customDir: `v${version}`,
          customFilename: zipName,
        },
        downloadOptions: {
          getProgressCallback: logProgress,
        },
      });
    } catch (mirrorError) {
      log(`Mirror download failed, falling back to official source: ${mirrorError instanceof Error ? mirrorError.message : String(mirrorError)}`);
      zipPath = await downloadArtifact({
        version,
        artifactName: "electron",
        platform,
        arch,
        cacheRoot,
        downloadOptions: {
          getProgressCallback: logProgress,
        },
      });
    }
  } else {
    log(`Using cached Electron archive: ${zipPath}`);
  }

  if (zipPath !== stableCacheZip) {
    await copyFile(zipPath, stableCacheZip);
    zipPath = stableCacheZip;
    log(`Copied Electron archive into stable cache: ${stableCacheZip}`);
  } else {
    log(`Electron archive ready in stable cache: ${stableCacheZip}`);
  }

  log(`Extracting Electron runtime from ${zipPath}`);
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await extract(zipPath, { dir: distDir });
  await writeFile(pathFile, platformPath, "utf-8");
  await writeFile(versionFile, version, "utf-8");
  log("Electron runtime is ready");
}

ensureElectronRuntime().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
