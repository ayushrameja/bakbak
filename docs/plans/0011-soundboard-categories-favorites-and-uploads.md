# 0011 — Soundboard categories, favorites, and member uploads

- **Status:** Implemented and deployed; installed-client and two-account
  acceptance pending
- **Approved:** 2026-07-18
- **Supersedes:** Plan 0001's operator-only sound catalog and broad member
  metadata-editing boundary

## Goal

Make the connected-call soundboard easier to browse and safe for friends to
extend without placing Storage write permissions or backend secrets in the
renderer.

## Accepted product behavior

- [x] Replace flat category pills with independently collapsible Favorites,
      System, and Bakbak sections in that order.
- [x] Expand Favorites and Bakbak by default, collapse System by default, and
      persist each section state locally per server.
- [x] Temporarily reveal matching collapsed sections during search without
      changing stored preferences.
- [x] Keep starred sounds in their source section and duplicate them into the
      account-synced Favorites section.
- [x] Consolidate the 23 original sounds into System, rename the 21 imported
      sounds to Bakbak, and remove the three empty legacy categories.
- [x] Let any connected member upload common audio or video files up to 25 MiB,
      choose a 0.1–5 second window, and publish only normalized 48 kHz mono
      signed 16-bit PCM WAV audio to Bakbak.
- [x] Give uploaders metadata/delete control over their own sounds and give
      server admins moderation control over all sounds. Operator sounds remain
      admin-managed and are archived instead of physically deleted.
- [x] Enforce 25 active uploads per member and 200 active member uploads per
      server; operator sounds do not consume quota.
- [x] Keep direct client catalog creation/deletion and Storage writes denied;
      route publication through an authenticated, membership-checking Edge
      Function.
- [x] Make the shared dialog shell viewport-bounded with an internally
      scrollable body, fixed header, sticky/wrapping actions, and
      compact/default/wide sizes.

## Media and licensing boundary

- FFmpeg loads only after the upload workflow is used and runs in one local
  worker. Source files stay on the device; the hosted function accepts only the
  normalized WAV result.
- The committed core is built from pinned FFmpeg and ffmpeg.wasm sources with
  GPL and non-free code disabled. Its build enables only the demuxers, native
  audio decoders, parsers, resampler, WAV muxer, and PCM encoder required by
  Bakbak.
- The ffmpeg.wasm JavaScript wrapper is MIT-licensed. The custom FFmpeg core
  remains under the applicable LGPL terms and ships with source/build and
  notice information under `third_party/ffmpeg-soundboard`.

## Verification

- [x] Component coverage for ordering, collapse persistence, search reveal,
      favorites, rollback, permissions, upload defaults, and modal focus.
- [x] Media-unit coverage for size/window validation, normalized FFmpeg
      arguments, no-audio failure, cancellation, and worker-file cleanup.
- [x] Edge Function coverage for request authentication/validation, normalized
      failures, WAV parsing, quota propagation, and failed-publication cleanup.
- [x] Clean reset, schema lint, and pgTAP coverage for consolidation, privacy,
      creator/admin RLS, direct-mutation denial, cascade behavior, quotas, and
      cross-server denial.
- [x] Local browser extraction of representative MP4/AAC and MP3 sources
      through the reduced core, including an arbitrary source window and the
      exact normalized-WAV validator.
- [ ] Installed-client upload of representative audio and video sources through
      the reduced core.
- [x] Browser QA at 1280×800, 1024×680, and a short screenshot-sized viewport.
- [ ] Hosted two-account Realtime, favorite, LiveKit playback, moderation,
      outsider denial, deletion/cache, and original-sound regression matrix.
- [x] Local macOS app/DMG stock-core versus reduced-core size comparison.
- [ ] Signed macOS/Windows installer-size comparison.

## Non-goals

- Members cannot create, rename, reorder, or choose categories.
- Bakbak does not retain source video, provide uploaded custom emoji artwork,
  bypass protected media, or retroactively trim existing operator sounds.
