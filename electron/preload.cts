import { contextBridge, ipcRenderer } from "electron";

type StopListening = () => void;

function subscribe<T>(
  channel: string,
  listener: (value: T) => void,
): StopListening {
  const wrapped = (_event: Electron.IpcRendererEvent, value: T) =>
    listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const bridge = Object.freeze({
  platform: process.platform === "darwin" ? "macos" : "windows",
  window: Object.freeze({
    minimize: () => ipcRenderer.invoke("window:minimize") as Promise<void>,
    toggleMaximize: () =>
      ipcRenderer.invoke("window:toggle-maximize") as Promise<void>,
    close: () => ipcRenderer.invoke("window:close") as Promise<void>,
    isMaximized: () =>
      ipcRenderer.invoke("window:is-maximized") as Promise<boolean>,
    onMaximizedChange: (listener: (maximized: boolean) => void) =>
      subscribe("window:maximized-changed", listener),
  }),
  systemAccent: Object.freeze({
    get: () => ipcRenderer.invoke("system-accent:get") as Promise<unknown>,
    onChange: (listener: (accent: unknown) => void) =>
      subscribe("system-accent:changed", listener),
  }),
  external: Object.freeze({
    open: (url: string) =>
      ipcRenderer.invoke("external:open", url) as Promise<void>,
  }),
  app: Object.freeze({
    relaunch: () => ipcRenderer.invoke("app:relaunch") as Promise<void>,
    openScreenRecordingSettings: () =>
      ipcRenderer.invoke("app:open-screen-recording-settings") as Promise<void>,
  }),
  screenShare: Object.freeze({
    listSources: () =>
      ipcRenderer.invoke("screen-share:list-sources") as Promise<unknown>,
    prepare: (input: { sourceId: string; includeAudio: boolean }) =>
      ipcRenderer.invoke("screen-share:prepare", input) as Promise<void>,
  }),
  updates: Object.freeze({
    check: (timeoutMs: number) =>
      ipcRenderer.invoke("updates:check", timeoutMs) as Promise<unknown>,
    downloadAndInstall: (timeoutMs: number) =>
      ipcRenderer.invoke(
        "updates:download-and-install",
        timeoutMs,
      ) as Promise<void>,
    onProgress: (
      listener: (progress: {
        transferred: number;
        total: number | null;
      }) => void,
    ) => subscribe("updates:progress", listener),
  }),
});

contextBridge.exposeInMainWorld("bakbakDesktop", bridge);
