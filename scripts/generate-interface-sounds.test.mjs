import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  encodeWav,
  renderSound,
  SAMPLE_RATE,
  SOUND_SPECS,
} from "./generate-interface-sounds.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("interface sounds are deterministic, valid, faded, and compact", async () => {
  let totalBytes = 0;
  for (const [name, spec] of Object.entries(SOUND_SPECS)) {
    const first = encodeWav(renderSound(name));
    const second = encodeWav(renderSound(name));
    const committed = await readFile(
      path.join(projectRoot, "public", "interface-sounds", `${name}.wav`),
    );
    assert.deepEqual(first, second, `${name} must be deterministic`);
    assert.deepEqual(
      committed,
      first,
      `${name} asset must match the generator`,
    );
    assert.equal(committed.toString("ascii", 0, 4), "RIFF");
    assert.equal(committed.toString("ascii", 8, 12), "WAVE");
    assert.equal(committed.readUInt16LE(20), 1, "PCM format");
    assert.equal(committed.readUInt16LE(22), 1, "mono channel");
    assert.equal(committed.readUInt32LE(24), SAMPLE_RATE);
    assert.equal(committed.readUInt16LE(34), 16, "16-bit samples");
    const sampleCount = committed.readUInt32LE(40) / 2;
    assert.equal(sampleCount, Math.round(spec.duration * SAMPLE_RATE));

    let peak = 0;
    for (let offset = 44; offset < committed.length; offset += 2) {
      peak = Math.max(peak, Math.abs(committed.readInt16LE(offset)));
    }
    assert.ok(peak <= Math.round(32_767 * 0.83), `${name} must not clip`);
    assert.ok(peak >= Math.round(32_767 * 0.7), `${name} must be audible`);
    assert.equal(committed.readInt16LE(44), 0, `${name} must fade in`);
    assert.ok(
      Math.abs(committed.readInt16LE(committed.length - 2)) < 180,
      `${name} must fade out`,
    );
    totalBytes += committed.length;
  }
  assert.ok(totalBytes < 1_000_000, "sound bundle must remain below 1 MB");
});
