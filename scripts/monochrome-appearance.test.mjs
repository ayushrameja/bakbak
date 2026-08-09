import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [
  styles,
  main,
  app,
  settings,
  themeEditor,
  gradientPicker,
  sidebar,
  packageJson,
] =
  await Promise.all([
  readFile(new URL("src/styles.css", root), "utf8"),
  readFile(new URL("src/main.tsx", root), "utf8"),
  readFile(new URL("src/app/App.tsx", root), "utf8"),
  readFile(new URL("src/features/settings/SettingsPage.tsx", root), "utf8"),
    readFile(
      new URL("src/features/settings/SidebarThemeEditor.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("src/features/settings/SidebarGradientPicker.tsx", root),
      "utf8",
    ),
  readFile(new URL("src/features/channels/ChannelSidebar.tsx", root), "utf8"),
  readFile(new URL("package.json", root), "utf8"),
  ]);

test("Bakbak and Personal own distinct signed-in palettes", () => {
  assert.match(
    styles,
    /\.app-frame\[data-space="server"\][\s\S]*?--space-accent:\s*#f4bd59/,
  );
  assert.match(styles, /#414936[\s\S]*?#24504d[\s\S]*?#0d1727/);
  assert.match(
    styles,
    /\.app-frame\[data-space="personal"\][\s\S]*?--space-accent:\s*#b99cff/,
  );
  assert.match(styles, /#512f43[\s\S]*?#44385e[\s\S]*?#2a506f[\s\S]*?#0d1727/);
  assert.match(styles, /background 240ms ease/);
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*none !important/,
  );
  assert.match(
    app,
    /data-space=\{showSpaceSwitcher \? activeSpace : undefined\}/,
  );
});

test("Inter Variable is bundled and the rem typography ramp stays explicit", () => {
  assert.match(main, /import "@fontsource-variable\/inter"/);
  assert.match(packageJson, /"@fontsource-variable\/inter"/);
  assert.match(
    styles,
    /font-family:\s*"Inter Variable", Inter, "Avenir Next", "Segoe UI", sans-serif/,
  );
  assert.doesNotMatch(styles, /font-family:\s*"Roundo"/);
  assert.match(styles, /--font-caption:\s*0\.6875rem/);
  assert.match(styles, /--font-meta:\s*0\.75rem/);
  assert.match(styles, /--font-ui:\s*0\.875rem/);
  assert.match(styles, /--font-chat:\s*1rem/);
  assert.match(styles, /--radius-control:\s*9px/);
  assert.match(styles, /--radius-card:\s*14px/);
  assert.match(styles, /--radius-panel:\s*16px/);
  assert.match(styles, /--radius-dialog:\s*20px/);
});

test("the unified sidebar exposes one flat shelf and the member overlay", () => {
  assert.match(sidebar, /<SpaceSwitcher/);
  assert.match(sidebar, /aria-labelledby="activity-preview-title"/);
  assert.match(sidebar, /selectActivityPreview/);
  assert.match(sidebar, /Show all/);
  assert.match(sidebar, /aria-label="Channels"/);
  assert.match(sidebar, /<MembersOverlay/);
  assert.doesNotMatch(app, /DirectPersonPanel|panel-slot--right/);
});

test("appearance keeps scheme selection and customizes both space themes", () => {
  assert.match(styles, /data-color-scheme="dark"/);
  assert.match(styles, /data-color-scheme="light"/);
  assert.match(settings, /value:\s*"auto"/);
  assert.match(settings, /value:\s*"dark"/);
  assert.match(settings, /value:\s*"light"/);
  assert.match(settings, /<SidebarThemeEditor/);
  assert.match(themeEditor, /server:\s*"Bakbak"/);
  assert.match(themeEditor, /personal:\s*"Personal"/);
  assert.match(themeEditor, /<SidebarGradientPicker/);
  assert.match(gradientPicker, /type="color"/);
  assert.match(gradientPicker, /Color presets/);
  assert.match(gradientPicker, /onPointerMove/);
  assert.match(themeEditor, /type="range"/);
  assert.match(themeEditor, /Dots/);
  assert.match(themeEditor, /Grain/);
  assert.doesNotMatch(settings, />System accent/);
});

test("conversation surfaces stay solid in light and dark mode", () => {
  assert.match(styles, /--conversation-canvas:\s*#171717/);
  assert.match(styles, /--conversation-canvas:\s*#fbfbf8/);
  assert.match(
    styles,
    /\.content-shell\s*{[\s\S]*?background:\s*var\(--conversation-canvas\)[\s\S]*?backdrop-filter:\s*none/,
  );
});
