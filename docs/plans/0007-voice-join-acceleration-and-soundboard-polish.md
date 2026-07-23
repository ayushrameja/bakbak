# 0007 — Voice join acceleration and soundboard polish

- **Status:** Implemented with hosted backend deployed; automated and
  mock-browser validation complete, authenticated live probes and two-account
  timing acceptance pending
- **Approved:** 2026-07-14
- **Target users:** The existing private group of 5–10 friends
- **Compatibility boundary:** Preserve the token response, LiveKit grants,
  soundboard messages, audio routing, and the soundboard-publication connection
  gate

## Goal

Make a voice-room click feel immediate even when the network still needs a
moment. Warm joins target 1.5 seconds or less and cold joins target 3 seconds or
less, excluding first-time operating-system permission prompts and relay
fallback. Blank canvases have been dismissed for chronic absenteeism.

## Joining performance

- [x] Prewarm the public LiveKit endpoint when a live workspace loads.
- [x] After 150 ms pointer hover or keyboard focus, request one voice token and
      prepare a single candidate `Room` for the newest channel only.
- [x] Reuse the prepared room and in-flight token request on click, reject
      tokens inside the final 30 seconds of their five-minute lifetime, and
      dispose stale preparation on another channel, leave, sign-out, or
      teardown.
- [x] Keep preparation side-effect free: no microphone request, presence
      update, or room connection occurs before the click.
- [x] Verify the caller with Supabase `getClaims` and replace the token
      function's serial authorization lookups with the RLS-protected,
      security-invoker `get_voice_join_context(channel_id)` RPC.
- [x] Start microphone creation concurrently with authorization/connection,
      then publish only after LiveKit connects.
- [x] Reuse the existing microphone track for direct room switching, preserve
      mute/deafen state, and stop the track on Leave, failed switching,
      sign-out, or teardown.
- [x] Prepare output routing and soundboard publication concurrently with
      microphone publication after connection. Continue awaiting the protected
      soundboard step before reporting `connected`.
- [x] Remember a successful relay fallback for ten minutes in memory, try relay
      first during that window, retry direct when relay-first fails, and return
      to direct probing after expiry.
- [x] Emit development-only stage timings without tokens, user IDs, or channel
      IDs.

## Joining and participant UI

- [x] Show an accessible centered loader with channel and normalized stage text
      while connecting, and the same compact treatment while reconnecting.
- [x] Keep voice-channel auto-join with no Join button, hero card, or “Join
      quietly” surface.
- [x] Size one participant to about 420×260 maximum, two participants to about
      360×240 each with responsive stacking, and larger calls as an equal grid.
- [x] Use roughly 112 px avatars for one/two-person calls, 96 px avatars in
      larger grids, and smaller avatars in the screen-share strip.
- [x] Replace a camera-off avatar with the newest active sound emoji; overlay
      the emoji on camera video, show `N/5` for overlap, restore the next-newest
      emoji as clips finish, and reduce animation under reduced motion.
- [x] Preserve the featured-share stage, presenter switching, compact
      participant strip, and existing audio-routing behavior.

## Five-sound limit and stopping controls

- [x] Share `MAX_CONCURRENT_SOUNDS_PER_USER = 5` across the controller and UI.
- [x] Reserve activity before asynchronous playback so pending starts count,
      reject a sixth sound before asset work or publication, and roll back every
      failed start path.
- [x] Allow repeated sounds, re-enable playback as soon as any sound finishes
      or fails, and defensively render only the newest five remote activities
      from older clients.
- [x] Add a standalone bottom-right soundboard stop action over a
      theme-responsive corner fade, with `N/5` immediately to its left and no
      dedicated footer row.
- [x] Add the same emergency stop to the global voice dock and pin the dock
      while local sounds are active.
- [x] Keep both controls on the existing immediate local clear plus reliable
      `soundboard:stop-all` path, and cancel pending local starts before they
      can resume playback or publish activity.

## Backend and compatibility

- [x] Add the migration
      `202607140001_voice_join_context.sql` without destructive schema changes.
- [x] Keep token endpoint inputs/outputs, not-found behavior, LiveKit grants,
      presence, screen capture, soundboard data messages, and audio routing
      compatible.
- [x] Keep the five-sound rule sender-enforced. Upgraded receivers clamp UI
      activity to the newest five; older installed clients can still transmit
      more until upgraded.
- [x] Deploy the migration and updated `livekit-token` function to the hosted
      project. Confirm matching migration history, ACTIVE function version 5
      with JWT verification enabled, an unauthenticated function 401, and an
      anonymous RPC 401.
- [ ] Repeat authenticated member/non-member token probes using existing test
      sessions; do not create durable users merely for deployment verification.

## Validation

- [x] Focused renderer tests cover preparation debounce/cache/expiry/cleanup,
      click-before-prefetch completion, generation guards, microphone
      creation/reuse/cleanup, relay preference, soundboard-gated connection,
      loader stages, tile layouts, emoji treatment, the five-sound reservation,
      failure rollback, remote clamping, and both stop controls.
- [x] Deno tests cover verified-claims acceptance plus malformed,
      unverified, and invalid-subject rejection.
- [x] A pgTAP suite covers RPC grants, voice/text filtering, member display
      name derivation, outsider denial, and cross-server denial. Running it
      still requires a local Supabase stack or hosted test project.
- [x] Mock-browser QA covers 1024×680 and 1280×800 connecting feedback,
      participant sizing, Flat/Warm and Light/Dark representatives, all four
      panel combinations, the five-sound cap, both stop controls, soundboard
      clipping, and page overflow.
- [ ] Measure warm and cold joins against the targets on the real hosted path.
- [ ] Run the browser-plus-native two-account rehearsal with human audio/media
      observation, direct switching, five overlapping sounds, stop-all,
      reconnect, and Leave.
- [ ] Run the updater-enabled Tauri build when protected signing credentials
      are available. Local app-only build results belong in
      `docs/progress.md`.
