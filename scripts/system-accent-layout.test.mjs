import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [styles, main, settings] = await Promise.all([
  readFile(new URL("src/styles.css", root), "utf8"),
  readFile(new URL("src/main.tsx", root), "utf8"),
  readFile(new URL("src/features/settings/SettingsPage.tsx", root), "utf8"),
]);

test("signed-in accents come from the active Bakbak or Personal space", () => {
  assert.match(styles, /\.app-frame\[data-space="server"\]/);
  assert.match(styles, /\.app-frame\[data-space="personal"\]/);
  assert.match(
    styles,
    /\.app-frame\[data-space\]\s*{[\s\S]*?--system-accent:\s*var\(--space-accent\)/,
  );
  assert.doesNotMatch(main, /initializeSystemAccent|system-accent/);
});

test("Appearance previews both palettes without an accent preference", () => {
  assert.match(settings, />Bakbak palette</);
  assert.match(settings, />Personal palette</);
  assert.match(settings, /appearance-palette-card--bakbak/);
  assert.match(settings, /appearance-palette-card--personal/);
  assert.doesNotMatch(
    settings,
    />System accent|name="system-accent"|type="color"/,
  );
});
