export type DesktopPlatform = "macos" | "windows";

export interface DesktopScreenShareSource {
  id: string;
  kind: "display" | "application";
  label: string;
  applicationLabel: string | null;
  audioAvailable: boolean;
  audioUnavailableReason: string | null;
  thumbnailDataUrl: string | null;
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
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximizedChange(listener: (maximized: boolean) => void): () => void;
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
    openScreenRecordingSettings(): Promise<void>;
  };
  screenShare: {
    listSources(): Promise<DesktopScreenShareSource[]>;
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
