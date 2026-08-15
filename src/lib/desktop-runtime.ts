export type DesktopPlatform = "macos" | "windows";
export type DesktopWindowMaterial = "vibrancy" | "mica" | "fallback";
export type DesktopChromeScheme = "light" | "dark";

export interface DesktopWindowAppearance {
  material: DesktopWindowMaterial;
  reducedTransparency: boolean;
}

export type DesktopPermissionKind = "microphone" | "screen";

export type DesktopPermissionStatus =
  "not-determined" | "granted" | "denied" | "restricted" | "unknown";

export interface DesktopPermissionSnapshot {
  kind: DesktopPermissionKind;
  status: DesktopPermissionStatus;
  canRequest: boolean;
  canOpenSettings: boolean;
  requiresRestart: boolean;
}

export class DesktopPermissionError extends Error {
  constructor(
    readonly permission: DesktopPermissionSnapshot,
    message: string,
  ) {
    super(message);
    this.name = "DesktopPermissionError";
  }
}

export interface DesktopScreenShareCapabilities {
  captureBackend: "native-helper" | "electron-video";
  video: boolean;
  systemAudio: boolean;
  applicationAudio: boolean;
  processTreeIsolation: boolean;
  minOsVersion: string | null;
  reason: string | null;
}

export interface DesktopScreenShareSource {
  id: string;
  kind: "display" | "application";
  label: string;
  applicationLabel: string | null;
  audioAvailable: boolean;
  audioUnavailableReason: string | null;
  thumbnailDataUrl: string | null;
}

export type DesktopScreenShareSourceFailureCode =
  "permission-denied" | "policy-blocked" | "capture-unavailable" | "unknown";

export interface DesktopScreenShareSourceFailure {
  code: DesktopScreenShareSourceFailureCode;
  message: string;
  canOpenSettings: boolean;
  restartRequired: boolean;
}

interface DesktopScreenShareSourceResultBase {
  permissionStatus: DesktopPermissionStatus;
  systemAudioAvailable: boolean;
  systemAudioUnavailableReason: string | null;
}

export interface DesktopScreenShareSourceSuccess extends DesktopScreenShareSourceResultBase {
  ok: true;
  sources: DesktopScreenShareSource[];
  failure: null;
}

export interface DesktopScreenShareSourceFailureResult extends DesktopScreenShareSourceResultBase {
  ok: false;
  sources: [];
  failure: DesktopScreenShareSourceFailure;
}

export type DesktopScreenShareSourceResult =
  DesktopScreenShareSourceSuccess | DesktopScreenShareSourceFailureResult;

export interface DesktopNativeScreenShareSourceResult {
  sources: DesktopScreenShareSource[];
  truncated: boolean;
}

export interface DesktopNativeScreenShareSettings {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
}

export interface DesktopNativeScreenShareStartInput {
  serverUrl: string;
  token: string;
  sourceId: string;
  includeAudio: boolean;
  settings: DesktopNativeScreenShareSettings;
}

export interface DesktopNativeScreenShareSession {
  sessionId: string;
  sourceLabel: string;
  sourceKind: "display" | "application";
  audioPublished: boolean;
  audioUnavailableReason: string | null;
  settings: DesktopNativeScreenShareSettings;
  diagnostics: {
    captureBackend: string;
    audioIsolationMode:
      | "disabled"
      | "exclude-bakbak-process-tree"
      | "include-selected-process-tree";
  };
}

export interface DesktopNativeScreenShareLifecycleEvent {
  sessionId?: string | null;
  state:
    | "ready"
    | "starting"
    | "live"
    | "audio-downgraded"
    | "stopping"
    | "stopped"
    | "failed"
    | "shutting-down";
  reasonCode?: string | null;
  message?: string | null;
  audioPublished?: boolean | null;
}

export interface DesktopUpdateCheckResult {
  supported: boolean;
  available: boolean;
  version: string | null;
}

export interface DesktopUpdateProgress {
  transferred: number;
  total: number | null;
}

export interface BakbakDesktopBridge {
  platform: DesktopPlatform;
  window: {
    getAppearance(): Promise<DesktopWindowAppearance>;
    setChromeScheme(scheme: DesktopChromeScheme): Promise<void>;
    setWindowControlsVisible?(
      visible: boolean,
      sidebarPosition?: "left" | "right",
    ): Promise<void>;
    onToggleSidebar(listener: () => void): () => void;
    onAppearanceChange(
      listener: (appearance: DesktopWindowAppearance) => void,
    ): () => void;
  };
  systemAccent: {
    get(): Promise<unknown>;
    onChange(listener: (accent: unknown) => void): () => void;
  };
  external: {
    open(url: string): Promise<void>;
  };
  app: {
    relaunch(): Promise<void>;
  };
  permissions: {
    get(kind: DesktopPermissionKind): Promise<DesktopPermissionSnapshot>;
    requestMicrophone(): Promise<DesktopPermissionSnapshot>;
    openSettings(kind: DesktopPermissionKind): Promise<boolean>;
  };
  screenShare: {
    capabilities(): Promise<DesktopScreenShareCapabilities>;
    listSources(input?: {
      includeThumbnails?: boolean;
    }): Promise<DesktopNativeScreenShareSourceResult>;
    selectVideoSource(input: { sourceId: string }): Promise<void>;
    start(
      input: DesktopNativeScreenShareStartInput,
    ): Promise<DesktopNativeScreenShareSession>;
    update(input: {
      sessionId: string;
      settings?: DesktopNativeScreenShareSettings;
      paused?: boolean;
    }): Promise<{
      sessionId: string;
      settings: DesktopNativeScreenShareSettings;
      paused: boolean;
    }>;
    stop(input: { sessionId: string }): Promise<{
      sessionId: string;
      stopped: true;
    }>;
    onLifecycle(
      listener: (event: DesktopNativeScreenShareLifecycleEvent) => void,
    ): () => void;
  };
  updates: {
    check(timeoutMs: number): Promise<DesktopUpdateCheckResult>;
    downloadAndInstall(timeoutMs: number): Promise<void>;
    onProgress(listener: (progress: DesktopUpdateProgress) => void): () => void;
    onInstallError(listener: () => void): () => void;
  };
}

declare global {
  interface Window {
    bakbakDesktop?: BakbakDesktopBridge;
  }
}

export function getDesktopBridge(): BakbakDesktopBridge | undefined {
  return typeof window === "undefined" ? undefined : window.bakbakDesktop;
}

export function isDesktopRuntime(): boolean {
  return Boolean(getDesktopBridge());
}
