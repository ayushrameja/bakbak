import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const requiredTargets = ["darwin-aarch64", "darwin-x86_64", "windows-x86_64"];

export function verifyUpdaterManifest(manifest, expectedVersion) {
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `Updater manifest version ${manifest.version ?? "<missing>"} does not match ${expectedVersion}.`,
    );
  }
  if (!manifest.platforms || typeof manifest.platforms !== "object") {
    throw new Error("Updater manifest has no platforms object.");
  }

  for (const target of requiredTargets) {
    const matchingKey = Object.keys(manifest.platforms).find(
      (key) => key === target || key.startsWith(`${target}-`),
    );
    if (!matchingKey) throw new Error(`Updater manifest is missing ${target}.`);

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
    `Updater manifest ${expectedVersion} contains every desktop target.\n`,
  );
}
