import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getScreenShareCapabilities,
  listScreenShareSources,
  listenForScreenShareLifecycle,
  startScreenShare,
  stopScreenShare,
  updateScreenShareSettings,
} from "./screen-share-service";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauri.invoke,
  isTauri: tauri.isTauri,
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

describe("screen-share-service", () => {
  beforeEach(() => {
    tauri.invoke.mockReset();
    tauri.isTauri.mockReset();
    tauri.listen.mockReset();
  });

  it("keeps browser mode unavailable without invoking native commands", async () => {
    tauri.isTauri.mockReturnValue(false);

    await expect(getScreenShareCapabilities()).resolves.toMatchObject({
      available: false,
      nativeCapture: false,
      systemAudio: false,
    });
    await stopScreenShare("ignored");
    await listenForScreenShareLifecycle(vi.fn());

    expect(tauri.invoke).not.toHaveBeenCalled();
    expect(tauri.listen).not.toHaveBeenCalled();
  });

  it("passes only the short-lived token and public connection input to Tauri", async () => {
    tauri.isTauri.mockReturnValue(true);
    tauri.invoke.mockResolvedValue({
      sessionId: "session-1",
      sourceLabel: "Demo window",
      sourceKind: "window",
      audioPublished: true,
      settings: { resolution: 1080, frameRate: 60 },
    });

    await startScreenShare({
      serverUrl: "wss://example.test",
      token: "short-lived-token",
      includeAudio: true,
      settings: { resolution: 1080, frameRate: 60 },
    });

    expect(tauri.invoke).toHaveBeenCalledWith("start_screen_share", {
      request: {
        serverUrl: "wss://example.test",
        token: "short-lived-token",
        includeAudio: true,
        settings: { resolution: 1080, frameRate: 60 },
      },
    });
  });

  it("requests the privacy-filtered native source list only in desktop mode", async () => {
    tauri.isTauri.mockReturnValue(true);
    tauri.invoke.mockResolvedValue([
      {
        id: "display:1",
        kind: "display",
        label: "Screen 1",
        applicationLabel: null,
        audioAvailable: false,
        audioUnavailableReason: "Video only on this Windows build.",
        thumbnailDataUrl: null,
      },
    ]);

    await expect(listScreenShareSources()).resolves.toHaveLength(1);
    expect(tauri.invoke).toHaveBeenCalledWith("list_screen_share_sources");
  });

  it("passes validated live quality updates to the active native session", async () => {
    tauri.isTauri.mockReturnValue(true);
    tauri.invoke.mockResolvedValue({ resolution: 720, frameRate: 30 });

    await expect(
      updateScreenShareSettings("session-1", {
        resolution: 720,
        frameRate: 30,
      }),
    ).resolves.toEqual({ resolution: 720, frameRate: 30 });

    expect(tauri.invoke).toHaveBeenCalledWith("update_screen_share_settings", {
      sessionId: "session-1",
      settings: { resolution: 720, frameRate: 30 },
    });
  });

  it("logs a sanitized native start failure without logging the request", async () => {
    tauri.isTauri.mockReturnValue(true);
    tauri.invoke.mockRejectedValue("macOS did not deliver a video frame.");
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
    ).rejects.toBe("macOS did not deliver a video frame.");

    expect(consoleError).toHaveBeenCalledWith(
      "[Bakbak screen share] macOS did not deliver a video frame.",
    );
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      "must-not-appear-in-console",
    );
    consoleError.mockRestore();
  });

  it("prints native lifecycle failures to DevTools and still forwards them", async () => {
    tauri.isTauri.mockReturnValue(true);
    const onEvent = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const payload = {
      state: "error",
      sessionId: "session-1",
      sourceLabel: null,
      sourceKind: null,
      audioPublished: false,
      settings: null,
      message: "The selected source stopped before its first frame.",
    } as const;
    tauri.listen.mockImplementation(
      (
        _event: string,
        callback: (event: { payload: typeof payload }) => void,
      ) => {
        callback({ payload });
        return Promise.resolve(() => undefined);
      },
    );

    await listenForScreenShareLifecycle(onEvent);

    expect(consoleError).toHaveBeenCalledWith(
      "[Bakbak screen share] The selected source stopped before its first frame.",
    );
    expect(onEvent).toHaveBeenCalledWith(payload);
    consoleError.mockRestore();
  });
});
