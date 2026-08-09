import { getDesktopBridge } from "./desktop-runtime";

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
  return getDesktopBridge()?.platform ?? "web";
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

  const desktopWindow = getDesktopBridge()?.window;
  if (!desktopWindow) throw new Error("Desktop window bridge is unavailable.");
  return {
    platform,
    minimize: () => desktopWindow.minimize(),
    toggleMaximize: () => desktopWindow.toggleMaximize(),
    close: () => desktopWindow.close(),
    startDragging: () => Promise.resolve(),
    isMaximized: () => desktopWindow.isMaximized(),
    onMaximizedChange: (listener) =>
      Promise.resolve(desktopWindow.onMaximizedChange(listener)),
  };
}
