# Plan 0037 — Native Electron screen-audio isolation

## Status

Implementation in progress on 2026-08-14. Packet 2 adds the native helper,
Electron supervision, renderer delegation, and packaging contracts. Installed
macOS/Windows acceptance remains open.

## Problem

The Electron migration replaced the former native process-tree capture path
with Chromium loopback. A presenter watching their own share can therefore feed
Bakbak's remote voice/screen playback back into the published screen-audio
track: the presenter hears themself and another participant can be heard twice.
Browser `restrictOwnAudio` is not a proof of process isolation.

## Accepted design

- Bundle `bakbak-screen-share-helper[.exe]` under `resources/native` and launch
  it only from Electron main. Development uses
  `native/screen-share-helper/target/{debug|release}`; its optional override is
  main-process-only.
- Use newline-delimited protocol v1. Electron must send exact `hello` first with
  its root PID, bundle ID, and app version. Public commands are
  `capabilities`, `listSources`, `start`, `update`, and `stop`; `shutdown` is
  internal. Responses must correlate to one outstanding request ID. Lifecycle
  is the only unsolicited event.
- Bound hello to 5 seconds, start to 30 seconds, other commands to 15 seconds,
  input lines to 32 MiB, LiveKit tokens to 16 KiB, and sources to 256. Reject
  malformed/unknown responses, kill the helper, reject all pending requests,
  and emit a sanitized failure for an active session.
- Never log request payloads, tokens, or raw helper stderr. Pass an environment
  allowlist only; omit Bakbak, Supabase, LiveKit, and renderer variables.
- The helper owns native source enumeration, capture, process-tree audio
  isolation, companion LiveKit connection, publication, update, and stop. The
  renderer owns picker and lifecycle UI only and must not call Chromium display
  capture or publish screen tracks.
- Entire-screen audio excludes the verified Electron root process and every
  descendant. Application audio includes only the selected process tree. Audio
  fails closed when that proof is unavailable; there is no Chromium loopback
  fallback.
- On macOS, stopping or downgrading audio reconfigures the live
  ScreenCaptureKit session with `capturesAudio = false` while retaining video
  and the selected quality settings. The helper pins `apple-metal` 0.6.0. A
  clean standard-target rebuild and inspection proved that the staged and
  packaged helper do not acquire the unused MetalFX load dependency; the Mach-O
  load floor remains 11.0 while Bakbak's supported product floor remains macOS
  12.3.
- Native audio rollout is compiled into Electron. Tracked/default, PR, and
  release builds embed `false`, mask helper/source audio capabilities, and
  reject audio start before helper spawn. Only the exact-revision stabilization
  candidate workflow embeds `true` until installed acceptance passes; runtime
  environment variables are not the installed control.

## Quality contract

Only these dimensions and rates are accepted: 854×480, 1280×720, 1920×1080 at
15, 30, or 60 fps. Bitrate must exactly match the existing UI table (0.8–8
Mbps). Native diagnostics expose only `disabled`,
`exclude-bakbak-process-tree`, or `include-selected-process-tree` isolation.

## Acceptance

- [x] Add protocol-v1 Electron helper supervision, strict request/result
      validation, lifecycle forwarding, timeout/crash cleanup, and sanitized
      errors.
- [x] Replace preload `prepare` with narrow capabilities/list/start/update/stop
      methods plus lifecycle subscription.
- [x] Remove renderer Chromium capture and LiveKit publication.
- [x] Remove Electron `desktopCapturer`, display-media request handling,
      `display-capture` permission, and `audio: "loopback"`.
- [x] Build and include the native helper in development/package scripts and
      macOS/Windows CI packaging.
- [x] Add helper protocol, malformed response, correlation, crash, environment,
      packaging, CI, and no-loopback automated contracts.
- [x] Prove through a unit test that stopping macOS audio reconfigures
      ScreenCaptureKit without stopping video.
- [x] Rebuild the standard Apple Silicon release target from clean dependency
      output and prove the packaged helper has no MetalFX symbol/load dependency
      while retaining the intended Mach-O deployment floor.
- [x] Add the fail-closed compile-time rollout gate and prove default/release
      false, stabilization candidate true, masked capability/source results,
      and no helper audio request while disabled.
- [ ] On installed Apple Silicon macOS, verify Entire screen and Application
      video/audio, source end, quality update, permission recovery, helper
      crash, and app quit cleanup.
- [ ] On installed Windows x64, repeat the same matrix on supported Windows
      versions.
- [ ] Run three clients (presenter, speaker, viewer): presenter watches the
      share while speaking and hearing the speaker; prove no self-return and
      exactly one copy of the speaker for at least 30 minutes.
- [ ] Inspect packaged helpers for correct executable inclusion/signing and scan
      bundles/logs for service credentials and the test token.

## Release gate

Do not publish the first Electron release based on automated checks alone. Both
installed platform matrices and the three-client acoustic/transport observation
must be recorded in `docs/progress.md`.
