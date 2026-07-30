# Plan 0033 — Friend-test voice, presence, and media stabilization

- **Status:** Packet A code and automated acceptance complete; Packet A
  installed acceptance and Packets B–E pending
- **Approved:** 2026-07-30
- **Trigger:** Six-person macOS/Windows friend session with participants in
  India and Canada
- **Release boundary:** Complete the work in gated phases and ship it as one
  stabilization release only after the integrated friend-test matrix passes

## Goal

Restore trust in Bakbak's core call and chat paths. A connected listener must
continue hearing every published speaker through reconnects, the channel tree
and call gallery must agree about who is in voice, private image attachments
must survive paste/upload/navigation/restart for every authorized recipient,
and quiet speakers must have a safe listener-owned boost above unity gain.

This plan records the reported incident as four separate failure boundaries.
IndexedDB may preserve an invalid media poster, but it is not treated as a
shared root cause for voice, presence, and media.

## Incident evidence and current boundaries

- In a six-person call, individual listeners intermittently stopped hearing
  one speaker while other listeners continued to hear that speaker. Rejoining
  restored audio.
- The call gallery showed five LiveKit participants while the channel-tree
  heartbeat list showed four. The heartbeat query and renderer list currently
  have no deterministic order.
- Windows paste handling reads `ClipboardEvent.clipboardData.files` only.
- An upload can render from its optimistic local object URL, then show a broken
  image after channel navigation when the private persisted poster path is
  used. Recipients can also receive the broken result.
- Remote participant volume is clamped to the HTML media-element ceiling of
  `1`, so the current slider cannot provide a true 200% boost.

## Delivery decisions

- Do not implement this as one cross-cutting patch. Each phase receives its own
  focused tests, reviewable diff, progress entry, and installed acceptance
  evidence.
- Phases B and C may run in parallel after this plan lands. Phase D must start
  only after Phase A establishes a stable remote-audio lifecycle because both
  touch the playback path.
- Merge or integrate the phases into one stabilization release candidate.
  Passing a unit test or creating a file does not complete an installed
  acceptance item.
- Diagnostic records must exclude tokens, authorization headers, invite codes,
  user-entered message content, microphone samples, and secret values.
  Ephemeral participant/track identifiers and bounded WebRTC health metrics are
  permitted.
- Do not change Supabase schemas, Storage policies, or LiveKit token grants
  without evidence that the current backend contract is responsible.
- Preserve the existing v1 exclusions. This plan does not add recording,
  server-side audio processing, global push-to-talk, or media transcoding.

## Agent work packets

| Packet                        | Priority | Primary ownership                                                    | Dependency | Parallel rule                                             |
| ----------------------------- | -------- | -------------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| A — Voice continuity          | P0       | LiveKit room lifecycle, remote-audio renderer, voice diagnostics     | None       | Lands before D                                            |
| B — Presence consistency      | P1       | Presence service, active-room occupancy selector, channel tree       | None       | May run with A/C if it avoids A's voice hook internals    |
| C — Private-image reliability | P1       | Clipboard ingestion, message-media retrieval, poster cache/rendering | None       | May run with A/B                                          |
| D — Loudness and 200% gain    | P2       | Remote playback graph and microphone A/B measurement                 | A          | Never edits the remote-audio renderer concurrently with A |
| E — Integrated release gate   | P0       | Installed builds and multi-client acceptance                         | A, B, C, D | Runs after all packets integrate                          |

Every agent starts with `AGENTS.md`, `docs/architecture.md`, the newest
`docs/progress.md` entry, this plan, and the active phase in plan 0001. An agent
must preserve unrelated changes, run applicable checks, and append the
canonical progress entry before handoff.

## Phase A — Voice continuity and diagnostics

### Scope

- [x] Upgrade `livekit-client` from 2.20.1 to a current compatible release that
      contains the buffered-resume event fix; update only through `pnpm` and
      record the resolved version. Resolved: 2.21.0.
- [x] Reconcile every remote participant's currently subscribed speech track
      after initial connection, signal resume, full reconnect, and output-device
      changes instead of relying only on a future `TrackSubscribed` event.
- [x] Make reconciliation idempotent: one publication owns at most one audio
      path, unsubscribe/participant departure always detaches it, and a late
      stale event cannot revive it.
- [x] Handle and surface subscription failure, subscription-status changes,
      track stream-state changes, media-element pause/stall/error/end, and
      browser autoplay rejection with a bounded recovery path.
- [x] Add an in-memory, copyable voice diagnostic snapshot with connection
      state, signal state, participant/track IDs, subscribed/muted/stream state,
      audio-element state, inbound bytes/packets, packet loss, jitter, and
      round-trip data when supported.
- [x] Preserve the snapshot locally until the user copies it. Do not transmit
      diagnostics automatically or include display names, tokens, device
      labels, or audio.

### Automated acceptance

- [x] A subscribed publication present after a missed subscription event is
      attached during reconciliation.
- [x] Repeated reconnect/reconcile events do not create duplicate elements or
      duplicate playback.
- [x] Unsubscribe, participant departure, room replacement, and unmount remove
      every owned audio path.
- [x] Stalled/error/autoplay and failed-subscription cases produce bounded,
      actionable recovery without an infinite retry loop.
- [x] Focused reconnect tests cover signal-only resume and full transport
      reconnect independently.

### Installed acceptance

- [ ] Run at least six clients across the available India/Canada routes, with
      both macOS and Windows represented, for 60 minutes.
- [ ] During the run, exercise one brief network interruption or interface
      handoff per platform, background/game focus, mute/unmute, and an output
      device change.
- [ ] No listener loses an otherwise published speaker. If a failure occurs,
      capture diagnostics from one affected and one unaffected listener before
      rejoining.
- [ ] Classify any failure from evidence: no inbound packets is
      transport/subscription; inbound packets with silent playback is local
      rendering/output; missing publication state is signaling/reconciliation.

## Phase B — Voice presence consistency

### Scope

- [ ] Introduce one selector/service contract for sidebar voice occupants.
- [ ] While the local client is connected to a room, use the current LiveKit
      roster as the authority for that active room. During a reconnect, retain
      the last confirmed roster until recovery or terminal disconnect.
- [ ] Continue using fresh Supabase heartbeat presence for rooms the local
      client has not joined. Do not use IndexedDB as presence authority.
- [ ] Resolve roster identities through current membership/profile data and
      deduplicate by user ID.
- [ ] Sort every room by normalized display name and then stable user ID so
      refreshes cannot reshuffle unchanged occupants.
- [ ] Serialize or queue overlapping heartbeat refreshes so an older response
      cannot replace newer state.
- [ ] Keep the existing privacy boundary: members see only presence for servers
      they can access.

### Automated acceptance

- [ ] The active-room sidebar and LiveKit gallery expose the same connected
      user IDs.
- [ ] A heartbeat-expired but currently connected participant remains visible
      in the active room.
- [ ] A stale heartbeat does not leave a ghost in the active room after
      LiveKit confirms departure.
- [ ] Other-room heartbeat occupants still render without joining those rooms.
- [ ] Identical occupants keep identical order across refresh, Realtime,
      reconnect, profile hydration, and category collapse/expand.
- [ ] An older delayed refresh cannot overwrite a newer refresh.

### Installed acceptance

- [ ] With six clients, compare the gallery and channel tree during join,
      leave, reconnect, app backgrounding, game focus, and channel switching.
- [ ] Confirm exact membership agreement and stable ordering on macOS and
      Windows without clearing local data.

## Phase C — Windows paste and private-image reliability

### Scope

- [ ] Normalize clipboard images from both `clipboardData.files` and
      `clipboardData.items`, use `getAsFile()` for file-kind items, deduplicate
      equivalent entries, and preserve the existing count/type/size limits.
- [ ] Add focused Windows-compatible paste fixtures for PNG, JPEG, WebP, an
      unsupported clipboard item, text plus image, and duplicate file/item
      exposure.
- [ ] Model poster retrieval outcomes explicitly: offline, unauthenticated,
      forbidden, missing object, invalid/empty blob, decode failure, and
      transient transport failure.
- [ ] Validate a poster's non-zero size, allowed MIME type, and image decoding
      before accepting it into the authenticated cache.
- [ ] On cached-poster decode failure, revoke its object URL, evict that cache
      entry, and attempt one authenticated fresh download. Never retry
      indefinitely.
- [ ] Add an image error state with Retry and useful sanitized diagnostics.
      Do not leave a bare broken-image element or log signed URLs/session data.
- [ ] Ensure optimistic object URLs remain alive until the persisted poster has
      loaded or the optimistic message is removed, then revoke them exactly
      once.
- [ ] Exercise the real private Storage API and RLS path with two authenticated
      accounts; database row tests alone do not prove object download.

### Automated acceptance

- [ ] Clipboard file and item representations produce the same staged image
      without duplicates.
- [ ] Navigation and rerender replace an optimistic preview with the persisted
      poster without a blank or revoked frame.
- [ ] Valid cached posters render; invalid cached posters evict and retry once;
      failed fresh posters show the explicit recovery state.
- [ ] Object URLs are revoked on replacement/unmount without revoking active
      previews.
- [ ] Unauthorized users cannot fetch or cache private message media.

### Installed acceptance

- [ ] On Windows, paste screenshots from the clipboard and upload images from
      disk in a channel and a DM.
- [ ] On macOS, repeat paste and file upload in a channel and a DM.
- [ ] For both senders and another authorized recipient, switch away and back,
      restart Bakbak, test once from warm cache and once after clearing only
      local Bakbak data, and confirm every image still renders.
- [ ] Record Storage response class, content type, byte size, and decode result
      for any failure without recording the signed URL or authorization data.

## Phase D — Loudness measurement and safe 200% gain

### Scope

- [ ] First measure repeatable microphone level before and after browser voice
      processing/RNNoise on representative quiet, normal, and noisy microphones
      on macOS and Windows.
- [ ] Keep RNNoise or capture-default changes evidence-driven. Do not globally
      raise sender gain as a substitute for repairing listener playback.
- [ ] Route remote speech through a listener-owned Web Audio graph that supports
      `0%` through `200%`, with `100%` as unity gain.
- [ ] Add a limiter or equivalent bounded headroom after gain so 200% cannot
      produce uncontrolled clipping.
- [ ] Keep mute, deafen, participant departure, late subscription, output
      switching, soundboard multiplication, and watched-share behavior
      consistent with the existing ownership model.
- [ ] Keep participant gain listener-local and do not publish it to other
      members.

### Automated acceptance

- [ ] Remote speech produces expected gain at 0%, 50%, 100%, 150%, and 200%.
- [ ] Limiting prevents samples from exceeding the output ceiling under boosted
      speech.
- [ ] Local participant mute restores the last non-zero gain, including values
      above 100%.
- [ ] Late/reconciled tracks inherit the selected gain exactly once.
- [ ] Soundboard and watched-share gain multiplication remains covered and
      cannot accidentally receive speech boost twice.

### Installed acceptance

- [ ] Compare RNNoise off/on and the resolved capture constraints with
      repeatable speech, fan, keyboard, and laptop-distance samples.
- [ ] Verify 0%, 50%, 100%, 150%, and 200% on quiet and normal speakers using
      headphones, then check laptop speakers for clipping and echo risk.
- [ ] Confirm the boost improves a quiet participant but cannot hide or
      reintroduce the Phase A selective-silence failure.

## Phase E — Integrated stabilization release gate

- [ ] Integrate A–D only after their focused automated suites pass.
- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
      `pnpm build`, applicable Rust/native checks, `pnpm tauri build`, bundle
      secret inspection, and `git diff --check`.
- [ ] Produce installed Apple Silicon macOS and Windows x64 candidates from the
      same source revision.
- [ ] Complete one six-person, 60-minute cross-region session covering normal
      conversation, game focus, reconnect, presence ordering, Windows/macOS
      paste, channel switching, restart, and participant gain.
- [ ] Record every participant's platform/app version and only sanitized
      outcome summaries. Do not record voice or message content.
- [ ] Release only when there is no selective silence, the active-room lists
      agree, unchanged occupants do not reorder, authorized images survive
      navigation/restart, and 200% gain behaves safely.

## Agent handoff template

Each packet handoff appends one `docs/progress.md` entry containing:

- the packet and acceptance items completed;
- decisions and rationale;
- exact automated and installed validation outcomes;
- documentation changed;
- failures, skipped platforms, or observations still required;
- the source revision used for installed clients; and
- the next unblocked packet or release-gate step.

## Next

Run Packet A's installed six-client macOS/Windows network-handoff matrix and
capture sanitized diagnostics before rejoining if selective silence recurs.
Packets B and C can proceed independently. Packet D may begin after this Packet
A change is integrated, then Packet E runs from one integrated source
revision.
