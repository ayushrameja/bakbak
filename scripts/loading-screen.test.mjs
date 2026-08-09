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

test("successful startup uses the same rail and canvas geometry as the app", () => {
  assert.match(loadingScreen, /role="status"/);
  assert.match(loadingScreen, /app-loading__sidebar/);
  assert.match(loadingScreen, /app-loading__canvas/);
  assert.match(loadingScreen, /Opening Bakbak/);
  assert.equal((app.match(/<LoadingScreen \/>/g) ?? []).length, 2);
  assert.match(app, /data-surface=\{surface\}/);
  assert.match(app, /<LoadingScreen \/>, false, "entry"/);
  assert.match(app, /The door is stuck/);
  assert.match(app, /Back to sign in/);
});

test("loading motion stays bounded and resolves immediately for reduced motion", () => {
  assert.match(
    styles,
    /\.app-loading--animated\s*\{[\s\S]*grid-template-columns:\s*280px minmax\(420px, 1fr\)/,
  );
  assert.match(
    styles,
    /\.app-loading__track i\s*\{[\s\S]*entry-loading-track 1\.2s/,
  );
  assert.match(styles, /:root\[data-color-scheme="dark"\]/);
  assert.match(styles, /:root\[data-color-scheme="light"\]/);
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.app-loading__track i\s*\{[\s\S]*animation:\s*none/,
  );
});
