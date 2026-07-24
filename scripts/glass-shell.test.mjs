import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [styles, app, titlebar, panelResizer, chat, scrollbarHook, html] =
  await Promise.all([
    readFile(new URL("src/styles.css", root), "utf8"),
    readFile(new URL("src/app/App.tsx", root), "utf8"),
    readFile(new URL("src/components/WindowTitlebar.tsx", root), "utf8"),
    readFile(new URL("src/components/PanelResizer.tsx", root), "utf8"),
    readFile(new URL("src/features/chat/ChatView.tsx", root), "utf8"),
    readFile(new URL("src/lib/use-auto-hide-scrollbars.ts", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
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
  assert.match(html, /name="theme-color"[\s\S]*?content="#000000"/);
  assert.match(html, /name="theme-color"[\s\S]*?content="#f4f4f4"/);
});

test("shell remains a flush five-track grid with persistent inert side slots", () => {
  assert.match(
    styles,
    /grid-template-columns:[\s\S]*?var\(--left-panel-track\)[\s\S]*?var\(--left-divider-track\)[\s\S]*?minmax\(420px, 1fr\)[\s\S]*?var\(--right-divider-track\)[\s\S]*?var\(--right-panel-track\)/,
  );
  assert.match(styles, /--left-divider-track:\s*1px/);
  assert.match(styles, /--right-divider-track:\s*1px/);
  assert.match(
    styles,
    /\.desktop-shell\[data-left-panel="hidden"\]\[data-right-panel\]/,
  );
  assert.match(
    styles,
    /\.desktop-shell\[data-left-panel\]\[data-right-panel="hidden"\]/,
  );
  assert.match(styles, /\.desktop-shell[\s\S]*?gap:\s*0;[\s\S]*?padding:\s*0;/);
  assert.match(
    styles,
    /\.desktop-shell\[data-left-panel\]\[data-right-panel\]/,
  );
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
  assert.match(app, /className="panel-slot panel-slot--right"/);
  assert.match(app, /aria-hidden=\{layoutPreferences\.leftPanelVisible/);
  assert.match(app, /inert=\{layoutPreferences\.rightPanelVisible/);
  assert.match(app, /enabled=\{layoutPreferences\.leftPanelVisible\}/);
  assert.match(app, /enabled=\{layoutPreferences\.rightPanelVisible\}/);
});

test("titlebar, space motion, startup assembly, and scroll activity retain their timing contracts", () => {
  assert.match(titlebar, /window-titlebar__leading[\s\S]*?<SpaceSwitcher/);
  assert.match(titlebar, /"OG Nahan Gang"[\s\S]*?"Professional yappers"/);
  assert.match(titlebar, /window-titlebar__center window-titlebar__drag/);
  assert.match(titlebar, /TITLEBAR_MESSAGE_ROTATION_MS = 8_000/);
  assert.equal(titlebar.match(/onMouseDown=\{handleDrag\}/g)?.length, 1);
  assert.equal(
    titlebar.match(/onDoubleClick=\{handleDoubleClick\}/g)?.length,
    1,
  );
  assert.match(titlebar, /isTitlebarControl\(event\.target\)/);
  assert.match(
    styles,
    /\.member-panel__person \+ \.member-panel__person\s*{[\s\S]*?margin-top:\s*5px/,
  );
  assert.match(
    styles,
    /\.user-dock__cover\s*{[\s\S]*?position:\s*absolute[\s\S]*?opacity:\s*0\.42/,
  );
  assert.match(styles, /\.space-switcher\s*{[\s\S]*?width:\s*232px/);
  assert.match(styles, /padding-left:\s*88px/);
  assert.match(styles, /space-enter-center 180ms 40ms/);
  assert.match(styles, /space-enter-right 160ms 80ms/);
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
