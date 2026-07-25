# 0029 — Simpler chat and reliable voice input

- **Status:** Implemented; installed acceptance pending
- **Approved:** 2026-07-25
- **Scope:** Renderer UI, local microphone capture, and device-local
  preferences
- **Backend impact:** None

## Summary

Make selected rooms unmistakable, remove the decorative conversation trail,
limit circular avatars to chat authors, make connected microphone changes
transactional, retire Voice Lab effects, and add an honest opt-in macOS capture
workaround for system-audio attenuation while keeping echo-safe defaults.

This plan supersedes plan 0013's Child, Robot, Natural, and Walkie-talkie Voice
Lab effects, plan 0025's conversation rails and branches, and plan 0027's
neutral-only selected-room treatment. It retains the connector tree, channel
and DM introductions, rich-message behavior, RNNoise cleanup, WebRTC fallback,
and all backend/LiveKit protocol contracts.

## Implementation contract

### Selected channels

- Selected text and voice channels use a persistent soft accent pill with a
  thin accent outline, brighter room icon and label, and a distinct active
  hover/focus treatment.
- Selected rows expose `aria-current="page"`.
- The existing connector tree, unread state, occupancy, and collapsed summaries
  remain intact. The retired accent stripe does not return.

### Simple conversations

- Channel and DM welcome introductions remain.
- Empty conversations show a compact accessible `No messages yet` status with
  channel- or person-specific first-message copy.
- Quiet/Flowing badges, rails, branches, grouped-message dots, terminal markers,
  and decorative empty branches are removed from empty and populated threads.
- Only chat-author avatars and their profile triggers become circular. Member,
  profile, sidebar, and participant avatar geometry is unchanged.

### Microphone capture

- A connected input change restarts the existing named
  `bakbak-microphone` `LocalAudioTrack` with the complete capture options.
- Restart operations are serialized and disable input controls while pending.
  LiveKit preserves mute state and restarts an attached RNNoise processor
  against the new source.
- The device and capture preference commit only after successful capture.
  Failure triggers one restart of the previous complete option set, with
  distinct messages for recovered rollback and failed rollback.
- A result from a room that has been left or replaced is stale and cannot
  commit. The redundant `setMicrophoneEnabled` switch is removed.

### Cleanup and macOS full-volume mode

- `MicrophoneProcessingPreferences` contains only
  `enhancedNoiseSuppression`. Voice effect DSP, state, settings, and props are
  removed.
- Bakbak noise cleanup remains default-on. Unsupported or failed RNNoise uses
  the built-in WebRTC cleanup without blocking capture.
- `bakbak.devicePreferences.v3` stores device IDs, soundboard volume, cleanup,
  and `macosKeepOtherAudioFullVolume`. v1/v2 values migrate, legacy
  `voiceEffect` is ignored, and the new option defaults to `false`.
- Installed macOS alone shows `Keep other audio at full volume` with a
  headphones/echo warning. Off captures with echo cancellation; on captures
  with `echoCancellation: false` while retaining noise suppression, automatic
  gain control, and RNNoise.
- The mode applies to mic tests, future joins, active calls, and later device
  switches without reconnecting. Changing the device or mode first stops an
  active mic test.
- Other platforms always keep echo cancellation and hide the option.

## Acceptance

### Automated

- [x] Selected rows expose current-page semantics and retain collapsed/unread
      behavior.
- [x] Channel and DM empty/populated layouts omit every retired trail element
      and preserve existing message features.
- [x] v1/v2 device preferences migrate to v3, discarding effects and defaulting
      to speaker-safe mode.
- [x] Connected microphone tests cover success, muted operation,
      serialization, rollback, failed rollback, and stale-room results.
- [x] Settings tests cover cleanup-only controls, macOS visibility and copy,
      other-platform hiding, and mic-test capture constraints.

### Installed/manual

- [ ] On installed macOS with built-in microphone and speakers, confirm
      speaker-safe mode prevents call echo.
- [ ] Confirm full-volume mode avoids sustained non-call audio reduction; a
      brief interruption while capture starts is acceptable.
- [ ] Switch between two microphones during active, muted, and unmuted calls.
- [ ] Complete a two-client echo/noise intelligibility check.
- [ ] Repeat microphone switching on Windows and confirm the macOS control is
      absent.
- [ ] Inspect light/dark channel and chat layouts at 1280×800 and 1024×680.

## Constraints

- RNNoise reduces background noise but is not acoustic echo cancellation, so
  full-volume mode is deliberately opt-in and carries a headphones warning.
- No database, token, Edge Function, Supabase policy, or LiveKit protocol
  changes are part of this plan.
