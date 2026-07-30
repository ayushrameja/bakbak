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
export type ScreenShareFailureCode =
  | "capture-black"
  | "cursor-unavailable"
  | "audio-isolation-unavailable"
  | "capture-failed";

export interface ScreenShareFailure {
  code: ScreenShareFailureCode;
  message: string;
  recommendedRetrySource: "display" | null;
}

export interface ScreenShareDiagnostics {
  os: string;
  osBuild: string;
  sourceKind: ScreenShareSourceKind;
  captureBackend: string;
  cursorCapability: string;
  audioIsolationMode: string;
  failureCode: ScreenShareFailureCode | null;
}

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
  audioUnavailableReason: string | null;
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
  audioUnavailableReason: string | null;
  settings: ScreenShareSettings;
  diagnostics?: ScreenShareDiagnostics;
}

export interface ScreenShareLifecycleEvent {
  state: ScreenShareLifecycleState;
  sessionId: string | null;
  sourceLabel: string | null;
  sourceKind: ScreenShareSourceKind | null;
  audioPublished: boolean;
  audioUnavailableReason: string | null;
  settings: ScreenShareSettings | null;
  message: string | null;
  failure?: ScreenShareFailure | null;
  diagnostics?: ScreenShareDiagnostics | null;
}

export class ScreenShareCaptureError extends Error {
  constructor(readonly failure: ScreenShareFailure) {
    super(failure.message);
    this.name = "ScreenShareCaptureError";
  }
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
    const session = await invoke<ScreenShareSession>("start_screen_share", {
      request: input,
    });
    if (session.diagnostics) logDiagnostics(session.diagnostics);
    return {
      ...session,
      audioUnavailableReason: session.audioUnavailableReason ?? null,
    };
  } catch (caught) {
    const failure = parseScreenShareFailure(caught);
    console.error(`[Bakbak screen share] ${failure.code}: ${failure.message}`);
    throw new ScreenShareCaptureError(failure);
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
      const failure =
        payload.failure ??
        (payload.state === "error"
          ? parseScreenShareFailure(payload.message ?? "Capture failed.")
          : null);
      if (failure) {
        console.error(
          `[Bakbak screen share] ${failure.code}: ${failure.message}`,
        );
      }
      if (payload.diagnostics) logDiagnostics(payload.diagnostics);
      onEvent({
        ...payload,
        failure,
        sourceKind: payload.sourceKind ?? null,
        audioUnavailableReason: payload.audioUnavailableReason ?? null,
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

export function parseScreenShareFailure(caught: unknown): ScreenShareFailure {
  if (isFailureRecord(caught)) return caught;
  const raw =
    caught instanceof Error
      ? caught.message
      : typeof caught === "string" && caught.trim()
        ? caught
        : "Native screen sharing failed without an error message.";
  const match = raw.match(
    /^\[(capture-black|cursor-unavailable|audio-isolation-unavailable|capture-failed)\]\s*(.*)$/s,
  );
  const code = (match?.[1] ?? "capture-failed") as ScreenShareFailureCode;
  return {
    code,
    message: match?.[2]?.trim() || raw,
    recommendedRetrySource: code === "capture-black" ? "display" : null,
  };
}

function isFailureRecord(value: unknown): value is ScreenShareFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value.code === "capture-black" ||
      value.code === "cursor-unavailable" ||
      value.code === "audio-isolation-unavailable" ||
      value.code === "capture-failed") &&
    "message" in value &&
    typeof value.message === "string" &&
    "recommendedRetrySource" in value &&
    (value.recommendedRetrySource === "display" ||
      value.recommendedRetrySource === null)
  );
}

function logDiagnostics(diagnostics: ScreenShareDiagnostics): void {
  console.info("[Bakbak screen share diagnostics]", diagnostics);
}
