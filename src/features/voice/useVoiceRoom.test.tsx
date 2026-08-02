import { act, renderHook, waitFor } from "@testing-library/react";
import { ConnectionQuality, LocalAudioTrack, Track } from "livekit-client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import type { AppUser, Channel } from "../../lib/types";
import {
  MAX_CONCURRENT_SOUNDS_PER_USER,
  clampSoundboardActivities,
} from "../soundboard/limits";
import { mockSoundboardController } from "../soundboard/mock-catalog";
import {
  SOUNDBOARD_TRACK_NAME,
  SoundboardAudioPublisher,
} from "../soundboard/soundboard-audio";
import {
  createSoundStopEvent,
  encodeSoundEvent,
} from "../soundboard/sound-events";
import { AudioOutputRouter } from "./audio-output-router";
import { SPEECH_MICROPHONE_TRACK_NAME } from "./microphone-publication";
import { RemoteAudioRenderer } from "./remote-audio";
import type { ScreenShareLifecycleEvent } from "./screen-share-service";
import {
  OUTPUT_DEVICE_NOTICE_DURATION_MS,
  MAX_SUBSCRIPTION_RECOVERY_ATTEMPTS,
  RELAY_PREFERENCE_DURATION_MS,
  SUBSCRIPTION_RECOVERY_DELAY_MS,
  VOICE_PREPARE_DEBOUNCE_MS,
  VOICE_TOKEN_EXPIRY_BUFFER_MS,
  echoCancellationForCapture,
  isPreparedVoiceTokenUsable,
  normalizeVoiceConnectionQuality,
  supportsMacosFullVolumeMode,
  useVoiceRoom,
} from "./useVoiceRoom";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface RoomDouble {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  prepareConnection: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => void;
  remoteParticipants: Map<string, unknown>;
  localParticipant: {
    getTrackPublication: Mock<
      (source: string) => PublicationDouble | undefined
    >;
    getTrackPublications: Mock<() => PublicationDouble[]>;
    setMicrophoneEnabled: ReturnType<typeof vi.fn>;
    setCameraEnabled: ReturnType<typeof vi.fn>;
    publishData: ReturnType<typeof vi.fn>;
    publishTrack: ReturnType<typeof vi.fn>;
    unpublishTrack: ReturnType<typeof vi.fn>;
  };
}

interface PublicationDouble {
  track: {
    isMuted: boolean;
    stop: () => void;
    mute: () => Promise<unknown>;
    unmute: () => Promise<unknown>;
  };
  source: string;
  trackName: string;
  readonly isMuted: boolean;
  mute: Mock<() => Promise<unknown>>;
  unmute: Mock<() => Promise<unknown>>;
}

const liveKitState = vi.hoisted(() => ({
  connectResults: [] as Promise<void>[],
  rooms: [] as RoomDouble[],
  instances: [] as RoomDouble[],
  roomOptions: [] as unknown[],
  createLocalAudioTrack: vi.fn(),
}));

const supabaseState = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const screenShareState = vi.hoisted(() => ({
  desktop: false,
  getCapabilities: vi.fn(),
  listSources: vi.fn(),
  start: vi.fn(),
  update: vi.fn(),
  stop: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("livekit-client", () => {
  class ConnectionError extends Error {
    readonly reason = 2;
  }

  class LocalAudioTrack {
    readonly stop = vi.fn();
    readonly restartTrack = vi.fn().mockResolvedValue(undefined);
    readonly getProcessor = vi.fn(() => null);
    readonly mute = vi.fn(() => {
      this.isMuted = true;
      return Promise.resolve();
    });
    readonly unmute = vi.fn(() => {
      this.isMuted = false;
      return Promise.resolve();
    });
    isMuted = false;
  }

  class Room {
    static getLocalDevices = vi.fn().mockResolvedValue([]);

    readonly canPlaybackAudio = true;
    state = "connected";
    readonly remoteParticipants = new Map();
    private readonly handlers = new Map<
      string,
      Array<(...args: unknown[]) => void>
    >();
    private trackPublications: PublicationDouble[] = [];
    readonly localParticipant = {
      identity: "user-1",
      name: "Ayu",
      isSpeaking: false,
      isMicrophoneEnabled: true,
      isCameraEnabled: false,
      connectionQuality: "unknown",
      joinedAt: new Date("2026-07-11T12:00:00.000Z"),
      lastCameraError: undefined,
      getTrackPublication: vi.fn((source: string) =>
        this.trackPublications.find(
          (publication) => publication.source === source,
        ),
      ),
      getTrackPublications: vi.fn(() => [...this.trackPublications]),
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      setCameraEnabled: vi.fn().mockResolvedValue(undefined),
      publishData: vi.fn().mockResolvedValue(undefined),
      publishTrack: vi.fn(
        (
          track: unknown,
          options?: { source?: string; name?: string },
        ): Promise<PublicationDouble> => {
          if (!(track instanceof LocalAudioTrack)) {
            return Promise.reject(new Error("Unexpected non-audio track."));
          }
          const publication: PublicationDouble = {
            track,
            source: options?.source ?? "unknown",
            trackName: options?.name ?? "browser-generated-track-id",
            get isMuted() {
              return track.isMuted;
            },
            mute: vi.fn(() => track.mute()),
            unmute: vi.fn(() => track.unmute()),
          };
          this.trackPublications.push(publication);
          return Promise.resolve(publication);
        },
      ),
      unpublishTrack: vi.fn((track: unknown) => {
        this.trackPublications = this.trackPublications.filter(
          (publication) => publication.track !== track,
        );
        return Promise.resolve();
      }),
    };
    readonly connect: ReturnType<typeof vi.fn>;
    readonly disconnect = vi.fn((stopTracks = true) => {
      if (stopTracks) {
        this.trackPublications.forEach((publication) =>
          publication.track.stop(),
        );
      }
      this.trackPublications = [];
      return Promise.resolve();
    });
    readonly prepareConnection = vi.fn().mockResolvedValue(undefined);
    private readonly options: unknown;

    constructor(options?: unknown) {
      this.options = options;
      liveKitState.instances.push(this);
      this.connect = vi.fn(() => {
        this.state = "connected";
        if (!liveKitState.rooms.includes(this)) {
          liveKitState.rooms.push(this);
          liveKitState.roomOptions.push(this.options);
        }
        return liveKitState.connectResults.shift() ?? Promise.resolve();
      });
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      this.handlers.get(event)?.forEach((handler) => handler(...args));
    }
  }

  return {
    version: "2.21.0",
    ConnectionQuality: {
      Excellent: "excellent",
      Good: "good",
      Poor: "poor",
      Lost: "lost",
      Unknown: "unknown",
    },
    ConnectionError,
    LocalAudioTrack,
    ConnectionErrorReason: {
      NotAllowed: 0,
      ServerUnreachable: 1,
      InternalError: 2,
      Cancelled: 3,
    },
    Room,
    RoomEvent: {
      ActiveSpeakersChanged: "activeSpeakersChanged",
      ConnectionQualityChanged: "connectionQualityChanged",
      Connected: "connected",
      ConnectionStateChanged: "connectionStateChanged",
      AudioPlaybackStatusChanged: "audioPlaybackStatusChanged",
      DataReceived: "dataReceived",
      Disconnected: "disconnected",
      MediaDevicesChanged: "mediaDevicesChanged",
      MediaDevicesError: "mediaDevicesError",
      ParticipantConnected: "participantConnected",
      ParticipantDisconnected: "participantDisconnected",
      Reconnected: "reconnected",
      Reconnecting: "reconnecting",
      SignalReconnecting: "signalReconnecting",
      LocalTrackPublished: "localTrackPublished",
      LocalTrackUnpublished: "localTrackUnpublished",
      TrackMuted: "trackMuted",
      TrackPublished: "trackPublished",
      TrackSubscribed: "trackSubscribed",
      TrackSubscriptionFailed: "trackSubscriptionFailed",
      TrackSubscriptionStatusChanged: "trackSubscriptionStatusChanged",
      TrackStreamStateChanged: "trackStreamStateChanged",
      TrackUnmuted: "trackUnmuted",
      TrackUnpublished: "trackUnpublished",
      TrackUnsubscribed: "trackUnsubscribed",
    },
    Track: {
      Kind: { Audio: "audio" },
      StreamState: {
        Active: "active",
        Paused: "paused",
        Unknown: "unknown",
      },
      Source: {
        Microphone: "microphone",
        Camera: "camera",
        ScreenShare: "screen_share",
        ScreenShareAudio: "screen_share_audio",
      },
    },
    TrackPublication: {
      SubscriptionStatus: {
        Desired: "desired",
        Subscribed: "subscribed",
        Unsubscribed: "unsubscribed",
      },
    },
    VideoPresets: { h720: { resolution: { width: 1280, height: 720 } } },
    createLocalAudioTrack:
      liveKitState.createLocalAudioTrack.mockImplementation(() =>
        Promise.resolve(new LocalAudioTrack()),
      ),
    supportsAudioOutputSelection: () => false,
  };
});

describe("voice connection quality", () => {
  it("normalizes LiveKit quality for the UI", () => {
    expect(normalizeVoiceConnectionQuality(ConnectionQuality.Excellent)).toBe(
      "excellent",
    );
    expect(normalizeVoiceConnectionQuality(ConnectionQuality.Good)).toBe(
      "good",
    );
    expect(normalizeVoiceConnectionQuality(ConnectionQuality.Poor)).toBe(
      "poor",
    );
    expect(normalizeVoiceConnectionQuality(ConnectionQuality.Lost)).toBe(
      "poor",
    );
    expect(normalizeVoiceConnectionQuality(ConnectionQuality.Unknown)).toBe(
      "unknown",
    );
  });
});

describe("macOS capture mode", () => {
  it("is offered only by the installed macOS runtime", () => {
    expect(
      supportsMacosFullVolumeMode(
        true,
        "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      ),
    ).toBe(true);
    expect(supportsMacosFullVolumeMode(false, "Macintosh")).toBe(false);
    expect(supportsMacosFullVolumeMode(true, "Windows NT 10.0")).toBe(false);
  });

  it("disables echo cancellation only for the selected macOS mode", () => {
    expect(echoCancellationForCapture(true, true)).toBe(false);
    expect(echoCancellationForCapture(true, false)).toBe(true);
    expect(echoCancellationForCapture(false, true)).toBe(true);
  });
});

describe("prepared voice tokens", () => {
  it("keeps a thirty-second expiry safety margin", () => {
    const now = Date.parse("2026-07-14T12:00:00.000Z");
    expect(
      isPreparedVoiceTokenUsable(
        {
          expiresAt: new Date(
            now + VOICE_TOKEN_EXPIRY_BUFFER_MS + 1,
          ).toISOString(),
        },
        now,
      ),
    ).toBe(true);
    expect(
      isPreparedVoiceTokenUsable(
        {
          expiresAt: new Date(now + VOICE_TOKEN_EXPIRY_BUFFER_MS).toISOString(),
        },
        now,
      ),
    ).toBe(false);
    expect(isPreparedVoiceTokenUsable({ expiresAt: null }, now)).toBe(false);
  });

  it("keeps only the newest five remote sound activities", () => {
    const activities = Array.from({ length: 7 }, (_, index) => ({
      eventId: `event-${index + 1}`,
      soundId: `sound-${index + 1}`,
      label: `Sound ${index + 1}`,
      emoji: "🔊",
      startedAt: index + 1,
    }));

    expect(clampSoundboardActivities(activities)).toEqual(
      activities.slice(-MAX_CONCURRENT_SOUNDS_PER_USER),
    );
  });
});

vi.mock("../../lib/supabase", () => ({
  getSupabaseClient: () => ({
    functions: { invoke: supabaseState.invoke },
  }),
}));

vi.mock("./screen-share-service", () => ({
  ScreenShareCaptureError: class ScreenShareCaptureError extends Error {
    constructor(
      readonly failure: {
        code: string;
        message: string;
        recommendedRetrySource: "display" | null;
      },
    ) {
      super(failure.message);
    }
  },
  isDesktopApp: () => screenShareState.desktop,
  getScreenShareCapabilities: screenShareState.getCapabilities,
  listScreenShareSources: screenShareState.listSources,
  startScreenShare: screenShareState.start,
  updateScreenShareSettings: screenShareState.update,
  stopScreenShare: screenShareState.stop,
  listenForScreenShareLifecycle: screenShareState.listen,
}));

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
  avatarAnimationUrl: null,
  avatarPath: null,
  avatarAnimationPath: null,
  avatarGiphyId: null,
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: null,
  coverAnimationPath: null,
  coverGiphyId: null,
  coverPositionX: 50,
  coverPositionY: 50,
  description: "",
  status: "online",
};

const lounge: Channel = {
  id: "voice-lounge",
  serverId: "server-1",
  categoryId: null,
  name: "Lounge",
  kind: "voice",
  position: 1,
  topic: "Talk here",
};

const coffeeTable: Channel = {
  ...lounge,
  id: "voice-coffee-table",
  name: "Coffee table",
  position: 2,
};

function remoteParticipant(
  id: string,
  displayName: string,
  metadata: string | null = null,
) {
  const testTrackPublications: Array<Record<string, unknown>> = [];
  return {
    sid: `PA_${id}`,
    identity: id,
    name: displayName,
    metadata,
    isSpeaking: false,
    isCameraEnabled: false,
    joinedAt: new Date("2026-07-17T12:00:00.000Z"),
    getTrackPublication: vi.fn(),
    getTrackPublications: vi.fn(() => testTrackPublications),
    getVolume: vi.fn(() => 1),
    setVolume: vi.fn(),
    testTrackPublications,
  };
}

function remoteAudioPublication(trackSid = "TR_speech") {
  const track = {
    kind: "audio",
    streamState: "active",
    attach: vi.fn((element: HTMLMediaElement) => element),
    detach: vi.fn((element: HTMLMediaElement) => element),
    getRTCStatsReport: vi.fn().mockResolvedValue(new Map()),
  };
  const publication = {
    kind: "audio",
    source: "microphone",
    trackSid,
    trackName: SPEECH_MICROPHONE_TRACK_NAME,
    track,
    isSubscribed: true,
    isMuted: false,
    subscriptionStatus: "subscribed",
    setSubscribed: vi.fn((subscribed: boolean) => {
      publication.isSubscribed = subscribed;
      publication.subscriptionStatus = subscribed
        ? "subscribed"
        : "unsubscribed";
    }),
  };
  return { publication, track };
}

const tokenResponse = {
  data: {
    token: "signed.jwt.token",
    serverUrl: "wss://bakbak.livekit.cloud",
  },
  error: null,
};

describe("useVoiceRoom join lifecycle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    void liveKitState.connectResults.splice(0);
    liveKitState.rooms.splice(0);
    liveKitState.instances.splice(0);
    liveKitState.roomOptions.splice(0);
    liveKitState.createLocalAudioTrack.mockClear();
    supabaseState.invoke.mockReset();
    screenShareState.desktop = false;
    screenShareState.getCapabilities.mockReset();
    screenShareState.listSources.mockReset();
    screenShareState.listSources.mockResolvedValue([]);
    screenShareState.getCapabilities.mockResolvedValue({
      available: false,
      nativeCapture: false,
      systemAudio: false,
      reason: null,
    });
    screenShareState.start.mockReset();
    screenShareState.update.mockReset();
    screenShareState.stop.mockReset();
    screenShareState.stop.mockResolvedValue(undefined);
    screenShareState.listen.mockReset();
    screenShareState.listen.mockResolvedValue(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("auto-dismisses output notices and also supports immediate dismissal", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.setOutputDevice("speaker-that-is-not-available");
    });
    expect(result.current.outputDeviceError).toBe(
      "This runtime supports only the system output device.",
    );

    act(() => result.current.dismissOutputDeviceError());
    expect(result.current.outputDeviceError).toBeNull();

    await act(async () => {
      await result.current.setOutputDevice("speaker-that-is-not-available");
    });
    act(() => {
      vi.advanceTimersByTime(OUTPUT_DEVICE_NOTICE_DURATION_MS);
    });
    expect(result.current.outputDeviceError).toBeNull();
  });

  it("emits self join only after connection and reserves leave for explicit user exits", async () => {
    const effects = vi.fn();
    supabaseState.invoke
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() =>
      useVoiceRoom(user, "live", mockSoundboardController, effects),
    );

    await act(async () => {
      await result.current.join(lounge);
    });
    expect(effects).toHaveBeenLastCalledWith({
      type: "voice-self-joined",
      channelName: "Lounge",
    });

    await act(async () => {
      await result.current.join(coffeeTable);
    });
    expect(effects).toHaveBeenLastCalledWith({
      type: "voice-self-joined",
      channelName: "Coffee table",
    });
    expect(effects).not.toHaveBeenCalledWith({ type: "voice-self-left" });

    await act(async () => {
      await result.current.leave("sign-out");
    });
    expect(effects).not.toHaveBeenCalledWith({ type: "voice-self-left" });

    await act(async () => {
      await result.current.join(lounge);
    });
    await act(async () => {
      await result.current.leave();
    });
    expect(effects).toHaveBeenLastCalledWith({ type: "voice-self-left" });
  });

  it("baselines the initial roster, filters share companions, and reports later room events", async () => {
    screenShareState.desktop = true;
    screenShareState.getCapabilities.mockResolvedValue({
      available: true,
      nativeCapture: true,
      systemAudio: true,
      sourceKinds: ["display", "window", "application"],
      resolutions: [480, 720, 1080],
      frameRates: [15, 30, 60],
      dynamicSettings: true,
      reason: null,
    });
    const effects = vi.fn();
    const connection = deferred<void>();
    liveKitState.connectResults.push(connection.promise);
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() =>
      useVoiceRoom(user, "live", mockSoundboardController, effects),
    );

    let joinPromise!: Promise<void>;
    act(() => {
      joinPromise = result.current.join(lounge);
    });
    await waitFor(() => expect(liveKitState.rooms[0]).toBeDefined());
    const room = liveKitState.rooms[0]!;
    const initial = remoteParticipant("initial", "Already here");
    room.remoteParticipants.set("initial", initial);
    await act(async () => {
      connection.resolve(undefined);
      await joinPromise;
    });
    expect(effects).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "voice-remote-joined",
        participantId: "initial",
      }),
    );

    const mira = remoteParticipant("mira", "Mira");
    room.remoteParticipants.set("mira", mira);
    act(() => room.emit("participantConnected", mira));
    expect(effects).toHaveBeenCalledWith({
      type: "voice-remote-joined",
      participantId: "mira",
      displayName: "Mira",
    });
    act(() => room.emit("participantDisconnected", mira));
    expect(effects).toHaveBeenCalledWith({
      type: "voice-remote-left",
      participantId: "mira",
      displayName: "Mira",
    });

    const companion = remoteParticipant(
      "mira-share",
      "Mira screen",
      JSON.stringify({
        participantKind: "screen_share",
        ownerUserId: "mira",
      }),
    );
    act(() => room.emit("participantConnected", companion));
    expect(effects).toHaveBeenCalledWith({
      type: "screen-share-started",
      actor: "remote",
      displayName: "Mira screen",
    });
    expect(effects).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "voice-remote-joined",
        participantId: "mira-share",
      }),
    );

    act(() => room.emit("reconnecting"));
    expect(effects).toHaveBeenCalledWith({ type: "signal-interrupted" });
    act(() => room.emit("reconnected"));
    expect(effects).toHaveBeenCalledWith({ type: "signal-restored" });
  });

  it("mutes a remote participant locally and restores their last boosted volume", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const setParticipantGain = vi.spyOn(
      RemoteAudioRenderer.prototype,
      "setParticipantGain",
    );
    const connection = deferred<void>();
    liveKitState.connectResults.push(connection.promise);
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    let joinPromise!: Promise<void>;
    act(() => {
      joinPromise = result.current.join(lounge);
    });
    await waitFor(() => expect(liveKitState.rooms[0]).toBeDefined());
    const room = liveKitState.rooms[0]!;
    const mira = remoteParticipant("mira", "Mira");
    const { publication, track } = remoteAudioPublication();
    mira.testTrackPublications.push(publication);
    room.remoteParticipants.set("mira", mira);
    await act(async () => {
      connection.resolve(undefined);
      await joinPromise;
    });
    act(() => room.emit("trackSubscribed", track, publication, mira));
    const remoteElement = document.querySelector<HTMLAudioElement>(
      "audio[data-bakbak-remote-audio]",
    );
    expect(remoteElement).not.toBeNull();

    act(() => result.current.setParticipantVolume("mira", 0.4));
    expect(setParticipantGain).toHaveBeenLastCalledWith("mira", 0.4);
    expect(remoteElement).toHaveProperty("volume", 0.4);

    act(() => result.current.setParticipantVolume("mira", 1.5));
    expect(setParticipantGain).toHaveBeenLastCalledWith("mira", 1.5);
    expect(
      result.current.participants.find(
        (participant) => participant.id === "mira",
      )?.volume,
    ).toBe(1.5);

    act(() => result.current.toggleParticipantMute("mira"));
    expect(setParticipantGain).toHaveBeenLastCalledWith("mira", 0);
    expect(
      result.current.participants.find(
        (participant) => participant.id === "mira",
      )?.volume,
    ).toBe(0);

    act(() => result.current.toggleParticipantMute("mira"));
    expect(setParticipantGain).toHaveBeenLastCalledWith("mira", 1.5);
    expect(
      result.current.participants.find(
        (participant) => participant.id === "mira",
      )?.volume,
    ).toBe(1.5);
  });

  it("hard-mutes remote soundboard elements when their track or stop event goes idle", async () => {
    const setTrackMuted = vi.spyOn(
      RemoteAudioRenderer.prototype,
      "setTrackMuted",
    );
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
    });
    const room = liveKitState.rooms[0]!;
    const participant = {
      ...remoteParticipant("mira", "Mira"),
      isLocal: false,
    };
    const track = {
      kind: "audio",
      attach: vi.fn((element: HTMLMediaElement) => element),
      detach: vi.fn((element: HTMLMediaElement) => element),
      setVolume: vi.fn(),
    };
    const publication = {
      kind: "audio",
      isMuted: true,
      isSubscribed: true,
      source: "microphone",
      subscriptionStatus: "subscribed",
      track,
      trackSid: "TR_soundboard",
      trackName: SOUNDBOARD_TRACK_NAME,
      setSubscribed: vi.fn(),
    };
    participant.testTrackPublications.push(publication);

    act(() => room.emit("trackSubscribed", track, publication, participant));
    expect(setTrackMuted).toHaveBeenLastCalledWith(track, true);

    act(() => room.emit("trackUnmuted", publication, participant));
    expect(setTrackMuted).toHaveBeenLastCalledWith(track, false);

    act(() => room.emit("trackMuted", publication, participant));
    expect(setTrackMuted).toHaveBeenLastCalledWith(track, true);

    const stopEvent = createSoundStopEvent({
      eventId: "remote-stop",
      sentAt: Date.now(),
    });
    act(() =>
      room.emit(
        "dataReceived",
        encodeSoundEvent(stopEvent),
        participant,
        undefined,
        "bakbak-soundboard",
      ),
    );
    expect(setTrackMuted).toHaveBeenLastCalledWith(track, true);
  });

  it("reconciles a missed subscribed track after signal-only and full reconnects without duplicates", async () => {
    const recoverAll = vi
      .spyOn(RemoteAudioRenderer.prototype, "recoverAll")
      .mockResolvedValue(true);
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
    });
    recoverAll.mockClear();
    const room = liveKitState.rooms[0]!;
    const participant = remoteParticipant("mira", "Mira");
    const { publication, track } = remoteAudioPublication();
    participant.testTrackPublications.push(publication);
    room.remoteParticipants.set("mira", participant);

    act(() => room.emit("signalReconnecting"));
    expect(result.current.status).toBe("connected");
    expect(track.attach).not.toHaveBeenCalled();

    await act(async () => {
      room.emit("reconnected");
      await Promise.resolve();
    });
    await waitFor(() => expect(track.attach).toHaveBeenCalledOnce());
    expect(recoverAll).toHaveBeenCalledWith("reconnected");

    act(() => room.emit("reconnecting"));
    expect(result.current.status).toBe("reconnecting");
    await act(async () => {
      room.emit("reconnected");
      await Promise.resolve();
    });

    expect(result.current.status).toBe("connected");
    expect(track.attach).toHaveBeenCalledOnce();
    expect(recoverAll).toHaveBeenCalledTimes(2);
  });

  it("retains the last confirmed participant roster through reconnect", async () => {
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));
    await act(async () => {
      await result.current.join(lounge);
    });
    const room = liveKitState.rooms[0]!;
    const participant = remoteParticipant("mira", "Mira");
    room.remoteParticipants.set("mira", participant);
    act(() => room.emit("participantConnected", participant));

    expect(result.current.participants.map(({ id }) => id)).toEqual([
      "user-1",
      "mira",
    ]);

    act(() => room.emit("signalReconnecting"));
    expect(result.current.status).toBe("connected");
    expect(result.current.participants.map(({ id }) => id)).toEqual([
      "user-1",
      "mira",
    ]);

    act(() => room.emit("reconnecting"));
    expect(result.current.status).toBe("reconnecting");
    expect(result.current.participants.map(({ id }) => id)).toEqual([
      "user-1",
      "mira",
    ]);

    await act(async () => {
      room.emit("reconnected");
      await Promise.resolve();
    });
    expect(result.current.status).toBe("connected");
    expect(result.current.participants.map(({ id }) => id)).toEqual([
      "user-1",
      "mira",
    ]);
  });

  it("rejects a stale subscription event after its publication is gone", async () => {
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));
    await act(async () => {
      await result.current.join(lounge);
    });
    const room = liveKitState.rooms[0]!;
    const participant = remoteParticipant("mira", "Mira");
    const { publication, track } = remoteAudioPublication();
    room.remoteParticipants.set("mira", participant);

    act(() => room.emit("trackSubscribed", track, publication, participant));

    expect(track.attach).not.toHaveBeenCalled();
  });

  it("bounds failed subscription recovery and exposes diagnostics", async () => {
    vi.useFakeTimers();
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));
    await act(async () => {
      await result.current.join(lounge);
    });
    const room = liveKitState.rooms[0]!;
    const participant = remoteParticipant("mira", "Mira");
    const { publication } = remoteAudioPublication();
    publication.isSubscribed = false;
    publication.subscriptionStatus = "unsubscribed";
    participant.testTrackPublications.push(publication);
    room.remoteParticipants.set("mira", participant);

    for (
      let attempt = 0;
      attempt <= MAX_SUBSCRIPTION_RECOVERY_ATTEMPTS;
      attempt += 1
    ) {
      act(() =>
        room.emit(
          "trackSubscriptionFailed",
          publication.trackSid,
          participant,
          1,
        ),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SUBSCRIPTION_RECOVERY_DELAY_MS);
      });
    }

    expect(publication.setSubscribed).toHaveBeenCalledTimes(
      MAX_SUBSCRIPTION_RECOVERY_ATTEMPTS * 2,
    );
    expect(result.current.voiceContinuityWarning).toContain(
      "could not restore",
    );
    expect(result.current.voiceDiagnosticsAvailable).toBe(true);
    vi.useRealTimers();
  });

  it("routes paused and resumed stream state into playback recovery", async () => {
    const setStreamState = vi
      .spyOn(RemoteAudioRenderer.prototype, "setStreamState")
      .mockImplementation(() => undefined);
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));
    await act(async () => {
      await result.current.join(lounge);
    });
    const room = liveKitState.rooms[0]!;
    const participant = remoteParticipant("mira", "Mira");
    const { publication, track } = remoteAudioPublication();
    participant.testTrackPublications.push(publication);
    room.remoteParticipants.set("mira", participant);
    act(() => room.emit("trackSubscribed", track, publication, participant));

    act(() =>
      room.emit("trackStreamStateChanged", publication, "paused", participant),
    );
    act(() =>
      room.emit("trackStreamStateChanged", publication, "active", participant),
    );

    expect(setStreamState).toHaveBeenNthCalledWith(1, track, "paused");
    expect(setStreamState).toHaveBeenNthCalledWith(2, track, "active");
  });

  it("debounces preparation, prewarms without media, and consumes the cached room on click", async () => {
    vi.useFakeTimers();
    const freshTokenResponse = {
      data: {
        ...tokenResponse.data,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
      error: null,
    };
    supabaseState.invoke.mockResolvedValueOnce(freshTokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    act(() => result.current.prepareVoiceChannel(lounge));
    expect(supabaseState.invoke).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(VOICE_PREPARE_DEBOUNCE_MS - 1);
      await Promise.resolve();
    });
    expect(supabaseState.invoke).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(supabaseState.invoke).toHaveBeenCalledOnce();
    const preparedRoom = liveKitState.instances.at(-1);
    expect(preparedRoom).toBeDefined();
    expect(preparedRoom?.prepareConnection).toHaveBeenCalledWith(
      "wss://bakbak.livekit.cloud",
      "signed.jwt.token",
    );
    expect(liveKitState.createLocalAudioTrack).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.join(lounge);
    });

    expect(supabaseState.invoke).toHaveBeenCalledOnce();
    expect(liveKitState.rooms[0]).toBe(preparedRoom);
    expect(liveKitState.createLocalAudioTrack).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("connected");
  });

  it("starts keyboard-focus preparation without the pointer dwell", async () => {
    vi.useFakeTimers();
    supabaseState.invoke.mockResolvedValueOnce({
      data: {
        ...tokenResponse.data,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
      error: null,
    });
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    act(() => result.current.prepareVoiceChannel(lounge, true));
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(supabaseState.invoke).toHaveBeenCalledOnce();
  });

  it("consumes preparation while its token request is still in flight", async () => {
    vi.useFakeTimers();
    const freshTokenResponse = {
      data: {
        ...tokenResponse.data,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
      error: null,
    };
    const tokenRequest = deferred<typeof freshTokenResponse>();
    supabaseState.invoke.mockReturnValueOnce(tokenRequest.promise);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    act(() => result.current.prepareVoiceChannel(lounge));
    await act(async () => {
      vi.advanceTimersByTime(VOICE_PREPARE_DEBOUNCE_MS);
      await Promise.resolve();
    });
    const preparedRoom = liveKitState.instances.at(-1);

    let joinPromise!: Promise<void>;
    act(() => {
      joinPromise = result.current.join(lounge);
    });
    expect(supabaseState.invoke).toHaveBeenCalledOnce();

    await act(async () => {
      tokenRequest.resolve(freshTokenResponse);
      await joinPromise;
    });

    expect(liveKitState.rooms[0]).toBe(preparedRoom);
    expect(result.current.status).toBe("connected");
  });

  it("disposes stale channel preparation and the final candidate on teardown", async () => {
    vi.useFakeTimers();
    const freshTokenResponse = {
      data: {
        ...tokenResponse.data,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
      error: null,
    };
    supabaseState.invoke.mockResolvedValue(freshTokenResponse);
    const { result, unmount } = renderHook(() => useVoiceRoom(user, "live"));

    act(() => result.current.prepareVoiceChannel(lounge));
    await act(async () => {
      vi.advanceTimersByTime(VOICE_PREPARE_DEBOUNCE_MS);
      await Promise.resolve();
      await Promise.resolve();
    });
    const firstCandidate = liveKitState.instances.at(-1);

    act(() => result.current.prepareVoiceChannel(coffeeTable));
    await act(async () => {
      vi.advanceTimersByTime(VOICE_PREPARE_DEBOUNCE_MS);
      await Promise.resolve();
      await Promise.resolve();
    });
    const secondCandidate = liveKitState.instances.at(-1);

    expect(firstCandidate?.disconnect).toHaveBeenCalledOnce();
    expect(secondCandidate).not.toBe(firstCandidate);
    expect(liveKitState.createLocalAudioTrack).not.toHaveBeenCalled();

    unmount();
    expect(secondCandidate?.disconnect).toHaveBeenCalledOnce();
  });

  it("keeps the connecting loader active until soundboard publication settles", async () => {
    const soundboardReady = deferred<void>();
    vi.spyOn(
      SoundboardAudioPublisher.prototype,
      "ensurePublished",
    ).mockReturnValueOnce(soundboardReady.promise);
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    let joinPromise!: Promise<void>;
    act(() => {
      joinPromise = result.current.join(lounge);
    });

    await waitFor(() => expect(result.current.joinStage).toBe("soundboard"));
    expect(result.current.status).toBe("connecting");

    await act(async () => {
      soundboardReady.resolve(undefined);
      await joinPromise;
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.joinStage).toBeNull();
  });

  it("destroys local sound routing on stop-all and voice leave", async () => {
    const soundCleanup = vi.spyOn(
      SoundboardAudioPublisher.prototype,
      "cleanup",
    );
    const outputCleanup = vi.spyOn(AudioOutputRouter.prototype, "cleanup");
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
    });
    const soundCallsAfterJoin = soundCleanup.mock.calls.length;
    const outputCallsAfterJoin = outputCleanup.mock.calls.length;

    await act(async () => {
      await result.current.stopLocalSounds();
    });
    expect(soundCleanup).toHaveBeenCalledTimes(soundCallsAfterJoin + 1);
    expect(outputCleanup).toHaveBeenCalledTimes(outputCallsAfterJoin + 1);
    expect(soundCleanup.mock.invocationCallOrder.at(-1)).toBeLessThan(
      outputCleanup.mock.invocationCallOrder.at(-1)!,
    );

    await act(async () => {
      await result.current.leave();
    });
    expect(soundCleanup).toHaveBeenCalledTimes(soundCallsAfterJoin + 2);
    expect(outputCleanup).toHaveBeenCalledTimes(outputCallsAfterJoin + 2);
  });

  it("requests a companion token and stops the native share on voice leave", async () => {
    const effects = vi.fn();
    screenShareState.desktop = true;
    screenShareState.getCapabilities.mockResolvedValue({
      available: true,
      nativeCapture: true,
      systemAudio: true,
      reason: null,
    });
    screenShareState.start.mockResolvedValue({
      sessionId: "native-share-1",
      sourceLabel: "Demo window",
      sourceKind: "window",
      audioPublished: true,
      audioUnavailableReason: null,
      settings: { resolution: 1080, frameRate: 60 },
    });
    supabaseState.invoke
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() =>
      useVoiceRoom(user, "live", mockSoundboardController, effects),
    );

    await act(async () => {
      await result.current.join(lounge);
    });
    await waitFor(() => expect(result.current.screenShareAvailable).toBe(true));

    await act(async () => {
      await result.current.startScreenShare(true, {
        resolution: 1080,
        frameRate: 60,
      });
    });

    expect(supabaseState.invoke).toHaveBeenNthCalledWith(2, "livekit-token", {
      body: { channelId: lounge.id, purpose: "screen_share" },
    });
    expect(screenShareState.start).toHaveBeenCalledWith({
      serverUrl: "wss://bakbak.livekit.cloud",
      token: "signed.jwt.token",
      includeAudio: true,
      settings: { resolution: 1080, frameRate: 60 },
    });
    expect(result.current.screenShareEnabled).toBe(true);
    expect(effects).toHaveBeenCalledWith({
      type: "screen-share-started",
      actor: "self",
    });

    await act(async () => {
      await result.current.stopScreenShare();
    });
    expect(effects).toHaveBeenCalledWith({
      type: "screen-share-stopped",
      actor: "self",
    });
    expect(screenShareState.stop).toHaveBeenCalledWith("native-share-1");

    await act(async () => {
      await result.current.leave();
    });
    expect(screenShareState.stop.mock.invocationCallOrder[0]).toBeLessThan(
      liveKitState.rooms[0]!.disconnect.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps native video live when Windows isolation downgrades audio", async () => {
    let onLifecycle: ((event: ScreenShareLifecycleEvent) => void) | undefined;
    screenShareState.desktop = true;
    screenShareState.getCapabilities.mockResolvedValue({
      available: true,
      nativeCapture: true,
      systemAudio: true,
      reason: null,
    });
    screenShareState.listen.mockImplementation(
      (callback: (event: ScreenShareLifecycleEvent) => void) => {
        onLifecycle = callback;
        return Promise.resolve(() => undefined);
      },
    );
    screenShareState.start.mockResolvedValue({
      sessionId: "native-share-1",
      sourceLabel: "Screen 1",
      sourceKind: "display",
      audioPublished: true,
      audioUnavailableReason: null,
      settings: { resolution: 1080, frameRate: 60 },
    });
    supabaseState.invoke
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
    });
    await waitFor(() => expect(onLifecycle).toBeDefined());
    await act(async () => {
      await result.current.startScreenShare(true, {
        resolution: 1080,
        frameRate: 60,
      });
    });

    const reason =
      "Bakbak's WebView2 audio process tree changed, so screen audio was stopped; video is still sharing.";
    act(() => {
      onLifecycle?.({
        state: "sharing",
        sessionId: "native-share-1",
        sourceLabel: "Screen 1",
        sourceKind: "display",
        audioPublished: false,
        audioUnavailableReason: reason,
        settings: { resolution: 1080, frameRate: 60 },
        message: `[audio-isolation-unavailable] ${reason}`,
        failure: {
          code: "audio-isolation-unavailable",
          message: reason,
          recommendedRetrySource: null,
        },
      });
    });

    expect(result.current.screenShareEnabled).toBe(true);
    expect(result.current.screenShareAudioPublished).toBe(false);
    expect(result.current.screenShareError).toBe(reason);
    expect(result.current.screenShareFailure?.code).toBe(
      "audio-isolation-unavailable",
    );
  });

  it("shows the native isolation reason when a share starts video-only", async () => {
    const reason =
      "Bakbak could not verify its WebView2 audio process tree, so Entire screen audio is disabled; video sharing still works.";
    screenShareState.desktop = true;
    screenShareState.getCapabilities.mockResolvedValue({
      available: true,
      nativeCapture: true,
      systemAudio: true,
      reason: null,
    });
    screenShareState.start.mockResolvedValue({
      sessionId: "native-share-1",
      sourceLabel: "Screen 1",
      sourceKind: "display",
      audioPublished: false,
      audioUnavailableReason: reason,
      settings: { resolution: 1080, frameRate: 60 },
    });
    supabaseState.invoke
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
    });
    await waitFor(() => expect(result.current.screenShareAvailable).toBe(true));
    await act(async () => {
      await result.current.startScreenShare(true, {
        resolution: 1080,
        frameRate: 60,
      });
    });

    expect(result.current.screenShareEnabled).toBe(true);
    expect(result.current.screenShareAudioPublished).toBe(false);
    expect(result.current.screenShareError).toBe(reason);
  });

  it("keeps voice alive and exposes a retryable native screen-share failure", async () => {
    screenShareState.desktop = true;
    screenShareState.getCapabilities.mockResolvedValue({
      available: true,
      nativeCapture: true,
      systemAudio: true,
      reason: null,
    });
    screenShareState.start.mockRejectedValue(
      "macOS started capture but did not deliver a video frame.",
    );
    supabaseState.invoke
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
    });
    await waitFor(() => expect(result.current.screenShareAvailable).toBe(true));

    await act(async () => {
      await result.current.startScreenShare(false, {
        resolution: 1080,
        frameRate: 60,
      });
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.screenShareState).toBe("error");
    expect(result.current.screenShareError).toBe(
      "macOS started capture but did not deliver a video frame.",
    );
  });

  it("rolls a failed live quality change back without ending the share", async () => {
    screenShareState.desktop = true;
    screenShareState.getCapabilities.mockResolvedValue({
      available: true,
      nativeCapture: true,
      systemAudio: true,
      sourceKinds: ["display", "window", "application"],
      resolutions: [480, 720, 1080],
      frameRates: [15, 30, 60],
      dynamicSettings: true,
      customPicker: false,
      reason: null,
    });
    screenShareState.start.mockResolvedValue({
      sessionId: "native-share-1",
      sourceLabel: "Demo window",
      sourceKind: "window",
      audioPublished: false,
      settings: { resolution: 1080, frameRate: 60 },
    });
    screenShareState.update.mockRejectedValue(
      new Error("The encoder rejected 720p."),
    );
    supabaseState.invoke
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
    });
    await waitFor(() => expect(result.current.screenShareAvailable).toBe(true));
    await act(async () => {
      await result.current.startScreenShare(false, {
        resolution: 1080,
        frameRate: 60,
      });
    });
    await act(async () => {
      await result.current.updateScreenShareSettings({
        resolution: 720,
        frameRate: 30,
      });
    });

    expect(result.current.screenShareEnabled).toBe(true);
    expect(result.current.screenShareSettings).toEqual({
      resolution: 1080,
      frameRate: 60,
    });
    expect(result.current.screenShareError).toBe("The encoder rejected 720p.");
  });

  it("does not connect or publish a microphone after leaving during a pending token request", async () => {
    const tokenRequest = deferred<typeof tokenResponse>();
    supabaseState.invoke.mockReturnValueOnce(tokenRequest.promise);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    let joinPromise!: Promise<void>;
    act(() => {
      joinPromise = result.current.join(lounge);
    });

    await waitFor(() => expect(supabaseState.invoke).toHaveBeenCalledOnce());
    await act(async () => {
      await result.current.leave();
    });

    await act(async () => {
      tokenRequest.resolve(tokenResponse);
      await joinPromise;
    });

    expect(liveKitState.rooms).toHaveLength(0);
    expect(result.current.status).toBe("disconnected");
    expect(result.current.channel).toBeNull();
  });

  it("keeps the default microphone when a device change is requested during a pending join", async () => {
    const tokenRequest = deferred<typeof tokenResponse>();
    supabaseState.invoke.mockReturnValueOnce(tokenRequest.promise);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    let joinPromise!: Promise<void>;
    act(() => {
      joinPromise = result.current.join(lounge);
    });
    await waitFor(() => expect(result.current.status).toBe("connecting"));

    await act(async () => {
      await result.current.setInputDevice("usb-microphone");
    });
    expect(result.current.selectedInputId).toBe("default");

    await act(async () => {
      tokenRequest.resolve(tokenResponse);
      await joinPromise;
    });

    const room = liveKitState.rooms[0];
    expect(room).toBeDefined();
    expect(room?.localParticipant.publishTrack).toHaveBeenCalledWith(
      expect.anything(),
      {
        name: SPEECH_MICROPHONE_TRACK_NAME,
        source: "microphone",
      },
    );
    expect(result.current.selectedInputId).toBe("default");
    expect(result.current.status).toBe("connected");
  });

  it("keeps device selection gated while replacing a connected room", async () => {
    const secondTokenRequest = deferred<typeof tokenResponse>();
    const firstDisconnect = deferred<void>();
    supabaseState.invoke
      .mockResolvedValueOnce(tokenResponse)
      .mockReturnValueOnce(secondTokenRequest.promise);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
    });
    const firstRoom = liveKitState.rooms[0];
    expect(firstRoom).toBeDefined();
    expect(result.current.status).toBe("connected");
    firstRoom?.disconnect.mockReturnValueOnce(firstDisconnect.promise);

    let secondJoin!: Promise<void>;
    act(() => {
      secondJoin = result.current.join(coffeeTable);
    });

    await waitFor(() => expect(result.current.status).toBe("connecting"));
    expect(result.current.channel).toEqual(coffeeTable);
    expect(supabaseState.invoke).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.setInputDevice("usb-microphone");
    });
    expect(result.current.selectedInputId).toBe("default");

    act(() => firstDisconnect.resolve(undefined));
    await act(async () => {
      secondTokenRequest.resolve(tokenResponse);
      await secondJoin;
    });

    const secondRoom = liveKitState.rooms[1];
    expect(secondRoom).toBeDefined();
    expect(secondRoom?.localParticipant.publishTrack).toHaveBeenCalledWith(
      expect.anything(),
      {
        name: SPEECH_MICROPHONE_TRACK_NAME,
        source: "microphone",
      },
    );
    expect(firstRoom?.localParticipant.unpublishTrack).toHaveBeenCalled();
    expect(result.current.selectedInputId).toBe("default");
    expect(result.current.status).toBe("connected");
    expect(result.current.channel).toEqual(coffeeTable);
  });

  it("restarts the connected speech track and commits the selected microphone", async () => {
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
    });
    const room = liveKitState.rooms[0];
    const microphone = room?.localParticipant
      .getTrackPublications()
      .find(
        (publication) => publication.trackName === SPEECH_MICROPHONE_TRACK_NAME,
      )?.track as unknown as {
      restartTrack: Mock;
      isMuted: boolean;
    };

    await act(async () => {
      await result.current.setInputDevice("usb-microphone");
    });

    expect(microphone.restartTrack).toHaveBeenCalledWith({
      deviceId: "usb-microphone",
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48_000,
    });
    expect(result.current.selectedInputId).toBe("usb-microphone");
    expect(result.current.inputDeviceError).toBeNull();
    expect(room?.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.toggleMute();
      await result.current.setInputDevice("default");
    });
    expect(microphone.isMuted).toBe(true);
    expect(result.current.selectedInputId).toBe("default");
  });

  it("serializes microphone changes while a restart is pending", async () => {
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));
    await act(async () => {
      await result.current.join(lounge);
    });
    const microphone = liveKitState.rooms[0]?.localParticipant
      .getTrackPublications()
      .find(
        (publication) => publication.trackName === SPEECH_MICROPHONE_TRACK_NAME,
      )?.track as unknown as { restartTrack: Mock };
    const restart = deferred<void>();
    microphone.restartTrack.mockReturnValueOnce(restart.promise);

    let firstSwitch!: Promise<void>;
    act(() => {
      firstSwitch = result.current.setInputDevice("usb-microphone");
    });
    await waitFor(() => expect(result.current.inputDevicePending).toBe(true));

    await act(async () => {
      await result.current.setInputDevice("ignored-microphone");
    });
    expect(microphone.restartTrack).toHaveBeenCalledTimes(1);

    await act(async () => {
      restart.resolve(undefined);
      await firstSwitch;
    });
    expect(result.current.inputDevicePending).toBe(false);
    expect(result.current.selectedInputId).toBe("usb-microphone");
  });

  it("does not commit a microphone restart after its room becomes stale", async () => {
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));
    await act(async () => {
      await result.current.join(lounge);
    });
    const microphone = liveKitState.rooms[0]?.localParticipant
      .getTrackPublications()
      .find(
        (publication) => publication.trackName === SPEECH_MICROPHONE_TRACK_NAME,
      )?.track as unknown as { restartTrack: Mock };
    const restart = deferred<void>();
    microphone.restartTrack.mockReturnValueOnce(restart.promise);

    let inputSwitch!: Promise<void>;
    act(() => {
      inputSwitch = result.current.setInputDevice("usb-microphone");
    });
    await waitFor(() => expect(result.current.inputDevicePending).toBe(true));

    await act(async () => {
      await result.current.leave();
      restart.resolve(undefined);
      await inputSwitch;
    });

    expect(result.current.status).toBe("disconnected");
    expect(result.current.inputDevicePending).toBe(false);
    expect(result.current.selectedInputId).toBe("default");
  });

  it("keeps the previous microphone after a recovered switch failure", async () => {
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));
    await act(async () => {
      await result.current.join(lounge);
    });
    const microphone = liveKitState.rooms[0]?.localParticipant
      .getTrackPublications()
      .find(
        (publication) => publication.trackName === SPEECH_MICROPHONE_TRACK_NAME,
      )?.track as unknown as { restartTrack: Mock };
    microphone.restartTrack
      .mockRejectedValueOnce(new Error("device vanished"))
      .mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.setInputDevice("missing-microphone");
    });

    expect(microphone.restartTrack).toHaveBeenCalledTimes(2);
    expect(result.current.selectedInputId).toBe("default");
    expect(result.current.inputDeviceError).toContain(
      "previous microphone is still active",
    );
  });

  it("reports when both a microphone switch and its rollback fail", async () => {
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));
    await act(async () => {
      await result.current.join(lounge);
    });
    const microphone = liveKitState.rooms[0]?.localParticipant
      .getTrackPublications()
      .find(
        (publication) => publication.trackName === SPEECH_MICROPHONE_TRACK_NAME,
      )?.track as unknown as { restartTrack: Mock };
    microphone.restartTrack.mockRejectedValue(new Error("capture failed"));

    await act(async () => {
      await result.current.setInputDevice("missing-microphone");
    });

    expect(result.current.selectedInputId).toBe("default");
    expect(result.current.inputDeviceError).toContain(
      "couldn't restore the previous one",
    );
  });

  it("applies the macOS full-volume mode to an active microphone", async () => {
    screenShareState.desktop = true;
    const originalUserAgent = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    });
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    try {
      const { result } = renderHook(() => useVoiceRoom(user, "live"));
      await act(async () => {
        await result.current.join(lounge);
      });
      const microphone = liveKitState.rooms[0]?.localParticipant
        .getTrackPublications()
        .find(
          (publication) =>
            publication.trackName === SPEECH_MICROPHONE_TRACK_NAME,
        )?.track as unknown as { restartTrack: Mock };

      await act(async () => {
        await result.current.setMacosKeepOtherAudioFullVolume(true);
      });

      expect(result.current.macosFullVolumeModeAvailable).toBe(true);
      expect(result.current.macosKeepOtherAudioFullVolume).toBe(true);
      expect(microphone.restartTrack).toHaveBeenCalledWith(
        expect.objectContaining({ echoCancellation: false }),
      );
    } finally {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: originalUserAgent,
      });
    }
  });

  it("mutes and reuses speech when the soundboard microphone publication arrives first", async () => {
    const effects = vi.fn();
    const microphone = createLocalAudioTrackDouble();
    const soundboardTrack = createLocalAudioTrackDouble();
    const microphoneReady = deferred<typeof microphone>();
    const soundboardPublications: PublicationDouble[] = [];
    liveKitState.createLocalAudioTrack.mockReturnValueOnce(
      microphoneReady.promise,
    );
    vi.spyOn(
      SoundboardAudioPublisher.prototype,
      "ensurePublished",
    ).mockImplementation(async (participant) => {
      const publication = (await participant.publishTrack(
        soundboardTrack as unknown as MediaStreamTrack,
        {
          name: SOUNDBOARD_TRACK_NAME,
          source: Track.Source.Microphone,
        },
      )) as unknown as PublicationDouble;
      await publication.mute();
      soundboardPublications.push(publication);
    });
    supabaseState.invoke
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() =>
      useVoiceRoom(user, "live", mockSoundboardController, effects),
    );

    let firstJoin!: Promise<void>;
    act(() => {
      firstJoin = result.current.join(lounge);
    });
    await waitFor(() => expect(liveKitState.rooms).toHaveLength(1));
    const firstRoom = liveKitState.rooms[0];
    await waitFor(() =>
      expect(firstRoom?.localParticipant.getTrackPublications()).toHaveLength(
        1,
      ),
    );
    expect(
      firstRoom?.localParticipant.getTrackPublications()[0]?.trackName,
    ).toBe(SOUNDBOARD_TRACK_NAME);

    await act(async () => {
      microphoneReady.resolve(microphone);
      await firstJoin;
    });

    const firstPublications =
      firstRoom?.localParticipant.getTrackPublications();
    const speechPublication = firstPublications?.find(
      (publication) => publication.trackName === SPEECH_MICROPHONE_TRACK_NAME,
    );
    const firstSoundboardPublication = soundboardPublications[0];
    expect(speechPublication?.track).toBe(microphone);
    expect(result.current.participants[0]?.isMuted).toBe(false);

    const soundboardMuteCalls =
      firstSoundboardPublication?.mute.mock.calls.length;
    await act(async () => {
      await result.current.toggleMute();
    });
    expect(speechPublication?.mute).toHaveBeenCalledOnce();
    expect(firstSoundboardPublication?.mute).toHaveBeenCalledTimes(
      soundboardMuteCalls ?? 0,
    );
    expect(microphone.isMuted).toBe(true);
    expect(result.current.muted).toBe(true);
    expect(result.current.participants[0]?.isMuted).toBe(true);
    expect(effects).toHaveBeenCalledWith({ type: "microphone-muted" });

    await act(async () => {
      await firstSoundboardPublication?.unmute();
    });
    expect(soundboardTrack.isMuted).toBe(false);
    expect(microphone.isMuted).toBe(true);
    expect(result.current.muted).toBe(true);

    await act(async () => {
      await result.current.toggleMute();
    });
    expect(speechPublication?.unmute).toHaveBeenCalledOnce();
    expect(result.current.muted).toBe(false);
    expect(result.current.participants[0]?.isMuted).toBe(false);
    expect(effects).toHaveBeenCalledWith({ type: "microphone-unmuted" });

    await act(async () => {
      await result.current.toggleDeafen();
    });
    expect(result.current.deafened).toBe(true);
    expect(effects).toHaveBeenCalledWith({ type: "deafen-enabled" });

    await act(async () => {
      await result.current.toggleDeafen();
    });
    expect(result.current.deafened).toBe(false);
    expect(effects).toHaveBeenCalledWith({ type: "deafen-disabled" });

    await act(async () => {
      await result.current.toggleMute();
      await result.current.join(coffeeTable);
    });

    const secondRoom = liveKitState.rooms[1];
    expect(firstRoom?.localParticipant.unpublishTrack).toHaveBeenCalledWith(
      microphone,
      false,
    );
    expect(secondRoom?.localParticipant.publishTrack).toHaveBeenCalledWith(
      microphone,
      {
        name: SPEECH_MICROPHONE_TRACK_NAME,
        source: "microphone",
      },
    );
    expect(result.current.muted).toBe(true);

    await act(async () => {
      await result.current.leave();
    });
    expect(microphone.stop).toHaveBeenCalled();
  });

  it("keeps the current state and reports an error when speech mute fails", async () => {
    const effects = vi.fn();
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() =>
      useVoiceRoom(user, "live", mockSoundboardController, effects),
    );

    await act(async () => {
      await result.current.join(lounge);
    });
    const room = liveKitState.rooms[0];
    const publications = room?.localParticipant.getTrackPublications();
    const speechPublication = publications?.find(
      (publication) => publication.trackName === SPEECH_MICROPHONE_TRACK_NAME,
    );
    speechPublication?.mute.mockRejectedValueOnce(
      new Error("microphone disappeared"),
    );

    await act(async () => {
      await result.current.toggleMute();
    });

    expect(result.current.muted).toBe(false);
    expect(result.current.participants[0]?.isMuted).toBe(false);
    expect(result.current.inputDeviceError).toContain(
      "could not mute the microphone",
    );
    expect(effects).not.toHaveBeenCalledWith({ type: "microphone-muted" });
    expect(room?.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  });

  it("stops the retained microphone when the previous room cannot disconnect", async () => {
    supabaseState.invoke
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
    });
    const firstRoom = liveKitState.rooms[0];
    const publishCalls = firstRoom?.localParticipant.publishTrack.mock.calls as
      [unknown, { source?: string; name?: string }?][] | undefined;
    const microphone = publishCalls?.find(
      ([, options]) => options?.name === SPEECH_MICROPHONE_TRACK_NAME,
    )?.[0] as { stop: ReturnType<typeof vi.fn> } | undefined;
    firstRoom?.disconnect.mockRejectedValueOnce(new Error("disconnect failed"));

    await act(async () => {
      await result.current.join(coffeeTable);
    });

    expect(microphone?.stop).toHaveBeenCalled();
    expect(liveKitState.rooms).toHaveLength(1);
    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("close the previous voice room");
  });

  it("disconnects a stale room and prevents its delayed connect from publishing the microphone", async () => {
    const firstTokenRequest = deferred<typeof tokenResponse>();
    const secondTokenRequest = deferred<typeof tokenResponse>();
    const firstConnect = deferred<void>();
    liveKitState.connectResults.push(firstConnect.promise, Promise.resolve());
    supabaseState.invoke
      .mockReturnValueOnce(firstTokenRequest.promise)
      .mockReturnValueOnce(secondTokenRequest.promise);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    let firstJoin!: Promise<void>;
    act(() => {
      firstJoin = result.current.join(lounge);
    });
    await waitFor(() => expect(supabaseState.invoke).toHaveBeenCalledOnce());

    act(() => firstTokenRequest.resolve(tokenResponse));
    await waitFor(() => expect(liveKitState.rooms).toHaveLength(1));
    const firstRoom = liveKitState.rooms[0];
    expect(firstRoom).toBeDefined();
    expect(firstRoom?.connect).toHaveBeenCalledOnce();

    let secondJoin!: Promise<void>;
    act(() => {
      secondJoin = result.current.join(coffeeTable);
    });
    await waitFor(() => expect(supabaseState.invoke).toHaveBeenCalledTimes(2));
    expect(firstRoom?.disconnect).toHaveBeenCalledOnce();

    await act(async () => {
      firstConnect.resolve(undefined);
      await firstJoin;
    });

    expect(firstRoom?.disconnect).toHaveBeenCalledTimes(2);
    expect(firstRoom?.localParticipant.publishTrack).not.toHaveBeenCalled();

    await act(async () => {
      secondTokenRequest.resolve(tokenResponse);
      await secondJoin;
    });

    const secondRoom = liveKitState.rooms[1];
    expect(secondRoom).toBeDefined();
    expect(secondRoom?.connect).toHaveBeenCalledOnce();
    expect(secondRoom?.localParticipant.publishTrack).toHaveBeenCalledWith(
      expect.anything(),
      {
        name: SPEECH_MICROPHONE_TRACK_NAME,
        source: "microphone",
      },
    );
    expect(result.current.status).toBe("connected");
    expect(result.current.channel).toEqual(coffeeTable);
  });

  it("retries an ICE peer connection failure with relay-only transport", async () => {
    liveKitState.connectResults.push(
      Promise.reject(new Error("could not establish pc connection")),
      Promise.resolve(),
    );
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
    });

    expect(liveKitState.rooms).toHaveLength(2);
    expect(liveKitState.rooms[0]?.disconnect).toHaveBeenCalled();
    expect(liveKitState.rooms[1]?.connect).toHaveBeenCalledWith(
      "wss://bakbak.livekit.cloud",
      "signed.jwt.token",
      {
        rtcConfig: { iceTransportPolicy: "relay" },
        maxRetries: 0,
      },
    );
    expect(
      liveKitState.rooms[1]?.localParticipant.publishTrack,
    ).toHaveBeenCalledWith(expect.anything(), {
      name: SPEECH_MICROPHONE_TRACK_NAME,
      source: "microphone",
    });
    expect(result.current.status).toBe("connected");
  });

  it("prefers relay for ten minutes after fallback and then probes direct again", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    liveKitState.connectResults.push(
      Promise.reject(new Error("could not establish pc connection")),
      Promise.resolve(),
      Promise.resolve(),
      Promise.resolve(),
    );
    supabaseState.invoke
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
      await result.current.join(coffeeTable);
    });

    expect(liveKitState.rooms[2]?.connect).toHaveBeenCalledWith(
      "wss://bakbak.livekit.cloud",
      "signed.jwt.token",
      {
        rtcConfig: { iceTransportPolicy: "relay" },
        maxRetries: 0,
      },
    );

    now.mockReturnValue(1_000 + RELAY_PREFERENCE_DURATION_MS + 1);
    await act(async () => {
      await result.current.join(lounge);
    });

    expect(liveKitState.rooms[3]?.connect).toHaveBeenCalledWith(
      "wss://bakbak.livekit.cloud",
      "signed.jwt.token",
    );
  });

  it("allows five overlapping local sounds and rejects the sixth before playback", async () => {
    const { result } = renderHook(() => useVoiceRoom(user, "mock"));
    await act(async () => {
      await result.current.join(lounge);
    });
    const soundId = result.current.soundboard.sounds[0]!.id;

    let outcomes!: PromiseSettledResult<void>[];
    await act(async () => {
      outcomes = await Promise.allSettled(
        Array.from({ length: 6 }, () => result.current.dispatchSound(soundId)),
      );
    });

    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(5);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    expect(result.current.activeLocalSoundCount).toBe(5);

    await act(async () => {
      await result.current.stopLocalSounds();
    });
    expect(result.current.activeLocalSoundCount).toBe(0);
  });

  it("keeps pending starts reserved and cancels them through stop-all", async () => {
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const pendingAsset = deferred<Blob | null>();
    const getBlob = vi.fn(() => pendingAsset.promise);
    const soundboard = { ...mockSoundboardController, getBlob };
    const { result } = renderHook(() => useVoiceRoom(user, "live", soundboard));

    await act(async () => {
      await result.current.join(lounge);
    });
    vi.useFakeTimers();
    const sound = soundboard.sounds[0]!;
    const pendingPlays: Promise<unknown>[] = [];
    act(() => {
      for (let index = 0; index < MAX_CONCURRENT_SOUNDS_PER_USER; index += 1) {
        pendingPlays.push(
          result.current
            .dispatchSound(sound.id)
            .catch((error: unknown) => error),
        );
      }
    });

    await act(async () => Promise.resolve());
    expect(getBlob).toHaveBeenCalledTimes(MAX_CONCURRENT_SOUNDS_PER_USER);
    expect(result.current.activeLocalSoundCount).toBe(
      MAX_CONCURRENT_SOUNDS_PER_USER,
    );

    await act(async () => {
      vi.advanceTimersByTime(sound.durationMs + 1_000);
      await Promise.resolve();
    });
    expect(result.current.activeLocalSoundCount).toBe(
      MAX_CONCURRENT_SOUNDS_PER_USER,
    );

    let sixthError: unknown;
    await act(async () => {
      sixthError = await result.current
        .dispatchSound(sound.id)
        .catch((error: unknown) => error);
    });
    expect(sixthError).toBeInstanceOf(Error);
    expect(getBlob).toHaveBeenCalledTimes(MAX_CONCURRENT_SOUNDS_PER_USER);

    await act(async () => {
      await result.current.stopLocalSounds();
    });
    expect(result.current.activeLocalSoundCount).toBe(0);

    let cancelledStarts: unknown[] = [];
    await act(async () => {
      pendingAsset.resolve(new Blob(["audio"], { type: "audio/mpeg" }));
      cancelledStarts = await Promise.all(pendingPlays);
    });
    expect(
      cancelledStarts.every(
        (error) => error instanceof DOMException && error.name === "AbortError",
      ),
    ).toBe(true);
    expect(
      liveKitState.rooms[0]?.localParticipant.publishData,
    ).toHaveBeenCalledOnce();
  });

  it("rolls back the reservation before publishing when an asset start fails", async () => {
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const startFailure = new Error("asset failed");
    const soundboard = {
      ...mockSoundboardController,
      getBlob: vi.fn().mockRejectedValue(startFailure),
    };
    const { result } = renderHook(() => useVoiceRoom(user, "live", soundboard));

    await act(async () => {
      await result.current.join(lounge);
    });

    let receivedError: unknown;
    await act(async () => {
      receivedError = await result.current
        .dispatchSound(soundboard.sounds[0]!.id)
        .catch((error: unknown) => error);
    });

    expect(receivedError).toBe(startFailure);
    expect(result.current.activeLocalSoundCount).toBe(0);
    expect(
      liveKitState.rooms[0]?.localParticipant.publishData,
    ).not.toHaveBeenCalled();
  });

  it("publishes 720p camera video only after an explicit toggle", async () => {
    supabaseState.invoke.mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));
    await act(async () => {
      await result.current.join(lounge);
    });
    const room = liveKitState.rooms[0];
    expect(room).toBeDefined();
    room?.localParticipant.setCameraEnabled.mockResolvedValueOnce({});

    await act(async () => {
      await result.current.toggleCamera();
    });

    expect(room?.localParticipant.setCameraEnabled).toHaveBeenCalledWith(true, {
      resolution: { width: 1280, height: 720 },
    });
  });
});

type LocalAudioTrackDouble = PublicationDouble["track"] & {
  stop: Mock<() => void>;
  mute: Mock<() => Promise<unknown>>;
  unmute: Mock<() => Promise<unknown>>;
};

function createLocalAudioTrackDouble(): LocalAudioTrackDouble {
  const LocalAudioTrackDoubleConstructor =
    LocalAudioTrack as unknown as new () => LocalAudioTrackDouble;
  return new LocalAudioTrackDoubleConstructor();
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
