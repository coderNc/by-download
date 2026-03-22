const { app, BrowserWindow, dialog, utilityProcess } = require("electron");
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const DESKTOP_API_PORT = 16333;
const DESKTOP_WEB_PORT = 16334;
const DESKTOP_HOST = "127.0.0.1";
const API_URL = `http://${DESKTOP_HOST}:${DESKTOP_API_PORT}/api`;
const WEB_URL = `http://${DESKTOP_HOST}:${DESKTOP_WEB_PORT}`;
const WS_URL = `ws://${DESKTOP_HOST}:${DESKTOP_API_PORT}/ws/progress`;

const childProcesses = [];

function projectRoot() {
  return path.resolve(__dirname, "..");
}

function desktopUserPaths() {
  const userData = app.getPath("userData");
  return {
    userData,
    downloads: path.join(userData, "downloads"),
    cookies: path.join(userData, "cookies"),
    logs: path.join(userData, "logs"),
  };
}

function pythonExecutable() {
  const root = projectRoot();
  if (process.platform === "win32") {
    return path.join(root, ".venv", "Scripts", "python.exe");
  }
  return path.join(root, ".venv", "bin", "python");
}

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function backendExecutablePath() {
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(process.resourcesPath, "backend", `by-downloader-api${ext}`);
}

function frontendServerPath() {
  return path.join(process.resourcesPath, "frontend", "server.js");
}

function resolveFrontendServerPath(baseDir) {
  const candidates = [
    path.join(baseDir, "server.js"),
    path.join(baseDir, "frontend", "server.js"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function logChild(prefix, child) {
  if (!child.stdout || !child.stderr) {
    return;
  }

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${prefix}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${prefix}] ${chunk}`);
  });
}

function trackChild(child) {
  childProcesses.push(child);
  child.on("exit", () => {
    const index = childProcesses.indexOf(child);
    if (index >= 0) {
      childProcesses.splice(index, 1);
    }
  });
  return child;
}

function spawnBackendProcess() {
  const paths = desktopUserPaths();
  const env = {
    ...process.env,
    BY_DL_HOST: DESKTOP_HOST,
    BY_DL_PORT: String(DESKTOP_API_PORT),
    BY_DL_DOWNLOAD_DIR: paths.downloads,
    BY_DL_COOKIE_DIR: paths.cookies,
    BY_DL_LOG_DIR: paths.logs,
    BY_DL_DATABASE_URL: "sqlite+aiosqlite:///./data/by_downloader.db",
    BY_DL_CORS_ORIGINS: JSON.stringify([WEB_URL, `http://localhost:${DESKTOP_WEB_PORT}`]),
  };

  if (app.isPackaged) {
    const backendExec = backendExecutablePath();
    if (!existsSync(backendExec)) {
      throw new Error(`Desktop backend executable not found: ${backendExec}`);
    }
    return trackChild(
      spawn(backendExec, [], {
        cwd: paths.userData,
        env,
        stdio: "pipe",
      }),
    );
  }

  const desktopBackendExec = path.join(projectRoot(), "desktop", ".dist", "backend", process.platform === "win32" ? "by-downloader-api.exe" : "by-downloader-api");
  if (!existsSync(desktopBackendExec)) {
    throw new Error(`Desktop backend binary not prepared: ${desktopBackendExec}. Run "pnpm build:desktop" first.`);
  }
  return trackChild(
    spawn(desktopBackendExec, [], {
      cwd: paths.userData,
      env,
      stdio: "pipe",
    }),
  );
}

function spawnFrontendProcess() {
  const env = {
    ...process.env,
    PORT: String(DESKTOP_WEB_PORT),
    HOSTNAME: DESKTOP_HOST,
    NEXT_PUBLIC_API_URL: API_URL,
    NEXT_PUBLIC_WS_URL: WS_URL,
  };

  if (app.isPackaged) {
    const serverPath = resolveFrontendServerPath(path.join(process.resourcesPath, "frontend"));
    if (!existsSync(serverPath)) {
      throw new Error(`Desktop frontend server not found: ${serverPath}`);
    }
    return trackChild(
      utilityProcess.fork(serverPath, [], {
        cwd: path.dirname(serverPath),
        env: {
          ...env,
          NODE_ENV: "production",
        },
        stdio: "pipe",
        serviceName: "BY-DOWNLOADER Frontend",
      }),
    );
  }

  const desktopFrontendServer = resolveFrontendServerPath(path.join(projectRoot(), "desktop", ".dist", "frontend"));
  if (!existsSync(desktopFrontendServer)) {
    throw new Error(`Desktop frontend server not prepared: ${desktopFrontendServer}. Run "pnpm build:desktop" first.`);
  }
  return trackChild(
    utilityProcess.fork(desktopFrontendServer, [], {
      cwd: path.dirname(desktopFrontendServer),
      env: {
        ...env,
        NODE_ENV: "production",
      },
      stdio: "pipe",
      serviceName: "BY-DOWNLOADER Frontend",
    }),
  );
}

async function waitForUrl(url, label, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}: ${url}`);
}

async function startDesktopServices() {
  const backend = spawnBackendProcess();
  logChild("desktop-backend", backend);

  const frontend = spawnFrontendProcess();
  logChild("desktop-frontend", frontend);

  await waitForUrl(`${API_URL}/health`, "backend health");
  await waitForUrl(WEB_URL, "frontend web app");
}

async function createMainWindow() {
  const window = new BrowserWindow({
    width: 1400,
    height: 940,
    minWidth: 1180,
    minHeight: 780,
    backgroundColor: "#f6f7fb",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await window.loadURL(WEB_URL);
}

function cleanupChildren() {
  while (childProcesses.length > 0) {
    const child = childProcesses.pop();
    if (child && !child.killed) {
      child.kill();
    }
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  cleanupChildren();
});

app.whenReady().then(async () => {
  try {
    await startDesktopServices();
    await createMainWindow();
  } catch (error) {
    cleanupChildren();
    await dialog.showErrorBox(
      "BY-DOWNLOADER Desktop Startup Failed",
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  }
});
