# 0038 — Bakbak Tauri 2.0 reliability upgrade

- **Status:** Source implementation complete; installed release gates pending
- **Approved:** 2026-08-23
- **Target version:** `2.0.0`
- **Supported packages:** Apple Silicon macOS 12.3+ and Windows x64

## Goal

Return Bakbak to a Tauri 2 desktop shell without losing product behavior,
restore fail-closed isolated screen audio, make soundboard playback
single-active, and add an explicitly configured external-call soundboard for
Discord, Meet, and similar applications. Electron remains a temporary fallback
until both installed-platform acceptance matrices pass; source parity alone is
not permission to remove it.

## Accepted implementation

### Reliability baseline

- [x] Fix the existing Deno checks in `message-media-manage` and
      `sticker-manage`.
- [x] Pin Node, pnpm, Rust, and Deno for local development and CI.
- [x] Consolidate CI validation and add frontend, Deno, Rust, policy, packaging,
      and compiled-secret gates where they apply.
- [x] Add focused lifecycle and failure coverage for the desktop adapter,
      soundboard coordinator, native screen helper, and external-audio engine.
- [ ] Record installed startup, channel-switch, voice-connect, installer, and
      steady-state memory baselines on both release platforms. Existing web and
      voice targets remain valid until those measurements are complete.

### Tauri shell parity

- [x] Restore Tauri 2 under `src-tauri` with `com.bakbak.desktop`, macOS 12.3,
      Apple Silicon macOS, and Windows x64 configuration.
- [x] Keep `src/lib/desktop-runtime.ts` as the renderer's sole typed desktop
      boundary and enforce that boundary with an import-contract test.
- [x] Implement single-instance/deep-link handling, secure CSP/protocol
      behavior, validated external links, permission recovery, theme/window
      state, relaunch, menus, updater state, teardown, and crash recovery.
- [x] Preserve macOS traffic-light ownership through a narrow command and use
      Bakbak-rendered Windows minimize, maximize/restore, and close controls.
- [x] Add the tray lifecycle and `Cmd/Ctrl+Shift+B` compact-overlay shortcut.
- [x] Keep ordinary close-as-quit behavior while allowing active external audio
      to continue after the explained first close.
- [ ] Pass the complete installed macOS and Windows shell-parity matrix.
      The smoke pass must include dragging the frameless compact overlay.

### Isolated screen audio

- [x] Package the hardened screen-share helper as a supervised Tauri sidecar.
- [x] Replace Electron-specific helper identity with a host-neutral root/audio
      process contract while retaining the Electron fallback supervisor.
- [x] Preserve entire-screen host-tree exclusion, selected-application
      inclusion, companion LiveKit publication, and video-only fail-closed
      behavior.
- [x] Track the Windows WebView2 audio process and withhold isolated audio until
      its relationship to Bakbak is proven.
- [x] Gate audio by native helper capability: macOS 14.2+ and supported Windows
      build 20348+; older supported macOS remains clearly video-only.
- [x] Preserve source/quality updates, pause/resume, source-ended handling,
      output changes, helper recovery, and one remote playback path.
- [ ] Pass the 30-minute, three-client installed matrix on Apple Silicon macOS
      and Windows x64, including helper failure and no-self/no-duplicate audio.

### Soundboard playback

- [x] Replace the five-sound mixer with a single-active
      `SoundboardPlaybackCoordinator`.
- [x] Implement latest-wins cancellation, de-click stop, stale-completion
      fencing, and an idle recovery state after replacement failure.
- [x] Reuse one LiveKit publication and the existing decode cache rather than
      rebuilding the voice session for every clip.
- [x] Replace count/limit/stop-all contracts with `activeSound | null` and stop
      current, while keeping every ready sound clickable.
- [x] Treat named LiveKit track state as audible truth and data messages as UI
      metadata; use the ordered v2 stop-then-play protocol for the friend group.
- [ ] Complete a coordinated small-group rollout so older clients cannot leave
      stale activity indicators.

### External-call soundboard

- [x] Add a window-independent Rust 48 kHz mono audio engine using stable
      CoreAudio UIDs and WASAPI endpoint IDs.
- [x] Guide users through BlackHole 2ch on macOS or VB-CABLE on Windows; never
      bundle or silently install either driver.
- [x] Provide physical-microphone, cable-render, paired-capture, and headphone
      selection with loop rejection, meters, sound test, and bounded local test
      recording.
- [x] Mix microphone at 100% and one latest-wins sound at 70%, with bounded
      buffers, a soft limiter, and effects-only headphone monitoring.
- [x] Make Bakbak voice and external-call mode mutually exclusive through
      explicit confirmation in both directions.
- [x] Add a compact always-on-top overlay with LIVE/meter/mute, favorites,
      recents, search, current sound/stop, and stop-session controls.
- [x] Release audio on logout, permission/device failure, sleep, explicit stop,
      or quit, and never auto-resume after sleep.
- [x] Keep microphone samples out of storage, network requests, and logs.
- [ ] Pass 30-minute Discord desktop and browser Google Meet sessions on both
      installed platforms, including hot-plug, sleep, permission loss, hidden
      windows, tray stop, and quit.

### Installation and updates

- [x] Version the source and package configuration as `2.0.0`.
- [x] Add a one-time pre-Supabase Tauri generation reset that removes old
      WebView storage, IndexedDB, caches, drafts, layout, and device settings
      without migrating authentication tokens.
- [x] Keep macOS manual-DMG-only while ad-hoc signed, with no automatic updater
      entry; configure Windows for mandatory signed Tauri updater payloads and
      cryptographically verify each renamed payload against the committed
      updater public key before artifact or manifest publication. Prepare and
      validate the helper and renderer without signing secrets, then scope the
      key/password only to the Windows Tauri packaging step with the renderer
      build hook disabled.
- [x] Require the accepted candidate to already contain the exact synchronized
      release version, never mutate source during release, and reuse only a
      draft targeting that exact accepted commit.
- [x] Make the initial Electron-to-Tauri replacement and re-login behavior
      explicit in setup/release guidance.
- [x] Add a private, exact-source Windows base-to-next-patch rehearsal kit with
      verified signed installers, loopback-only update metadata, artifact
      digests, and operator instructions; artifact creation does not satisfy the
      installed update gate.
- [ ] Validate installed Electron → Tauri `2.0.0`, Windows `2.0.0 → 2.0.1`, and
      macOS manual `2.0.0 → 2.0.1` paths.
- [ ] Remove Electron source, preload, dependencies, builder configuration,
      tests, and artifacts only after every installed release gate passes.

## Public and security contracts

- Only `src/lib/desktop-runtime.ts` and its Tauri implementation may expose
  window, updater, overlay/tray, external-audio, and screen-helper operations to
  the renderer. Feature modules never import Tauri APIs directly.
- Native invocations are allowlisted and validate the calling window, session
  state, identifiers, URLs, and bounded payload sizes. Generic commands, paths,
  URLs, and IPC primitives are not renderer APIs.
- The external mixer does not store, upload, or log microphone samples.
- No database schema or public backend API changes are part of this plan.
- The first-party virtual microphone, Intel macOS, Linux, unattended macOS
  updates, native microphone noise suppression, automatic ducking, and
  automatic call-app configuration remain deferred.

## Release gate

`2.0.0` must not be published, and Electron must not be removed, until the
repository checks, pgTAP checks, compiled-secret scan, both installed package
matrices, both 30-minute screen-share sessions, both 30-minute external-audio
sessions, and all three migration/update paths have passed and are recorded in
`docs/progress.md`. “Works on my machine” is still evidence; it is simply not a
shipping certificate.
