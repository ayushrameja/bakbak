# 0008 — Rich animated profiles

- **Status:** Implemented with hosted migration deployed; automated and
  mock-browser validation complete, local pgTAP and live two-account acceptance
  pending
- **Approved:** 2026-07-17
- **Target users:** The existing private group of 5–10 friends
- **Compatibility boundary:** Keep `profiles.avatar_path` as the canonical
  static poster and preserve the legacy `avatar_url` fallback

## Goal

Turn Bakbak's small avatar setting into a private, expressive profile without
turning the friends list into a public-discovery product. Profiles stay global
to the account; presence and role shown in a card come from the current server.
Motion should reward attention, not tackle it in the hallway.

## Settings and profile media

- [x] Fix the Settings display-name focus regression by running modal focus
      setup only on mount/unmount and reading the latest close callback through
      a ref.
- [x] Add one profile editor with live preview, display name, a 190-character
      plain-text description, avatar and 3:1 cover controls, focal positioning,
      independent removals, and one Save action.
- [x] Accept PNG, JPEG, WebP, and GIF up to 5 MiB for avatars and 10 MiB for
      covers; reject images over 16 megapixels or 8192 px on either side.
- [x] Decode uploads before storage and flatten them to static posters no larger
      than 512 px for avatars or 1600 px for covers, using WebP with PNG
      fallback.
- [x] Retain an original GIF beside its poster. Animated WebP and other formats
      intentionally remain flattened.
- [x] Support pointer dragging, keyboard arrows, Shift-modified larger steps,
      and center reset for integer cover focal coordinates.
- [x] Revoke staged object URLs, discard drafts on close, and retain a failed
      save draft for retry.

## Private storage and persistence

- [x] Add description, avatar-animation, cover-poster, cover-animation, and
      cover-focal fields with database checks and owner-prefix constraints.
- [x] Expand the private `avatars` bucket to 5 MiB with GIF support.
- [x] Add the private 10 MiB `profile-covers` bucket with owner-write and
      shared-server-read policies.
- [x] Upload every changed object before one profile-row update, delete all
      newly uploaded objects if any step fails, and best-effort remove replaced
      objects after success.
- [x] Deduplicate authenticated media downloads by bucket/path, guard stale
      requests, and revoke cached object URLs on replacement, sign-out, and
      teardown.
- [x] Keep avatar posters eager while loading compact GIFs only on trigger
      hover/focus and loading cover media only for the open card/editor.
- [x] Deploy `202607170001_rich_profiles.sql` before shipping the renderer.

## Profile card and motion

- [x] Use one application-owned, anchored, view-only profile card from member
      rows, message avatars/names, mention tokens, voice identities, and the
      signed-in user dock.
- [x] Show only cover, avatar, display name, current presence, current-server
      role, and description. Do not expose email, UUID, notes, or administrative
      actions.
- [x] Prefer right placement, flip left, clamp to the viewport, recompute for
      scroll/resize/interface zoom, and close if the trigger unmounts.
- [x] Provide dialog semantics, expanded trigger state, focus containment,
      Escape/close/outside dismissal, profile switching, and focus restoration.
- [x] Add an anchor-origin reveal, cover depth, avatar spring, status glow, GIF
      crossfade, and restrained trigger lift in the Warm motion language.
- [x] Disable GIF fetching, parallax, springs, pulses, and transform-heavy
      transitions when the user prefers reduced motion.

## Validation

- [x] Add focused renderer tests for Settings focus/drafts/focal controls,
      validation/poster/GIF/cleanup behavior, media-cache lifecycle, reduced
      motion, every trigger class, profile privacy, placement, switching, and
      focus restoration.
- [x] Add pgTAP coverage for columns, checks, grants, private buckets, owner
      writes, shared-member reads, and outsider/cross-server denial. Execution
      remains pending until Docker/Colima supplies a local Supabase stack.
- [x] Validate the hosted migration with a dry run, deploy it, run linked schema
      lint, and confirm no migrations remain pending.
- [x] Run mock-browser checks at 1280×800 and 1024×680 for focus, draft
      discard, card flip/clamp, Escape, focus restoration, and the live editor
      layout.
- [ ] Run the two-account live acceptance matrix for Realtime propagation,
      slow GIF loading, authenticated media reads, and outsider denial.
- [ ] Repeat Light/Dark, Warm/Flat, reduced-motion, pointer, and keyboard
      observation in the installed Tauri application.
