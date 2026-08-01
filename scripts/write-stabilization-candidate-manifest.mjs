import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const WORKFLOW_RUN_PATTERN = /^\d+\.\d+$/;
const SUPPORTED_PLATFORMS = new Set(["macos-aarch64", "windows-x64"]);
const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

export function createStabilizationCandidateManifest({
  sourceSha,
  platform,
  workflowRun = "",
}) {
  if (!SOURCE_SHA_PATTERN.test(sourceSha)) {
    throw new Error(
      "Candidate source must be an exact 40-character commit SHA.",
    );
  }
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error(`Unsupported candidate platform: ${platform}`);
  }
  if (workflowRun && !WORKFLOW_RUN_PATTERN.test(workflowRun)) {
    throw new Error(`Invalid candidate workflow run: ${workflowRun}`);
  }

  return {
    schemaVersion: 1,
    kind: "bakbak-stabilization-candidate",
    appVersion: packageMetadata.version,
    sourceRevision: sourceSha.toLowerCase(),
    platform,
    workflowRun: workflowRun || null,
    updaterArtifacts: false,
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const output = argumentValue("--output");
  if (!output) throw new Error("Candidate manifest output path is required.");
  const manifest = createStabilizationCandidateManifest({
    sourceSha: argumentValue("--source-sha"),
    platform: argumentValue("--platform"),
    workflowRun: argumentValue("--workflow-run"),
  });
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `Wrote ${manifest.platform} candidate metadata for ${manifest.sourceRevision}.\n`,
  );
}
