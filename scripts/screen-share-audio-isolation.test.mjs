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

test("Electron grants only the freshly selected capture source", () => {
  assert.match(main, /setDisplayMediaRequestHandler/);
  assert.match(main, /preparedCapture = null/);
  assert.match(main, /capture\.expiresAt < Date\.now\(\)/);
  assert.match(main, /candidate\.id === capture\.sourceId/);
  assert.match(main, /request\.userGesture/);
  assert.match(main, /audio: "loopback"/);
});

test("screen audio requests Chromium own-audio restriction and stays bounded", () => {
  assert.match(service, /restrictOwnAudio: true/);
  assert.match(service, /source: Track\.Source\.ScreenShareAudio/);
  assert.match(service, /maxBitrate: 128_000/);
  assert.match(service, /dtx: false/);
  assert.match(
    voiceRoom,
    /includeAudio:\s*includeAudio\s*&&\s*screenShareCapabilities\.systemAudio/,
  );
  assert.doesNotMatch(main, /short-lived-token|serverUrl|token:/);
});
