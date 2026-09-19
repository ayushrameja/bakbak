import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDesktopBridge } from "../../lib/desktop-runtime";
import type {
  ExternalAudioDeviceSnapshot,
  ExternalAudioLevels,
  ExternalAudioSessionConfig,
  ExternalAudioSessionState,
  ExternalAudioSetupRecording,
  ExternalAudioSetupRecordingStatus,
  ExternalAudioSetupTestConfig,
} from "../../lib/external-audio-types";
import {
  ExternalAudioController,
  externalAudioBlocksVoice,
} from "./external-audio-controller";
import {
  EXTERNAL_AUDIO_OVERLAY_CHANNEL,
  parseExternalAudioOverlayMessage,
} from "./external-audio-overlay-channel";
import type { SoundboardCatalogController } from "./types";

const IDLE_STATE: ExternalAudioSessionState = {
  status: "idle",
  config: null,
  microphoneMuted: false,
  activeSoundId: null,
  errorCode: null,
  message: null,
};

const SILENT_LEVELS: ExternalAudioLevels = {
  microphone: 0,
  output: 0,
  clipping: false,
};

const SETUP_RECORDING_MS = 2_000;

export interface ExternalAudioControllerState {
  supported: boolean;
  platform: "macos" | "windows" | null;
  devices: ExternalAudioDeviceSnapshot | null;
  state: ExternalAudioSessionState;
  levels: ExternalAudioLevels;
  loading: boolean;
  error: string | null;
  closeExplanationRequested: boolean;
  setupRecordingStatus: ExternalAudioSetupRecordingStatus;
  blocksVoice: () => boolean;
  refreshDevices: () => Promise<void>;
  startSetupTest: (config: ExternalAudioSetupTestConfig) => Promise<void>;
  playSetupTone: () => Promise<void>;
  recordSetupSample: () => Promise<void>;
  playSetupRecording: () => Promise<void>;
  stopSetupTest: () => Promise<void>;
  start: (config: ExternalAudioSessionConfig) => Promise<void>;
  update: (input: {
    microphoneMuted?: boolean;
    microphoneGain?: number;
    soundboardGain?: number;
  }) => Promise<void>;
  playSound: (soundId: string) => Promise<void>;
  stopSound: () => Promise<void>;
  stop: () => Promise<void>;
  showOverlay: () => Promise<void>;
  dismissCloseExplanation: () => void;
}

export function useExternalAudio(
  accountId: string | undefined,
  authResolved: boolean,
  soundboard: SoundboardCatalogController,
): ExternalAudioControllerState {
  const bridge = getDesktopBridge();
  const api = bridge?.externalAudio;
  const [devices, setDevices] = useState<ExternalAudioDeviceSnapshot | null>(
    null,
  );
  const [state, setState] = useState<ExternalAudioSessionState>(IDLE_STATE);
  const [levels, setLevels] = useState<ExternalAudioLevels>(SILENT_LEVELS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closeExplanationRequested, setCloseExplanationRequested] =
    useState(false);
  const [recentSoundIds, setRecentSoundIds] = useState<string[]>([]);
  const [setupRecordingStatus, setSetupRecordingStatus] =
    useState<ExternalAudioSetupRecordingStatus>("idle");
  const stateRef = useRef<ExternalAudioSessionState>(IDLE_STATE);
  const stateVersionRef = useRef(0);
  const ownershipRef = useRef(Boolean(api));
  const setupRecordingRef = useRef<ExternalAudioSetupRecording | null>(null);
  const previousAccountIdRef = useRef(accountId);
  const controller = useMemo(
    () => (api ? new ExternalAudioController(api) : null),
    [api],
  );
  const applyState = useCallback((next: ExternalAudioSessionState) => {
    stateVersionRef.current += 1;
    stateRef.current = next;
    ownershipRef.current = externalAudioBlocksVoice(next.status);
    setState(next);
  }, []);
  const blocksVoice = useCallback(() => ownershipRef.current, []);

  const run = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await operation();
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "External Soundboard could not complete that action.";
        setError(message);
        throw caught;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const refreshDevices = useCallback(async () => {
    if (!api) return;
    const snapshot = await run(() => api.listDevices());
    setDevices(snapshot);
  }, [api, run]);

  useEffect(() => {
    if (!api) {
      applyState(IDLE_STATE);
      setDevices(null);
      return;
    }
    let active = true;
    let stoppingUnauthenticatedSession = false;
    const acceptState = (next: ExternalAudioSessionState) => {
      if (!active) return;
      applyState(next);
      if (
        !authResolved ||
        accountId ||
        !externalAudioBlocksVoice(next.status) ||
        stoppingUnauthenticatedSession
      ) {
        return;
      }
      stoppingUnauthenticatedSession = true;
      void api
        .stop()
        .then((stopped) => {
          if (active) applyState(stopped);
        })
        .catch((caught: unknown) => {
          if (active) setError(errorMessage(caught));
        })
        .finally(() => {
          stoppingUnauthenticatedSession = false;
        });
    };
    const offState = api.onState((next) => {
      if (!active) return;
      acceptState(next);
      if (!isAudioRunning(next)) {
        setLevels(SILENT_LEVELS);
        setupRecordingRef.current = null;
        setSetupRecordingStatus("idle");
      }
    });
    const offLevels = api.onLevels((next) => {
      if (active) setLevels(next);
    });
    const offFailure = api.onFailure((failure) => {
      if (!active) return;
      stateVersionRef.current += 1;
      setError(failure.message);
      setLevels(SILENT_LEVELS);
      setupRecordingRef.current = null;
      setSetupRecordingStatus("idle");
      void api
        .listDevices()
        .then((snapshot) => {
          if (active) setDevices(snapshot);
        })
        .catch(() => undefined);
    });
    const offCloseExplanation = api.onCloseExplanation(() => {
      if (active) setCloseExplanationRequested(true);
    });
    const initialStateVersion = stateVersionRef.current;
    void api
      .getState()
      .then((next) => {
        if (stateVersionRef.current === initialStateVersion) acceptState(next);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(errorMessage(caught));
        void api
          .stop()
          .then((stopped) => {
            if (active) applyState(stopped);
          })
          .catch(() => undefined);
      });
    void api
      .listDevices()
      .then((next) => {
        if (active) setDevices(next);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
      offState();
      offLevels();
      offFailure();
      offCloseExplanation();
    };
  }, [accountId, api, applyState, authResolved]);

  useEffect(() => {
    const previous = previousAccountIdRef.current;
    previousAccountIdRef.current = accountId;
    if (
      !api ||
      !previous ||
      previous === accountId ||
      (authResolved && !accountId)
    ) {
      return;
    }
    void api
      .stop()
      .then(applyState)
      .catch(() => undefined);
  }, [accountId, api, applyState, authResolved]);

  const startSetupTest = useCallback(
    async (config: ExternalAudioSetupTestConfig) => {
      if (!controller) throw new Error("External Soundboard is unavailable.");
      setupRecordingRef.current = null;
      setSetupRecordingStatus("idle");
      stateVersionRef.current += 1;
      ownershipRef.current = true;
      try {
        const next = await run(() => controller.startSetupTest(config));
        applyState(next);
      } catch (caught) {
        ownershipRef.current = externalAudioBlocksVoice(
          stateRef.current.status,
        );
        throw caught;
      }
    },
    [applyState, controller, run],
  );

  const playSetupTone = useCallback(async () => {
    if (!controller) throw new Error("External Soundboard is unavailable.");
    const next = await run(() => controller.playSetupTone());
    applyState(next);
  }, [applyState, controller, run]);

  const recordSetupSample = useCallback(async () => {
    if (!controller) throw new Error("External Soundboard is unavailable.");
    setupRecordingRef.current = null;
    setSetupRecordingStatus("recording");
    try {
      const recording = await run(async () => {
        await controller.clearSetupRecording();
        await wait(SETUP_RECORDING_MS);
        const next = await controller.captureSetupRecording();
        if (next.samples.length === 0) {
          throw new Error(
            "No microphone audio was captured. Check permission and the selected device.",
          );
        }
        return next;
      });
      setupRecordingRef.current = recording;
      setSetupRecordingStatus("ready");
    } catch (caught) {
      setSetupRecordingStatus("idle");
      throw caught;
    }
  }, [controller, run]);

  const playSetupRecording = useCallback(async () => {
    if (!controller) throw new Error("External Soundboard is unavailable.");
    const recording = setupRecordingRef.current;
    if (!recording) throw new Error("Record a short microphone test first.");
    const next = await run(() => controller.playSetupRecording(recording));
    applyState(next);
  }, [applyState, controller, run]);

  const stopSetupTest = useCallback(async () => {
    if (!controller) return;
    const next = await run(() => controller.stopSetupTest());
    setupRecordingRef.current = null;
    setSetupRecordingStatus("idle");
    setLevels(SILENT_LEVELS);
    applyState(next);
  }, [applyState, controller, run]);

  const start = useCallback(
    async (config: ExternalAudioSessionConfig) => {
      if (!controller)
        throw new Error("Install Bakbak to use External Soundboard.");
      stateVersionRef.current += 1;
      ownershipRef.current = true;
      try {
        const next = await run(() => controller.start(config));
        applyState(next);
      } catch (caught) {
        ownershipRef.current = externalAudioBlocksVoice(
          stateRef.current.status,
        );
        throw caught;
      }
    },
    [applyState, controller, run],
  );

  const update = useCallback(
    async (input: {
      microphoneMuted?: boolean;
      microphoneGain?: number;
      soundboardGain?: number;
    }) => {
      if (!api) throw new Error("External Soundboard is unavailable.");
      const next = await run(() => api.update(input));
      applyState(next);
    },
    [api, applyState, run],
  );

  const playSound = useCallback(
    async (soundId: string) => {
      if (!controller) throw new Error("External Soundboard is unavailable.");
      const next = await run(() =>
        controller.playFromLoader(soundId, () => soundboard.getBlob(soundId)),
      );
      applyState(next);
      setRecentSoundIds((current) =>
        [soundId, ...current.filter((id) => id !== soundId)].slice(0, 12),
      );
    },
    [applyState, controller, run, soundboard],
  );

  const stopSound = useCallback(async () => {
    if (!controller) return;
    const next = await run(() => controller.stopSound());
    applyState(next);
  }, [applyState, controller, run]);

  const stop = useCallback(async () => {
    if (!controller) return;
    const next = await run(() => controller.stop());
    setLevels(SILENT_LEVELS);
    setupRecordingRef.current = null;
    setSetupRecordingStatus("idle");
    applyState(next);
  }, [applyState, controller, run]);

  const showOverlay = useCallback(async () => {
    if (!api) return;
    await run(() => api.showOverlay());
  }, [api, run]);

  useEffect(() => {
    if (!api || !accountId || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(EXTERNAL_AUDIO_OVERLAY_CHANNEL);
    const publishCatalog = () => {
      channel.postMessage({
        type: "catalog",
        scopeId: `${accountId}:${soundboard.categories[0]?.serverId ?? "default"}`,
        categories: soundboard.categories.map(({ id, name }) => ({ id, name })),
        sounds: soundboard.sounds.map((sound) => ({
          id: sound.id,
          categoryId: sound.categoryId,
          label: sound.label,
          emoji: sound.emoji,
          favorite: soundboard.favoriteSoundIds.has(sound.id),
          assetStatus: sound.assetStatus,
        })),
        recentSoundIds,
      });
    };
    publishCatalog();
    channel.onmessage = ({ data }) => {
      const message = parseExternalAudioOverlayMessage(data);
      if (message?.type === "ready") {
        publishCatalog();
      } else if (message?.type === "play") {
        void playSound(message.soundId).catch((caught: unknown) => {
          if (isAbortError(caught)) return;
          channel.postMessage({
            type: "play-error",
            message:
              caught instanceof Error
                ? caught.message.slice(0, 500)
                : "That sound missed its cue.",
          });
        });
      } else if (message?.type === "stop-sound") {
        void stopSound().catch((caught: unknown) => {
          channel.postMessage({
            type: "play-error",
            message:
              caught instanceof Error
                ? caught.message.slice(0, 500)
                : "Bakbak could not stop that sound.",
          });
        });
      }
    };
    return () => channel.close();
  }, [
    accountId,
    api,
    playSound,
    recentSoundIds,
    soundboard.categories,
    soundboard.favoriteSoundIds,
    soundboard.sounds,
    stopSound,
  ]);

  return {
    supported: Boolean(api),
    platform: api ? (bridge?.platform ?? null) : null,
    devices,
    state,
    levels,
    loading,
    error,
    closeExplanationRequested,
    setupRecordingStatus,
    blocksVoice,
    refreshDevices,
    startSetupTest,
    playSetupTone,
    recordSetupSample,
    playSetupRecording,
    stopSetupTest,
    start,
    update,
    playSound,
    stopSound,
    stop,
    showOverlay,
    dismissCloseExplanation: () => setCloseExplanationRequested(false),
  };
}

function isAudioRunning(state: ExternalAudioSessionState): boolean {
  return state.status === "testing" || state.status === "live";
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error
    ? caught.message
    : "External Soundboard could not reach native audio.";
}

function isAbortError(caught: unknown): boolean {
  return caught instanceof DOMException && caught.name === "AbortError";
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
