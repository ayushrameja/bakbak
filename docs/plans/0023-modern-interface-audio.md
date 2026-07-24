# 0023 — Modern interface audio

- **Status:** Implemented; automated validation complete, installed
  multi-client auditory acceptance pending
- **Approved:** 2026-07-24
- **Target users:** The existing private group of 5–10 friends
- **Compatibility boundary:** Renderer and bundled interface assets only; no
  Supabase, LiveKit protocol, native command, preference migration, soundboard,
  microphone-processing, or voice-effect changes

## Goal

Replace Bakbak's retro communication cues with one original, soft, rounded
sound language that stays useful and low-fatigue during long calls. The pack
may feel familiar to modern communication apps without copying Discord or any
third-party recording.

## Accepted behavior

- [x] Generate deterministic 48 kHz, 16-bit mono WAVs for message send/receive,
      microphone mute/unmute, self/remote voice join/leave, local/remote
      screen-share start/stop, reconnect success, and communication failure.
- [x] Use discrete sine plucks with a quiet second harmonic, rounded envelopes,
      approximately -6 dBFS peaks, and no square waves, triangle waves, grit,
      samples, or continuous arcade-style chirps.
- [x] Play the outgoing-message cue once only after a channel or DM message
      commits successfully, including rich-media sends.
- [x] Play microphone mute/unmute cues only after the local publication and
      application state change succeed.
- [x] Preserve initial-roster/share baselining, remote churn batching, remote
      share gain reduction, deafen suppression, concurrency, system-output
      routing, and the four existing Settings categories.
- [x] Treat a remote screen-share entry as another participant beginning to
      present; watching/subscription changes remain silent.
- [x] Keep the existing device-local preference key and defaults without a
      migration.

## Fixed sound contract

| Cue                   | Duration | Tonal direction    | Controller gain |
| --------------------- | -------- | ------------------ | --------------- |
| Message sent          | 120 ms   | 620 → 880 Hz       | 0.62            |
| Message received      | 160 ms   | 740 → 990 Hz       | 0.72            |
| Microphone mute       | 150 ms   | 620 → 440 Hz       | 0.76            |
| Microphone unmute     | 150 ms   | 440 → 620 Hz       | 0.76            |
| Self voice join       | 340 ms   | 262 → 330 → 392 Hz | 0.84            |
| Self voice leave      | 280 ms   | 392 → 330 → 262 Hz | 0.78            |
| Remote voice join     | 190 ms   | 330 → 440 Hz       | 0.58            |
| Remote voice leave    | 180 ms   | 440 → 330 Hz       | 0.54            |
| Screen-share start    | 380 ms   | 392 → 523 → 659 Hz | 0.78            |
| Screen-share stop     | 300 ms   | 659 → 523 → 392 Hz | 0.70            |
| Reconnect success     | 300 ms   | 440 → 554 → 659 Hz | 0.76            |
| Communication failure | 320 ms   | 247 → 220 Hz       | 0.72            |

Remote screen-share cues retain the additional 0.62 gain scale. Message receive
retains its 350 ms cooldown, communication failure retains two seconds, and
message send uses 120 ms.

## Validation

- [x] Verify the committed pack matches deterministic generator output, exact
      names and durations, PCM format, fades, peak bounds, and the 1 MB ceiling.
- [x] Test all twelve controller mappings, gains, activation, category controls,
      send throttling, concurrency, batching, deafen behavior, and failure
      fallback.
- [x] Test successful channel/DM send cues, failed-send silence, successful
      mute/unmute cues, and failed-mute silence.
- [x] Pass the repository check, locked Cargo check, bundle secret scan, and
      local ARM64 macOS application build.
- [ ] Run installed macOS and Windows two-client auditory QA for rapid messages,
      roster churn, mute/unmute, screen sharing, reconnect, deafen, headphones,
      and distinct system/call outputs.
