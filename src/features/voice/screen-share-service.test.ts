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
  getPermissionSnapshot,
  getScreenShareCapabilities,
  listScreenShareSources,
  openPermissionSettings,
  requestMicrophonePermission,
  screenShareServiceTesting,
  startScreenShare,
  stopScreenShare,
  updateScreenShareSettings,
} from "./screen-share-service";

const desktop = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
  listSources: vi.fn(),
  prepare: vi.fn(),
  getPermission: vi.fn(),
  requestMicrophone: vi.fn(),
  openSettings: vi.fn(),
}));

function installDesktopBridge(platform: "macos" | "windows" = "windows"): void {
  window.bakbakDesktop = {
    platform,
    permissions: {
      get: desktop.getPermission,
      requestMicrophone: desktop.requestMicrophone,
      openSettings: desktop.openSettings,
    },
    screenShare: {
      getCapabilities: desktop.getCapabilities,
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

const successfulSourceResult = {
  ok: true as const,
  sources: [source],
  permissionStatus: "granted" as const,
  systemAudioAvailable: true,
  systemAudioUnavailableReason: null,
  failure: null,
};

describe("screen-share-service", () => {
  beforeEach(async () => {
    await screenShareServiceTesting.reset();
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "bakbakDesktop");
    desktop.getCapabilities.mockResolvedValue({
      systemAudioAvailable: true,
      systemAudioUnavailableReason: null,
    });
    desktop.listSources.mockResolvedValue(successfulSourceResult);
    desktop.prepare.mockResolvedValue(undefined);
    desktop.getPermission.mockResolvedValue({
      kind: "microphone",
      status: "granted",
      canRequest: false,
      canOpenSettings: false,
      requiresRestart: false,
    });
    desktop.requestMicrophone.mockResolvedValue({
      kind: "microphone",
      status: "granted",
      canRequest: false,
      canOpenSettings: false,
      requiresRestart: false,
    });
    desktop.openSettings.mockResolvedValue(true);
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
    await expect(listScreenShareSources()).resolves.toMatchObject({
      ok: false,
      sources: [],
      failure: { code: "capture-unavailable" },
    });
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
    await expect(listScreenShareSources()).resolves.toEqual(
      successfulSourceResult,
    );
  });

  it("returns permission recovery snapshots without reducing them to strings", async () => {
    installDesktopBridge("macos");
    desktop.getPermission.mockResolvedValueOnce({
      kind: "screen",
      status: "denied",
      canRequest: false,
      canOpenSettings: true,
      requiresRestart: true,
    });

    await expect(getPermissionSnapshot("screen")).resolves.toEqual({
      kind: "screen",
      status: "denied",
      canRequest: false,
      canOpenSettings: true,
      requiresRestart: true,
    });
    await expect(requestMicrophonePermission()).resolves.toMatchObject({
      kind: "microphone",
      status: "granted",
    });
    await expect(openPermissionSettings("screen")).resolves.toBe(true);
    expect(desktop.openSettings).toHaveBeenCalledWith("screen");
  });

  it("keeps macOS screen sharing video-only when loopback is unavailable", async () => {
    installDesktopBridge("macos");
    desktop.getCapabilities.mockResolvedValueOnce({
      systemAudioAvailable: false,
      systemAudioUnavailableReason:
        "System audio sharing is unavailable on macOS; video sharing still works.",
    });
    const videoOnlySource = {
      ...source,
      audioAvailable: false,
      audioUnavailableReason:
        "System audio sharing is unavailable on macOS; video sharing still works.",
    };
    desktop.listSources.mockResolvedValueOnce({
      ...successfulSourceResult,
      sources: [videoOnlySource],
      systemAudioAvailable: false,
      systemAudioUnavailableReason: videoOnlySource.audioUnavailableReason,
    });

    const capabilities = await getScreenShareCapabilities();
    expect(capabilities).toMatchObject({
      available: true,
      systemAudio: false,
    });
    expect(capabilities.reason).toContain("unavailable on macOS");
    const session = await startScreenShare({
      serverUrl: "wss://example.test",
      token: "short-lived-token",
      includeAudio: true,
      sourceId: source.id,
      settings: { resolution: 1080, frameRate: 60 },
    });

    expect(desktop.prepare).toHaveBeenCalledWith({
      sourceId: source.id,
      includeAudio: false,
    });
    expect(livekit.createLocalScreenTracks).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, systemAudio: "exclude" }),
    );
    expect(session.audioPublished).toBe(false);
    expect(session.audioUnavailableReason).toContain("unavailable on macOS");
    await stopScreenShare(session.sessionId);
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

    expect(consoleError.mock.calls.flat().join(" ")).toContain("unknown");
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      "must-not-appear-in-console",
    );
    consoleError.mockRestore();
  });

  it("carries structured source-enumeration recovery through capture start", async () => {
    installDesktopBridge("macos");
    const failure = {
      code: "permission-denied" as const,
      message: "Allow Bakbak in Screen Recording, then restart Bakbak.",
      canOpenSettings: true,
      restartRequired: true,
    };
    desktop.listSources.mockResolvedValueOnce({
      ok: false,
      sources: [],
      permissionStatus: "denied",
      systemAudioAvailable: false,
      systemAudioUnavailableReason: "Video sharing still works after access.",
      failure,
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      startScreenShare({
        serverUrl: "wss://example.test",
        token: "short-lived-token",
        includeAudio: false,
        settings: { resolution: 1080, frameRate: 60 },
      }),
    ).rejects.toMatchObject({
      failure: {
        ...failure,
        recommendedRetrySource: null,
      },
    });

    expect(desktop.prepare).not.toHaveBeenCalled();
    expect(livekit.room.connect).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("uses capture-unavailable when a selected source disappeared", async () => {
    installDesktopBridge();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      startScreenShare({
        serverUrl: "wss://example.test",
        token: "short-lived-token",
        includeAudio: false,
        sourceId: "window:missing",
        settings: { resolution: 1080, frameRate: 60 },
      }),
    ).rejects.toMatchObject({
      failure: {
        code: "capture-unavailable",
        canOpenSettings: false,
        restartRequired: false,
      },
    });
    consoleError.mockRestore();
  });

  it("categorizes a capture-engine missing source without message sniffing", async () => {
    installDesktopBridge();
    livekit.createLocalScreenTracks.mockRejectedValueOnce(
      new DOMException("Browser-specific text", "NotFoundError"),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      startScreenShare({
        serverUrl: "wss://example.test",
        token: "short-lived-token",
        includeAudio: false,
        settings: { resolution: 1080, frameRate: 60 },
      }),
    ).rejects.toMatchObject({
      failure: {
        code: "capture-unavailable",
        message: "The selected screen source is no longer available.",
      },
    });
    consoleError.mockRestore();
  });
});
