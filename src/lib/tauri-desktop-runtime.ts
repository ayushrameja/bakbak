import { invoke } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check as checkForTauriUpdate,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import type {
  ExternalOverlayInteraction,
  ExternalAudioDeviceSnapshot,
  ExternalAudioFailure,
  ExternalAudioLevels,
  ExternalAudioPcmInput,
  ExternalAudioSessionConfig,
  ExternalAudioSessionState,
  ExternalAudioSetupRecording,
  ExternalAudioSetupTestConfig,
} from "./external-audio-types";
import type {
  BakbakDesktopBridge,
  DesktopNativeScreenShareLifecycleEvent,
  DesktopNativeScreenShareSession,
  DesktopNativeScreenShareSettings,
  DesktopNativeScreenShareStartInput,
  DesktopNativeScreenShareSourceResult,
  DesktopPermissionSnapshot,
  DesktopPlatform,
  DesktopScreenShareCapabilities,
  DesktopScreenShareHostIdentity,
  DesktopUpdateProgress,
  DesktopWindowAppearance,
} from "./desktop-runtime";

const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 10 * 60_000;

type StopListening = () => void;

interface TauriWindowAdapter {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  close(): Promise<void>;
  startDragging(): Promise<void>;
  onResized(listener: () => void | Promise<void>): Promise<StopListening>;
}

export interface TauriDesktopDependencies {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(
    event: string,
    listener: (event: { payload: T }) => void,
  ): Promise<StopListening>;
  window: TauriWindowAdapter;
  relaunch(): Promise<void>;
  getCurrentDeepLinks(): Promise<string[] | null>;
  onOpenDeepLink(listener: (urls: string[]) => void): Promise<StopListening>;
  checkForUpdate(options: { timeout: number }): Promise<Update | null>;
}

export async function createTauriDesktopBridge(
  dependencies: TauriDesktopDependencies = productionDependencies(),
): Promise<BakbakDesktopBridge> {
  const platform = await dependencies.invoke<DesktopPlatform>(
    "get_desktop_platform",
  );
  let pendingUpdate: Update | null = null;
  const progressListeners = new Set<
    (progress: DesktopUpdateProgress) => void
  >();
  const installErrorListeners = new Set<() => void>();

  const notifyProgress = (progress: DesktopUpdateProgress) => {
    for (const listener of progressListeners) listener(progress);
  };
  const notifyInstallError = () => {
    for (const listener of installErrorListeners) listener();
  };

  return Object.freeze({
    runtime: Object.freeze({ shell: "tauri" as const, generation: 2 as const }),
    platform,
    window: Object.freeze({
      controlsMode:
        platform === "windows" ? ("renderer" as const) : ("native" as const),
      getAppearance: () =>
        dependencies.invoke<DesktopWindowAppearance>("get_window_appearance"),
      setChromeScheme: (scheme: "light" | "dark") =>
        dependencies.invoke<void>("set_chrome_scheme", { scheme }),
      setWindowControlsVisible: (
        visible: boolean,
        sidebarPosition: "left" | "right" = "left",
      ) =>
        dependencies.invoke<void>("set_window_controls_visible", {
          visible,
          sidebarPosition,
        }),
      onToggleSidebar: (listener: () => void) =>
        subscribe(
          dependencies.listen("window:toggle-sidebar", () => listener()),
        ),
      onAppearanceChange: (
        listener: (appearance: DesktopWindowAppearance) => void,
      ) =>
        subscribe(
          dependencies.listen<DesktopWindowAppearance>(
            "window:appearance-changed",
            ({ payload }) => listener(payload),
          ),
        ),
      minimize: () => dependencies.window.minimize(),
      toggleMaximize: () => dependencies.window.toggleMaximize(),
      isMaximized: () => dependencies.window.isMaximized(),
      close: () => dependencies.window.close(),
      startDragging: () => dependencies.window.startDragging(),
      onMaximizedChange: (listener: (maximized: boolean) => void) =>
        subscribe(
          dependencies.window.onResized(async () => {
            listener(await dependencies.window.isMaximized());
          }),
        ),
    }),
    systemAccent: Object.freeze({
      get: () => dependencies.invoke<unknown>("get_system_accent"),
      onChange: (listener: (accent: unknown) => void) =>
        subscribe(
          dependencies.listen<unknown>("system-accent:changed", ({ payload }) =>
            listener(payload),
          ),
        ),
    }),
    external: Object.freeze({
      open: async (value: string) => {
        const url = validatedExternalUrl(value);
        await dependencies.invoke<void>("open_external_link", { value: url });
      },
    }),
    app: Object.freeze({ relaunch: () => dependencies.relaunch() }),
    deepLinks: Object.freeze({
      getInitial: async () =>
        validatedBakbakDeepLinks(await dependencies.getCurrentDeepLinks()),
      onOpen: (listener: (urls: string[]) => void) => {
        const deliver = (urls: unknown) => {
          const validated = validatedBakbakDeepLinks(urls);
          if (validated.length > 0) listener(validated);
        };
        return subscribe(dependencies.onOpenDeepLink(deliver));
      },
    }),
    permissions: Object.freeze({
      get: (kind: "microphone" | "screen") =>
        dependencies.invoke<DesktopPermissionSnapshot>(
          "get_permission_snapshot",
          { kind },
        ),
      requestMicrophone: () =>
        dependencies.invoke<DesktopPermissionSnapshot>(
          "request_microphone_permission",
        ),
      openSettings: (kind: "microphone" | "screen") =>
        dependencies.invoke<boolean>("open_permission_settings", { kind }),
    }),
    externalAudio: Object.freeze({
      listDevices: () =>
        dependencies.invoke<ExternalAudioDeviceSnapshot>(
          "external_audio_list_devices",
        ),
      getState: () =>
        dependencies.invoke<ExternalAudioSessionState>(
          "external_audio_get_state",
        ),
      startSetupTest: (config: ExternalAudioSetupTestConfig) =>
        dependencies.invoke<ExternalAudioSessionState>(
          "external_audio_start_setup_test",
          { config },
        ),
      clearSetupRecording: () =>
        dependencies.invoke<void>("external_audio_clear_setup_recording"),
      captureSetupRecording: () =>
        dependencies.invoke<ExternalAudioSetupRecording>(
          "external_audio_capture_setup_recording",
        ),
      playSetupTone: () =>
        dependencies.invoke<ExternalAudioSessionState>(
          "external_audio_play_setup_tone",
        ),
      playSetupRecording: (recording: ExternalAudioSetupRecording) =>
        dependencies.invoke<ExternalAudioSessionState>(
          "external_audio_play_setup_recording",
          { recording },
        ),
      stopSetupTest: () =>
        dependencies.invoke<ExternalAudioSessionState>(
          "external_audio_stop_setup_test",
        ),
      start: (config: ExternalAudioSessionConfig) =>
        dependencies.invoke<ExternalAudioSessionState>("external_audio_start", {
          config,
        }),
      update: (input: {
        microphoneMuted?: boolean;
        microphoneGain?: number;
        soundboardGain?: number;
      }) =>
        dependencies.invoke<ExternalAudioSessionState>(
          "external_audio_update",
          { input },
        ),
      stop: () =>
        dependencies.invoke<ExternalAudioSessionState>("external_audio_stop"),
      play: (input: ExternalAudioPcmInput) =>
        dependencies.invoke<ExternalAudioSessionState>("external_audio_play", {
          input,
        }),
      stopSound: () =>
        dependencies.invoke<ExternalAudioSessionState>(
          "external_audio_stop_sound",
        ),
      getOverlayInteraction: () =>
        dependencies.invoke<ExternalOverlayInteraction>(
          "external_overlay_get_interaction",
        ),
      onOverlayInteraction: (
        listener: (interaction: ExternalOverlayInteraction) => void,
      ) =>
        subscribe(
          dependencies.listen<ExternalOverlayInteraction>(
            "external-audio:overlay-interaction",
            ({ payload }) => listener(payload),
          ),
        ),
      finishOverlayInteraction: (id: number, play: boolean) =>
        dependencies.invoke<boolean>("external_overlay_finish", { id, play }),
      selectionFeedback: () =>
        dependencies.invoke<void>("external_audio_selection_feedback"),
      showOverlay: () =>
        dependencies.invoke<void>("external_audio_show_overlay"),
      hideOverlay: () =>
        dependencies.invoke<void>("external_audio_hide_overlay"),
      onState: (listener: (state: ExternalAudioSessionState) => void) =>
        subscribe(
          dependencies.listen<ExternalAudioSessionState>(
            "external-audio:state",
            ({ payload }) => listener(payload),
          ),
        ),
      onLevels: (listener: (levels: ExternalAudioLevels) => void) =>
        subscribe(
          dependencies.listen<ExternalAudioLevels>(
            "external-audio:levels",
            ({ payload }) => listener(payload),
          ),
        ),
      onFailure: (listener: (failure: ExternalAudioFailure) => void) =>
        subscribe(
          dependencies.listen<ExternalAudioFailure>(
            "external-audio:failure",
            ({ payload }) => listener(payload),
          ),
        ),
      onCloseExplanation: (listener: () => void) =>
        subscribe(
          dependencies.listen("external-audio:close-explanation", () =>
            listener(),
          ),
        ),
    }),
    screenShare: Object.freeze({
      hostIdentity: () =>
        dependencies.invoke<DesktopScreenShareHostIdentity>(
          "screen_share_host_identity",
        ),
      capabilities: async () => ({
        captureBackend: "native-helper" as const,
        ...(await dependencies.invoke<
          Omit<DesktopScreenShareCapabilities, "captureBackend">
        >("screen_share_capabilities")),
      }),
      listSources: (input: { includeThumbnails?: boolean } = {}) =>
        dependencies.invoke<DesktopNativeScreenShareSourceResult>(
          "screen_share_list_sources",
          { input },
        ),
      selectVideoSource: ({ sourceId }: { sourceId: string }) =>
        dependencies.invoke<void>("screen_share_select_source", { sourceId }),
      start: (input: DesktopNativeScreenShareStartInput) =>
        dependencies.invoke<DesktopNativeScreenShareSession>(
          "screen_share_start",
          { input },
        ),
      update: (input: {
        sessionId: string;
        settings?: DesktopNativeScreenShareSettings;
        paused?: boolean;
      }) =>
        dependencies.invoke<{
          sessionId: string;
          settings: DesktopNativeScreenShareSettings;
          paused: boolean;
        }>("screen_share_update", { input }),
      stop: (input: { sessionId: string }) =>
        dependencies.invoke<{ sessionId: string; stopped: true }>(
          "screen_share_stop",
          { input },
        ),
      onLifecycle: (
        listener: (event: DesktopNativeScreenShareLifecycleEvent) => void,
      ) =>
        subscribe(
          dependencies.listen<DesktopNativeScreenShareLifecycleEvent>(
            "screen-share:lifecycle",
            ({ payload }) => listener(payload),
          ),
        ),
    }),
    updates: Object.freeze({
      deliveryMode:
        platform === "windows" ? ("automatic" as const) : ("manual" as const),
      check: async (timeoutMs: number) => {
        if (!(await dependencies.invoke<boolean>("desktop_update_supported"))) {
          return { supported: false, available: false, version: null };
        }
        if (pendingUpdate) {
          await pendingUpdate.close().catch(() => undefined);
          pendingUpdate = null;
        }
        pendingUpdate = await dependencies.checkForUpdate({
          timeout: normalizedTimeout(timeoutMs),
        });
        return {
          supported: true,
          available: pendingUpdate !== null,
          version: pendingUpdate?.version ?? null,
        };
      },
      downloadAndInstall: async (timeoutMs: number) => {
        if (!pendingUpdate) {
          throw new Error("Check for a Bakbak update before installing it.");
        }
        let transferred = 0;
        let total: number | null = null;
        const update = pendingUpdate;
        try {
          await update.downloadAndInstall(
            (event: DownloadEvent) => {
              if (event.event === "Started") {
                transferred = 0;
                total = event.data.contentLength ?? null;
              } else if (event.event === "Progress") {
                transferred += event.data.chunkLength;
              }
              notifyProgress({ transferred, total });
            },
            { timeout: normalizedTimeout(timeoutMs) },
          );
          await dependencies.relaunch();
        } catch (error) {
          notifyInstallError();
          throw error;
        }
      },
      onProgress: (listener: (progress: DesktopUpdateProgress) => void) => {
        progressListeners.add(listener);
        return () => progressListeners.delete(listener);
      },
      onInstallError: (listener: () => void) => {
        installErrorListeners.add(listener);
        return () => installErrorListeners.delete(listener);
      },
    }),
  });
}

function productionDependencies(): TauriDesktopDependencies {
  const currentWindow = getCurrentWindow();
  return {
    invoke,
    listen: <T>(event: string, listener: (event: Event<T>) => void) =>
      listen<T>(event, listener),
    window: {
      minimize: () => currentWindow.minimize(),
      toggleMaximize: () => currentWindow.toggleMaximize(),
      isMaximized: () => currentWindow.isMaximized(),
      close: () => currentWindow.close(),
      startDragging: () => currentWindow.startDragging(),
      onResized: (listener) =>
        currentWindow.onResized(() => {
          void Promise.resolve(listener()).catch(() => undefined);
        }),
    },
    relaunch,
    getCurrentDeepLinks: getCurrent,
    onOpenDeepLink: onOpenUrl,
    checkForUpdate: checkForTauriUpdate,
  };
}

function subscribe(registration: Promise<StopListening>): StopListening {
  let disposed = false;
  let unlisten: StopListening | undefined;
  void registration
    .then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    })
    .catch(() => undefined);
  return () => {
    disposed = true;
    unlisten?.();
  };
}

function normalizedTimeout(value: number): number {
  if (!Number.isFinite(value)) return MIN_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(value)));
}

function validatedExternalUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2_048) {
    throw new Error(
      "External links must contain between 1 and 2048 characters.",
    );
  }
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS links can be opened.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("External links cannot contain credentials.");
  }
  return parsed.toString();
}

function validatedBakbakDeepLinks(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.flatMap((value) => {
    if (typeof value !== "string") return [];
    const trimmed = value.trim();
    if (
      trimmed.length === 0 ||
      new TextEncoder().encode(trimmed).byteLength > 2_048
    ) {
      return [];
    }
    try {
      const url = new URL(trimmed);
      return url.protocol === "bakbak:" && !url.username && !url.password
        ? [url.toString()]
        : [];
    } catch {
      return [];
    }
  });
}

export const tauriDesktopRuntimeTesting = {
  normalizedTimeout,
  validatedBakbakDeepLinks,
  validatedExternalUrl,
};
