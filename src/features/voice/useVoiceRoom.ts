import {
  Room,
  RoomEvent,
  type Participant,
  type RemoteParticipant,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { appConfig } from "../../lib/env";
import { getSupabaseClient } from "../../lib/supabase";
import type { AppUser, Channel, DataMode } from "../../lib/types";
import {
  createSoundEvent,
  encodeSoundEvent,
  hasSeenSoundEvent,
  parseSoundEvent,
} from "../soundboard/sound-events";
import { playBundledSound } from "../soundboard/sounds";
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
}

interface VoiceRoomState {
  status: VoiceConnectionStatus;
  channel: Channel | null;
  participants: VoiceParticipant[];
  muted: boolean;
  deafened: boolean;
  error: string | null;
  inputDevices: MediaDeviceInfo[];
  selectedInputId: string;
  join: (channel: Channel) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => void;
  setParticipantVolume: (participantId: string, volume: number) => void;
  setInputDevice: (deviceId: string) => Promise<void>;
  dispatchSound: (soundId: string) => Promise<void>;
}

export function useVoiceRoom(user: AppUser, mode: DataMode): VoiceRoomState {
  const [status, setStatus] = useState<VoiceConnectionStatus>("disconnected");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState("default");
  const roomRef = useRef<Room | null>(null);
  const seenSoundEvents = useRef(new Set<string>());

  const refreshParticipants = useCallback((room: Room) => {
    const next: VoiceParticipant[] = [
      participantToView(room.localParticipant, true),
    ];
    room.remoteParticipants.forEach((participant) => {
      next.push(participantToView(participant, false));
    });
    setParticipants(next);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices) return;
    try {
      setInputDevices(await Room.getLocalDevices("audioinput", false));
    } catch {
      setInputDevices([]);
    }
  }, []);

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

  const bindRoomEvents = useCallback(
    (room: Room) => {
      const sync = () => refreshParticipants(room);
      room
        .on(RoomEvent.ParticipantConnected, sync)
        .on(RoomEvent.ParticipantDisconnected, sync)
        .on(RoomEvent.ActiveSpeakersChanged, sync)
        .on(RoomEvent.TrackMuted, sync)
        .on(RoomEvent.TrackUnmuted, sync)
        .on(RoomEvent.Reconnecting, () => setStatus("reconnecting"))
        .on(RoomEvent.Reconnected, () => setStatus("connected"))
        .on(RoomEvent.MediaDevicesChanged, () => void refreshDevices())
        .on(RoomEvent.MediaDevicesError, () => {
          setError(
            "Bakbak could not use that microphone. Check macOS Privacy settings.",
          );
        })
        .on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
          if (topic !== "bakbak-soundboard") return;
          const event = parseSoundEvent(payload);
          if (!event || hasSeenSoundEvent(event, seenSoundEvents.current))
            return;
          seenSoundEvents.current.add(event.eventId);
          playBundledSound(event.soundId, event.volume);
        })
        .on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          setStatus("disconnected");
          setParticipants([]);
          setChannel(null);
        });
    },
    [refreshDevices, refreshParticipants],
  );

  const leave = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) await room.disconnect();
    setStatus("disconnected");
    setChannel(null);
    setParticipants([]);
    setMuted(false);
    setDeafened(false);
    setError(null);
  }, []);

  const join = useCallback(
    async (nextChannel: Channel) => {
      if (nextChannel.kind !== "voice") return;
      if (roomRef.current) await leave();
      setChannel(nextChannel);
      setStatus("connecting");
      setError(null);

      if (mode === "mock") {
        await new Promise((resolve) => window.setTimeout(resolve, 420));
        setParticipants([
          {
            id: user.id,
            displayName: user.displayName,
            isLocal: true,
            isSpeaking: false,
            isMuted: false,
            volume: 1,
          },
          {
            id: "user-mira",
            displayName: "Mira",
            isLocal: false,
            isSpeaking: true,
            isMuted: false,
            volume: 0.82,
          },
          {
            id: "user-jo",
            displayName: "Jo",
            isLocal: false,
            isSpeaking: false,
            isMuted: true,
            volume: 0.72,
          },
        ]);
        setStatus("connected");
        return;
      }

      try {
        const supabase = getSupabaseClient();
        const invocation = await supabase.functions.invoke("livekit-token", {
          body: buildLiveKitTokenRequest(nextChannel.id),
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

        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        bindRoomEvents(room);
        await room.connect(response.value.serverUrl, response.value.token);
        await room.localParticipant.setMicrophoneEnabled(
          true,
          selectedInputId === "default"
            ? undefined
            : { deviceId: selectedInputId },
        );
        refreshParticipants(room);
        setStatus("connected");
        void refreshDevices();
      } catch (caught) {
        void roomRef.current?.disconnect();
        roomRef.current = null;
        setStatus("error");
        setError(
          caught instanceof Error ? caught.message : "Voice connection failed.",
        );
      }
    },
    [
      bindRoomEvents,
      leave,
      mode,
      refreshDevices,
      refreshParticipants,
      selectedInputId,
      user.displayName,
      user.id,
    ],
  );

  const toggleMute = useCallback(async () => {
    const nextMuted = !muted;
    if (roomRef.current) {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!nextMuted);
      refreshParticipants(roomRef.current);
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
  }, [muted, refreshParticipants]);

  const toggleDeafen = useCallback(() => {
    const nextDeafened = !deafened;
    const room = roomRef.current;
    room?.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((publication) =>
        publication.setEnabled(!nextDeafened),
      );
    });
    setDeafened(nextDeafened);
  }, [deafened]);

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

  const setInputDevice = useCallback(async (deviceId: string) => {
    setSelectedInputId(deviceId);
    if (roomRef.current)
      await roomRef.current.switchActiveDevice("audioinput", deviceId);
  }, []);

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
      playBundledSound(soundId, event.volume);
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
    [status, user.id],
  );

  useEffect(
    () => () => {
      void roomRef.current?.disconnect();
    },
    [],
  );

  return {
    status,
    channel,
    participants,
    muted,
    deafened,
    error,
    inputDevices,
    selectedInputId,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    setParticipantVolume,
    setInputDevice,
    dispatchSound,
  };
}

function participantToView(
  participant: Participant,
  isLocal: boolean,
): VoiceParticipant {
  return {
    id: participant.identity,
    displayName: participant.name || participant.identity || "Friend",
    isLocal,
    isSpeaking: participant.isSpeaking,
    isMuted: !participant.isMicrophoneEnabled,
    volume: isLocal ? 1 : ((participant as RemoteParticipant).getVolume() ?? 1),
  };
}
