import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  updaterPublicKeyFromConfig,
  verifyTauriUpdaterSignature,
} from "./verify-tauri-updater-signature.mjs";

const execFileAsync = promisify(execFile);
const verifierPath = fileURLToPath(
  new URL("./verify-tauri-updater-signature.mjs", import.meta.url),
);

// These compatibility vectors are also exercised by the pinned
// minisign-verify 0.2.5 dependency used inside Tauri's updater.
const minisignPublicKey = `untrusted comment: minisign public key E7620F1842B4E81F
RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3`;
const prehashedSignature = `untrusted comment: signature from minisign secret key
RUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=
trusted comment: timestamp:1556193335\tfile:test
y/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==`;
const legacySignature = `untrusted comment: signature from minisign secret key
RWQf6LRCGA9i59SLOFxz6NxvASXDJeRtuZykwQepbDEGt87ig1BNpWaVWuNrm73YiIiJbq71Wi+dP9eKL8OC351vwIasSSbXxwA=
trusted comment: timestamp:1555779966\tfile:test
QtKMXWyYcwdpZAlPF7tE2ENJkRd1ujvKjlj1m9RtHTBnZPa5WKU5uWRs5GoP5M/VqE81QFuMKI5k/SfNQUaOAA==`;

function outerBase64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function verifyFixture(artifact, signature = prehashedSignature) {
  return verifyTauriUpdaterSignature({
    artifact: Buffer.from(artifact),
    outerSignature: outerBase64(signature),
    outerPublicKey: outerBase64(minisignPublicKey),
  });
}

test("verifies Tauri's outer-base64 prehashed Minisign format", () => {
  assert.equal(verifyFixture("test"), true);
});

test("accepts the legacy Minisign mode accepted by the Tauri updater", () => {
  assert.equal(verifyFixture("test", legacySignature), true);
});

test("rejects stale artifacts and tampered trusted comments", () => {
  assert.throws(() => verifyFixture("Test"), /does not match the artifact/);
  assert.throws(
    () =>
      verifyFixture(
        "test",
        prehashedSignature.replace("file:test", "file:other"),
      ),
    /trusted comment is invalid/,
  );
});

test("rejects malformed envelopes and a signature from another key", async () => {
  assert.throws(
    () =>
      verifyTauriUpdaterSignature({
        artifact: Buffer.from("test"),
        outerSignature: "not-base64",
        outerPublicKey: outerBase64(minisignPublicKey),
      }),
    /not canonical base64/,
  );

  const config = JSON.parse(
    await readFile(
      new URL("../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    ),
  );
  assert.throws(
    () =>
      verifyTauriUpdaterSignature({
        artifact: Buffer.from("test"),
        outerSignature: outerBase64(prehashedSignature),
        outerPublicKey: updaterPublicKeyFromConfig(config),
      }),
    /different key/,
  );
});

test("command verifies the exact artifact, signature, and config files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bakbak-updater-signature-"));
  const artifactPath = join(directory, "Bakbak-test-setup.exe");
  const signaturePath = `${artifactPath}.sig`;
  const configPath = join(directory, "tauri.conf.json");
  const args = [
    verifierPath,
    "--artifact",
    artifactPath,
    "--signature",
    signaturePath,
    "--config",
    configPath,
  ];
  try {
    await Promise.all([
      writeFile(artifactPath, "test"),
      writeFile(signaturePath, `${outerBase64(prehashedSignature)}\n`),
      writeFile(
        configPath,
        JSON.stringify({
          plugins: {
            updater: { pubkey: outerBase64(minisignPublicKey) },
          },
        }),
      ),
    ]);
    const verified = await execFileAsync(process.execPath, args);
    assert.match(verified.stdout, /Verified Tauri updater signature/);

    await writeFile(artifactPath, "stale");
    await assert.rejects(execFileAsync(process.execPath, args), (error) => {
      assert.match(error.stderr, /does not match the artifact/);
      return true;
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
