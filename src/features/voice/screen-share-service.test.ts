import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BakbakDesktopBridge,
  DesktopNativeScreenShareLifecycleEvent,
} from "../../lib/desktop-runtime";
import {
  getPermissionSnapshot,
  getScreenShareCapabilities,
  listScreenShareSources,
  listenForScreenShareLifecycle,
  openPermissionSettings,
  requestMicrophonePermission,
  screenShareServiceTesting,
  startScreenShare,
  stopScreenShare,
  type ScreenShareLifecycleEvent,
  updateScreenShareSettings,
} from "./screen-share-service";

let nativeLifecycle:
  ((event: DesktopNativeScreenShareLifecycleEvent) => void) | undefined;

const desktop = vi.hoisted(() => ({
  capabilities: vi.fn(),
  listSources: vi.fn(),
  start: vi.fn(),
  update: vi.fn(),
  stop: vi.fn(),
  onLifecycle: vi.fn(),
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
      capabilities: desktop.capabilities,
      listSources: desktop.listSources,
      start: desktop.start,
      update: desktop.update,
      stop: desktop.stop,
      onLifecycle: desktop.onLifecycle,
    },
  } as unknown as BakbakDesktopBridge;
}

const source = {
  id: "display:1",
  kind: "display" as const,
  label: "Screen 1",
  applicationLabel: null,
  audioAvailable: true,
  audioUnavailableReason: null,
  thumbnailDataUrl: null,
};

const nativeCapabilities = {
  video: true,
  systemAudio: true,
  applicationAudio: true,
  processTreeIsolation: true,
  minOsVersion: null,
  reason: null,
};

describe("screen-share-service", () => {
  beforeEach(() => {
    screenShareServiceTesting.reset();
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "bakbakDesktop");
    desktop.capabilities.mockResolvedValue(nativeCapabilities);
    desktop.listSources.mockResolvedValue({
      sources: [source],
      truncated: false,
    });
    desktop.start.mockResolvedValue({
      sessionId: "native-session-1",
      sourceLabel: source.label,
      sourceKind: source.kind,
      audioPublished: true,
      audioUnavailableReason: null,
      settings: {
        width: 1920,
        height: 1080,
        frameRate: 60,
        maxBitrate: 8_000_000,
      },
      diagnostics: {
        captureBackend: "screen-capture-kit",
        audioIsolationMode: "exclude-bakbak-process-tree",
      },
    });
    desktop.update.mockResolvedValue({
      sessionId: "native-session-1",
      settings: {
        width: 1280,
        height: 720,
        frameRate: 30,
        maxBitrate: 2_000_000,
      },
      paused: false,
    });
    desktop.stop.mockResolvedValue({
      sessionId: "native-session-1",
      stopped: true,
    });
    nativeLifecycle = undefined;
    desktop.onLifecycle.mockImplementation(
      (listener: (event: DesktopNativeScreenShareLifecycleEvent) => void) => {
        nativeLifecycle = listener;
        return () => undefined;
      },
    );
    desktop.getPermission.mockImplementation((kind: "microphone" | "screen") =>
      Promise.resolve({
        kind,
        status: "granted",
        canRequest: false,
        canOpenSettings: false,
        requiresRestart: false,
      }),
    );
    desktop.requestMicrophone.mockResolvedValue({
      kind: "microphone",
      status: "granted",
      canRequest: false,
      canOpenSettings: false,
      requiresRestart: false,
    });
    desktop.openSettings.mockResolvedValue(true);
  });

  it("keeps browser mode unavailable without invoking native capture", async () => {
    await expect(getScreenShareCapabilities()).resolves.toMatchObject({
      available: false,
      nativeCapture: false,
      systemAudio: false,
    });
    expect(desktop.listSources).not.toHaveBeenCalled();
  });

  it("requires process-tree isolation before advertising system audio", async () => {
    installDesktopBridge();
    desktop.capabilities.mockResolvedValueOnce({
      ...nativeCapabilities,
      processTreeIsolation: false,
      reason: "Process-tree exclusion is unavailable.",
    });
    await expect(getScreenShareCapabilities()).resolves.toMatchObject({
      available: true,
      nativeCapture: true,
      systemAudio: false,
      reason: "Process-tree exclusion is unavailable.",
    });
  });

  it("passes the short-lived token only to the native helper start boundary", async () => {
    installDesktopBridge();
    const session = await startScreenShare({
      serverUrl: "wss://example.test",
      token: "short-lived-token",
      includeAudio: true,
      sourceId: source.id,
      settings: { resolution: 1080, frameRate: 60 },
    });

    expect(desktop.start).toHaveBeenCalledWith({
      serverUrl: "wss://example.test",
      token: "short-lived-token",
      sourceId: source.id,
      includeAudio: true,
      settings: {
        width: 1920,
        height: 1080,
        frameRate: 60,
        maxBitrate: 8_000_000,
      },
    });
    expect(session).toMatchObject({
      sessionId: "native-session-1",
      audioPublished: true,
      diagnostics: {
        audioIsolationMode: "exclude-bakbak-process-tree",
      },
    });
  });

  it("delegates quality updates and stop to the helper session", async () => {
    installDesktopBridge();
    await expect(
      updateScreenShareSettings("native-session-1", {
        resolution: 720,
        frameRate: 30,
      }),
    ).resolves.toEqual({ resolution: 720, frameRate: 30 });
    expect(desktop.update).toHaveBeenCalledWith({
      sessionId: "native-session-1",
      settings: {
        width: 1280,
        height: 720,
        frameRate: 30,
        maxBitrate: 2_000_000,
      },
    });
    await stopScreenShare("native-session-1");
    expect(desktop.stop).toHaveBeenCalledWith({
      sessionId: "native-session-1",
    });
  });

  it("forces video-only start when the global isolation proof is unavailable", async () => {
    installDesktopBridge();
    desktop.capabilities.mockResolvedValue({
      ...nativeCapabilities,
      systemAudio: false,
      processTreeIsolation: false,
      reason: "Native screen audio is disabled for this build.",
    });
    desktop.start.mockResolvedValueOnce({
      sessionId: "video-session",
      sourceLabel: source.label,
      sourceKind: source.kind,
      audioPublished: false,
      audioUnavailableReason: "Native screen audio is disabled for this build.",
      settings: {
        width: 1280,
        height: 720,
        frameRate: 30,
        maxBitrate: 2_000_000,
      },
      diagnostics: {
        captureBackend: "windows-graphics-capture",
        audioIsolationMode: "disabled",
      },
    });
    const session = await startScreenShare({
      serverUrl: "wss://example.test",
      token: "token",
      sourceId: source.id,
      includeAudio: true,
      settings: { resolution: 720, frameRate: 30 },
    });
    expect(desktop.start).toHaveBeenCalledWith(
      expect.objectContaining({ includeAudio: false }),
    );
    expect(session).toMatchObject({
      audioPublished: false,
      audioUnavailableReason: "Native screen audio is disabled for this build.",
    });
  });

  it("maps audio downgrade to a live video session without discarding context", async () => {
    installDesktopBridge();
    const events = vi.fn<(event: ScreenShareLifecycleEvent) => void>();
    const unlisten = await listenForScreenShareLifecycle(events);
    const session = await startScreenShare({
      serverUrl: "wss://example.test",
      token: "token",
      sourceId: source.id,
      includeAudio: true,
      settings: { resolution: 1080, frameRate: 60 },
    });
    nativeLifecycle?.({
      sessionId: session.sessionId,
      state: "audio-downgraded",
      reasonCode: "isolation-lost",
      message:
        "Audio stopped because process isolation could not be maintained.",
      audioPublished: false,
    });
    expect(events).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: "sharing",
        sessionId: session.sessionId,
        sourceLabel: source.label,
        settings: { resolution: 1080, frameRate: 60 },
        audioPublished: false,
        failure: null,
      }),
    );
    expect(events.mock.lastCall?.[0]?.diagnostics?.audioIsolationMode).toBe(
      "exclude-bakbak-process-tree",
    );
    unlisten();
  });

  it("clears native session context after stopped and failed lifecycles", async () => {
    installDesktopBridge();
    const events = vi.fn<(event: ScreenShareLifecycleEvent) => void>();
    const unlisten = await listenForScreenShareLifecycle(events);
    const session = await startScreenShare({
      serverUrl: "wss://example.test",
      token: "token",
      sourceId: source.id,
      includeAudio: false,
      settings: { resolution: 1080, frameRate: 60 },
    });
    nativeLifecycle?.({ sessionId: session.sessionId, state: "stopped" });
    expect(events).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "idle", sourceLabel: source.label }),
    );
    nativeLifecycle?.({
      sessionId: session.sessionId,
      state: "failed",
      message: "late duplicate failure",
    });
    expect(events).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: "error",
        sourceLabel: null,
        settings: null,
        diagnostics: null,
      }),
    );
    unlisten();
  });

  it("preserves permission recovery through native source failures", async () => {
    installDesktopBridge("macos");
    desktop.getPermission.mockResolvedValue({
      kind: "screen",
      status: "denied",
      canRequest: false,
      canOpenSettings: true,
      requiresRestart: true,
    });
    desktop.listSources.mockRejectedValue(new Error("helper rejected request"));
    await expect(listScreenShareSources()).resolves.toMatchObject({
      ok: false,
      permissionStatus: "denied",
      failure: {
        code: "permission-denied",
        canOpenSettings: true,
        restartRequired: true,
      },
    });
    await expect(getPermissionSnapshot("screen")).resolves.toMatchObject({
      status: "denied",
    });
    await expect(requestMicrophonePermission()).resolves.toMatchObject({
      status: "granted",
    });
    await expect(openPermissionSettings("screen")).resolves.toBe(true);
  });
});
