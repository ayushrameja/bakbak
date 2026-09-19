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
const rehearsalConfig = JSON.parse(
  await readFile(
    new URL("../src-tauri/tauri.update-rehearsal.conf.json", import.meta.url),
    "utf8",
  ),
);

test("candidate workflow builds two exact-revision Tauri installers without publishing", () => {
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
  assert.match(workflow, /name: macOS Apple Silicon\n {12}runner: macos-26/);
  assert.match(workflow, /rust_target: aarch64-apple-darwin/);
  assert.match(workflow, /name: Windows x64\n {12}runner: windows-latest/);
  assert.match(workflow, /rust_target: x86_64-pc-windows-msvc/);
  assert.match(workflow, /pnpm exec tauri build --target/);
  assert.match(workflow, /src-tauri\/tauri\.candidate\.conf\.json/);
  assert.match(workflow, /bundle\/dmg\/\*\.dmg/);
  assert.match(workflow, /bundle\/nsis\/\*-setup\.exe/);
  assert.match(workflow, /node scripts\/check-bundle-secrets\.mjs/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /retention-days: 7/);
  assert.equal(workflow.match(/version: 11\.17\.0/g)?.length, 3);
  assert.equal(workflow.match(/node-version-file: \.node-version/g)?.length, 3);
  assert.equal(workflow.match(/dtolnay\/rust-toolchain@1\.93\.1/g)?.length, 3);
  assert.doesNotMatch(workflow, /deno-version-file: \.dvmrc\n\s+cache: true/);
  assert.match(workflow, /deno task --config supabase\/deno\.json check/);
  assert.match(workflow, /deno task --config supabase\/deno\.json test/);
  assert.match(
    workflow,
    /cargo clippy --locked --manifest-path native\/external-audio\/Cargo\.toml/,
  );
  assert.match(
    workflow,
    /cargo clippy --locked --manifest-path src-tauri\/Cargo\.toml/,
  );
  assert.match(workflow, /supabase test db/);
  assert.match(workflow, /pnpm electron:compile/);
  assert.doesNotMatch(workflow, /electron-builder|Tauri-to-Electron/);
  assert.doesNotMatch(workflow, /gh release|contents: write/);

  const ordinaryBuild = workflow.slice(
    workflow.indexOf("\n  build:"),
    workflow.indexOf("\n  windows-update-rehearsal:"),
  );
  assert.doesNotMatch(
    ordinaryBuild,
    /TAURI_SIGNING_PRIVATE_KEY|tauri\.update-rehearsal/i,
  );
});

test("manual rehearsal builds and verifies two signed loopback-only Windows versions", () => {
  const rehearsal = workflow.slice(
    workflow.indexOf("\n  windows-update-rehearsal:"),
  );
  assert.match(
    rehearsal,
    /if: github\.event_name == 'workflow_dispatch' && inputs\.windows_update_rehearsal/,
  );
  assert.match(rehearsal, /Verify exact rehearsal source/);
  assert.match(rehearsal, /update-rehearsal-version\.mjs/);
  assert.match(rehearsal, /node scripts\/set-version\.mjs "\$NEXT_VERSION"/);
  assert.equal(
    rehearsal.match(/name: Build signed .* rehearsal installer/g)?.length,
    2,
  );
  assert.equal(
    rehearsal.match(/secrets\.TAURI_SIGNING_PRIVATE_KEY\b/g)?.length,
    2,
  );
  assert.equal(
    rehearsal.match(/secrets\.TAURI_SIGNING_PRIVATE_KEY_PASSWORD\b/g)?.length,
    2,
  );
  assert.equal(
    rehearsal.match(/verify-tauri-updater-signature\.mjs/g)?.length,
    2,
  );
  assert.match(rehearsal, /create-update-rehearsal-kit\.mjs/);
  assert.match(rehearsal, /update-rehearsal\/latest\.json/);
  assert.match(rehearsal, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(rehearsal, /gh release|contents: write/);

  assert.deepEqual(rehearsalConfig.plugins.updater.endpoints, [
    "http://127.0.0.1:41793/latest.json",
  ]);
  assert.equal(
    rehearsalConfig.plugins.updater.dangerousInsecureTransportProtocol,
    true,
  );
});

test("candidate manifest records bounded public provenance", () => {
  assert.deepEqual(
    createStabilizationCandidateManifest({
      sourceSha: "A".repeat(40),
      platform: "windows-x64",
      workflowRun: "12345.2",
    }),
    {
      schemaVersion: 2,
      kind: "bakbak-stabilization-candidate",
      desktopShell: "tauri",
      packageFormat: "nsis",
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
