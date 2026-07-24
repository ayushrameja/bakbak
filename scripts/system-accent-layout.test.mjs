import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [styles, accentService, nativeAccent, cargo, settings] =
  await Promise.all([
    readFile(new URL("src/styles.css", root), "utf8"),
    readFile(new URL("src/features/settings/system-accent.ts", root), "utf8"),
    readFile(new URL("src-tauri/src/system_accent.rs", root), "utf8"),
    readFile(new URL("src-tauri/Cargo.toml", root), "utf8"),
    readFile(new URL("src/features/settings/SettingsPage.tsx", root), "utf8"),
  ]);

test("native bridges query and observe the supported operating-system accents", () => {
  assert.match(nativeAccent, /NSColor::controlAccentColor\(\)/);
  assert.match(nativeAccent, /NSColorSpace::sRGBColorSpace\(\)/);
  assert.match(nativeAccent, /NSSystemColorsDidChangeNotification/);
  assert.match(nativeAccent, /UISettings::new\(\)/);
  assert.match(nativeAccent, /GetColorValue\(UIColorType::Accent\)/);
  assert.match(nativeAccent, /\.ColorValuesChanged\(&handler\)/);
  assert.match(nativeAccent, /system-accent-changed/);
  assert.match(cargo, /"UI_ViewManagement"/);
});

test("renderer validates native RGB, waits at most 250ms, and publishes the accent family", () => {
  assert.match(accentService, /Number\.isInteger\(value\)/);
  assert.match(accentService, /Number\(value\) >= 0/);
  assert.match(accentService, /Number\(value\) <= 255/);
  assert.match(accentService, /fallbackDeadline = 250/);
  assert.match(
    accentService,
    /Promise\.race\(\[started, wait\(fallbackDeadline\)\]\)/,
  );
  for (const token of [
    "--system-accent",
    "--system-accent-on",
    "--system-accent-soft",
    "--system-accent-hover",
    "--system-accent-surface",
    "--system-accent-border",
  ]) {
    assert.match(accentService, new RegExp(token));
  }
  assert.match(accentService, /TEXT_CONTRAST_TARGET = 4\.5/);
  assert.match(accentService, /runtime\.window\.addEventListener\("focus"/);
  assert.match(accentService, /media\?\.addEventListener\("change"/);
});

test("dynamic accent reaches navigation, trails, controls, and calm glass surfaces", () => {
  assert.match(styles, /--accent:\s*var\(--system-accent\)/);
  assert.match(styles, /--semantic-selected:\s*var\(--system-accent\)/);
  assert.match(
    styles,
    /\.personal-conversation\.is-active\s*\{[\s\S]*?background:\s*var\(--semantic-selected-soft\)/,
  );
  assert.match(
    styles,
    /\.channel-row\.active\s*\{[\s\S]*?background:\s*var\(--accent-soft\)/,
  );
  assert.match(
    styles,
    /\.conversation-thread::before\s*\{[\s\S]*?var\(--semantic-selected\)/,
  );
  assert.match(
    styles,
    /\.composer button:hover:not\(:disabled\),[\s\S]*?color:\s*var\(--system-accent\)/,
  );
  assert.match(
    styles,
    /\.voice-control-dock > button\.is-active,[\s\S]*?color:\s*var\(--semantic-selected\)/,
  );
  assert.match(
    styles,
    /--brand-aurora-primary:\s*color-mix\([\s\S]*?var\(--system-accent\)/,
  );
  assert.doesNotMatch(styles, /#5865f2|#3d49b8|197,\s*247,\s*109/i);
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.channel-row,[\s\S]*?transition:\s*none/,
  );
});

test("Appearance reports the accent without exposing an accent preference", () => {
  assert.match(settings, />System accent</);
  assert.match(settings, /systemAccent\.source === "macos"/);
  assert.match(settings, /systemAccent\.source === "windows"/);
  assert.doesNotMatch(settings, /name="system-accent"|type="color"/);
});
