# Plan 0032 — Windows screen-share audio isolation

## Goal

Prevent Entire screen audio on Windows from returning Bakbak's own call audio.
The presenter microphone stays muted during acceptance so digital loopback is
not confused with ordinary speaker-to-microphone echo.

## Implemented scope

- [x] Read WebView2 `GetProcessInfos` from Tauri's native webview handle at
      startup and refresh the native-only snapshot through
      `ProcessInfosChanged`.
- [x] Require exactly one browser process and prove every reported WebView2
      helper is its descendant. Never expose or log process identifiers.
- [x] Use the proven WebView2 browser root for Entire screen WASAPI
      `ExcludeProcessTree`; keep selected-application
      `IncludeProcessTree` capture.
- [x] Reject application sources owned by the Tauri host tree or the WebView2
      process group.
- [x] Keep Entire screen video available without audio on Windows builds older
      than 20348 or whenever WebView2 isolation cannot be proven.
- [x] Revalidate the exact WebView2 topology immediately before WASAPI
      activation and while sharing. On change or proof loss, stop native audio
      frames before unpublishing the screen-audio track while leaving video
      active.
- [x] Extend native session and lifecycle results with
      `audioUnavailableReason`; show that reason in the existing renderer
      warning and clear `audioPublished` after a live downgrade.
- [x] Report successful display isolation as
      `exclude-webview2-process-tree`.
- [x] Add a Windows pull-request CI job for locked Cargo checks and native
      tests.

## Decisions

- Isolation is fail-closed. No error path can retry with unrestricted system
  loopback.
- A WebView2 process topology change invalidates the active audio snapshot even
  when the browser root is unchanged. A later share may establish a fresh
  proof.
- Application capture receives rejection and regression coverage but no
  redesign.
- This is entirely desktop-local. Supabase, RLS, token issuance, and LiveKit
  server contracts do not change.

## Automated acceptance

- [x] Policy tests cover the WebView2 browser target, selected-application
      inclusion, host/WebView2 application rejection, missing or detached
      process groups, topology invalidation, and fail-closed display audio.
- [x] Renderer tests cover source availability, startup warning propagation,
      and a live audio downgrade that leaves video sharing.
- [x] Pull requests run native Cargo check and tests on a Windows runner.
- [ ] A Windows x64 Tauri bundle and forbidden-secret scan pass on the release
      runner.

## Installed Windows acceptance

- [ ] With the presenter microphone muted, share Entire screen with audio and
      play known external-application audio. Viewer A can speak without hearing
      a delayed copy of their voice.
- [ ] Viewer B sets A's direct participant volume to zero. A becomes silent for
      B while external application audio remains audible, proving A is absent
      from the share track.
- [ ] Repeat on default and explicitly selected output devices, after
      stop/restart, and after source switching.
- [ ] Smoke-test Application sharing: selected-application audio remains
      audible and Bakbak audio remains absent.

## Next

Run the Windows PR job, build the Windows x64 installer, then complete the
three-client installed matrix before closing Phase 5 screen-share acceptance.
