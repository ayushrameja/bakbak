export const EXTERNAL_AUDIO_SAMPLE_RATE = 48_000 as const;
export const MAX_EXTERNAL_AUDIO_SECONDS = 5;
export const MAX_EXTERNAL_AUDIO_SAMPLES =
  EXTERNAL_AUDIO_SAMPLE_RATE * MAX_EXTERNAL_AUDIO_SECONDS;

export function audioBufferToExternalPcm(buffer: AudioBuffer): number[] {
  if (!Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0) {
    throw new Error("That sound has an invalid sample rate.");
  }
  if (buffer.numberOfChannels < 1 || buffer.length < 1) {
    throw new Error("That sound has no playable audio.");
  }
  const outputLength = Math.min(
    MAX_EXTERNAL_AUDIO_SAMPLES,
    Math.ceil((buffer.length * EXTERNAL_AUDIO_SAMPLE_RATE) / buffer.sampleRate),
  );
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index),
  );
  const output = new Array<number>(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition =
      (outputIndex * buffer.sampleRate) / EXTERNAL_AUDIO_SAMPLE_RATE;
    const leftIndex = Math.min(buffer.length - 1, Math.floor(sourcePosition));
    const rightIndex = Math.min(buffer.length - 1, leftIndex + 1);
    const blend = sourcePosition - leftIndex;
    let sample = 0;
    for (const channel of channels) {
      const left = finiteSample(channel[leftIndex]);
      const right = finiteSample(channel[rightIndex]);
      sample += left + (right - left) * blend;
    }
    output[outputIndex] = Math.max(-1, Math.min(1, sample / channels.length));
  }

  return output;
}

function finiteSample(value: number | undefined): number {
  return Number.isFinite(value) ? (value ?? 0) : 0;
}
