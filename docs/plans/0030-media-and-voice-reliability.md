# Plan 0030 — Media and voice reliability

## Goal

Close the six friend-test regressions without broadening the backend contract:
screen audio must not return Bakbak's call, Windows capture must fail safely
when a game supplies black/cursor-only frames, listener volume must control
real playback, RNNoise state must reflect runtime truth, macOS fullscreen must
always roll back, and `Keep other audio at full volume` must default on.

## Implemented scope

- [x] Give every hidden remote-audio element an owner, source kind, and base
      gain. Apply participant gain to speech and watched-share audio and apply
      participant × global soundboard gain to soundboard audio, including late
      subscriptions.
- [x] Keep participant volume in one listener-local session map. Give the
      participant card a separate focus button and a continuous, keyboard
      accessible volume range that cannot activate focus.
- [x] Add `off`, `starting`, `active`, and `fallback-error` microphone
      processing states. Require AudioWorklet `ready` and configuration
      acknowledgements before committing On, restore the original sender when
      disabling or after processor failure, and surface rollback failure.
- [x] Extract and test the deterministic 128-sample Web Audio to 480-sample
      RNNoise bridge. Keep the installed processed-microphone A/B monitor.
- [x] Migrate device preferences to `bakbak.devicePreferences.v4`, default
      `macosKeepOtherAudioFullVolume` on, and migrate every legacy v3 false to
      true once while preserving subsequent v4 choices.
- [x] On macOS 14.2+, include only the selected application's proven process
      tree or exclude Bakbak's proven process tree for display capture, refresh
      the filter when process topology changes, and remain video-only when the
      isolation policy cannot be proven. macOS 14.0–14.1 and older supported
      systems remain video-only.
- [x] On Windows, require a proven Bakbak process-tree root before display
      loopback, check the cursor-capture API result, return focus to application
      capture best-effort, and stop sustained black/cursor-only application
      capture with a one-click Entire screen recovery and Borderless Windowed
      guidance. No injection, hooks, or anti-cheat-sensitive technique is used.
- [x] Return stable native failures and sanitized diagnostics containing only
      OS/build, source kind, backend, cursor capability, isolation mode, and
      failure code.
- [x] On macOS, replace Space-based fullscreen with an opaque stage plus Tauri
      simple fullscreen. Serialize transitions, bound them with rollback, and
      restore the native glass effect for Back, Escape, target loss,
      disconnect, and unmount. Windows retains native fullscreen.

## Decisions

- The macOS native implementation uses ScreenCaptureKit's process-filtered
  audio path and refreshes its content filter after topology changes. A
  separate Core Audio process-tap transport is not introduced in this change;
  installed two-client isolation remains the evidence required before release.
- Application capture is allowed to fail closed. Valorant support guarantees
  the safer Entire screen plus Borderless Windowed recovery path, not exclusive
  fullscreen capture or a game hook.
- `Keep other audio at full volume` disables only macOS echo cancellation.
  Browser noise suppression, automatic gain control, and RNNoise stay enabled;
  the headphone/echo warning remains because RNNoise is not acoustic echo
  cancellation.
- There are no Supabase schema, token, RLS, or LiveKit server-contract changes.

## Automated acceptance

- [x] Actual audio-element volume covers 100%, 50%, and 0%, late tracks, screen
      audio, and soundboard multiplication.
- [x] Slider input and keyboard adjustment do not trigger participant focus.
- [x] RNNoise ready/configure/error, sender restore, frame wrapping, and
      preference migration have focused tests.
- [x] Process inclusion/exclusion, black-frame classification, structured
      recovery, sanitized diagnostics, fullscreen sequencing/rollback, and
      effect restoration have focused tests.
- [x] Pass the final repository, native, local app bundle, diff, and secret checks
      recorded in `docs/progress.md`.

## Installed acceptance

- [ ] On installed macOS and Windows clients, mute the presenter microphone,
      let the viewer speak, and confirm the viewer's voice never returns through
      shared audio while target audio remains audible.
- [ ] Verify remote speech, soundboard, and watched-share audio at 100%, 50%,
      and 0%.
- [ ] Compare RNNoise off/on with repeatable fan and keyboard noise.
- [ ] Test Valorant Application and Entire screen capture in Borderless
      Windowed; Entire screen must include game pixels and cursor.
- [ ] Enter/exit macOS fullscreen ten times, then test Escape, Back, stream
      loss, and disconnect without a black frame or app lockup.

## Next

Run the installed two-client macOS matrix and the Windows CI/friend-test matrix,
then close the remaining acceptance items only from observed results.
