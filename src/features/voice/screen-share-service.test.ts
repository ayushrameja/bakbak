import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BakbakDesktopBridge } from "../../lib/desktop-runtime";

const livekit = vi.hoisted(() => {
  const videoTrack = {
    kind: "video",
    mediaStreamTrack: {
      contentHint: "",
      applyConstraints: vi.fn().mockResolvedValue(undefined),
    },
    once: vi.fn(),
    sender: null,
  };
  const audioTrack = { kind: "audio", stop: vi.fn() };
  const room = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    once: vi.fn(),
    localParticipant: { publishTrack: vi.fn().mockResolvedValue({}) },
  };
  return {
    videoTrack,
    audioTrack,
    room,
    createLocalScreenTracks: vi
      .fn()
      .mockResolvedValue([videoTrack, audioTrack]),
  };
});

vi.mock("livekit-client", () => ({
  LocalVideoTrack: class LocalVideoTrack {},
  Room: class MockRoom {
    constructor() {
      return livekit.room;
    }
  },
  RoomEvent: { Disconnected: "disconnected" },
  Track: {
    Kind: { Video: "video", Audio: "audio" },
    Source: {
      ScreenShare: "screen_share",
      ScreenShareAudio: "screen_share_audio",
    },
  },
  TrackEvent: { Ended: "ended" },
  createLocalScreenTracks: livekit.createLocalScreenTracks,
}));

import {
  getScreenShareCapabilities,
  listScreenShareSources,
  screenShareServiceTesting,
  startScreenShare,
  stopScreenShare,
  updateScreenShareSettings,
} from "./screen-share-service";

const desktop = vi.hoisted(() => ({
  listSources: vi.fn(),
  prepare: vi.fn(),
}));

function installDesktopBridge(): void {
  window.bakbakDesktop = {
    platform: "windows",
    screenShare: {
      listSources: desktop.listSources,
      prepare: desktop.prepare,
    },
  } as unknown as BakbakDesktopBridge;
}

const source = {
  id: "screen:1:0",
  kind: "display" as const,
  label: "Screen 1",
  applicationLabel: null,
  audioAvailable: true,
  audioUnavailableReason: null,
  thumbnailDataUrl: null,
};

describe("screen-share-service", () => {
  beforeEach(async () => {
    await screenShareServiceTesting.reset();
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "bakbakDesktop");
    desktop.listSources.mockResolvedValue([source]);
    desktop.prepare.mockResolvedValue(undefined);
    livekit.room.connect.mockResolvedValue(undefined);
    livekit.room.disconnect.mockResolvedValue(undefined);
    livekit.room.localParticipant.publishTrack.mockResolvedValue({});
    livekit.createLocalScreenTracks.mockResolvedValue([
      livekit.videoTrack,
      livekit.audioTrack,
    ]);
  });

  it("keeps browser mode unavailable without invoking desktop capture", async () => {
    await expect(getScreenShareCapabilities()).resolves.toMatchObject({
      available: false,
      nativeCapture: false,
      systemAudio: false,
    });
    await expect(listScreenShareSources()).resolves.toEqual([]);
    expect(desktop.listSources).not.toHaveBeenCalled();
  });

  it("exposes only the supported Electron source and quality contract", async () => {
    installDesktopBridge();
    await expect(getScreenShareCapabilities()).resolves.toMatchObject({
      available: true,
      nativeCapture: true,
      systemAudio: true,
      sourceKinds: ["display", "application"],
    });
    await expect(listScreenShareSources()).resolves.toEqual([source]);
  });

  it("keeps the token in the sandboxed renderer and prepares only a source", async () => {
    installDesktopBridge();
    const session = await startScreenShare({
      serverUrl: "wss://example.test",
      token: "short-lived-token",
      includeAudio: true,
      sourceId: source.id,
      settings: { resolution: 1080, frameRate: 60 },
    });

    expect(desktop.prepare).toHaveBeenCalledWith({
      sourceId: source.id,
      includeAudio: true,
    });
    expect(desktop.prepare.mock.calls.flat().join(" ")).not.toContain(
      "short-lived-token",
    );
    expect(livekit.room.connect).toHaveBeenCalledWith(
      "wss://example.test",
      "short-lived-token",
      { autoSubscribe: false },
    );
    expect(livekit.room.localParticipant.publishTrack).toHaveBeenCalledTimes(2);
    expect(session).toMatchObject({
      sourceLabel: "Screen 1",
      sourceKind: "display",
      audioPublished: true,
    });
    await stopScreenShare(session.sessionId);
  });

  it("applies validated quality constraints to the active capture", async () => {
    installDesktopBridge();
    const session = await startScreenShare({
      serverUrl: "wss://example.test",
      token: "short-lived-token",
      includeAudio: false,
      settings: { resolution: 1080, frameRate: 60 },
    });

    await expect(
      updateScreenShareSettings(session.sessionId, {
        resolution: 720,
        frameRate: 30,
      }),
    ).resolves.toEqual({ resolution: 720, frameRate: 30 });
    expect(
      livekit.videoTrack.mediaStreamTrack.applyConstraints,
    ).toHaveBeenCalledWith({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    });
    await stopScreenShare(session.sessionId);
  });

  it("logs a sanitized capture failure without logging the token", async () => {
    installDesktopBridge();
    livekit.createLocalScreenTracks.mockRejectedValueOnce(
      new Error("The selected source stopped."),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      startScreenShare({
        serverUrl: "wss://example.test",
        token: "must-not-appear-in-console",
        includeAudio: false,
        settings: { resolution: 1080, frameRate: 60 },
      }),
    ).rejects.toThrow("The selected source stopped.");

    expect(consoleError.mock.calls.flat().join(" ")).toContain(
      "capture-failed",
    );
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      "must-not-appear-in-console",
    );
    consoleError.mockRestore();
  });
});
