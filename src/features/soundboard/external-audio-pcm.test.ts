import { describe, expect, it } from "vitest";
import {
  MAX_EXTERNAL_AUDIO_SAMPLES,
  audioBufferToExternalPcm,
} from "./external-audio-pcm";

describe("audioBufferToExternalPcm", () => {
  it("mixes channels, resamples to 48 kHz, and clamps unsafe samples", () => {
    const left = Float32Array.from([2, 0, -2]);
    const right = Float32Array.from([0, 0, 0]);
    const output = audioBufferToExternalPcm(audioBuffer([left, right], 24_000));

    expect(output).toHaveLength(6);
    expect(output[0]).toBe(1);
    expect(output[2]).toBe(0);
    expect(output[4]).toBe(-1);
  });

  it("bounds decoded payloads to five seconds", () => {
    const output = audioBufferToExternalPcm(
      audioBuffer([new Float32Array(MAX_EXTERNAL_AUDIO_SAMPLES + 100)], 48_000),
    );
    expect(output).toHaveLength(MAX_EXTERNAL_AUDIO_SAMPLES);
  });
});

function audioBuffer(
  channels: Float32Array[],
  sampleRate: number,
): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    sampleRate,
    getChannelData: (channel: number) =>
      channels[channel] ?? new Float32Array(),
  } as AudioBuffer;
}
