# Plan 0028 — Bakbak 1.0 interaction and loading polish

## Status

Implemented in the repository on 2026-07-24. Focused renderer and release
regressions pass, and PR #33 has only the live `release:major` label while the
latest published tag remains `v0.16.0`. The installed three-client
macOS/Windows watch matrix and direct light/dark/reduced-motion observation
remain release acceptance work. This plan does not authorize merging PR #33 or
dispatching a release.

## Goal

Make the path to Bakbak `v1.0.0` deliberate and calm: remove noisy startup
copy, keep readers anchored while conversations change, expose consistent
identity actions, and let a viewer explicitly follow a friend's advertised
stream into its authoritative LiveKit room.

## Superseding contract

This plan narrowly supersedes plan 0015's informational-only LIVE rail and
cross-room-watch restriction. A remote LIVE identity may expose Watch Stream,
which joins or switches to that voice room and subscribes only after the
requested owner's authoritative LiveKit share appears. Plan 0015's source-audio
isolation, Bakbak process exclusion, explicit remote subscription, one watched
share, presenter companion, fullscreen, and cleanup contracts remain in force.

## Accepted behavior

### Release readiness

- PR #33 carries `release:major`, does not carry `release:skip`, and remains
  open until a separate merge request.
- The resolver proves `v0.16.0 + release:major -> v1.0.0`. Package and Tauri
  versions remain `0.16.0` in source; the release workflow injects the resolved
  version and later synchronizes tracked metadata.
- The newest published tag must be checked immediately before merge. If
  `v1.0.0` already exists, release work stops rather than resolving `v2.0.0`.

### Loading scene

- Successful session and workspace loading share one scene beneath the native
  titlebar: six uppercase `BAKBAK` letters, each revealed once in staggered
  order, over a slow system-accent/neutral gradient.
- Auto, Light, and Dark use the existing adaptive tokens. Reduced motion shows
  the final letters and a static gradient immediately.
- Workspace failure retains “The door is stuck”, the actual error, and Back to
  sign in. Loading animation never masks a failure.

### Conversation scrolling

- Channel and DM conversations open at the bottom synchronously with no smooth
  scrolling.
- A 96 px threshold defines “at bottom”. Appended messages pin instantly only
  inside that threshold.
- Older-history loading records `scrollHeight` and `scrollTop`, disables its
  trigger while pending, and restores the exact viewport from the post/pre
  height delta.
- While reading history, appended messages and row hydration/reaction/preview
  updates preserve the viewport. New rows increment a pluralized New message
  pill; activating it or manually reaching the bottom clears it.

### User actions

- Right-click, Menu, and Shift+F10 open one viewport-clamped portal menu from
  member and voice rails, chat authors and mentions, participant cards,
  Personal conversation/detail identities, and the shared user dock.
- The menu provides View Profile, Message, and Copy user ID. Message is absent
  for self. Existing DMs remain navigable offline; starting a new one is
  disabled offline.
- Remote participants in the active call expose Mute for me / Unmute for me.
  Zero volume applies to speech, soundboard, and share audio; unmute restores
  the last non-zero participant level or 100%.
- Arrow keys, Home/End, Escape, outside pointer dismissal, focus restoration,
  and `menu`/`menuitem` semantics are required.

### Watch Stream

- `MemberVoiceActivity` includes `channelId`. A remote streaming identity in
  the member or channel voice rail reveals an accessible Watch Stream action on
  hover or keyboard focus.
- Activation stores `{ requestId, ownerId, channelId }`, navigates to the voice
  room, and joins or switches the call.
- Once connected, `VoiceRoom` waits for that owner's authoritative LiveKit
  share, selects the existing one-share subscription, and focuses it. A new
  target replaces the previous watched share through the existing subscription
  policy.
- No matching share within ten seconds after connection clears the request and
  shows a dismissible stream-ended notice. Target loss, leave, disconnect, and
  teardown retain the existing subscription/media cleanup.

## Exclusions

- Kick, ban, timeout, server mute, new roles, and other moderation actions.
- Database schema changes, presence protocol changes, or native capture
  changes.
- Browser/Linux watching, multiple simultaneous watched shares, recording, or
  bypassing operating-system/DRM capture restrictions.

## Acceptance

- [x] Add the major resolver regression and configure PR #33 for the next major
      release without merging or publishing it.
- [x] Replace successful loading surfaces while retaining the workspace-error
      recovery path and reduced-motion behavior.
- [x] Share anchored channel/DM scrolling and New message behavior.
- [x] Add accessible user actions and participant-local mute restoration.
- [x] Add same-room/cross-room pending Watch Stream handoff with authoritative
      discovery and timeout.
- [x] Run focused automated tests and the repository validation/build gates.
- [ ] Observe loading directly in light, dark, and reduced-motion modes.
- [ ] Complete the installed three-client macOS/Windows watch matrix, including
      cross-room joining, source audio, replacement, stop, and stale presence.
