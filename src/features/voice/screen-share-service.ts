import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  DEFAULT_SCREEN_SHARE_SETTINGS,
  SCREEN_SHARE_FRAME_RATES,
  SCREEN_SHARE_RESOLUTIONS,
  parseScreenShareSettings,
  type ScreenShareFrameRate,
  type ScreenShareResolution,
  type ScreenShareSettings,
} from "./screen-share-preferences";

export type ScreenShareLifecycleState =
  | "idle"
  | "selecting"
  | "starting"
  | "sharing"
  | "paused"
  | "stopping"
  | "error";

export type ScreenShareSourceKind = "display" | "window" | "application";

export interface ScreenShareCapabilities {
  available: boolean;
  nativeCapture: boolean;
  systemAudio: boolean;
  sourceKinds: ScreenShareSourceKind[];
  resolutions: ScreenShareResolution[];
  frameRates: ScreenShareFrameRate[];
  dynamicSettings: boolean;
  customPicker: boolean;
  reason: string | null;
}

export interface ScreenShareSource {
  id: string;
  kind: Extract<ScreenShareSourceKind, "display" | "application">;
  label: string;
  applicationLabel: string | null;
  audioAvailable: boolean;
  thumbnailDataUrl: string | null;
}

export interface StartScreenShareInput {
  serverUrl: string;
  token: string;
  includeAudio: boolean;
  settings: ScreenShareSettings;
  sourceId?: string | null;
}

export interface ScreenShareSession {
  sessionId: string;
  sourceLabel: string;
  sourceKind: ScreenShareSourceKind;
  audioPublished: boolean;
  settings: ScreenShareSettings;
}

export interface ScreenShareLifecycleEvent {
  state: ScreenShareLifecycleState;
  sessionId: string | null;
  sourceLabel: string | null;
  sourceKind: ScreenShareSourceKind | null;
  audioPublished: boolean;
  settings: ScreenShareSettings | null;
  message: string | null;
}

export function isDesktopApp(): boolean {
  return isTauri();
}

export async function getScreenShareCapabilities(): Promise<ScreenShareCapabilities> {
  if (!isTauri()) {
    return {
      available: false,
      nativeCapture: false,
      systemAudio: false,
      sourceKinds: [],
      resolutions: [...SCREEN_SHARE_RESOLUTIONS],
      frameRates: [...SCREEN_SHARE_FRAME_RATES],
      dynamicSettings: false,
      customPicker: false,
      reason: "Screen sharing is available in the installed desktop app.",
    };
  }

  return await invoke<ScreenShareCapabilities>("get_screen_share_capabilities");
}

export async function listScreenShareSources(): Promise<ScreenShareSource[]> {
  if (!isTauri()) return [];
  return await invoke<ScreenShareSource[]>("list_screen_share_sources");
}

export async function openScreenRecordingSettings(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_screen_recording_settings");
}

export async function restartDesktopApp(): Promise<void> {
  if (!isTauri()) return;
  await relaunch();
}

export async function startScreenShare(
  input: StartScreenShareInput,
): Promise<ScreenShareSession> {
  if (!isTauri()) {
    throw new Error(
      "Screen sharing is available in the installed desktop app.",
    );
  }

  try {
    return await invoke<ScreenShareSession>("start_screen_share", {
      request: input,
    });
  } catch (caught) {
    console.error(`[Bakbak screen share] ${describeNativeError(caught)}`);
    throw caught;
  }
}

export async function updateScreenShareSettings(
  sessionId: string,
  settings: ScreenShareSettings,
): Promise<ScreenShareSettings> {
  if (!isTauri()) {
    throw new Error(
      "Live screen-share changes are available in the installed desktop app.",
    );
  }
  const updated = await invoke<ScreenShareSettings>(
    "update_screen_share_settings",
    {
      sessionId,
      settings: parseScreenShareSettings(settings),
    },
  );
  return parseScreenShareSettings(updated);
}

export async function stopScreenShare(sessionId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("stop_screen_share", { sessionId });
}

export async function listenForScreenShareLifecycle(
  onEvent: (event: ScreenShareLifecycleEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return await listen<ScreenShareLifecycleEvent>(
    "screen-share-lifecycle",
    ({ payload }) => {
      if (payload.state === "error") {
        console.error(
          `[Bakbak screen share] ${payload.message ?? "Native screen sharing stopped unexpectedly."}`,
        );
      }
      onEvent({
        ...payload,
        sourceKind: payload.sourceKind ?? null,
        settings: payload.settings
          ? parseScreenShareSettings(payload.settings)
          : null,
      });
    },
  );
}

export function defaultScreenShareCapabilities(): ScreenShareCapabilities {
  return {
    available: false,
    nativeCapture: false,
    systemAudio: false,
    sourceKinds: [],
    resolutions: [...SCREEN_SHARE_RESOLUTIONS],
    frameRates: [...SCREEN_SHARE_FRAME_RATES],
    dynamicSettings: false,
    customPicker: false,
    reason: "Screen sharing is available in the installed desktop app.",
  };
}

export function defaultScreenShareSettings(): ScreenShareSettings {
  return { ...DEFAULT_SCREEN_SHARE_SETTINGS };
}

function describeNativeError(caught: unknown): string {
  if (caught instanceof Error) return caught.message;
  if (typeof caught === "string" && caught.trim()) return caught;
  return "Native screen sharing failed without an error message.";
}
