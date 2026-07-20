# Plan 0014 — Bakbak Signature shell, Personal DMs, and opt-in live watching

## Status

Implementation is complete in the repository as of 2026-07-19. The additive
database migration, renderer shell, Signature preset, Personal DMs, stream-aware
presence, explicit Watch contract, and automated validation are complete.
Hosted rollout is complete; the installed multi-client acceptance matrix
remains open.

Plan 0015 supersedes the sidebar Watch chip and cross-room pending-watch flow.
LIVE is now informational; a member joins the voice room and chooses a share
tile. The one-remote-share subscription boundary remains in force.

## Accepted scope

- Classic System + Flat + Purple is the update default. The v6 migration resets
  every v5-or-older installation to it once; choices made after that launch
  persist normally. Signature remains the premium fixed private-club option.
- Signature is a fixed dark private-club palette with bundled Cormorant
  Garamond display type, Inter content type, and Bakbak-owned textile/leather
  SVG grain. Texture belongs only to outer furniture and controls.
- Every appearance uses the same application shell:
  - fixed 68 px Personal/Bakbak destination rail;
  - shared 200–360 px context panel, defaulting to 232 px;
  - centre canvas kept at or above 420 px at the 1024 px minimum;
  - shared 200–360 px details panel, defaulting to 240 px;
  - pointer and keyboard resize handles with persisted v2 widths.
- Personal contains canonical one-to-one direct conversations, private
  participant-only messages and read states, separate drafts, optimistic sends,
  incoming sounds, unread state, Realtime updates, and a person-details panel.
- Starting a DM requires shared server membership. An established conversation,
  profile visibility, media visibility, and continued messaging survive later
  membership removal.
- Voice occupant rows show compact profile identity, active-speaker rings, and
  informational LIVE without making profile activation join voice. One timer
  belongs to the occupied room rather than to each person.
- Database LIVE state is advisory and server-wide. The matching LiveKit
  publication is authoritative.
- Remote screen video and source audio remain unsubscribed until an in-room
  share tile is selected. Exactly one remote share may be viewed; switching
  unsubscribes the old share first. Back to grid keeps the selected share
  playing in its tile; person focus, target loss, disconnect, or leave removes
  the subscription.

## Completed implementation

- [x] Add appearance persistence v6 and a parser-blocking Flat Purple Classic
      one-time reset for every older installation.
- [x] Preserve choices made after the v6 reset.
- [x] Bundle Cormorant Garamond plus owned textile and leather grain SVGs.
- [x] Add Signature, Classic, and Signal Red cards with fixed-preset locking.
- [x] Add the destination rail and Personal/server application-space state.
- [x] Add layout persistence v2, dynamic width clamping, pointer capture,
      Arrow/Shift+Arrow/Home/End keyboard behavior, and double-click reset.
- [x] Keep rail, panels, and handles out of focused OS fullscreen.
- [x] Add `direct_conversations`, `direct_messages`, and
      `direct_read_states`, canonical pairing, participant RLS, validated RPCs,
      Realtime publication, and retained profile/media visibility.
- [x] Generalize the renderer around channel/direct conversation targets.
- [x] Add Personal ordering, previews, unread state, drafts, optimistic sends,
      Realtime updates, read synchronization, and person details.
- [x] Preserve InviteGate for accounts with neither membership nor DM history;
      expose a reversible invite action to former members in Personal.
- [x] Add `presence_heartbeats.is_streaming`,
      `heartbeat_presence_v3(server, voice_channel, is_streaming)`, and
      compatibility behavior that clears LIVE from older heartbeat RPCs.
- [x] Add rich server-wide voice occupant rows. Plan 0015 later removed their
      join/switch-and-watch sequencing and Watch chip.
- [x] Replace focus-as-subscription with `watchedScreenShareId`,
      `watchScreenShare`, and `stopWatchingScreenShare`.
- [x] Keep all unwatched remote share publications unsubscribed and local
      presenter previews visible.
- [x] Add frontend and pgTAP coverage for migration, contrast, shell behavior,
      DMs, RLS, presence, resizing, and explicit screen subscription.

## Rollout order

1. [x] Push `202607190001_signature_personal_dms_and_live_presence.sql`.
2. [x] Run linked database lint and confirm synchronized migration history.
3. Run the hosted admin/member/outsider probes.
4. Distribute the renderer after the hosted probes pass.
5. A renderer rollback leaves the new tables and LIVE column inert; older
   clients continue through the existing channel and heartbeat RPCs.

## Open acceptance

- [ ] Run two hosted accounts through creation, ordering, unread/read sync,
      reconnect, sound, membership removal, retained messaging, profile, and
      private media access.
- [ ] Run three installed clients across two voice rooms through server-wide
      informational LIVE, in-room tile selection, one-stream replacement,
      deafen/source audio, pause, stop, failure, and crash expiry under plan
      0015's stricter isolation matrix.
- [ ] Inspect LiveKit statistics to prove an unwatched remote share receives
      zero screen video and zero source audio.
- [ ] Repeat all panel combinations and resize extremes in installed Signature,
      Classic Light/Dark, and Signal Red at 1024×680 and 1280×800.
- [x] Deploy the migration before distributing the renderer.

## Deferred

Group DMs, private calls, attachments, edit/delete, friend requests, blocking,
reporting, account-deletion policy, multi-server navigation, and uploadable
server crests remain outside this plan.
