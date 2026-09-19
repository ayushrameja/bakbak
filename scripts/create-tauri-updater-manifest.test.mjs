import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createTauriUpdaterManifest } from "./create-tauri-updater-manifest.mjs";
import { verifyUpdaterManifest } from "./verify-updater-manifest.mjs";

test("creates a signed Windows Tauri updater manifest without macOS metadata", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "bakbak-tauri-update-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const windowsArtifact = join(directory, "Bakbak-2.0.1-windows-x64-setup.exe");
  await writeFile(`${windowsArtifact}.sig`, "windows-signature\n");

  const manifest = await createTauriUpdaterManifest({
    version: "2.0.1",
    repository: "ayushrameja/bakbak",
    tag: "v2.0.1",
    windowsArtifact,
    publishedAt: "2026-08-23T12:00:00.000Z",
  });

  assert.doesNotThrow(() =>
    verifyUpdaterManifest(manifest, "2.0.1", { allowMissingMacos: true }),
  );
  assert.deepEqual(Object.keys(manifest.platforms).sort(), [
    "windows-x86_64",
    "windows-x86_64-nsis",
  ]);
  assert.equal(
    manifest.platforms["windows-x86_64-nsis"].url,
    "https://github.com/ayushrameja/bakbak/releases/download/v2.0.1/Bakbak-2.0.1-windows-x64-setup.exe",
  );
  assert.match(manifest.notes, /uses Tauri/);
  assert.doesNotMatch(manifest.notes, /uses Electron/);
});

test("refuses unsigned Windows updater payloads", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "bakbak-tauri-unsigned-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const windowsArtifact = join(directory, "Bakbak-2.0.1-setup.exe");
  await writeFile(`${windowsArtifact}.sig`, "\n");

  await assert.rejects(
    createTauriUpdaterManifest({
      version: "2.0.1",
      repository: "ayushrameja/bakbak",
      tag: "v2.0.1",
      windowsArtifact,
    }),
    /signature is required/,
  );
});
