import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLegacyUpdaterManifest } from "./create-legacy-updater-manifest.mjs";
import { verifyUpdaterManifest } from "./verify-updater-manifest.mjs";

test("creates a signed bridge manifest for both legacy desktop targets", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "bakbak-legacy-update-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const macArtifact = join(directory, "Bakbak-1.7.0-macos-arm64.app.tar.gz");
  const windowsArtifact = join(directory, "Bakbak-1.7.0-windows-x64-setup.exe");
  await Promise.all([
    writeFile(`${macArtifact}.sig`, "mac-signature\n"),
    writeFile(`${windowsArtifact}.sig`, "windows-signature\n"),
  ]);

  const manifest = await createLegacyUpdaterManifest({
    version: "1.7.0",
    repository: "ayushrameja/bakbak",
    tag: "v1.7.0",
    macArtifact,
    windowsArtifact,
    publishedAt: "2026-08-09T12:00:00.000Z",
  });

  assert.doesNotThrow(() => verifyUpdaterManifest(manifest, "1.7.0"));
  assert.equal(
    manifest.platforms["darwin-aarch64"].url,
    "https://github.com/ayushrameja/bakbak/releases/download/v1.7.0/Bakbak-1.7.0-macos-arm64.app.tar.gz",
  );
  assert.equal(
    manifest.platforms["windows-x86_64-nsis"].signature,
    "windows-signature",
  );
});
