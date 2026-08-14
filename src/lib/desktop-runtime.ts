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
  systemAudioAvailable: boolean;
  systemAudioUnavailableReason: string | null;
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

interface DesktopScreenShareSourceResultBase extends DesktopScreenShareCapabilities {
  permissionStatus: DesktopPermissionStatus;
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
    setWindowControlsVisible?(visible: boolean): Promise<void>;
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
    getCapabilities(): Promise<DesktopScreenShareCapabilities>;
    listSources(): Promise<DesktopScreenShareSourceResult>;
    prepare(input: { sourceId: string; includeAudio: boolean }): Promise<void>;
  };
  updates: {
    check(timeoutMs: number): Promise<DesktopUpdateCheckResult>;
    downloadAndInstall(timeoutMs: number): Promise<void>;
    onProgress(listener: (progress: DesktopUpdateProgress) => void): () => void;
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
