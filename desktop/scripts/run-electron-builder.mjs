import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopDir = path.resolve(__dirname, "..");

const args = process.argv.slice(2);

const env = { ...process.env };

// Avoid leaking Electron runtime mirror settings into electron-builder's own helper downloads.
delete env.ELECTRON_MIRROR;
delete env.npm_config_electron_mirror;
delete env.NPM_CONFIG_ELECTRON_MIRROR;
delete env.npm_package_config_electron_mirror;

// Keep builder helper downloads on the official binaries release unless the user explicitly overrides it.
env.ELECTRON_BUILDER_BINARIES_MIRROR =
  env.ELECTRON_BUILDER_BINARIES_MIRROR ||
  "https://github.com/electron-userland/electron-builder-binaries/releases/download/";

const command = process.platform === "win32" ? "electron-builder.cmd" : "electron-builder";

const child = spawn(command, args, {
  cwd: desktopDir,
  env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
