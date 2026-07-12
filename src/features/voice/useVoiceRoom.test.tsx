import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser, Channel } from "../../lib/types";
import { SoundboardAudioPublisher } from "../soundboard/soundboard-audio";
import { AudioOutputRouter } from "./audio-output-router";
import { useVoiceRoom } from "./useVoiceRoom";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface RoomDouble {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  localParticipant: {
    setMicrophoneEnabled: ReturnType<typeof vi.fn>;
    setCameraEnabled: ReturnType<typeof vi.fn>;
  };
}

const liveKitState = vi.hoisted(() => ({
  connectResults: [] as Promise<void>[],
  rooms: [] as RoomDouble[],
  roomOptions: [] as unknown[],
}));

const supabaseState = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("livekit-client", () => {
  class ConnectionError extends Error {
    readonly reason = 2;
  }

  class Room {
    static getLocalDevices = vi.fn().mockResolvedValue([]);

    readonly canPlaybackAudio = true;
    readonly remoteParticipants = new Map();
    readonly localParticipant = {
      identity: "user-1",
      name: "Ayu",
      isSpeaking: false,
      isMicrophoneEnabled: true,
      isCameraEnabled: false,
      joinedAt: new Date("2026-07-11T12:00:00.000Z"),
      lastCameraError: undefined,
      getTrackPublication: vi.fn(),
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      setCameraEnabled: vi.fn().mockResolvedValue(undefined),
      publishData: vi.fn().mockResolvedValue(undefined),
    };
    readonly connect: ReturnType<typeof vi.fn>;
    readonly disconnect = vi.fn().mockResolvedValue(undefined);

    constructor(options?: unknown) {
      liveKitState.roomOptions.push(options);
      const connectResult = liveKitState.connectResults.shift();
      this.connect = vi.fn(() => connectResult ?? Promise.resolve());
      liveKitState.rooms.push(this);
    }

    on() {
      return this;
    }
  }

  return {
    ConnectionError,
    ConnectionErrorReason: {
      NotAllowed: 0,
      ServerUnreachable: 1,
      InternalError: 2,
      Cancelled: 3,
    },
    Room,
    RoomEvent: {
      ActiveSpeakersChanged: "activeSpeakersChanged",
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
    Track: { Source: { Camera: "camera" } },
    VideoPresets: { h720: { resolution: { width: 1280, height: 720 } } },
    supportsAudioOutputSelection: () => false,
  };
});

vi.mock("../../lib/supabase", () => ({
  getSupabaseClient: () => ({
    functions: { invoke: supabaseState.invoke },
  }),
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
    liveKitState.roomOptions.splice(0);
    supabaseState.invoke.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

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
    expect(room?.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(
      true,
      {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
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
    expect(supabaseState.invoke).toHaveBeenCalledOnce();

    await act(async () => {
      await result.current.setInputDevice("usb-microphone");
    });
    expect(result.current.selectedInputId).toBe("default");

    act(() => firstDisconnect.resolve(undefined));
    await waitFor(() => expect(supabaseState.invoke).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondTokenRequest.resolve(tokenResponse);
      await secondJoin;
    });

    const secondRoom = liveKitState.rooms[1];
    expect(secondRoom).toBeDefined();
    expect(
      secondRoom?.localParticipant.setMicrophoneEnabled,
    ).toHaveBeenCalledWith(true, {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    });
    expect(result.current.selectedInputId).toBe("default");
    expect(result.current.status).toBe("connected");
    expect(result.current.channel).toEqual(coffeeTable);
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
    expect(
      firstRoom?.localParticipant.setMicrophoneEnabled,
    ).not.toHaveBeenCalled();

    await act(async () => {
      secondTokenRequest.resolve(tokenResponse);
      await secondJoin;
    });

    const secondRoom = liveKitState.rooms[1];
    expect(secondRoom).toBeDefined();
    expect(secondRoom?.connect).toHaveBeenCalledOnce();
    expect(
      secondRoom?.localParticipant.setMicrophoneEnabled,
    ).toHaveBeenCalledWith(true, {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    });
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
      liveKitState.rooms[1]?.localParticipant.setMicrophoneEnabled,
    ).toHaveBeenCalledWith(true, {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    });
    expect(result.current.status).toBe("connected");
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
