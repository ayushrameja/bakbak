import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
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
  assert.match(
    styles,
    /\.screen-share-stage__controls,\s*\.voice-participant-stage__controls\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*14px;/s,
  );
});

test("fullscreen uses a fixed viewport overlay with a pinned bottom exit control", () => {
  assert.match(
    styles,
    /\.voice-focus-layout\.is-fullscreen\s*\{[^}]*position:\s*fixed;[^}]*height:\s*100dvh;/s,
  );
  assert.match(
    styles,
    /\.voice-focus-layout\.is-fullscreen\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\);[^}]*padding:\s*0;/s,
  );
  assert.match(
    styles,
    /\.voice-focus-layout\.is-fullscreen \.screen-share-stage__fullscreen-exit,\s*\.voice-focus-layout\.is-fullscreen \.voice-fullscreen-exit\s*\{[^}]*position:\s*fixed;[^}]*top:\s*auto;[^}]*bottom:\s*16px;/s,
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
