import { describe, expect, it, vi } from "vitest";
import type {
  ExternalAudioDesktopApi,
  ExternalAudioSessionState,
} from "../../lib/external-audio-types";
import {
  ExternalAudioController,
  externalAudioBlocksVoice,
} from "./external-audio-controller";

const liveState: ExternalAudioSessionState = {
  status: "live",
  config: {
    microphoneDeviceId: "mic",
    cableOutputDeviceId: "cable",
    monitorOutputDeviceId: "headphones",
    microphoneGain: 1,
    soundboardGain: 0.7,
  },
  microphoneMuted: false,
  activeSoundId: null,
  errorCode: null,
  message: null,
};

describe("ExternalAudioController", () => {
  it("blocks Bakbak voice exactly while the external native bus owns audio", () => {
    expect(externalAudioBlocksVoice("starting")).toBe(true);
    expect(externalAudioBlocksVoice("testing")).toBe(true);
    expect(externalAudioBlocksVoice("live")).toBe(true);
    expect(externalAudioBlocksVoice("stopping")).toBe(true);
    expect(externalAudioBlocksVoice("idle")).toBe(false);
    expect(externalAudioBlocksVoice("suspended")).toBe(false);
    expect(externalAudioBlocksVoice("error")).toBe(false);
  });
  it("stops the previous sound before sending bounded 48 kHz mono PCM", async () => {
    const api = apiDouble();
    const controller = new ExternalAudioController(api, () =>
      decoder(Float32Array.from([0.25, -0.25])),
    );

    await controller.play("airhorn", new Blob(["audio"]));

    expect(api.stopSound).toHaveBeenCalledOnce();
    expect(api.play).toHaveBeenCalledWith({
      soundId: "airhorn",
      sampleRate: 48_000,
      samples: [0.25, -0.25],
    });
    expect(api.stopSound.mock.invocationCallOrder[0]).toBeLessThan(
      api.play.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("prevents a slow replaced decode from starting late", async () => {
    const api = apiDouble();
    let resolveFirst: ((buffer: AudioBuffer) => void) | undefined;
    const slowDecoder = {
      decodeAudioData: vi.fn(
        () =>
          new Promise<AudioBuffer>((resolve) => {
            resolveFirst = resolve;
          }),
      ),
    };
    const decoders = [slowDecoder, decoder(Float32Array.from([0.5]))];
    const controller = new ExternalAudioController(api, () => {
      const next = decoders.shift();
      if (!next) throw new Error("missing decoder");
      return next;
    });

    const first = controller.play("first", new Blob(["first"]));
    await vi.waitFor(() =>
      expect(slowDecoder.decodeAudioData).toHaveBeenCalled(),
    );
    await controller.play("second", new Blob(["second"]));
    resolveFirst?.(audioBuffer(Float32Array.from([0.1])));

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(api.play).toHaveBeenCalledTimes(1);
    expect(api.play).toHaveBeenCalledWith(
      expect.objectContaining({ soundId: "second" }),
    );
  });

  it("keeps an overlay stop authoritative over a pending decode", async () => {
    const api = apiDouble();
    let resolveDecode: ((buffer: AudioBuffer) => void) | undefined;
    const slowDecoder = {
      decodeAudioData: vi.fn(
        () =>
          new Promise<AudioBuffer>((resolve) => {
            resolveDecode = resolve;
          }),
      ),
    };
    const controller = new ExternalAudioController(api, () => slowDecoder);

    const pending = controller.play("slow", new Blob(["slow"]));
    await vi.waitFor(() =>
      expect(slowDecoder.decodeAudioData).toHaveBeenCalledOnce(),
    );
    await controller.stopSound();
    resolveDecode?.(audioBuffer(Float32Array.from([0.1])));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(api.play).not.toHaveBeenCalled();
  });

  it("prevents a slow replaced download from starting after the latest sound", async () => {
    const api = apiDouble();
    let resolveFirst: ((blob: Blob | null) => void) | undefined;
    const firstBlob = new Promise<Blob | null>((resolve) => {
      resolveFirst = resolve;
    });
    const controller = new ExternalAudioController(api, () =>
      decoder(Float32Array.from([0.25])),
    );

    const first = controller.playFromLoader("first", () => firstBlob);
    await vi.waitFor(() => expect(api.stopSound).toHaveBeenCalledOnce());
    await controller.playFromLoader("second", () =>
      Promise.resolve(new Blob(["second"])),
    );
    resolveFirst?.(new Blob(["first"]));

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(api.play).toHaveBeenCalledOnce();
    expect(api.play).toHaveBeenCalledWith(
      expect.objectContaining({ soundId: "second" }),
    );
  });

  it("rejects cable loops before opening a native session", async () => {
    const api = apiDouble();
    const controller = new ExternalAudioController(api);
    await expect(
      controller.start({
        microphoneDeviceId: "mic",
        cableOutputDeviceId: "cable",
        monitorOutputDeviceId: "cable",
        microphoneGain: 1,
        soundboardGain: 0.7,
      }),
    ).rejects.toThrow(/headphones/i);
    expect(api.start).not.toHaveBeenCalled();
  });

  it("keeps setup recording and playback behind bounded native calls", async () => {
    const api = apiDouble();
    const controller = new ExternalAudioController(api);

    await controller.startSetupTest({
      microphoneDeviceId: "mic",
      monitorOutputDeviceId: "headphones",
    });
    await controller.clearSetupRecording();
    await expect(controller.captureSetupRecording()).resolves.toEqual({
      sampleRate: 48_000,
      samples: [0.1, -0.1],
    });
    await controller.playSetupTone();
    await controller.playSetupRecording({
      sampleRate: 48_000,
      samples: [0.1, -0.1],
    });
    await controller.stopSetupTest();

    expect(api.startSetupTest).toHaveBeenCalledWith({
      microphoneDeviceId: "mic",
      monitorOutputDeviceId: "headphones",
    });
    expect(api.playSetupRecording).toHaveBeenCalledWith({
      sampleRate: 48_000,
      samples: [0.1, -0.1],
    });
  });

  it("rejects an empty setup recording before native playback", () => {
    const api = apiDouble();
    const controller = new ExternalAudioController(api);
    expect(() =>
      controller.playSetupRecording({ sampleRate: 48_000, samples: [] }),
    ).toThrow(/invalid/i);
    expect(api.playSetupRecording).not.toHaveBeenCalled();
  });
});

function apiDouble() {
  return {
    listDevices: vi.fn(),
    getState: vi.fn().mockResolvedValue(liveState),
    startSetupTest: vi
      .fn()
      .mockResolvedValue({ ...liveState, status: "testing", config: null }),
    clearSetupRecording: vi.fn().mockResolvedValue(undefined),
    captureSetupRecording: vi.fn().mockResolvedValue({
      sampleRate: 48_000 as const,
      samples: [0.1, -0.1],
    }),
    playSetupTone: vi
      .fn()
      .mockResolvedValue({ ...liveState, status: "testing", config: null }),
    playSetupRecording: vi
      .fn()
      .mockResolvedValue({ ...liveState, status: "testing", config: null }),
    stopSetupTest: vi
      .fn()
      .mockResolvedValue({ ...liveState, status: "idle", config: null }),
    start: vi.fn().mockResolvedValue(liveState),
    update: vi.fn().mockResolvedValue(liveState),
    stop: vi.fn().mockResolvedValue({ ...liveState, status: "idle" }),
    play: vi.fn().mockResolvedValue(liveState),
    stopSound: vi.fn().mockResolvedValue(liveState),
    getOverlayInteraction: vi
      .fn()
      .mockResolvedValue({ id: 1, phase: "open", mode: "browse" }),
    onOverlayInteraction: vi.fn(() => () => undefined),
    finishOverlayInteraction: vi.fn().mockResolvedValue(true),
    selectionFeedback: vi.fn().mockResolvedValue(undefined),
    showOverlay: vi.fn(),
    hideOverlay: vi.fn(),
    onState: vi.fn(() => () => undefined),
    onLevels: vi.fn(() => () => undefined),
    onFailure: vi.fn(() => () => undefined),
    onCloseExplanation: vi.fn(() => () => undefined),
  } satisfies ExternalAudioDesktopApi;
}

function decoder(samples: Float32Array) {
  return {
    decodeAudioData: vi.fn().mockResolvedValue(audioBuffer(samples)),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function audioBuffer(samples: Float32Array): AudioBuffer {
  return {
    numberOfChannels: 1,
    length: samples.length,
    sampleRate: 48_000,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}
