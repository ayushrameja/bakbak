import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const requiredTargets = ["darwin-aarch64", "windows-x86_64"];
const forbiddenTargetPrefixes = ["darwin-x86_64"];

function matchesTarget(key, target) {
  return key === target || key.startsWith(`${target}-`);
}

export function verifyUpdaterManifest(manifest, expectedVersion) {
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `Updater manifest version ${manifest.version ?? "<missing>"} does not match ${expectedVersion}.`,
    );
  }
  if (!manifest.platforms || typeof manifest.platforms !== "object") {
    throw new Error("Updater manifest has no platforms object.");
  }

  const platformKeys = Object.keys(manifest.platforms);

  const forbiddenKey = platformKeys.find((key) =>
    forbiddenTargetPrefixes.some((target) => matchesTarget(key, target)),
  );
  if (forbiddenKey) {
    throw new Error(
      `Updater manifest contains unsupported Intel macOS target ${forbiddenKey}.`,
    );
  }

  const unsupportedKey = platformKeys.find(
    (key) => !requiredTargets.some((target) => matchesTarget(key, target)),
  );
  if (unsupportedKey) {
    throw new Error(
      `Updater manifest contains unsupported target ${unsupportedKey}.`,
    );
  }

  for (const target of requiredTargets) {
    const matchingKeys = platformKeys.filter((key) =>
      matchesTarget(key, target),
    );
    if (matchingKeys.length === 0) {
      throw new Error(
        `Updater manifest is missing ${target}. Found: ${platformKeys.join(", ") || "<none>"}.`,
      );
    }
    if (matchingKeys.length > 1) {
      throw new Error(
        `Updater manifest contains multiple ${target} entries: ${matchingKeys.join(", ")}.`,
      );
    }

    const [matchingKey] = matchingKeys;
    const entry = manifest.platforms[matchingKey];
    if (!entry?.url || !entry?.signature) {
      throw new Error(
        `Updater manifest entry ${matchingKey} lacks a URL or signature.`,
      );
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const manifestPath = process.argv[2];
  const expectedVersion = process.argv[3];
  if (!manifestPath || !expectedVersion) {
    throw new Error(
      "Usage: node scripts/verify-updater-manifest.mjs <latest.json> <version>",
    );
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  verifyUpdaterManifest(manifest, expectedVersion);
  process.stdout.write(
    `Updater manifest ${expectedVersion} contains Apple Silicon macOS and Windows x64 targets.\n`,
  );
}
