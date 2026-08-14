import { contextBridge, ipcRenderer } from "electron";

type StopListening = () => void;
type PermissionKind = "microphone" | "screen";
type PermissionStatus =
  "not-determined" | "granted" | "denied" | "restricted" | "unknown";
interface PermissionSnapshot {
  kind: PermissionKind;
  status: PermissionStatus;
  canRequest: boolean;
  canOpenSettings: boolean;
  requiresRestart: boolean;
}
type ChromeScheme = "light" | "dark";
type SidebarPosition = "left" | "right";

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
    getAppearance: () =>
      ipcRenderer.invoke("window:get-appearance") as Promise<unknown>,
    setChromeScheme: (scheme: ChromeScheme) =>
      ipcRenderer.invoke("window:set-chrome-scheme", scheme) as Promise<void>,
    setWindowControlsVisible: (
      visible: boolean,
      sidebarPosition: SidebarPosition = "left",
    ) =>
      ipcRenderer.invoke(
        "window:set-controls-visible",
        visible,
        sidebarPosition,
      ) as Promise<void>,
    onToggleSidebar: (listener: () => void) =>
      subscribe("window:toggle-sidebar", listener),
    onAppearanceChange: (listener: (appearance: unknown) => void) =>
      subscribe("window:appearance-changed", listener),
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
  }),
  permissions: Object.freeze({
    get: (kind: PermissionKind) =>
      ipcRenderer.invoke(
        "permissions:get",
        kind,
      ) as Promise<PermissionSnapshot>,
    requestMicrophone: () =>
      ipcRenderer.invoke(
        "permissions:request-microphone",
      ) as Promise<PermissionSnapshot>,
    openSettings: (kind: PermissionKind) =>
      ipcRenderer.invoke("permissions:open-settings", kind) as Promise<boolean>,
  }),
  screenShare: Object.freeze({
    capabilities: () =>
      ipcRenderer.invoke("screen-share:capabilities") as Promise<unknown>,
    listSources: (input: { includeThumbnails?: boolean } = {}) =>
      ipcRenderer.invoke(
        "screen-share:list-sources",
        input,
      ) as Promise<unknown>,
    start: (input: unknown) =>
      ipcRenderer.invoke("screen-share:start", input) as Promise<unknown>,
    update: (input: unknown) =>
      ipcRenderer.invoke("screen-share:update", input) as Promise<unknown>,
    stop: (input: { sessionId: string }) =>
      ipcRenderer.invoke("screen-share:stop", input) as Promise<unknown>,
    onLifecycle: (listener: (event: unknown) => void) =>
      subscribe("screen-share:lifecycle", listener),
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
