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
  macArtifact = null,
  windowsArtifact,
  publishedAt = new Date().toISOString(),
}) {
  if (!isStableSemver(version)) throw new Error("Invalid release version.");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error("Invalid GitHub repository.");
  }
  if (tag !== `v${version}`) throw new Error("Release tag and version differ.");
  if (macArtifact && !macArtifact.endsWith(".app.tar.gz")) {
    throw new Error("The legacy macOS artifact must be an app tarball.");
  }
  if (!windowsArtifact.endsWith(".exe")) {
    throw new Error("The legacy Windows artifact must be an NSIS installer.");
  }

  const windowsSignature = await readFile(`${windowsArtifact}.sig`, "utf8");
  const windows = {
    signature: windowsSignature.trim(),
    url: releaseAssetUrl(repository, tag, windowsArtifact),
  };
  if (!windows.signature) {
    throw new Error("The legacy Windows updater signature must not be empty.");
  }
  const platforms = {
    "windows-x86_64": windows,
    "windows-x86_64-nsis": windows,
  };

  if (macArtifact) {
    const macSignature = (await readFile(`${macArtifact}.sig`, "utf8")).trim();
    if (!macSignature) {
      throw new Error("The legacy macOS updater signature must not be empty.");
    }
    const mac = {
      signature: macSignature,
      url: releaseAssetUrl(repository, tag, macArtifact),
    };
    platforms["darwin-aarch64"] = mac;
    platforms["darwin-aarch64-app"] = mac;
  }

  return {
    version,
    notes: macArtifact
      ? "Bakbak now uses Electron. This compatibility update moves supported Tauri installations to the new desktop shell."
      : "Bakbak now uses Electron on Windows. This release requires a manual DMG installation on macOS.",
    pub_date: publishedAt,
    platforms,
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
  const windowsOnly = process.argv.includes("--windows-only");
  const macArtifact = argument("--mac-artifact");
  if (windowsOnly && macArtifact) {
    throw new Error("A Windows-only manifest cannot include a macOS artifact.");
  }
  if (!windowsOnly && !macArtifact) {
    throw new Error(
      "A macOS artifact is required unless --windows-only is explicit.",
    );
  }
  const manifest = await createLegacyUpdaterManifest({
    version: argument("--version"),
    repository: argument("--repository"),
    tag: argument("--tag"),
    macArtifact: windowsOnly ? null : macArtifact,
    windowsArtifact: argument("--windows-artifact"),
  });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Wrote legacy updater manifest ${output}.\n`);
}
