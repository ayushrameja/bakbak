import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isStableSemver } from "./set-version-lib.mjs";

function releaseAssetUrl(repository, tag, artifact) {
  return `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(path.basename(artifact))}`;
}

export async function createLegacyUpdaterManifest({
  version,
  repository,
  tag,
  macArtifact,
  windowsArtifact,
  publishedAt = new Date().toISOString(),
}) {
  if (!isStableSemver(version)) throw new Error("Invalid release version.");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error("Invalid GitHub repository.");
  }
  if (tag !== `v${version}`) throw new Error("Release tag and version differ.");
  if (!macArtifact.endsWith(".app.tar.gz")) {
    throw new Error("The legacy macOS artifact must be an app tarball.");
  }
  if (!windowsArtifact.endsWith(".exe")) {
    throw new Error("The legacy Windows artifact must be an NSIS installer.");
  }

  const [macSignature, windowsSignature] = await Promise.all([
    readFile(`${macArtifact}.sig`, "utf8"),
    readFile(`${windowsArtifact}.sig`, "utf8"),
  ]);
  const mac = {
    signature: macSignature.trim(),
    url: releaseAssetUrl(repository, tag, macArtifact),
  };
  const windows = {
    signature: windowsSignature.trim(),
    url: releaseAssetUrl(repository, tag, windowsArtifact),
  };
  if (!mac.signature || !windows.signature) {
    throw new Error("Legacy updater signatures must not be empty.");
  }

  return {
    version,
    notes:
      "Bakbak now uses Electron. This compatibility update moves supported Tauri installations to the new desktop shell.",
    pub_date: publishedAt,
    platforms: {
      "darwin-aarch64": mac,
      "darwin-aarch64-app": mac,
      "windows-x86_64": windows,
      "windows-x86_64-nsis": windows,
    },
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? "" : (process.argv[index + 1] ?? "");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const output = argument("--output");
  if (!output) throw new Error("An output path is required.");
  const manifest = await createLegacyUpdaterManifest({
    version: argument("--version"),
    repository: argument("--repository"),
    tag: argument("--tag"),
    macArtifact: argument("--mac-artifact"),
    windowsArtifact: argument("--windows-artifact"),
  });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Wrote legacy updater manifest ${output}.\n`);
}
