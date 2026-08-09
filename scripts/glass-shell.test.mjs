import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [
  styles,
  app,
  titlebar,
  panelResizer,
  chat,
  scrollbarHook,
  sidebarUserDock,
  voiceRoom,
  html,
  main,
  electronMain,
] = await Promise.all([
  readFile(new URL("src/styles.css", root), "utf8"),
  readFile(new URL("src/app/App.tsx", root), "utf8"),
  readFile(new URL("src/components/WindowTitlebar.tsx", root), "utf8"),
  readFile(new URL("src/components/PanelResizer.tsx", root), "utf8"),
  readFile(new URL("src/features/chat/ChatView.tsx", root), "utf8"),
  readFile(new URL("src/lib/use-auto-hide-scrollbars.ts", root), "utf8"),
  readFile(new URL("src/features/voice/SidebarUserDock.tsx", root), "utf8"),
  readFile(new URL("src/features/voice/VoiceRoom.tsx", root), "utf8"),
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("src/main.tsx", root), "utf8"),
  readFile(new URL("electron/main.ts", root), "utf8"),
]);

test("glass tokens and native-safe document underlays stay system adaptive", () => {
  assert.match(styles, /--glass-canvas-neutral:\s*rgba\(0, 0, 0, 0\.64\)/);
  assert.match(styles, /--glass-panel-neutral:\s*rgba\(0, 0, 0, 0\.72\)/);
  assert.match(styles, /--glass-strong-neutral:\s*rgba\(0, 0, 0, 0\.84\)/);
  assert.match(styles, /--glass-canvas-neutral:\s*rgba\(255, 255, 255, 0\.6\)/);
  assert.match(styles, /--glass-panel-neutral:\s*rgba\(255, 255, 255, 0\.72\)/);
  assert.match(
    styles,
    /--glass-strong-neutral:\s*rgba\(255, 255, 255, 0\.84\)/,
  );
  assert.match(
    styles,
    /--glass-canvas:\s*color-mix\([\s\S]*?var\(--system-accent\) 6%/,
  );
  assert.match(
    styles,
    /--glass-panel:\s*color-mix\([\s\S]*?var\(--system-accent\) 5%/,
  );
  assert.match(styles, /blur\(24px\) saturate\(120%\)/);
  assert.match(
    styles,
    /html\[data-window-material="native"\][\s\S]*?background:\s*transparent/,
  );
  assert.match(main, /dataset\.windowMaterial = isDesktopRuntime\(\)/);
  assert.match(electronMain, /backgroundColor:\s*"#00000000"/);
  assert.match(electronMain, /transparent:\s*true/);
  assert.match(electronMain, /vibrancy:\s*"under-window"/);
  assert.match(electronMain, /setBackgroundMaterial\("mica"\)/);
  assert.match(html, /name="theme-color"[\s\S]*?content="#000000"/);
  assert.match(html, /name="theme-color"[\s\S]*?content="#f4f4f4"/);
});

test("signed-in shell uses one resizable sidebar and one rounded canvas", () => {
  assert.match(
    styles,
    /grid-template-columns:\s*var\(--left-panel-track\) var\(--left-divider-track\)\s*minmax\(420px, 1fr\)/,
  );
  assert.match(styles, /--left-divider-track:\s*1px/);
  assert.match(styles, /--context-panel-width, 280px/);
  assert.match(
    styles,
    /\.content-shell\s*{[\s\S]*?border-radius:\s*var\(--radius-panel\)/,
  );
  assert.match(styles, /--conversation-canvas:\s*#171717/);
  assert.match(styles, /--conversation-canvas:\s*#fbfbf8/);
  assert.match(styles, /transition:\s*grid-template-columns 220ms/);
  assert.match(
    styles,
    /html\.is-panel-resizing \.desktop-shell\s*{[\s\S]*?transition:\s*none !important/,
  );
  assert.match(
    styles,
    /html\.is-panel-resizing \*\s*{[\s\S]*?user-select:\s*none !important/,
  );
  assert.match(
    panelResizer,
    /documentElement\.classList\.add\("is-panel-resizing"\)/,
  );
  assert.match(styles, /\.panel-resizer\s*{[\s\S]*?width:\s*9px/);
  assert.match(app, /className="panel-slot panel-slot--left"/);
  assert.doesNotMatch(app, /panel-slot--right/);
  assert.doesNotMatch(app, /rightPanelVisible|rightPanelWidth/);
  assert.match(app, /enabled=\{layoutPreferences\.leftPanelVisible\}/);
});

test("titlebar, directional space motion, startup assembly, and scroll activity retain their timing contracts", () => {
  assert.doesNotMatch(titlebar, /<SpaceSwitcher/);
  assert.match(
    app,
    /data-space=\{showSpaceSwitcher \? activeSpace : undefined\}/,
  );
  assert.doesNotMatch(titlebar, /OG Nahan Gang|Professional yappers/);
  assert.match(
    titlebar,
    /<div className="window-titlebar__center window-titlebar__drag" \/>/,
  );
  assert.match(
    titlebar,
    /window-titlebar__leading[\s\S]*?titlebar-panel-controls/,
  );
  assert.doesNotMatch(titlebar, /TITLEBAR_MESSAGE_ROTATION_MS/);
  assert.match(
    app,
    /data-space-direction=\{spaceTransitionDirection \?\? undefined\}/,
  );
  assert.match(styles, /@keyframes space-enter-personal/);
  assert.match(styles, /@keyframes space-enter-bakbak/);
  assert.match(
    styles,
    /data-space-direction="left"[\s\S]*?> :not\(\.space-switcher\)[\s\S]*?space-enter-personal 345ms/,
  );
  assert.match(
    styles,
    /data-space-direction="right"[\s\S]*?> :not\(\.space-switcher\)[\s\S]*?space-enter-bakbak 345ms/,
  );
  assert.doesNotMatch(
    styles,
    /data-space-direction="(?:left|right)"[^{}]*\.(?:top-bar|content-stage--space-motion)/,
  );
  assert.doesNotMatch(
    titlebar,
    /handleDrag|handleDoubleClick|isTitlebarControl/,
  );
  assert.match(
    styles,
    /\.window-titlebar\s*\{[\s\S]*?-webkit-app-region:\s*drag/,
  );
  assert.match(
    styles,
    /\.window-titlebar button,[\s\S]*?-webkit-app-region:\s*no-drag/,
  );
  assert.match(
    styles,
    /\.member-panel__person \+ \.member-panel__person\s*{[\s\S]*?margin-top:\s*5px/,
  );
  assert.doesNotMatch(sidebarUserDock, /SidebarUserCover|user-dock__cover/);
  assert.match(
    styles,
    /\.app-frame\[data-space\] \.user-dock\s*{[\s\S]*?min-height:\s*56px/,
  );
  assert.match(styles, /\.unified-sidebar > \.space-switcher/);
  assert.match(styles, /background 240ms ease/);
  assert.match(styles, /glass-assemble 200ms 30ms/);
  assert.match(styles, /glass-assemble 220ms 70ms/);
  assert.match(styles, /glass-assemble 200ms 110ms/);
  assert.match(styles, /glass-assemble 160ms 160ms/);
  assert.match(styles, /calc\(160ms \+ var\(--startup-order, 0\) \* 24ms\)/);
  assert.match(styles, /glass-assemble 180ms 280ms/);
  assert.match(chat, /Math\.min\(index, 7\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    styles,
    /\.app-frame \*::-webkit-scrollbar\s*{[\s\S]*?width:\s*6px/,
  );
  assert.match(scrollbarHook, /SCROLLBAR_IDLE_DELAY_MS = 650/);
  assert.match(scrollbarHook, /classList\.add\("is-scrolling"\)/);
});

test("conversation and identity footers share one vertical rhythm", () => {
  assert.match(styles, /--conversation-footer-height:\s*68px/);
  assert.match(
    styles,
    /\.composer-wrap\s*{[\s\S]*?min-height:\s*var\(--conversation-footer-height\);[\s\S]*?padding:\s*var\(--space-2\) var\(--space-6\)/,
  );
  assert.match(
    styles,
    /\.user-dock\s*{[\s\S]*?min-height:\s*var\(--conversation-footer-height\)/,
  );
});

test("activity and circular voice follow-up keeps its visual interaction contracts", () => {
  assert.match(
    styles,
    /\.activity-preview__person\s*{[\s\S]*?min-height:\s*46px[\s\S]*?gap:\s*10px/,
  );
  assert.match(
    styles,
    /activity-preview__person\[data-status="online"\][\s\S]*?font-weight:\s*700/,
  );
  assert.match(styles, /--voice-orb-size:\s*clamp\(148px, 22vmin, 214px\)/);
  assert.match(
    styles,
    /\.voice-participant-orb__ring--live\s*{[\s\S]*?box-shadow:\s*none/,
  );
  assert.doesNotMatch(styles, /@keyframes voice-live-ring/);
  assert.match(
    styles,
    /\.voice-participant-orb__details\s*\{[\s\S]*?bottom:\s*calc\(100% \+ 18px\)/,
  );
  assert.doesNotMatch(voiceRoom, /Expand details|voice-participant-stage/);
  assert.match(
    styles,
    /\.voice-participant-orb__action::after\s*{[\s\S]*?content:\s*attr\(data-tooltip\)/,
  );
});
