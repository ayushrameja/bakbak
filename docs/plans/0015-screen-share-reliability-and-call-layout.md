# Plan 0015 — Screen-share reliability and Discord-like call layout

## Status

Implemented in the repository on 2026-07-20. Automated renderer, macOS native,
and Windows cross-compile validation is complete. Release remains blocked until
the installed macOS/Windows three-client isolation, layout, and fullscreen
matrix passes.

## Goal

Prevent captured source audio from carrying Bakbak voice back into the room,
replace stretched call cards with bounded responsive media tiles, make focus
reversible, and keep renderer fullscreen state synchronized with the actual
Tauri window.

This plan tightens plan 0010's capture/focus behavior and supersedes plan 0014's
sidebar Watch and cross-room pending-watch flow. LIVE remains informational;
members join the voice room and choose a share tile.

## Accepted behavior

- macOS application capture contains only the selected application. Entire
  screen capture keeps Bakbak visible when it is on that display but excludes
  current-process audio.
- Windows application audio includes only the selected process tree. Entire
  screen audio excludes Bakbak's process tree.
- Bakbak windows and descendants are rejected during application enumeration
  and revalidated when capture starts.
- Source-audio publication begins only after isolated native capture succeeds.
  Failure degrades to video-only and surfaces a warning.
- Every source reports `audioUnavailableReason`. The picker disables and clears
  source audio for that source when isolation is unavailable.
- The presenter keeps its companion video subscription and never subscribes to
  its companion audio.
- Gallery tiles share one centered 16:9 sizing system: 520 px maximum for one
  target, 440 px for two, 380 px in two columns for three/four, 320 px in up to
  three columns for five/six, and 240–300 px auto-fit tiles with scrolling for
  seven or more.
- Clicking a target focuses it. Clicking the focused media, active filmstrip
  item, or Back to grid returns to the gallery and releases remote share
  subscriptions.
- Focus uses a bounded `minmax(0, 1fr)` stage plus a separate 72 px visual
  filmstrip. Media uses `object-fit: contain`; labels never consume its bottom
  edge.
- Focused fullscreen is a fixed `100dvh` overlay. The renderer reconciles
  against Tauri `isFullscreen()` after requests, resize/focus changes, Escape,
  target loss, disconnect, and teardown.
- Exit fullscreen remains pinned above media. Secondary controls and the
  filmstrip hide after 2.5 seconds idle and return on pointer or keyboard
  activity.
- Escape exits OS fullscreen and retains focus. Back to grid or activating the
  focused target exits fullscreen, returns to the gallery, and stops watching.
- Fullscreen failures are non-blocking and the UI restores the actual native
  state.
- Sidebar LIVE is informational, long names truncate, elapsed time stays on a
  second row, and there is no Watch chip.

## Completion criteria

- [x] Add per-source audio availability to the native/renderer contract.
- [x] Add explicit macOS current-process and Windows process-tree policies.
- [x] Reject Bakbak descendants and retain video-only fallback.
- [x] Keep local companion video while forcing local companion audio off.
- [x] Remove sidebar Watch and pending cross-room watch state.
- [x] Add bounded count-aware gallery tiles and visual focus filmstrip.
- [x] Make focused media activation reversible with subscription cleanup.
- [x] Replace shell-dependent fullscreen with a native-state-synchronized fixed
      overlay and pinned exit.
- [x] Add focused renderer and native policy tests.
- [x] Pass repository checks, macOS build, Windows cross-check, and secret scan.
- [ ] Pass installed macOS and Windows three-client isolation/fullscreen matrix.
- [ ] Pass installed visual QA across all appearances, panel combinations,
      counts, share aspect ratios, Windows scaling, and macOS Retina sizing.

## Installed acceptance matrix

For Entire screen and Application on installed macOS and Windows clients:

- source audio is heard exactly once;
- participant voices exist only on their direct voice tracks;
- nobody hears their own delayed voice;
- muting one participant's direct volume proves their voice is absent from the
  share track;
- deafen, output selection, share switching, pause/resume, and teardown remain
  correct;
- fullscreen enters/exits by button and Escape with all four media edges
  visible and no zero-height or black stage.

Any platform/source mode that fails isolation ships video-only until the matrix
proves it safe.

## Deferred

Browser/Linux sharing, multiple simultaneous watched shares, pop-out media,
recording, annotations, and remote control remain outside this plan.
