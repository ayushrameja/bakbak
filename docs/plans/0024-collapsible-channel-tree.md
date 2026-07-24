# 0024 — Collapsible channel tree

- **Status:** Implemented; automated and mock-browser validation complete,
  installed desktop observation pending
- **Approved:** 2026-07-24
- **Compatibility boundary:** Renderer-only channel navigation and
  device-local preferences; no Supabase schema, RLS, Realtime, message, voice,
  or channel-management contract changes

## Goal

Turn the server channel shelf into a compact Apple-style disclosure tree while
preserving the existing ordered mix of text and voice rooms, channel activity,
voice occupants, and admin controls.

## Accepted behavior

- [x] Render every category with an accessible disclosure button, rotating
      chevron, vertical tree rail, horizontal branches, and a rounded terminal
      branch.
- [x] Retain hash and speaker room icons, mixed position ordering, selected and
      unread states, voice preparation, room timers, occupants, speaking rings,
      LIVE labels, profiles, and admin create/rename controls.
- [x] Keep a collapsed category closed when a contained room is selected,
      becomes unread, or gains voice occupants.
- [x] Summarize hidden state on the category header through selected styling,
      an unread indicator, and total voice-occupant count.
- [x] Apply the same disclosure behavior to the synthetic Conversations and
      Voice rooms groups used for uncategorized admin-created rooms.
- [x] Default every group to expanded and persist boolean collapse state per
      server and device under
      `bakbak.channelCategories.v1:<server ID>`.
- [x] Ignore malformed values, stale group IDs, and unavailable local storage;
      newly introduced groups default to expanded.
- [x] Disable disclosure motion under `prefers-reduced-motion`.

## Validation

- [x] Cover disclosure interaction, hidden-child inertness, category ordering,
      summaries, synthetic groups, persistence, server isolation, malformed
      storage, and existing text/voice behavior with focused tests.
- [x] Lock connector and reduced-motion CSS into a Node contract test.
- [x] Inspect expanded and collapsed layouts in mock mode at 1280×800 and
      1024×680 in light and dark schemes, including terminal branches,
      contained scrolling, selected state, and zero document overflow.
- [x] Pass the repository check and local Apple Silicon application build.
- [ ] Observe the rebuilt tree once in the installed macOS app and on the next
      Windows build with native material active.

## Out of scope

- Backend or account-synced preference storage
- Category create, rename, reorder, or delete controls
- Channel-level permission changes
- Changes to the Personal conversation sidebar, member panel, call panel, or
  user dock
