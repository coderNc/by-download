import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const rawVersion = process.argv[2] || process.env.RELEASE_VERSION || "";
const normalizedVersion = rawVersion.trim().replace(/^v/, "");

if (!normalizedVersion) {
  console.error("Missing release version. Pass it as an argument or RELEASE_VERSION.");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalizedVersion)) {
  console.error(`Invalid release version: ${rawVersion}`);
  process.exit(1);
}

const packageFiles = [
  path.join(rootDir, "desktop", "package.json"),
  path.join(rootDir, "frontend", "package.json"),
];

for (const filePath of packageFiles) {
  const payload = JSON.parse(await readFile(filePath, "utf-8"));
  payload.version = normalizedVersion;
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  console.log(`[set-release-version] ${path.relative(rootDir, filePath)} -> ${normalizedVersion}`);
}
