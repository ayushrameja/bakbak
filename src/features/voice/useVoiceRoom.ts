import {
  ConnectionError,
  ConnectionErrorReason,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  supportsAudioOutputSelection,
  type Participant,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { appConfig } from "../../lib/env";
import { getSupabaseClient } from "../../lib/supabase";
import type { AppUser, Channel, DataMode } from "../../lib/types";
import {
  availableDeviceId,
  loadDevicePreferences,
  saveDevicePreferences,
} from "../settings/device-preferences";
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
import { RemoteAudioRenderer } from "./remote-audio";
import {
  buildLiveKitTokenRequest,
  parseLiveKitTokenResponse,
} from "./token-request";
import {
  getScreenShareCapabilities,
  isDesktopApp,
  listenForScreenShareLifecycle,
  startScreenShare as startNativeScreenShare,
  stopScreenShare as stopNativeScreenShare,
  type ScreenShareCapabilities,
  type ScreenShareLifecycleState,
} from "./screen-share-service";
import { chooseFeaturedScreenShare } from "./screen-share-selection";

export type VoiceConnectionStatus =
  "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

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
}

export interface VideoTrackLike {
  attach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element: HTMLMediaElement): HTMLMediaElement;
}

interface VoiceRoomState {
  status: VoiceConnectionStatus;
  channel: Channel | null;
  participants: VoiceParticipant[];
  muted: boolean;
  deafened: boolean;
  audioPlaybackBlocked: boolean;
  error: string | null;
  inputDeviceError: string | null;
  outputDeviceError: string | null;
  cameraDeviceError: string | null;
  inputDevices: MediaDeviceInfo[];
  outputDevices: MediaDeviceInfo[];
  cameraDevices: MediaDeviceInfo[];
  selectedInputId: string;
  selectedOutputId: string;
  selectedCameraId: string;
  outputSelectionSupported: boolean;
  cameraEnabled: boolean;
  cameraPending: boolean;
  screenShares: VoiceScreenShare[];
  selectedScreenShareId: string | null;
  screenShareAvailable: boolean;
  screenShareAudioAvailable: boolean;
  screenShareUnavailableReason: string | null;
  screenShareState: ScreenShareLifecycleState;
  screenShareEnabled: boolean;
  screenSharePending: boolean;
  screenShareAudioPublished: boolean;
  screenShareSourceLabel: string | null;
  screenShareError: string | null;
  soundboard: SoundboardCatalogController;
  soundboardVolume: number;
  activeLocalSoundCount: number;
  join: (channel: Channel) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  resumeAudio: () => Promise<void>;
  setParticipantVolume: (participantId: string, volume: number) => void;
  setInputDevice: (deviceId: string) => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  setCameraDevice: (deviceId: string) => Promise<void>;
  toggleCamera: () => Promise<void>;
  startScreenShare: (includeAudio: boolean) => Promise<void>;
  stopScreenShare: () => Promise<void>;
  selectScreenShare: (shareId: string) => void;
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
): VoiceRoomState {
  const [initialPreferences] = useState(loadDevicePreferences);
  const [status, setStatus] = useState<VoiceConnectionStatus>("disconnected");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputDeviceError, setInputDeviceError] = useState<string | null>(null);
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
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraPending, setCameraPending] = useState(false);
  const [screenShares, setScreenShares] = useState<VoiceScreenShare[]>([]);
  const [selectedScreenShareId, setSelectedScreenShareId] = useState<
    string | null
  >(null);
  const [screenShareCapabilities, setScreenShareCapabilities] =
    useState<ScreenShareCapabilities>({
      available: false,
      nativeCapture: false,
      systemAudio: false,
      reason: "Screen sharing is available in the installed desktop app.",
    });
  const [screenShareState, setScreenShareState] =
    useState<ScreenShareLifecycleState>("idle");
  const [screenShareAudioPublished, setScreenShareAudioPublished] =
    useState(false);
  const [screenShareSourceLabel, setScreenShareSourceLabel] = useState<
    string | null
  >(null);
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
  const outputSelectionSupported =
    audioOutput.supported && supportsAudioOutputSelection();
  const roomRef = useRef<Room | null>(null);
  const deafenedRef = useRef(false);
  const joinOperationRef = useRef(0);
  const playbackOperationRef = useRef(0);
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

  const desktopApp = isDesktopApp();

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
    if (!navigator.mediaDevices) return;
    try {
      const [inputs, outputs, cameras] = await Promise.all([
        Room.getLocalDevices("audioinput", false),
        Room.getLocalDevices("audiooutput", false),
        Room.getLocalDevices("videoinput", false),
      ]);
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
    });
  }, [selectedCameraId, selectedInputId, selectedOutputId, soundboardVolume]);

  useEffect(() => {
    soundboardRef.current = soundboard;
  }, [soundboard]);

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
          setScreenShareCapabilities({
            available:
              typeof navigator.mediaDevices?.getDisplayMedia === "function",
            nativeCapture: false,
            systemAudio: false,
            reason:
              "Matched system audio is unavailable. Video-only sharing may still work.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [desktopApp]);

  useEffect(() => {
    setSelectedScreenShareId((current) =>
      chooseFeaturedScreenShare(current, screenShares),
    );
  }, [screenShares]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !desktopApp) return;
    room.remoteParticipants.forEach((participant) => {
      const shareId = readScreenShareCompanion(participant)
        ? participant.identity
        : `${participant.identity}:screen`;
      const selected = shareId === selectedScreenShareId;
      participant
        .getTrackPublication(Track.Source.ScreenShare)
        ?.setSubscribed(selected);
      participant
        .getTrackPublication(Track.Source.ScreenShareAudio)
        ?.setSubscribed(selected);
    });
  }, [desktopApp, screenShares, selectedScreenShareId]);

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
      if (event.state === "error") {
        screenShareSessionRef.current = null;
        setScreenShareAudioPublished(false);
        setScreenShareSourceLabel(null);
        setScreenShareError(
          event.message ?? "Bakbak could not continue the screen share.",
        );
      }
      if (event.state === "idle") {
        screenShareSessionRef.current = null;
        setScreenShareAudioPublished(false);
        setScreenShareSourceLabel(null);
      }
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    return () => {
      disposed = true;
      unlisten();
    };
  }, [desktopApp]);

  const resetVoiceMedia = useCallback(() => {
    playbackOperationRef.current += 1;
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
    soundActivityTimers.current.forEach((timer) => window.clearTimeout(timer));
    soundActivityTimers.current.clear();
    soundboardTracks.current.clear();
    screenShareTracks.current.clear();
    setActiveLocalSoundCount(0);
    deafenedRef.current = false;
    seenSoundEvents.current.clear();
    setParticipants([]);
    setMuted(false);
    setDeafened(false);
    setAudioPlaybackBlocked(false);
    setCameraEnabled(false);
    setCameraPending(false);
    setScreenShares([]);
    setSelectedScreenShareId(null);
    setScreenShareState("idle");
    setScreenShareAudioPublished(false);
    setScreenShareSourceLabel(null);
    setScreenShareError(null);
    return screenStop;
  }, [audioOutput, remoteAudio, soundboardAudio]);

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
    ) => {
      const activity: SoundboardActivity = {
        eventId,
        soundId: sound.id,
        label: sound.label,
        emoji: sound.emoji,
        startedAt: Date.now(),
      };
      const current = soundActivities.current.get(participantId) ?? [];
      soundActivities.current.set(participantId, [...current, activity]);
      if (participantId === user.id)
        setActiveLocalSoundCount(current.length + 1);
      const timer = window.setTimeout(
        () => clearParticipantSounds(participantId, eventId),
        sound.durationMs + 250,
      );
      soundActivityTimers.current.set(eventId, timer);
      const room = roomRef.current;
      if (room) refreshParticipants(room);
      else {
        setParticipants((participants) =>
          participants.map((participant) =>
            participant.id === participantId
              ? {
                  ...participant,
                  activeSounds: [...participant.activeSounds, activity],
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
      const sync = () => {
        if (isCurrentRoom()) refreshParticipants(room);
      };
      room
        .on(RoomEvent.ParticipantConnected, sync)
        .on(RoomEvent.ParticipantDisconnected, sync)
        .on(RoomEvent.ActiveSpeakersChanged, sync)
        .on(RoomEvent.TrackMuted, sync)
        .on(RoomEvent.TrackUnmuted, sync)
        .on(RoomEvent.TrackPublished, (publication: RemoteTrackPublication) => {
          if (!desktopApp && isScreenShareSource(publication.source)) {
            publication.setSubscribed(false);
          }
          sync();
        })
        .on(RoomEvent.TrackUnpublished, sync)
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
            if (!desktopApp && isScreenShareSource(publication.source)) {
              publication.setSubscribed(false);
              return;
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
              soundboardTracks.current.set(
                participant.identity,
                track as RemoteAudioTrack,
              );
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
          if (isCurrentRoom()) setStatus("reconnecting");
        })
        .on(RoomEvent.Reconnected, () => {
          if (isCurrentRoom()) setStatus("connected");
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
          roomRef.current = null;
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
      desktopApp,
    ],
  );

  const disconnectCurrentRoom = useCallback(
    async (preserveJoinState = false) => {
      const room = roomRef.current;
      roomRef.current = null;
      const screenStop = resetVoiceMedia();
      if (!preserveJoinState) {
        setStatus("disconnected");
        setChannel(null);
      }
      setError(null);
      setInputDeviceError(null);
      setOutputDeviceError(null);
      setCameraDeviceError(null);
      await screenStop;
      if (room) await room.disconnect();
    },
    [resetVoiceMedia],
  );

  const leave = useCallback(async () => {
    joinOperationRef.current += 1;
    await disconnectCurrentRoom();
  }, [disconnectCurrentRoom]);

  const join = useCallback(
    async (nextChannel: Channel) => {
      if (nextChannel.kind !== "voice") return;
      const joinOperation = joinOperationRef.current + 1;
      joinOperationRef.current = joinOperation;
      playbackOperationRef.current += 1;
      const isCurrentJoin = () => joinOperationRef.current === joinOperation;

      setChannel(nextChannel);
      setStatus("connecting");
      setError(null);
      setInputDeviceError(null);
      setOutputDeviceError(null);
      setCameraDeviceError(null);
      setAudioPlaybackBlocked(false);

      await disconnectCurrentRoom(true);
      if (!isCurrentJoin()) return;

      if (mode === "mock") {
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
        setStatus("connected");
        return;
      }

      let joiningRoom: Room | null = null;
      let attemptedRelay = false;
      try {
        const response = await requestLiveKitToken(nextChannel.id, "voice");
        if (!isCurrentJoin()) return;

        const createJoiningRoom = () => {
          const room = new Room({ adaptiveStream: true, dynacast: true });
          roomRef.current = room;
          bindRoomEvents(room);
          return room;
        };

        let room = createJoiningRoom();
        joiningRoom = room;
        try {
          await room.connect(response.serverUrl, response.token);
        } catch (initialError) {
          if (!isPeerConnectionFailure(initialError) || !isCurrentJoin()) {
            throw initialError;
          }

          attemptedRelay = true;
          if (roomRef.current === room) roomRef.current = null;
          await room.disconnect().catch(() => undefined);
          if (!isCurrentJoin()) return;

          room = createJoiningRoom();
          joiningRoom = room;
          await room.connect(response.serverUrl, response.token, {
            rtcConfig: { iceTransportPolicy: "relay" },
            maxRetries: 0,
          });
        }
        if (!isCurrentJoin() || roomRef.current !== room) {
          void room.disconnect();
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(
          true,
          microphoneCaptureOptions(selectedInputId),
        );
        if (!isCurrentJoin() || roomRef.current !== room) {
          void room.disconnect();
          return;
        }
        if (outputSelectionSupported) {
          try {
            await audioOutput.setDevice(selectedOutputId);
            const outputResult = await switchAudioOutput(
              room,
              selectedOutputId,
            );
            if (!outputResult.ok) throw new Error(outputResult.message);
          } catch {
            setOutputDeviceError(
              "Bakbak joined using system output because the selected speaker was unavailable.",
            );
          }
        }
        await audioOutput.start().catch(() => undefined);
        await soundboardAudio
          .ensurePublished(room.localParticipant)
          .catch(() => undefined);
        refreshParticipants(room);
        setStatus("connected");
        setAudioPlaybackBlocked(!room.canPlaybackAudio);
        void refreshDevices();
      } catch (caught) {
        if (!isCurrentJoin()) {
          void joiningRoom?.disconnect();
          return;
        }

        const room = joiningRoom;
        if (roomRef.current === room) roomRef.current = null;
        void resetVoiceMedia();
        void room?.disconnect();
        setStatus("error");
        setError(describeVoiceConnectionError(caught, attemptedRelay));
      }
    },
    [
      bindRoomEvents,
      audioOutput,
      disconnectCurrentRoom,
      mode,
      refreshDevices,
      refreshParticipants,
      resetVoiceMedia,
      outputSelectionSupported,
      selectedInputId,
      selectedOutputId,
      soundboardAudio,
      user.displayName,
      user.id,
    ],
  );

  const toggleMute = useCallback(async () => {
    if (status !== "connected") return;
    const room = roomRef.current;
    const nextMuted = !muted;
    if (room) {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted);
      if (roomRef.current !== room) return;
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
    setMuted(nextMuted);
  }, [muted, refreshParticipants, status]);

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

  const setOutputDevice = useCallback(
    async (deviceId: string) => {
      if (status === "connecting" || status === "reconnecting") return;
      if (!outputSelectionSupported) {
        setOutputDeviceError(
          "This runtime supports only the system output device.",
        );
        return;
      }

      const room = roomRef.current;
      const previousId = selectedOutputId;
      try {
        await audioOutput.setDevice(deviceId);
        if (room) {
          const result = await switchAudioOutput(room, deviceId);
          if (!result.ok) throw new Error(result.message);
        }
      } catch {
        await audioOutput.setDevice(previousId).catch(() => undefined);
        if (room) void switchAudioOutput(room, previousId);
        setOutputDeviceError(
          "Bakbak couldn't switch speakers. The previous output is still active.",
        );
        return;
      }

      setSelectedOutputId(deviceId);
      setOutputDeviceError(null);
    },
    [audioOutput, outputSelectionSupported, selectedOutputId, status],
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
    async (includeAudio: boolean) => {
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
          setScreenShareAudioPublished(session.audioPublished);
          setScreenShareState("sharing");
          if (includeAudio && !session.audioPublished) {
            setScreenShareError(
              "The screen is live without audio because the selected source or system did not provide it.",
            );
          }
          return;
        }

        const publication = await room.localParticipant.setScreenShareEnabled(
          true,
          { audio: false, contentHint: "detail" },
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
      }
    },
    [
      channel,
      desktopApp,
      refreshParticipants,
      screenShareCapabilities,
      screenShareState,
      status,
    ],
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
      }
    }
  }, [refreshParticipants, screenShareState]);

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
      const event = createSoundPlayEvent({
        eventId: crypto.randomUUID(),
        soundId,
        sentAt: Date.now(),
      });
      seenSoundEvents.current.add(event.eventId);
      addParticipantSound(user.id, event.eventId, sound);
      if (mode === "mock") return;

      const room = roomRef.current;
      if (!room) throw new Error("Voice room disconnected before playback.");
      const blob = await soundboardRef.current.getBlob(soundId);
      if (!blob) {
        clearParticipantSounds(user.id, event.eventId);
        throw new Error("Bakbak could not download that sound.");
      }
      await audioOutput.start().catch(() => undefined);
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

  const selectScreenShare = useCallback((shareId: string) => {
    setSelectedScreenShareId(shareId);
  }, []);

  useEffect(
    () => () => {
      joinOperationRef.current += 1;
      playbackOperationRef.current += 1;
      cameraOperationRef.current += 1;
      screenShareOperationRef.current += 1;
      const screenSessionId = screenShareSessionRef.current;
      screenShareSessionRef.current = null;
      const room = roomRef.current;
      roomRef.current = null;
      remoteAudio.cleanup();
      soundboardAudio.cleanup();
      audioOutput.cleanup();
      if (screenSessionId) void stopNativeScreenShare(screenSessionId);
      void room?.disconnect();
    },
    [audioOutput, remoteAudio, soundboardAudio],
  );

  return {
    status,
    channel,
    participants,
    muted,
    deafened,
    audioPlaybackBlocked,
    error,
    inputDeviceError,
    outputDeviceError,
    cameraDeviceError,
    inputDevices,
    outputDevices,
    cameraDevices,
    selectedInputId,
    selectedOutputId,
    selectedCameraId,
    outputSelectionSupported,
    cameraEnabled,
    cameraPending,
    screenShares,
    selectedScreenShareId,
    screenShareAvailable: desktopApp && screenShareCapabilities.available,
    screenShareAudioAvailable:
      desktopApp && screenShareCapabilities.systemAudio,
    screenShareUnavailableReason: screenShareCapabilities.reason,
    screenShareState,
    screenShareEnabled: screenShareState === "sharing",
    screenSharePending:
      screenShareState === "selecting" ||
      screenShareState === "starting" ||
      screenShareState === "stopping",
    screenShareAudioPublished,
    screenShareSourceLabel,
    screenShareError,
    soundboard,
    soundboardVolume,
    activeLocalSoundCount,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    resumeAudio,
    setParticipantVolume,
    setInputDevice,
    setOutputDevice,
    setCameraDevice,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    selectScreenShare,
    dispatchSound,
    stopLocalSounds,
    setSoundboardVolume,
    updateSoundMetadata: soundboard.updateSound,
  };
}

export function microphoneCaptureOptions(deviceId: string) {
  return {
    ...(deviceId === "default" ? {} : { deviceId }),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
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
  return {
    id: participant.identity,
    displayName: participant.name || participant.identity || "Friend",
    isLocal,
    isSpeaking: participant.isSpeaking,
    isMuted: !participant.isMicrophoneEnabled,
    volume: isLocal ? 1 : ((participant as RemoteParticipant).getVolume() ?? 1),
    joinedAt: participant.joinedAt?.toISOString() ?? null,
    cameraEnabled: participant.isCameraEnabled,
    cameraTrack:
      (cameraPublication?.track as VideoTrackLike | undefined) ?? null,
    activeSounds,
  };
}
