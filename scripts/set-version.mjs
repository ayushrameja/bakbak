import { readFile, writeFile } from "node:fs/promises";
import { isStableSemver, withPackageVersion } from "./set-version-lib.mjs";

const checkOnly = process.argv.includes("--check");
const requestedVersion = process.argv.find((argument) =>
  /^\d+\.\d+\.\d+$/.test(argument),
);
const packagePath = new URL("../package.json", import.meta.url);
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

if (checkOnly) {
  if (!isStableSemver(packageJson.version)) {
    throw new Error(
      `Bakbak version is not stable SemVer: ${packageJson.version}`,
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
process.stdout.write(`Set Bakbak version to ${requestedVersion}.\n`);
