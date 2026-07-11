export const bundledSounds = [
  { id: "soft-pop", label: "Pop", emoji: "🫧", color: "lilac" },
  { id: "tiny-applause", label: "Applause", emoji: "👏", color: "mint" },
  { id: "airhorn", label: "Airhorn", emoji: "📣", color: "amber" },
  { id: "rimshot", label: "Rimshot", emoji: "🥁", color: "coral" },
] as const;

export type BundledSoundId = (typeof bundledSounds)[number]["id"];

export interface BundledSoundPlayback {
  finished: Promise<void>;
  stop: () => void;
}

export function isBundledSoundId(value: string): value is BundledSoundId {
  return bundledSounds.some((sound) => sound.id === value);
}

/**
 * Tiny synthesized clips keep the v1 pack bundled, deterministic, and free of
 * third-party audio licenses. Each recipe is rendered locally through Web Audio.
 */
export function playBundledSound(
  soundId: string,
  volume = 0.72,
): BundledSoundPlayback | null {
  if (!isBundledSoundId(soundId) || typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  const gain = context.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume));
  gain.connect(context.destination);

  let resolveFinished: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  let closeTimer: number | null = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (closeTimer !== null) window.clearTimeout(closeTimer);
    void context
      .close()
      .catch(() => undefined)
      .then(() => resolveFinished());
  };

  let lifetime = 650;

  if (soundId === "soft-pop") {
    tone(context, gain, "sine", 520, 840, 0.12, 0);
    lifetime = 300;
  } else if (soundId === "airhorn") {
    tone(context, gain, "sawtooth", 220, 185, 0.48, 0);
    tone(context, gain, "square", 277, 235, 0.48, 0.01, 0.36);
    lifetime = 700;
  } else if (soundId === "rimshot") {
    noise(context, gain, 0.08, 0);
    tone(context, gain, "triangle", 180, 82, 0.16, 0.035);
    lifetime = 350;
  } else {
    [0, 0.09, 0.18, 0.27].forEach((offset, index) => {
      noise(context, gain, 0.055, offset, 0.28);
      tone(context, gain, "sine", 460 + index * 55, 520, 0.06, offset, 0.22);
    });
  }

  closeTimer = window.setTimeout(stop, lifetime);
  return { finished, stop };
}

function tone(
  context: AudioContext,
  output: GainNode,
  type: OscillatorType,
  startFrequency: number,
  endFrequency: number,
  duration: number,
  offset: number,
  level = 0.5,
) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const start = context.currentTime + offset;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startFrequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(1, endFrequency),
    start + duration,
  );
  envelope.gain.setValueAtTime(level, start);
  envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(envelope).connect(output);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function noise(
  context: AudioContext,
  output: GainNode,
  duration: number,
  offset: number,
  level = 0.4,
) {
  const frames = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    channel[index] = Math.random() * 2 - 1;
  }
  const source = context.createBufferSource();
  const envelope = context.createGain();
  const start = context.currentTime + offset;
  source.buffer = buffer;
  envelope.gain.setValueAtTime(level, start);
  envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(envelope).connect(output);
  source.start(start);
}
