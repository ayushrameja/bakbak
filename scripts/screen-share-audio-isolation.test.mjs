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

test("Electron grants only the freshly selected video source", () => {
  assert.match(main, /setDisplayMediaRequestHandler/);
  assert.match(main, /preparedCapture = null/);
  assert.match(main, /capture\.expiresAt < Date\.now\(\)/);
  assert.match(main, /candidate\.id === capture\.sourceId/);
  assert.match(main, /request\.userGesture/);
  assert.match(main, /callback\(\{ video: source \}\)/);
  assert.doesNotMatch(main, /audio:\s*["']loopback["']/);
});

test("Electron and the renderer fail closed when system audio is requested", () => {
  assert.match(main, /systemAudioAvailable: false/);
  assert.match(main, /const audioAvailable = false/);
  assert.match(
    main,
    /typeof input\.includeAudio !== "boolean" \|\|\s*input\.includeAudio/,
  );
  assert.match(service, /systemAudio: false/);
  assert.match(service, /audioAvailable: false/);
  assert.match(service, /systemAudioAvailable: false/);
  assert.match(
    voiceRoom,
    /includeAudio:\s*includeAudio\s*&&\s*screenShareCapabilities\.systemAudio/,
  );
  assert.doesNotMatch(main, /short-lived-token|serverUrl|token:/);
});
