import { readFile, writeFile } from "node:fs/promises";

const checkOnly = process.argv.includes("--check");
const requestedVersion = process.argv.find((argument) =>
  /^\d+\.\d+\.\d+$/.test(argument),
);
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const packagePath = new URL("../package.json", import.meta.url);
const tauriConfigPath = new URL(
  "../src-tauri/tauri.conf.json",
  import.meta.url,
);
const cargoManifestPath = new URL("../src-tauri/Cargo.toml", import.meta.url);
const cargoLockPath = new URL("../src-tauri/Cargo.lock", import.meta.url);

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
const cargoManifest = await readFile(cargoManifestPath, "utf8");
const cargoLock = await readFile(cargoLockPath, "utf8");
const cargoVersionMatch = /^version = "([^"]+)"$/m.exec(cargoManifest);
const cargoLockVersionMatch =
  /\[\[package\]\]\nname = "bakbak"\nversion = "([^"]+)"/.exec(cargoLock);

if (!cargoVersionMatch)
  throw new Error("Could not find the Bakbak Cargo package version.");
if (!cargoLockVersionMatch)
  throw new Error("Could not find the Bakbak Cargo lockfile version.");

if (checkOnly) {
  const versions = [
    packageJson.version,
    tauriConfig.version,
    cargoVersionMatch[1],
    cargoLockVersionMatch[1],
  ];
  if (!versions.every((version) => version === versions[0])) {
    throw new Error(
      `Version mismatch: package=${versions[0]}, tauri=${versions[1]}, cargo=${versions[2]}, cargo-lock=${versions[3]}`,
    );
  }
  if (!semverPattern.test(versions[0])) {
    throw new Error(`Bakbak version is not stable SemVer: ${versions[0]}`);
  }
  process.stdout.write(`Bakbak version ${versions[0]} is synchronized.\n`);
  process.exit(0);
}

if (!requestedVersion || !semverPattern.test(requestedVersion)) {
  throw new Error("Usage: node scripts/set-version.mjs <major.minor.patch>");
}

packageJson.version = requestedVersion;
tauriConfig.version = requestedVersion;
const nextCargoManifest = cargoManifest.replace(
  /^version = "[^"]+"$/m,
  `version = "${requestedVersion}"`,
);
const nextCargoLock = cargoLock.replace(
  /(\[\[package\]\]\nname = "bakbak"\nversion = ")[^"]+("\n)/,
  `$1${requestedVersion}$2`,
);

await Promise.all([
  writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`),
  writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`),
  writeFile(cargoManifestPath, nextCargoManifest),
  writeFile(cargoLockPath, nextCargoLock),
]);

process.stdout.write(`Set Bakbak version to ${requestedVersion}.\n`);
