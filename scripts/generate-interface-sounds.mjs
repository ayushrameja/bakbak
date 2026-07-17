import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export const SAMPLE_RATE = 48_000;
export const SOUND_SPECS = {
  "message-received": { duration: 0.16, seed: 1101 },
  "voice-self-join": { duration: 0.42, seed: 2201 },
  "voice-self-leave": { duration: 0.32, seed: 2202 },
  "voice-remote-join": { duration: 0.22, seed: 3301 },
  "voice-remote-leave": { duration: 0.2, seed: 3302 },
  "screen-share-start": { duration: 0.44, seed: 4401 },
  "screen-share-stop": { duration: 0.3, seed: 4402 },
  "reconnect-success": { duration: 0.34, seed: 5501 },
  "communication-failure": { duration: 0.38, seed: 6601 },
};

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function smoothstep(edge0, edge1, value) {
  const position = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return position * position * (3 - 2 * position);
}

function envelope(time, duration, attack = 0.012, release = 0.055) {
  const rise = smoothstep(0, attack, time);
  const fall = 1 - smoothstep(duration - release, duration, time);
  return rise * fall;
}

function oscillator(type, frequency, time) {
  const phase = time * frequency;
  if (type === "square") return Math.sin(phase * Math.PI * 2) >= 0 ? 1 : -1;
  if (type === "triangle")
    return 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
  return Math.sin(phase * Math.PI * 2);
}

function chirp(type, from, to, time, duration) {
  const rate = (to - from) / duration;
  const phase = from * time + 0.5 * rate * time * time;
  return oscillator(type, 1, phase);
}

function pulse(time, start, length) {
  if (time < start || time >= start + length) return 0;
  const local = time - start;
  return envelope(local, length, 0.004, Math.min(0.035, length * 0.45));
}

function synthesize(name, time, duration, noise) {
  const grit = noise() * 2 - 1;
  switch (name) {
    case "message-received":
      return (
        chirp("sine", 590, 1_030, time, duration) * 0.72 +
        chirp("triangle", 1_180, 1_720, time, duration) * 0.18 +
        grit * 0.035
      );
    case "voice-self-join":
      return (
        chirp("triangle", 145, 330, time, duration) * 0.43 +
        chirp("sine", 420, 760, time, duration) * 0.32 +
        oscillator("square", 1_120, time) *
          pulse(time, duration - 0.09, 0.055) *
          0.17 +
        grit * 0.045
      );
    case "voice-self-leave":
      return (
        chirp("triangle", 360, 128, time, duration) * 0.5 +
        chirp("sine", 720, 290, time, duration) * 0.25 +
        grit * 0.04
      );
    case "voice-remote-join":
      return (
        chirp("triangle", 190, 360, time, duration) * 0.47 +
        oscillator("square", 780, time) * pulse(time, 0.105, 0.055) * 0.2 +
        grit * 0.055
      );
    case "voice-remote-leave":
      return (
        chirp("triangle", 300, 155, time, duration) * 0.5 +
        oscillator("square", 510, time) * pulse(time, 0.018, 0.038) * 0.13 +
        grit * 0.04
      );
    case "screen-share-start":
      return (
        chirp("sine", 115, 820, time, duration) * 0.37 +
        chirp("triangle", 290, 1_460, time, duration) * 0.27 +
        oscillator("square", 1_630, time) *
          pulse(time, duration - 0.08, 0.052) *
          0.12 +
        grit * 0.045
      );
    case "screen-share-stop":
      return (
        chirp("sine", 760, 120, time, duration) * 0.42 +
        chirp("triangle", 1_240, 260, time, duration) * 0.22 +
        grit * 0.04
      );
    case "reconnect-success":
      return (
        oscillator("sine", 540, time) * pulse(time, 0.015, 0.105) * 0.53 +
        oscillator("triangle", 810, time) * pulse(time, 0.175, 0.125) * 0.42 +
        grit * 0.025
      );
    case "communication-failure":
      return (
        chirp("triangle", 245, 205, time, duration) * 0.31 +
        oscillator("sine", 269, time) * 0.27 +
        oscillator("sine", 354, time) * 0.2 +
        oscillator("square", 73, time) * 0.07 +
        grit * 0.055
      );
    default:
      throw new Error(`Unknown interface sound: ${name}`);
  }
}

export function renderSound(name) {
  const spec = SOUND_SPECS[name];
  if (!spec) throw new Error(`Missing interface sound specification: ${name}`);
  const sampleCount = Math.round(spec.duration * SAMPLE_RATE);
  const samples = new Float64Array(sampleCount);
  const random = seededRandom(spec.seed);
  let filtered = 0;
  let peak = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const raw = synthesize(name, time, spec.duration, random);
    filtered += 0.42 * (raw - filtered);
    const fade = envelope(time, spec.duration, 0.006, 0.012);
    const value = filtered * fade;
    samples[index] = value;
    peak = Math.max(peak, Math.abs(value));
  }

  const scale = peak > 0 ? 0.82 / peak : 1;
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
