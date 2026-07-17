# Bakbak architecture

This document is the mutable, current source of truth for Bakbak's structure,
runtime boundaries, service contracts, data flow, and environment variables.
Historical work and verification belong in `docs/progress.md`; accepted scope
and phase completion belong in the numbered files under `docs/plans`.

## Current implementation state

As of 2026-07-17, Bakbak has a complete local/mock product path and production
Supabase and LiveKit adapters. The renderer provides the invite-only welcome
flow and a three-panel shell with a 232 px channel panel, flexible conversation
canvas, and 240 px online/offline member panel. Both side panels are visible by
default, independently optional, and persisted per device without responsive
overlays or automatic hiding. Settings is a centered, focus-trapped in-app
modal with internal scrolling, active-call controls, and confirmed logout.
System/Light/Dark, Coral/Purple/Red/Yellow accent/intensity, and Warm/Flat
surface preferences are synchronously applied before React renders. Flat uses
crisp grayscale surfaces without decorative gradients, glow, glass blur, or
heavy shadows while preserving semantic accent, presence, danger, and focus
colors. Profiles support validated display names, 190-character plain-text
descriptions, static or GIF avatars, 3:1 static or GIF covers, integer cover
focal points, and an accessible Discord-style anchored card. Admin-only
controls create or rename text and voice channels, while Realtime reconciles
changes for every member.

Signal Red is a fixed device-local special preset layered over those retained
standard choices. Its first paint resolves to Dark + Flat with a `#050505`
canvas, near-black panels, `#e5062f` primary red, `#ff2648` hot red, and
`#f4f2ef` off-white. League Gothic is restricted to display/UI chrome, IBM Plex
Mono to signal metadata, and Inter remains the content/form/profile face. One
pointer-transparent layer adds low-opacity static noise, edge grids, bars,
timecodes, a slow ticker, scheduled Bakbak stamps, and typed communication
labels without covering the center reading area. Reduced motion freezes the
texture, removes marquees/glitches/random stamps, and keeps only a static event
label.

Upgraded clients expose chat, structured individual mentions, account-synced
unread emphasis, incoming-message sounds, and drafts only for text channels.
Message alerts now use the same original generated interface-sound controller
as voice join/leave, screen-share start/stop, reconnect success, and actionable
communication failure. These cues run under every visual theme through the
system output, independently of the selected call/soundboard output.
Voice-channel message rows, RPC permissions, and read-state data remain intact
for installed-client compatibility, but the upgraded renderer neither loads,
subscribes to, sends, drafts, notifies, nor shows unread state for them. No
destructive database migration accompanies this client-only boundary.

Voice rooms retain locally persisted microphone/speaker/camera selection,
opt-in 720p camera calls, sidebar occupancy with elapsed timers, mute/deafen,
per-participant volume, remote-track audio/video rendering, autoplay recovery,
reconnect/error states, and the desktop featured screen-share stage. Selecting
a voice channel immediately joins it; selecting another voice channel switches
the active call without a pre-join or initial connection surface. An active call
adds a sidebar control block with room, backend latency, normalized local
LiveKit quality, camera, screen-share, soundboard, and disconnect actions. The
user row retains mute, deafen, and settings. A centered global dock supplies
direct microphone, camera, screen-share, soundboard, More, and disconnect
actions across channel navigation; it reveals at connection, keyboard focus,
or the lower canvas edge and hides after 2.5 seconds idle unless an owned
surface is open. Settings suppresses the dock and provides compact call
controls instead. The soundboard opens as a centered, internally scrolling
480×380 maximum popover above the dock and pins it while retaining category
filtering, member-editable labels, emoji and categories, persisted global
volume, per-participant volume, overlapping activity badges, retry states, and
stop-all. A sender reserves at most five pending/active sounds, the drawer and
global dock expose prominent stop controls, and upgraded clients clamp remote
activity to the newest five events. Participant tiles replace a camera-off
avatar with the newest sound emoji or overlay it on camera video, with overlap
counting and reduced-motion behavior. Deafen suppresses remote speech and local/incoming soundboard
monitoring without blocking outbound soundboard audio. The selected speaker
routes calls and soundboard audio; message alerts remain on system output. Mock
mode exercises these interactions without credentials, a backend, or protected
media.

The hosted project has a private, operator-managed `soundboard` Storage bucket
and a typed Postgres catalog for MP3 assets. Objects are partitioned by server
UUID, limited to MPEG audio under 1 MiB, and readable only by authenticated
members of the matching server. Client file writes are intentionally
unsupported. The renderer downloads authenticated objects after workspace
load, caches blobs in IndexedDB by sound ID and audio revision, and decodes
ready clips into in-memory `AudioBuffer`s. Server members may update only a
sound's label, emoji, and same-server category; file paths, duration, ordering,
enabled state, and audio revision remain operator controlled. Realtime catalog
publication refreshes those edits across connected clients.

The additive
`202607120003_profile_avatars_and_channel_management.sql` migration is tracked
and deployed to the hosted project. It originally added
`profiles.avatar_path`, a private PNG/JPEG/WebP `avatars` bucket,
owner-write/shared-server-read Storage
policies, admin-only `create_channel` and `rename_channel` RPCs, and Realtime
publication for profiles and channels. The renderer, local mock path, and hosted
database contract are implemented; the live two-account acceptance run remains
required before distribution.

The additive `202607170001_rich_profiles.sql` migration is implemented and
deployed. It adds the global profile description, optional avatar-animation,
cover-poster, cover-animation, and required 0–100 cover-focal fields. It expands
the private `avatars` bucket to 5 MiB with GIF support and creates the private
10 MiB `profile-covers` bucket under the same owner-write/shared-server-read
model. The renderer stores a bounded static poster for every upload and retains
only original GIF animations, keeping `avatar_path` compatible with older
clients. Hosted schema lint passes and no migration remains pending. The local
pgTAP run and live two-account media/Realtime acceptance remain open.

The additive
`202607130001_voice_chat_mentions_and_read_state.sql` migration is implemented,
validated locally, and deployed to the hosted project. It adds structured
message content, membership-checked message/read RPCs, private monotonic channel
read states, activity queries, voice-channel message access, Realtime read-state
publication, and safe existing/new-membership read baselines. Upgraded clients
render stable-ID mentions against current profile data while retaining the
generated plain-text body for older clients. The live two-account acceptance
matrix remains open.

The additive `202607140001_voice_join_context.sql` migration is implemented and
deployed. It adds the security-invoker
`get_voice_join_context(channel_id)` RPC, which returns one authorized voice
channel/server/display-name context through the caller's RLS session. The
updated token function verifies the platform-accepted bearer token with
Supabase `getClaims` and consumes this single query instead of making separate
remote user, channel, membership, and profile round trips. Hosted migration
history matches the repository through `202607140001`; `livekit-token` version
5 is ACTIVE with JWT verification enabled. The unauthenticated function and
anonymous RPC probes both return 401. Authenticated member/non-member probes
remain open until reusable test sessions are available.

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
clean local schema, invite, RLS, presence, Storage, catalog, structured-message,
and read-state suite passes 167 assertions. Voice
connections retry once with relay-only ICE after a normal peer-connection
failure, remember a successful relay fallback for ten minutes in memory, and
report a specific TURN/TLS diagnostic if both routes fail. The
tracked token function now accepts an optional backward-compatible purpose.
Ordinary voice tokens permit microphone, camera, LiveKit data, and video-only
screen publication for the compatibility fallback. Native screen companions
receive generated identities and may publish only screen video/audio into the
same room, with no subscriptions, data, or metadata updates. The backward-
compatible function is deployed, and its unauthenticated probe still returns 401. Speech publishes as `bakbak-microphone`. A second audio track named
`bakbak-soundboard` uses the permitted microphone source because the current
LiveKit server SDK cannot encode `Track.Source.Unknown` into token publish
permissions. Mute, participant state, and direct-switch reuse select the named
speech publication, with a non-soundboard microphone fallback for older
clients, instead of relying on same-source publication order. The soundboard
track stays muted while no sound is active, unmutes for playback, and returns
to muted after the final overlapping sound ends or stop-all runs. This prevents
an idle synthetic microphone stream from keeping system audio in a suppressed
communications state. Track name, rather than source, distinguishes soundboard
audio from speech. Explicit stop-all and voice teardown also pause and detach
the local monitor element, stop its routing stream, close its `AudioContext`,
and recreate that graph with the remembered speaker on the next sound. Natural
completion of the final overlapping clip performs the same monitor-stream
flush but keeps the shared `AudioContext` and LiveKit publication alive,
avoiding renegotiation before the next sound. The final Arc-plus-native
voice, video, device, soundboard, reconnect, and crash-expiry rehearsal remains
open for human observation.

Installed macOS 14+ clients can now start a Tauri-owned ScreenCaptureKit
session through Apple's system content picker. A separate native LiveKit room
publishes at most 1080p/15 fps H.264 screen video and optional 48 kHz stereo
source audio while excluding Bakbak's own process audio. Capture retries as
video-only if optional audio cannot start. Source termination, terminal
LiveKit disconnect, voice leave, explicit stop, and main-window close all tear
down capture and the companion. Older macOS and current Windows builds use the
renderer video-only picker when available. The Windows native
`Windows.Graphics.Capture` plus matched application/display audio path remains
open and therefore keeps source audio disabled rather than leaking unrelated
system sound. Linking ScreenCaptureKit directly makes macOS 12.3 the desktop
bundle minimum; macOS 12.3–13 retain the video-only WebView fallback.

The Tauri metadata, window sizing, Content Security Policy, minimal capability
set, Bakbak icons, microphone/camera/screen-capture purpose strings, audio-input
plus camera entitlements, and signed updater are configured. GitHub Actions
validate pull requests and prepare versioned macOS Apple Silicon and Windows
x64 releases. The release build pins Tauri Action v1.0.0 by immutable commit.
Updater manifest verification accepts Tauri's generic platform keys together
with the bundle-specific `darwin-aarch64-app` and `windows-x86_64-nsis`
aliases, validates every included alias has a URL and signature, and rejects
all other targets. The macOS release job uses an explicit macOS 26 arm64 host
because the transitive `apple-metal` Swift bridge requires macOS 26 SDK
symbols; the built application's deployment minimum remains macOS 12.3. Bakbak
v0.4.0 is the final Intel macOS release, and the release workflow rejects Intel
DMGs, updater bundles, and manifest targets without remotely disabling older
clients.
Release version synchronization accepts both LF and Windows CRLF Cargo lockfile
line endings. A hardened-runtime macOS application can be ad-hoc signed locally;
Developer ID signing/notarization and Windows code signing remain deferred as
approved.

## Technology stack

| Layer                | Technology                        | Responsibility                                                                    |
| -------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| Package/tooling      | pnpm, TypeScript                  | Dependency management and strict static types                                     |
| Renderer             | React, Vite                       | Desktop UI and local interaction state                                            |
| Desktop shell        | Tauri 2, Rust                     | Native window, packaging, capabilities, and later tray/desktop integrations       |
| Identity/data        | Supabase Auth, Postgres, Realtime | Accounts, membership, channels, messages, invites, and realtime chat              |
| Trusted backend      | Supabase Edge Functions           | Membership-checked LiveKit token issuance                                         |
| Object media         | Supabase Storage                  | Private sound packs, profile posters, and GIF animations with RLS-filtered access |
| Voice/data transport | LiveKit                           | Voice rooms, participant state, soundboard audio, and control data                |
| Validation/testing   | Zod, Vitest, Testing Library      | Boundary validation and unit/component tests                                      |

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
│       ├── 0002-voice-video-and-presence.md
│       ├── 0003-screen-sharing.md
│       ├── 0004-warm-adda-ui-settings-channels-arm64.md
│       ├── 0005-voice-chat-mentions-settings-accents.md
│       ├── 0006-discord-shaped-bakbak-hearted-ui.md
│       ├── 0007-voice-join-acceleration-and-soundboard-polish.md
│       ├── 0008-rich-animated-profiles.md
│       └── 0009-signal-red-theme-and-interface-audio.md
├── public/
│   ├── bakbak.svg                 # renderer favicon/source logo
│   ├── interface-sounds/          # generated original 48 kHz mono WAV cues
│   ├── signal-noise.svg           # Bakbak-owned tiled texture source
│   └── theme-init.js              # parser-blocking, CSP-safe first-paint theme bootstrap
├── scripts/                       # Secret scan, SemVer, release, and interface-audio generation
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

The renderer uses a three-panel desktop layout plus a modal layer:

1. The 232 px channel panel contains the private server's text and voice rooms,
   active-call/sidebar controls, signed-in user actions, voice occupancy, and
   admin-only create/rename controls.
2. The flexible center canvas contains text chat or the voice room. Header-edge
   buttons independently toggle the left and right panels, immediately
   reallocating space across all four combinations.
3. The 240 px member panel is visible by default and groups online/idle and
   offline members in normal document flow. It is not a drawer or overlay.
4. During a call, an absolute centered dock appears across channel navigation.
   It auto-hides without consuming layout, clears the text composer, remains
   keyboard discoverable, and owns its More menu and compact 480×380 maximum
   soundboard popover anchoring.
5. Selecting a voice channel joins it immediately, and selecting another voice
   channel switches the active call. Hover/focus can prepare one candidate room
   without media or presence side effects; click consumes that work and shows a
   compact stage loader instead of a blank canvas. After connection, one/two-
   person tiles stay compact and larger calls use an equal responsive grid. A
   selected screen share remains featured while participant tiles move into a
   compact horizontal strip.
6. Settings overlays the shell as a centered modal up to 1000×720 with 16–24 px
   viewport margins, left navigation, internal scrolling, focus trap/
   restoration, backdrop/X/Escape dismissal, compact call controls, a live
   rich-profile editor, and confirmed logout. Its focus lifecycle runs once per
   mount so changing parent callbacks, presence, or voice state cannot steal
   focus from a field.
7. One application-owned profile popover anchors to member rows, message
   authors, mentions, voice identities, or the user dock. It prefers the
   trigger's right side, flips/clamps inside the viewport, contains focus, and
   shows only current-server role/presence plus global profile fields.
8. Signal Red adds one fixed, non-interactive effects layer above normal shell
   content (`z-index: 50`) and below profile/dialog/settings surfaces
   (`z-index: 90+`). Ambient stamps use only four safe edge positions and pause
   while the document is hidden or an interactive overlay is open.

The reusable backend health poll measures a Supabase Auth round trip every 30
seconds and labels the result as backend latency. LiveKit
`ConnectionQualityChanged` events separately normalize the local participant as
Unknown/Excellent/Good/Poor; reconnecting display takes precedence. Warm uses
oat/stone light surfaces or charcoal dark surfaces with restrained ambience.
Flat retains the same theme/accent/semantic tokens on grayscale backgrounds but
removes decorative depth. Both modes preserve focus, readable contrast,
reduced-motion behavior, and the supported 1024×680 and 1280×800 layouts.

## Runtime and trust boundaries

### React renderer

The renderer is untrusted for authorization purposes. It may hold a user's
Supabase session, use the public Supabase credential, request permitted data,
connect to LiveKit with a short-lived participant token, and download permitted
sound objects. It must never contain a service-role key or LiveKit API secret.

### Tauri shell

Tauri owns the native window, capabilities, application identity, and desktop
bundles. V1 should expose the smallest capability set needed by the renderer.
The main window enables Tauri's built-in interface zoom hotkeys, providing
Cmd/Ctrl `+`, Cmd/Ctrl `-`, and Cmd/Ctrl `0` through the narrowly scoped
webview-zoom capability.
Native commands are not an authorization substitute for Supabase RLS or Edge
Function validation. The updater capability may check, download, and install a
manifest-signed update, while the process capability is narrowed to restart.
The committed updater public key verifies artifacts; its password-protected
private key must exist only in release infrastructure and an operator backup.
The main Tauri configuration always creates signed updater artifacts, while
`tauri.local.conf.json` disables only those artifacts for local app-only builds
that do not have access to the protected release key.
Screen-capture commands are restricted to the main Bakbak window. Native code
receives only the public LiveKit URL and a five-minute member-authorized token,
never an API signing secret. On macOS it owns the system picker,
ScreenCaptureKit stream, frame/audio conversion, native LiveKit companion, and
deterministic teardown; captured source names are not logged.
The ScreenCaptureKit-to-LiveKit zero-copy boundary transfers its owned
`CVPixelBuffer` retain into LiveKit's macOS native frame wrapper exactly once;
Rust must not release that transferred retain again. A share is reported as
active only after capture registration succeeds and the first usable video
frame arrives. If no frame arrives within five seconds, native capture is
stopped and the renderer receives a retryable error while voice remains
connected. Sanitized lifecycle states and failures are printed to the Tauri
terminal and DevTools without tokens or captured-source labels.
The native Rust LiveKit/WebRTC and ScreenCaptureKit dependencies are macOS
target dependencies. Current Windows builds keep the renderer fallback without
shipping an unused native companion runtime.
The pinned macOS WebRTC archive stores several runtime-only bridges in
Objective-C category objects, which the static linker would normally omit.
The Bakbak build extracts and explicitly links the reviewed category members
from that archive, including the `NSString` conversion and private video-codec
bridges. It does not use the broad `-ObjC` flag because that also force-loads
unrelated ScreenCaptureKit Swift archives and produces duplicate bridge
symbols.

### Supabase

Supabase Auth establishes user identity. Postgres and RLS are authoritative for
profiles, servers, membership, channels, messages, and invite redemption.
Realtime distributes committed messages, profiles, channels, presence, and
sound-catalog changes to authorized subscribers. Security-definer channel RPCs
derive the caller from `auth.uid()` and authorize against the exact server's
admin membership; direct client channel mutations remain denied.

Supabase Storage holds operator-managed sound files and user-managed private
profile media outside the desktop bundle. Soundboard RLS derives read access
from the server UUID path prefix and exposes no client mutation. `avatars` and
`profile-covers` paths begin with their owner's user UUID; only that owner can
insert, replace, or delete an object, while the owner and users sharing any
server with them can read it. Clients never receive bucket-management
authority.

### LiveKit

LiveKit transports a named `bakbak-microphone` speech track, opt-in camera
tracks, at most one named soundboard audio track, desktop screen companions,
participant/speaking state, and small soundboard control messages.
A protected Supabase Edge Function is the only component allowed to sign
LiveKit participant tokens. Voice tokens allow microphone, camera, data, and
video-only screen publication. Screen-companion tokens use generated identities
plus owner metadata and allow only screen video/audio publication into the exact
voice room, without subscriptions or data. Each client identifies the
soundboard track by its exact `bakbak-soundboard` name and applies global
soundboard volume multiplied by the existing participant volume.

## Data model

All identifiers are UUIDs unless noted otherwise. Exact migrations become
authoritative once Phase 2 starts.

| Entity                  | Key fields and constraints                                                                                                                                                                           | Access intent                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `profiles`              | `id` references `auth.users`; 1–50 character display name; 0–190 character description; legacy `avatar_url`; owner-prefixed avatar/cover poster and GIF paths; integer 0–100 cover focal coordinates | User updates their row; shared-server members read member-facing fields                      |
| `servers`               | owner/admin reference, name, timestamps                                                                                                                                                              | Members of the server can read it                                                            |
| `memberships`           | unique `(server_id, user_id)`; v1 admin/member role                                                                                                                                                  | A user can read memberships for servers they belong to                                       |
| `channels`              | `server_id`, trimmed 1–80 character name, ordered position, immutable `text` or `voice` type                                                                                                         | Members read; matching admins create/rename only through RPCs                                |
| `messages`              | text/voice channel ID, author ID, plain-text body, nullable structured text/mention content, timestamps                                                                                              | Members read accessible channels; validated inserts use the message RPC                      |
| `channel_read_states`   | private user/channel key, monotonic last-read message pointer and timestamp                                                                                                                          | The owner reads through RLS; membership-checked RPCs advance/query state                     |
| `invite_codes`          | server ID, one-way code digest, creator, expiry, redemption fields                                                                                                                                   | No broad client read policy; redeemed atomically through a controlled function               |
| `presence_heartbeats`   | unique server/user row, last seen, nullable voice channel/join time                                                                                                                                  | Members can read server rows; only security-definer heartbeat RPCs can write                 |
| `soundboard_categories` | server ID, name, ordered position                                                                                                                                                                    | Members can read; categories are operator managed                                            |
| `soundboard_sounds`     | server/category, label, emoji, Storage path, duration, order, revision                                                                                                                               | Members can read and update label, emoji, or same-server category only                       |
| `storage.objects`       | private `soundboard/<server UUID>/<file>`, `avatars/<owner UUID>/<asset UUID>`, and `profile-covers/<owner UUID>/<asset UUID>` objects                                                               | Sound files are operator-managed; profile owners write/delete and shared-server members read |

Initial admin membership and initial invite codes are managed with reviewed SQL.
An invite-management UI is deferred until post-v1.

## Authorization model

- Authentication alone does not grant server access.
- Membership in the channel's server is required to read server, channel,
  membership, and message data.
- Message authorship is derived from the authenticated user, not trusted from a
  client-supplied user ID.
- `send_message` accepts only exact text/mention segment shapes, validates the
  channel and every mentioned profile against the caller's server membership,
  limits the generated fallback to 4,000 characters and 25 mentions, and writes
  both structured content and an older-client body.
- Channel read states are private to their owner. Clients cannot write the
  table directly; `mark_channel_read` requires channel membership and can only
  advance a pointer, while `get_channel_activity` exposes activity for one of
  the caller's servers.
- Invite redemption is an atomic database operation: validate an unused,
  unexpired code, create the membership, and consume the code in one
  transaction.
- The client cannot list or inspect valid invite codes.
- Profile display names, descriptions, media paths, and cover focal points
  remain canonical in `public.profiles`. Avatar and cover objects must use
  `<auth.uid()>/<generated UUID>`; only the owner writes or deletes, and reads
  require ownership or a shared server membership.
- Direct channel insert, update, and delete privileges stay revoked. The
  `create_channel` and `rename_channel` RPCs derive the caller from
  `auth.uid()`, require admin membership in the affected server, validate names,
  and preserve channel ID and kind during rename.
- The LiveKit token function verifies the caller's Supabase JWT, current server
  membership, and that the requested channel is a voice channel. Platform JWT
  verification remains enabled; the function uses verified `getClaims` output
  and the RLS-protected `get_voice_join_context` RPC rather than decoding an
  unverified token or making serial authorization queries.
- Soundboard objects are private and readable only when the first object-path
  segment matches a server membership for the signed-in user. No authenticated
  client insert, update, or delete policy exists.
- Soundboard catalog rows require matching server membership. Column grants
  limit member updates to `label`, `emoji`, and `category_id`; a composite
  foreign key rejects cross-server category assignment, and clients cannot
  insert or delete sounds or categories.
- RLS tests cover at least seeded admin, member, and non-member identities.

## Data flows

### Authentication and private access

1. The user signs in with Supabase email/password authentication.
2. The renderer loads the user's profile and existing memberships through RLS.
3. A user without membership submits a single-use invite code.
4. The invite redemption database function validates and consumes the code
   atomically, then creates membership.
5. The renderer refreshes membership and channel data.

### Profile, appearance, and modal settings

1. The renderer validates and applies `bakbak.appearancePreferences.v4`
   synchronously before mounting React. A local parser-blocking bootstrap sets
   visual preset, theme, accent, intensity, surface style, and theme-specific
   CSS tokens before the production stylesheet loads; React then installs the
   System media-query listener. Explicit Light or Dark choices ignore OS
   changes. Valid v1/v2/v3 values migrate while preserving supported standard
   fields. Signal Red changes only the effective presentation, so disabling it
   restores the user's exact standard values.
2. Profile edits validate a trimmed 1–50 character display name, a
   190-character plain-text description, integer 0–100 cover coordinates, and
   optional PNG/JPEG/WebP/GIF media. Avatars are limited to 5 MiB, covers to 10
   MiB, and every decoded image to 16 megapixels and 8192 px on either side.
3. The renderer decodes each upload before storage and paints a bounded static
   poster: at most 512 px on the avatar long edge or 1600 px on the cover long
   edge, encoded as WebP with PNG fallback. GIF uploads retain the original
   animation beside the poster; other animated formats are flattened.
4. Changed poster/animation objects upload to
   `<user UUID>/<generated UUID>` before one profile-row update. Any failure
   removes every newly uploaded object. Success mirrors the display name into
   Auth metadata and best-effort deletes replaced/removed objects.
5. One bucket/path-keyed cache deduplicates authenticated downloads and revokes
   object URLs on replacement, sign-out, and teardown. Avatar posters load
   eagerly; compact GIFs load only on identity hover/focus, while cover media
   loads only for an open profile card or editor. Reduced-motion mode never
   requests GIFs. Realtime generation guards stop stale downloads from
   replacing newer profile state.
6. Cover framing uses a fixed 3:1 preview. Pointer drag or keyboard arrows
   update integer focal coordinates; Shift moves by a larger step and Reset
   returns to 50/50.
7. Audio settings retain the existing persisted device selectors and
   soundboard volume plus interface-sound master/volume/category preferences.
   Opening settings does not request media; microphone and output tests acquire
   only the temporary resources required by the explicit test action and
   release them when stopped or unmounted. Preview buttons activate and play
   one category representative through the system output.
8. Settings is a modal overlay over the current canvas. It traps focus, restores
   the opener on close, exposes compact active-call controls, and confirms
   logout. Closing discards staged profile edits and revokes preview URLs; a
   failed save leaves the draft intact for retry. A failed logout leaves the
   overlay open with an inline error.

### Channel management

1. The workspace snapshot exposes the signed-in member's role. Only admins see
   create and rename actions in the channel shelf.
2. The client calls `create_channel` or `rename_channel`; the database derives
   identity, verifies exact-server admin membership, trims and validates the
   name, and maps uniqueness failures to a safe user-facing error.
3. Create locks the server row, finds the maximum position for that server and
   kind, and appends at the next increment of ten. Rename changes only the name,
   preserving the UUID, kind, server, messages, active voice identity, and
   ordering.
4. Channel Realtime subscribes before its catch-up snapshot and replays buffered
   events after the snapshot, so an overlapping create or rename cannot be
   overwritten by stale data. Channels reconcile by stable ID and sort by
   position then ID. Only the creating client selects a new channel; selecting
   a newly created voice channel also joins it automatically.

### Text-channel chat and voice-message compatibility

1. A member selects a text channel. The upgraded renderer loads messages,
   activity, drafts, and Realtime subscriptions only for known text-channel
   IDs.
2. RLS verifies server membership. The deployed RPCs and schema still permit
   voice-channel messages for older clients, but upgraded clients do not expose
   that surface or create invisible voice unread state.
3. A submitted structured draft becomes exact text/mention segments and calls
   `send_message`. Postgres validates membership, segment shape, size, and each
   mention before deriving the author and plain-text fallback.
4. Supabase Realtime broadcasts the committed row to authorized clients.
5. Clients reconcile realtime events with the loaded message list without
   duplicating optimistic messages.
6. A committed message from another user plays a short local notification tone.
   `get_channel_activity` compares the latest message with the account's private
   marker so unread emphasis follows the signed-in user across clients.
7. A visible selected text chat advances the marker through
   `mark_channel_read`. Realtime read-state changes refresh the activity
   snapshot on other signed-in clients.
8. Mention ranges are atomic draft metadata. Editing through one converts it to
   plain text; selecting a member from the accessible `@` combobox stores that
   member ID. Rendering resolves the current Realtime profile name and uses the
   segment fallback only when the member is no longer visible.
9. Composer drafts are controlled by the application shell in a per-channel
   map, so switching rooms or opening settings preserves unfinished messages.

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

1. Live workspace load prepares the public LiveKit endpoint. Pointer hover or
   keyboard focus held for 150 ms prepares only the newest voice channel by
   requesting one five-minute token and calling `Room.prepareConnection`.
   Preparation never requests microphone access, joins, or publishes presence;
   stale candidates and tokens within 30 seconds of expiry are discarded.
2. A click consumes the matching prepared room and in-flight request, or starts
   the same work immediately. In parallel it creates the first microphone
   track. Selecting a different channel generation-gates the previous attempt.
3. The function verifies the bearer token with Supabase `getClaims`; a
   security-invoker RPC returns the authorized voice channel, server, and
   profile display name in one RLS-protected query. The function signs the same
   narrowly scoped, five-minute token and preserves indistinguishable missing,
   text-channel, and non-member responses.
4. After LiveKit connects, the speech track publishes as `bakbak-microphone`
   while output preparation and the existing soundboard-track preparation run
   concurrently. Bakbak still awaits soundboard `ensurePublished` settlement
   before reporting `connected`. Speech selection prefers that exact name and
   falls back to an unnamed, non-soundboard microphone publication for older
   clients.
5. Direct channel switching unpublishes the current microphone without
   stopping it, disconnects the old room, republishes it into the new room, and
   preserves mute/deafen state. Leave, sign-out, a failed switch, and teardown
   stop every retained or pending microphone immediately.
6. The renderer generation-gates all token, connection, and microphone work so
   a stale attempt can disconnect only its own room. A compact polite status
   loader announces authorization, connection, microphone, or soundboard work;
   reconnecting uses the same treatment.
7. Camera remains off through join. An explicit camera action publishes an
   adaptive 720p track. Local video is mirrored; subscribed remote tracks attach
   to participant tiles, and avatar fallbacks remain visible while video is off.
8. The current connection manages microphone, speaker, and camera switches,
   autoplay recovery, mute, deafen, participant, speaking, reconnect, and error
   state. Output switching is capability-checked; unsupported runtimes show
   system output only. A missing remembered device falls back to default.
9. Unsubscription, leaving, disconnecting, and unmounting detach remote audio
   and video, invalidate pending camera/join work, stop active local sounds,
   pause and detach the selected-speaker monitor, stop its MediaStream tracks,
   close its Web Audio context, disconnect the room, and release local tracks.
10. If direct WebRTC fails and relay succeeds, later joins prefer relay for ten
    minutes in memory. Relay-first failure retries direct; expiry periodically
    restores direct probing. A total failure is reported as a TURN/TLS or local
    network-policy problem rather than token/authentication failure.
11. Development builds record preparation, authorization, connection,
    microphone, soundboard, and total timing without identifiers or tokens.
12. `CommunicationEffectEvent` is emitted only after lifecycle truth: self join
    follows the complete connected gate; normal self leave requires an explicit
    user leave; switches emit only the destination join; sign-out, teardown,
    canceled joins, and unexpected disconnects never imitate a normal leave.
    The initial remote roster and share publications are baselined before later
    remote participant/share events become eligible. Native share companions
    are excluded from voice-person events. Reconnect and actionable failure use
    Status events rather than leave.

### Desktop screen share

1. A connected installed client opens a renderer confirmation; source audio is
   unchecked on every start. Browser clients have no share UI and force every
   screen publication unsubscribed.
2. For native capture, the renderer requests `{ channelId, purpose:
"screen_share" }`. The function repeats authentication, membership, and
   voice-channel checks, then signs a five-minute companion identity tied to
   the same room and owner.
3. Tauri validates that the caller is the main window, opens the OS picker, and
   connects a second LiveKit room using only the returned public URL and token.
   It never receives a signing key.
4. macOS publishes H.264 screen video from ScreenCaptureKit at no more than
   1080p/15 fps. Optional 48 kHz stereo source audio excludes Bakbak; if audio
   setup fails, capture retries video-only and the renderer shows a warning.
5. Companion participants are merged into their owner's UI state and omitted
   from ordinary participant cards. Only the featured companion's screen video
   and audio are subscribed. Switching presenter switches both publications;
   owner volume, selected output, and deafen apply to the audio track.
6. Explicit stop, voice leave, source termination, terminal native-room
   disconnect, or main-window close releases capture immediately and closes the
   companion. Multiple app instances may present concurrently, but each app
   instance owns at most one share.
7. Local and remote share lifecycle changes emit typed start/stop effects after
   room baselining. Remote cues play at reduced gain, and deafen suppresses
   remote Voice/Screen-share cues without suppressing self actions, Messages,
   or Status.

### Soundboard

1. After workspace load, the renderer fetches the member-visible categories and
   sounds. It downloads private Storage objects with the signed-in session,
   reuses IndexedDB blobs matching `{ soundId, audioRevision }`, and decodes
   ready clips into memory. Download or decode failure marks only that card as
   failed and can be retried.
2. Voice join publishes at most one room-scoped audio track named
   `bakbak-soundboard`, initially muted. The first active trigger unmutes it;
   each trigger connects its decoded buffer once to the outbound track at unity
   gain and once to the selected-speaker monitor path at the local soundboard
   volume. Clips may overlap, and the track is muted again after the last clip
   ends or stop-all runs so idle playback cannot continue suppressing system
   audio. When the last overlapping clip completes naturally, Bakbak replaces
   only the hidden selected-speaker monitor stream so a non-silent final frame
   cannot cycle in WebKit; the outbound publication and shared context remain
   ready. Explicit stop-all fully releases both the publication and local
   selected-speaker routing graph. The next trigger rebuilds the required graph
   and reapplies the remembered speaker before playback.
3. The client also publishes a reliable UI-control message such as:

   ```json
   {
     "version": 2,
     "type": "soundboard:play",
     "eventId": "019f...",
     "soundId": "00000000-0000-4000-8000-000000002019",
     "sentAt": 1783820000000
   }
   ```

4. Receivers validate version, event ID, sound ID, and timestamp, deduplicate UI
   events, and derive the sender from the LiveKit participant callback. They
   never trust a payload sender or volume and never replay control messages
   locally; remote listeners hear only the participant's LiveKit audio track.
5. Activity state uses the catalog duration. Participant cards show the newest
   emoji, an overlap count up to five, Playing status, and the speaking
   treatment. Camera-off tiles replace the avatar with that emoji; camera-on
   tiles center it over video. Upgraded senders reserve pending/active activity
   before any asset work and reject a sixth start, rolling back reservations on
   every failure. Upgraded receivers render only the newest five events from an
   older sender. Local stop-all also invalidates pending asset starts before
   they can play or publish activity. A reliable `soundboard:stop-all` message
   clears that participant immediately; disconnect, leave, and track cleanup do
   the same.
6. Remote named tracks use `soundboard volume × participant volume`. Normal
   microphone speech keeps only participant volume. Deafen suppresses remote
   audio and the sender's local monitor branch without muting outbound
   soundboard audio.

Unknown message types, stale duplicates, and unknown sound IDs are ignored
safely. Microphone creation and switching explicitly request echo cancellation,
noise suppression, and automatic gain control. These constraints reduce
speaker-to-microphone echo but cannot guarantee acoustic isolation on every
device, so the laptop-speaker two-client check remains required.

### Local preferences

The renderer validates and stores only `{ inputDeviceId, outputDeviceId,
cameraDeviceId, soundboardVolume }` under the versioned local-storage key
`bakbak.devicePreferences.v1`. These identifiers never sync to Supabase. If a
remembered device is absent, the selector returns to the runtime's default
device. Interface cues deliberately bypass the selected call output.
The renderer stores `{ theme, accent, intensity, surfaceStyle, visualPreset }`
separately under `bakbak.appearancePreferences.v4`. Theme is System/Light/Dark,
accent is Coral/Purple/Red/Yellow, intensity is a validated 25–100% five-point
step, surface style is Warm/Flat, and the visual preset is Standard/Signal Red.
It stores `{ enabled, volume, categories }` under
`bakbak.interfaceSoundPreferences.v1`; the default is enabled at 55% with
Messages, Voice, Screen share, and Status enabled. Interface sounds lazily
preload after the first pointer/keyboard interaction, use the Web Audio system
destination, never queue blocked pre-gesture events, cap concurrency at three,
throttle messages to 350 ms, batch remote roster churn for 250 ms, and cool
failure alerts for two seconds. Independent panel visibility remains under
`bakbak.layoutPreferences.v1`; malformed values restore defaults. All of these
preferences are device-local and never part of the profile or Supabase schema.

League Gothic `5.2.8` and IBM Plex Mono `5.2.7` are installed from Fontsource;
both package manifests declare SIL Open Font License 1.1 (`OFL-1.1`). Every WAV
under `public/interface-sounds` is original Bakbak project output from the
checked-in deterministic oscillator/filter/envelope/seeded-noise generator.
The assets contain no recordings or third-party samples.

### Desktop release and update

1. Pull requests run formatting, lint, strict TypeScript, renderer/unit tests,
   release-script tests, version synchronization, production build, secret
   scan, and a locked Rust check.
2. A merge to `main` resolves the next stable SemVer from the newest `v*` tag.
   Patch is the default; `release:minor` and `release:major` labels override it,
   while `release:skip` suppresses documentation-only releases.
3. The release checkout synchronizes the calculated version across
   `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
4. Tauri Action builds macOS `aarch64` and Windows `x86_64` installers with the
   production renderer configuration. Update artifacts are signed with the
   separate Tauri updater key. Intel macOS builds ended at v0.4.0.
5. The workflow holds the GitHub Release as a draft until it verifies exactly
   one Apple Silicon DMG, one NSIS setup executable, no Intel macOS artifacts,
   and one signed `latest.json` entry for each supported target. Unexpected or
   duplicate targets fail manifest verification.
6. After publication, the workflow synchronizes the released version across
   `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, then
   updates the Bakbak package entry in `src-tauri/Cargo.lock`. It then creates
   and immediately merges a protected-branch-compatible version PR. The bot
   commit uses GitHub's workflow token plus a skip annotation, so it cannot
   recursively start another release.
7. Desktop clients check the public GitHub Releases `latest.json` shortly after
   startup. An available update is shown globally; installation and restart
   require an explicit user action so an active conversation is not interrupted.
   Windows uses Tauri's passive installer mode.

Git tags and published Releases are the release source of truth. The tracked
`0.2.0` version is the first-release floor. Release builds inject the resolved
version in their isolated checkouts, and successful publication then advances
the tracked local-development version through an automated PR on `main`.

## Backend contracts

These contracts match the current implementation.

### `POST /functions/v1/livekit-token`

- **Authentication:** `Authorization: Bearer <Supabase access token>`
- **Request:** `{ "channelId": "<voice-channel-uuid>", "purpose": "voice|screen_share" }`; `purpose` is optional and defaults to `voice` for installed-client compatibility
- **Success:** `{ "token": "<short-lived-token>", "serverUrl": "wss://...", "roomName": "bakbak-voice-<channel-id>", "expiresAt": "<ISO timestamp>" }`
- **Validation:** platform JWT gate plus verified Supabase claims, current
  server membership, existing voice channel, server-derived participant
  identity/room name, and an allowed
  purpose. Screen companions receive exact source grants and no subscribe/data
  permissions.
- **Errors:** normalized unauthorized, origin/method/payload,
  not-found/invalid-channel, request-failed, and service-unavailable responses
  without secret details.

### `POST /rest/v1/rpc/get_voice_join_context`

- **Authentication:** valid Supabase user session
- **Request:** `{ "p_channel_id": "<voice-channel-uuid>" }`
- **Success:** one row containing the authorized channel ID, server ID, and the
  caller's profile display name
- **Validation:** security-invoker execution under the caller's RLS context,
  current matching server membership, and `voice` channel kind
- **Errors:** missing, text, non-member, and cross-server channels return no
  row, preserving the token endpoint's indistinguishable not-found response

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

### `POST /rest/v1/rpc/create_channel`

- **Authentication:** valid Supabase user session
- **Request:** `{ "p_server_id": "<server-uuid>", "p_kind": "text|voice", "p_name": "<name>" }`
- **Success:** the created `channels` row
- **Validation:** `auth.uid()` identity, matching server admin membership,
  trimmed 1–80 character name, valid kind, and case-insensitive uniqueness
- **Behavior:** locks the server row and assigns the next position in increments
  of ten within the requested kind

### `POST /rest/v1/rpc/rename_channel`

- **Authentication:** valid Supabase user session
- **Request:** `{ "p_channel_id": "<channel-uuid>", "p_name": "<name>" }`
- **Success:** the renamed `channels` row
- **Validation:** `auth.uid()` identity, matching server admin membership,
  trimmed 1–80 character name, and case-insensitive uniqueness
- **Behavior:** changes only the name; ID, server, kind, position, history, and
  active voice identity remain stable

### `POST /rest/v1/rpc/send_message`

- **Authentication:** valid Supabase user session
- **Request:** `{ "p_channel_id": "<channel-uuid>", "p_content": [segments] }`
- **Success:** the inserted message row with generated plain-text body and
  structured content
- **Validation:** matching text/voice channel membership, 1–100 exact text or
  mention segments, at most 4,000 fallback characters, at most 25 mentions, and
  every mentioned UUID belonging to the channel's server
- **Behavior:** derives the author and current mention fallback names inside the
  database; direct authenticated message inserts remain unsupported for upgraded
  clients

### `POST /rest/v1/rpc/get_channel_activity`

- **Authentication:** valid Supabase user session
- **Request:** `{ "p_server_id": "<server-uuid>" }`
- **Success:** one row per server channel with latest/read pointers and unread
  status for messages authored by other users
- **Validation:** current membership in the requested server

### `POST /rest/v1/rpc/mark_channel_read`

- **Authentication:** valid Supabase user session
- **Request:** `{ "p_channel_id": "<channel-uuid>", "p_message_id": "<message-uuid>" }`
- **Success:** the caller's current channel read-state row
- **Validation:** current membership and a message belonging to that channel
- **Behavior:** advances by message `(created_at, id)` order and never regresses

Messages, profile updates, and private read-state events use Supabase Realtime
under RLS. Private profile posters and GIF animations use authenticated Storage
operations; v1 does not require another custom service endpoint.

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
bundle. Database phases add Supabase migration/RLS and Storage-policy tests;
profile/channel work specifically covers avatar/cover owner, shared-member,
cross-server and outsider access, field validation, plus admin/member channel
RPC behavior. The
first friend-test release also requires the manual Apple Silicon macOS matrix
in the active plans.
Screen-sharing work additionally runs the Deno token suite, focused Rust tests,
`cargo check --locked`, macOS and Windows native builds, compiled secret scans,
and the bidirectional installed-client matrix in plan 0003. Artifact sizes are
recorded before and after the native LiveKit dependency is shipped.

GitHub release validation additionally requires successful Apple Silicon macOS
and Windows x64 native builds, updater signatures for both targets, exactly one
ARM64 DMG, one NSIS executable, no Intel macOS artifact, and a complete
version-matched `latest.json` containing only the two supported targets. A
release remains a draft when any platform or manifest check fails. Ubuntu
validation runners install Tauri's WebKitGTK, GLib-transitive,
AppIndicator, SVG, X11 automation, OpenSSL, and compiler development packages
before invoking Cargo.

Security validation must scan built renderer and desktop artifacts for forbidden
service-role or LiveKit secret values. Record commands, results, and skipped
checks in `docs/progress.md`; this document describes the strategy, not a claim
that it has passed.

## Current limitations and deferred work

- Plan 0006's three-panel shell, centered settings modal, Flat surfaces,
  text-only upgraded chat boundary, sidebar call controls, floating dock, and
  simplified voice canvas pass automated and mock-browser validation. The
  canonical browser-plus-native two-account call still requires human audio,
  camera, screen-share, soundboard, quality, reconnect, and dual-control-surface
  observation before distribution.
- Plan 0007's prepared-room lifecycle, claims validation, microphone reuse,
  loader, participant sizing, sound emoji treatment, and five-sound controls
  pass automated and mock-browser validation, and its migration/token function
  are deployed with the JWT gate preserved. Authenticated member/non-member
  probes, real hosted warm/cold timing, and the two-account media rehearsal
  remain required before the latency targets can be claimed.
- Plan 0008's Settings focus repair, poster/GIF pipeline, lazy media cache,
  anchored profile card, privacy boundary, and reduced-motion behavior pass
  automated and mock-browser validation at both supported viewport sizes. The
  hosted additive migration is deployed and linted. Docker-backed pgTAP,
  installed-app theme/reduced-motion observation, and the live two-account
  media/Realtime/outsider matrix remain required before distribution.
- Plan 0009's Signal Red preset, first-paint migration, edge effects,
  reduced-motion behavior, generated sound pack, sound controller, preferences,
  and typed lifecycle routing pass automated and mock-browser validation at
  both supported viewport sizes. Installed-app multi-client audio observation
  remains required for rapid messages, simultaneous joins/leaves, screen
  sharing, reconnect, deafen, and a call output different from the system
  output.
- The Warm Adda renderer, profile/avatar services, channel RPCs, and policies
  are implemented, and migration
  `202607120003_profile_avatars_and_channel_management.sql` is deployed to the
  hosted project. Live Realtime/profile/channel behavior still requires the
  browser-plus-native two-account acceptance run in plan 0004.
- Hosted migration `006` and the camera-capable token function are deployed,
  but the Arc-plus-installed-app voice/video/device acceptance matrix still
  requires two signed-in users and human audio/video observation.
- The hosted soundboard catalog, member metadata editing, authenticated cache,
  and named LiveKit audio track are deployed, but exact-once playback,
  laptop-speaker acoustic echo, output switching, volume multiplication,
  reconnect, and cleanup still require the planned two-client human acceptance
  run. Distribution rights for all 23 MP3s must be confirmed before friend
  testing.
- LiveKit's current server SDK throws while encoding `Track.Source.Unknown` in
  a token source allowlist. Bakbak therefore publishes the dedicated named
  soundboard track as a second microphone-source track and distinguishes it by
  `bakbak-soundboard`; speech is independently named `bakbak-microphone` so mute
  and reuse never depend on publication order.
- macOS 14+ native video and matched source audio are implemented. Older macOS
  and current Windows builds expose only WebView video sharing when
  `getDisplayMedia` exists. The Windows native picker, process/display-matched
  audio implementation, Windows CI build, cross-platform two-account matrix,
  and before/after installer-size measurements remain required by plan 0003.
- The current production renderer is roughly 283 kB compressed; LiveKit and
  Supabase can be lazy-loaded in a later performance pass if startup profiling
  shows a meaningful benefit.
- The macOS app uses an ad-hoc hardened-runtime signature with audio-input and
  camera entitlements, but has no Developer ID signature or notarization, so
  Gatekeeper warnings are expected outside the development machine.
- The Windows release job produces an unsigned x64 NSIS installer until a
  Windows code-signing identity is configured, so SmartScreen warnings are
  expected during the initial friend test.
- GitHub Actions has the public renderer variables and updater-signing secrets.
  The release matrix now builds an updater-enabled app plus one DMG on the
  explicit macOS 26 arm64 host and an NSIS installer on Windows. The
  Apple-Silicon-only asset/manifest checks still need a hosted run; v0.4.0 is
  the preserved final Intel release.
- Browser/Linux screen sharing, recording, camera effects, user sound uploads,
  additional roles, global push-to-talk, notifications, tray behavior, Linux
  distribution, and operating-system signing/notarization remain outside the
  approved phases.
- Protected or DRM-controlled sources may be black or silent; Bakbak does not
  bypass operating-system capture policy.
