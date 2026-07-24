import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isMicrophoneProcessingSupported,
  microphoneCaptureOptions,
  needsMicrophoneProcessor,
  prewarmMicrophoneProcessing,
  releaseMicrophoneProcessing,
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

  it("warms one reusable worklet context and releases it on teardown", async () => {
    const addModule = vi.fn().mockResolvedValue(undefined);
    const resume = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    class SupportedAudioContext {
      readonly sampleRate = 48_000;
      state = "running";
      resume = resume;
      close = close;
    }
    Object.defineProperty(SupportedAudioContext.prototype, "audioWorklet", {
      configurable: true,
      value: { addModule },
    });
    vi.stubGlobal("AudioContext", SupportedAudioContext);
    vi.stubGlobal("AudioWorkletNode", class {});

    await expect(prewarmMicrophoneProcessing()).resolves.toBe(true);
    await expect(prewarmMicrophoneProcessing()).resolves.toBe(true);
    expect(addModule).toHaveBeenCalledOnce();

    await releaseMicrophoneProcessing();
    expect(close).toHaveBeenCalledOnce();
  });
});
