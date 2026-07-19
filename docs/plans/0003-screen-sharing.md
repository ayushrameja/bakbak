# 0003 — Desktop screen sharing with matched source audio

- **Status:** In progress
- **Approved:** 2026-07-12
- **Depends on:** `0001-bakbak-desktop-v1.md`, `0002-voice-video-and-presence.md`

## Goal

Let installed Bakbak clients present a display, application, or window through
the operating-system picker, with explicitly opted-in source audio where the
platform can match it safely. Shares use a separate, least-privilege LiveKit
companion and appear in one featured stage above the call grid.

Plan 0010 supersedes this plan's 1080p/15 ceiling, renderer-fallback Windows
path, and always-featured stage. The token, companion, membership, and audio
privacy boundaries below remain in force.

## Accepted behavior

- Screen sharing exists only in installed macOS and Windows clients. Browser
  clients neither publish nor subscribe to share tracks.
- Every start shows a confirmation with source audio on by default when
  available, followed by Bakbak's Entire screen / Application picker on macOS
  14+ and Windows (plan 0010). Camera, microphone, soundboard, and sharing
  remain independent.
- A native companion may publish only `screen_share` and
  `screen_share_audio`, cannot subscribe or send data, and is destroyed on
  stop, voice leave, window close, source termination, or terminal connection
  failure.
- macOS 14 and later use ScreenCaptureKit, exclude Bakbak's own process audio,
  and target at most 1080p/15 fps plus 48 kHz stereo audio. Older compatible
  desktop runtimes may use video-only `getDisplayMedia`. The direct native
  framework link establishes macOS 12.3 as the bundle minimum.
- Windows must use `Windows.Graphics.Capture`; matched window audio requires
  application-loopback support from build 20348 onward. A Windows build without
  a verified process/display audio matcher exposes only the video-only fallback
  and explains why audio is disabled.
- One share is featured at a time. The first presenter is selected
  automatically, manual selection is preserved, and the newest remaining share
  is selected if the featured presenter stops.
- The selected share's video and audio are the only share publications
  subscribed. Deafen, selected output, and the owner's participant volume also
  apply to shared audio.

## Completion criteria

- [x] Add backward-compatible voice/screen token parsing and exact
      least-privilege grants with signer and authorization tests.
- [x] Add Tauri capability/start/stop contracts restricted to the main window.
- [x] Add a macOS native LiveKit companion using the system picker,
      ScreenCaptureKit video/audio capture, video-only audio fallback, source
      termination handling, and app/voice teardown.
- [x] Add the Windows native capture and build-gated matched-audio companion;
      installed Windows isolation validation remains open below.
- [x] Add renderer confirmation, call/sidebar controls, companion filtering,
      featured-stage selection, selective subscriptions, warnings, and cleanup.
- [x] Hide all controls/stage content and unsubscribe share publications in
      browser mode.
- [x] Add focused Edge Function, renderer, and macOS Rust tests.
- [x] Deploy only `livekit-token`, then verify the unauthenticated 401 probe.
- [ ] Pass macOS and Windows CI builds and record before/after artifact sizes.
- [ ] Complete the two-account, bidirectional macOS/Windows acceptance matrix.
- [x] Update architecture, setup/compatibility notes, the active Phase 5 scope,
      and the canonical progress log.

Phase 5's screen-sharing criterion remains open until the installed macOS and
Windows builds pass the real cross-platform matrix. A green checkbox should be
evidence, not motivational typography.

## Deferred

Browser viewing/publishing, Linux, recording, annotations, remote control,
protected-content workarounds, and persistent audio opt-in remain outside this
plan. DRM-protected content may be black or silent because the operating system
owns that policy.
