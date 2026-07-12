import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveRelease } from "./release-version.mjs";
import { verifyUpdaterManifest } from "./verify-updater-manifest.mjs";

test("uses the tracked version as the first release floor", () => {
  assert.deepEqual(
    resolveRelease({ fallbackVersion: "0.2.0", currentTag: "v0.1.7" }),
    { bump: "patch", skip: false, tag: "v0.2.0", version: "0.2.0" },
  );
});

test("increments patch by default and honors minor and skip labels", () => {
  assert.equal(
    resolveRelease({ fallbackVersion: "0.2.0", currentTag: "v0.2.0" }).version,
    "0.2.1",
  );
  assert.equal(
    resolveRelease({
      fallbackVersion: "0.2.0",
      currentTag: "v0.2.5",
      labels: ["release:minor"],
    }).version,
    "0.3.0",
  );
  assert.equal(
    resolveRelease({
      fallbackVersion: "0.2.0",
      currentTag: "v0.2.5",
      labels: ["release:skip"],
    }).skip,
    true,
  );
});

test("manual releases override a skip label", () => {
  const release = resolveRelease({
    fallbackVersion: "0.2.0",
    currentTag: "v0.2.5",
    labels: ["release:skip"],
    requestedBump: "major",
  });

  assert.deepEqual(release, {
    bump: "major",
    skip: false,
    tag: "v1.0.0",
    version: "1.0.0",
  });
});

test("validates all updater targets and their signatures", () => {
  const entry = { signature: "signed", url: "https://example.com/update" };
  assert.doesNotThrow(() =>
    verifyUpdaterManifest(
      {
        version: "0.2.1",
        platforms: {
          "darwin-aarch64": entry,
          "darwin-x86_64": entry,
          "windows-x86_64-nsis": entry,
        },
      },
      "0.2.1",
    ),
  );
});

test("macOS release jobs build installer and updater-enabled app bundles", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /--target aarch64-apple-darwin --bundles app,dmg/);
  assert.match(workflow, /--target x86_64-apple-darwin --bundles app,dmg/);
  assert.match(
    workflow,
    /name: macOS Apple Silicon\n {12}platform: macos-26\n/,
  );
  assert.match(workflow, /name: macOS Intel\n {12}platform: macos-26-intel\n/);
});

test("published releases synchronize their version through a protected-branch PR", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /sync-version:\n {4}needs: \[prepare, publish\]/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /node scripts\/set-version\.mjs "\$RELEASE_VERSION"/);
  assert.match(workflow, /src-tauri\/Cargo\.lock/);
  assert.match(workflow, /git commit -m ".*\[skip ci\]"/);
  assert.match(workflow, /gh pr create/);
  assert.match(workflow, /gh pr merge/);
});
