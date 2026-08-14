import {
  getDesktopBridge,
  isDesktopRuntime,
  type DesktopPermissionKind,
  type DesktopPermissionSnapshot,
  type DesktopScreenShareCapabilities,
  type DesktopScreenShareSource,
  type DesktopScreenShareSourceFailure,
  type DesktopScreenShareSourceResult,
  type DesktopNativeScreenShareLifecycleEvent,
} from "../../lib/desktop-runtime";
import {
  DEFAULT_SCREEN_SHARE_SETTINGS,
  SCREEN_SHARE_FRAME_RATES,
  SCREEN_SHARE_RESOLUTIONS,
  parseScreenShareSettings,
  screenShareBitrate,
  type ScreenShareFrameRate,
  type ScreenShareResolution,
  type ScreenShareSettings,
} from "./screen-share-preferences";

type UnlistenFn = () => void;

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
  | "permission-denied"
  | "policy-blocked"
  | "capture-unavailable"
  | "unknown"
  | "capture-black"
  | "cursor-unavailable"
  | "audio-isolation-unavailable";

export interface ScreenShareFailure {
  code: ScreenShareFailureCode;
  message: string;
  recommendedRetrySource: "display" | null;
  canOpenSettings: boolean;
  restartRequired: boolean;
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

export type ScreenShareSource = DesktopScreenShareSource;
export type ScreenShareSourceListFailure = DesktopScreenShareSourceFailure;
export type ScreenShareSourceListResult = DesktopScreenShareSourceResult;

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

const lifecycleListeners = new Set<
  (event: ScreenShareLifecycleEvent) => void
>();
const nativeSessions = new Map<string, ScreenShareSession>();
let bridgeLifecycleUnlisten: UnlistenFn | null = null;

export function isDesktopApp(): boolean {
  return isDesktopRuntime();
}

export async function getScreenShareCapabilities(): Promise<ScreenShareCapabilities> {
  const bridge = getDesktopBridge();
  if (!bridge) {
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

  let nativeCapabilities: DesktopScreenShareCapabilities;
  try {
    nativeCapabilities = await bridge.screenShare.capabilities();
  } catch {
    return {
      ...defaultScreenShareCapabilities(),
      reason: "The native screen-share helper is unavailable.",
    };
  }

  return {
    available: nativeCapabilities.video,
    nativeCapture: true,
    systemAudio:
      nativeCapabilities.systemAudio && nativeCapabilities.processTreeIsolation,
    sourceKinds: ["display", "application"],
    resolutions: [...SCREEN_SHARE_RESOLUTIONS],
    frameRates: [...SCREEN_SHARE_FRAME_RATES],
    dynamicSettings: true,
    customPicker: true,
    reason: nativeCapabilities.reason,
  };
}

export async function listScreenShareSources(): Promise<ScreenShareSourceListResult> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return {
      ok: false,
      sources: [],
      permissionStatus: "unknown",
      systemAudioAvailable: false,
      systemAudioUnavailableReason:
        "Screen sharing is available in the installed desktop app.",
      failure: {
        code: "capture-unavailable",
        message: "Screen sharing is available in the installed desktop app.",
        canOpenSettings: false,
        restartRequired: false,
      },
    };
  }
  try {
    const [capabilities, sourceResult] = await Promise.all([
      bridge.screenShare.capabilities(),
      bridge.screenShare.listSources({ includeThumbnails: true }),
    ]);
    return {
      ok: true,
      sources: sourceResult.sources,
      permissionStatus: await getPermissionSnapshot("screen").then(
        (permission) => permission.status,
      ),
      systemAudioAvailable:
        capabilities.systemAudio && capabilities.processTreeIsolation,
      systemAudioUnavailableReason:
        capabilities.systemAudio && capabilities.processTreeIsolation
          ? null
          : capabilities.reason,
      failure: null,
    };
  } catch (caught) {
    const permission = await getPermissionSnapshot("screen");
    const permissionDenied = permission.status === "denied";
    const policyBlocked = permission.status === "restricted";
    return {
      ok: false,
      sources: [],
      permissionStatus: permission.status,
      systemAudioAvailable: false,
      systemAudioUnavailableReason:
        "Native process-isolated system audio is unavailable.",
      failure: {
        code: permissionDenied
          ? "permission-denied"
          : policyBlocked
            ? "policy-blocked"
            : "unknown",
        message:
          permissionDenied && bridge.platform === "macos"
            ? "Allow Bakbak in macOS Privacy & Security > Screen Recording, then restart Bakbak."
            : parseScreenShareFailure(caught).message,
        canOpenSettings: permission.canOpenSettings,
        restartRequired: permission.requiresRestart,
      },
    };
  }
}

export async function requestMicrophonePermission(): Promise<DesktopPermissionSnapshot> {
  return (
    (await getDesktopBridge()?.permissions.requestMicrophone()) ?? {
      kind: "microphone",
      status: "unknown",
      canRequest: false,
      canOpenSettings: false,
      requiresRestart: false,
    }
  );
}

export async function getPermissionSnapshot(
  kind: DesktopPermissionKind,
): Promise<DesktopPermissionSnapshot> {
  return (
    (await getDesktopBridge()?.permissions.get(kind)) ?? {
      kind,
      status: "unknown",
      canRequest: false,
      canOpenSettings: false,
      requiresRestart: false,
    }
  );
}

export async function openPermissionSettings(
  kind: DesktopPermissionKind,
): Promise<boolean> {
  return (await getDesktopBridge()?.permissions.openSettings(kind)) ?? false;
}

export async function restartDesktopApp(): Promise<void> {
  await getDesktopBridge()?.app.relaunch();
}

export async function startScreenShare(
  input: StartScreenShareInput,
): Promise<ScreenShareSession> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    throw new Error(
      "Screen sharing is available in the installed desktop app.",
    );
  }
  const settings = parseScreenShareSettings(input.settings);
  try {
    const sourceResult = await listScreenShareSources();
    if (!sourceResult.ok) {
      throw new ScreenShareCaptureError(
        screenShareSourceFailure(sourceResult.failure),
      );
    }
    const sources = sourceResult.sources;
    const source = input.sourceId
      ? sources.find((candidate) => candidate.id === input.sourceId)
      : (sources.find((candidate) => candidate.kind === "display") ??
        sources[0]);
    if (!source) {
      throw new ScreenShareCaptureError({
        code: "capture-unavailable",
        message: "The selected screen source is unavailable.",
        recommendedRetrySource: null,
        canOpenSettings: false,
        restartRequired: false,
      });
    }

    const includeAudio =
      input.includeAudio &&
      source.audioAvailable &&
      sourceResult.systemAudioAvailable;
    const nativeSession = await bridge.screenShare.start({
      serverUrl: input.serverUrl,
      token: input.token,
      sourceId: source.id,
      includeAudio,
      settings: nativeSettings(settings),
    });
    const diagnostics: ScreenShareDiagnostics = {
      os: bridge.platform,
      osBuild: "native-helper",
      sourceKind: nativeSession.sourceKind,
      captureBackend: nativeSession.diagnostics.captureBackend,
      cursorCapability: "native-capture",
      audioIsolationMode: nativeSession.diagnostics.audioIsolationMode,
      failureCode: null,
    };
    const session: ScreenShareSession = {
      sessionId: nativeSession.sessionId,
      sourceLabel: nativeSession.sourceLabel,
      sourceKind: nativeSession.sourceKind,
      audioPublished: nativeSession.audioPublished,
      audioUnavailableReason:
        nativeSession.audioUnavailableReason ??
        (input.includeAudio && !includeAudio
          ? (source.audioUnavailableReason ??
            "The selected source cannot provide isolated system audio.")
          : null),
      settings,
      diagnostics,
    };
    nativeSessions.set(session.sessionId, session);
    logDiagnostics(diagnostics);
    return session;
  } catch (caught) {
    const failure =
      caught instanceof ScreenShareCaptureError
        ? caught.failure
        : parseScreenShareFailure(caught);
    console.error(`[Bakbak screen share] ${failure.code}: ${failure.message}`);
    if (caught instanceof ScreenShareCaptureError) throw caught;
    throw new ScreenShareCaptureError(failure);
  }
}

export async function updateScreenShareSettings(
  sessionId: string,
  settings: ScreenShareSettings,
): Promise<ScreenShareSettings> {
  if (!isDesktopRuntime()) {
    throw new Error(
      "Live screen-share changes are available in the installed desktop app.",
    );
  }
  const updated = parseScreenShareSettings(settings);
  const bridge = getDesktopBridge();
  if (!bridge) throw new Error("Native screen sharing is unavailable.");
  await bridge.screenShare.update({
    sessionId,
    settings: nativeSettings(updated),
  });
  const session = nativeSessions.get(sessionId);
  if (session) nativeSessions.set(sessionId, { ...session, settings: updated });
  return updated;
}

export async function stopScreenShare(sessionId: string): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge) return;
  await bridge.screenShare.stop({ sessionId });
  nativeSessions.delete(sessionId);
}

export function listenForScreenShareLifecycle(
  onEvent: (event: ScreenShareLifecycleEvent) => void,
): Promise<UnlistenFn> {
  const bridge = getDesktopBridge();
  if (!bridge) return Promise.resolve(() => undefined);
  lifecycleListeners.add(onEvent);
  if (!bridgeLifecycleUnlisten) {
    bridgeLifecycleUnlisten = bridge.screenShare.onLifecycle((event) => {
      const mapped = mapNativeLifecycle(event);
      if (mapped) emitLifecycle(mapped);
    });
  }
  return Promise.resolve(() => {
    lifecycleListeners.delete(onEvent);
    if (lifecycleListeners.size === 0 && bridgeLifecycleUnlisten) {
      bridgeLifecycleUnlisten();
      bridgeLifecycleUnlisten = null;
    }
  });
}

function emitLifecycle(event: ScreenShareLifecycleEvent): void {
  if (event.failure) {
    console.error(
      `[Bakbak screen share] ${event.failure.code}: ${event.failure.message}`,
    );
  }
  for (const listener of lifecycleListeners) listener(event);
}

function mapNativeLifecycle(
  event: DesktopNativeScreenShareLifecycleEvent,
): ScreenShareLifecycleEvent | null {
  if (event.state === "ready" || event.state === "shutting-down") return null;
  const session = event.sessionId
    ? (nativeSessions.get(event.sessionId) ?? null)
    : null;
  const state: ScreenShareLifecycleState =
    event.state === "starting"
      ? "starting"
      : event.state === "live" || event.state === "audio-downgraded"
        ? "sharing"
        : event.state === "stopping"
          ? "stopping"
          : event.state === "stopped"
            ? "idle"
            : "error";
  const failure =
    state === "error"
      ? parseScreenShareFailure(
          event.message ?? "Native screen sharing ended unexpectedly.",
        )
      : null;
  if (event.sessionId && (state === "idle" || state === "error")) {
    nativeSessions.delete(event.sessionId);
  }
  return {
    state,
    sessionId: event.sessionId ?? null,
    sourceLabel: session?.sourceLabel ?? null,
    sourceKind: session?.sourceKind ?? null,
    audioPublished: event.audioPublished ?? session?.audioPublished ?? false,
    audioUnavailableReason:
      event.state === "audio-downgraded"
        ? (event.message ?? session?.audioUnavailableReason ?? null)
        : (session?.audioUnavailableReason ?? null),
    settings: session?.settings ?? null,
    message: event.message ?? null,
    failure,
    diagnostics: session?.diagnostics ?? null,
  };
}

function nativeSettings(settings: ScreenShareSettings) {
  return {
    width:
      settings.resolution === 480
        ? 854
        : Math.round(settings.resolution * (16 / 9)),
    height: settings.resolution,
    frameRate: settings.frameRate,
    maxBitrate: screenShareBitrate(settings),
  };
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
  if (caught instanceof ScreenShareCaptureError) return caught.failure;
  if (isFailureRecord(caught)) return caught;
  if (caught instanceof DOMException && caught.name === "NotFoundError") {
    return {
      code: "capture-unavailable",
      message: "The selected screen source is no longer available.",
      recommendedRetrySource: null,
      canOpenSettings: false,
      restartRequired: false,
    };
  }
  const raw =
    caught instanceof Error
      ? caught.message
      : typeof caught === "string" && caught.trim()
        ? caught
        : "Native screen sharing failed without an error message.";
  return {
    code: "unknown",
    message: raw,
    recommendedRetrySource: null,
    canOpenSettings: false,
    restartRequired: false,
  };
}

function screenShareSourceFailure(
  failure: DesktopScreenShareSourceFailure,
): ScreenShareFailure {
  return {
    ...failure,
    recommendedRetrySource: null,
  };
}

function isFailureRecord(value: unknown): value is ScreenShareFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value.code === "permission-denied" ||
      value.code === "policy-blocked" ||
      value.code === "capture-unavailable" ||
      value.code === "unknown" ||
      value.code === "capture-black" ||
      value.code === "cursor-unavailable" ||
      value.code === "audio-isolation-unavailable") &&
    "message" in value &&
    typeof value.message === "string" &&
    "recommendedRetrySource" in value &&
    (value.recommendedRetrySource === "display" ||
      value.recommendedRetrySource === null) &&
    "canOpenSettings" in value &&
    typeof value.canOpenSettings === "boolean" &&
    "restartRequired" in value &&
    typeof value.restartRequired === "boolean"
  );
}

function logDiagnostics(diagnostics: ScreenShareDiagnostics): void {
  console.info("[Bakbak screen share diagnostics]", diagnostics);
}

export const screenShareServiceTesting = {
  reset(): void {
    bridgeLifecycleUnlisten?.();
    bridgeLifecycleUnlisten = null;
    nativeSessions.clear();
    lifecycleListeners.clear();
  },
};
