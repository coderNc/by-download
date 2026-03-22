import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(desktopDir, "..");
const buildDir = path.join(desktopDir, "build");
const faviconPath = path.join(rootDir, "frontend", "src", "app", "favicon.ico");
const iconIcnsPath = path.join(buildDir, "icon.icns");
const iconIcoPath = path.join(buildDir, "icon.ico");

function pythonExecutable() {
  if (process.env.PYTHON_EXECUTABLE) {
    return process.env.PYTHON_EXECUTABLE;
  }
  if (process.platform === "win32") {
    return path.join(rootDir, ".venv", "Scripts", "python.exe");
  }
  return path.join(rootDir, ".venv", "bin", "python");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: desktopDir,
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

async function main() {
  await mkdir(buildDir, { recursive: true });
  await rm(iconIcnsPath, { force: true });
  await rm(iconIcoPath, { force: true });
  await run(pythonExecutable(), [
    "-c",
    [
      "from PIL import Image",
      "import sys",
      "src, icns_dst, ico_dst = sys.argv[1], sys.argv[2], sys.argv[3]",
      "image = Image.open(src)",
      "image = image.convert('RGBA')",
      "image.save(icns_dst, format='ICNS', sizes=[(16,16),(32,32),(64,64),(128,128),(256,256),(512,512),(1024,1024)])",
      "image.save(ico_dst, format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])",
    ].join("; "),
    faviconPath,
    iconIcnsPath,
    iconIcoPath,
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
