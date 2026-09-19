import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isStableSemver } from "./set-version-lib.mjs";

function releaseAssetUrl(repository, tag, artifact) {
  return `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(path.basename(artifact))}`;
}

export async function createTauriUpdaterManifest({
  version,
  repository,
  tag,
  windowsArtifact,
  publishedAt = new Date().toISOString(),
}) {
  if (!isStableSemver(version)) throw new Error("Invalid release version.");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error("Invalid GitHub repository.");
  }
  if (tag !== `v${version}`) throw new Error("Release tag and version differ.");
  if (!windowsArtifact.endsWith(".exe")) {
    throw new Error("The Windows artifact must be an NSIS installer.");
  }

  const signature = (await readFile(`${windowsArtifact}.sig`, "utf8")).trim();
  if (!signature) throw new Error("The Windows updater signature is required.");

  const windows = {
    signature,
    url: releaseAssetUrl(repository, tag, windowsArtifact),
  };

  return {
    version,
    notes:
      "Bakbak 2 uses Tauri. Windows updates install automatically; macOS remains a manual DMG replacement.",
    pub_date: publishedAt,
    platforms: {
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
  const manifest = await createTauriUpdaterManifest({
    version: argument("--version"),
    repository: argument("--repository"),
    tag: argument("--tag"),
    windowsArtifact: argument("--windows-artifact"),
  });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `Wrote signed Windows Tauri updater manifest ${output}.\n`,
  );
}
