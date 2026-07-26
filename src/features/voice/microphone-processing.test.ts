import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachMicrophoneProcessor,
  isMicrophoneProcessingSupported,
  initializeMicrophoneWorklet,
  microphoneCaptureOptions,
  needsMicrophoneProcessor,
  prewarmMicrophoneProcessing,
  releaseMicrophoneProcessing,
} from "./microphone-processing";

class ReadyWorkletPort extends EventTarget {
  readonly start = vi.fn();
  readonly messages: unknown[] = [];

  postMessage(message: unknown) {
    this.messages.push(message);
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "configure"
    ) {
      const requestId =
        "requestId" in message ? (message.requestId as number) : undefined;
      queueMicrotask(() =>
        this.dispatchEvent(
          new MessageEvent("message", {
            data: { type: "configured", requestId },
          }),
        ),
      );
    }
  }
}

class ReadyWorkletNode extends EventTarget {
  static instances: ReadyWorkletNode[] = [];
  readonly port = new ReadyWorkletPort();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  onprocessorerror: (() => void) | null = null;

  constructor() {
    super();
    ReadyWorkletNode.instances.push(this);
    queueMicrotask(() =>
      this.port.dispatchEvent(
        new MessageEvent("message", { data: { type: "ready" } }),
      ),
    );
  }
}

describe("microphone processing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    ReadyWorkletNode.instances.splice(0);
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
    expect(microphoneCaptureOptions("default", false)).toEqual({
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48_000,
    });
  });

  it("uses the processor only for enhanced cleanup", () => {
    expect(
      needsMicrophoneProcessor({
        enhancedNoiseSuppression: false,
      }),
    ).toBe(false);
    expect(
      needsMicrophoneProcessor({
        enhancedNoiseSuppression: true,
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
    vi.stubGlobal("AudioWorkletNode", ReadyWorkletNode);
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
    vi.stubGlobal("AudioWorkletNode", ReadyWorkletNode);

    await expect(prewarmMicrophoneProcessing()).resolves.toBe(true);
    await expect(prewarmMicrophoneProcessing()).resolves.toBe(true);
    expect(addModule).toHaveBeenCalledOnce();

    await releaseMicrophoneProcessing();
    expect(close).toHaveBeenCalledOnce();
  });

  it("waits for ready and configure acknowledgements", async () => {
    const node = new ReadyWorkletNode();

    await initializeMicrophoneWorklet(
      node as unknown as AudioWorkletNode,
      { enhancedNoiseSuppression: true },
      50,
    );

    expect(node.port.start).toHaveBeenCalledOnce();
    const configureMessage = node.port.messages.find(
      (
        message,
      ): message is {
        type: "configure";
        preferences: { enhancedNoiseSuppression: boolean };
        requestId: number;
      } =>
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "configure",
    );
    expect(configureMessage?.preferences).toEqual({
      enhancedNoiseSuppression: true,
    });
    expect(typeof configureMessage?.requestId).toBe("number");
  });

  it("rejects when the worklet processor errors before readiness", async () => {
    class SilentWorkletNode extends EventTarget {
      readonly port = new ReadyWorkletPort();
    }
    const node = new SilentWorkletNode();
    const initialization = initializeMicrophoneWorklet(
      node as unknown as AudioWorkletNode,
      { enhancedNoiseSuppression: true },
      50,
    );
    node.dispatchEvent(new Event("processorerror"));

    await expect(initialization).rejects.toThrow("stopped unexpectedly");
  });

  it("attaches only after readiness and restores the original sender on disable", async () => {
    const processedTrack = { stop: vi.fn() };
    const source = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const destination = {
      stream: { getAudioTracks: () => [processedTrack] },
      disconnect: vi.fn(),
    };
    class ProcessingAudioContext {
      readonly sampleRate = 48_000;
      readonly state = "running";
      readonly resume = vi.fn().mockResolvedValue(undefined);
      readonly close = vi.fn().mockResolvedValue(undefined);
      readonly createMediaStreamSource = vi.fn(() => source);
      readonly createMediaStreamDestination = vi.fn(() => destination);
    }
    Object.defineProperty(ProcessingAudioContext.prototype, "audioWorklet", {
      configurable: true,
      value: { addModule: vi.fn().mockResolvedValue(undefined) },
    });
    class FakeMediaStream {
      constructor(readonly tracks: unknown[]) {}
      getAudioTracks() {
        return this.tracks;
      }
    }
    vi.stubGlobal("AudioContext", ProcessingAudioContext);
    vi.stubGlobal("AudioWorkletNode", ReadyWorkletNode);
    vi.stubGlobal("MediaStream", FakeMediaStream);

    type FakeAttachedProcessor = {
      init(options: unknown): Promise<void>;
      destroy(): Promise<void>;
      readonly audioContext: AudioContext;
    };
    let activeProcessor: FakeAttachedProcessor | null = null;
    const inputTrack = {};
    const localTrack = {
      setAudioContext: vi.fn(),
      setProcessor: vi.fn(async (processor: FakeAttachedProcessor) => {
        activeProcessor = processor;
        await processor.init({
          kind: "audio",
          track: inputTrack,
          audioContext: processor.audioContext,
        });
      }),
      stopProcessor: vi.fn(async () => {
        await activeProcessor?.destroy();
        activeProcessor = null;
      }),
    };
    const onProcessorError = vi.fn();

    const processor = await attachMicrophoneProcessor(
      localTrack as never,
      { enhancedNoiseSuppression: true },
      onProcessorError,
    );

    expect(processor).not.toBeNull();
    expect(localTrack.setProcessor).toHaveBeenCalledOnce();
    expect(source.connect).toHaveBeenCalledOnce();
    ReadyWorkletNode.instances.at(-1)?.onprocessorerror?.();
    expect(onProcessorError).toHaveBeenCalledOnce();

    await localTrack.stopProcessor();
    expect(processedTrack.stop).toHaveBeenCalledOnce();
    expect(activeProcessor).toBeNull();
    await releaseMicrophoneProcessing();
  });
});
