import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isMicrophoneProcessingSupported,
  microphoneCaptureOptions,
  needsMicrophoneProcessor,
} from "./microphone-processing";

describe("microphone processing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps browser echo control while requesting mono 48 kHz capture", () => {
    expect(microphoneCaptureOptions("usb-mic")).toEqual({
      deviceId: "usb-mic",
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48_000,
    });
  });

  it("uses the processor for either enhanced cleanup or a voice effect", () => {
    expect(
      needsMicrophoneProcessor({
        enhancedNoiseSuppression: false,
        voiceEffect: "none",
      }),
    ).toBe(false);
    expect(
      needsMicrophoneProcessor({
        enhancedNoiseSuppression: true,
        voiceEffect: "none",
      }),
    ).toBe(true);
    expect(
      needsMicrophoneProcessor({
        enhancedNoiseSuppression: false,
        voiceEffect: "radio",
      }),
    ).toBe(true);
  });

  it("requires AudioContext and AudioWorklet support", () => {
    class SupportedAudioContext {}
    Object.defineProperty(SupportedAudioContext.prototype, "audioWorklet", {
      configurable: true,
      value: {},
    });
    vi.stubGlobal("AudioContext", SupportedAudioContext);
    vi.stubGlobal("AudioWorkletNode", class {});
    expect(isMicrophoneProcessingSupported()).toBe(true);

    vi.stubGlobal("AudioWorkletNode", undefined);
    expect(isMicrophoneProcessingSupported()).toBe(false);
  });
});
