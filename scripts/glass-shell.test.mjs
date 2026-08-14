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

test("glass tokens and material-specific underlays stay system adaptive", () => {
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
    /html\[data-window-material="vibrancy"\][\s\S]*?html\[data-window-material="mica"\][\s\S]*?background:\s*transparent/,
  );
  assert.match(main, /getAppearance\(\)/);
  assert.match(main, /applyWindowAppearance/);
  assert.match(main, /setChromeScheme\(resolvedChromeScheme\(\)\)/);
  assert.match(electronMain, /backgroundColor:\s*"#00000000"/);
  assert.match(electronMain, /transparent:\s*true/);
  assert.match(electronMain, /vibrancy:\s*"under-window"/);
  assert.match(electronMain, /WINDOWS_MICA_MIN_BUILD = 22_621/);
  assert.match(electronMain, /setBackgroundMaterial\("mica"\)/);
  assert.match(electronMain, /titleBarStyle:\s*"hidden"/);
  assert.match(electronMain, /titleBarOverlay:/);
  assert.match(electronMain, /setTitleBarOverlay/);
  assert.match(html, /data-window-material="fallback"/);
  assert.match(html, /name="theme-color"[\s\S]*?content="#000000"/);
  assert.match(html, /name="theme-color"[\s\S]*?content="#f4f4f4"/);
});

test("Glass keeps dormant customization inert and follows Auto or explicit scheme tokens", () => {
  assert.match(
    app,
    /showSpaceSwitcher && theme\.mode !== "glass"[\s\S]*?theme\.texture/,
  );
  assert.match(
    app,
    /\.\.\.sidebarThemeStyle\(theme\),[\s\S]*?"--context-panel-width"/,
  );
  assert.match(
    styles,
    /\.app-frame\[data-space\]:not\(\s*\[data-chrome-theme="glass"\]\s*\)\[data-theme-texture="dots"\]/,
  );
  assert.match(
    styles,
    /\.app-frame\[data-space\]:not\(\s*\[data-chrome-theme="glass"\]\s*\)\[data-theme-texture="grain"\]/,
  );

  const contrastStart = styles.indexOf(
    "/* The old gradient sidebar intentionally uses white copy",
  );
  const contrastEnd = styles.indexOf(
    "@media (prefers-reduced-motion: reduce)",
    contrastStart,
  );
  assert.notEqual(contrastStart, -1);
  assert.notEqual(contrastEnd, -1);
  const glassContrast = styles.slice(contrastStart, contrastEnd);
  assert.doesNotMatch(glassContrast, /:root\[data-color-scheme="light"\]/);
  assert.match(
    glassContrast,
    /data-chrome-theme="glass"\][\s\S]*?\.channel-sidebar,[\s\S]*?color:\s*var\(--text\)/,
  );
  assert.match(glassContrast, /\.activity-preview > header/);
  assert.match(glassContrast, /\.activity-preview__person/);
  assert.match(glassContrast, /\.channel-voice-duration/);
  assert.match(glassContrast, /\.sidebar-voice-panel__status span/);
  assert.match(glassContrast, /\.user-dock__identity \.user-dock__status/);
  assert.match(glassContrast, /color:\s*var\(--muted\)/);
  assert.match(glassContrast, /color:\s*var\(--text\)/);
});

test("fallback and accessibility modes make every major Glass surface opaque", () => {
  const fallbackStart = styles.indexOf(
    "@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)",
  );
  const fallbackEnd = styles.indexOf(
    ".settings-permission-recovery",
    fallbackStart,
  );
  assert.notEqual(fallbackStart, -1);
  assert.notEqual(fallbackEnd, -1);
  const fallback = styles.slice(fallbackStart, fallbackEnd);
  for (const surface of [
    ".titlebar-panel-controls",
    ".composer",
    ".voice-control-dock",
    ".soundboard-drawer",
    ".sidebar-voice-panel",
    ".user-dock",
    ".modal-card",
    ".settings-page",
    ".sidebar-theme-editor__glass-preview",
  ]) {
    assert.match(fallback, new RegExp(surface.replaceAll(".", "\\.")));
  }
  assert.match(fallback, /data-window-material="fallback"/);
  assert.match(fallback, /data-reduced-transparency="true"/);
  assert.match(
    fallback,
    /background:\s*var\(--conversation-raised, var\(--panel\)\)/,
  );
  assert.match(fallback, /-webkit-backdrop-filter:\s*none/);
  assert.match(fallback, /backdrop-filter:\s*none/);
  assert.match(fallback, /background:\s*Canvas !important/);
  assert.match(
    fallback,
    /html:is\(\[data-window-material="fallback"\], \[data-reduced-transparency="true"\]\)\s*\.modal-card\s*\{/,
  );

  assert.match(
    styles,
    /\.content-shell\s*{[\s\S]*?background:\s*var\(--conversation-canvas\);[\s\S]*?backdrop-filter:\s*none/,
  );
  assert.match(
    styles,
    /\.participant-video,[\s\S]*?\.screen-share-stage__media,[\s\S]*?\.voice-participant-orb__media,[\s\S]*?filter:\s*none !important/,
  );
});

test("signed-in shell uses a transparent sidebar and draggable canvas header", () => {
  assert.match(
    styles,
    /grid-template-columns:\s*var\(--left-panel-track\) var\(--left-divider-track\)\s*minmax\(420px, 1fr\)/,
  );
  assert.match(styles, /--left-divider-track:\s*1px/);
  assert.match(styles, /--context-panel-width, 280px/);
  const arcShellStart = styles.indexOf("/* 0036 — Arc-style full-bleed shell.");
  assert.notEqual(arcShellStart, -1);
  const arcShell = styles.slice(arcShellStart);
  assert.match(
    arcShell,
    /\.app-frame\[data-space\] \.desktop-shell,[\s\S]*?padding:\s*0;/,
  );
  assert.match(
    arcShell,
    /\.app-frame\[data-space\] \.content-shell\s*{[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*0;[\s\S]*?box-shadow:\s*none;/,
  );
  assert.match(
    arcShell,
    /\.app-frame\[data-space\] \.panel-slot--left\s*{[\s\S]*?background:\s*transparent;[\s\S]*?backdrop-filter:\s*none/,
  );
  assert.match(
    arcShell,
    /\.app-frame\[data-space\] \.content-shell\s*{[\s\S]*?grid-template-rows:\s*30px minmax\(0, 1fr\)/,
  );
  assert.match(app, /className="content-drag-bar" aria-hidden="true"/);
  assert.match(
    arcShell,
    /\.content-drag-bar\s*{[\s\S]*?-webkit-app-region:\s*drag/,
  );
  assert.match(
    arcShell,
    /\.window-titlebar\[data-shell="true"\] \.window-titlebar__drag\s*\{[\s\S]*?display:\s*none/,
  );
  assert.match(
    arcShell,
    /data-sidebar-visible="true"[\s\S]*?--context-panel-width/,
  );
  assert.match(arcShell, /data-sidebar-visible="false"[\s\S]*?width:\s*0/);
  assert.match(titlebar, /panelControls\?\.sidebarVisible/);
  assert.doesNotMatch(titlebar, /PanelLeftOpen|Show sidebar/);
  assert.match(
    arcShell,
    /\.titlebar-panel-controls > button,[\s\S]*?-webkit-app-region:\s*no-drag/,
  );
  assert.match(
    arcShell,
    /\.titlebar-panel-controls,[\s\S]*?right:\s*10px;[\s\S]*?left:\s*auto/,
  );
  assert.match(
    arcShell,
    /data-shell="true"\]\[data-sidebar-visible="true"\][\s\S]*?width:\s*min\(var\(--context-panel-width, 280px\), 100%\)/,
  );
  assert.match(
    arcShell,
    /\.window-titlebar\[data-shell="true"\][\s\S]*?transition:\s*width 220ms/,
  );
  assert.doesNotMatch(
    arcShell,
    /data-platform="windows"\] \.titlebar-panel-controls/,
  );
  assert.doesNotMatch(
    arcShell,
    /data-platform="macos"\] \.titlebar-panel-controls[\s\S]*?left:\s*92px/,
  );
  assert.match(
    arcShell,
    /\.app-frame\[data-space\] \.user-dock\s*\{[\s\S]*?border-radius:\s*12px/,
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
  assert.match(app, /enabled=\{layoutPreferences\.sidebarVisible\}/);
  assert.match(
    styles,
    /desktop-shell\[data-left-panel="hidden"\][\s\S]*?\.content-shell\s*{[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*0/,
  );
  assert.match(app, /aria-label=\{contentLabel\}/);
});

test("native overlay chrome, directional motion, and scroll activity retain their contracts", () => {
  assert.doesNotMatch(titlebar, /<SpaceSwitcher/);
  assert.match(
    app,
    /data-space=\{showSpaceSwitcher \? activeSpace : undefined\}/,
  );
  assert.doesNotMatch(titlebar, /OG Nahan Gang|Professional yappers/);
  assert.match(
    titlebar,
    /<span className="window-titlebar__drag" aria-hidden="true" \/>/,
  );
  assert.match(titlebar, /titlebar-panel-controls/);
  assert.match(titlebar, /data-sidebar-visible=/);
  assert.doesNotMatch(titlebar, /Window controls|Minimize window|Close window/);
  assert.doesNotMatch(app, /<TopBar|function TopBar/);
  assert.match(app, /onToggleSidebar/);
  assert.match(electronMain, /label:\s*"Toggle Sidebar"/);
  assert.match(electronMain, /accelerator:\s*"CmdOrCtrl\+B"/);
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
    /\.window-titlebar__drag\s*\{[\s\S]*?-webkit-app-region:\s*drag/,
  );
  assert.match(
    styles,
    /\.titlebar-panel-controls,[\s\S]*?-webkit-app-region:\s*no-drag/,
  );
  const windowsOverlayStart = styles.indexOf(
    '.window-titlebar[data-platform="windows"]',
  );
  const windowsOverlayEnd = styles.indexOf(
    ".titlebar-panel-controls > button",
    windowsOverlayStart,
  );
  assert.notEqual(windowsOverlayStart, -1);
  assert.notEqual(windowsOverlayEnd, -1);
  const windowsOverlay = styles.slice(windowsOverlayStart, windowsOverlayEnd);
  assert.match(windowsOverlay, /left:\s*env\(titlebar-area-x, 0px\)/);
  assert.match(windowsOverlay, /width:\s*env\(titlebar-area-width, 100%\)/);
  assert.match(
    windowsOverlay,
    /left:\s*calc\([\s\S]*?titlebar-area-x[\s\S]*?titlebar-area-width/,
  );
  assert.match(windowsOverlay, /right:\s*0/);
  assert.doesNotMatch(windowsOverlay, /138px/);
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
  assert.match(
    styles,
    /activity-preview\[data-collapsed="true"\][\s\S]*?transform:\s*rotate\(-90deg\)/,
  );
  assert.match(
    styles,
    /--voice-orb-size:\s*clamp\(177\.6px, 26\.4vmin, 256\.8px\)/,
  );
  assert.match(
    styles,
    /\[data-layout="wrap"\][\s\S]*?--voice-orb-size:\s*clamp\(122\.4px, 18vmin, 177\.6px\)/,
  );
  assert.match(styles, /\[data-layout="dense"\][\s\S]*?flex-wrap:\s*wrap/);
  assert.doesNotMatch(styles, /\[data-layout="orbit"\]/);
  assert.doesNotMatch(voiceRoom, /peopleOrbitStyle|--orbit-[xy]/);
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
