# 0013 — Local microphone processing and voice lab

- **Status:** Implemented; installed two-client audio verification pending
- **Approved:** 2026-07-18
- **Scope:** Add stronger on-device microphone noise suppression and optional
  outgoing voice effects without changing LiveKit or soundboard contracts

## Goal

Reduce keyboard and steady room noise beyond the browser's built-in microphone
constraints, while giving the private group a small opt-in voice-effects lab.
Microphone audio must remain on-device until the already-authorized LiveKit
publication, and a processing failure must not prevent joining a call.

## Decisions

- Keep WebRTC echo cancellation, noise suppression, and automatic gain control
  enabled. Enhanced cleanup is a second local stage, not a replacement for the
  platform's echo control.
- Run RNNoise 0.2 WebAssembly in a dedicated 48 kHz `AudioWorklet`. Buffer the
  worklet's 128-sample render quanta into RNNoise's 480-sample frames off the
  React/UI thread.
- Default enhanced cleanup to on and voice effects to Natural. Persist
  `{ enhancedNoiseSuppression, voiceEffect }` with the existing device
  preferences and migrate valid v1 values into v2.
- Offer Child (pitch shift), Robot (ring modulation), and Walkie-talkie
  (band-limited saturation) as sender-side microphone effects. They affect the
  named speech track only; soundboard audio remains unchanged.
- Apply changes to an active microphone without reconnecting. Reuse the
  processor when switching input devices or voice rooms.
- If AudioWorklet/RNNoise initialization is unsupported or fails, keep the raw
  microphone with built-in WebRTC cleanup, show a non-fatal Settings warning,
  and allow the call to continue.
- Bundle the processor and model locally. No microphone samples are sent to a
  cloud noise-removal service.

## Acceptance

- [x] Add a LiveKit-compatible microphone processor with explicit init,
      restart, preference-update, and teardown behavior.
- [x] Run RNNoise and all voice effects in an AudioWorklet rather than the UI
      thread.
- [x] Preserve the named `bakbak-microphone` publication and independent
      `bakbak-soundboard` path.
- [x] Add persisted Settings controls for enhanced cleanup and Natural, Child,
      Robot, and Walkie-talkie modes.
- [x] Make the explicit microphone test monitor the selected processing
      pipeline through the selected speaker, render its meter, refresh named
      devices after permission, and release every temporary track/context on
      stop or unmount.
- [x] Keep joins usable through an unsupported-runtime or processor failure.
- [x] Add preference migration, capability, capture-constraint, and Settings
      interaction tests.
- [x] Bundle attribution and license texts for Jitsi's WebAssembly wrapper and
      Xiph.Org RNNoise.
- [ ] Verify keyboard rejection, speech intelligibility, effect changes,
      microphone switching, mute, direct room switching, and cleanup with two
      installed clients on macOS.
- [ ] Repeat the installed two-client smoke test on Windows x64 before the
      friend-test build.

## Deferred

- Training or shipping a Bakbak-specific neural model
- Cloud speech enhancement or recording microphone samples
- Voice cloning, identity imitation, or biometric voice transformation
- Per-participant receiver-side effects
- Automatic environmental mode selection
