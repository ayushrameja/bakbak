import { readFile, writeFile } from "node:fs/promises";
import {
  isStableSemver,
  lockedBakbakVersion,
  packageVersionFromCargo,
  withCargoPackageVersion,
  withLockedBakbakVersion,
  withPackageVersion,
} from "./set-version-lib.mjs";

const checkOnly = process.argv.includes("--check");
const requestedVersion = process.argv.find((argument) =>
  /^\d+\.\d+\.\d+$/.test(argument),
);
const packagePath = new URL("../package.json", import.meta.url);
const tauriConfigPath = new URL(
  "../src-tauri/tauri.conf.json",
  import.meta.url,
);
const cargoPath = new URL("../src-tauri/Cargo.toml", import.meta.url);
const cargoLockPath = new URL("../src-tauri/Cargo.lock", import.meta.url);
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
const cargo = await readFile(cargoPath, "utf8");
const cargoLock = await readFile(cargoLockPath, "utf8");

if (checkOnly) {
  if (!isStableSemver(packageJson.version)) {
    throw new Error(
      `Bakbak version is not stable SemVer: ${packageJson.version}`,
    );
  }
  const versions = [
    tauriConfig.version,
    packageVersionFromCargo(cargo),
    lockedBakbakVersion(cargoLock),
  ];
  if (versions.some((version) => version !== packageJson.version)) {
    throw new Error(
      `Bakbak version metadata is out of sync: ${[packageJson.version, ...versions].join(", ")}`,
    );
  }
  process.stdout.write(`Bakbak version ${packageJson.version} is valid.\n`);
  process.exit(0);
}

if (!requestedVersion) {
  throw new Error("Usage: node scripts/set-version.mjs <major.minor.patch>");
}

const nextPackageJson = withPackageVersion(packageJson, requestedVersion);
await writeFile(packagePath, `${JSON.stringify(nextPackageJson, null, 2)}\n`);
await writeFile(
  tauriConfigPath,
  `${JSON.stringify({ ...tauriConfig, version: requestedVersion }, null, 2)}\n`,
);
await writeFile(cargoPath, withCargoPackageVersion(cargo, requestedVersion));
await writeFile(
  cargoLockPath,
  withLockedBakbakVersion(cargoLock, requestedVersion),
);
process.stdout.write(`Set Bakbak version to ${requestedVersion}.\n`);
