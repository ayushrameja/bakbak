# 0002 — Voice, video, and room presence

- **Status:** Active
- **Approved:** 2026-07-11
- **Depends on:** `0001-bakbak-desktop-v1.md`

## Goal

Turn Bakbak voice rooms into lightweight calls with locally remembered input,
output, and camera devices; opt-in camera publishing; and server-visible voice
occupancy with per-member elapsed time before a user joins.

## Accepted behavior

- Camera is off by default and has no pre-join preview.
- The selected output routes incoming call audio and soundboard playback. Chat
  alerts continue to use system output.
- Microphone, speaker, and camera device IDs persist only in local storage and
  fall back to system defaults when unavailable.
- Every server member can see active voice-room occupants and their elapsed
  join duration. Graceful leave clears immediately; crashed clients expire with
  the existing heartbeat timeout.
- Voice participant tokens permit microphone, camera, data, and video-only
  screen publication for the compatibility fallback. Native screen companions
  and their stricter grants are owned by `0003-screen-sharing.md`; recording,
  camera effects, and cloud device preferences remain excluded.

## Completion criteria

- [x] Add backward-compatible, RLS-tested voice occupancy heartbeats.
- [x] Add capability-aware output selection for call and soundboard audio.
- [x] Add locally persisted microphone, output, and camera preferences.
- [x] Add opt-in 720p camera publishing and participant video rendering.
- [x] Add pre-join voice occupancy and per-member elapsed timers.
- [ ] Validate Arc plus installed macOS app with two accounts.
- [x] Deploy migration and token function, then build and install the app.
- [x] Update architecture and append the canonical progress entry.
