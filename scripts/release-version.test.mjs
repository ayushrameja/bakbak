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

test("allows an explicit Windows-only bridge for manual macOS releases", () => {
  const entry = { signature: "signed", url: "https://example.com/update" };
  const manifest = {
    version: "0.2.1",
    platforms: {
      "windows-x86_64": entry,
      "windows-x86_64-nsis": entry,
    },
  };

  assert.throws(
    () => verifyUpdaterManifest(manifest, "0.2.1"),
    /missing darwin-aarch64/,
  );
  assert.doesNotThrow(() =>
    verifyUpdaterManifest(manifest, "0.2.1", { allowMissingMacos: true }),
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

test("release builds only Apple Silicon macOS and Windows Tauri installers", async () => {
  const [
    workflow,
    macosConfig,
    windowsConfig,
    candidateConfig,
    prebuiltConfig,
  ] = await Promise.all([
    readFile(
      new URL("../.github/workflows/release.yml", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src-tauri/tauri.macos.conf.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../src-tauri/tauri.windows.conf.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../src-tauri/tauri.candidate.conf.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../src-tauri/tauri.prebuilt.conf.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
  ]);

  assert.match(workflow, /rust_target: aarch64-apple-darwin/);
  assert.doesNotMatch(workflow, /x86_64-apple-darwin/);
  assert.match(workflow, /name: macOS Apple Silicon\n {12}runner: macos-26\n/);
  assert.doesNotMatch(workflow, /name: macOS Intel/);
  assert.match(workflow, /name: Windows x64\n {12}runner: windows-latest\n/);
  assert.match(workflow, /rust_target: x86_64-pc-windows-msvc/);
  assert.equal(workflow.match(/pnpm exec tauri build/g)?.length, 3);
  assert.match(workflow, /src-tauri\/tauri\.macos\.conf\.json/);
  assert.match(workflow, /src-tauri\/tauri\.windows\.conf\.json/);
  assert.doesNotMatch(workflow, /electron-builder|Tauri-to-Electron/);
  assert.match(workflow, /pnpm electron:compile/);
  assert.doesNotMatch(workflow, /secrets\.MAC_CSC_LINK|secrets\.APPLE_/);
  assert.match(workflow, /Signature=adhoc/);
  assert.match(workflow, /pnpm exec tauri build\n {10}--bundles app/);
  assert.match(workflow, /pnpm exec tauri build\n {10}--bundles dmg/);
  assert.match(workflow, /hdiutil verify "\$\{dmgs\[0\]\}"/);
  assert.match(workflow, /MACOS-MANUAL-INSTALL\.txt/);
  assert.match(workflow, /--allow-missing-macos/);
  assert.match(workflow, /macOS updater metadata must not be produced/);
  assert.match(
    workflow,
    /find "\$app_path\/Contents\/MacOS" .*bakbak-screen-share-helper/,
  );
  assert.match(workflow, /secrets\.TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(workflow, /The Windows updater signature is required/);
  assert.match(workflow, /release-tauri\/\*\.exe\.sig/);
  assert.equal(
    workflow.match(/node scripts\/verify-tauri-updater-signature\.mjs/g)
      ?.length,
    2,
  );
  assert.match(
    workflow,
    /verify-tauri-updater-signature\.mjs [`\\]\s*--artifact ["$\w{]/,
  );
  assert.match(workflow, /--signature ["$]/);
  assert.match(workflow, /--config src-tauri\/tauri\.conf\.json/);
  assert.match(workflow, /create-tauri-updater-manifest\.mjs/);
  assert.match(workflow, /tauri_2_acceptance_matrix_passed:/);
  assert.match(workflow, /acceptance_matrix_source_sha:/);
  assert.match(workflow, /vars\.TAURI_2_ACCEPTANCE_MATRIX_SHA == github\.sha/);
  assert.match(workflow, /inputs\.acceptance_matrix_source_sha == github\.sha/);
  assert.doesNotMatch(workflow, /TAURI_2_ACCEPTANCE_MATRIX_PASSED/);
  assert.equal(workflow.match(/version: 11\.17\.0/g)?.length, 2);
  assert.equal(workflow.match(/node-version-file: \.node-version/g)?.length, 4);
  assert.equal(workflow.match(/dtolnay\/rust-toolchain@1\.93\.1/g)?.length, 2);
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
  assert.match(workflow, /node scripts\/check-bundle-secrets\.mjs/);
  assert.doesNotMatch(workflow, /create-legacy|verify-legacy|latest-mac\.yml/);
  assert.deepEqual(macosConfig.bundle.targets, ["dmg"]);
  assert.equal(macosConfig.bundle.createUpdaterArtifacts, false);
  assert.equal(macosConfig.bundle.macOS.signingIdentity, "-");
  assert.deepEqual(windowsConfig.bundle.targets, ["nsis"]);
  assert.equal(windowsConfig.bundle.createUpdaterArtifacts, true);
  assert.equal(candidateConfig.bundle.createUpdaterArtifacts, false);
  assert.equal(prebuiltConfig.build.beforeBuildCommand, "");

  const prepareStep = workflow.indexOf(
    "Prepare helper and renderer without signing secrets",
  );
  const windowsSigningStep = workflow.indexOf(
    "- name: Build signed Windows Tauri release",
  );
  const windowsSigningStepEnd = workflow.indexOf(
    "\n      - name:",
    windowsSigningStep + 1,
  );
  const signingBoundary = workflow.slice(
    windowsSigningStep,
    windowsSigningStepEnd,
  );
  const outsideSigningBoundary = `${workflow.slice(0, windowsSigningStep)}${workflow.slice(windowsSigningStepEnd)}`;
  assert.ok(
    prepareStep >= 0 && prepareStep < windowsSigningStep,
    "helper and renderer must be prepared before signing secrets exist",
  );
  assert.match(signingBoundary, /if: matrix\.id == 'windows-x64'/);
  assert.equal(
    signingBoundary.match(/secrets\.TAURI_SIGNING_PRIVATE_KEY\b/g)?.length,
    1,
  );
  assert.equal(
    signingBoundary.match(/secrets\.TAURI_SIGNING_PRIVATE_KEY_PASSWORD\b/g)
      ?.length,
    1,
  );
  assert.match(signingBoundary, /test -n "\$\{TAURI_SIGNING_PRIVATE_KEY:-\}"/);
  assert.match(
    signingBoundary,
    /test -n "\$\{TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-\}"/,
  );
  assert.match(signingBoundary, /src-tauri\/tauri\.prebuilt\.conf\.json/);
  assert.doesNotMatch(
    signingBoundary,
    /pnpm (?:install|build|tauri:prepare|typecheck|test|check)\b/,
  );
  assert.doesNotMatch(
    outsideSigningBoundary,
    /secrets\.TAURI_SIGNING_PRIVATE_KEY(?:_PASSWORD)?\b/,
  );
  assert.equal(
    workflow.match(/src-tauri\/tauri\.prebuilt\.conf\.json/g)?.length,
    3,
  );

  const renamedArtifact = workflow.indexOf(
    '$target = "release-tauri/Bakbak-$env:RELEASE_VERSION-windows-x64-setup.exe"',
  );
  const buildVerification = workflow.indexOf(
    "node scripts/verify-tauri-updater-signature.mjs",
    renamedArtifact,
  );
  const artifactUpload = workflow.indexOf("actions/upload-artifact@v4");
  const downloadedArtifact = workflow.indexOf(
    'windows_artifact="release-assets/Bakbak-${RELEASE_VERSION}-windows-x64-setup.exe"',
  );
  const publishVerification = workflow.indexOf(
    "node scripts/verify-tauri-updater-signature.mjs",
    downloadedArtifact,
  );
  const manifestGeneration = workflow.indexOf(
    "node scripts/create-tauri-updater-manifest.mjs",
  );
  assert.ok(
    renamedArtifact < buildVerification && buildVerification < artifactUpload,
    "the exact renamed updater must verify before artifact upload",
  );
  assert.ok(
    downloadedArtifact < publishVerification &&
      publishVerification < manifestGeneration,
    "the downloaded updater must verify again before manifest generation",
  );
});

test("release publishes only an already-versioned exact candidate draft", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );

  assert.match(
    workflow,
    /Require the accepted candidate to carry the release version[\s\S]*node scripts\/set-version\.mjs --check[\s\S]*"\$tracked_version" != "\$RELEASE_VERSION"/,
  );
  assert.equal(workflow.match(/node scripts\/set-version\.mjs/g)?.length, 1);
  assert.doesNotMatch(
    workflow,
    /node scripts\/set-version\.mjs \$\{\{ needs\.prepare\.outputs\.version \}\}/,
  );
  assert.doesNotMatch(workflow, /^ {2}sync-version:/m);
  assert.doesNotMatch(workflow, /node scripts\/sync-release-pr\.mjs/);

  assert.match(
    workflow,
    /gh release view "\$RELEASE_TAG" --json isDraft,targetCommitish/,
  );
  assert.match(
    workflow,
    /"\$is_draft" != "true" \|\| "\$target_commitish" != "\$GITHUB_SHA"/,
  );
  assert.match(workflow, /--target "\$GITHUB_SHA"/);
  assert.match(
    workflow,
    /test "\$\(jq -r '\.isDraft' <<< "\$release_state"\)" = "true"/,
  );
  assert.match(
    workflow,
    /test "\$\(jq -r '\.targetCommitish' <<< "\$release_state"\)" = "\$GITHUB_SHA"/,
  );
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
