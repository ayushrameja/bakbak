import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [app, loadingScreen, styles] = await Promise.all([
  readFile(new URL("../src/app/App.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../src/components/LoadingScreen.tsx", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
]);

test("successful startup uses only the shared six-letter Bakbak scene", () => {
  assert.match(loadingScreen, /\[\.\.\."BAKBAK"\]/);
  assert.match(loadingScreen, /role="status"/);
  assert.equal((app.match(/<LoadingScreen \/>/g) ?? []).length, 2);
  assert.doesNotMatch(app, /Opening Bakbak|Setting the room up/);
  assert.match(app, /The door is stuck/);
  assert.match(app, /Back to sign in/);
});

test("loading motion uses adaptive tokens and resolves immediately for reduced motion", () => {
  assert.match(
    styles,
    /\.app-loading--animated::before,[\s\S]*var\(--system-accent\)[\s\S]*var\(--glass-panel\)/,
  );
  assert.match(
    styles,
    /\.app-loading__word > span\s*\{[\s\S]*bakbak-loading-letter[\s\S]*var\(--letter-index/,
  );
  assert.match(styles, /:root\[data-color-scheme="dark"\]/);
  assert.match(styles, /:root\[data-color-scheme="light"\]/);
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.app-loading__word > span\s*\{[\s\S]*opacity: 1;[\s\S]*animation: none;/,
  );
});
