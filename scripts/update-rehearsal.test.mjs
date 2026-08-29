import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  REHEARSAL_MANIFEST_URL,
  REHEARSAL_ORIGIN,
  createUpdateRehearsalKit,
} from "./create-update-rehearsal-kit.mjs";
import { nextPatchVersion } from "./update-rehearsal-version.mjs";
import { verifyUpdaterManifest } from "./verify-updater-manifest.mjs";

test("derives exactly one stable patch version without numeric truncation", () => {
  assert.equal(nextPatchVersion("2.0.0"), "2.0.1");
  assert.equal(
    nextPatchVersion("2.4.99999999999999999999"),
    "2.4.100000000000000000000",
  );
  assert.throws(() => nextPatchVersion("2.0.0-beta.1"), /stable SemVer/);
  assert.throws(() => nextPatchVersion("02.0.0"), /stable SemVer/);
});

test("creates a bounded private loopback rehearsal kit with artifact digests", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "bakbak-update-rehearsal-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outputDirectory = join(directory, "kit");
  const baseInstaller = join(
    outputDirectory,
    "Bakbak-2.0.0-windows-x64-base-setup.exe",
  );
  const nextInstaller = join(
    outputDirectory,
    "Bakbak-2.0.1-windows-x64-next-setup.exe",
  );
  const configPath = join(outputDirectory, "tauri.update-rehearsal.conf.json");
  await mkdir(outputDirectory);
  await Promise.all([
    writeFile(baseInstaller, "base-installer"),
    writeFile(`${baseInstaller}.sig`, "YmFzZS1zaWduYXR1cmU=\n"),
    writeFile(nextInstaller, "next-installer"),
    writeFile(`${nextInstaller}.sig`, "bmV4dC1zaWduYXR1cmU=\n"),
    writeFile(
      configPath,
      JSON.stringify({
        plugins: {
          updater: {
            dangerousInsecureTransportProtocol: true,
            endpoints: [REHEARSAL_MANIFEST_URL],
          },
        },
      }),
    ),
  ]);

  const { manifest, provenance } = await createUpdateRehearsalKit({
    baseVersion: "2.0.0",
    nextVersion: "2.0.1",
    sourceSha: "A".repeat(40),
    workflowRun: "12345.2",
    baseInstaller,
    nextInstaller,
    configPath,
    outputDirectory,
    createdAt: "2026-08-23T12:00:00.000Z",
  });

  assert.doesNotThrow(() =>
    verifyUpdaterManifest(manifest, "2.0.1", { allowMissingMacos: true }),
  );
  assert.equal(
    manifest.platforms["windows-x86_64-nsis"].url,
    `${REHEARSAL_ORIGIN}/Bakbak-2.0.1-windows-x64-next-setup.exe`,
  );
  assert.equal(provenance.sourceRevision, "a".repeat(40));
  assert.equal(provenance.acceptanceStatus, "not-run");
  assert.equal(provenance.publicRelease, false);
  assert.equal(provenance.artifacts.length, 7);
  for (const artifact of provenance.artifacts) {
    assert.ok(artifact.bytes > 0);
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
    assert.equal(artifact.file.includes(directory), false);
  }
  const instructions = await readFile(
    join(outputDirectory, "REHEARSAL-INSTRUCTIONS.txt"),
    "utf8",
  );
  assert.match(instructions, /does not prove that the installed test passed/);
  assert.match(instructions, /--bind 127\.0\.0\.1/);
  assert.match(instructions, /docs\/progress\.md/);
});

test("rejects a non-next version and any updater endpoint beyond fixed loopback", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "bakbak-update-rehearsal-bad-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const baseInstaller = join(
    directory,
    "Bakbak-2.0.0-windows-x64-base-setup.exe",
  );
  const nextInstaller = join(
    directory,
    "Bakbak-2.0.1-windows-x64-next-setup.exe",
  );
  const configPath = join(directory, "tauri.update-rehearsal.conf.json");
  await Promise.all([
    writeFile(baseInstaller, "base"),
    writeFile(`${baseInstaller}.sig`, "YmFzZQ=="),
    writeFile(nextInstaller, "next"),
    writeFile(`${nextInstaller}.sig`, "bmV4dA=="),
    writeFile(
      configPath,
      JSON.stringify({
        plugins: {
          updater: {
            dangerousInsecureTransportProtocol: true,
            endpoints: ["http://0.0.0.0:41793/latest.json"],
          },
        },
      }),
    ),
  ]);
  const request = {
    baseVersion: "2.0.0",
    nextVersion: "2.0.1",
    sourceSha: "b".repeat(40),
    workflowRun: "99.1",
    baseInstaller,
    nextInstaller,
    configPath,
    outputDirectory: directory,
  };

  await assert.rejects(
    createUpdateRehearsalKit({ ...request, nextVersion: "2.0.2" }),
    /is not the patch after/,
  );
  await assert.rejects(
    createUpdateRehearsalKit(request),
    /must use only http:\/\/127\.0\.0\.1/,
  );
});
