# Plan 0036 — Arc glass shell and permission recovery

## Goal

Replace Bakbak's two visible header rows with native-safe, full-window chrome;
make the sidebar manually disappear without disturbing call state; make liquid
glass the default floating-control treatment over a permanently transparent
sidebar and solid conversation canvas; and replace guessed permission errors
with typed macOS and Windows recovery.

## Accepted product contract

- Remove both the full app-owned titlebar and contextual conversation top bar;
  keep only a compact, action-free drag strip at the top of the main canvas.
- Keep native macOS traffic lights on the platform-standard left edge—inside
  the sidebar when it is left-positioned and vertically centered in the 30 px
  main drag strip when it is right-positioned—and hide them with that sidebar.
  Use Windows Window Controls Overlay on its platform-standard right edge.
- Keep the sidebar visible by default, preserve its 248–340 px width, and let
  one control directly after Settings in the bottom user dock close it while
  visible. Keep the signed-in native-safe overlay empty and zero-width. View →
  Toggle Sidebar and `Cmd/Ctrl+B` restore it. Calls never change sidebar
  visibility automatically.
- Default the sidebar to the left, let Appearance Settings move it to the right,
  mirror the resizer direction, and persist the position without changing its
  saved width or visibility. Native caption buttons remain on their
  platform-standard edge.
- A hidden sidebar is mounted but inert at zero width. Its solid conversation
  canvas becomes borderless and fills the complete window; a focused share
  fills that canvas while people view retains useful padding.
- Glass is the default per-space chrome mode. The sidebar slot is always
  transparent, Appearance offers only Glass or a translucent gradient, and
  each space keeps an independent 20–100% transparency level with a 100%
  default. Untouched defaults migrate to fully transparent Glass; legacy Solid
  records become single-color
  gradients. The one-time appearance prompt is retired.
- The visible shell has no outer gutter, canvas border, radius, or shadow. Its
  unpainted sidebar slot shows the current material or translucent theme while
  the conversation canvas stays solid. Glass applies to floating navigation
  and controls, not message or live-media content. Unsupported or
  reduced-transparency environments compose the same transparent sidebar over
  an opaque scheme-aware fallback.
- macOS stays ad-hoc signed. This work improves permission diagnosis and
  recovery but cannot preserve TCC grants between changing ad-hoc builds.
- Windows microphone recovery points to the global desktop-app privacy switch;
  screen capture never claims a nonexistent Bakbak-specific permission.

## Implementation checklist

- [x] Add typed microphone/screen status, request, settings, and structured
      desktop-source results to the narrow Electron bridge.
- [x] Make source/system-audio capabilities truthful and separate audio-track
      failure from Screen Recording denial.
- [x] Replace renderer-owned Windows caption controls with native Window
      Controls Overlay and add a native View-menu sidebar command.
- [x] Migrate layout preferences from v3 to v4 and implement manual sidebar
      controls, native safe areas, accessible content naming, and full-bleed
      focused sharing.
- [x] Migrate account-scoped sidebar themes to chrome-theme v2, default Glass,
      preserve custom backgrounds, and remove onboarding state/dialog.
- [x] Keep the sidebar permanently transparent, remove Solid from Appearance,
      normalize saved Solid records, expose 20–100% transparency in both modes,
      and add a compact main-canvas drag strip.
- [x] Scope the signed-in close overlay to the visible sidebar, remove it in the
      hidden state, make the toggle an explicit clickable no-drag region, align
      and sidebar-scope macOS traffic lights, default Glass to 100%, and round
      the current-user dock.
- [x] Move the close toggle beside Settings in the user dock, leave the
      signed-in overlay empty, and migrate layout preferences to v5 with a
      persisted left/right sidebar position and mirrored resizer.
- [x] Reposition macOS traffic lights from `{ x: 16, y: 16 }` to
      `{ x: 16, y: 8 }` in right-sidebar mode so they remain centered in the
      compact main drag strip, and reapply that alignment with native state.
- [x] Add vibrancy/Mica/fallback capability reporting, opaque startup, glass
      tokens, and accessibility fallbacks without filtering live media.
- [x] Complete formatting, lint, typecheck, unit/source-contract, production
      renderer build, bundle secret scan, and available macOS package checks.
- [ ] Complete installed Apple Silicon macOS acceptance and Windows x64
      acceptance on their native hosts.
- [x] Update architecture, active phase status, and the canonical progress log.

## Acceptance

- No full or contextual renderer header remains. The compact main-canvas drag
  strip and native caption controls remain usable, draggable, keyboard
  accessible, and correctly contrasted.
- Hiding and restoring the sidebar does not reconnect voice, stop sharing,
  reset drafts, move the saved width outside its clamp, or leave renderer chrome
  over the full-window canvas.
- Glass/gradient/fallback modes survive account and space changes with
  no raw-desktop startup flash or blur on avatars, camera, or screen video.
- Microphone prompts occur only from explicit capture actions. Permission and
  capture failures show platform-correct actions without string sniffing.
- Formatting, lint, renderer/Electron typechecks, unit/source-contract tests,
  production build, bundle secret scan, and the platform-available desktop
  package succeed before completion is claimed.

## Deferred

- Developer ID signing/notarization and Windows Authenticode signing.
- Any backend, LiveKit lifecycle, updater identity/data-path, Linux, or Intel
  macOS changes.
