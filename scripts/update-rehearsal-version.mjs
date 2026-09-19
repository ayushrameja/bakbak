import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const STABLE_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function nextPatchVersion(version) {
  const match = STABLE_SEMVER_PATTERN.exec(version ?? "");
  if (!match) {
    throw new Error(`Expected a stable SemVer version, received: ${version}`);
  }

  return `${match[1]}.${match[2]}.${BigInt(match[3]) + 1n}`;
}

export async function readUpdateRehearsalVersions(
  packageUrl = new URL("../package.json", import.meta.url),
) {
  const packageMetadata = JSON.parse(await readFile(packageUrl, "utf8"));
  const baseVersion = packageMetadata.version;
  return {
    baseVersion,
    nextVersion: nextPatchVersion(baseVersion),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { baseVersion, nextVersion } = await readUpdateRehearsalVersions();
  process.stdout.write(
    `base_version=${baseVersion}\nnext_version=${nextVersion}\n`,
  );
}
