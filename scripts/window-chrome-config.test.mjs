import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const packageMetadata = JSON.parse(
  await readFile(new URL("package.json", root), "utf8"),
);
const main = await readFile(new URL("electron/main.ts", root), "utf8");
const preload = await readFile(new URL("electron/preload.cts", root), "utf8");
const screenShareService = await readFile(
  new URL("src/features/voice/screen-share-service.ts", root),
  "utf8",
);
const styles = await readFile(new URL("src/styles.css", root), "utf8");
const macEntitlements = await readFile(
  new URL("build/entitlements.mac.plist", root),
  "utf8",
);

test("Electron keeps the existing app and supported platform identities", () => {
  assert.equal(packageMetadata.build.appId, "com.bakbak.desktop");
  assert.equal(packageMetadata.build.productName, "Bakbak");
  assert.equal(packageMetadata.build.executableName, "bakbak");
  assert.deepEqual(packageMetadata.build.mac.target, [
    { target: "dmg", arch: ["arm64"] },
    { target: "zip", arch: ["arm64"] },
  ]);
  assert.deepEqual(packageMetadata.build.win.target, [
    { target: "nsis", arch: ["x64"] },
  ]);
  assert.match(
    macEntitlements,
    /com\.apple\.security\.cs\.disable-library-validation/,
  );
  assert.match(main, /width: 1280/);
  assert.match(main, /height: 800/);
  assert.match(main, /minWidth: 1024/);
  assert.match(main, /minHeight: 680/);
  assert.match(main, /label: "View"/);
  assert.match(main, /label: "Toggle Sidebar"/);
  assert.match(main, /accelerator: "CmdOrCtrl\+B"/);
  assert.match(main, /webContents\.send\("window:toggle-sidebar"\)/);
  assert.match(main, /trafficLightPosition:\s*\{ x: 16, y: 16 \}/);
  assert.match(
    main,
    /window\.setWindowButtonVisibility\(macWindowControlsVisible\)/,
  );
  assert.match(main, /window\.on\("focus"/);
  assert.match(main, /window\.on\("restore"/);
  assert.match(main, /window\.on\("leave-full-screen"/);
  assert.match(preload, /window:set-controls-visible/);
  assert.match(styles, /-webkit-app-region: drag/);
  assert.match(styles, /-webkit-app-region: no-drag/);
});

test("the renderer is sandboxed behind a narrow validated preload bridge", () => {
  assert.match(main, /protocol\.registerSchemesAsPrivileged/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /webSecurity: true/);
  assert.match(main, /assertTrustedSender/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("bakbakDesktop"/);
  assert.doesNotMatch(preload, /exposeInMainWorld\([^]*ipcRenderer\s*[,}]/);
});

test("permission requests stay on trusted frames with one fullscreen embed exception", () => {
  assert.match(main, /details\.isMainFrame/);
  assert.match(main, /isTrustedRendererUrl\(details\.requestingUrl\)/);
  assert.match(main, /isTrustedYouTubeEmbedUrl\(details\.requestingUrl\)/);
  assert.match(main, /permission === "fullscreen"/);
  assert.match(main, /hostname === "www\.youtube-nocookie\.com"/);
  assert.match(main, /pathname\.startsWith\("\/embed\/"\)/);
  assert.match(screenShareService, /"permission-denied"/);
  assert.match(screenShareService, /"policy-blocked"/);
  assert.match(screenShareService, /"unknown"/);
  assert.doesNotMatch(screenShareService, /"enumeration-failed"/);
});
