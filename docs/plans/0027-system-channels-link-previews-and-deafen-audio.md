# 0027 — System channels, safe link previews, and deafen audio

- **Status:** Implemented and deployed; installed acceptance pending
- **Approved:** 2026-07-24
- **Audience:** The existing private Bakbak server

## Goal

Add two automation-owned text rooms, make ordinary links useful and safe in
every conversation, complete deafen feedback, and align the collapsible channel
tree without weakening the current private-server boundary.

## Accepted behavior

- [x] Add an expanded top-level `System` category with read-only `releases` and
      `general` rooms.
- [x] Backfill current memberships and published stable GitHub releases at
      their original timestamps while baselining imported history as read.
- [x] Publish future membership and release events through the existing
      message, Realtime, unread, sound, and cache paths.
- [x] Enforce automation-only posting, reactions, media, and management in the
      database for members and admins.
- [x] Linkify HTTP(S) and `www.` text in channels and DMs, open it outside the
      app, and render at most one authenticated safe preview per message.
- [x] Render text-only public-page cards and click-to-load privacy-enhanced
      YouTube embeds; unsupported or unsafe URLs remain ordinary links.
- [x] Add original deafen/undeafen cues to the existing Voice sound category
      and play them only after the current action succeeds.
- [x] Align the category chevron, connector spine, and row elbows to one shared
      axis.

## Security and compatibility

- Keep the service-role credential inside Supabase Edge Function secrets.
- Authenticate message-preview requests and re-read the stored message before
  choosing a URL.
- Reject non-public preview targets, unsafe redirects, large/slow/non-HTML
  responses, and arbitrary remote markup or images.
- Keep readable fallback system-message bodies for installed clients while
  rejecting their attempted writes server-side.
- Keep generic images, Vimeo, multiple embeds, arbitrary iframes, and member
  management of System rooms outside this plan.

## Acceptance

- [x] Cover member, admin, and outsider access plus automation idempotency with
      database tests.
- [x] Cover announcement authentication and preview authorization/network
      limits with Edge Function tests.
- [x] Cover system rendering, composer/action removal, links, previews,
      Realtime activity, deafen audio, and tree alignment with focused tests.
- [x] Pass `pnpm check`, applicable Supabase checks, locked Cargo validation,
      the bundle secret scan, and the available Tauri build.
- [x] Update architecture, active v1 scope, and the canonical progress log.

System channels and release announcements are standard behavior rather than a
feature-flagged rollout. The one-time hosted release-history workflow remains
an explicit operator action so importing old releases cannot happen
accidentally.
