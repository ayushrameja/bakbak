# 0004 — Warm Adda UI, settings, channels, and ARM64 macOS

- **Status:** Implemented and hosted migration deployed; manual acceptance pending
- **Approved:** 2026-07-12
- **Target users:** The existing private group of 5–10 friends
- **Supported release platforms:** Apple Silicon macOS 12.3+ and Windows x64
- **Compatibility boundary:** Bakbak v0.4.0 is the final Intel macOS release

## Summary

Replace the Discord-like three-column interface with Bakbak's own “Warm Adda”
identity: oat and stone surfaces in Light mode, charcoal surfaces in Dark mode,
coral actions, teal presence, clean sans-serif typography, and restrained
motion. Settings become part of the main application canvas, voice controls
remain available across navigation, and server admins can create or rename
text and voice rooms without receiving broad table-write authority.

## Superseded UI decisions — 2026-07-14

Plan 0006 supersedes the permanent absence of a member column, the People
drawer, full-app settings presentation, and the layout-consuming persistent
voice bar. Warm remains the default visual identity, while the upgraded shell
now uses independently optional channel/member panels, a centered settings
modal, a floating call dock, and an optional Flat surface style. Profile,
avatar, channel-management, authorization, migration, distribution, and manual
acceptance requirements in this plan remain active.

## Accepted product behavior

- The channel shelf and conversation canvas remain visible while a People
  button opens the member list as an accessible drawer. There is no permanent
  member column.
- Appearance supports System, Light, and Dark. The preference is stored under
  `bakbak.appearancePreferences.v1`, applied before React renders, and follows
  operating-system changes only while System is selected.
- Settings has Profile, Audio & Video, and Appearance sections. Text drafts are
  owned per channel by the application shell so settings and channel navigation
  do not discard unfinished messages.
- Profiles allow a 1–50 character display name and a private PNG, JPEG, or WebP
  avatar up to 2 MiB. New clients prefer `profiles.avatar_path`; the existing
  `avatar_url` field remains as an older-client fallback.
- One persistent voice bar exposes mute, deafen, soundboard, and leave. Camera,
  screen sharing, and device settings live in its More menu. The soundboard is
  a bar-anchored drawer and retains its filtering, playback, metadata, volume,
  stop-all, retry, loading, and error behavior.
- Admins can create and rename text or voice channels. Channel IDs, kinds,
  server ownership, and existing message/voice identity remain stable. Delete,
  reorder, topic editing, and kind conversion are out of scope.
- Creating a channel selects it for the creator but does not automatically join
  a new voice room. Realtime channel changes are reconciled by ID and sorted by
  position, then ID.
- Distribution produces one Apple Silicon DMG and one Windows x64 NSIS
  installer. Intel assets and updater-manifest entries are rejected; older
  Intel clients are not remotely disabled.

## Security and service contracts

- The private `avatars` Storage bucket accepts only the three approved image
  MIME types and enforces the 2 MiB limit. Object names are
  `<owner-user-id>/<generated-uuid>`; only owners write/delete, while owners and
  users sharing a server with the owner may read.
- Avatar replacement uploads the new object before updating the profile,
  removes a failed new upload when the database write fails, and best-effort
  deletes the old object after success. Downloaded blob URLs are revoked when
  replaced or released.
- `create_channel(server_id, kind, name)` and
  `rename_channel(channel_id, name)` are authenticated `security definer` RPCs
  with an empty search path. They derive identity from `auth.uid()`, require the
  matching server's admin role, trim and validate 1–80 character names, retain
  case-insensitive per-kind uniqueness, and return the resulting channel.
- Direct authenticated insert, update, and delete access to `channels` remains
  revoked. New positions are serialized on the server row and append by ten
  within the requested channel kind.
- Profile and channel tables are added to Supabase Realtime. The renderer
  updates the canonical profile row first and mirrors the display name into Auth
  metadata only as a startup and older-client fallback.

## Validation and rollout

- Focused frontend coverage must exercise theme persistence/system changes,
  settings and media-test cleanup, profile/avatar failures, per-channel drafts,
  People drawer focus, persistent voice controls, soundboard drawer behavior,
  and admin-only channel controls.
- Database tests must cover owner, shared-member, outsider, and cross-server
  avatar access; direct channel-write denial; admin RPC success; non-admin
  rejection; validation and duplicate failures; appended positions; and stable
  IDs during rename.
- Repository checks, local Supabase reset/lint/tests, Cargo checks, the local
  Tauri ARM64 bundle, codesign/architecture inspection, updater-manifest tests,
  and compiled-secret scanning must pass before distribution. Exact results
  belong in `docs/progress.md`.
- Migration `202607120003_profile_avatars_and_channel_management.sql` was
  deployed and verified in the hosted migration ledger on 2026-07-13. Live
  profile photos and channel mutation still require the two-account acceptance
  run before distributing this client.
- The remaining human acceptance run uses one browser and one native app with
  two accounts. It covers both supported window sizes, all three theme choices,
  live profile propagation, admin channel create/rename, draft and call
  continuity, soundboard access across views, media controls, and People drawer
  accessibility.
- The first release from this plan must prove Apple Silicon and Windows updater
  installs while publishing no Intel macOS artifact or manifest target.

## Explicit exclusions

- Channel deletion, reordering, type conversion, and persisted topic editing.
- Avatar cropping or public profile photos.
- Additional roles or permission management.
- Intel macOS releases after v0.4.0, Linux distribution, signing/notarization,
  and Windows process/display-matched screen audio.
