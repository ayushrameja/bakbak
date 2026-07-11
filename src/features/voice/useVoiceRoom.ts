import {
  ConnectionError,
  ConnectionErrorReason,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  supportsAudioOutputSelection,
  type Participant,
  type RemoteParticipant,
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
  createSoundEvent,
  encodeSoundEvent,
  hasSeenSoundEvent,
  parseSoundEvent,
} from "../soundboard/sound-events";
import { SoundPlaybackController } from "../soundboard/sound-playback";
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
  dispatchSound: (soundId: string) => Promise<void>;
}

export function useVoiceRoom(user: AppUser, mode: DataMode): VoiceRoomState {
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
  const [remoteAudio] = useState(() => new RemoteAudioRenderer());
  const [audioOutput] = useState(() => new AudioOutputRouter());
  const [soundPlayback] = useState(
    () => new SoundPlaybackController(undefined, () => audioOutput.soundTarget),
  );
  const outputSelectionSupported =
    audioOutput.supported && supportsAudioOutputSelection();
  const roomRef = useRef<Room | null>(null);
  const deafenedRef = useRef(false);
  const joinOperationRef = useRef(0);
  const playbackOperationRef = useRef(0);
  const cameraOperationRef = useRef(0);
  const seenSoundEvents = useRef(new Set<string>());

  const refreshParticipants = useCallback((room: Room) => {
    const next: VoiceParticipant[] = [
      participantToView(room.localParticipant, true),
    ];
    room.remoteParticipants.forEach((participant) => {
      next.push(participantToView(participant, false));
    });
    setParticipants(next);
    setCameraEnabled(room.localParticipant.isCameraEnabled);
  }, []);

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
    });
  }, [selectedCameraId, selectedInputId, selectedOutputId]);

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

  const resetVoiceMedia = useCallback(() => {
    playbackOperationRef.current += 1;
    cameraOperationRef.current += 1;
    remoteAudio.cleanup();
    soundPlayback.stopAll();
    soundPlayback.setDeafened(false);
    deafenedRef.current = false;
    seenSoundEvents.current.clear();
    setParticipants([]);
    setMuted(false);
    setDeafened(false);
    setAudioPlaybackBlocked(false);
    setCameraEnabled(false);
    setCameraPending(false);
  }, [remoteAudio, soundPlayback]);

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
        .on(RoomEvent.TrackPublished, sync)
        .on(RoomEvent.TrackUnpublished, sync)
        .on(RoomEvent.LocalTrackPublished, sync)
        .on(RoomEvent.LocalTrackUnpublished, sync)
        .on(RoomEvent.TrackSubscribed, (track) => {
          if (!isCurrentRoom()) return;
          remoteAudio.attach(track);
          sync();
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          if (!isCurrentRoom()) return;
          remoteAudio.detach(track);
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
        .on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
          if (!isCurrentRoom() || topic !== "bakbak-soundboard") return;
          const event = parseSoundEvent(payload);
          if (!event || hasSeenSoundEvent(event, seenSoundEvents.current))
            return;
          seenSoundEvents.current.add(event.eventId);
          soundPlayback.play(event.soundId, event.volume);
        })
        .on(RoomEvent.Disconnected, () => {
          if (roomRef.current !== room) return;
          roomRef.current = null;
          resetVoiceMedia();
          setStatus("disconnected");
          setChannel(null);
        });
    },
    [
      refreshDevices,
      refreshParticipants,
      remoteAudio,
      resetVoiceMedia,
      soundPlayback,
    ],
  );

  const disconnectCurrentRoom = useCallback(
    async (preserveJoinState = false) => {
      const room = roomRef.current;
      roomRef.current = null;
      resetVoiceMedia();
      if (!preserveJoinState) {
        setStatus("disconnected");
        setChannel(null);
      }
      setError(null);
      setInputDeviceError(null);
      setOutputDeviceError(null);
      setCameraDeviceError(null);
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
          },
        ]);
        setStatus("connected");
        return;
      }

      let joiningRoom: Room | null = null;
      let attemptedRelay = false;
      try {
        const supabase = getSupabaseClient();
        const invocation = await supabase.functions.invoke("livekit-token", {
          body: buildLiveKitTokenRequest(nextChannel.id),
        });
        if (!isCurrentJoin()) return;
        if (invocation.error) throw invocation.error;
        const data: unknown = invocation.data;
        const response = parseLiveKitTokenResponse(
          typeof data === "object" && data !== null && !("url" in data)
            ? { ...data, url: appConfig.livekitUrl }
            : data,
          Date.now(),
        );
        if (!response.ok) throw new Error(response.message);

        const createJoiningRoom = () => {
          const room = new Room({ adaptiveStream: true, dynacast: true });
          roomRef.current = room;
          bindRoomEvents(room);
          return room;
        };

        let room = createJoiningRoom();
        joiningRoom = room;
        try {
          await room.connect(response.value.serverUrl, response.value.token);
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
          await room.connect(response.value.serverUrl, response.value.token, {
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
          selectedInputId === "default"
            ? undefined
            : { deviceId: selectedInputId },
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
        resetVoiceMedia();
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
        soundPlayback,
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
  }, [audioPlaybackBlocked, remoteAudio, soundPlayback, status]);

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
      roomRef.current?.remoteParticipants
        .get(participantId)
        ?.setVolume(safeVolume);
      setParticipants((current) =>
        current.map((participant) =>
          participant.id === participantId
            ? { ...participant, volume: safeVolume }
            : participant,
        ),
      );
    },
    [],
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

      setSelectedInputId(deviceId);
      setInputDeviceError(null);
    },
    [status],
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

  const dispatchSound = useCallback(
    async (soundId: string) => {
      if (status !== "connected")
        throw new Error("Join a voice room before sharing a sound.");
      const event = createSoundEvent({
        eventId: crypto.randomUUID(),
        soundId,
        senderId: user.id,
        sentAt: Date.now(),
        volume: 0.72,
      });
      seenSoundEvents.current.add(event.eventId);
      await audioOutput.start().catch(() => undefined);
      soundPlayback.play(soundId, event.volume);
      if (roomRef.current) {
        await roomRef.current.localParticipant.publishData(
          encodeSoundEvent(event),
          {
            reliable: true,
            topic: "bakbak-soundboard",
          },
        );
      }
    },
    [audioOutput, soundPlayback, status, user.id],
  );

  useEffect(
    () => () => {
      joinOperationRef.current += 1;
      playbackOperationRef.current += 1;
      cameraOperationRef.current += 1;
      const room = roomRef.current;
      roomRef.current = null;
      remoteAudio.cleanup();
      soundPlayback.stopAll();
      audioOutput.cleanup();
      void room?.disconnect();
    },
    [audioOutput, remoteAudio, soundPlayback],
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
    dispatchSound,
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

function participantToView(
  participant: Participant,
  isLocal: boolean,
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
  };
}
