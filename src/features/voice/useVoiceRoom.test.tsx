import { act, renderHook, waitFor } from "@testing-library/react";
import { ConnectionQuality } from "livekit-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser, Channel } from "../../lib/types";
import {
  MAX_CONCURRENT_SOUNDS_PER_USER,
  clampSoundboardActivities,
} from "../soundboard/limits";
import { mockSoundboardController } from "../soundboard/mock-catalog";
import { SoundboardAudioPublisher } from "../soundboard/soundboard-audio";
import { AudioOutputRouter } from "./audio-output-router";
import {
  RELAY_PREFERENCE_DURATION_MS,
  VOICE_PREPARE_DEBOUNCE_MS,
  VOICE_TOKEN_EXPIRY_BUFFER_MS,
  isPreparedVoiceTokenUsable,
  normalizeVoiceConnectionQuality,
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
  localParticipant: {
    setMicrophoneEnabled: ReturnType<typeof vi.fn>;
    setCameraEnabled: ReturnType<typeof vi.fn>;
    publishData: ReturnType<typeof vi.fn>;
    publishTrack: ReturnType<typeof vi.fn>;
    unpublishTrack: ReturnType<typeof vi.fn>;
  };
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
  start: vi.fn(),
  stop: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("livekit-client", () => {
  class ConnectionError extends Error {
    readonly reason = 2;
  }

  class LocalAudioTrack {
    readonly stop = vi.fn();
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
    readonly remoteParticipants = new Map();
    private microphoneTrack: LocalAudioTrack | null = null;
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
        source === "microphone" && this.microphoneTrack
          ? { track: this.microphoneTrack }
          : undefined,
      ),
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      setCameraEnabled: vi.fn().mockResolvedValue(undefined),
      publishData: vi.fn().mockResolvedValue(undefined),
      publishTrack: vi.fn((track: unknown, options?: { source?: string }) => {
        if (
          options?.source === "microphone" &&
          track instanceof LocalAudioTrack
        ) {
          this.microphoneTrack = track;
        }
        return Promise.resolve({
          mute: vi.fn().mockResolvedValue(undefined),
          unmute: vi.fn().mockResolvedValue(undefined),
        });
      }),
      unpublishTrack: vi.fn((track: unknown) => {
        if (track === this.microphoneTrack) this.microphoneTrack = null;
        return Promise.resolve();
      }),
    };
    readonly connect: ReturnType<typeof vi.fn>;
    readonly disconnect = vi.fn((stopTracks = true) => {
      if (stopTracks) this.microphoneTrack?.stop();
      this.microphoneTrack = null;
      return Promise.resolve();
    });
    readonly prepareConnection = vi.fn().mockResolvedValue(undefined);
    private readonly options: unknown;

    constructor(options?: unknown) {
      this.options = options;
      liveKitState.instances.push(this);
      this.connect = vi.fn(() => {
        if (!liveKitState.rooms.includes(this)) {
          liveKitState.rooms.push(this);
          liveKitState.roomOptions.push(this.options);
        }
        return liveKitState.connectResults.shift() ?? Promise.resolve();
      });
    }

    on() {
      return this;
    }
  }

  return {
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
      AudioPlaybackStatusChanged: "audioPlaybackStatusChanged",
      DataReceived: "dataReceived",
      Disconnected: "disconnected",
      MediaDevicesChanged: "mediaDevicesChanged",
      MediaDevicesError: "mediaDevicesError",
      ParticipantConnected: "participantConnected",
      ParticipantDisconnected: "participantDisconnected",
      Reconnected: "reconnected",
      Reconnecting: "reconnecting",
      LocalTrackPublished: "localTrackPublished",
      LocalTrackUnpublished: "localTrackUnpublished",
      TrackMuted: "trackMuted",
      TrackPublished: "trackPublished",
      TrackSubscribed: "trackSubscribed",
      TrackUnmuted: "trackUnmuted",
      TrackUnpublished: "trackUnpublished",
      TrackUnsubscribed: "trackUnsubscribed",
    },
    Track: {
      Kind: { Audio: "audio" },
      Source: {
        Microphone: "microphone",
        Camera: "camera",
        ScreenShare: "screen_share",
        ScreenShareAudio: "screen_share_audio",
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
  isDesktopApp: () => screenShareState.desktop,
  getScreenShareCapabilities: screenShareState.getCapabilities,
  startScreenShare: screenShareState.start,
  stopScreenShare: screenShareState.stop,
  listenForScreenShareLifecycle: screenShareState.listen,
}));

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
  status: "online",
};

const lounge: Channel = {
  id: "voice-lounge",
  serverId: "server-1",
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

const tokenResponse = {
  data: {
    token: "signed.jwt.token",
    serverUrl: "wss://bakbak.livekit.cloud",
  },
  error: null,
};

describe("useVoiceRoom join lifecycle", () => {
  beforeEach(() => {
    void liveKitState.connectResults.splice(0);
    liveKitState.rooms.splice(0);
    liveKitState.instances.splice(0);
    liveKitState.roomOptions.splice(0);
    liveKitState.createLocalAudioTrack.mockClear();
    supabaseState.invoke.mockReset();
    screenShareState.desktop = false;
    screenShareState.getCapabilities.mockReset();
    screenShareState.getCapabilities.mockResolvedValue({
      available: false,
      nativeCapture: false,
      systemAudio: false,
      reason: null,
    });
    screenShareState.start.mockReset();
    screenShareState.stop.mockReset();
    screenShareState.stop.mockResolvedValue(undefined);
    screenShareState.listen.mockReset();
    screenShareState.listen.mockResolvedValue(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
      audioPublished: true,
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
      await result.current.startScreenShare(true);
    });

    expect(supabaseState.invoke).toHaveBeenNthCalledWith(2, "livekit-token", {
      body: { channelId: lounge.id, purpose: "screen_share" },
    });
    expect(screenShareState.start).toHaveBeenCalledWith({
      serverUrl: "wss://bakbak.livekit.cloud",
      token: "signed.jwt.token",
      includeAudio: true,
    });
    expect(result.current.screenShareEnabled).toBe(true);

    await act(async () => {
      await result.current.leave();
    });
    expect(screenShareState.stop).toHaveBeenCalledWith("native-share-1");
    expect(screenShareState.stop.mock.invocationCallOrder[0]).toBeLessThan(
      liveKitState.rooms[0]!.disconnect.mock.invocationCallOrder[0]!,
    );
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
      await result.current.startScreenShare(false);
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.screenShareState).toBe("error");
    expect(result.current.screenShareError).toBe(
      "macOS started capture but did not deliver a video frame.",
    );
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
      { source: "microphone" },
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
      { source: "microphone" },
    );
    expect(firstRoom?.localParticipant.unpublishTrack).toHaveBeenCalled();
    expect(result.current.selectedInputId).toBe("default");
    expect(result.current.status).toBe("connected");
    expect(result.current.channel).toEqual(coffeeTable);
  });

  it("reuses a muted microphone during a direct room switch and stops it on leave", async () => {
    supabaseState.invoke
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(tokenResponse);
    const { result } = renderHook(() => useVoiceRoom(user, "live"));

    await act(async () => {
      await result.current.join(lounge);
    });
    const firstRoom = liveKitState.rooms[0];
    const publishCalls = firstRoom?.localParticipant.publishTrack.mock.calls as
      [unknown, { source?: string }?][] | undefined;
    const microphone = publishCalls?.find(
      ([, options]) => options?.source === "microphone",
    )?.[0] as
      | { mute: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }
      | undefined;
    expect(microphone).toBeDefined();

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
      { source: "microphone" },
    );
    expect(microphone?.mute).toHaveBeenCalled();
    expect(result.current.muted).toBe(true);

    await act(async () => {
      await result.current.leave();
    });
    expect(microphone?.stop).toHaveBeenCalled();
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
      [unknown, { source?: string }?][] | undefined;
    const microphone = publishCalls?.find(
      ([, options]) => options?.source === "microphone",
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
      { source: "microphone" },
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
    ).toHaveBeenCalledWith(expect.anything(), { source: "microphone" });
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

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
