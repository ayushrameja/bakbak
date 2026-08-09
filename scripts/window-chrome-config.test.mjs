import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const packageMetadata = JSON.parse(
  await readFile(new URL("package.json", root), "utf8"),
);
const main = await readFile(new URL("electron/main.ts", root), "utf8");
const preload = await readFile(new URL("electron/preload.cts", root), "utf8");
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
  assert.match(main, /\{ role: "viewMenu" \}/);
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
