import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(
  new URL("../electron/main.ts", import.meta.url),
  "utf8",
);
const service = await readFile(
  new URL("../src/features/voice/screen-share-service.ts", import.meta.url),
  "utf8",
);
const voiceRoom = await readFile(
  new URL("../src/features/voice/useVoiceRoom.ts", import.meta.url),
  "utf8",
);
const helper = await readFile(
  new URL("../electron/screen-share-helper.ts", import.meta.url),
  "utf8",
);
const preload = await readFile(
  new URL("../electron/preload.cts", import.meta.url),
  "utf8",
);

test("Electron keeps video available without opening a Chromium audio route", () => {
  assert.match(main, /ScreenShareHelperManager/);
  assert.match(main, /desktopCapturer/);
  assert.match(main, /setDisplayMediaRequestHandler/);
  assert.match(main, /captureBackend: "electron-video"/);
  assert.match(main, /screen-share:capabilities/);
  assert.match(main, /screen-share:select-video-source/);
  assert.match(main, /screen-share:start/);
  assert.match(main, /screen-share:update/);
  assert.match(main, /screen-share:stop/);
  assert.match(main, /screenShareHelper\?\.stopActive\(\)/);
  assert.doesNotMatch(main, /audio: "loopback"/);
  assert.doesNotMatch(main, /loopbackWithMute/);
  assert.doesNotMatch(main, /display-capture/);
});

test("renderer delegates native publication and exposes only narrow helper methods", () => {
  assert.match(service, /bridge\.screenShare\.start/);
  assert.match(service, /bridge\.screenShare\.update/);
  assert.match(service, /bridge\.screenShare\.stop/);
  assert.doesNotMatch(service, /createLocalScreenTracks|publishTrack|new Room/);
  assert.match(preload, /capabilities:/);
  assert.match(preload, /listSources:/);
  assert.match(preload, /selectVideoSource:/);
  assert.match(preload, /start:/);
  assert.match(preload, /update:/);
  assert.match(preload, /stop:/);
  assert.match(preload, /onLifecycle:/);
  assert.doesNotMatch(preload, /ipcRenderer\.invoke\([^)]*loopback/);
  assert.match(
    voiceRoom,
    /includeAudio:\s*includeAudio\s*&&\s*screenShareCapabilities\.systemAudio/,
  );
});

test("helper protocol is correlated, bounded, isolated, and never logs raw stderr", () => {
  assert.match(helper, /SCREEN_SHARE_PROTOCOL_VERSION = 1/);
  assert.match(helper, /SCREEN_SHARE_MAX_LINE_BYTES = 32 \* 1024 \* 1024/);
  assert.match(helper, /SCREEN_SHARE_MAX_SOURCES = 256/);
  assert.match(helper, /SCREEN_SHARE_MAX_TOKEN_BYTES = 16 \* 1024/);
  assert.match(helper, /Unknown helper request correlation/);
  assert.match(helper, /child\.stderr\.on\("data", \(\) => undefined\)/);
  assert.match(helper, /exclude-bakbak-process-tree/);
  assert.doesNotMatch(helper, /console\.(?:log|info|error).*stderr/);
});
