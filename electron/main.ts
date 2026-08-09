import {
  app,
  BrowserWindow,
  desktopCapturer,
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

const { autoUpdater } = updaterPackage;
const APP_ID = "com.bakbak.desktop";
const APP_HOST = "bakbak";
const DEVELOPMENT_URL = "http://127.0.0.1:1420";
const MAX_UPDATE_TIMEOUT_MS = 10 * 60_000;
const MIN_UPDATE_TIMEOUT_MS = 1_000;

interface PreparedCapture {
  sourceId: string;
  includeAudio: boolean;
  senderId: number;
  expiresAt: number;
}

interface PreparedCaptureInput {
  sourceId: string;
  includeAudio: boolean;
}

let mainWindow: BrowserWindow | null = null;
let preparedCapture: PreparedCapture | null = null;

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
  }
}

function emitMaximized(window: BrowserWindow): void {
  if (!window.isDestroyed()) {
    window.webContents.send("window:maximized-changed", window.isMaximized());
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
  ipcMain.handle("window:minimize", (event) => {
    assertTrustedSender(event).minimize();
  });
  ipcMain.handle("window:toggle-maximize", (event) => {
    const window = assertTrustedSender(event);
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle("window:close", (event) => {
    assertTrustedSender(event).close();
  });
  ipcMain.handle("window:is-maximized", (event) =>
    assertTrustedSender(event).isMaximized(),
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
  ipcMain.handle("app:open-screen-recording-settings", async (event) => {
    assertTrustedSender(event);
    const url =
      process.platform === "darwin"
        ? "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        : "ms-settings:privacy-screenshots";
    await shell.openExternal(url);
  });
  ipcMain.handle("screen-share:list-sources", async (event) => {
    assertTrustedSender(event);
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      fetchWindowIcons: true,
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map((source) => {
      const display = source.id.startsWith("screen:");
      return {
        id: source.id,
        kind: display ? "display" : "application",
        label: source.name,
        applicationLabel: display ? null : source.name,
        audioAvailable: true,
        audioUnavailableReason: null,
        thumbnailDataUrl: source.thumbnail.isEmpty()
          ? null
          : source.thumbnail.toDataURL(),
      };
    });
  });
  ipcMain.handle(
    "screen-share:prepare",
    (event, input: PreparedCaptureInput) => {
      assertTrustedSender(event);
      if (
        !input ||
        typeof input.sourceId !== "string" ||
        input.sourceId.length < 1 ||
        input.sourceId.length > 256 ||
        typeof input.includeAudio !== "boolean"
      ) {
        throw new Error("Invalid screen-share selection.");
      }
      preparedCapture = {
        sourceId: input.sourceId,
        includeAudio: input.includeAudio,
        senderId: event.sender.id,
        expiresAt: Date.now() + 30_000,
      };
    },
  );
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
    "display-capture",
    "fullscreen",
    "clipboard-sanitized-write",
  ]);

  currentSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) =>
      trustedWebContents(webContents) &&
      isTrustedRendererUrl(requestingOrigin) &&
      allowedPermissions.has(permission),
  );
  currentSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(
        trustedWebContents(webContents) && allowedPermissions.has(permission),
      );
    },
  );
  currentSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      const window = mainWindow;
      const capture = preparedCapture;
      preparedCapture = null;
      if (
        !window ||
        !capture ||
        capture.expiresAt < Date.now() ||
        capture.senderId !== window.webContents.id ||
        !request.frame ||
        request.frame.top !== window.webContents.mainFrame ||
        !isTrustedRendererUrl(request.securityOrigin) ||
        !request.userGesture
      ) {
        callback({});
        return;
      }
      void desktopCapturer
        .getSources({
          types: ["screen", "window"],
          thumbnailSize: { width: 0, height: 0 },
        })
        .then((sources) => {
          const source = sources.find(
            (candidate) => candidate.id === capture.sourceId,
          );
          if (!source) {
            callback({});
            return;
          }
          callback({
            video: source,
            ...(capture.includeAudio ? { audio: "loopback" as const } : {}),
          });
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: false },
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
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow(): BrowserWindow {
  const preload = fileURLToPath(new URL("./preload.cjs", import.meta.url));
  const window = new BrowserWindow({
    title: "Bakbak",
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    center: true,
    show: false,
    backgroundColor: "#090909",
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 20 },
        }
      : { frame: false }),
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

  if (process.platform === "win32") {
    window.setBackgroundMaterial("mica");
  }
  window.once("ready-to-show", () => window.show());
  window.on("maximize", () => emitMaximized(window));
  window.on("unmaximize", () => emitMaximized(window));
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
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
