import { describe, expect, it, vi } from "vitest";
import {
  createTauriDesktopBridge,
  tauriDesktopRuntimeTesting,
  type TauriDesktopDependencies,
} from "./tauri-desktop-runtime";

const resolved = <T>(value: T): Promise<T> => Promise.resolve(value);

function dependencies(
  overrides: Partial<TauriDesktopDependencies> = {},
): TauriDesktopDependencies {
  return {
    invoke: vi.fn((command: string) =>
      resolved(
        command === "get_desktop_platform"
          ? "windows"
          : command === "desktop_update_supported"
            ? true
            : undefined,
      ),
    ) as TauriDesktopDependencies["invoke"],
    listen: vi.fn(() => resolved(() => undefined)),
    window: {
      minimize: vi.fn(() => resolved(undefined)),
      toggleMaximize: vi.fn(() => resolved(undefined)),
      isMaximized: vi.fn(() => resolved(false)),
      close: vi.fn(() => resolved(undefined)),
      startDragging: vi.fn(() => resolved(undefined)),
      onResized: vi.fn(() => resolved(() => undefined)),
    },
    relaunch: vi.fn(() => resolved(undefined)),
    getCurrentDeepLinks: vi.fn(() => resolved(null)),
    onOpenDeepLink: vi.fn(() => resolved(() => undefined)),
    checkForUpdate: vi.fn(() => resolved(null)),
    ...overrides,
  };
}

describe("Tauri desktop bridge", () => {
  it("reports an unambiguous generation and renderer window controls", async () => {
    const bridge = await createTauriDesktopBridge(dependencies());

    expect(bridge.runtime).toEqual({ shell: "tauri", generation: 2 });
    expect(bridge.platform).toBe("windows");
    expect(bridge.window.controlsMode).toBe("renderer");
    expect(bridge.updates.deliveryMode).toBe("automatic");
  });

  it("keeps macOS on manual delivery and skips the updater command when unsupported", async () => {
    const invoke = vi.fn((command: string) =>
      resolved(
        command === "get_desktop_platform"
          ? "macos"
          : command === "desktop_update_supported"
            ? false
            : undefined,
      ),
    ) as TauriDesktopDependencies["invoke"];
    const checkForUpdate = vi.fn(() => resolved(null));
    const bridge = await createTauriDesktopBridge(
      dependencies({ invoke, checkForUpdate }),
    );

    expect(bridge.updates.deliveryMode).toBe("manual");
    await expect(bridge.updates.check(60_000)).resolves.toEqual({
      supported: false,
      available: false,
      version: null,
    });
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it("keeps external audio behind bounded native commands and typed events", async () => {
    const invoke = vi.fn((command: string) => {
      if (command === "get_desktop_platform") return resolved("windows");
      if (command === "external_audio_get_state") {
        return resolved({
          status: "idle",
          config: null,
          microphoneMuted: false,
          activeSoundId: null,
          errorCode: null,
          message: null,
        });
      }
      if (command === "external_audio_capture_setup_recording") {
        return resolved({ sampleRate: 48_000, samples: [0.1, -0.1] });
      }
      return resolved(undefined);
    }) as TauriDesktopDependencies["invoke"];
    const listeners = new Map<string, (event: { payload: unknown }) => void>();
    const listen = vi.fn((event: string, listener: (event: never) => void) => {
      listeners.set(event, listener as (event: { payload: unknown }) => void);
      return resolved(() => {
        listeners.delete(event);
      });
    }) as TauriDesktopDependencies["listen"];
    const bridge = await createTauriDesktopBridge(
      dependencies({ invoke, listen }),
    );
    const onLevels = vi.fn();
    const onFailure = vi.fn();

    expect(bridge.externalAudio).toBeDefined();
    await expect(bridge.externalAudio?.getState()).resolves.toMatchObject({
      status: "idle",
    });
    await bridge.externalAudio?.startSetupTest({
      microphoneDeviceId: "mic",
      monitorOutputDeviceId: "headphones",
    });
    await bridge.externalAudio?.clearSetupRecording();
    await expect(
      bridge.externalAudio?.captureSetupRecording(),
    ).resolves.toEqual({ sampleRate: 48_000, samples: [0.1, -0.1] });
    await bridge.externalAudio?.playSetupTone();
    await bridge.externalAudio?.playSetupRecording({
      sampleRate: 48_000,
      samples: [0.1, -0.1],
    });
    await bridge.externalAudio?.stopSetupTest();
    bridge.externalAudio?.onLevels(onLevels);
    bridge.externalAudio?.onFailure(onFailure);
    await Promise.resolve();
    listeners.get("external-audio:levels")?.({
      payload: { microphone: 0.25, output: 0.5, clipping: false },
    });
    listeners.get("external-audio:failure")?.({
      payload: {
        code: "input-device-lost",
        message: "The microphone disconnected.",
      },
    });

    expect(invoke).toHaveBeenCalledWith("external_audio_get_state");
    expect(invoke).toHaveBeenCalledWith("external_audio_start_setup_test", {
      config: {
        microphoneDeviceId: "mic",
        monitorOutputDeviceId: "headphones",
      },
    });
    expect(invoke).toHaveBeenCalledWith("external_audio_play_setup_recording", {
      recording: { sampleRate: 48_000, samples: [0.1, -0.1] },
    });
    expect(onLevels).toHaveBeenCalledWith({
      microphone: 0.25,
      output: 0.5,
      clipping: false,
    });
    expect(onFailure).toHaveBeenCalledWith({
      code: "input-device-lost",
      message: "The microphone disconnected.",
    });
  });

  it("routes wheel lifecycle and local feedback through the narrow native bridge", async () => {
    const invoke = vi.fn((command: string) =>
      resolved(command === "get_desktop_platform" ? "windows" : undefined),
    );
    const listen = vi.fn(() => resolved(() => undefined));
    const deps = dependencies({
      invoke: invoke as TauriDesktopDependencies["invoke"],
      listen,
    });
    const bridge = await createTauriDesktopBridge(deps);
    await bridge.externalAudio?.getOverlayInteraction();
    await bridge.externalAudio?.finishOverlayInteraction(7, true);
    await bridge.externalAudio?.selectionFeedback();
    const off = bridge.externalAudio?.onOverlayInteraction(() => undefined);
    expect(invoke).toHaveBeenCalledWith("external_overlay_get_interaction");
    expect(invoke).toHaveBeenCalledWith("external_overlay_finish", {
      id: 7,
      play: true,
    });
    expect(invoke).toHaveBeenCalledWith("external_audio_selection_feedback");
    expect(listen).toHaveBeenCalledWith(
      "external-audio:overlay-interaction",
      expect.any(Function),
    );
    off?.();
  });

  it("routes bounded credential-free links through the narrow native command", async () => {
    const invoke = vi.fn((command: string) =>
      resolved(command === "get_desktop_platform" ? "windows" : undefined),
    ) as TauriDesktopDependencies["invoke"];
    const bridge = await createTauriDesktopBridge(dependencies({ invoke }));

    await expect(bridge.external.open("file:///tmp/private")).rejects.toThrow(
      "Only HTTP and HTTPS",
    );
    await expect(
      bridge.external.open("https://friend:secret@example.com"),
    ).rejects.toThrow("cannot contain credentials");
    await bridge.external.open("https://example.com/path");

    expect(invoke).toHaveBeenCalledWith("open_external_link", {
      value: "https://example.com/path",
    });
  });

  it("filters malformed, foreign, credentialed, and oversized deep links", () => {
    expect(
      tauriDesktopRuntimeTesting.validatedBakbakDeepLinks([
        "bakbak://invite/friend",
        "https://example.com",
        "file:///tmp/private",
        "bakbak://friend:secret@invite/private",
        `bakbak://invite/${"a".repeat(2_049)}`,
        "not a url",
      ]),
    ).toEqual(["bakbak://invite/friend"]);
  });

  it("delivers each validated plugin deep link once", async () => {
    let pluginListener: ((urls: string[]) => void) | undefined;
    const stopPlugin = vi.fn();
    const onOpenDeepLink = vi.fn((listener: (urls: string[]) => void) => {
      pluginListener = listener;
      return resolved(stopPlugin);
    });
    const bridge = await createTauriDesktopBridge(
      dependencies({ onOpenDeepLink }),
    );
    const opened = vi.fn();

    const stop = bridge.deepLinks?.onOpen(opened);
    await Promise.resolve();
    pluginListener?.(["bakbak://invite/plugin", "https://example.com"]);

    expect(opened).toHaveBeenCalledOnce();
    expect(opened).toHaveBeenCalledWith(["bakbak://invite/plugin"]);
    stop?.();
    expect(stopPlugin).toHaveBeenCalledOnce();
  });

  it("routes screen sharing only through the supervised native helper", async () => {
    const invoke = vi.fn((command: string) =>
      resolved(
        command === "get_desktop_platform"
          ? "windows"
          : command === "screen_share_capabilities"
            ? {
                video: true,
                systemAudio: true,
                applicationAudio: true,
                processTreeIsolation: true,
                minOsVersion: "20348",
                reason: null,
              }
            : command === "screen_share_host_identity"
              ? {
                  shell: "tauri",
                  generation: 2,
                  protocolVersion: 1,
                  helperVersion: "0.1.0",
                  appVersion: "2.0.0",
                  audioRootKind: "webview2",
                  proof: "proven",
                  identityEpoch: 4,
                }
              : command === "screen_share_list_sources"
                ? { sources: [], truncated: false }
                : undefined,
      ),
    ) as TauriDesktopDependencies["invoke"];
    const bridge = await createTauriDesktopBridge(dependencies({ invoke }));

    await expect(bridge.screenShare.hostIdentity()).resolves.toEqual({
      shell: "tauri",
      generation: 2,
      protocolVersion: 1,
      helperVersion: "0.1.0",
      appVersion: "2.0.0",
      audioRootKind: "webview2",
      proof: "proven",
      identityEpoch: 4,
    });
    await expect(bridge.screenShare.capabilities()).resolves.toMatchObject({
      captureBackend: "native-helper",
      video: true,
      systemAudio: true,
      processTreeIsolation: true,
    });
    await expect(
      bridge.screenShare.listSources({ includeThumbnails: true }),
    ).resolves.toEqual({ sources: [], truncated: false });
    expect(invoke).toHaveBeenCalledWith("screen_share_list_sources", {
      input: { includeThumbnails: true },
    });
    expect(invoke).toHaveBeenCalledWith("screen_share_host_identity");
  });

  it("adapts updater progress and relaunches only after installation", async () => {
    const relaunch = vi.fn(() => resolved(undefined));
    const update = {
      version: "1.9.0",
      close: vi.fn(() => resolved(undefined)),
      downloadAndInstall: vi.fn((listener: (event: unknown) => void) => {
        listener({ event: "Started", data: { contentLength: 12 } });
        listener({ event: "Progress", data: { chunkLength: 5 } });
        listener({ event: "Progress", data: { chunkLength: 7 } });
        listener({ event: "Finished" });
        return resolved(undefined);
      }),
    };
    const bridge = await createTauriDesktopBridge(
      dependencies({
        relaunch,
        checkForUpdate: vi.fn(() => resolved(update as never)),
      }),
    );
    const progress = vi.fn();
    bridge.updates.onProgress(progress);

    await expect(bridge.updates.check(60_000)).resolves.toEqual({
      supported: true,
      available: true,
      version: "1.9.0",
    });
    await bridge.updates.downloadAndInstall(60_000);

    expect(progress).toHaveBeenLastCalledWith({ transferred: 12, total: 12 });
    expect(relaunch).toHaveBeenCalledOnce();
  });

  it("clamps updater timeouts to the trusted desktop range", () => {
    expect(tauriDesktopRuntimeTesting.normalizedTimeout(Number.NaN)).toBe(
      1_000,
    );
    expect(tauriDesktopRuntimeTesting.normalizedTimeout(10)).toBe(1_000);
    expect(tauriDesktopRuntimeTesting.normalizedTimeout(999_999)).toBe(600_000);
  });
});
