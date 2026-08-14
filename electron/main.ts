import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
  systemPreferences,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from "electron";
import updaterPackage from "electron-updater";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ScreenShareHelperManager,
  resolveScreenShareHelperPath,
} from "./screen-share-helper.js";
import { NATIVE_SCREEN_AUDIO_ENABLED } from "./screen-share-rollout.js";

const { autoUpdater } = updaterPackage;
const APP_ID = "com.bakbak.desktop";
const APP_HOST = "bakbak";
const DEVELOPMENT_URL = "http://127.0.0.1:1420";
const MAX_UPDATE_TIMEOUT_MS = 10 * 60_000;
const MIN_UPDATE_TIMEOUT_MS = 1_000;
const WINDOWS_MICA_MIN_BUILD = 22_621;
const MAC_WINDOW_CONTROLS_POSITIONS = {
  left: { x: 16, y: 16 },
  right: { x: 16, y: 8 },
} as const;

type PermissionKind = "microphone" | "screen";
type PermissionStatus =
  "not-determined" | "granted" | "denied" | "restricted" | "unknown";

type WindowMaterial = "vibrancy" | "mica" | "fallback";
type SidebarPosition = keyof typeof MAC_WINDOW_CONTROLS_POSITIONS;

let mainWindow: BrowserWindow | null = null;
let screenShareHelper: ScreenShareHelperManager | null = null;
let helperShutdownStarted = false;
let windowMaterial: WindowMaterial = "fallback";
let macWindowControlsVisible = true;
let macWindowControlsSidebarPosition: SidebarPosition = "left";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

app.enableSandbox();
app.setName("Bakbak");
app.setAppUserModelId(APP_ID);
app.setPath("userData", path.join(app.getPath("appData"), APP_ID));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function isTrustedRendererUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (app.isPackaged) {
      return url.protocol === "app:" && url.hostname === APP_HOST;
    }
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      url.port === "1420"
    );
  } catch {
    return false;
  }
}

function isTrustedYouTubeEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "www.youtube-nocookie.com" &&
      url.port === "" &&
      url.pathname.startsWith("/embed/")
    );
  } catch {
    return false;
  }
}

function isTrustedYouTubeOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "www.youtube-nocookie.com" &&
      url.port === ""
    );
  } catch {
    return false;
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent): BrowserWindow {
  const window = mainWindow;
  const frameUrl = event.senderFrame?.url ?? event.sender.getURL();
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !== window.webContents ||
    event.senderFrame !== event.sender.mainFrame ||
    !isTrustedRendererUrl(frameUrl)
  ) {
    throw new Error("Rejected desktop request from an untrusted renderer.");
  }
  return window;
}

function windowsBuildNumber(): number {
  if (process.platform !== "win32") return 0;
  const match = process.getSystemVersion().match(/(?:^|\.)(\d+)$/);
  return match?.[1] ? Number(match[1]) : 0;
}

function reducedTransparencyRequested(): boolean {
  try {
    return nativeTheme.prefersReducedTransparency;
  } catch {
    return false;
  }
}

function opaqueMaterialRequired(): boolean {
  return (
    reducedTransparencyRequested() || nativeTheme.shouldUseHighContrastColors
  );
}

function windowAppearance() {
  return {
    material: opaqueMaterialRequired() ? "fallback" : windowMaterial,
    reducedTransparency: reducedTransparencyRequested(),
  };
}

function setChromeScheme(window: BrowserWindow, scheme: unknown): void {
  if (scheme !== "light" && scheme !== "dark") {
    throw new Error("Invalid window chrome scheme.");
  }
  if (process.platform !== "win32") return;
  window.setTitleBarOverlay({
    color: "#00000000",
    symbolColor: scheme === "dark" ? "#f5f5f3" : "#1b1b19",
    height: 40,
  });
}

function applyMacWindowControlsVisibility(window: BrowserWindow): void {
  if (process.platform !== "darwin" || window.isDestroyed()) return;
  window.setWindowButtonPosition(
    MAC_WINDOW_CONTROLS_POSITIONS[macWindowControlsSidebarPosition],
  );
  window.setWindowButtonVisibility(macWindowControlsVisible);
}

function setMacWindowControlsState(
  window: BrowserWindow,
  visible: boolean,
  sidebarPosition: SidebarPosition,
): void {
  macWindowControlsVisible = visible;
  macWindowControlsSidebarPosition = sidebarPosition;
  applyMacWindowControlsVisibility(window);
}

function parseTimeout(value: unknown): number {
  if (!Number.isFinite(value)) return MIN_UPDATE_TIMEOUT_MS;
  return Math.min(
    MAX_UPDATE_TIMEOUT_MS,
    Math.max(MIN_UPDATE_TIMEOUT_MS, Math.round(Number(value))),
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Desktop request timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function validatedExternalUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("A URL is required.");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS links can be opened.");
  }
  return parsed.toString();
}

function validatedPermissionKind(value: unknown): PermissionKind {
  if (value !== "microphone" && value !== "screen") {
    throw new Error("Invalid media permission kind.");
  }
  return value;
}

function normalizePermissionStatus(value: unknown): PermissionStatus {
  switch (value) {
    case "not-determined":
    case "granted":
    case "denied":
    case "restricted":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

function getPermissionStatus(kind: PermissionKind): PermissionStatus {
  try {
    return normalizePermissionStatus(
      systemPreferences.getMediaAccessStatus(kind),
    );
  } catch {
    return "unknown";
  }
}

function permissionSnapshot(kind: PermissionKind) {
  const status = getPermissionStatus(kind);
  const denied = status === "denied";
  return {
    kind,
    status,
    canRequest:
      process.platform === "darwin" &&
      kind === "microphone" &&
      status === "not-determined",
    canOpenSettings:
      denied &&
      (process.platform === "darwin" ||
        (process.platform === "win32" && kind === "microphone")),
    requiresRestart: process.platform === "darwin" && denied,
  };
}

function getScreenShareHelper(): ScreenShareHelperManager {
  if (!screenShareHelper) {
    throw new Error("Native screen sharing is not ready.");
  }
  return screenShareHelper;
}

function configureScreenShareHelper(): void {
  screenShareHelper = new ScreenShareHelperManager({
    binaryPath: resolveScreenShareHelperPath({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
      platform: process.platform,
      ...(!app.isPackaged && process.env.BAKBAK_SCREEN_SHARE_HELPER_PATH
        ? {
            developmentOverride: process.env.BAKBAK_SCREEN_SHARE_HELPER_PATH,
          }
        : {}),
    }),
    electronRootPid: process.pid,
    bundleId: APP_ID,
    appVersion: app.getVersion(),
    nativeAudioEnabled: NATIVE_SCREEN_AUDIO_ENABLED,
  });
  screenShareHelper.onLifecycle((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("screen-share:lifecycle", event);
    }
  });
}

async function openPermissionSettings(kind: PermissionKind): Promise<boolean> {
  const url =
    process.platform === "darwin"
      ? kind === "microphone"
        ? "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        : "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
      : kind === "microphone"
        ? "ms-settings:privacy-microphone"
        : null;
  if (!url) return false;
  await shell.openExternal(url);
  return true;
}

function currentSystemAccent(): {
  red: number;
  green: number;
  blue: number;
  source: "macos" | "windows" | "fallback";
} {
  try {
    const raw = systemPreferences.getAccentColor().replace(/^#/, "");
    if (/^[0-9a-f]{8}$/i.test(raw) || /^[0-9a-f]{6}$/i.test(raw)) {
      return {
        red: Number.parseInt(raw.slice(0, 2), 16),
        green: Number.parseInt(raw.slice(2, 4), 16),
        blue: Number.parseInt(raw.slice(4, 6), 16),
        source: process.platform === "darwin" ? "macos" : "windows",
      };
    }
  } catch {
    // The neutral fallback keeps startup deterministic on unsupported hosts.
  }
  return { red: 128, green: 128, blue: 128, source: "fallback" };
}

function emitSystemAccent(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("system-accent:changed", currentSystemAccent());
    mainWindow.webContents.send(
      "window:appearance-changed",
      windowAppearance(),
    );
  }
}

function configureUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on("download-progress", (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updates:progress", {
        transferred: progress.transferred,
        total: Number.isFinite(progress.total) ? progress.total : null,
      });
    }
  });
  autoUpdater.on("error", (error) => {
    console.error(`[Bakbak updater] ${error.message}`);
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle("window:get-appearance", (event) => {
    assertTrustedSender(event);
    return windowAppearance();
  });
  ipcMain.handle("window:set-chrome-scheme", (event, scheme: unknown) => {
    setChromeScheme(assertTrustedSender(event), scheme);
  });
  ipcMain.handle(
    "window:set-controls-visible",
    (event, visible: unknown, sidebarPosition: unknown) => {
      const window = assertTrustedSender(event);
      if (typeof visible !== "boolean") {
        throw new Error("Invalid window controls visibility.");
      }
      if (
        sidebarPosition !== undefined &&
        sidebarPosition !== "left" &&
        sidebarPosition !== "right"
      ) {
        throw new Error("Invalid sidebar position for window controls.");
      }
      setMacWindowControlsState(window, visible, sidebarPosition ?? "left");
    },
  );
  ipcMain.handle("system-accent:get", (event) => {
    assertTrustedSender(event);
    return currentSystemAccent();
  });
  ipcMain.handle("external:open", async (event, value: unknown) => {
    assertTrustedSender(event);
    await shell.openExternal(validatedExternalUrl(value));
  });
  ipcMain.handle("app:relaunch", (event) => {
    assertTrustedSender(event);
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle("permissions:get", (event, rawKind: unknown) => {
    assertTrustedSender(event);
    return permissionSnapshot(validatedPermissionKind(rawKind));
  });
  ipcMain.handle("permissions:request-microphone", async (event) => {
    assertTrustedSender(event);
    if (
      process.platform === "darwin" &&
      getPermissionStatus("microphone") === "not-determined"
    ) {
      try {
        const granted = await systemPreferences.askForMediaAccess("microphone");
        if (granted) {
          return {
            ...permissionSnapshot("microphone"),
            status: "granted" as const,
            canRequest: false,
            canOpenSettings: false,
            requiresRestart: false,
          };
        }
      } catch {
        // The snapshot below remains the renderer's normalized recovery path.
      }
    }
    return permissionSnapshot("microphone");
  });
  ipcMain.handle(
    "permissions:open-settings",
    async (event, rawKind: unknown) => {
      assertTrustedSender(event);
      return openPermissionSettings(validatedPermissionKind(rawKind));
    },
  );
  ipcMain.handle("screen-share:capabilities", async (event) => {
    assertTrustedSender(event);
    return getScreenShareHelper().capabilities();
  });
  ipcMain.handle("screen-share:list-sources", async (event, input: unknown) => {
    assertTrustedSender(event);
    return getScreenShareHelper().listSources(
      input && typeof input === "object" ? input : {},
    );
  });
  ipcMain.handle("screen-share:start", async (event, input: unknown) => {
    assertTrustedSender(event);
    return getScreenShareHelper().start(
      input as Parameters<ScreenShareHelperManager["start"]>[0],
    );
  });
  ipcMain.handle("screen-share:update", async (event, input: unknown) => {
    assertTrustedSender(event);
    return getScreenShareHelper().update(
      input as Parameters<ScreenShareHelperManager["update"]>[0],
    );
  });
  ipcMain.handle("screen-share:stop", async (event, input: unknown) => {
    assertTrustedSender(event);
    return getScreenShareHelper().stop(
      input as Parameters<ScreenShareHelperManager["stop"]>[0],
    );
  });
  ipcMain.handle("updates:check", async (event, rawTimeout: unknown) => {
    assertTrustedSender(event);
    if (!app.isPackaged || !["darwin", "win32"].includes(process.platform)) {
      return { supported: false, available: false, version: null };
    }
    const result = await withTimeout(
      autoUpdater.checkForUpdates(),
      parseTimeout(rawTimeout),
    );
    return {
      supported: true,
      available: result?.isUpdateAvailable ?? false,
      version: result?.isUpdateAvailable ? result.updateInfo.version : null,
    };
  });
  ipcMain.handle(
    "updates:download-and-install",
    async (event, rawTimeout: unknown) => {
      assertTrustedSender(event);
      if (!app.isPackaged)
        throw new Error("Updates require an installed build.");
      await withTimeout(autoUpdater.downloadUpdate(), parseTimeout(rawTimeout));
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
    },
  );
}

function configureSession(): void {
  const currentSession = session.defaultSession;
  const trustedWebContents = (webContents: Electron.WebContents | null) =>
    Boolean(
      webContents &&
      mainWindow &&
      webContents === mainWindow.webContents &&
      isTrustedRendererUrl(webContents.getURL()),
    );
  const allowedPermissions = new Set([
    "media",
    "fullscreen",
    "clipboard-sanitized-write",
  ]);

  currentSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => {
      if (
        !trustedWebContents(webContents) ||
        !allowedPermissions.has(permission)
      ) {
        return false;
      }
      if (details.isMainFrame) {
        return (
          isTrustedRendererUrl(requestingOrigin) &&
          Boolean(
            details.requestingUrl &&
            isTrustedRendererUrl(details.requestingUrl),
          ) &&
          (!details.securityOrigin ||
            isTrustedRendererUrl(details.securityOrigin))
        );
      }
      return (
        permission === "fullscreen" &&
        isTrustedYouTubeOrigin(requestingOrigin) &&
        Boolean(
          details.embeddingOrigin &&
          isTrustedRendererUrl(details.embeddingOrigin),
        )
      );
    },
  );
  currentSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const trustedMainFrame =
        details.isMainFrame && isTrustedRendererUrl(details.requestingUrl);
      const trustedEmbedFullscreen =
        permission === "fullscreen" &&
        !details.isMainFrame &&
        isTrustedYouTubeEmbedUrl(details.requestingUrl);
      const trustedMediaOrigin =
        permission !== "media" ||
        !("securityOrigin" in details) ||
        !details.securityOrigin ||
        isTrustedRendererUrl(details.securityOrigin);
      callback(
        trustedWebContents(webContents) &&
          allowedPermissions.has(permission) &&
          trustedMediaOrigin &&
          (trustedMainFrame || trustedEmbedFullscreen),
      );
    },
  );
}

function registerAppProtocol(): void {
  const rendererRoot = path.join(app.getAppPath(), "dist");
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== APP_HOST)
      return new Response("Not found", { status: 404 });
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    let resolved = path.resolve(rendererRoot, `.${requestedPath}`);
    const rootPrefix = `${path.resolve(rendererRoot)}${path.sep}`;
    if (!resolved.startsWith(rootPrefix)) {
      return new Response("Not found", { status: 404 });
    }
    try {
      await access(resolved);
    } catch {
      resolved = path.join(rendererRoot, "index.html");
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });
}

function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Sidebar",
          accelerator: "CmdOrCtrl+B",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("window:toggle-sidebar");
            }
          },
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow(): BrowserWindow {
  macWindowControlsVisible = true;
  macWindowControlsSidebarPosition = "left";
  const preload = fileURLToPath(new URL("./preload.cjs", import.meta.url));
  const window = new BrowserWindow({
    title: "Bakbak",
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    center: true,
    show: false,
    backgroundColor: "#00000000",
    transparent: true,
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: MAC_WINDOW_CONTROLS_POSITIONS.left,
          vibrancy: "under-window" as const,
          visualEffectState: "active" as const,
        }
      : {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#f5f5f3",
            height: 40,
          },
        }),
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      spellcheck: true,
    },
  });

  if (
    process.platform === "win32" &&
    windowsBuildNumber() >= WINDOWS_MICA_MIN_BUILD &&
    !opaqueMaterialRequired()
  ) {
    try {
      window.setBackgroundMaterial("mica");
      windowMaterial = "mica";
    } catch {
      windowMaterial = "fallback";
    }
  } else if (process.platform === "darwin") {
    windowMaterial = opaqueMaterialRequired() ? "fallback" : "vibrancy";
  } else {
    windowMaterial = "fallback";
  }
  window.once("ready-to-show", () => {
    window.show();
    applyMacWindowControlsVisibility(window);
  });
  window.on("focus", () => applyMacWindowControlsVisibility(window));
  window.on("restore", () => applyMacWindowControlsVisibility(window));
  window.on("leave-full-screen", () =>
    applyMacWindowControlsVisibility(window),
  );
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
      void screenShareHelper?.stopActive();
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(validatedExternalUrl(url));
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(validatedExternalUrl(url));
    }
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );

  if (app.isPackaged) void window.loadURL(`app://${APP_HOST}/index.html`);
  else void window.loadURL(DEVELOPMENT_URL);
  return window;
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

void app.whenReady().then(() => {
  registerAppProtocol();
  installApplicationMenu();
  configureUpdater();
  configureScreenShareHelper();
  registerIpcHandlers();
  mainWindow = createMainWindow();
  configureSession();

  if (process.platform === "win32") {
    systemPreferences.on("accent-color-changed", emitSystemAccent);
    systemPreferences.on("color-changed", emitSystemAccent);
  }
  nativeTheme.on("updated", emitSystemAccent);

  app.on("activate", () => {
    if (!mainWindow) {
      mainWindow = createMainWindow();
      configureSession();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (helperShutdownStarted || !screenShareHelper) return;
  event.preventDefault();
  helperShutdownStarted = true;
  void screenShareHelper.shutdown().finally(() => app.quit());
});
