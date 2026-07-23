import {
  ConnectionQuality,
  ConnectionError,
  ConnectionErrorReason,
  LocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  VideoPresets,
  createLocalAudioTrack,
  type Participant,
  type LocalParticipant,
  type LocalTrackPublication,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CommunicationEffectEvent,
  VoiceLeaveReason,
} from "../../lib/communication-effects";
import { appConfig } from "../../lib/env";
import { getSupabaseClient } from "../../lib/supabase";
import type { AppUser, Channel, DataMode } from "../../lib/types";
import {
  availableDeviceId,
  loadDevicePreferences,
  saveDevicePreferences,
} from "../settings/device-preferences";
import type {
  MicrophoneProcessingPreferences,
  VoiceEffect,
} from "../settings/microphone-preferences";
import {
  SOUND_PLAY_EVENT_TYPE,
  SOUND_STOP_EVENT_TYPE,
  createSoundPlayEvent,
  createSoundStopEvent,
  encodeSoundEvent,
  hasSeenSoundEvent,
  parseSoundEvent,
} from "../soundboard/sound-events";
import { mockSoundboardController } from "../soundboard/mock-catalog";
import {
  MAX_CONCURRENT_SOUNDS_PER_USER,
  clampSoundboardActivities,
  hasReachedSoundLimit,
} from "../soundboard/limits";
import {
  SOUNDBOARD_TRACK_NAME,
  SoundboardAudioPublisher,
} from "../soundboard/soundboard-audio";
import type {
  SoundboardActivity,
  SoundboardCatalogController,
  SoundboardMetadataInput,
} from "../soundboard/types";
import {
  resumeAudioPlayback,
  setAudioDeafened,
  switchAudioOutput,
  switchAudioInput,
  switchCameraInput,
} from "./audio-actions";
import { AudioOutputRouter } from "./audio-output-router";
import {
  SPEECH_MICROPHONE_TRACK_NAME,
  findSpeechMicrophonePublication,
} from "./microphone-publication";
import {
  MICROPHONE_PROCESSING_UNAVAILABLE,
  attachMicrophoneProcessor,
  isBakbakMicrophoneProcessor,
  isMicrophoneProcessingSupported,
  microphoneCaptureOptions,
  needsMicrophoneProcessor,
} from "./microphone-processing";
import { RemoteAudioRenderer } from "./remote-audio";
import { enumerateMediaDeviceGroups } from "./media-devices";
import {
  buildLiveKitTokenRequest,
  parseLiveKitTokenResponse,
  type LiveKitToken,
} from "./token-request";
import {
  clearRelayPreference,
  loadRelayPreference,
  saveRelayPreference,
} from "./voice-relay-preference";
import {
  getScreenShareCapabilities,
  isDesktopApp,
  listenForScreenShareLifecycle,
  startScreenShare as startNativeScreenShare,
  stopScreenShare as stopNativeScreenShare,
  updateScreenShareSettings as updateNativeScreenShareSettings,
  type ScreenShareCapabilities,
  type ScreenShareLifecycleState,
  type ScreenShareSourceKind,
} from "./screen-share-service";
import {
  loadScreenShareSettings,
  saveScreenShareSettings,
  screenShareBitrate,
  type ScreenShareSettings,
} from "./screen-share-preferences";
import { chooseFeaturedScreenShare } from "./screen-share-selection";
import { screenShareSubscriptionPolicy } from "./screen-share-subscription";

export type VoiceConnectionStatus =
  "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

export type VoiceConnectionQuality = "unknown" | "excellent" | "good" | "poor";

export type VoiceJoinStage =
  "authorizing" | "connecting" | "microphone" | "soundboard";

export const VOICE_PREPARE_DEBOUNCE_MS = 75;
export const VOICE_TOKEN_EXPIRY_BUFFER_MS = 30_000;
export const RELAY_PREFERENCE_DURATION_MS = 10 * 60_000;
export const OUTPUT_DEVICE_NOTICE_DURATION_MS = 8_000;

export interface VoiceJoinTimingSnapshot {
  outcome: "connected" | "error";
  totalMs: number;
  stages: Readonly<Record<string, number>>;
}

let lastVoiceJoinTiming: VoiceJoinTimingSnapshot | null = null;

export function readLastVoiceJoinTiming(): VoiceJoinTimingSnapshot | null {
  return lastVoiceJoinTiming;
}

type PreparedTokenResult =
  { ok: true; value: LiveKitToken } | { ok: false; error: unknown };

interface PreparedVoiceJoin {
  channelId: string;
  room: Room;
  operation: number;
  tokenResult: Promise<PreparedTokenResult>;
}

export function normalizeVoiceConnectionQuality(
  quality: ConnectionQuality,
): VoiceConnectionQuality {
  if (quality === ConnectionQuality.Excellent) return "excellent";
  if (quality === ConnectionQuality.Good) return "good";
  if (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost)
    return "poor";
  return "unknown";
}

export interface VoiceParticipant {
  id: string;
  displayName: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  volume: number;
  joinedAt: string | null;
  cameraEnabled: boolean;
  cameraTrack: VideoTrackLike | null;
  activeSounds: SoundboardActivity[];
}

export interface VoiceScreenShare {
  id: string;
  ownerId: string;
  displayName: string;
  isLocal: boolean;
  joinedAt: string | null;
  track: VideoTrackLike | null;
  audioPublished: boolean;
  paused: boolean;
}

export interface VideoTrackLike {
  attach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element: HTMLMediaElement): HTMLMediaElement;
}

interface VoiceRoomState {
  status: VoiceConnectionStatus;
  joinStage: VoiceJoinStage | null;
  connectionQuality: VoiceConnectionQuality;
  channel: Channel | null;
  participants: VoiceParticipant[];
  muted: boolean;
  deafened: boolean;
  audioPlaybackBlocked: boolean;
  error: string | null;
  inputDeviceError: string | null;
  microphoneProcessingError: string | null;
  outputDeviceError: string | null;
  cameraDeviceError: string | null;
  inputDevices: MediaDeviceInfo[];
  outputDevices: MediaDeviceInfo[];
  cameraDevices: MediaDeviceInfo[];
  selectedInputId: string;
  selectedOutputId: string;
  selectedCameraId: string;
  enhancedNoiseSuppression: boolean;
  voiceEffect: VoiceEffect;
  microphoneProcessingSupported: boolean;
  outputSelectionSupported: boolean;
  cameraEnabled: boolean;
  cameraPending: boolean;
  screenShares: VoiceScreenShare[];
  watchedScreenShareId: string | null;
  screenShareAvailable: boolean;
  screenShareAudioAvailable: boolean;
  screenShareCustomPicker: boolean;
  screenShareUnavailableReason: string | null;
  screenShareState: ScreenShareLifecycleState;
  screenShareEnabled: boolean;
  screenSharePending: boolean;
  screenShareAudioPublished: boolean;
  screenShareSourceLabel: string | null;
  screenShareSourceKind: ScreenShareSourceKind | null;
  screenShareSettings: ScreenShareSettings;
  screenShareSettingsPending: boolean;
  screenShareError: string | null;
  soundboard: SoundboardCatalogController;
  soundboardVolume: number;
  activeLocalSoundCount: number;
  maxConcurrentSounds: number;
  prepareVoiceChannel: (channel: Channel, immediate?: boolean) => void;
  join: (channel: Channel) => Promise<void>;
  leave: (reason?: VoiceLeaveReason) => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  resumeAudio: () => Promise<void>;
  setParticipantVolume: (participantId: string, volume: number) => void;
  refreshDevices: () => Promise<void>;
  setInputDevice: (deviceId: string) => Promise<void>;
  setEnhancedNoiseSuppression: (enabled: boolean) => Promise<void>;
  setVoiceEffect: (effect: VoiceEffect) => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  dismissOutputDeviceError: () => void;
  setCameraDevice: (deviceId: string) => Promise<void>;
  toggleCamera: () => Promise<void>;
  startScreenShare: (
    includeAudio: boolean,
    settings: ScreenShareSettings,
    sourceId?: string | null,
  ) => Promise<void>;
  updateScreenShareSettings: (settings: ScreenShareSettings) => Promise<void>;
  stopScreenShare: () => Promise<void>;
  watchScreenShare: (shareId: string) => void;
  stopWatchingScreenShare: () => void;
  dispatchSound: (soundId: string) => Promise<void>;
  stopLocalSounds: () => Promise<void>;
  setSoundboardVolume: (volume: number) => void;
  updateSoundMetadata: (
    soundId: string,
    input: SoundboardMetadataInput,
  ) => Promise<void>;
}

export function useVoiceRoom(
  user: AppUser,
  mode: DataMode,
  soundboard: SoundboardCatalogController = mockSoundboardController,
  onCommunicationEffect?: (event: CommunicationEffectEvent) => void,
): VoiceRoomState {
  const [initialPreferences] = useState(loadDevicePreferences);
  const [status, setStatus] = useState<VoiceConnectionStatus>("disconnected");
  const [joinStage, setJoinStage] = useState<VoiceJoinStage | null>(null);
  const [connectionQuality, setConnectionQuality] =
    useState<VoiceConnectionQuality>("unknown");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputDeviceError, setInputDeviceError] = useState<string | null>(null);
  const [microphoneProcessingError, setMicrophoneProcessingError] = useState<
    string | null
  >(null);
  const [outputDeviceError, setOutputDeviceError] = useState<string | null>(
    null,
  );
  const [cameraDeviceError, setCameraDeviceError] = useState<string | null>(
    null,
  );
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState(
    initialPreferences.inputDeviceId,
  );
  const [selectedOutputId, setSelectedOutputId] = useState(
    initialPreferences.outputDeviceId,
  );
  const [selectedCameraId, setSelectedCameraId] = useState(
    initialPreferences.cameraDeviceId,
  );
  const [enhancedNoiseSuppression, setEnhancedNoiseSuppressionState] = useState(
    initialPreferences.enhancedNoiseSuppression,
  );
  const [voiceEffect, setVoiceEffectState] = useState(
    initialPreferences.voiceEffect,
  );
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraPending, setCameraPending] = useState(false);
  const [screenShares, setScreenShares] = useState<VoiceScreenShare[]>([]);
  const [watchedScreenShareId, setWatchedScreenShareId] = useState<
    string | null
  >(null);
  const watchedScreenShareIdRef = useRef<string | null>(null);
  const [screenShareCapabilities, setScreenShareCapabilities] =
    useState<ScreenShareCapabilities>({
      available: false,
      nativeCapture: false,
      systemAudio: false,
      sourceKinds: [],
      resolutions: [480, 720, 1080],
      frameRates: [15, 30, 60],
      dynamicSettings: false,
      customPicker: false,
      reason: "Screen sharing is available in the installed desktop app.",
    });
  const [screenShareState, setScreenShareState] =
    useState<ScreenShareLifecycleState>("idle");
  const [screenShareAudioPublished, setScreenShareAudioPublished] =
    useState(false);
  const [screenShareSourceLabel, setScreenShareSourceLabel] = useState<
    string | null
  >(null);
  const [screenShareSourceKind, setScreenShareSourceKind] =
    useState<ScreenShareSourceKind | null>(null);
  const [screenShareSettings, setScreenShareSettings] =
    useState<ScreenShareSettings>(loadScreenShareSettings);
  const [screenShareSettingsPending, setScreenShareSettingsPending] =
    useState(false);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [soundboardVolume, setSoundboardVolumeState] = useState(
    initialPreferences.soundboardVolume,
  );
  const [activeLocalSoundCount, setActiveLocalSoundCount] = useState(0);
  const [remoteAudio] = useState(() => new RemoteAudioRenderer());
  const [audioOutput] = useState(() => new AudioOutputRouter());
  const [soundboardAudio] = useState(
    () =>
      new SoundboardAudioPublisher(
        () => audioOutput.soundTarget,
        () => audioOutput.resetMonitor(),
      ),
  );
  const outputSelectionSupported = audioOutput.supported;
  const roomRef = useRef<Room | null>(null);
  const preparedJoinRef = useRef<PreparedVoiceJoin | null>(null);
  const prepareTimerRef = useRef<number | null>(null);
  const scheduledPrepareChannelRef = useRef<string | null>(null);
  const prepareOperationRef = useRef(0);
  const joiningMicrophoneRef = useRef<LocalAudioTrack | null>(null);
  const outputDeviceErrorTimerRef = useRef<number | null>(null);
  const relayPreferredUntilRef = useRef(
    loadRelayPreference(appConfig.livekitUrl),
  );
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const joinOperationRef = useRef(0);
  const playbackOperationRef = useRef(0);
  const soundStartOperationRef = useRef(0);
  const cameraOperationRef = useRef(0);
  const screenShareOperationRef = useRef(0);
  const screenShareSessionRef = useRef<string | null>(null);
  const seenSoundEvents = useRef(new Set<string>());
  const soundActivities = useRef(new Map<string, SoundboardActivity[]>());
  const soundActivityTimers = useRef(new Map<string, number>());
  const soundboardTracks = useRef(new Map<string, RemoteAudioTrack>());
  const screenShareTracks = useRef(new Map<string, RemoteAudioTrack>());
  const participantVolumes = useRef(new Map<string, number>());
  const soundboardVolumeRef = useRef(soundboardVolume);
  const soundboardRef = useRef(soundboard);
  const onCommunicationEffectRef = useRef(onCommunicationEffect);
  const effectReadyRoomsRef = useRef(new WeakSet<Room>());
  const remoteShareKeysRef = useRef(new Set<string>());
  const localScreenShareLiveRef = useRef(false);
  const microphoneProcessingPreferencesRef =
    useRef<MicrophoneProcessingPreferences>({
      enhancedNoiseSuppression,
      voiceEffect,
    });

  const desktopApp = isDesktopApp();
  const microphoneProcessingSupported = isMicrophoneProcessingSupported();

  const dismissOutputDeviceError = useCallback(() => {
    if (outputDeviceErrorTimerRef.current !== null) {
      window.clearTimeout(outputDeviceErrorTimerRef.current);
      outputDeviceErrorTimerRef.current = null;
    }
    setOutputDeviceError(null);
  }, []);

  const showOutputDeviceError = useCallback((message: string) => {
    if (outputDeviceErrorTimerRef.current !== null) {
      window.clearTimeout(outputDeviceErrorTimerRef.current);
    }
    setOutputDeviceError(message);
    outputDeviceErrorTimerRef.current = window.setTimeout(() => {
      outputDeviceErrorTimerRef.current = null;
      setOutputDeviceError(null);
    }, OUTPUT_DEVICE_NOTICE_DURATION_MS);
  }, []);

  useEffect(() => {
    onCommunicationEffectRef.current = onCommunicationEffect;
  }, [onCommunicationEffect]);

  const emitCommunicationEffect = useCallback(
    (event: CommunicationEffectEvent) => {
      onCommunicationEffectRef.current?.(event);
    },
    [],
  );

  const markLocalScreenShareStarted = useCallback(() => {
    if (localScreenShareLiveRef.current) return;
    localScreenShareLiveRef.current = true;
    emitCommunicationEffect({ type: "screen-share-started", actor: "self" });
  }, [emitCommunicationEffect]);

  const markLocalScreenShareStopped = useCallback(() => {
    if (!localScreenShareLiveRef.current) return;
    localScreenShareLiveRef.current = false;
    emitCommunicationEffect({ type: "screen-share-stopped", actor: "self" });
  }, [emitCommunicationEffect]);

  const refreshParticipants = useCallback(
    (room: Room) => {
      const next: VoiceParticipant[] = [];
      const nextScreenShares: VoiceScreenShare[] = [];
      const addParticipant = (participant: Participant, local: boolean) => {
        const companion = readScreenShareCompanion(participant);
        if (companion) {
          if (desktopApp) {
            nextScreenShares.push(
              screenShareParticipantToView(participant, companion, user.id),
            );
          }
          return;
        }
        next.push(
          participantToView(
            participant,
            local,
            soundActivities.current.get(participant.identity) ?? [],
          ),
        );
        if (desktopApp) {
          const fallbackShare = regularParticipantScreenShareToView(
            participant,
            local,
          );
          if (fallbackShare) nextScreenShares.push(fallbackShare);
        }
      };

      addParticipant(room.localParticipant, true);
      room.remoteParticipants.forEach((participant) => {
        if (!desktopApp) {
          participant
            .getTrackPublication(Track.Source.ScreenShare)
            ?.setSubscribed(false);
          participant
            .getTrackPublication(Track.Source.ScreenShareAudio)
            ?.setSubscribed(false);
        }
        const companion = readScreenShareCompanion(participant);
        const volume = participantVolumes.current.get(
          companion?.ownerUserId ?? participant.identity,
        );
        if (volume !== undefined) participant.setVolume(volume);
        addParticipant(participant, false);
      });
      setParticipants(next);
      setScreenShares(nextScreenShares);
      setCameraEnabled(room.localParticipant.isCameraEnabled);
    },
    [desktopApp, user.id],
  );

  const refreshDevices = useCallback(async () => {
    if (typeof navigator.mediaDevices?.enumerateDevices !== "function") return;
    try {
      const { inputs, outputs, cameras } = await enumerateMediaDeviceGroups(
        navigator.mediaDevices,
      );
      setInputDevices(inputs);
      setOutputDevices(outputs);
      setCameraDevices(cameras);
      setSelectedInputId((current) => availableDeviceId(current, inputs));
      setSelectedOutputId((current) => availableDeviceId(current, outputs));
      setSelectedCameraId((current) => availableDeviceId(current, cameras));
    } catch {
      setInputDevices([]);
      setOutputDevices([]);
      setCameraDevices([]);
    }
  }, []);

  useEffect(() => {
    saveDevicePreferences({
      inputDeviceId: selectedInputId,
      outputDeviceId: selectedOutputId,
      cameraDeviceId: selectedCameraId,
      soundboardVolume,
      enhancedNoiseSuppression,
      voiceEffect,
    });
  }, [
    enhancedNoiseSuppression,
    selectedCameraId,
    selectedInputId,
    selectedOutputId,
    soundboardVolume,
    voiceEffect,
  ]);

  useEffect(() => {
    soundboardRef.current = soundboard;
  }, [soundboard]);

  useEffect(() => {
    microphoneProcessingPreferencesRef.current = {
      enhancedNoiseSuppression,
      voiceEffect,
    };
  }, [enhancedNoiseSuppression, voiceEffect]);

  useEffect(() => {
    soundboardVolumeRef.current = soundboardVolume;
    soundboardAudio.setVolume(soundboardVolume);
    soundboardTracks.current.forEach((track, participantId) => {
      remoteAudio.setVolume(
        track,
        soundboardVolume * (participantVolumes.current.get(participantId) ?? 1),
      );
    });
  }, [remoteAudio, soundboardAudio, soundboardVolume]);

  useEffect(() => {
    void refreshDevices();
    const handleDeviceChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener(
      "devicechange",
      handleDeviceChange,
    );
    return () =>
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
  }, [refreshDevices]);

  useEffect(() => {
    let cancelled = false;
    if (!desktopApp) return;
    void getScreenShareCapabilities()
      .then((capabilities) => {
        if (cancelled) return;
        if (
          !capabilities.nativeCapture &&
          typeof navigator.mediaDevices?.getDisplayMedia !== "function"
        ) {
          setScreenShareCapabilities({
            ...capabilities,
            available: false,
            reason:
              "This desktop runtime does not provide a compatible screen picker.",
          });
          return;
        }
        setScreenShareCapabilities(capabilities);
      })
      .catch(() => {
        if (!cancelled) {
          // Windows and modern macOS own capture in native Rust. Do not fall
          // back to WebView getDisplayMedia there — it strands presenters on
          // a broken system capture sheet.
          const allowWebViewFallback =
            typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
            !/windows/i.test(navigator.userAgent) &&
            !/mac os x|macintosh/i.test(navigator.userAgent);
          setScreenShareCapabilities({
            available: allowWebViewFallback,
            nativeCapture: false,
            systemAudio: false,
            sourceKinds: allowWebViewFallback ? ["display", "window"] : [],
            resolutions: [480, 720, 1080],
            frameRates: [15, 30, 60],
            dynamicSettings: false,
            customPicker: false,
            reason: allowWebViewFallback
              ? "Matched system audio is unavailable. Video-only sharing may still work."
              : "Bakbak could not start its native screen picker. Quit and reopen the app, then try again.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [desktopApp]);

  useEffect(() => {
    setWatchedScreenShareId((current) =>
      chooseFeaturedScreenShare(current, screenShares),
    );
  }, [screenShares]);

  useEffect(() => {
    watchedScreenShareIdRef.current = watchedScreenShareId;
    const room = roomRef.current;
    if (!room || !desktopApp) return;
    room.remoteParticipants.forEach((participant) => {
      const companion = readScreenShareCompanion(participant);
      const shareId = companion
        ? participant.identity
        : `${participant.identity}:screen`;
      if (
        companion?.ownerUserId !== user.id &&
        shareId !== watchedScreenShareId
      ) {
        participant
          .getTrackPublication(Track.Source.ScreenShare)
          ?.setSubscribed(false);
        participant
          .getTrackPublication(Track.Source.ScreenShareAudio)
          ?.setSubscribed(false);
      }
    });
    room.remoteParticipants.forEach((participant) => {
      const companion = readScreenShareCompanion(participant);
      const shareId = companion
        ? participant.identity
        : `${participant.identity}:screen`;
      const locallyPresented = companion?.ownerUserId === user.id;
      const policy = screenShareSubscriptionPolicy(
        shareId,
        watchedScreenShareId,
        locallyPresented,
      );
      const videoPublication = participant.getTrackPublication(
        Track.Source.ScreenShare,
      );
      videoPublication?.setSubscribed(policy.subscribeVideo);
      if (
        videoPublication &&
        "setVideoQuality" in videoPublication &&
        typeof videoPublication.setVideoQuality === "function"
      ) {
        videoPublication.setVideoQuality(
          policy.videoQuality === "high" ? VideoQuality.HIGH : VideoQuality.LOW,
        );
      }
      participant
        .getTrackPublication(Track.Source.ScreenShareAudio)
        ?.setSubscribed(policy.subscribeAudio);
    });
  }, [desktopApp, screenShares, user.id, watchedScreenShareId]);

  useEffect(() => {
    if (mode !== "live" || appConfig.livekitUrl.length === 0) return;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    void room.prepareConnection(appConfig.livekitUrl).catch(() => undefined);
    return () => void room.disconnect().catch(() => undefined);
  }, [mode]);

  useEffect(() => {
    if (!desktopApp) return;
    let disposed = false;
    let unlisten: () => void = () => undefined;
    void listenForScreenShareLifecycle((event) => {
      if (disposed) return;
      if (
        event.sessionId &&
        screenShareSessionRef.current &&
        event.sessionId !== screenShareSessionRef.current
      ) {
        return;
      }
      setScreenShareState(event.state);
      setScreenShareAudioPublished(event.audioPublished);
      setScreenShareSourceLabel(event.sourceLabel);
      setScreenShareSourceKind(event.sourceKind);
      if (event.settings) setScreenShareSettings(event.settings);
      if (event.state === "sharing") markLocalScreenShareStarted();
      if (event.state === "error") {
        markLocalScreenShareStopped();
        emitCommunicationEffect({ type: "signal-interrupted" });
        screenShareSessionRef.current = null;
        setScreenShareAudioPublished(false);
        setScreenShareSourceLabel(null);
        setScreenShareSourceKind(null);
        setScreenShareError(
          event.message ?? "Bakbak could not continue the screen share.",
        );
      }
      if (event.state === "idle") {
        markLocalScreenShareStopped();
        screenShareSessionRef.current = null;
        setScreenShareAudioPublished(false);
        setScreenShareSourceLabel(null);
        setScreenShareSourceKind(null);
      }
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    return () => {
      disposed = true;
      unlisten();
    };
  }, [
    desktopApp,
    emitCommunicationEffect,
    markLocalScreenShareStarted,
    markLocalScreenShareStopped,
  ]);

  const discardPreparedJoin = useCallback(() => {
    if (prepareTimerRef.current !== null) {
      window.clearTimeout(prepareTimerRef.current);
      prepareTimerRef.current = null;
    }
    scheduledPrepareChannelRef.current = null;
    prepareOperationRef.current += 1;
    const prepared = preparedJoinRef.current;
    preparedJoinRef.current = null;
    void prepared?.room.disconnect().catch(() => undefined);
  }, []);

  const prepareVoiceChannel = useCallback(
    (nextChannel: Channel, immediate = false) => {
      if (
        mode !== "live" ||
        nextChannel.kind !== "voice" ||
        (roomRef.current !== null && channel?.id === nextChannel.id) ||
        preparedJoinRef.current?.channelId === nextChannel.id ||
        scheduledPrepareChannelRef.current === nextChannel.id
      ) {
        return;
      }

      if (prepareTimerRef.current !== null) {
        window.clearTimeout(prepareTimerRef.current);
      }
      scheduledPrepareChannelRef.current = nextChannel.id;
      prepareTimerRef.current = window.setTimeout(
        () => {
          prepareTimerRef.current = null;
          scheduledPrepareChannelRef.current = null;
          discardPreparedJoin();

          const operation = prepareOperationRef.current + 1;
          prepareOperationRef.current = operation;
          const room = new Room({ adaptiveStream: true, dynacast: true });
          const startedAt = performance.now();
          const tokenResult: Promise<PreparedTokenResult> = requestLiveKitToken(
            nextChannel.id,
            "voice",
          ).then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error }),
          );
          const prepared: PreparedVoiceJoin = {
            channelId: nextChannel.id,
            room,
            operation,
            tokenResult,
          };
          preparedJoinRef.current = prepared;

          void tokenResult.then(async (result) => {
            const isCurrent = () =>
              prepareOperationRef.current === operation &&
              preparedJoinRef.current === prepared;
            if (
              !isCurrent() ||
              !result.ok ||
              !isPreparedVoiceTokenUsable(result.value, Date.now())
            ) {
              if (isCurrent()) discardPreparedJoin();
              return;
            }
            try {
              await room.prepareConnection(
                result.value.serverUrl,
                result.value.token,
              );
              if (isCurrent() && import.meta.env.DEV) {
                console.debug("[voice-join] prepared", {
                  durationMs: Math.round(performance.now() - startedAt),
                });
              }
            } catch {
              if (isCurrent()) discardPreparedJoin();
            }
          });
        },
        immediate ? 0 : VOICE_PREPARE_DEBOUNCE_MS,
      );
    },
    [channel?.id, discardPreparedJoin, mode],
  );

  const resetVoiceMedia = useCallback(
    (preserveLocalControls = false) => {
      playbackOperationRef.current += 1;
      soundStartOperationRef.current += 1;
      cameraOperationRef.current += 1;
      screenShareOperationRef.current += 1;
      const screenSessionId = screenShareSessionRef.current;
      screenShareSessionRef.current = null;
      const screenStop = screenSessionId
        ? stopNativeScreenShare(screenSessionId).catch(() => undefined)
        : Promise.resolve();
      remoteAudio.cleanup();
      soundboardAudio.cleanup();
      audioOutput.cleanup();
      soundActivities.current.clear();
      soundActivityTimers.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      soundActivityTimers.current.clear();
      soundboardTracks.current.clear();
      screenShareTracks.current.clear();
      setActiveLocalSoundCount(0);
      seenSoundEvents.current.clear();
      setParticipants([]);
      setConnectionQuality("unknown");
      setJoinStage(null);
      if (!preserveLocalControls) {
        mutedRef.current = false;
        deafenedRef.current = false;
        setMuted(false);
        setDeafened(false);
      }
      setAudioPlaybackBlocked(false);
      setCameraEnabled(false);
      setCameraPending(false);
      setScreenShares([]);
      watchedScreenShareIdRef.current = null;
      setWatchedScreenShareId(null);
      setScreenShareState("idle");
      setScreenShareAudioPublished(false);
      setScreenShareSourceLabel(null);
      setScreenShareSourceKind(null);
      setScreenShareSettingsPending(false);
      setScreenShareError(null);
      return screenStop;
    },
    [audioOutput, remoteAudio, soundboardAudio],
  );

  const clearParticipantSounds = useCallback(
    (participantId: string, eventId?: string) => {
      const current = soundActivities.current.get(participantId) ?? [];
      const removed = eventId
        ? current.filter((activity) => activity.eventId === eventId)
        : current;
      removed.forEach((activity) => {
        const timer = soundActivityTimers.current.get(activity.eventId);
        if (timer !== undefined) window.clearTimeout(timer);
        soundActivityTimers.current.delete(activity.eventId);
      });
      const next = eventId
        ? current.filter((activity) => activity.eventId !== eventId)
        : [];
      if (next.length > 0) soundActivities.current.set(participantId, next);
      else soundActivities.current.delete(participantId);
      if (participantId === user.id) setActiveLocalSoundCount(next.length);
      const room = roomRef.current;
      if (room) refreshParticipants(room);
      else {
        setParticipants((participants) =>
          participants.map((participant) =>
            participant.id === participantId
              ? { ...participant, activeSounds: next }
              : participant,
          ),
        );
      }
    },
    [refreshParticipants, user.id],
  );

  const addParticipantSound = useCallback(
    (
      participantId: string,
      eventId: string,
      sound: SoundboardCatalogController["sounds"][number],
      scheduleExpiry = true,
    ) => {
      const activity: SoundboardActivity = {
        eventId,
        soundId: sound.id,
        label: sound.label,
        emoji: sound.emoji,
        startedAt: Date.now(),
      };
      const current = soundActivities.current.get(participantId) ?? [];
      const next = clampSoundboardActivities([...current, activity]);
      const retainedEventIds = new Set(next.map((item) => item.eventId));
      current
        .filter((item) => !retainedEventIds.has(item.eventId))
        .forEach((item) => {
          const timer = soundActivityTimers.current.get(item.eventId);
          if (timer !== undefined) window.clearTimeout(timer);
          soundActivityTimers.current.delete(item.eventId);
        });
      soundActivities.current.set(participantId, next);
      if (participantId === user.id) setActiveLocalSoundCount(next.length);
      if (scheduleExpiry) {
        const timer = window.setTimeout(
          () => clearParticipantSounds(participantId, eventId),
          sound.durationMs + 250,
        );
        soundActivityTimers.current.set(eventId, timer);
      }
      const room = roomRef.current;
      if (room) refreshParticipants(room);
      else {
        setParticipants((participants) =>
          participants.map((participant) =>
            participant.id === participantId
              ? {
                  ...participant,
                  activeSounds: clampSoundboardActivities([
                    ...participant.activeSounds,
                    activity,
                  ]),
                }
              : participant,
          ),
        );
      }
    },
    [clearParticipantSounds, refreshParticipants, user.id],
  );

  const bindRoomEvents = useCallback(
    (room: Room) => {
      const isCurrentRoom = () => roomRef.current === room;
      const effectsReady = () =>
        isCurrentRoom() && effectReadyRoomsRef.current.has(room);
      const sync = () => {
        if (isCurrentRoom()) refreshParticipants(room);
      };
      const participantName = (participant: RemoteParticipant) =>
        participant.name?.trim() || participant.identity;
      const shareKey = (participant: RemoteParticipant) =>
        readScreenShareCompanion(participant)
          ? `companion:${participant.identity}`
          : `participant:${participant.identity}`;
      const emitRemoteShare = (
        participant: RemoteParticipant,
        active: boolean,
      ) => {
        if (!effectsReady()) return;
        const key = shareKey(participant);
        if (active) {
          if (remoteShareKeysRef.current.has(key)) return;
          remoteShareKeysRef.current.add(key);
        } else {
          if (!remoteShareKeysRef.current.delete(key)) return;
        }
        emitCommunicationEffect({
          type: active ? "screen-share-started" : "screen-share-stopped",
          actor: "remote",
          displayName: participantName(participant),
        });
      };
      room
        .on(RoomEvent.ParticipantConnected, (participant) => {
          sync();
          if (!effectsReady()) return;
          if (readScreenShareCompanion(participant)) {
            emitRemoteShare(participant, true);
            return;
          }
          emitCommunicationEffect({
            type: "voice-remote-joined",
            participantId: participant.identity,
            displayName: participantName(participant),
          });
        })
        .on(RoomEvent.ParticipantDisconnected, (participant) => {
          sync();
          if (!effectsReady()) return;
          if (readScreenShareCompanion(participant)) {
            emitRemoteShare(participant, false);
            return;
          }
          emitRemoteShare(participant, false);
          emitCommunicationEffect({
            type: "voice-remote-left",
            participantId: participant.identity,
            displayName: participantName(participant),
          });
        })
        .on(RoomEvent.ActiveSpeakersChanged, sync)
        .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
          if (isCurrentRoom() && participant.isLocal) {
            setConnectionQuality(normalizeVoiceConnectionQuality(quality));
          }
        })
        .on(RoomEvent.TrackMuted, (publication, participant) => {
          if (
            publication.trackName === SOUNDBOARD_TRACK_NAME &&
            !participant.isLocal
          ) {
            const track = soundboardTracks.current.get(participant.identity);
            if (track) remoteAudio.setTrackMuted(track, true);
          }
          sync();
        })
        .on(RoomEvent.TrackUnmuted, (publication, participant) => {
          if (
            publication.trackName === SOUNDBOARD_TRACK_NAME &&
            !participant.isLocal
          ) {
            const track = soundboardTracks.current.get(participant.identity);
            if (track) remoteAudio.setTrackMuted(track, false);
          }
          sync();
        })
        .on(
          RoomEvent.TrackPublished,
          (
            publication: RemoteTrackPublication,
            participant: RemoteParticipant,
          ) => {
            if (isScreenShareSource(publication.source)) {
              const companion = readScreenShareCompanion(participant);
              const locallyPresented = companion?.ownerUserId === user.id;
              publication.setSubscribed(
                locallyPresented &&
                  publication.source === Track.Source.ScreenShare,
              );
            }
            if (publication.source === Track.Source.ScreenShare) {
              emitRemoteShare(participant, true);
            }
            sync();
          },
        )
        .on(
          RoomEvent.TrackUnpublished,
          (
            publication: RemoteTrackPublication,
            participant: RemoteParticipant,
          ) => {
            if (publication.source === Track.Source.ScreenShare) {
              emitRemoteShare(participant, false);
            }
            sync();
          },
        )
        .on(RoomEvent.LocalTrackPublished, sync)
        .on(RoomEvent.LocalTrackUnpublished, sync)
        .on(
          RoomEvent.TrackSubscribed,
          (
            track,
            publication: RemoteTrackPublication,
            participant: RemoteParticipant,
          ) => {
            if (!isCurrentRoom()) return;
            if (isScreenShareSource(publication.source)) {
              const companion = readScreenShareCompanion(participant);
              if (companion?.ownerUserId === user.id) {
                publication.setSubscribed(
                  publication.source === Track.Source.ScreenShare,
                );
                if (publication.source === Track.Source.ScreenShare) sync();
                return;
              }
              const shareId = readScreenShareCompanion(participant)
                ? participant.identity
                : `${participant.identity}:screen`;
              if (shareId !== watchedScreenShareIdRef.current) {
                publication.setSubscribed(false);
                return;
              }
            }
            const isSoundboardTrack =
              publication.trackName === SOUNDBOARD_TRACK_NAME;
            const companion = readScreenShareCompanion(participant);
            const screenOwnerId = companion?.ownerUserId;
            const isScreenShareAudio =
              publication.source === Track.Source.ScreenShareAudio;
            const participantVolume =
              participantVolumes.current.get(
                screenOwnerId ?? participant.identity,
              ) ?? 1;
            const volume = isSoundboardTrack
              ? soundboardVolumeRef.current * participantVolume
              : isScreenShareAudio
                ? participantVolume
                : undefined;
            remoteAudio.attach(track, volume);
            if (isSoundboardTrack && track.kind === Track.Kind.Audio) {
              const soundboardTrack = track as RemoteAudioTrack;
              soundboardTracks.current.set(
                participant.identity,
                soundboardTrack,
              );
              remoteAudio.setTrackMuted(soundboardTrack, publication.isMuted);
            }
            if (
              isScreenShareAudio &&
              screenOwnerId &&
              track.kind === Track.Kind.Audio
            ) {
              screenShareTracks.current.set(
                screenOwnerId,
                track as RemoteAudioTrack,
              );
            }
            sync();
          },
        )
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          if (!isCurrentRoom()) return;
          remoteAudio.detach(track);
          soundboardTracks.current.forEach((candidate, participantId) => {
            if (candidate === track)
              soundboardTracks.current.delete(participantId);
          });
          screenShareTracks.current.forEach((candidate, participantId) => {
            if (candidate === track)
              screenShareTracks.current.delete(participantId);
          });
          sync();
        })
        .on(RoomEvent.Reconnecting, () => {
          if (isCurrentRoom()) {
            setStatus("reconnecting");
            if (effectsReady()) {
              emitCommunicationEffect({ type: "signal-interrupted" });
            }
          }
        })
        .on(RoomEvent.Reconnected, () => {
          if (isCurrentRoom()) {
            setStatus("connected");
            if (effectsReady()) {
              emitCommunicationEffect({ type: "signal-restored" });
            }
          }
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, (playing) => {
          if (isCurrentRoom()) setAudioPlaybackBlocked(!playing);
        })
        .on(RoomEvent.MediaDevicesChanged, () => {
          if (isCurrentRoom()) void refreshDevices();
        })
        .on(RoomEvent.MediaDevicesError, (mediaError) => {
          if (!isCurrentRoom()) return;
          if (room.localParticipant.lastCameraError === mediaError) {
            setCameraDeviceError(
              "Bakbak could not use that camera. Check camera permission and whether another app is using it.",
            );
          } else {
            setInputDeviceError(
              "Bakbak could not use that microphone. Check macOS Privacy settings.",
            );
          }
        })
        .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
          if (!isCurrentRoom() || topic !== "bakbak-soundboard") return;
          const event = parseSoundEvent(payload);
          if (
            !event ||
            !participant ||
            hasSeenSoundEvent(event, seenSoundEvents.current)
          )
            return;
          seenSoundEvents.current.add(event.eventId);
          if (event.type === SOUND_STOP_EVENT_TYPE) {
            const soundboardTrack = soundboardTracks.current.get(
              participant.identity,
            );
            if (soundboardTrack) {
              remoteAudio.setTrackMuted(soundboardTrack, true);
            }
            clearParticipantSounds(participant.identity);
            return;
          }
          if (event.type !== SOUND_PLAY_EVENT_TYPE) return;
          const sound = soundboardRef.current.sounds.find(
            (item) => item.id === event.soundId,
          );
          if (sound)
            addParticipantSound(participant.identity, event.eventId, sound);
        })
        .on(RoomEvent.Disconnected, () => {
          if (roomRef.current !== room) return;
          if (effectReadyRoomsRef.current.has(room)) {
            emitCommunicationEffect({ type: "signal-interrupted" });
          }
          roomRef.current = null;
          remoteShareKeysRef.current.clear();
          void resetVoiceMedia();
          setStatus("disconnected");
          setChannel(null);
        });
    },
    [
      refreshDevices,
      refreshParticipants,
      remoteAudio,
      resetVoiceMedia,
      addParticipantSound,
      clearParticipantSounds,
      emitCommunicationEffect,
      user.id,
    ],
  );

  const disconnectCurrentRoom = useCallback(
    async ({
      preserveJoinState = false,
      preserveLocalControls = false,
    }: {
      preserveJoinState?: boolean;
      preserveLocalControls?: boolean;
    } = {}) => {
      const room = roomRef.current;
      roomRef.current = null;
      remoteShareKeysRef.current.clear();
      localScreenShareLiveRef.current = false;
      const screenStop = resetVoiceMedia(preserveLocalControls);
      if (!preserveJoinState) {
        setStatus("disconnected");
        setChannel(null);
      }
      setError(null);
      setInputDeviceError(null);
      setMicrophoneProcessingError(null);
      dismissOutputDeviceError();
      setCameraDeviceError(null);
      await screenStop;
      if (room) await room.disconnect();
    },
    [dismissOutputDeviceError, resetVoiceMedia],
  );

  const leave = useCallback(
    async (reason: VoiceLeaveReason = "user") => {
      const announceLeave =
        reason === "user" &&
        (status === "connected" || status === "reconnecting");
      joinOperationRef.current += 1;
      discardPreparedJoin();
      stopJoiningMicrophone(joiningMicrophoneRef);
      await disconnectCurrentRoom();
      if (announceLeave) {
        emitCommunicationEffect({ type: "voice-self-left" });
      }
    },
    [
      discardPreparedJoin,
      disconnectCurrentRoom,
      emitCommunicationEffect,
      status,
    ],
  );

  const join = useCallback(
    async (nextChannel: Channel) => {
      if (nextChannel.kind !== "voice") return;
      const joinOperation = joinOperationRef.current + 1;
      joinOperationRef.current = joinOperation;
      playbackOperationRef.current += 1;
      const isCurrentJoin = () => joinOperationRef.current === joinOperation;
      const timing = createVoiceJoinTiming(mode === "live");
      stopJoiningMicrophone(joiningMicrophoneRef);

      setChannel(nextChannel);
      setStatus("connecting");
      setJoinStage("authorizing");
      setError(null);
      setInputDeviceError(null);
      setMicrophoneProcessingError(null);
      dismissOutputDeviceError();
      setCameraDeviceError(null);
      setAudioPlaybackBlocked(false);

      if (mode === "mock") {
        await disconnectCurrentRoom({ preserveJoinState: true });
        if (!isCurrentJoin()) return;
        setJoinStage("connecting");
        await new Promise((resolve) => window.setTimeout(resolve, 420));
        if (!isCurrentJoin()) return;
        setParticipants([
          {
            id: user.id,
            displayName: user.displayName,
            isLocal: true,
            isSpeaking: false,
            isMuted: false,
            volume: 1,
            joinedAt: new Date().toISOString(),
            cameraEnabled: false,
            cameraTrack: null,
            activeSounds: [],
          },
          {
            id: "user-mira",
            displayName: "Mira",
            isLocal: false,
            isSpeaking: true,
            isMuted: false,
            volume: 0.82,
            joinedAt: new Date(Date.now() - 95_000).toISOString(),
            cameraEnabled: false,
            cameraTrack: null,
            activeSounds: [],
          },
          {
            id: "user-jo",
            displayName: "Jo",
            isLocal: false,
            isSpeaking: false,
            isMuted: true,
            volume: 0.72,
            joinedAt: new Date(Date.now() - 42_000).toISOString(),
            cameraEnabled: false,
            cameraTrack: null,
            activeSounds: [],
          },
        ]);
        setConnectionQuality("excellent");
        setStatus("connected");
        setJoinStage(null);
        emitCommunicationEffect({
          type: "voice-self-joined",
          channelName: nextChannel.name,
        });
        return;
      }

      const prepared = preparedJoinRef.current;
      let preparedForJoin: PreparedVoiceJoin | null = null;
      if (prepared?.channelId === nextChannel.id) {
        preparedForJoin = prepared;
        preparedJoinRef.current = null;
        prepareOperationRef.current += 1;
      } else if (prepared !== null) {
        discardPreparedJoin();
      }
      if (prepareTimerRef.current !== null) {
        window.clearTimeout(prepareTimerRef.current);
        prepareTimerRef.current = null;
      }
      scheduledPrepareChannelRef.current = null;

      const tokenPromise = preparedForJoin
        ? preparedForJoin.tokenResult.then((result) => {
            if (!result.ok) throw result.error;
            if (!isPreparedVoiceTokenUsable(result.value, Date.now())) {
              return requestLiveKitToken(nextChannel.id, "voice");
            }
            return result.value;
          })
        : requestLiveKitToken(nextChannel.id, "voice");
      void tokenPromise.catch(() => undefined);

      const currentRoom = roomRef.current;
      let reusableMicrophone = readLocalMicrophoneTrack(currentRoom);
      let microphonePromise: Promise<{
        track: LocalAudioTrack | null;
        error: unknown;
        processingError: string | null;
      }> | null =
        currentRoom === null
          ? acquireMicrophoneTrack(
              selectedInputId,
              microphoneProcessingPreferencesRef.current,
              isCurrentJoin,
              joiningMicrophoneRef,
              timing.mark,
            )
          : null;

      if (currentRoom && reusableMicrophone) {
        try {
          await currentRoom.localParticipant.unpublishTrack(
            reusableMicrophone as unknown as MediaStreamTrack,
            false,
          );
        } catch {
          reusableMicrophone = null;
        }
      }

      try {
        await disconnectCurrentRoom({
          preserveJoinState: true,
          preserveLocalControls: currentRoom !== null,
        });
      } catch {
        if (isCurrentJoin()) joinOperationRef.current += 1;
        stopJoiningMicrophone(joiningMicrophoneRef);
        reusableMicrophone?.stop();
        void preparedForJoin?.room.disconnect().catch(() => undefined);
        setStatus("error");
        setJoinStage(null);
        setError(
          "Bakbak could not close the previous voice room. Try joining again.",
        );
        emitCommunicationEffect({ type: "signal-interrupted" });
        timing.finish("error");
        return;
      }
      if (!isCurrentJoin()) {
        stopJoiningMicrophone(joiningMicrophoneRef);
        reusableMicrophone?.stop();
        void preparedForJoin?.room.disconnect().catch(() => undefined);
        return;
      }

      if (reusableMicrophone) {
        timing.mark("microphoneCapture");
        timing.mark("microphoneProcessing");
        joiningMicrophoneRef.current = reusableMicrophone;
        microphonePromise = Promise.resolve({
          track: reusableMicrophone,
          error: null,
          processingError: null,
        });
      } else if (microphonePromise === null) {
        microphonePromise = acquireMicrophoneTrack(
          selectedInputId,
          microphoneProcessingPreferencesRef.current,
          isCurrentJoin,
          joiningMicrophoneRef,
          timing.mark,
        );
      }

      let joiningRoom: Room | null = preparedForJoin?.room ?? null;
      let attemptedRelay = false;
      try {
        const response = await tokenPromise;
        timing.mark("authorization");
        if (!isCurrentJoin()) {
          stopJoiningMicrophone(joiningMicrophoneRef);
          void joiningRoom?.disconnect().catch(() => undefined);
          return;
        }
        setJoinStage("connecting");

        const createJoiningRoom = (candidate?: Room) => {
          const room =
            candidate ?? new Room({ adaptiveStream: true, dynacast: true });
          roomRef.current = room;
          bindRoomEvents(room);
          return room;
        };

        let room = createJoiningRoom(preparedForJoin?.room);
        joiningRoom = room;
        const preferRelay = relayPreferredUntilRef.current > Date.now();
        let connectedWithRelay = preferRelay;
        try {
          attemptedRelay = preferRelay;
          await connectVoiceRoom(room, response, preferRelay);
        } catch (initialError) {
          if (!isPeerConnectionFailure(initialError) || !isCurrentJoin()) {
            throw initialError;
          }

          const retryWithRelay = !preferRelay;
          attemptedRelay ||= retryWithRelay;
          if (roomRef.current === room) roomRef.current = null;
          await room.disconnect().catch(() => undefined);
          if (!isCurrentJoin()) return;

          room = createJoiningRoom();
          joiningRoom = room;
          connectedWithRelay = retryWithRelay;
          await connectVoiceRoom(room, response, retryWithRelay);
        }
        timing.mark("connection");
        relayPreferredUntilRef.current = connectedWithRelay
          ? Date.now() + RELAY_PREFERENCE_DURATION_MS
          : 0;
        if (connectedWithRelay) {
          saveRelayPreference(
            appConfig.livekitUrl,
            relayPreferredUntilRef.current,
          );
        } else {
          clearRelayPreference(appConfig.livekitUrl);
        }
        if (!isCurrentJoin() || roomRef.current !== room) {
          void room.disconnect();
          return;
        }

        setJoinStage("microphone");
        const publishMicrophone = (async () => {
          const result = await microphonePromise;
          if (!result.track) throw result.error;
          setMicrophoneProcessingError(result.processingError);
          if (!isCurrentJoin() || roomRef.current !== room) {
            result.track.stop();
            return;
          }
          if (mutedRef.current && !result.track.isMuted) {
            await result.track.mute();
          } else if (!mutedRef.current && result.track.isMuted) {
            await result.track.unmute();
          }
          await room.localParticipant.publishTrack(
            result.track as unknown as MediaStreamTrack,
            {
              name: SPEECH_MICROPHONE_TRACK_NAME,
              source: Track.Source.Microphone,
            },
          );
          if (joiningMicrophoneRef.current === result.track) {
            joiningMicrophoneRef.current = null;
          }
          timing.mark("microphonePublication");
        })();
        const prepareOutput = (async () => {
          if (outputSelectionSupported) {
            try {
              await audioOutput.setDevice(selectedOutputId);
              await remoteAudio.setDevice(selectedOutputId);
              const outputResult = await switchAudioOutput(
                room,
                selectedOutputId,
              );
              if (!outputResult.ok) throw new Error(outputResult.message);
            } catch {
              showOutputDeviceError(
                "Bakbak joined using system output because the selected speaker was unavailable.",
              );
            }
          }
          await audioOutput.start().catch(() => undefined);
          timing.mark("outputRouting");
        })();
        const prepareSoundboard = soundboardAudio
          .ensurePublished(room.localParticipant)
          .catch(() => undefined)
          .then(() => timing.mark("soundboard"));

        await publishMicrophone;
        if (!isCurrentJoin() || roomRef.current !== room) return;
        setJoinStage("soundboard");
        await Promise.all([prepareOutput, prepareSoundboard]);
        if (!isCurrentJoin() || roomRef.current !== room) return;

        remoteAudio.setMuted(deafenedRef.current);
        soundboardAudio.setDeafened(deafenedRef.current);
        refreshParticipants(room);
        remoteShareKeysRef.current.clear();
        room.remoteParticipants.forEach((participant) => {
          const companion = readScreenShareCompanion(participant);
          if (companion) {
            remoteShareKeysRef.current.add(`companion:${participant.identity}`);
          } else if (
            participant.getTrackPublication(Track.Source.ScreenShare)
          ) {
            remoteShareKeysRef.current.add(
              `participant:${participant.identity}`,
            );
          }
        });
        effectReadyRoomsRef.current.add(room);
        setConnectionQuality(
          normalizeVoiceConnectionQuality(
            room.localParticipant.connectionQuality,
          ),
        );
        setStatus("connected");
        setJoinStage(null);
        setAudioPlaybackBlocked(!room.canPlaybackAudio);
        emitCommunicationEffect({
          type: "voice-self-joined",
          channelName: nextChannel.name,
        });
        timing.finish("connected");
        void refreshDevices();
      } catch (caught) {
        stopJoiningMicrophone(joiningMicrophoneRef);
        if (!isCurrentJoin()) {
          void joiningRoom?.disconnect();
          return;
        }

        const room = joiningRoom;
        if (roomRef.current === room) roomRef.current = null;
        void resetVoiceMedia();
        void room?.disconnect();
        setStatus("error");
        setJoinStage(null);
        setError(describeVoiceConnectionError(caught, attemptedRelay));
        emitCommunicationEffect({ type: "signal-interrupted" });
        timing.finish("error");
      }
    },
    [
      bindRoomEvents,
      audioOutput,
      discardPreparedJoin,
      disconnectCurrentRoom,
      dismissOutputDeviceError,
      emitCommunicationEffect,
      mode,
      remoteAudio,
      refreshDevices,
      refreshParticipants,
      resetVoiceMedia,
      outputSelectionSupported,
      selectedInputId,
      selectedOutputId,
      showOutputDeviceError,
      soundboardAudio,
      user.displayName,
      user.id,
    ],
  );

  const toggleMute = useCallback(async () => {
    if (status !== "connected") return;
    const room = roomRef.current;
    const nextMuted = !mutedRef.current;
    if (room) {
      const publication = readLocalMicrophonePublication(room.localParticipant);
      if (!publication?.track) {
        setInputDeviceError(
          "Bakbak could not find the active microphone track. Rejoin voice and try again.",
        );
        return;
      }
      try {
        if (nextMuted) await publication.mute();
        else await publication.unmute();
      } catch {
        if (roomRef.current === room) {
          setInputDeviceError(
            nextMuted
              ? "Bakbak could not mute the microphone. Check the active input device and try again."
              : "Bakbak could not unmute the microphone. Check microphone permission and the selected input device.",
          );
        }
        return;
      }
      if (roomRef.current !== room) return;
      setInputDeviceError(null);
      refreshParticipants(room);
    } else {
      setParticipants((current) =>
        current.map((participant) =>
          participant.isLocal
            ? { ...participant, isMuted: nextMuted }
            : participant,
        ),
      );
    }
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
    emitCommunicationEffect({
      type: nextMuted ? "microphone-muted" : "microphone-unmuted",
    });
  }, [emitCommunicationEffect, refreshParticipants, status]);

  const toggleDeafen = useCallback(async () => {
    if (status !== "connected") return;
    const operationId = playbackOperationRef.current + 1;
    playbackOperationRef.current = operationId;
    const room = roomRef.current;
    const nextDeafened = !deafenedRef.current;
    deafenedRef.current = nextDeafened;
    setDeafened(nextDeafened);

    const result = await setAudioDeafened(
      nextDeafened,
      audioPlaybackBlocked,
      room,
      {
        isCurrent: () =>
          playbackOperationRef.current === operationId &&
          roomRef.current === room,
        remoteAudio,
        soundPlayback: soundboardAudio,
      },
    );
    if (
      !result ||
      playbackOperationRef.current !== operationId ||
      roomRef.current !== room
    )
      return;

    if (result.ok) {
      setAudioPlaybackBlocked(false);
      setError(null);
      return;
    }

    setAudioPlaybackBlocked(true);
    setError(result.message);
  }, [audioPlaybackBlocked, remoteAudio, soundboardAudio, status]);

  const resumeAudio = useCallback(async () => {
    const room = roomRef.current;
    if (status !== "connected" || !room || deafenedRef.current) return;

    const operationId = playbackOperationRef.current + 1;
    playbackOperationRef.current = operationId;
    const result = await resumeAudioPlayback(room);
    if (
      playbackOperationRef.current !== operationId ||
      roomRef.current !== room
    )
      return;
    remoteAudio.setMuted(deafenedRef.current);
    if (result.ok) {
      setAudioPlaybackBlocked(false);
      setError(null);
      return;
    }

    setAudioPlaybackBlocked(true);
    setError(result.message);
  }, [remoteAudio, status]);

  const setParticipantVolume = useCallback(
    (participantId: string, volume: number) => {
      const safeVolume = Math.max(0, Math.min(1, volume));
      participantVolumes.current.set(participantId, safeVolume);
      roomRef.current?.remoteParticipants
        .get(participantId)
        ?.setVolume(safeVolume);
      const soundboardTrack = soundboardTracks.current.get(participantId);
      if (soundboardTrack) {
        remoteAudio.setVolume(
          soundboardTrack,
          soundboardVolumeRef.current * safeVolume,
        );
      }
      const screenShareTrack = screenShareTracks.current.get(participantId);
      if (screenShareTrack) {
        remoteAudio.setVolume(screenShareTrack, safeVolume);
      }
      setParticipants((current) =>
        current.map((participant) =>
          participant.id === participantId
            ? { ...participant, volume: safeVolume }
            : participant,
        ),
      );
    },
    [remoteAudio],
  );

  const setInputDevice = useCallback(
    async (deviceId: string) => {
      if (status === "connecting" || status === "reconnecting") return;

      const room = roomRef.current;
      if (!room) {
        setSelectedInputId(deviceId);
        setInputDeviceError(null);
        return;
      }

      const result = await switchAudioInput(room, deviceId);
      if (roomRef.current !== room) return;
      if (!result.ok) {
        setInputDeviceError(result.message);
        return;
      }

      if (!muted) {
        await room.localParticipant.setMicrophoneEnabled(
          true,
          microphoneCaptureOptions(deviceId),
        );
        if (roomRef.current !== room) return;
      }

      setSelectedInputId(deviceId);
      setInputDeviceError(null);
    },
    [muted, status],
  );

  const updateMicrophoneProcessing = useCallback(
    async (preferences: MicrophoneProcessingPreferences) => {
      microphoneProcessingPreferencesRef.current = preferences;
      setEnhancedNoiseSuppressionState(preferences.enhancedNoiseSuppression);
      setVoiceEffectState(preferences.voiceEffect);
      setMicrophoneProcessingError(null);

      const track =
        readLocalMicrophoneTrack(roomRef.current) ??
        joiningMicrophoneRef.current;
      if (!track || mode === "mock") return;

      const existingProcessor = track.getProcessor();
      if (isBakbakMicrophoneProcessor(existingProcessor)) {
        existingProcessor.setPreferences(preferences);
        return;
      }
      if (!needsMicrophoneProcessor(preferences)) return;
      if (!isMicrophoneProcessingSupported()) {
        setMicrophoneProcessingError(MICROPHONE_PROCESSING_UNAVAILABLE);
        return;
      }
      try {
        const processor = await attachMicrophoneProcessor(track, preferences);
        processor?.setPreferences(microphoneProcessingPreferencesRef.current);
      } catch {
        if (
          track === readLocalMicrophoneTrack(roomRef.current) ||
          track === joiningMicrophoneRef.current
        ) {
          setMicrophoneProcessingError(MICROPHONE_PROCESSING_UNAVAILABLE);
        }
      }
    },
    [mode],
  );

  const setEnhancedNoiseSuppression = useCallback(
    (enabled: boolean) =>
      updateMicrophoneProcessing({
        ...microphoneProcessingPreferencesRef.current,
        enhancedNoiseSuppression: enabled,
      }),
    [updateMicrophoneProcessing],
  );

  const setVoiceEffect = useCallback(
    (effect: VoiceEffect) =>
      updateMicrophoneProcessing({
        ...microphoneProcessingPreferencesRef.current,
        voiceEffect: effect,
      }),
    [updateMicrophoneProcessing],
  );

  const setOutputDevice = useCallback(
    async (deviceId: string) => {
      if (status === "connecting" || status === "reconnecting") return;
      if (!outputSelectionSupported) {
        showOutputDeviceError(
          "This runtime supports only the system output device.",
        );
        return;
      }

      const room = roomRef.current;
      const previousId = selectedOutputId;
      try {
        await audioOutput.setDevice(deviceId);
        await remoteAudio.setDevice(deviceId);
        if (room) {
          const result = await switchAudioOutput(room, deviceId);
          if (!result.ok) throw new Error(result.message);
        }
      } catch {
        await audioOutput.setDevice(previousId).catch(() => undefined);
        await remoteAudio.setDevice(previousId).catch(() => undefined);
        if (room) void switchAudioOutput(room, previousId);
        showOutputDeviceError(
          "Bakbak couldn't switch speakers. The previous output is still active.",
        );
        return;
      }

      setSelectedOutputId(deviceId);
      dismissOutputDeviceError();
    },
    [
      audioOutput,
      dismissOutputDeviceError,
      outputSelectionSupported,
      remoteAudio,
      selectedOutputId,
      showOutputDeviceError,
      status,
    ],
  );

  const setCameraDevice = useCallback(
    async (deviceId: string) => {
      if (status === "connecting" || status === "reconnecting") return;
      const room = roomRef.current;
      if (room && cameraEnabled) {
        const result = await switchCameraInput(room, deviceId);
        if (roomRef.current !== room) return;
        if (!result.ok) {
          setCameraDeviceError(result.message);
          return;
        }
        refreshParticipants(room);
      }
      setSelectedCameraId(deviceId);
      setCameraDeviceError(null);
    },
    [cameraEnabled, refreshParticipants, status],
  );

  const toggleCamera = useCallback(async () => {
    if (status !== "connected" || cameraPending) return;
    const room = roomRef.current;
    if (!room) {
      setCameraEnabled((current) => !current);
      return;
    }

    const operationId = cameraOperationRef.current + 1;
    cameraOperationRef.current = operationId;
    const nextEnabled = !cameraEnabled;
    setCameraPending(true);
    setCameraDeviceError(null);
    try {
      const publication = await room.localParticipant.setCameraEnabled(
        nextEnabled,
        nextEnabled
          ? selectedCameraId === "default"
            ? { resolution: VideoPresets.h720.resolution }
            : {
                deviceId: selectedCameraId,
                resolution: VideoPresets.h720.resolution,
              }
          : undefined,
      );
      if (
        cameraOperationRef.current !== operationId ||
        roomRef.current !== room
      )
        return;
      if (nextEnabled && !publication) {
        throw new Error("Camera did not publish.");
      }
      setCameraEnabled(nextEnabled);
      refreshParticipants(room);
      void refreshDevices();
    } catch {
      if (
        cameraOperationRef.current === operationId &&
        roomRef.current === room
      ) {
        setCameraDeviceError(
          "Bakbak couldn't start the camera. Check permission, device availability, and whether another app is using it.",
        );
      }
    } finally {
      if (cameraOperationRef.current === operationId) setCameraPending(false);
    }
  }, [
    cameraEnabled,
    cameraPending,
    refreshDevices,
    refreshParticipants,
    selectedCameraId,
    status,
  ]);

  const startScreenShare = useCallback(
    async (
      includeAudio: boolean,
      requestedSettings: ScreenShareSettings,
      sourceId?: string | null,
    ) => {
      if (
        status !== "connected" ||
        !desktopApp ||
        !screenShareCapabilities.available ||
        (screenShareState !== "idle" && screenShareState !== "error")
      ) {
        return;
      }

      const room = roomRef.current;
      if (!room || !channel) return;
      const operationId = screenShareOperationRef.current + 1;
      screenShareOperationRef.current = operationId;
      setScreenShareState("selecting");
      setScreenShareError(null);
      setScreenShareAudioPublished(false);
      setScreenShareSourceLabel(null);
      setScreenShareSourceKind(null);
      setScreenShareSettingsPending(false);

      try {
        if (screenShareCapabilities.nativeCapture) {
          const token = await requestLiveKitToken(channel.id, "screen_share");
          if (
            screenShareOperationRef.current !== operationId ||
            roomRef.current !== room
          ) {
            return;
          }
          setScreenShareState("starting");
          const session = await startNativeScreenShare({
            serverUrl: token.serverUrl,
            token: token.token,
            includeAudio: includeAudio && screenShareCapabilities.systemAudio,
            settings: requestedSettings,
            ...(sourceId === undefined ? {} : { sourceId }),
          });
          if (
            screenShareOperationRef.current !== operationId ||
            roomRef.current !== room
          ) {
            await stopNativeScreenShare(session.sessionId).catch(
              () => undefined,
            );
            return;
          }
          screenShareSessionRef.current = session.sessionId;
          setScreenShareSourceLabel(session.sourceLabel);
          setScreenShareSourceKind(session.sourceKind);
          setScreenShareAudioPublished(session.audioPublished);
          setScreenShareSettings(session.settings);
          saveScreenShareSettings(session.settings);
          setScreenShareState("sharing");
          markLocalScreenShareStarted();
          if (includeAudio && !session.audioPublished) {
            setScreenShareError(
              "The screen is live without audio because the selected source or system did not provide it.",
            );
          }
          return;
        }

        const publication = await room.localParticipant.setScreenShareEnabled(
          true,
          {
            audio: false,
            contentHint: "detail",
            resolution: {
              width: requestedSettings.resolution * (16 / 9),
              height: requestedSettings.resolution,
              frameRate: requestedSettings.frameRate,
            },
          },
          {
            screenShareEncoding: {
              maxBitrate: screenShareBitrate(requestedSettings),
              maxFramerate: requestedSettings.frameRate,
            },
            simulcast: true,
          },
        );
        if (
          screenShareOperationRef.current !== operationId ||
          roomRef.current !== room
        ) {
          await room.localParticipant
            .setScreenShareEnabled(false)
            .catch(() => undefined);
          return;
        }
        if (!publication) throw new Error("Screen video did not publish.");
        setScreenShareState("sharing");
        setScreenShareSourceLabel("Shared screen");
        setScreenShareSourceKind("window");
        setScreenShareSettings(requestedSettings);
        saveScreenShareSettings(requestedSettings);
        markLocalScreenShareStarted();
        refreshParticipants(room);
      } catch (caught) {
        if (
          screenShareOperationRef.current !== operationId ||
          roomRef.current !== room
        ) {
          return;
        }
        setScreenShareState("error");
        setScreenShareError(describeScreenShareError(caught));
        emitCommunicationEffect({ type: "signal-interrupted" });
      }
    },
    [
      channel,
      desktopApp,
      emitCommunicationEffect,
      markLocalScreenShareStarted,
      refreshParticipants,
      screenShareCapabilities,
      screenShareState,
      status,
    ],
  );

  const updateScreenShareSettings = useCallback(
    async (requestedSettings: ScreenShareSettings) => {
      if (
        status !== "connected" ||
        !screenShareSessionRef.current ||
        screenShareSettingsPending ||
        (screenShareState !== "sharing" && screenShareState !== "paused")
      ) {
        return;
      }
      const previous = screenShareSettings;
      setScreenShareSettingsPending(true);
      setScreenShareError(null);
      try {
        const updated = await updateNativeScreenShareSettings(
          screenShareSessionRef.current,
          requestedSettings,
        );
        setScreenShareSettings(updated);
        saveScreenShareSettings(updated);
      } catch (caught) {
        setScreenShareSettings(previous);
        setScreenShareError(
          caught instanceof Error
            ? caught.message
            : "Bakbak could not apply the new screen quality.",
        );
      } finally {
        setScreenShareSettingsPending(false);
      }
    },
    [screenShareSettings, screenShareSettingsPending, screenShareState, status],
  );

  const stopScreenShare = useCallback(async () => {
    if (screenShareState === "idle" || screenShareState === "stopping") return;
    const operationId = screenShareOperationRef.current + 1;
    screenShareOperationRef.current = operationId;
    setScreenShareState("stopping");
    setScreenShareError(null);
    const sessionId = screenShareSessionRef.current;
    screenShareSessionRef.current = null;
    try {
      if (sessionId) {
        await stopNativeScreenShare(sessionId);
      } else {
        const room = roomRef.current;
        await room?.localParticipant.setScreenShareEnabled(false);
        if (room) refreshParticipants(room);
      }
    } catch {
      setScreenShareError(
        "Bakbak could not confirm the share stopped, so it closed the local session.",
      );
    } finally {
      if (screenShareOperationRef.current === operationId) {
        setScreenShareState("idle");
        setScreenShareAudioPublished(false);
        setScreenShareSourceLabel(null);
        setScreenShareSourceKind(null);
        setScreenShareSettingsPending(false);
        markLocalScreenShareStopped();
      }
    }
  }, [markLocalScreenShareStopped, refreshParticipants, screenShareState]);

  const dispatchSound = useCallback(
    async (soundId: string) => {
      if (status !== "connected")
        throw new Error("Join a voice room before sharing a sound.");
      const sound = soundboardRef.current.sounds.find(
        (item) => item.id === soundId,
      );
      if (!sound) throw new Error("That sound is no longer available.");
      if (sound.assetStatus === "error") {
        throw new Error("That sound failed to download. Retry it first.");
      }
      const localSounds = soundActivities.current.get(user.id) ?? [];
      if (hasReachedSoundLimit(localSounds.length)) {
        throw new Error(
          `Five sounds are already playing. Stop one before adding another.`,
        );
      }
      const event = createSoundPlayEvent({
        eventId: crypto.randomUUID(),
        soundId,
        sentAt: Date.now(),
      });
      seenSoundEvents.current.add(event.eventId);
      addParticipantSound(user.id, event.eventId, sound, mode === "mock");
      if (mode === "mock") return;

      const room = roomRef.current;
      if (!room) {
        clearParticipantSounds(user.id, event.eventId);
        throw new Error("Voice room disconnected before playback.");
      }
      const startOperation = soundStartOperationRef.current;
      const ensureStartIsCurrent = () => {
        if (
          soundStartOperationRef.current === startOperation &&
          roomRef.current === room
        ) {
          return;
        }
        clearParticipantSounds(user.id, event.eventId);
        throw new DOMException("Sound playback was stopped.", "AbortError");
      };
      let blob: Blob | null;
      try {
        blob = await soundboardRef.current.getBlob(soundId);
      } catch (caught) {
        clearParticipantSounds(user.id, event.eventId);
        throw caught;
      }
      if (!blob) {
        clearParticipantSounds(user.id, event.eventId);
        throw new Error("Bakbak could not download that sound.");
      }
      ensureStartIsCurrent();
      await audioOutput.start().catch(() => undefined);
      ensureStartIsCurrent();
      let playback;
      try {
        playback = await soundboardAudio.play(
          room.localParticipant,
          event.eventId,
          sound,
          blob,
        );
      } catch (caught) {
        clearParticipantSounds(user.id, event.eventId);
        throw caught;
      }
      try {
        ensureStartIsCurrent();
      } catch (caught) {
        playback.stop();
        throw caught;
      }
      const expiryTimer = window.setTimeout(
        () => clearParticipantSounds(user.id, event.eventId),
        sound.durationMs + 250,
      );
      soundActivityTimers.current.set(event.eventId, expiryTimer);
      void playback.finished.then(() =>
        clearParticipantSounds(user.id, event.eventId),
      );
      try {
        await room.localParticipant.publishData(encodeSoundEvent(event), {
          reliable: true,
          topic: "bakbak-soundboard",
        });
      } catch (caught) {
        playback.stop();
        clearParticipantSounds(user.id, event.eventId);
        throw caught;
      }
    },
    [
      addParticipantSound,
      audioOutput,
      clearParticipantSounds,
      mode,
      soundboardAudio,
      status,
      user.id,
    ],
  );

  const stopLocalSounds = useCallback(async () => {
    soundStartOperationRef.current += 1;
    soundboardAudio.cleanup();
    audioOutput.cleanup();
    clearParticipantSounds(user.id);
    if (mode === "mock") return;
    const room = roomRef.current;
    if (!room || status !== "connected") return;
    const event = createSoundStopEvent({
      eventId: crypto.randomUUID(),
      sentAt: Date.now(),
    });
    seenSoundEvents.current.add(event.eventId);
    await room.localParticipant.publishData(encodeSoundEvent(event), {
      reliable: true,
      topic: "bakbak-soundboard",
    });
  }, [
    audioOutput,
    clearParticipantSounds,
    mode,
    soundboardAudio,
    status,
    user.id,
  ]);

  const setSoundboardVolume = useCallback((volume: number) => {
    setSoundboardVolumeState(Math.max(0, Math.min(1, volume)));
  }, []);

  const watchScreenShare = useCallback((shareId: string) => {
    watchedScreenShareIdRef.current = shareId;
    setWatchedScreenShareId(shareId);
  }, []);

  const stopWatchingScreenShare = useCallback(() => {
    watchedScreenShareIdRef.current = null;
    setWatchedScreenShareId(null);
  }, []);

  useEffect(
    () => () => {
      joinOperationRef.current += 1;
      playbackOperationRef.current += 1;
      soundStartOperationRef.current += 1;
      cameraOperationRef.current += 1;
      screenShareOperationRef.current += 1;
      const screenSessionId = screenShareSessionRef.current;
      screenShareSessionRef.current = null;
      const room = roomRef.current;
      roomRef.current = null;
      if (prepareTimerRef.current !== null) {
        window.clearTimeout(prepareTimerRef.current);
      }
      if (outputDeviceErrorTimerRef.current !== null) {
        window.clearTimeout(outputDeviceErrorTimerRef.current);
      }
      prepareOperationRef.current += 1;
      const prepared = preparedJoinRef.current;
      preparedJoinRef.current = null;
      stopJoiningMicrophone(joiningMicrophoneRef);
      remoteAudio.cleanup();
      soundboardAudio.cleanup();
      audioOutput.cleanup();
      if (screenSessionId) void stopNativeScreenShare(screenSessionId);
      void prepared?.room.disconnect().catch(() => undefined);
      void room?.disconnect();
    },
    [audioOutput, remoteAudio, soundboardAudio],
  );

  return {
    status,
    joinStage,
    connectionQuality,
    channel,
    participants,
    muted,
    deafened,
    audioPlaybackBlocked,
    error,
    inputDeviceError,
    microphoneProcessingError,
    outputDeviceError,
    cameraDeviceError,
    inputDevices,
    outputDevices,
    cameraDevices,
    selectedInputId,
    selectedOutputId,
    selectedCameraId,
    enhancedNoiseSuppression,
    voiceEffect,
    microphoneProcessingSupported,
    outputSelectionSupported,
    cameraEnabled,
    cameraPending,
    screenShares,
    watchedScreenShareId,
    screenShareAvailable: desktopApp && screenShareCapabilities.available,
    screenShareAudioAvailable:
      desktopApp && screenShareCapabilities.systemAudio,
    screenShareCustomPicker: desktopApp && screenShareCapabilities.customPicker,
    screenShareUnavailableReason: screenShareCapabilities.reason,
    screenShareState,
    screenShareEnabled:
      screenShareState === "sharing" || screenShareState === "paused",
    screenSharePending:
      screenShareState === "selecting" ||
      screenShareState === "starting" ||
      screenShareState === "stopping",
    screenShareAudioPublished,
    screenShareSourceLabel,
    screenShareSourceKind,
    screenShareSettings,
    screenShareSettingsPending,
    screenShareError,
    soundboard,
    soundboardVolume,
    activeLocalSoundCount,
    maxConcurrentSounds: MAX_CONCURRENT_SOUNDS_PER_USER,
    prepareVoiceChannel,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    resumeAudio,
    setParticipantVolume,
    refreshDevices,
    setInputDevice,
    setEnhancedNoiseSuppression,
    setVoiceEffect,
    setOutputDevice,
    dismissOutputDeviceError,
    setCameraDevice,
    toggleCamera,
    startScreenShare,
    updateScreenShareSettings,
    stopScreenShare,
    watchScreenShare,
    stopWatchingScreenShare,
    dispatchSound,
    stopLocalSounds,
    setSoundboardVolume,
    updateSoundMetadata: soundboard.updateSound,
  };
}

export function isPreparedVoiceTokenUsable(
  token: Pick<LiveKitToken, "expiresAt">,
  nowTimestamp: number,
): boolean {
  if (token.expiresAt === null) return false;
  const expiresAt = Date.parse(token.expiresAt);
  return (
    Number.isFinite(expiresAt) &&
    expiresAt - nowTimestamp > VOICE_TOKEN_EXPIRY_BUFFER_MS
  );
}

function readLocalMicrophonePublication(
  participant: LocalParticipant,
): LocalTrackPublication | undefined {
  return findSpeechMicrophonePublication(
    participant.getTrackPublications() as LocalTrackPublication[],
  );
}

function readLocalMicrophoneTrack(room: Room | null): LocalAudioTrack | null {
  const track = room
    ? readLocalMicrophonePublication(room.localParticipant)?.track
    : undefined;
  return track instanceof LocalAudioTrack ? track : null;
}

function acquireMicrophoneTrack(
  deviceId: string,
  preferences: MicrophoneProcessingPreferences,
  isCurrentJoin: () => boolean,
  joiningTrackRef: { current: LocalAudioTrack | null },
  onStage: (stage: string) => void = () => undefined,
): Promise<{
  track: LocalAudioTrack | null;
  error: unknown;
  processingError: string | null;
}> {
  return createLocalAudioTrack(microphoneCaptureOptions(deviceId)).then(
    async (track) => {
      onStage("microphoneCapture");
      if (!isCurrentJoin()) {
        track.stop();
        return {
          track: null,
          error: new Error("Voice join was cancelled."),
          processingError: null,
        };
      }
      joiningTrackRef.current = track;
      let processingError: string | null = null;
      if (
        needsMicrophoneProcessor(preferences) &&
        isMicrophoneProcessingSupported()
      ) {
        try {
          await attachMicrophoneProcessor(track, preferences);
        } catch {
          processingError = MICROPHONE_PROCESSING_UNAVAILABLE;
        }
      }
      onStage("microphoneProcessing");
      if (!isCurrentJoin()) {
        if (joiningTrackRef.current === track) {
          joiningTrackRef.current = null;
        }
        track.stop();
        return {
          track: null,
          error: new Error("Voice join was cancelled."),
          processingError: null,
        };
      }
      return { track, error: null, processingError };
    },
    (error: unknown) => ({
      track: null,
      error,
      processingError: null,
    }),
  );
}

function stopJoiningMicrophone(ref: { current: LocalAudioTrack | null }): void {
  const track = ref.current;
  ref.current = null;
  track?.stop();
}

function connectVoiceRoom(
  room: Room,
  token: LiveKitToken,
  relayOnly: boolean,
): Promise<void> {
  return relayOnly
    ? room.connect(token.serverUrl, token.token, {
        rtcConfig: { iceTransportPolicy: "relay" },
        maxRetries: 0,
      })
    : room.connect(token.serverUrl, token.token);
}

function createVoiceJoinTiming(enabled: boolean) {
  const startedAt = performance.now();
  const stages: Record<string, number> = {};
  return {
    mark: (stage: string) => {
      if (enabled) {
        stages[stage] = Math.round(performance.now() - startedAt);
      }
    },
    finish(outcome: "connected" | "error") {
      if (!enabled) return;
      const snapshot = {
        outcome,
        totalMs: Math.round(performance.now() - startedAt),
        stages: { ...stages },
      } satisfies VoiceJoinTimingSnapshot;
      lastVoiceJoinTiming = snapshot;
      if (import.meta.env.DEV) {
        console.debug("[voice-join] completed", snapshot);
      }
    },
  };
}

export function isPeerConnectionFailure(error: unknown): boolean {
  if (error instanceof ConnectionError) {
    if (
      error.reason === ConnectionErrorReason.NotAllowed ||
      error.reason === ConnectionErrorReason.Cancelled
    ) {
      return false;
    }
  }

  return (
    error instanceof Error &&
    /(?:could not establish|peer.?connection|pc connection|\bice\b)/i.test(
      error.message,
    )
  );
}

export function describeVoiceConnectionError(
  error: unknown,
  attemptedRelay: boolean,
): string {
  if (attemptedRelay && isPeerConnectionFailure(error)) {
    return "Voice signaling worked, but media could not connect even through relay. Try Arc or Chrome, disable a VPN or Private Relay, or allow *.turn.livekit.cloud on TCP 443.";
  }

  return error instanceof Error ? error.message : "Voice connection failed.";
}

async function requestLiveKitToken(
  channelId: string,
  purpose: "voice" | "screen_share",
) {
  const supabase = getSupabaseClient();
  const invocation = await supabase.functions.invoke("livekit-token", {
    body: buildLiveKitTokenRequest(channelId, purpose),
  });
  if (invocation.error) throw invocation.error;
  const data: unknown = invocation.data;
  const response = parseLiveKitTokenResponse(
    typeof data === "object" && data !== null && !("url" in data)
      ? { ...data, url: appConfig.livekitUrl }
      : data,
    Date.now(),
  );
  if (!response.ok) throw new Error(response.message);
  return response.value;
}

function describeScreenShareError(error: unknown): string {
  if (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  ) {
    return "Screen sharing was not started. Choose a source and allow Screen & System Audio Recording in system settings.";
  }
  if (typeof error === "string" && error.trim()) return error;
  return error instanceof Error
    ? error.message
    : "Bakbak could not start screen sharing.";
}

interface ScreenShareCompanionMetadata {
  ownerUserId: string;
}

function readScreenShareCompanion(
  participant: Participant,
): ScreenShareCompanionMetadata | null {
  if (!participant.metadata) return null;
  try {
    const value: unknown = JSON.parse(participant.metadata);
    if (
      typeof value === "object" &&
      value !== null &&
      "participantKind" in value &&
      value.participantKind === "screen_share" &&
      "ownerUserId" in value &&
      typeof value.ownerUserId === "string" &&
      value.ownerUserId.length > 0
    ) {
      return { ownerUserId: value.ownerUserId };
    }
  } catch {
    // Participant metadata is untrusted room input. Invalid JSON is ordinary.
  }
  return null;
}

function screenShareParticipantToView(
  participant: Participant,
  metadata: ScreenShareCompanionMetadata,
  localUserId: string,
): VoiceScreenShare {
  const publication = participant.getTrackPublication(Track.Source.ScreenShare);
  return {
    id: participant.identity,
    ownerId: metadata.ownerUserId,
    displayName: participant.name || "Friend",
    isLocal: metadata.ownerUserId === localUserId,
    joinedAt: participant.joinedAt?.toISOString() ?? null,
    track: (publication?.track as VideoTrackLike | undefined) ?? null,
    audioPublished: Boolean(
      participant.getTrackPublication(Track.Source.ScreenShareAudio),
    ),
    paused: Boolean(publication?.isMuted),
  };
}

function regularParticipantScreenShareToView(
  participant: Participant,
  local: boolean,
): VoiceScreenShare | null {
  const publication = participant.getTrackPublication(Track.Source.ScreenShare);
  if (!publication) return null;
  return {
    id: `${participant.identity}:screen`,
    ownerId: participant.identity,
    displayName: participant.name || participant.identity || "Friend",
    isLocal: local,
    joinedAt: participant.joinedAt?.toISOString() ?? null,
    track: (publication.track as VideoTrackLike | undefined) ?? null,
    audioPublished: Boolean(
      participant.getTrackPublication(Track.Source.ScreenShareAudio),
    ),
    paused: Boolean(publication.isMuted),
  };
}

function isScreenShareSource(source: Track.Source): boolean {
  return (
    source === Track.Source.ScreenShare ||
    source === Track.Source.ScreenShareAudio
  );
}

function participantToView(
  participant: Participant,
  isLocal: boolean,
  activeSounds: SoundboardActivity[],
): VoiceParticipant {
  const cameraPublication = participant.getTrackPublication(
    Track.Source.Camera,
  );
  const microphonePublication = findSpeechMicrophonePublication(
    participant.getTrackPublications(),
  );
  return {
    id: participant.identity,
    displayName: participant.name || participant.identity || "Friend",
    isLocal,
    isSpeaking: participant.isSpeaking,
    isMuted: microphonePublication?.isMuted ?? true,
    volume: isLocal ? 1 : ((participant as RemoteParticipant).getVolume() ?? 1),
    joinedAt: participant.joinedAt?.toISOString() ?? null,
    cameraEnabled: participant.isCameraEnabled,
    cameraTrack:
      (cameraPublication?.track as VideoTrackLike | undefined) ?? null,
    activeSounds,
  };
}
