import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const screenShareStage = await readFile(
  new URL("../src/features/voice/ScreenShareStage.tsx", import.meta.url),
  "utf8",
);
const voiceRoom = await readFile(
  new URL("../src/features/voice/VoiceRoom.tsx", import.meta.url),
  "utf8",
);

test("focused media stays bounded and preserves the shared bottom edge", () => {
  assert.match(
    styles,
    /\.voice-focus-layout\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\);[^}]*gap:\s*0;/s,
  );
  assert.match(
    styles,
    /\.voice-room-view\.is-connected \.voice-focus-layout \.screen-share-stage__media\s*\{[^}]*height:\s*100%;/s,
  );
  assert.match(
    styles,
    /\.voice-focus-layout \.screen-share-stage__media \.participant-video\s*\{[^}]*object-fit:\s*contain;/s,
  );
  assert.match(screenShareStage, /onActivateMedia/);
});

test("focused shares use media activation without back or fullscreen chrome", () => {
  assert.doesNotMatch(screenShareStage, /Back to people|onBack|fullscreen/i);
  assert.doesNotMatch(
    voiceRoom,
    /voice-fullscreen|requestFullscreen|isFullscreen/,
  );
  assert.match(
    screenShareStage,
    /aria-label="Return focused screen share to people"/,
  );
});

test("voice shelf uses one compact room timer row and a speaking avatar ring", () => {
  assert.match(
    styles,
    /\.channel-voice-people\s*\{[^}]*margin:\s*3px 0 8px 22px;/s,
  );
  assert.match(
    styles,
    /\.channel-voice-person__avatar \.avatar--small\s*\{[^}]*width:\s*26px;[^}]*height:\s*26px;/s,
  );
  assert.match(
    styles,
    /\.channel-voice-person__profile > b\s*\{[^}]*font-size:\s*14px;/s,
  );
  assert.match(
    styles,
    /\.channel-voice-person__avatar\.is-speaking\s*\{[^}]*box-shadow:/s,
  );
});
