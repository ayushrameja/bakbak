# 0018 — Native glass, edge-to-edge panels, and motion polish

- **Status:** Implemented locally; installed native acceptance pending
- **Approved:** 2026-07-21
- **Scope:** Native window material, renderer surfaces/layout, motion, and scrollbars

## Summary

Bakbak uses system-adaptive glass: near-black translucent layers in dark mode
and neutral-white translucent layers in light mode. The signed-in shell is
edge-to-edge with five stable tracks—left panel, 1 px separator, conversation,
1 px separator, and right panel—and keeps a 420 px minimum conversation canvas.

The 232 px Personal/Bakbak switch sits at the titlebar's left after the macOS
traffic-light safe area. `OG Nahan Gang` is fixed at the true window centre;
panel controls and Windows window controls remain at the right. Panel collapse,
space changes, first-launch assembly, and scrollbars receive bounded motion
without changing backend, voice, draft, navigation, or persisted-layout
contracts.

This plan is the visual/layout authority where plans 0016 and 0017 conflict.
It preserves plan 0016's grayscale, system light/dark, local Roundo, and
unfiltered user/live media contracts, and plan 0017's titlebar, platform window
controls, type scale, 232/240 px panel defaults, and 420 px center minimum.

Plan 0019 supersedes only the preserved fully monochrome semantic-state rule.
The neutral glass, system light/dark, native-material, layout, motion, and
unfiltered-media decisions in this plan remain authoritative.

## Decisions

1. macOS enables transparency, `macOSPrivateApi`,
   `underWindowBackground`, and active/inactive material following while
   retaining overlay traffic lights and native shadow. This excludes Mac App
   Store distribution; Bakbak's private distribution accepts that tradeoff.
2. Windows 11 build 22000 or newer applies Mica from Rust. Windows 10 and web
   preview retain the same glass-token hierarchy over an opaque CSS underlay;
   Acrylic is deliberately excluded.
3. Rust injects `data-window-material="native|fallback"` before React. Native
   material uses transparent document roots; fallback roots are opaque so raw
   desktop content cannot flash through.
4. Primary glass uses `blur(24px) saturate(120%)`. Dark panels use
   `rgba(0,0,0,0.68)` and strong controls `rgba(0,0,0,0.82)`; light panels use
   `rgba(255,255,255,0.66)` and strong controls
   `rgba(255,255,255,0.82)`. Avatars, covers, emoji, video, and shares retain
   source colour.
5. Side panels live in persistent clipping slots. Hidden slots animate to zero
   width, become `inert` and `aria-hidden`, and disable their 9 px invisible
   resize hit area immediately. The existing layout preference v2 key and
   widths remain unchanged.
6. Space data changes immediately. Left, center, and right enter at 0, 40, and
   80 ms and finish within 240 ms; a revision replaces an in-flight animation
   instead of queueing it. Voice and drafts remain owned above these visual
   subtrees.
7. Startup assembly runs once per renderer launch after the first usable shell:
   titlebar at 0 ms, left/center/right at 30/70/110 ms, up to eight message rows
   from 160 ms at 24 ms intervals, and composer at 280 ms. It completes within
   500 ms with no artificial loading delay.
8. Scrollable surfaces use a 6 px transparent track. Hover, focus-within, or
   delegated scroll activity reveals the thumb; scroll activity clears 650 ms
   after the final event. Reduced-motion users receive final layout immediately.
9. The 220 ms grid transition applies to panel show/hide only. An active pointer
   resize disables it synchronously so both the panel and conversation canvas
   track the pointer directly. The drag clears existing selection and applies a
   temporary document-wide selection guard that is removed on release, cancel,
   lost capture, or window blur. Keyboard resizing and double-click reset retain
   their existing behavior.

## Acceptance criteria

- [x] Configure macOS native material and pre-render material detection.
- [x] Gate Windows Mica to Windows 11 while keeping Windows 10/web opaque.
- [x] Replace outer padding, gutters, rounding, panel outlines, and shadows
      with a stable five-track shell and straight 1 px separators.
- [x] Keep hidden panels mounted but inert and preserve the layout preference
      v2 schema, panel widths, visibility, keyboard resizing, and reset.
- [x] Move the space switch left, add the fixed centered title, retain the
      titlebar's right-side controls, and preserve blocking-dialog behavior.
- [x] Add panel-collapse, space-stagger, one-shot startup, bounded message, and
      reduced-motion behavior.
- [x] Add auto-hiding 6 px scrollbars and delegated 650 ms scroll activity.
- [x] Make pointer resizing immediate and prevent accidental document selection
      during left or right panel drags.
- [x] Add component, App, native-config, glass/layout, motion, and scrollbar
      regression coverage.
- [ ] Complete light/dark browser visual QA at 1024×680, 1280×800, and
      2560×1440 across all four panel combinations.
- [ ] Complete installed macOS and Windows 10/11 material, window-control,
      drag/resize/fullscreen, contrast, and startup-flash QA.
- [x] Pass the final repository renderer, security, native-build, and diff
      validation suite.

## Known release gate

Browser QA cannot establish native desktop vibrancy, inactive-window material,
traffic lights, Mica build gating, shadows, or startup transparency. Installed
macOS plus Windows 10 and 11 checks remain required before distribution.
