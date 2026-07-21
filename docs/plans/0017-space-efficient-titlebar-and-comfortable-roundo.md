# 0017 — Space-efficient titlebar and comfortable Roundo

- **Status:** Implemented locally; installed native acceptance pending
- **Approved:** 2026-07-21
- **Scope:** Window chrome, renderer navigation, layout, and visual density

## Summary

Bakbak replaces the fixed 68 px Personal/server rail with a 48 px app-owned
titlebar. A centered two-label segment switches Personal and Bakbak without
interrupting voice. macOS retains native traffic lights over the webview;
Windows uses an undecorated resizable window with app-owned controls.

The complete renderer uses a comfortable Roundo scale, 500–700 product
weights, an 11 px text minimum, 15 px chat, consistent spacing, restrained
curves, and calmer hover behavior. The flat system-following grayscale contract
from plan 0016 remains unchanged. Every pixel should earn its rent.

## Decisions

1. The titlebar is always present. Authentication, invite, and startup states
   keep it navigation-free and retain branding in their main content; the
   signed-in shell shows the space switch without redundant left-edge branding.
2. macOS uses `Overlay`, a hidden native title, native decorations, and a
   `16×24` traffic-light position so the controls align with the 48 px bar.
   Windows disables decorations but preserves
   resizing and the native window shadow, then exposes minimize,
   maximize/restore, and close through narrowly scoped Tauri permissions.
3. Personal and Bakbak are navigation destinations, not an on/off setting, so
   the control uses two explicit labels, `aria-current`, arrow/Home/End
   navigation, unread markers, active-call state, and a disabled invite state.
4. Both side-panel toggles live together at the titlebar's right edge rather
   than bracketing the contextual header. Blocking dialogs disable the space
   and panel controls while window controls remain usable. Voice fullscreen
   hides the complete titlebar and restores it on exit.
5. Layout preferences remain v2 with 232/240 px side-panel defaults and the
   existing 200–360 px persisted range. Recovered rail width goes to the center
   canvas; no preference migration is needed.
6. Product UI uses Roundo 500 for normal text, 600 for labels/emphasis, and 700
   for headings/actions. CSS exposes 11/12/13/14/15/16 px semantic text tokens;
   no rendered product rule may use a weight below 500 or size below 11 px.
7. Controls use a 10 px radius, cards 14 px, major panels 16 px, and dialogs
   18 px. Circles, pills, media, and fullscreen edges retain their semantic
   shapes. Hover changes surface/border/text without vertical movement.
8. Linux chrome remains native and is deferred until Linux distribution work.

## Acceptance criteria

- [x] Add the always-present app frame, titlebar, runtime window adapter, and
      platform-specific Tauri configurations.
- [x] Replace `DestinationRail` with the accessible Personal/Bakbak segmented
      switch while preserving per-space selection, unread state, and voice.
- [x] Remove the rail column from all four panel layouts while retaining a
      minimum 420 px center canvas at the 1024 px minimum window.
- [x] Reduce the contextual header to 60 px and apply the approved typography,
      spacing, radius, and interaction tokens across the renderer.
- [x] Remove redundant titlebar branding, vertically align native macOS window
      controls, and group both panel toggles at the titlebar's right edge.
- [x] Add component, App integration, native-config, typography, and existing
      media-layout regression coverage.
- [x] Complete browser visual checks in the dark scheme at 1024×680, 1280×800,
      and 2560×1440 with no overflow or console errors.
- [ ] Complete installed macOS and Windows checks for native controls,
      dragging, maximize/restore, resizing, light/dark schemes, offline Roundo,
      and screen-share cleanup on close.
- [x] Pass the final repository renderer, security, native-build, and diff
      validation suite.

## Known release gate

Browser QA cannot prove native traffic-light placement, Windows hit-testing,
Windows 10/11 shadow behavior, OS window shortcuts, or close-time screen-share
cleanup. Those installed checks remain required before v1 distribution.
