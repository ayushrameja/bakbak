# 0012 — Unlucky Boys channel layout

- **Status:** Deployed; hosted two-account verification pending
- **Approved:** 2026-07-18
- **Scope:** Mirror the currently visible Unlucky Boys Discord categories and
  empty text/voice room structure in Bakbak

## Goal

Give Bakbak the same visible room map as the existing Discord server without
importing Discord messages, attachments, identities, or credentials. Preserve
the exact category and room order so the move feels familiar to the private
group.

## Accepted layout

1. **Welcome:** `spawn`, `law`, `ladder`, `rant`, `gaane`
2. **Gamez:** `clips`, `portals`, `vault`, `Queue` (voice), `Crash` (voice),
   `Songs Only` (voice)
3. **Only Study:** `why`, `how`, `notes`, `deadline`, `Focus` (voice), `Loop`
   (voice)
4. **Content Creators:** `old-edits`, `ink`, `preparation`
5. **Photos:** `meme`, `wallpapers`
6. **Software:** `links`
7. **AFK:** `AFK` (voice)

This is 7 categories, 18 text rooms, and 6 voice rooms.

## Decisions

- Add ordered channel categories as server-owned data protected by the same
  membership boundary as channels.
- Keep category management operator-controlled for this slice. Existing admin
  create-channel actions continue to add uncategorized text or voice rooms.
- Reuse the four original default channel UUIDs for `spawn`, `law`, `Queue`,
  and `Crash`. Existing Bakbak messages, read markers, presence rows, and
  LiveKit room identity therefore remain attached.
- Reuse an existing same-server, same-kind room when its name already matches
  the mirrored layout. The hosted migration therefore adopted the existing
  `gaane` room rather than replacing it or creating a duplicate.
- Do not insert, update, copy, or delete any message row.
- Treat all 24 rooms as ordinary server-member-visible Bakbak rooms. The five
  Discord lock-marked text rooms do not retain Discord permission overrides;
  channel-level ACLs remain a separate future feature.
- Keep Discord bots, tokens, user identities, message history, attachments,
  reactions, and continuous synchronization outside this plan.

## Acceptance

- [x] Add an RLS-protected ordered `channel_categories` model.
- [x] Associate channels with nullable categories while retaining stable room
      UUIDs and immutable text/voice kinds.
- [x] Seed the exact 7-category, 24-room layout in a tracked additive migration.
- [x] Render mixed text and voice rooms together in category order.
- [x] Preserve admin create/rename behavior; new rooms appear in an
      uncategorized shelf.
- [x] Mirror the same hierarchy in mock mode.
- [x] Validate a clean local migration, schema lint, member/outsider RLS, exact
      counts/order, and the no-message-import boundary.
- [x] Validate scroll containment and zero document overflow at 1280×720 and
      1024×680.
- [x] Apply the migration to hosted Supabase after an explicit production-data
      approval.
- [ ] Repeat the hierarchy/order check with two authenticated hosted clients.

## Deferred

- Discord message or attachment import
- Discord identity linking
- Channel-level private access and Discord permission-overwrite mapping
- Category create, rename, reorder, collapse, or delete controls
- Discord-to-Bakbak ongoing synchronization
