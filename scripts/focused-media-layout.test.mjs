import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("focused media stays bounded and preserves the shared bottom edge", () => {
  assert.match(styles, /grid-template-rows:\s*auto minmax\(0, 1fr\);/);
  assert.match(
    styles,
    /\.voice-room-view\.is-connected \.voice-focus-layout \.screen-share-stage__media\s*\{[^}]*height:\s*auto;/s,
  );
  assert.match(
    styles,
    /\.voice-focus-layout \.screen-share-stage__media \.participant-video\s*\{[^}]*object-fit:\s*contain;/s,
  );
});

test("fullscreen uses a fixed viewport overlay with a pinned exit control", () => {
  assert.match(
    styles,
    /\.voice-focus-layout\.is-fullscreen\s*\{[^}]*position:\s*fixed;[^}]*height:\s*100dvh;[^}]*grid-template-rows:\s*minmax\(0, 1fr\) 72px;/s,
  );
  assert.match(
    styles,
    /\.voice-focus-layout\.is-fullscreen \.screen-share-stage__fullscreen-exit,\s*\.voice-focus-layout\.is-fullscreen \.voice-fullscreen-exit\s*\{[^}]*position:\s*fixed;/s,
  );
});
