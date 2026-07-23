# 0022 — Rich messaging, media, replies, and stickers

- **Status:** Backend deployed; renderer rollout and installed acceptance pending
- **Approved:** 2026-07-23
- **Audience:** The existing private group of 5–10 friends
- **Compatibility boundary:** Keep the current message RPCs and fallback bodies
  for installed clients while the upgraded renderer uses additive v2 contracts.

## Goal

Add Discord-shaped rich messaging to text channels and Personal DMs: private
image/GIF/short-MP4 attachments, GIPHY GIF and sticker sends, reusable Bakbak
stickers, sticker reactions, quoted replies, and author deletion. Existing GIF
avatars and covers remain unchanged.

## Accepted behavior

- [x] Allow up to four PNG/JPEG/WebP/GIF/H.264 MP4 attachments with the
      approved balanced file, duration, resolution, and account quota limits.
- [x] Keep attachment and sticker objects private, authorize every upload and
      read from current channel membership or established DM participation,
      and publish no partial message.
- [x] Add server-wide member-uploaded static/GIF Bakbak stickers. Uploaders and
      admins can remove them from the active pack; referenced stickers remain
      available to history.
- [x] Send Bakbak stickers as standalone messages, stage GIPHY GIF/sticker
      assets in the composer with an optional text caption, and use only
      Bakbak stickers as reactions.
- [x] Add same-thread quoted replies with reply-author notification on by
      default and a per-reply opt-out.
- [x] Organize the shared channel/DM composer with one leading attachment
      action and trailing GIF, Bakbak sticker, searchable native emoji, and
      send actions; insert emoji at the active text selection and align its
      resting footer band with the sidebar user dock.
- [x] Let authors delete their own messages, immediately revoke attachment
      access, preserve read/reply references, and show a deleted-parent
      placeholder in replies.
- [x] Keep GIPHY requests client-direct with rating `r`, required attribution
      and analytics, no persisted provider URLs/assets, and graceful missing-key
      or rate-limit states.
- [x] Extend the account-scoped cache with bounded authenticated posters while
      excluding original video, animated media, and GIPHY assets.

## Fixed limits and exclusions

- Images: 10 MiB and 16 megapixels.
- Uploaded GIFs: 15 MiB and a bounded static poster.
- Video: H.264 MP4, optional AAC audio, 50 MiB, 60 seconds, 1920×1080.
- Stickers: PNG/WebP/GIF, 5 MiB, 512×512, 25 active per member and 200 per
  server.
- Stored member media: 1 GiB per uploader, including pending reservations.
- No editing, nested threads, GIPHY reactions, video transcoding, arbitrary
  video formats, upload-to-GIPHY, or persistent original-media offline cache.

## Validation

- [x] Add focused renderer, Edge Function, and pgTAP coverage for media/MP4
      validation, GIPHY request/analytics/rate limits, cache v2, request
      authorization/limits/lifecycle, RLS, replies, attachment finalization,
      reactions, deletion, activity, and Realtime publication.
- [ ] Run two-account channel/DM Realtime and private-media acceptance.
- [ ] Run installed macOS and Windows media, GIPHY, reduced-motion, deletion,
      reply, reaction, cache, and GIF-profile regression checks.
- [x] Run all repository checks, bundle secret inspection, and applicable
      Tauri builds before marking this plan implemented.
