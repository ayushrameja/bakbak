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

test("validates Tauri's generic and bundle-specific updater targets", () => {
  const entry = { signature: "signed", url: "https://example.com/update" };
  assert.doesNotThrow(() =>
    verifyUpdaterManifest(
      {
        version: "0.2.1",
        platforms: {
          "darwin-aarch64": entry,
          "darwin-aarch64-app": entry,
          "windows-x86_64": entry,
          "windows-x86_64-nsis": entry,
        },
      },
      "0.2.1",
    ),
  );
});

test("validates every supported updater alias", () => {
  const entry = { signature: "signed", url: "https://example.com/update" };

  assert.throws(
    () =>
      verifyUpdaterManifest(
        {
          version: "0.2.1",
          platforms: {
            "darwin-aarch64": entry,
            "darwin-aarch64-app": { url: entry.url },
            "windows-x86_64": entry,
            "windows-x86_64-nsis": entry,
          },
        },
        "0.2.1",
      ),
    /entry darwin-aarch64-app lacks a URL or signature/,
  );
});

test("rejects Intel macOS and other unsupported updater targets", () => {
  const entry = { signature: "signed", url: "https://example.com/update" };
  const supportedPlatforms = {
    "darwin-aarch64": entry,
    "windows-x86_64-nsis": entry,
  };

  assert.throws(
    () =>
      verifyUpdaterManifest(
        {
          version: "0.2.1",
          platforms: { ...supportedPlatforms, "darwin-x86_64": entry },
        },
        "0.2.1",
      ),
    /unsupported Intel macOS target darwin-x86_64/,
  );
  assert.throws(
    () =>
      verifyUpdaterManifest(
        {
          version: "0.2.1",
          platforms: { ...supportedPlatforms, "linux-x86_64": entry },
        },
        "0.2.1",
      ),
    /unsupported target linux-x86_64/,
  );
  assert.throws(
    () =>
      verifyUpdaterManifest(
        {
          version: "0.2.1",
          platforms: { ...supportedPlatforms, "darwin-aarch64-dmg": entry },
        },
        "0.2.1",
      ),
    /unsupported target darwin-aarch64-dmg/,
  );
});

test("release builds only Apple Silicon macOS and Windows installers", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /--target aarch64-apple-darwin --bundles app,dmg/);
  assert.doesNotMatch(workflow, /--target x86_64-apple-darwin/);
  assert.match(
    workflow,
    /name: macOS Apple Silicon\n {12}platform: macos-26\n/,
  );
  assert.doesNotMatch(workflow, /name: macOS Intel/);
  assert.match(workflow, /name: Windows x64\n {12}platform: windows-latest\n/);
  assert.match(workflow, /rust-targets: aarch64-apple-darwin\n/);
  assert.match(workflow, /test "\$dmg_count" -eq 1/);
  assert.match(workflow, /test "\$arm_dmg_count" -eq 1/);
  assert.match(workflow, /test "\$intel_macos_count" -eq 0/);
  assert.match(workflow, /test "\$exe_count" -eq 1/);
  assert.match(workflow, /Intel Mac users remain on Bakbak v0\.4\.0/);
  assert.match(
    workflow,
    /tauri-apps\/tauri-action@1deb371b0cd8bd54025b384f1cd735e725c4060f/,
  );
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
