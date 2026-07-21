import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("macOS and Windows titlebar configs retain the shared main-window contract", async () => {
  const [base, macos, windows] = await Promise.all([
    readJson("src-tauri/tauri.conf.json"),
    readJson("src-tauri/tauri.macos.conf.json"),
    readJson("src-tauri/tauri.windows.conf.json"),
  ]);
  const fields = [
    "label",
    "title",
    "width",
    "height",
    "minWidth",
    "minHeight",
    "center",
    "resizable",
    "zoomHotkeysEnabled",
  ];
  const baseWindow = base.app.windows[0];
  for (const platformWindow of [macos.app.windows[0], windows.app.windows[0]]) {
    for (const field of fields) {
      assert.deepEqual(platformWindow[field], baseWindow[field], field);
    }
  }

  assert.equal(macos.app.windows[0].decorations, true);
  assert.equal(macos.app.windows[0].titleBarStyle, "Overlay");
  assert.equal(macos.app.windows[0].hiddenTitle, true);
  assert.deepEqual(macos.app.windows[0].trafficLightPosition, { x: 16, y: 16 });
  assert.equal(windows.app.windows[0].decorations, false);
  assert.equal(windows.app.windows[0].shadow, true);
});

test("main-window capabilities stay narrowly scoped to required chrome actions", async () => {
  const capability = await readJson("src-tauri/capabilities/default.json");
  for (const permission of [
    "core:window:allow-is-maximized",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-close",
    "core:window:allow-start-dragging",
  ]) {
    assert.ok(capability.permissions.includes(permission), permission);
  }
  assert.deepEqual(capability.windows, ["main"]);
});
