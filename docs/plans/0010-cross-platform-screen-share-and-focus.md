# 0010 — Cross-platform screen sharing and focused call media

- **Status:** In progress
- **Approved:** 2026-07-17
- **Depends on:** plans 0002, 0003, and 0006

Plan 0015 tightens this plan's source-audio isolation, gallery sizing, focus
reversal, and fullscreen behavior. Its installed macOS/Windows matrix is now
the authoritative release gate.

## Goal

Finish the native macOS and Windows screen-sharing path, raise the presenter
ceiling to 1080p/60 fps, and make screen shares and people navigable through a
gallery, focused stage, and operating-system fullscreen mode.

This plan supersedes plan 0003's 1080p/15 fps ceiling and plan 0006's
always-featured share layout. It retains the separate least-privilege LiveKit
companion, optional source-audio boundary, one-share-per-app-instance limit,
and browser exclusion.

## Accepted behavior

- The first-run presenter profile is 1080p/60 fps. Resolution
  (480p/720p/1080p) and frame rate (15/30/60) are independently selectable
  before and during a share, and the last successful profile is device-local.
- Source audio defaults on whenever matched audio is available for the selected
  source; the presenter can turn it off with a switch. The choice is not
  persisted across shares. The presenter controls the outgoing ceiling; LiveKit
  may deliver a lower layer for bandwidth or viewport needs.
- macOS 14+ and Windows share one Bakbak Entire screen / Application picker.
  macOS enumerates displays and running applications through ScreenCaptureKit;
  Windows uses privacy-filtered native monitor/window handles so matched
  process-tree or display audio never relies on title guessing.
- A source that stops producing complete frames freezes its last good frame,
  reports a paused state after two seconds, and resumes automatically.
- Voice rooms open in a bounded count-aware 16:9 gallery. Clicking a participant
  or share opens a media-first focused stage without a metadata header or
  people strip. Clicking the focused target again returns to the gallery; a
  watched remote share stays live in its grid tile until switching, target
  loss, disconnect, or leave.
- Focused media can place the Tauri window in OS fullscreen through plan 0015's
  fixed overlay and actual-native-state reconciliation. Escape exits OS
  fullscreen while retaining focus; disconnect or target loss clears it.
- The focused media row uses bounded grid sizing and `object-fit: contain`, so
  no edge of a shared source is clipped. Back and fullscreen controls overlay
  the bottom corners instead of reserving stage height.
- The soundboard closes on outside interaction and Escape while treating its
  triggers and edit modal as owned surfaces.

## Completion criteria

- [x] Add validated and persisted quality settings plus native start/update
      contracts.
- [x] Configure macOS custom Entire screen / Application enumeration, dynamic
      ScreenCaptureKit settings, and paused-frame signaling.
- [x] Add Windows native source enumeration, previews, WGC video, matched
      source audio, and native LiveKit publication.
- [x] Add gallery/focus/fullscreen UI and selective subscription behavior.
- [x] Fix soundboard outside-click ownership and focus behavior.
- [x] Pass focused TypeScript/Rust tests and repository checks.
- [x] Pass the local macOS native app build and compiled secret scans.
- [ ] Pass a native Windows build. Windows-only code and tests cross-compile
      with cargo-xwin, but the cross-host LiveKit linker remains blocked on its
      native CXX bridge symbols and a Windows MSVC runner is still required.
- [ ] Complete the bidirectional installed-client media matrix, including
      actual sender-resolution/FPS observation and artifact-size comparison.
- [x] Update architecture, parent plans, setup notes, and the canonical
      progress log.

## Deferred

Recording, annotations, remote control, pop-out windows, aggregate multi-window
application capture, persistent audio opt-in, browser sharing/viewing, and
protected-content workarounds remain out of scope.
