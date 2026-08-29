import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BakbakDesktopBridge } from "../../lib/desktop-runtime";
import type {
  ExternalAudioDesktopApi,
  ExternalAudioFailure,
  ExternalAudioLevels,
  ExternalAudioSessionState,
} from "../../lib/external-audio-types";
import type { SoundboardCatalogController } from "./types";
import { useExternalAudio } from "./useExternalAudio";

const idleState: ExternalAudioSessionState = {
  status: "idle",
  config: null,
  microphoneMuted: false,
  activeSoundId: null,
  errorCode: null,
  message: null,
};

const testingState: ExternalAudioSessionState = {
  ...idleState,
  status: "testing",
};

const liveState: ExternalAudioSessionState = {
  ...idleState,
  status: "live",
  config: {
    microphoneDeviceId: "mic",
    cableOutputDeviceId: "cable",
    monitorOutputDeviceId: "headphones",
    microphoneGain: 1,
    soundboardGain: 0.7,
  },
};

describe("useExternalAudio", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "bakbakDesktop");
  });

  it("keeps a short setup recording in memory and sends it only to native playback", async () => {
    const { api } = installExternalAudioBridge();
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() =>
      useExternalAudio("user-ayush", true, soundboardDouble()),
    );

    await act(async () => {
      await result.current.startSetupTest({
        microphoneDeviceId: "mic",
        monitorOutputDeviceId: "headphones",
      });
    });
    await act(async () => {
      const recording = result.current.recordSetupSample();
      await vi.advanceTimersByTimeAsync(2_000);
      await recording;
    });
    expect(result.current.setupRecordingStatus).toBe("ready");

    await act(async () => {
      await result.current.playSetupRecording();
    });
    expect(api.clearSetupRecording).toHaveBeenCalledOnce();
    expect(api.captureSetupRecording).toHaveBeenCalledOnce();
    expect(api.playSetupRecording).toHaveBeenCalledWith({
      sampleRate: 48_000,
      samples: [0.1, -0.1],
    });
    expect(storageWrite).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.stopSetupTest();
    });
    expect(result.current.setupRecordingStatus).toBe("idle");
    await act(async () => {
      await result.current.start({
        microphoneDeviceId: "mic",
        cableOutputDeviceId: "cable",
        monitorOutputDeviceId: "headphones",
        microphoneGain: 1,
        soundboardGain: 0.7,
      });
    });
    expect(api.start).toHaveBeenCalledOnce();
    expect(api.showOverlay).not.toHaveBeenCalled();
  });

  it("silences meters and refreshes devices after a native device-loss failure", async () => {
    const { api, emitFailure, emitLevels, emitState } =
      installExternalAudioBridge();
    const { result } = renderHook(() =>
      useExternalAudio("user-ayush", true, soundboardDouble()),
    );
    await act(async () => Promise.resolve());

    act(() => emitLevels({ microphone: 0.8, output: 0.6, clipping: false }));
    expect(result.current.levels.microphone).toBe(0.8);
    act(() => {
      emitFailure({
        code: "input-device-lost",
        message: "The microphone disconnected.",
      });
      emitState({
        ...idleState,
        status: "error",
        microphoneMuted: true,
        errorCode: "input-device-lost",
        message: "The microphone disconnected.",
      });
    });
    await act(async () => Promise.resolve());

    expect(result.current.levels).toEqual({
      microphone: 0,
      output: 0,
      clipping: false,
    });
    expect(result.current.state.errorCode).toBe("input-device-lost");
    expect(result.current.error).toBe("The microphone disconnected.");
    expect(api.listDevices).toHaveBeenCalledTimes(2);
  });

  it("stops a native session after reload resolves to no signed-in user", async () => {
    const { api } = installExternalAudioBridge();
    api.getState.mockResolvedValue(liveState);
    const { result, rerender } = renderHook(
      ({ authResolved }) =>
        useExternalAudio(undefined, authResolved, soundboardDouble()),
      { initialProps: { authResolved: false } },
    );
    await flushPromises();
    expect(api.stop).not.toHaveBeenCalled();
    expect(result.current.blocksVoice()).toBe(true);

    rerender({ authResolved: true });
    await flushPromises();

    expect(api.stop).toHaveBeenCalledOnce();
    expect(result.current.state.status).toBe("idle");
    expect(result.current.blocksVoice()).toBe(false);
  });

  it("claims microphone ownership before setup or live start can resolve", async () => {
    const { api } = installExternalAudioBridge();
    const setupStart = deferred<ExternalAudioSessionState>();
    const liveStart = deferred<ExternalAudioSessionState>();
    api.startSetupTest.mockReturnValueOnce(setupStart.promise);
    api.start.mockReturnValueOnce(liveStart.promise);
    const { result } = renderHook(() =>
      useExternalAudio("user-ayush", true, soundboardDouble()),
    );
    await flushPromises();
    const acquireVoice = vi.fn();
    const attemptVoiceJoin = () => {
      if (!result.current.blocksVoice()) acquireVoice();
    };

    let setupPromise!: Promise<void>;
    act(() => {
      setupPromise = result.current.startSetupTest({
        microphoneDeviceId: "mic",
        monitorOutputDeviceId: "headphones",
      });
    });
    attemptVoiceJoin();
    expect(acquireVoice).not.toHaveBeenCalled();

    setupStart.resolve(testingState);
    await act(async () => setupPromise);
    await act(async () => result.current.stopSetupTest());
    expect(result.current.blocksVoice()).toBe(false);

    let livePromise!: Promise<void>;
    act(() => {
      livePromise = result.current.start({
        microphoneDeviceId: "mic",
        cableOutputDeviceId: "cable",
        monitorOutputDeviceId: "headphones",
        microphoneGain: 1,
        soundboardGain: 0.7,
      });
    });
    attemptVoiceJoin();
    expect(acquireVoice).not.toHaveBeenCalled();

    liveStart.resolve(liveState);
    await act(async () => livePromise);
    expect(result.current.blocksVoice()).toBe(true);
  });
});

function installExternalAudioBridge() {
  let stateListener: ((state: ExternalAudioSessionState) => void) | undefined;
  let levelsListener: ((levels: ExternalAudioLevels) => void) | undefined;
  let failureListener: ((failure: ExternalAudioFailure) => void) | undefined;
  const api = {
    listDevices: vi.fn(() =>
      Promise.resolve({
        inputs: [],
        outputs: [],
        recommendedCableInputId: null,
        recommendedCableOutputId: null,
      }),
    ),
    getState: vi.fn(() => Promise.resolve(idleState)),
    startSetupTest: vi.fn(() => Promise.resolve(testingState)),
    clearSetupRecording: vi.fn(() => Promise.resolve()),
    captureSetupRecording: vi.fn(() =>
      Promise.resolve({
        sampleRate: 48_000 as const,
        samples: [0.1, -0.1],
      }),
    ),
    playSetupTone: vi.fn(() => Promise.resolve(testingState)),
    playSetupRecording: vi.fn(() => Promise.resolve(testingState)),
    stopSetupTest: vi.fn(() => Promise.resolve(idleState)),
    start: vi.fn(() => Promise.resolve(idleState)),
    update: vi.fn(() => Promise.resolve(idleState)),
    stop: vi.fn(() => Promise.resolve(idleState)),
    play: vi.fn(() => Promise.resolve(idleState)),
    stopSound: vi.fn(() => Promise.resolve(idleState)),
    showOverlay: vi.fn(() => Promise.resolve()),
    hideOverlay: vi.fn(() => Promise.resolve()),
    onState: vi.fn((listener: (state: ExternalAudioSessionState) => void) => {
      stateListener = listener;
      return () => {
        stateListener = undefined;
      };
    }),
    onLevels: vi.fn((listener: (levels: ExternalAudioLevels) => void) => {
      levelsListener = listener;
      return () => {
        levelsListener = undefined;
      };
    }),
    onFailure: vi.fn((listener: (failure: ExternalAudioFailure) => void) => {
      failureListener = listener;
      return () => {
        failureListener = undefined;
      };
    }),
    onCloseExplanation: vi.fn(() => () => undefined),
  } satisfies ExternalAudioDesktopApi;
  window.bakbakDesktop = {
    platform: "macos",
    externalAudio: api,
  } as unknown as BakbakDesktopBridge;
  return {
    api,
    emitState: (state: ExternalAudioSessionState) => stateListener?.(state),
    emitLevels: (levels: ExternalAudioLevels) => levelsListener?.(levels),
    emitFailure: (failure: ExternalAudioFailure) => failureListener?.(failure),
  };
}

function soundboardDouble(): SoundboardCatalogController {
  return {
    categories: [],
    sounds: [],
    favoriteSoundIds: new Set(),
    loading: false,
    error: null,
    getBlob: vi.fn(() => Promise.resolve(null)),
    retrySound: vi.fn(() => Promise.resolve()),
    toggleFavorite: vi.fn(() => Promise.resolve()),
    uploadSound: vi.fn(() => Promise.resolve()),
    deleteSound: vi.fn(() => Promise.resolve()),
    updateSound: vi.fn(() => Promise.resolve()),
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
