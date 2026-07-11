# Bakbak architecture

This document is the mutable, current source of truth for Bakbak's structure,
runtime boundaries, service contracts, data flow, and environment variables.
Historical work and verification belong in `docs/progress.md`; accepted scope
and phase completion belong in `docs/plans/0001-bakbak-desktop-v1.md`.

## Current implementation state

As of 2026-07-11, Bakbak has a complete local/mock product path and
production-oriented Supabase and LiveKit adapters. The renderer provides the
invite-only welcome flow, server rail, channel sidebar, realtime-capable text
chat, member list, voice rooms, device selection, mute/deafen, per-participant
volume, reconnect/error states, persistent voice controls, and a synchronized
bundled soundboard. Mock mode exercises those interactions without credentials
or a backend.

The repository also contains the Supabase schema, least-privilege grants, Row
Level Security policies, atomic hashed invite flow, deterministic default
rooms, Realtime publication, operator bootstrap instructions, and the protected
`livekit-token` Edge Function. Live mode is implemented but has not been
deployed to a real Supabase/LiveKit project in this repository, so the two-client
friend-test matrix and database tests against a running local stack remain open.

The Tauri metadata, window sizing, Content Security Policy, minimal capability
set, and Bakbak icons are configured. A macOS application and unsigned DMG can
be built locally; signing and notarization remain deferred as approved.

## Technology stack

| Layer                | Technology                        | Responsibility                                                              |
| -------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| Package/tooling      | pnpm, TypeScript                  | Dependency management and strict static types                               |
| Renderer             | React, Vite                       | Desktop UI and local interaction state                                      |
| Desktop shell        | Tauri 2, Rust                     | Native window, packaging, capabilities, and later tray/desktop integrations |
| Identity/data        | Supabase Auth, Postgres, Realtime | Accounts, membership, channels, messages, invites, and realtime chat        |
| Trusted backend      | Supabase Edge Functions           | Membership-checked LiveKit token issuance                                   |
| Voice/data transport | LiveKit                           | Voice rooms, participant state, and soundboard data messages                |
| Validation/testing   | Zod, Vitest, Testing Library      | Boundary validation and unit/component tests                                |

There is one pnpm application, not a frontend/backend monorepo. Supabase assets
will live alongside it for local development and deployment.

## Repository structure

The intended structure is:

```text
bakbak/
├── AGENTS.md
├── docs/
│   ├── architecture.md
│   ├── progress.md
│   └── plans/
│       └── 0001-bakbak-desktop-v1.md
├── public/
│   └── bakbak.svg                 # renderer favicon/source logo
├── src/
│   ├── app/                       # application shell, routing, providers
│   ├── components/                # reusable presentation components
│   ├── features/
│   │   ├── auth/
│   │   ├── server/
│   │   ├── channels/
│   │   ├── chat/
│   │   ├── voice/
│   │   ├── soundboard/
│   │   └── settings/
│   ├── lib/                       # Supabase clients, adapters, types, and mock data
│   ├── styles.css                 # desktop design system and layout
│   └── main.tsx
├── src-tauri/                     # Rust entrypoints, capabilities, icons, bundle config
└── supabase/
    ├── functions/
    │   └── livekit-token/
    ├── migrations/
    ├── seed.sql
    └── tests/                     # RLS and database behavior tests
```

The feature folders shown above contain the implemented v1 slices; empty
architectural placeholder folders are not used.

## UI composition

The renderer uses a four-part desktop layout:

1. A compact server rail. V1 displays one private server but retains a boundary
   that can support more later.
2. A channel sidebar containing text and voice rooms.
3. A main content area for chat, room state, empty states, and errors.
4. Persistent voice controls for connection status, microphone, mute, deafen,
   and leave.

The visual language is dark, calm, and polished. Accessibility, clear focus
states, readable contrast, and reduced-motion behavior are requirements rather
than post-v1 garnish.

## Runtime and trust boundaries

### React renderer

The renderer is untrusted for authorization purposes. It may hold a user's
Supabase session, use the public Supabase credential, request permitted data,
connect to LiveKit with a short-lived participant token, and play bundled
sounds. It must never contain a service-role key or LiveKit API secret.

### Tauri shell

Tauri owns the native window, capabilities, application identity, and desktop
bundles. V1 should expose the smallest capability set needed by the renderer.
Native commands are not an authorization substitute for Supabase RLS or Edge
Function validation.

### Supabase

Supabase Auth establishes user identity. Postgres and RLS are authoritative for
profiles, servers, membership, channels, messages, and invite redemption.
Realtime distributes committed message changes to authorized subscribers.

### LiveKit

LiveKit transports voice, participant/speaking state, and small soundboard data
messages. A protected Supabase Edge Function is the only component allowed to
sign LiveKit participant tokens.

## Planned data model

All identifiers are UUIDs unless noted otherwise. Exact migrations become
authoritative once Phase 2 starts.

| Entity         | Key fields and constraints                                         | Access intent                                                                  |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `profiles`     | `id` references `auth.users`; display name and timestamps          | User can manage their profile; server members can read member-facing fields    |
| `servers`      | owner/admin reference, name, timestamps                            | Members of the server can read it                                              |
| `memberships`  | unique `(server_id, user_id)`; v1 admin/member role                | A user can read memberships for servers they belong to                         |
| `channels`     | `server_id`, name, ordered position, `text` or `voice` type        | Server members can read channels                                               |
| `messages`     | text-channel ID, author ID, body, timestamps                       | Members can read; members can insert into text channels as themselves          |
| `invite_codes` | server ID, one-way code digest, creator, expiry, redemption fields | No broad client read policy; redeemed atomically through a controlled function |

Initial admin membership and initial invite codes are managed with reviewed SQL.
An invite-management UI is deferred until post-v1.

## Authorization model

- Authentication alone does not grant server access.
- Membership in the channel's server is required to read server, channel,
  membership, and message data.
- Message authorship is derived from the authenticated user, not trusted from a
  client-supplied user ID.
- Invite redemption is an atomic database operation: validate an unused,
  unexpired code, create the membership, and consume the code in one
  transaction.
- The client cannot list or inspect valid invite codes.
- The LiveKit token function verifies the caller's Supabase JWT, current server
  membership, and that the requested channel is a voice channel.
- RLS tests cover at least seeded admin, member, and non-member identities.

## Data flows

### Authentication and private access

1. The user signs in with Supabase email/password authentication.
2. The renderer loads the user's profile and existing memberships through RLS.
3. A user without membership submits a single-use invite code.
4. The invite redemption database function validates and consumes the code
   atomically, then creates membership.
5. The renderer refreshes membership and channel data.

### Text chat

1. A member selects a text channel.
2. The renderer loads messages through the Supabase client; RLS verifies server
   membership.
3. A submitted message is validated, stored with the authenticated author, and
   committed to Postgres.
4. Supabase Realtime broadcasts the committed row to authorized clients.
5. Clients reconcile realtime events with the loaded message list without
   duplicating optimistic messages.

### Voice room

1. A member selects a voice channel and requests a token from the protected
   `livekit-token` Edge Function using their Supabase access token.
2. The function authenticates the user and verifies membership plus voice
   channel type.
3. The function creates a narrowly scoped, short-lived LiveKit participant
   token and returns it with the public LiveKit URL.
4. The renderer connects directly to LiveKit and manages device, mute, deafen,
   participant, speaking, reconnect, and error state.
5. Leaving the channel disconnects the room and releases local media tracks.

### Soundboard

1. A connected member selects a sound from the bundled allowlist.
2. The client publishes a reliable LiveKit data message such as:

   ```json
   { "version": 1, "type": "soundboard:play", "soundId": "airhorn" }
   ```

3. Every connected client validates the version, message type, and bundled
   sound ID.
4. Each client plays its own matching bundled clip. No audio file is uploaded
   or streamed through Supabase.

Unknown message types or sound IDs are ignored safely.

## Backend contracts

These contracts match the current implementation.

### `POST /functions/v1/livekit-token`

- **Authentication:** `Authorization: Bearer <Supabase access token>`
- **Request:** `{ "channelId": "<voice-channel-uuid>" }`
- **Success:** `{ "token": "<short-lived-token>", "serverUrl": "wss://...", "roomName": "bakbak-voice-<channel-id>", "expiresAt": "<ISO timestamp>" }`
- **Validation:** authenticated user, current server membership, existing voice
  channel, and an allowed participant identity/room name.
- **Errors:** normalized unauthorized, origin/method/payload,
  not-found/invalid-channel, request-failed, and service-unavailable responses
  without secret details.

### `POST /rest/v1/rpc/redeem_invite_code`

- **Authentication:** valid Supabase user session
- **Request:** `{ "p_code": "<user-entered-code>" }`
- **Success:** the created or existing membership result needed by the client
- **Validation:** digest match, expiry, unused state, and transaction-safe
  single use
- **Errors:** a normalized invalid-or-unavailable response that does not reveal
  whether a guessed code once existed

Text messages otherwise use the Supabase table API and Realtime under RLS; v1
does not require a custom message service endpoint.

## Environment variables

Every `VITE_*` value is public in the compiled renderer. Never put a private
credential in a `VITE_*` variable.

### Renderer-visible values

| Name                     | Purpose                                                                        | Secret? |
| ------------------------ | ------------------------------------------------------------------------------ | ------- |
| `VITE_DATA_MODE`         | Selects `mock` for the local foundation or `live` after Supabase is configured | No      |
| `VITE_SUPABASE_URL`      | Public Supabase project URL                                                    | No      |
| `VITE_SUPABASE_ANON_KEY` | Supabase public/anonymous client credential; RLS remains mandatory             | No      |
| `VITE_LIVEKIT_URL`       | Public LiveKit WebSocket URL                                                   | No      |

### Edge Function managed values

| Name                        | Purpose                                                            | Secret handling                |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------ |
| `SUPABASE_URL`              | Supabase project URL available to the function                     | Platform-managed               |
| `SUPABASE_ANON_KEY`         | Validates/forwards user-scoped Supabase access                     | Platform-managed               |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server-only database access if the function requires it | Secret; never bundle or commit |
| `LIVEKIT_URL`               | Public WebSocket URL returned with the short-lived token           | Platform-managed               |
| `LIVEKIT_API_KEY`           | LiveKit token issuer identity                                      | Secret; never bundle or commit |
| `LIVEKIT_API_SECRET`        | Signs LiveKit participant tokens                                   | Secret; never bundle or commit |

`.env.example` contains placeholders only. Real renderer development values use
ignored local `.env` files; Edge Function secrets use Supabase's managed secret
store.

## Validation strategy

Required repository-level checks are:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm tauri build` when validating platform integration or a distributable
bundle. Database phases add Supabase migration/RLS tests. The first friend-test
release also requires the manual macOS matrix in the active plan.

Security validation must scan built renderer and desktop artifacts for forbidden
service-role or LiveKit secret values. Record commands, results, and skipped
checks in `docs/progress.md`; this document describes the strategy, not a claim
that it has passed.

## Current limitations and deferred work

- No hosted Supabase or LiveKit project is configured in the repository. Live
  auth, invite redemption, Realtime, and two-person voice still require
  deployment and friend testing with real public client values.
- The pgTAP database tests exist but have not run against a local Supabase stack
  because the Supabase CLI and a running Docker daemon are not available in the
  current environment.
- The synthesized v1 sound pack is bundled as deterministic Web Audio recipes
  rather than third-party audio files, avoiding uploads and licensing risk.
- The current production renderer is roughly 283 kB compressed; LiveKit and
  Supabase can be lazy-loaded in a later performance pass if startup profiling
  shows a meaningful benefit.
- The macOS app and DMG are unsigned and unnotarized, so Gatekeeper warnings are
  expected outside the development machine.
- Screen sharing, webcam video, uploads, cloud sounds, advanced roles, global
  push-to-talk, notifications, tray behavior, Windows/Linux distribution, and
  signing/notarization are outside the first usable release.
- System-audio sharing requires a separate per-operating-system investigation.
