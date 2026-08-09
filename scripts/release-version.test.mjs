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

test("resolves the v1 release from the exact major label", () => {
  assert.deepEqual(
    resolveRelease({
      fallbackVersion: "0.16.0",
      currentTag: "v0.16.0",
      labels: ["release:major"],
    }),
    {
      bump: "major",
      skip: false,
      tag: "v1.0.0",
      version: "1.0.0",
    },
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

test("validates legacy generic and bundle-specific updater targets", () => {
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

test("release builds only Apple Silicon macOS and Windows Electron installers", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /builder_args: --mac --arm64/);
  assert.doesNotMatch(workflow, /--mac --x64/);
  assert.match(workflow, /name: macOS Apple Silicon\n {12}runner: macos-26\n/);
  assert.doesNotMatch(workflow, /name: macOS Intel/);
  assert.match(workflow, /name: Windows x64\n {12}runner: windows-latest\n/);
  assert.match(workflow, /builder_args: --win --x64/);
  assert.match(workflow, /pnpm exec electron-builder/);
  assert.match(workflow, /latest-mac\.yml/);
  assert.match(workflow, /latest\.yml/);
  assert.match(workflow, /create-legacy-updater-manifest\.mjs/);
  assert.match(workflow, /-C release\/mac-arm64 Bakbak\.app/);
  assert.match(workflow, /pnpm dlx @tauri-apps\/cli@2\.11\.4 signer sign/);
  assert.match(workflow, /migration_rehearsal_passed:/);
  assert.match(workflow, /vars\.ELECTRON_MIGRATION_REHEARSED == 'true'/);
  assert.doesNotMatch(workflow, /rust-toolchain|cargo|src-tauri|tauri-action/i);
});

test("published releases synchronize their version through a protected-branch PR", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /sync-version:\n {4}needs: \[prepare, publish\]/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /node scripts\/set-version\.mjs "\$RELEASE_VERSION"/);
  assert.match(workflow, /git diff --quiet -- package\.json/);
  assert.doesNotMatch(workflow, /Cargo\.lock|Cargo\.toml|tauri\.conf/);
  assert.match(workflow, /git commit -m ".*\[skip ci\]"/);
  assert.match(workflow, /node scripts\/sync-release-pr\.mjs/);
  assert.doesNotMatch(workflow, /gh pr create/);
  assert.doesNotMatch(workflow, /gh pr merge/);
});

test("ordinary release publication has no chat-announcement dependency", async () => {
  const releaseWorkflow = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(releaseWorkflow, /^ {2}announce:/m);
  assert.doesNotMatch(releaseWorkflow, /system-events/);
  assert.doesNotMatch(releaseWorkflow, /BAKBAK_SYSTEM_EVENTS_SECRET/);
  await assert.rejects(
    readFile(
      new URL("../.github/workflows/system-history.yml", import.meta.url),
      "utf8",
    ),
    /ENOENT/,
  );
});
