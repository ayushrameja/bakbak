# 0034 — Buzz-inspired unified Bakbak redesign

- **Status:** Implemented and deployed; two-client/installed acceptance remains
- **Approved:** 2026-08-01
- **Audience:** The existing private Bakbak server and Personal DMs

## Goal

Replace the signed-in five-track neutral shell with one resizable gradient
sidebar and one rounded solid conversation canvas. Borrow Buzz and Slack's
useful hierarchy and message density while keeping Bakbak's chat, voice,
soundboard, profile, settings, offline, and accessibility behavior intact.

## Accepted behavior

- [x] Bundle Inter Variable locally and use a rem-based 11/12/14/16 px type
      ramp across signed-in UI.
- [x] Move the Personal/Bakbak switch into a unified 280 px sidebar, retain
      bounded resize/collapse behavior, and remove the right panel.
- [x] Show up to six other members regardless of status above the server rooms,
      with a seventh Show all row opening all In Voice, Online, Away, and
      Offline members in an accessible modal.
- [x] Replace the visible hierarchy with one `Channels` section containing
      `Welcome`, `Chat`, `Volt`, `Random Things`, and `Game #1` through
      `Game #3`; admins may append or rename ordinary rooms.
- [x] Keep `Welcome` automation-only for future member joins and retire release
      announcements without changing ordinary GitHub release publication.
- [x] Archive old rooms/categories and preserve their data while excluding
      archived rows from ordinary member reads, Realtime, activity, presence,
      and management.
- [x] Give Bakbak honey/teal and Personal violet/blue light/dark palettes with
      a reduced-motion-safe 240 ms transition.
- [x] Apply the shared rounded control and surface language to all signed-in
      chat, voice, soundboard, settings, profile, dialog, and overlay surfaces.
- [x] Remove mock conversation messages while retaining purposeful empty
      states and all rich-message behavior.

## Compatibility and safety

- Existing channel/message/media rows are not deleted. Archived history is
  operator-recoverable but has no member-facing archive UI.
- The public `create_channel` arguments remain unchanged; its placement and
  active-row rules change atomically with the migration.
- Layout preferences migrate from v2 to v3 using only the former left panel's
  visibility and width. DM, media, appearance, audio, and device preferences
  remain intact.
- Authentication, invite, loading, and startup-error presentation are outside
  this redesign.
- Search, Inbox, Agents, archive restoration, and member-created categories
  remain outside scope.

## Acceptance

- [x] Cover active/archive visibility, exact room order, admin/member/outsider
      behavior, Welcome automation, and retired release publication with
      database tests.
- [x] Cover sidebar switching/resizing, member preview/modal, Personal/server
      contents, room ordering, archived Realtime removal, and selection
      fallback with focused renderer tests.
- [ ] Verify light/dark Bakbak and Personal layouts at 1280×800 and 1024×680,
      including hidden/minimum/maximum sidebar, chat, voice, soundboard,
      settings, profiles, and dialogs with no document overflow.
- [x] Run the applicable repository checks and local Tauri bundle; record every
      skipped installed or multi-client check.
- [x] Apply the archival migration to hosted Supabase after explicit production
      approval and remove the retired hosted `system-events` function.
- [ ] Complete the two-client presence, Welcome, admin Realtime, archived-room,
      active-call transition, profile, and DM matrix.
