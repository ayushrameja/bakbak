# 0021 — Instant workspace, local cache, and voice acceleration

- **Status:** Implemented with automated validation complete; installed
  macOS/Windows performance and offline acceptance pending
- **Approved:** 2026-07-23
- **Target users:** The existing private group of 5–10 friends
- **Security boundary:** Local data is a user-scoped display cache only;
  Supabase RLS, membership, Storage policy, Realtime, and LiveKit token checks
  remain authoritative

## Goal

Make returning to Bakbak and moving between conversations feel immediate,
retain a bounded read-only offline view, and reduce safe first-join voice work
without requesting microphone access before the user joins.

## Local cache and offline behavior

- [x] Add the `bakbak-cache` IndexedDB database with user-scoped account,
      thread, and profile-media stores.
- [x] Retain only confirmed newest messages, with a 200-message ceiling per
      channel/DM and cursor-based 50-message older-history pages.
- [x] Cap profile media at 256 MiB per account with path-based keys, access-time
      LRU pruning, request coalescing, and object-URL cleanup.
- [x] Restore the last server text channel or Personal DM after the authenticated
      session resolves; never restore or auto-join voice.
- [x] Render cached workspace and conversation data before network
      revalidation, then merge current queries and Realtime by stable IDs.
- [x] Publish workspace metadata before progressively hydrating member avatars.
- [x] Show a cached/syncing state and a read-only offline state with automatic
      online, focus, and bounded-backoff retry.
- [x] Disable cached-only sends, channel/profile/catalog mutations, invites,
      and new voice joins while preserving reading, navigation, drafts, and an
      already-active LiveKit call.
- [x] Add Data & storage Settings with current-account usage, policy copy, and
      confirmed current-account clearing.
- [x] Retain account cache after logout and isolate it by authenticated user ID.

## Voice acceleration

- [x] Prepare on keyboard focus immediately and after a 75 ms pointer dwell,
      retaining one expiring in-memory token/room candidate.
- [x] Prewarm and reuse one feature-detected 48 kHz RNNoise AudioWorklet context
      after a trusted gesture without requesting a microphone.
- [x] Persist only the ten-minute, LiveKit-host-scoped relay preference and
      clear it after direct success.
- [x] Record identifier-free authorization, connection, capture, processing,
      publication, output, soundboard, and total timing diagnostics.
- [x] Preserve concurrent microphone acquisition, direct-switch reuse,
      soundboard gating, permissions, and token secrecy.

## Acceptance

- [x] Strict TypeScript and focused automated cache/media/settings/chat/voice
      tests pass.
- [ ] Cached workspace, selected conversation, and visible cached media render
      within 300 ms after session resolution in ten installed runs.
- [ ] Cached room switching renders within 100 ms in ten installed runs.
- [ ] Prepared warm voice join is at most 1.5 seconds and cold join is at most
      3 seconds, excluding first OS permission and relay retry.
- [ ] Read-only offline restoration, clearing, reconnection, and account
      isolation pass on installed macOS and Windows clients.
- [x] The full required repository and applicable macOS platform build checks pass on the final
      implementation tree.
