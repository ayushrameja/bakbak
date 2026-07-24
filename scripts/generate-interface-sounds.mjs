import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export const SAMPLE_RATE = 48_000;
const SECOND_HARMONIC_GAIN = 10 ** (-18 / 20);
const TARGET_PEAK = 10 ** (-6 / 20);

export const SOUND_SPECS = {
  "message-sent": {
    duration: 0.12,
    notes: [
      { frequency: 620, start: 0, length: 0.095, amplitude: 0.72 },
      { frequency: 880, start: 0.045, length: 0.075, amplitude: 0.58 },
    ],
  },
  "message-received": {
    duration: 0.16,
    notes: [
      { frequency: 740, start: 0, length: 0.13, amplitude: 0.68 },
      { frequency: 990, start: 0.055, length: 0.105, amplitude: 0.55 },
    ],
  },
  "microphone-mute": {
    duration: 0.15,
    notes: [
      { frequency: 620, start: 0, length: 0.11, amplitude: 0.65 },
      { frequency: 440, start: 0.05, length: 0.1, amplitude: 0.68 },
    ],
  },
  "microphone-unmute": {
    duration: 0.15,
    notes: [
      { frequency: 440, start: 0, length: 0.11, amplitude: 0.65 },
      { frequency: 620, start: 0.05, length: 0.1, amplitude: 0.68 },
    ],
  },
  "deafen-on": {
    duration: 0.17,
    notes: [
      {
        frequency: 560,
        endFrequency: 390,
        start: 0,
        length: 0.17,
        amplitude: 0.68,
      },
    ],
  },
  "deafen-off": {
    duration: 0.17,
    notes: [
      {
        frequency: 390,
        endFrequency: 560,
        start: 0,
        length: 0.17,
        amplitude: 0.68,
      },
    ],
  },
  "voice-self-join": {
    duration: 0.34,
    notes: [
      { frequency: 262, start: 0, length: 0.22, amplitude: 0.5 },
      { frequency: 330, start: 0.07, length: 0.23, amplitude: 0.5 },
      { frequency: 392, start: 0.15, length: 0.19, amplitude: 0.55 },
    ],
  },
  "voice-self-leave": {
    duration: 0.28,
    notes: [
      { frequency: 392, start: 0, length: 0.19, amplitude: 0.55 },
      { frequency: 330, start: 0.055, length: 0.18, amplitude: 0.5 },
      { frequency: 262, start: 0.11, length: 0.17, amplitude: 0.5 },
    ],
  },
  "voice-remote-join": {
    duration: 0.19,
    notes: [
      { frequency: 330, start: 0, length: 0.145, amplitude: 0.66 },
      { frequency: 440, start: 0.06, length: 0.13, amplitude: 0.56 },
    ],
  },
  "voice-remote-leave": {
    duration: 0.18,
    notes: [
      { frequency: 440, start: 0, length: 0.135, amplitude: 0.6 },
      { frequency: 330, start: 0.055, length: 0.125, amplitude: 0.62 },
    ],
  },
  "screen-share-start": {
    duration: 0.38,
    notes: [
      { frequency: 392, start: 0, length: 0.25, amplitude: 0.42 },
      { frequency: 523, start: 0.085, length: 0.25, amplitude: 0.45 },
      { frequency: 659, start: 0.17, length: 0.21, amplitude: 0.5 },
    ],
  },
  "screen-share-stop": {
    duration: 0.3,
    notes: [
      { frequency: 659, start: 0, length: 0.2, amplitude: 0.5 },
      { frequency: 523, start: 0.06, length: 0.2, amplitude: 0.45 },
      { frequency: 392, start: 0.12, length: 0.18, amplitude: 0.46 },
    ],
  },
  "reconnect-success": {
    duration: 0.3,
    notes: [
      { frequency: 440, start: 0, length: 0.18, amplitude: 0.5 },
      { frequency: 554, start: 0.07, length: 0.18, amplitude: 0.5 },
      { frequency: 659, start: 0.14, length: 0.16, amplitude: 0.55 },
    ],
  },
  "communication-failure": {
    duration: 0.32,
    notes: [
      { frequency: 247, start: 0, length: 0.22, amplitude: 0.58 },
      { frequency: 220, start: 0.11, length: 0.21, amplitude: 0.62 },
    ],
  },
};

function smoothstep(edge0, edge1, value) {
  const position = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return position * position * (3 - 2 * position);
}

function envelope(time, duration, attack, release) {
  const rise = smoothstep(0, attack, time);
  const fall = 1 - smoothstep(duration - release, duration, time);
  return rise * fall;
}

function renderNote(time, note) {
  const localTime = time - note.start;
  if (localTime < 0 || localTime >= note.length) return 0;
  const attack = Math.min(0.012, Math.max(0.008, note.length * 0.1));
  const release = Math.min(0.09, Math.max(0.045, note.length * 0.35));
  const frequencyDelta = (note.endFrequency ?? note.frequency) - note.frequency;
  const phase =
    (note.frequency * localTime +
      (frequencyDelta * localTime * localTime) / (2 * note.length)) *
    Math.PI *
    2;
  const tone = Math.sin(phase) + Math.sin(phase * 2) * SECOND_HARMONIC_GAIN;
  return (
    tone * note.amplitude * envelope(localTime, note.length, attack, release)
  );
}

export function renderSound(name) {
  const spec = SOUND_SPECS[name];
  if (!spec) throw new Error(`Missing interface sound specification: ${name}`);
  const sampleCount = Math.round(spec.duration * SAMPLE_RATE);
  const samples = new Float64Array(sampleCount);
  let peak = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const value = spec.notes.reduce(
      (sample, note) => sample + renderNote(time, note),
      0,
    );
    samples[index] = value;
    peak = Math.max(peak, Math.abs(value));
  }

  const scale = peak > 0 ? TARGET_PEAK / peak : 1;
  const pcm = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    pcm[index] = Math.round(
      Math.max(-1, Math.min(1, samples[index] * scale)) * 32_767,
    );
  }
  return pcm;
}

export function encodeWav(samples) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index], 44 + index * 2);
  }
  return buffer;
}

export async function generateInterfaceSounds(outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  for (const name of Object.keys(SOUND_SPECS)) {
    await writeFile(
      path.join(outputDirectory, `${name}.wav`),
      encodeWav(renderSound(name)),
    );
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  await generateInterfaceSounds(
    path.join(projectRoot, "public", "interface-sounds"),
  );
}
