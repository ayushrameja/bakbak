import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createStabilizationCandidateManifest } from "./write-stabilization-candidate-manifest.mjs";

const workflow = await readFile(
  new URL("../.github/workflows/stabilization-candidate.yml", import.meta.url),
  "utf8",
);
const packageMetadata = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("candidate workflow builds two exact-revision installers without publishing", () => {
  assert.match(workflow, /types: \[labeled\]/);
  assert.match(
    workflow,
    /github\.event\.label\.name == 'stabilization:candidate'/,
  );
  assert.match(
    workflow,
    /source_sha must be one exact 40-character commit SHA/,
  );
  assert.match(
    workflow,
    /ref: \$\{\{ needs\.prepare\.outputs\.source_sha \}\}/,
  );
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$REQUESTED_SHA"/);
  assert.match(workflow, /name: macOS Apple Silicon\n {12}platform: macos-26/);
  assert.match(workflow, /--target aarch64-apple-darwin --bundles app,dmg/);
  assert.match(workflow, /name: Windows x64\n {12}platform: windows-latest/);
  assert.match(workflow, /args: --bundles nsis/);
  assert.match(workflow, /src-tauri\/tauri\.local\.conf\.json/);
  assert.match(workflow, /node scripts\/check-bundle-secrets\.mjs/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /retention-days: 7/);
  assert.doesNotMatch(workflow, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.doesNotMatch(workflow, /tauri-action/);
  assert.doesNotMatch(workflow, /gh release|contents: write/);
});

test("candidate manifest records bounded public provenance", () => {
  assert.deepEqual(
    createStabilizationCandidateManifest({
      sourceSha: "A".repeat(40),
      platform: "windows-x64",
      workflowRun: "12345.2",
    }),
    {
      schemaVersion: 1,
      kind: "bakbak-stabilization-candidate",
      appVersion: packageMetadata.version,
      sourceRevision: "a".repeat(40),
      platform: "windows-x64",
      workflowRun: "12345.2",
      updaterArtifacts: false,
    },
  );
  assert.throws(
    () =>
      createStabilizationCandidateManifest({
        sourceSha: "main",
        platform: "macos-aarch64",
      }),
    /exact 40-character commit SHA/,
  );
  assert.throws(
    () =>
      createStabilizationCandidateManifest({
        sourceSha: "a".repeat(40),
        platform: "linux-x64",
      }),
    /Unsupported candidate platform/,
  );
});
