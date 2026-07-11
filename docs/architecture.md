# Bakbak architecture

This document is the mutable, current source of truth for Bakbak's structure,
runtime boundaries, service contracts, data flow, and environment variables.
Historical work and verification belong in `docs/progress.md`; accepted scope
and phase completion belong in the numbered files under `docs/plans`.

## Current implementation state

As of 2026-07-11, Bakbak has a complete local/mock product path and
production Supabase and LiveKit adapters. The renderer provides the
invite-only welcome flow, channel sidebar, realtime-capable text
chat, incoming-message sounds, per-channel unread emphasis, member list, voice
rooms, locally persisted microphone/speaker/camera selection, opt-in 720p
camera calls, pre-join room occupancy with elapsed timers, mute/deafen,
per-participant volume, remote-track audio/video rendering, autoplay recovery,
reconnect/error states, persistent voice controls, and a synchronized bundled
soundboard. Deafen stops remote speech plus active and future incoming or local
soundboard playback while still allowing outbound sound events. The selected
speaker routes calls and soundboard audio; message alerts intentionally remain
on system output. Mock mode exercises the product interactions without
credentials or a backend.

The Supabase schema, least-privilege grants, Row Level Security policies,
atomic hashed invite flow, deterministic default rooms, and Realtime
publication are deployed to the hosted Bakbak project. The protected
`livekit-token` Edge Function is deployed with the three managed LiveKit
credentials and its unauthenticated JWT-gate probe returns the required 401.
The hosted profile trigger created both initial test profiles, and the default
server has one admin plus one member. Database-backed server and voice-room
presence is deployed through backward-compatible membership-checked heartbeat
RPCs, an RLS-filtered heartbeat table, and Postgres Realtime change events.
Voice join time comes from Postgres, remains stable across heartbeats, clears on
graceful leave, and expires locally after 55 seconds if a client crashes. The
clean local schema, invite, RLS, and presence suite passes 71 assertions. Voice
connections retry once with relay-only ICE after a normal peer-connection
failure and report a specific TURN/TLS diagnostic if that also fails. The
deployed token function permits microphone, camera, and LiveKit data
publication while continuing to forbid screen share. The final Arc-plus-native
voice, video, device, soundboard, reconnect, and crash-expiry rehearsal remains
open for human observation.

The Tauri metadata, window sizing, Content Security Policy, minimal capability
set, Bakbak icons, microphone and camera purpose strings, audio-input plus
camera entitlements, and signed updater are configured. GitHub Actions validate
pull requests and prepare versioned macOS Apple Silicon, macOS Intel, and
Windows x64 releases. A hardened-runtime macOS application can be ad-hoc signed
locally; Developer ID signing/notarization and Windows code signing remain
deferred as approved.

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

There is one pnpm application, not a frontend/backend monorepo. `package.json`
pins pnpm `11.3.0` through `packageManager` so local installs and GitHub Actions
use the same package-manager release. Supabase assets live alongside the app for
local development and deployment.

## Repository structure

The intended structure is:

```text
bakbak/
├── AGENTS.md
├── .github/
│   └── workflows/                 # Pull-request validation and desktop releases
├── docs/
│   ├── architecture.md
│   ├── progress.md
│   └── plans/
│       ├── 0001-bakbak-desktop-v1.md
│       └── 0002-voice-video-and-presence.md
├── public/
│   └── bakbak.svg                 # renderer favicon/source logo
├── scripts/                       # Secret scan, SemVer, and release verification
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

The renderer uses a three-part desktop layout:

1. A channel sidebar containing the current private server's text and voice
   rooms.
2. A main content area for chat, room state, empty states, and errors, with a
   bottom-pinned composer and independently scrollable messages.
3. A desktop member panel that shares the main content area's full height.
   Narrow windows hide it without changing the chat layout.
4. Persistent voice controls for connection status, microphone, camera, mute,
   deafen, and leave.

The top bar includes an accessible hover/focus connection detail. In live mode
it measures a Supabase Auth health round trip every 30 seconds and labels the
publicly configured backend region. Voice is separately labelled India West,
the observed LiveKit signaling region; it is never presented as the database
ping. The visual language is dark, calm, and polished. Accessibility, clear
focus states, readable contrast, and reduced-motion behavior are requirements
rather than post-v1 garnish.

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
Function validation. The updater capability may check, download, and install a
manifest-signed update, while the process capability is narrowed to restart.
The committed updater public key verifies artifacts; its password-protected
private key must exist only in release infrastructure and an operator backup.

### Supabase

Supabase Auth establishes user identity. Postgres and RLS are authoritative for
profiles, servers, membership, channels, messages, and invite redemption.
Realtime distributes committed message changes to authorized subscribers.

### LiveKit

LiveKit transports voice, opt-in camera tracks, participant/speaking state, and
small soundboard data messages. A protected Supabase Edge Function is the only
component allowed to sign LiveKit participant tokens. Renderer tokens allow
microphone, camera, and data publication only; screen sharing remains denied.

## Data model

All identifiers are UUIDs unless noted otherwise. Exact migrations become
authoritative once Phase 2 starts.

| Entity                | Key fields and constraints                                          | Access intent                                                                  |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `profiles`            | `id` references `auth.users`; display name and timestamps           | User can manage their profile; server members can read member-facing fields    |
| `servers`             | owner/admin reference, name, timestamps                             | Members of the server can read it                                              |
| `memberships`         | unique `(server_id, user_id)`; v1 admin/member role                 | A user can read memberships for servers they belong to                         |
| `channels`            | `server_id`, name, ordered position, `text` or `voice` type         | Server members can read channels                                               |
| `messages`            | text-channel ID, author ID, body, timestamps                        | Members can read; members can insert into text channels as themselves          |
| `invite_codes`        | server ID, one-way code digest, creator, expiry, redemption fields  | No broad client read policy; redeemed atomically through a controlled function |
| `presence_heartbeats` | unique server/user row, last seen, nullable voice channel/join time | Members can read server rows; only security-definer heartbeat RPCs can write   |

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
6. A committed message from another user plays a short local notification tone.
   Messages received for a background channel mark that channel unread until it
   is opened; the selected channel remains read.

### Application presence

1. After loading a server, each authenticated client calls
   `heartbeat_presence_v2(server_id, voice_channel_id)` immediately and every
   20 seconds. The older `heartbeat_presence(server_id)` RPC remains available
   for installed older builds and clears voice state.
2. The security-definer RPC derives the user from `auth.uid()`, verifies current
   server membership, and upserts the server/user row using database time. The
   renderer cannot insert or update heartbeat rows directly.
3. A non-null voice channel must belong to the requested server and have kind
   `voice`. Postgres assigns the join timestamp and preserves it while the user
   remains in the same room.
4. Voice state is published only after LiveKit connects and cleared on leave or
   connection error. Server members can read the resulting online and
   voice-session snapshot, including occupants of rooms they have not joined.
5. Postgres Realtime refreshes the cached rows on every client. Clients expire
   rows older than 55 seconds and re-evaluate every five seconds, so a crashed
   client disappears without a graceful leave.
6. Presence is a UI hint only. Database RLS and Edge Function checks remain
   authoritative for access.

### Voice room

1. A member selects a voice channel and requests a token from the protected
   `livekit-token` Edge Function using their Supabase access token.
2. The function authenticates the user and verifies membership plus voice
   channel type.
3. The function creates a narrowly scoped, short-lived LiveKit participant
   token permitting microphone, camera, and data publication, then returns it
   with the public LiveKit URL.
4. The renderer generation-gates connection attempts so a newer join, leave,
   sign-out, or unmount invalidates pending token, connection, and microphone
   work. A stale attempt can disconnect only the LiveKit room it created.
5. Camera remains off through join. An explicit camera action publishes an
   adaptive 720p track. Local video is mirrored; subscribed remote tracks attach
   to participant tiles, and avatar fallbacks remain visible while video is off.
6. The current connection manages microphone, speaker, and camera switches,
   autoplay recovery, mute, deafen, participant, speaking, reconnect, and error
   state. Output switching is capability-checked; unsupported runtimes show
   system output only. A missing remembered device falls back to default.
7. Unsubscription, leaving, disconnecting, and unmounting detach remote audio
   and video, invalidate pending camera/join work, stop active local sounds,
   disconnect the room, and release local tracks.
8. If signaling succeeds but the initial WebRTC peer connection fails, the
   renderer retries once with `iceTransportPolicy: relay`. A second failure is
   reported as a TURN/TLS or local network-policy problem rather than a token or
   authentication error.

### Soundboard

1. A connected member selects a sound from the bundled allowlist.
2. The client publishes a reliable LiveKit data message such as:

   ```json
   { "version": 1, "type": "soundboard:play", "soundId": "airhorn" }
   ```

3. Every connected client validates the version, message type, and bundled
   sound ID.
4. Each non-deafened client plays its own matching bundled clip through the
   shared selected-output router. A deafened sender still publishes the event
   for friends but renders no local copy, and suppressed sounds are never
   queued for replay. No audio file is uploaded or streamed through Supabase.

Unknown message types or sound IDs are ignored safely.

### Local media preferences

The renderer validates and stores only `{ inputDeviceId, outputDeviceId,
cameraDeviceId }` under the versioned local-storage key
`bakbak.devicePreferences.v1`. These identifiers never sync to Supabase. If a
remembered device is absent, the selector returns to the runtime's default
device. Chat notification audio deliberately bypasses the selected call output.

### Desktop release and update

1. Pull requests run formatting, lint, strict TypeScript, renderer/unit tests,
   release-script tests, version synchronization, production build, secret
   scan, and a locked Rust check.
2. A merge to `main` resolves the next stable SemVer from the newest `v*` tag.
   Patch is the default; `release:minor` and `release:major` labels override it,
   while `release:skip` suppresses documentation-only releases.
3. The release checkout synchronizes the calculated version across
   `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
4. Tauri Action builds macOS `aarch64`, macOS `x86_64`, and Windows `x86_64`
   installers with the production renderer configuration. Update artifacts are
   signed with the separate Tauri updater key.
5. The workflow holds the GitHub Release as a draft until it verifies two DMGs,
   one NSIS setup executable, and `latest.json` entries with URLs and signatures
   for all three targets.
6. Desktop clients check the public GitHub Releases `latest.json` shortly after
   startup. An available update is shown globally; installation and restart
   require an explicit user action so an active conversation is not interrupted.
   Windows uses Tauri's passive installer mode.

Git tags and published Releases are the release source of truth. The tracked
`0.2.0` version is the first-release floor and the local-development version;
CI injects later versions into its isolated checkout without creating version
bump commits on `main`.

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

### `POST /rest/v1/rpc/heartbeat_presence_v2`

- **Authentication:** valid Supabase user session
- **Request:** `{ "p_server_id": "<server-uuid>", "p_voice_channel_id": "<voice-channel-uuid-or-null>" }`
- **Success:** database heartbeat timestamp
- **Validation:** `auth.uid()` identity, current server membership, and voice
  channel ownership/kind
- **Behavior:** database-owned stable join time for an unchanged room; null
  clears voice state; direct table writes remain denied
- **Compatibility:** `heartbeat_presence(server_id)` remains executable by
  older builds and records online-only presence

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
| `VITE_BACKEND_REGION`    | Public label for the deployed Supabase backend, currently Canada Central       | No      |

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

Release workflows read the renderer-visible values from GitHub Actions
repository variables and force `VITE_DATA_MODE=live`. They read
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from
GitHub Actions secrets. The updater private key and password are never Vite
variables, renderer inputs, release assets, or committed files.

## Validation strategy

Required repository-level checks are:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm version:check
pnpm build
```

Run `pnpm tauri build` when validating platform integration or a distributable
bundle. Database phases add Supabase migration/RLS tests. The first friend-test
release also requires the manual macOS matrix in the active plan.

GitHub release validation additionally requires successful native builds on
both macOS architectures and Windows x64, updater signatures for every target,
two DMG assets, one NSIS executable, and a complete version-matched
`latest.json`. A release remains a draft when any platform or manifest check
fails. Ubuntu validation runners install Tauri's WebKitGTK, GLib-transitive,
AppIndicator, SVG, X11 automation, OpenSSL, and compiler development packages
before invoking Cargo.

Security validation must scan built renderer and desktop artifacts for forbidden
service-role or LiveKit secret values. Record commands, results, and skipped
checks in `docs/progress.md`; this document describes the strategy, not a claim
that it has passed.

## Current limitations and deferred work

- Hosted migration `006` and the camera-capable token function are deployed,
  but the Arc-plus-installed-app voice/video/device acceptance matrix still
  requires two signed-in users and human audio/video observation.
- The synthesized v1 sound pack is bundled as deterministic Web Audio recipes
  rather than third-party audio files, avoiding uploads and licensing risk.
- The current production renderer is roughly 283 kB compressed; LiveKit and
  Supabase can be lazy-loaded in a later performance pass if startup profiling
  shows a meaningful benefit.
- The macOS app uses an ad-hoc hardened-runtime signature with audio-input and
  camera entitlements, but has no Developer ID signature or notarization, so
  Gatekeeper warnings are expected outside the development machine.
- The Windows release job produces an unsigned x64 NSIS installer until a
  Windows code-signing identity is configured, so SmartScreen warnings are
  expected during the initial friend test.
- The automated release workflow cannot run until its public renderer
  variables and updater-signing secrets are configured in GitHub Actions.
- Screen sharing, recording, camera effects, uploads, cloud sounds, advanced
  roles, global push-to-talk, notifications, tray behavior, Linux distribution,
  and operating-system signing/notarization are outside the first usable
  release.
- System-audio sharing requires a separate per-operating-system investigation.
