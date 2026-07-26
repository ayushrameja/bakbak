# 0031 — GIPHY profile avatars and covers

- **Status:** Implemented and deployed; installed/live acceptance pending
- **Approved:** 2026-07-26
- **Target users:** The existing private group of 5–10 friends
- **Compatibility boundary:** Uploaded profile media stays unchanged; GIPHY
  profiles persist provider IDs only

## Goal

Let a member choose a GIPHY GIF for either profile avatar or cover from
Settings without copying provider files or URLs into Bakbak storage or its
persistent local cache.

## Accepted behavior

- [x] Add target-specific, GIF-only GIPHY pickers beside the existing Avatar
      and Cover upload controls.
- [x] Stage provider selections in the shared profile preview, preserve cover
      focal controls, and commit both fields through the existing Save action.
- [x] Make upload, GIPHY, and removal mutually exclusive per field while
      retaining failed drafts for retry.
- [x] Store only bounded `avatar_giphy_id` and `cover_giphy_id` values and
      expose them through existing profile and DM authorization boundaries.
- [x] Resolve static avatar posters in batches, load animation/cover renditions
      only on the existing attention-driven surfaces, and preserve reduced
      motion.
- [x] Keep resolved provider URLs memory-only and strip them from account/DM
      IndexedDB snapshots while retaining IDs for online re-resolution.
- [x] Preserve picker attribution, analytics, missing-key, rate-limit, and
      unavailable-media fallback behavior.

## Validation

- [x] Add renderer coverage for picker targeting, staging/save retry,
      analytics, rendition selection, source transitions, URL stripping,
      lazy/fallback behavior, DM mapping, and provider hydration.
- [x] Add pgTAP coverage for columns, validation, mutually exclusive sources,
      grants, shared-member/DM visibility, and outsider denial.
- [x] Deploy `202607260001_giphy_profile_media.sql` to the hosted project.
- [x] Run the mock GIPHY search/staging flow at 1280×800 and 1024×680 in Light
      and Dark with no browser-console errors.
- [ ] Run live two-account Realtime and offline-fallback acceptance.
- [ ] Run installed macOS/Windows Light/Dark, reduced-motion, and
      1280×800/1024×680 layout checks.
