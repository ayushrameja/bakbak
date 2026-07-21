import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type WindowChromePlatform = "macos" | "windows" | "web";

export interface WindowChromeAdapter {
  platform: WindowChromePlatform;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  startDragging(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(
    listener: (maximized: boolean) => void,
  ): Promise<() => void>;
}

function detectPlatform(): WindowChromePlatform {
  if (typeof navigator === "undefined" || !isTauri()) return "web";
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("macintosh") || userAgent.includes("mac os")) {
    return "macos";
  }
  if (userAgent.includes("windows")) return "windows";
  return "web";
}

export function createWindowChromeAdapter(): WindowChromeAdapter {
  const platform = detectPlatform();
  if (platform === "web") {
    return {
      platform,
      minimize: () => Promise.resolve(),
      toggleMaximize: () => Promise.resolve(),
      close: () => Promise.resolve(),
      startDragging: () => Promise.resolve(),
      isMaximized: () => Promise.resolve(false),
      onMaximizedChange: () => Promise.resolve(() => undefined),
    };
  }

  const appWindow = getCurrentWindow();
  return {
    platform,
    minimize: () => appWindow.minimize(),
    toggleMaximize: () => appWindow.toggleMaximize(),
    close: () => appWindow.close(),
    startDragging: () => appWindow.startDragging(),
    isMaximized: () => appWindow.isMaximized(),
    onMaximizedChange: async (listener) => {
      const emitCurrentState = async () => {
        try {
          listener(await appWindow.isMaximized());
        } catch {
          // Losing a cosmetic maximize-state read must not affect the window.
        }
      };
      return appWindow.onResized(() => {
        void emitCurrentState();
      });
    },
  };
}
