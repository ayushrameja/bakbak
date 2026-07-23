# Bakbak architecture

This document is the mutable, current source of truth for Bakbak's structure,
runtime boundaries, service contracts, data flow, and environment variables.
Historical work and verification belong in `docs/progress.md`; accepted scope
and phase completion belong in the numbered files under `docs/plans`.

## Current implementation state

As of 2026-07-24, Bakbak has a complete local/mock product path and production
Supabase and LiveKit adapters. The renderer provides the invite-only welcome
flow and one shared neutral glass shell with scoped semantic control colors. An
always-present 48 px titlebar
places the 232 px Personal/Bakbak switch at the left and a rotating idle or
voice-aware joke at the true signed-in window centre without interrupting
voice. One titlebar-level event boundary makes every non-control pixel a native
drag/double-click region; startup,
authentication, and invite-only states keep a navigation-free titlebar while
their main content owns product branding. The titlebar's right edge holds both
side-panel toggles and Windows window controls, leaving the contextual header
dedicated to the current person or room.
macOS retains native overlay traffic lights and uses an active-state-following
`underWindowBackground` material. Windows uses renderer-owned controls and
applies Mica on build 22000 or newer; Windows 10 and browser/mock mode use an
opaque CSS underlay. The edge-to-edge shell keeps five tracks: the 232 px
context panel, a 1 px separator with a 9 px resize hit area, the conversation
canvas at a minimum 420 px, a second separator, and the 240 px details panel.
Both side panels remain mounted but become inert while independently hidden;
pointer/keyboard resizing stays within 200–360 px and v2 layout preferences
persist widths and visibility per device. Settings is a centered, focus-trapped
in-app modal with internal scrolling, active-call controls, and confirmed
logout. Its Data & storage section reports the current account's bounded
conversation/profile cache, freshness, and confirmed local clearing without
removing cloud data, authentication, or device/appearance preferences.

Appearance has one neutral glass treatment without global decorative texture,
chromatic glow, selectable accents, or heavy shadows. A device-local scheme
choice offers Auto, Light, and Dark: Auto follows `prefers-color-scheme`, while
the explicit choices apply before React mounts and update the matching
`theme-color` metadata. Dark mode uses near-black translucent panels; light
mode uses neutral-white translucent panels. Primary chrome uses 24 px blur at
120% saturation while avatars, covers, emoji, camera video, and screen sharing
remain untouched. Ordinary chrome remains grayscale. The Bakbak motion identity
uses a minimal open ring facing three message particles: a generated static
raster drives the favicon and native icon bundle, while a code-native SVG
animates the jaws and particles on authentication, invite, loading, and empty
Personal surfaces. The server header intentionally omits that logo: it pairs
a fixed Bakbak wordmark with a compact `β · vX.Y.Z` chip whose value comes from
the renderer's package metadata. Its solid surface, fine monochrome noise,
border, and orbit lines respond to the active light/dark scheme. Only the
nearest particle on animated-mark surfaces uses a bounded lime accent; the
identity has no gradient, glow, or character face. Scoped
Discord-inspired
positive, danger, selected, warning, and
icon tokens identify call controls, presence, streaming, and admin state with
verified light/dark contrast. Appearance Settings exposes only the three scheme
choices plus the `Glass` surface summary; typography controls remain absent.
Legacy `bakbak.appearancePreferences.*` values are inert and intentionally left
in local storage. Roundo v2.0 is served from a committed
variable WOFF2 with upright weights 200–700 and a generic sans-serif fallback
for unsupported glyphs; product UI uses only 500, 600, and 700, never renders
below 11 px, and gives chat/composer text a 15 px weight-500 baseline. Profiles
support validated display names, 190-character plain-text
descriptions, static or GIF avatars, 3:1 static or GIF covers, integer cover
focal points, lazy static member-row cover accents, and an accessible
Discord-style anchored card. Admin-only
controls create or rename text and voice channels, while Realtime reconciles
changes for every member. Ordered channel categories reproduce the visible
Unlucky Boys layout: 7 categories, 18 text rooms, and 6 voice rooms in the same
mixed order. This layout imports no Discord messages or credentials.

Upgraded clients expose chat, structured individual mentions, account-synced
unread emphasis, incoming-message sounds, and drafts only for text channels.
One original soft, rounded interface-sound controller covers committed message
send, incoming messages, successful microphone mute/unmute, self/remote voice
join/leave, local/remote screen-share start/stop, reconnect success, and
actionable communication failure. These cues run through the system output,
independently of the selected call/soundboard output.
Voice-channel message rows, RPC permissions, and read-state data remain intact
for installed-client compatibility, but the upgraded renderer neither loads,
subscribes to, sends, drafts, notifies, nor shows unread state for them. No
destructive database migration accompanies this client-only boundary.

Text channels and Personal DMs now share the plan 0022 rich-message boundary.
A draft may contain structured text/mentions plus up to four private
image/GIF/H.264 MP4 attachments, one standalone Bakbak sticker, or one GIPHY
GIF/sticker with an optional text caption, and may quote one visible message
in the same thread. The shared Discord-shaped composer keeps attachment on the
left, text in the flexible centre, and supported GIF, Bakbak sticker, searchable
native emoji, and send actions on the right. Emoji insertion respects the
current text selection and preserves structured mention ranges. In its resting
state, the composer wrapper and sidebar user dock share a 68 px footer band;
the 52 px message bar receives an even 8 px vertical inset so both surfaces
share one centre line across the panel separator.
Replies notify the other author by default, self/deleted/former-author
notifications are disabled by the database, and author deletion leaves a
scrubbed tombstone so read pointers and reply references remain valid. Message
hover/focus actions provide Reply, Bakbak sticker reaction, and author-only
Delete. Message INSERT/UPDATE and sticker/reaction events hydrate the complete
row before replacing the cache, avoiding cross-table Realtime ordering
assumptions. Existing `send_message` and `send_direct_message` remain available
for installed-client compatibility; v2 sends generate `[Image]`, `[Video]`,
`[GIF]`, or `[Sticker]` fallback bodies.

Voice rooms retain locally persisted microphone/speaker/camera selection,
opt-in 720p camera calls, sidebar occupancy with elapsed timers, mute/deafen,
per-participant volume, remote-track audio/video rendering, autoplay recovery,
reconnect/error states, and a unified participant/screen-share media gallery.
Microphone capture keeps WebRTC echo cancellation, noise suppression, and
automatic gain control, then defaults to a second device-local RNNoise stage in
a 48 kHz AudioWorklet before LiveKit publication. Audio settings can disable
that stage or select Natural, Child, Robot, or Walkie-talkie output; effects
apply only to the named speech track and never to the soundboard. Unsupported
or failed processing falls back to the built-in capture cleanup without
blocking the call. The explicit microphone test plays that same processed
preview through the selected call output while rendering its level, and
releases the monitor, stream, processor, and analyser together on stop.
Selecting a voice channel immediately joins it; selecting another voice channel switches
the active call without a pre-join or initial connection surface. An active call
adds a sidebar control block with room, backend latency, normalized local
LiveKit quality, camera, screen-share, soundboard, and disconnect actions. The
user row retains mute, deafen, and settings. A centered global dock supplies
direct microphone, camera, screen-share, soundboard, More, and disconnect
actions across channel navigation; it reveals at connection, keyboard focus,
or the lower canvas edge and hides after 2.5 seconds idle unless an owned
surface is open. Settings suppresses the dock and provides compact call
controls instead. The soundboard opens as a centered, internally scrolling
480×380 maximum popover above the dock and pins it. Independently collapsible
Favorites, System, and Bakbak sections replace category filters; Favorites and
Bakbak open by default, System starts collapsed, and device-local state is
stored per server. Search temporarily reveals matching sections without
rewriting that preference. Account-synced stars duplicate a sound in Favorites
without moving it from System or Bakbak. Uploaders and server admins may edit
labels/emoji or delete member sounds, while only admins manage operator sounds.
The drawer retains persisted global volume, per-participant volume, overlapping
activity badges, retry states, and stop-all. A sender reserves at most five
pending/active sounds; the drawer overlays a standalone bottom-right circular
stop action on a theme-responsive transparent-to-dark/light corner scrim, with
the active `n/5` counter immediately to its left. The drawer has no dedicated
stop footer; the global voice dock remains the full bottom-bar treatment and
keeps its compact stop action. Upgraded clients clamp remote activity to the
newest five events.
Participant tiles replace a camera-off
avatar with the newest sound emoji or overlay it on camera video, with overlap
counting and reduced-motion behavior. Deafen suppresses remote speech and local/incoming soundboard
monitoring without blocking outbound soundboard audio. The selected speaker
routes calls and soundboard audio; message alerts remain on system output. Mock
mode exercises these interactions without credentials, a backend, or protected
media. Output fallback and speaker-switch failures appear as eight-second
notices with immediate review and dismiss actions instead of persistent room
banners.

The hosted project has a private `soundboard` Storage bucket and a typed
Postgres catalog with System and Bakbak categories. System contains the
original 23 operator sounds; Bakbak contains the 21 imported Unlucky Boys clips
and is the sole member-upload target. Existing imports retain stable
`discord-<Discord sound ID>.mp3` names. New member objects use
`<server>/<uploader>/<uuid>.wav`; only the authenticated
`soundboard-manage` Edge Function can create or remove them. Direct renderer
Storage writes and catalog insertion/deletion remain unsupported. The renderer
downloads authenticated objects, caches blobs in IndexedDB by sound ID and
audio revision, and decodes ready clips into memory. `created_by = null`
identifies operator-managed sounds; uploaders and matching server admins may
update only labels and emoji. Favorites are owner-private rows and Realtime
publishes catalog changes plus the signed-in user's stars.

The separate `bakbak-cache` IndexedDB database stores account-scoped workspace
metadata, recent channel/DM messages, and authenticated profile-media blobs.
It renders only after the Supabase session identifies its owner, remains a
display cache rather than an authorization source, and stays after logout until
that account clears it. Threads retain the newest 200 confirmed messages.
Profile media uses bucket/path revisions and a 256 MiB per-account
least-recently-used ceiling. Schema v2 adds a separate 256 MiB/account LRU for
authenticated message and sticker posters. Cached message metadata strips
transient object URLs; full video, original animated media, GIPHY URLs, and
GIPHY assets are never persisted. Data & storage clearing removes both media
caches without touching cloud content.

Private `message-media` and `message-stickers` Storage buckets back rich
messages. The authenticated `message-media-manage` Edge Function reserves
UUID paths, issues signed resumable-upload tokens, cleans stale reservations,
cancels failures, and removes authored-message objects after the trusted
deletion RPC. The renderer sends those scoped tokens to Storage's signed TUS
endpoint at `/storage/v1/upload/resumable/sign` with only the public project key
and `x-signature`; it has no direct object-insert policy. Publication links
every uploaded object in the same transaction as its message and verifies both
reserved objects exist. The
`sticker-manage` function validates bounded PNG/WebP/GIF files, publishes
member stickers under transactional 25/member, 200/server, and 1 GiB/user
quotas, and lets uploaders or server admins archive them. Referenced archived
stickers remain readable for history. GIPHY requests go directly from the
renderer with rating `r`, the `messaging_non_clips` bundle, 20-result pages,
required attribution and analytics; only provider IDs and display metadata are
stored.

Member upload sources may be common `audio/*` or `video/*` files up to 25 MiB.
The upload modal uses native metadata/playback for preview and selection, then
lazily loads a locally bundled single-thread FFmpeg WebAssembly worker. It
extracts a selected 0.1–5 second window as 48 kHz mono signed 16-bit PCM WAV;
the source file and source video never leave the device. The hosted function
revalidates verified claims, membership, the one upload category, WAV structure
and format, actual duration/size, and transactional 25-per-member/200-per-server
active quotas before publication. Operator sounds do not consume quota. The
reduced LGPL core is 1,539,655 bytes versus 32,232,419 bytes for the stock core;
the reproducible source recipe, exact hashes, enabled codecs, and notices live
under `third_party/ffmpeg-soundboard`.

The additive
`202607120003_profile_avatars_and_channel_management.sql` migration is tracked
and deployed to the hosted project. It originally added
`profiles.avatar_path`, a private PNG/JPEG/WebP `avatars` bucket,
owner-write/shared-server-read Storage
policies, admin-only `create_channel` and `rename_channel` RPCs, and Realtime
publication for profiles and channels. The renderer, local mock path, and hosted
database contract are implemented; the live two-account acceptance run remains
required before distribution.

The additive
`202607180003_unlucky_boys_channel_layout.sql` migration is implemented,
validated, and deployed. It adds member-readable, operator-managed ordered
channel categories and assigns the exact visible Unlucky Boys hierarchy to 24
rooms. The four original channel UUIDs become `spawn`, `law`, `Queue`, and
`Crash`, preserving existing messages, read state, presence, and LiveKit room
identity; matching admin-created rooms are also reused rather than duplicated.
The hosted migration adopted the existing `gaane` text room under Welcome. No
message row is inserted, updated, or deleted. New admin-created rooms remain
uncategorized. All rooms retain the current server-member visibility boundary,
including the five names that were lock-marked in Discord; channel-level ACL
parity is deferred.

The additive `202607170001_rich_profiles.sql` migration is implemented and
deployed. It adds the global profile description, optional avatar-animation,
cover-poster, cover-animation, and required 0–100 cover-focal fields. It expands
the private `avatars` bucket to 5 MiB with GIF support and creates the private
10 MiB `profile-covers` bucket under the same owner-write/shared-server-read
model. The renderer stores a bounded static poster for every upload and retains
only original GIF animations, keeping `avatar_path` compatible with older
clients. Hosted schema lint passes through the deployed rich-profile
migration. The local pgTAP suite passes; the live two-account media/Realtime
acceptance remains open.

The additive
`202607190001_signature_personal_dms_and_live_presence.sql` migration is
implemented, validated locally, and deployed to the hosted project. It adds canonical
one-to-one conversations, participant-private structured messages,
owner-private read states, participant-preserving profile/media visibility, and
Realtime publication for all three tables. Conversation creation requires
current shared-server membership, but established participants retain
read/write/profile/media access after that shared membership disappears. The
same migration adds `presence_heartbeats.is_streaming` and
`heartbeat_presence_v3`; older heartbeat RPCs remain executable and
deliberately clear LIVE to prevent stale state. The renderer also falls back
from v3 to v2 writes and legacy column reads when pointed at an older or
rolled-back project. The clean reset, hosted schema lint, and 288-assertion
pgTAP suite pass. Hosted admin/member/outsider and installed multi-client
acceptance remain open.

The additive `202607230001_rich_messaging.sql` migration is implemented,
validated, and deployed to the hosted project. It preserves the legacy send
RPCs, adds v2 channel/DM message contracts, private attachment reservations,
the server sticker catalog, partial-unique sticker reactions, soft deletion,
poster/original Storage RLS, deleted-message-aware activity, transactional
quotas, and Realtime publication. The `message-media-manage` and
`sticker-manage` functions are also deployed; unauthenticated hosted probes
return HTTP 401. The clean local reset and 331-assertion pgTAP suite pass. The
GitHub Actions `VITE_GIPHY_API_KEY` repository variable, renderer rollout,
hosted two-account acceptance, and installed macOS/Windows acceptance remain
open.

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
read-state, rich-profile, soundboard favorite, and member-upload suite passes
288 assertions. Voice
connections retry once with relay-only ICE after a normal peer-connection
failure, remember a successful relay fallback for ten minutes in
LiveKit-host-scoped device storage, and
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
audio from speech. Every clip applies a 20 ms final envelope to digital zero on
both outbound and local paths, and manual stops zero that envelope before
stopping the source. Explicit stop-all and voice teardown synchronously finish
and disconnect every active source, invalidate in-flight playback/publication,
hard-mute the local monitor element, stop its routing stream, close its
`AudioContext`, and recreate that graph with the remembered speaker on the next
sound. Natural completion of the final overlapping clip hard-mutes and flushes
the same monitor stream but keeps the shared `AudioContext` and LiveKit
publication alive, avoiding renegotiation before the next sound. Receiver-side
soundboard elements mirror LiveKit mute/unmute state and hard-mute immediately
on a synchronized stop event, preventing a retained final WebKit frame from
remaining audible. The final Arc-plus-native
voice, video, device, soundboard, reconnect, and crash-expiry rehearsal remains
open for human observation.

Installed macOS 14+ and Windows clients share one Bakbak Entire screen /
Application picker before capture starts. macOS enumerates displays and running
applications asynchronously through ScreenCaptureKit with a bounded wait;
resolved filters use ScreenCaptureKit's point-to-pixel metadata so Retina
application capture retains its actual pixel dimensions. Windows uses
privacy-filtered native monitor/window handles, and the renderer never guesses
a process from a window title. A separate least-privilege LiveKit room publishes
H.264 video with presenter-selected 480p/720p/1080p and 15/30/60-fps ceilings.
The default is 1080p/60, the last successful quality is device-local, and source
audio defaults on whenever matched audio is available for the selected source
(not persisted). macOS captures optional 48 kHz stereo matched source audio
while excluding Bakbak and retries video-only if audio fails. Windows has direct
free-threaded
`Windows.Graphics.Capture`, D3D11 frame delivery and staging readback,
resize/quality frame-pool reconfiguration, time-bounded in-memory picker
previews, and CPU BGRA scaling/color conversion to I420 for LiveKit. On Windows
build 20348 or newer, WASAPI process loopback includes the selected
application's process tree or excludes Bakbak's process tree for a display;
older builds keep video enabled and report why audio is unavailable.
Source termination, terminal LiveKit disconnect, voice leave, explicit stop,
and main-window close tear down capture and the companion.
Linking ScreenCaptureKit directly makes macOS 12.3 the desktop bundle minimum;
macOS 12.3–13 retain the video-only WebView fallback.

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

| Layer                | Technology                        | Responsibility                                                                            |
| -------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| Package/tooling      | pnpm, TypeScript                  | Dependency management and strict static types                                             |
| Renderer             | React, Vite                       | Desktop UI, local interaction state, and stale-while-revalidate restoration               |
| Local read cache     | IndexedDB                         | User-scoped workspace, recent messages, and bounded authenticated profile/message posters |
| Desktop shell        | Tauri 2, Rust                     | Native window, packaging, capabilities, and later tray/desktop integrations               |
| Identity/data        | Supabase Auth, Postgres, Realtime | Accounts, membership, channels, messages, invites, and realtime chat                      |
| Trusted backend      | Supabase Edge Functions           | Membership-checked voice tokens plus managed sound/message/sticker media                  |
| Object media         | Supabase Storage                  | Private sound, profile, message, video, and sticker objects with RLS-filtered access      |
| Local microphone DSP | Web Audio, RNNoise WebAssembly    | Off-thread enhanced cleanup plus opt-in sender-side voice effects                         |
| Voice/data transport | LiveKit                           | Voice rooms, participant state, processed speech, soundboard audio, and control data      |
| Validation/testing   | Zod, Vitest, Testing Library      | Boundary validation and unit/component tests                                              |

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
│       ├── 0009-signal-red-theme-and-interface-audio.md
│       ├── 0010-cross-platform-screen-share-and-focus.md
│       ├── 0011-soundboard-categories-favorites-and-uploads.md
│       ├── 0012-unlucky-boys-channel-layout.md
│       ├── 0013-local-microphone-processing-and-voice-lab.md
│       ├── 0014-bakbak-signature-shell-personal-dms-live-watching.md
│       ├── 0015-screen-share-reliability-and-call-layout.md
│       ├── 0016-flat-monochrome-roundo.md
│       ├── 0017-space-efficient-titlebar-and-comfortable-roundo.md
│       ├── 0018-native-glass-edge-to-edge-motion.md
│       ├── 0019-discord-inspired-controls-and-member-rail.md
│       ├── 0020-bakbak-orbit-branding.md
│       ├── 0021-instant-workspace-local-cache-and-voice-acceleration.md
│       ├── 0022-rich-messaging-media-replies-stickers.md
│       └── 0023-modern-interface-audio.md
├── public/
│   ├── bakbak-orbit.png           # generated favicon/native-icon source frame
│   ├── brand-noise.svg            # theme-tinted brand-surface noise tile
│   ├── fonts/roundo/              # pinned Roundo v2.0 variable WOFF2
│   ├── interface-sounds/          # generated original 48 kHz mono WAV cues
│   └── vendor/
│       ├── ffmpeg/                # lazy reduced LGPL core and license
│       └── rnnoise/               # bundled RNNoise/Jitsi license notices
├── scripts/                       # checks, release/audio generation, reduced-core build
├── third_party/roundo/             # Roundo source record and SIL OFL notice
├── src/
│   ├── app/                       # application shell, routing, providers
│   ├── components/                # reusable UI, including the SVG motion mark
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
├── third_party/
│   └── ffmpeg-soundboard/         # pinned reduced-core recipe and notices
└── supabase/
    ├── functions/
    │   ├── livekit-token/
    │   └── soundboard-manage/
    ├── migrations/
    ├── seed.sql
    └── tests/                     # RLS and database behavior tests
```

The feature folders shown above contain the implemented v1 slices; empty
architectural placeholder folders are not used.

## UI composition

The renderer uses a titlebar, three-panel desktop layout, and modal layer:

1. The 48 px titlebar owns window drag behavior. Its left side holds the 232 px
   Personal/Bakbak switch after an 88 px macOS traffic-light safe area, while
   a deterministic eight-second idle joke cycle occupies an independent center
   grid track so unequal edge controls cannot displace it. Connecting,
   connected, reconnecting, and failed voice states replace the line
   immediately with room-aware copy. One handler on the complete titlebar starts
   native drag and double-click maximize from every non-control descendant and
   blank region; the Personal/Bakbak navigation, panel controls, and Windows
   controls are explicitly excluded. Unread and active-call markers remain attached
   to their spaces, blocking dialogs disable space and panel navigation while
   leaving native window controls available, and voice fullscreen temporarily
   removes the titlebar. Its right-edge layout controls independently toggle
   the context and details panels. A separate 60 px contextual header beneath
   it is dedicated to the current conversation or room.
2. The 232 px channel panel contains seven ordered Unlucky Boys categories with
   18 text rooms and six voice rooms in mixed source order, plus
   active-call/sidebar controls, a shared Personal/server user footer with the
   signed-in member's authenticated static cover poster behind its identity and
   controls, voice occupancy, and
   admin-only create/rename controls. The shelf scrolls independently; admin
   creation adds an uncategorized room because category management is outside
   plan 0012. Occupied rooms show one room-active timer; their compact occupant
   rows omit personal timers/local suffixes and ring the current room's active
   speakers.
3. The flexible center canvas contains text chat or the voice room. The shell
   has no outer padding, gutters, rounding, outlines, or panel shadows; two
   straight 1 px separators define its edges. Titlebar buttons independently
   toggle the left and right tracks over 220 ms. Pointer resizing temporarily
   removes that grid transition so the conversation canvas follows every drag
   update immediately, clears any existing browser selection, and disables
   selection until pointer release/cancel. Persistent clipping slots keep each
   side component mounted while hidden, but `inert`, `aria-hidden`, and a
   disabled resizer prevent interaction during the zero-width state.
4. The 240 px member panel is visible by default and groups unique members as
   In Voice, Online, and Offline in normal document flow, with a visible 5 px
   separation between its compact member surfaces. Known heartbeat
   sessions merge with the current LiveKit room so active members appear before
   the next heartbeat. Rows lazily load static cover posters through the shared
   authenticated cache, preserve focal positioning, and never request cover
   animation. It is not a drawer or overlay.
   Space changes replace any in-flight 0/40/80 ms left/center/right entrance
   sequence rather than queueing transitions, while voice and draft ownership
   remains above the animated subtrees.
5. During a call, an absolute centered dock appears across channel navigation.
   It auto-hides without consuming layout, clears the text composer, remains
   keyboard discoverable, and owns its More menu and compact 480×380 maximum
   soundboard popover anchoring.
6. Selecting a voice channel joins it immediately, and selecting another voice
   channel switches the active call. Hover/focus can prepare one candidate room
   without media or presence side effects; click consumes that work and shows a
   compact stage loader instead of a blank canvas. A disconnected room offers
   a concise rejoin action instead of going blank. After connection, people and
   active shares share one centered, count-aware 16:9 gallery. Tiles are
   bounded from 520 px for one target through 240–300 px auto-fit tiles for
   seven or more. Clicking either opens a single media-first focused stage with
   bottom-overlay Back/fullscreen controls and no metadata header or people
   strip. Clicking the active media or Back to grid returns to the gallery;
   watched share playback continues there, while target loss also clears its
   subscription.
7. Shared dialogs use compact/default/wide widths, responsive viewport padding,
   and a `100dvh`-bounded grid with a fixed header, internally scrollable body,
   and sticky wrapping footer actions. Buttons stack at narrow widths. The
   layer stays above the soundboard while retaining focus
   trapping/restoration plus backdrop/X/Escape dismissal. Settings uses the
   wide shell up to 1000×720 with left navigation, compact call controls, live
   rich-profile editing, and confirmed logout. Its focus lifecycle runs once
   per mount so changing parent callbacks, presence, or voice state cannot
   steal focus from a field.
8. One application-owned profile popover anchors to member rows, message
   authors, mentions, voice identities, or the user dock. It prefers the
   trigger's right side, flips/clamps inside the viewport, contains focus, and
   shows only current-server role/presence plus global profile fields.
   The reusable backend health poll measures a Supabase Auth round trip every 30
   seconds and labels the result as backend latency. LiveKit
   `ConnectionQualityChanged` events separately normalize the local participant as
   Unknown/Excellent/Good/Poor; reconnecting display takes precedence. The
   selected glass scheme uses grayscale translucency plus scoped
   positive, danger, selected, warning, and icon colors. Renderer identity
   screens use the animated Bakbak motion mark. The server header contains the
   theme-responsive noise/orbit texture, a Bakbak wordmark, and a compact
   package-version-backed `β · vX.Y.Z` chip without repeating the logo. A
   one-shot renderer-launch assembly
   completes within 500 ms; panel/space motion and message stagger collapse to
   the final state under reduced motion. Every scroll surface uses a transparent
   6 px track and reveals its thumb on hover, focus, or scroll activity, which
   clears 650 ms after scrolling stops. The shell preserves readable contrast
   and the supported 1024×680, 1280×800, and larger layouts.

## Runtime and trust boundaries

### React renderer

The renderer is untrusted for authorization purposes. It may hold a user's
Supabase session, use the public Supabase credential, request permitted data,
connect to LiveKit with a short-lived participant token, and download permitted
sound objects. It must never contain a service-role key or LiveKit API secret.
The renderer's per-account IndexedDB read cache relies on the operating-system
account rather than application encryption. It may contain already-authorized
workspace, message, and profile-media copies, but never invite codes, bearer
tokens, authorization headers, LiveKit tokens, service credentials, presence
authority, or pending optimistic sends. A backend denial purges inaccessible
cached scopes.

### Tauri shell

Tauri owns the native window, capabilities, application identity, and desktop
bundles. V1 should expose the smallest capability set needed by the renderer.
The shared main-window geometry remains 1280×800 with a 1024×680 minimum,
resizing, and label `main` across the base, macOS, and Windows configurations.
macOS uses the overlay titlebar with hidden native title and a 16 px horizontal,
24 px vertical traffic-light inset that centres the controls in the 48 px bar.
The base Tauri config enables `macOSPrivateApi` so plain cross-platform Cargo
checks validate the matching `macos-private-api` feature; the macOS override
also retains that allowlist while applying a transparent window, native shadow,
and the `underWindowBackground` effect with active/inactive-state following.
Windows disables native decorations while retaining the native shadow and
transparent webview, exposes renderer minimize, toggle-maximize, close, drag, and
maximize-state reconciliation through an injectable adapter, and applies Mica
from Rust only when `windows-version` reports build 22000 or newer. Before
React loads, Rust injects `data-window-material="native|fallback"`; native
material makes document roots transparent, while Windows 10, browser preview,
and unsupported platforms retain an opaque grayscale underlay. Acrylic is not
used. Capabilities grant window operations only to the main window. Linux
custom chrome and native material remain deferred. The macOS private material
API makes Mac App Store distribution unsupported; Bakbak targets private
distribution.
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
never an API signing secret. On macOS it owns shareable-content enumeration,
ScreenCaptureKit stream, frame/audio conversion, native LiveKit companion, and
deterministic teardown; enumeration and revalidation use the asynchronous
framework API with a five-second ceiling, and captured source names are not
logged.
The ScreenCaptureKit-to-LiveKit zero-copy boundary transfers its owned
`CVPixelBuffer` retain into LiveKit's macOS native frame wrapper exactly once;
Rust must not release that transferred retain again. A share is reported as
active only after capture registration succeeds and the first usable video
frame arrives. If no frame arrives within five seconds, native capture is
stopped and the renderer receives a retryable error while voice remains
connected. Sanitized lifecycle states and failures are printed to the Tauri
terminal and DevTools without tokens or captured-source labels.
The native Rust LiveKit/WebRTC dependencies are macOS and Windows target
dependencies. ScreenCaptureKit remains macOS-only; Windows links
Windows.Graphics.Capture, D3D11, and WASAPI process-loopback support.
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

Supabase Storage holds operator and trusted-function-managed sound files plus
user-managed private profile media outside the desktop bundle. Soundboard RLS
derives read access from the server UUID path prefix and exposes no direct
client mutation. The `soundboard-manage` function alone uses the service role
after independently verifying JWT claims and membership. `avatars` and
`profile-covers` paths begin with their owner's user UUID; only that owner can
insert, replace, or delete an object, while the owner and users sharing any
server with them can read it. Clients never receive bucket-management
authority.

### LiveKit

LiveKit transports a named `bakbak-microphone` speech track, opt-in camera
tracks, at most one named soundboard audio track, desktop screen companions,
participant/speaking state, and small soundboard control messages.
Before publication, the renderer may replace the speech track's source with
the output of its device-local microphone AudioWorklet. LiveKit receives only
that selected processed or fallback speech track; it does not configure or
host the RNNoise stage.
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

| Entity                      | Key fields and constraints                                                                                                                                                                           | Access intent                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `profiles`                  | `id` references `auth.users`; 1–50 character display name; 0–190 character description; legacy `avatar_url`; owner-prefixed avatar/cover poster and GIF paths; integer 0–100 cover focal coordinates | User updates their row; shared-server members read member-facing fields                                    |
| `servers`                   | owner/admin reference, name, timestamps                                                                                                                                                              | Members of the server can read it                                                                          |
| `memberships`               | unique `(server_id, user_id)`; v1 admin/member role                                                                                                                                                  | A user can read memberships for servers they belong to                                                     |
| `channel_categories`        | `server_id`, trimmed 1–80 character name, unique ordered position                                                                                                                                    | Members read their server categories; trusted migrations manage them                                       |
| `channels`                  | `server_id`, optional category ID, trimmed 1–80 character name, category-local or uncategorized position, immutable `text` or `voice` type                                                           | Members read; matching admins create/rename only through RPCs                                              |
| `messages`                  | channel/author, compatibility body, structured content, reply/notify metadata, presentation, soft-delete timestamp                                                                                   | Members read accessible channels; validated legacy/v2 RPCs derive authorship                               |
| `channel_read_states`       | private user/channel key, monotonic last-read message pointer and timestamp                                                                                                                          | The owner reads through RLS; membership-checked RPCs advance/query state                                   |
| `direct_conversations`      | canonical ordered participant pair, unique pair, creation/activity timestamps                                                                                                                        | Only either established participant can select; creation uses a shared-membership RPC                      |
| `direct_messages`           | conversation/author, compatibility body, structured content, reply/notify metadata, presentation, soft-delete timestamp                                                                              | Established participants read; validated legacy/v2 RPCs write                                              |
| `direct_read_states`        | private user/conversation key, monotonic last-read message pointer and timestamp                                                                                                                     | Only the owner selects; participant-checked RPC advances                                                   |
| `message_attachments`       | private reservation target, uploader, kind/limits, original/poster paths, optional channel/DM message link, lifecycle timestamps                                                                     | RLS permits current channel members or established DM participants; trusted functions reserve/delete       |
| `stickers`                  | server/uploader, label, poster/optional animation paths, dimensions, active/archive lifecycle                                                                                                        | Current members see the catalog; referenced history stays readable; renderer has no mutation grants        |
| `message_sticker_reactions` | exactly one channel/DM message, server sticker, reactor, timestamp; partial uniqueness indexes                                                                                                       | Authorized viewers select; the cap-enforcing toggle RPC alone mutates                                      |
| `invite_codes`              | server ID, one-way code digest, creator, expiry, redemption fields                                                                                                                                   | No broad client read policy; redeemed atomically through a controlled function                             |
| `presence_heartbeats`       | unique server/user row, last seen, nullable voice channel/join time, LIVE boolean constrained to voice occupancy                                                                                     | Members can read server rows; only security-definer heartbeat RPCs can write                               |
| `soundboard_categories`     | server ID, name, ordered position, sole upload-target flag                                                                                                                                           | Members read; trusted server setup manages categories                                                      |
| `soundboard_sounds`         | server/category, label, emoji, Storage path, duration, order, revision, nullable creator, created time                                                                                               | Members read; uploader/admin label and emoji updates only                                                  |
| `soundboard_favorites`      | private user/server/sound key and created time; cascading server/sound/owner references                                                                                                              | The signed-in owner alone selects, inserts, or deletes                                                     |
| `storage.objects`           | private sound/profile objects plus `message-media/<uploader>/<uuid>/{original,poster}` and server sticker paths                                                                                      | Trusted functions write message/sticker media; RLS authorizes current channel or retained DM/history reads |

Initial admin membership and initial invite codes are managed with reviewed SQL.
An invite-management UI is deferred until post-v1.

## Authorization model

- Authentication alone does not grant server access.
- Membership in the channel's server is required to read server, channel,
  membership, and message data.
- Channel categories use the same server-membership read boundary as channels.
  Authenticated clients cannot insert, update, or delete categories.
- Message authorship is derived from the authenticated user, not trusted from a
  client-supplied user ID.
- `send_message` accepts only exact text/mention segment shapes, validates the
  channel and every mentioned profile against the caller's server membership,
  limits the generated fallback to 4,000 characters and 25 mentions, and writes
  both structured content and an older-client body.
- `send_message_v2` and `send_direct_message_v2` add same-thread replies,
  atomic attachment finalization, one validated sticker/GIPHY presentation,
  notification coercion, and compatibility fallback bodies. Bakbak stickers
  remain standalone; GIPHY presentations may carry structured text. Empty
  messages, cross-thread replies, missing uploaded objects, mixed attachment
  and presentation drafts, and more than four attachments are rejected.
- Sticker reactions use one trusted toggle that verifies current membership,
  enforces five distinct stickers per user and twenty per message under an
  advisory lock, and never changes activity or unread state. Author deletion
  scrubs content, removes reactions, revokes attachment reads, and excludes the
  tombstone from latest/unread calculations without deleting the row.
- Channel read states are private to their owner. Clients cannot write the
  table directly; `mark_channel_read` requires channel membership and can only
  advance a pointer, while `get_channel_activity` exposes activity for one of
  the caller's servers.
- Direct conversation, message, and read-state tables expose only RLS-filtered
  selects to renderer sessions. `get_or_create_direct_conversation` derives a
  canonical pair and requires current shared-server membership;
  `send_direct_message` derives the author, accepts the existing exact
  text/mention shapes, restricts mentions to the two participants, and preserves
  the 4,000-character/25-mention bounds; `mark_direct_conversation_read`
  advances only the caller's pointer. Once created, participant access no
  longer depends on continued server membership.
- Invite redemption is an atomic database operation: validate an unused,
  unexpired code, create the membership, and consume the code in one
  transaction.
- The client cannot list or inspect valid invite codes.
- Profile display names, descriptions, media paths, and cover focal points
  remain canonical in `public.profiles`. Avatar and cover objects must use
  `<auth.uid()>/<generated UUID>`; only the owner writes or deletes, and reads
  require ownership, shared server membership, or an established direct
  conversation with that profile.
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
  limit updates to `label` and `emoji`; RLS further requires the creator or a
  matching server admin. Clients cannot assign categories or insert/delete
  sounds or categories.
- Favorite rows require `user_id = auth.uid()`, matching server membership, and
  a composite same-server sound reference. Their foreign keys cascade when the
  owner, server, or sound disappears.
- The service-role-only `create_soundboard_upload` RPC locks the server before
  counting/inserting, preventing concurrent requests from bypassing active
  member/server quotas. Renderer sessions cannot execute it.
- RLS tests cover at least seeded admin, member, and non-member identities.

## Data flows

### Authentication and private access

1. The user signs in with Supabase email/password authentication.
2. The renderer loads the user's profile and existing memberships through RLS.
3. A user without membership submits a single-use invite code.
4. The invite redemption database function validates and consumes the code
   atomically, then creates membership.
5. The renderer refreshes membership and channel data.

### Application shell and direct messages

1. The titlebar's left-positioned segmented switch selects a navigation-neutral
   `AppSpace` discriminant between Personal and the single server. Each space keeps its
   latest in-memory conversation/channel selection. A cold start remains on Bakbak when
   membership loads; missing membership plus established DM history resolves
   to Personal; neither history nor membership resolves to InviteGate.
2. The context panel swaps the Personal conversation list and server channel
   shelf while retaining the shared user footer and current-call controls.
   Settings remains an overlay and does not become a rail destination. The
   last selected server text channel or Personal DM is cached per account;
   voice rooms are deliberately never restored or auto-joined.
3. Layout preferences v2 store visibility plus context/details widths. A stable
   five-track CSS grid uses two 1 px separator tracks for every visibility
   combination; hidden panel and divider tracks animate to zero without being
   removed. Each panel remains mounted in a clipping slot that becomes inert
   and hidden from assistive technology. The invisible 9 px pointer target
   overlaps its 1 px separator; keyboard separators support arrows,
   Shift+arrows, Home/End, and double-click reset and disable immediately with
   the panel. Pointer capture updates the grid without its collapse transition
   and suppresses document selection only for the active drag. Release,
   cancellation, capture loss, or window blur always restores normal selection
   and motion. Runtime maxima clamp the 200–360 px widths so the centre retains
   at least 420 px; hidden panels keep their stored widths.
4. After Auth resolves the user ID, the renderer reads that account's
   normalized IndexedDB snapshot and may paint it as cached data. It then
   revalidates workspace, membership, profiles, DM summaries, unread state, and
   Realtime. A connectivity failure retains a visibly offline, read-only cache;
   online, visible-window, and ten-second backoff signals retry. API contract,
   authorization, and query failures remain actionable alerts and do not mark
   the entire app offline. Authorization denial removes the inaccessible
   cached scope instead of treating it as authority.
5. Personal loads `get_direct_conversations()` activity ordered by the newest
   message. Starting a row calls the canonical shared-membership creation RPC.
   Direct messages use a true direct `ConversationTarget`, never a fabricated
   server channel.
6. Each direct conversation owns an in-memory draft and optimistic message.
   Send failure removes the optimistic row and restores the submitted draft.
   Participant-authorized Realtime inserts update an open conversation,
   refresh ordering/unread state, and use the existing incoming-message sound.
7. Selecting a conversation renders its memory/IndexedDB thread immediately,
   then requests rows after its newest `(created_at, id)` cursor. A cache miss
   requests the newest 50; upward pagination requests 50 before the earliest
   cursor. Realtime/query/optimistic results merge by stable ID, while only the
   newest 200 confirmed rows persist. Rich channel and DM selects read the
   scalar `reply_to_id`, then hydrate the unique parent IDs through a second
   authorized query. This avoids PostgREST's ambiguous reverse-array result for
   the recursive reply relationship and prevents empty arrays from rendering
   as phantom “Former friend” replies.
8. Selecting a conversation loads its RLS-filtered history and advances the
   signed-in participant's monotonic read state when visible. Private read-state
   Realtime refreshes Personal unread markers.
9. The details panel resolves the other participant's profile and private media
   through shared-server or established-DM policy. Former members may use the
   reversible invite action while keeping established conversations. The DM
   conversation row and header hydrate that participant's private avatar poster
   through the shared profile-media cache, while the details rail plays their
   GIF avatar and cover unless reduced motion is enabled. The Personal member
   picker truncates long names and dismisses on outside pointer or Escape.
   Media resolves memory first, then the user-scoped IndexedDB blob, then
   authenticated Storage. Workspace metadata publishes before avatar hydration,
   so a slow image cannot hold the shell hostage.

### Profile, appearance, and modal settings

1. The renderer loads one local Roundo font face and one glass token set before
   mounting React. A validated `auto | light | dark` preference applies before
   React mounts; Auto delegates to CSS `prefers-color-scheme`, so operating-
   system changes continue to apply live. Rust supplies the pre-render
   native/fallback material marker; fallback
   mode uses an opaque system-coloured document underlay and native mode makes
   only the document roots transparent. Dark panels use 68% black and strong
   controls 82% black; light panels use 66% and 82% white. Primary chrome uses
   24 px blur and 120% saturation, never a filter on user/live media. Legacy
   `bakbak.appearancePreferences.*` keys are neither read nor deleted. Shared
   type, spacing, height, and radius tokens enforce the
   500/600/700 UI hierarchy, 4 px spacing rhythm, 36/40/44 px controls and rows,
   52 px composer, and restrained 10/14/16/18 px curves. Hover transitions use
   color and border changes; reduced motion disables transitions and press
   scaling.
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
5. A memory plus user-scoped IndexedDB bucket/path cache deduplicates
   authenticated downloads and revokes object URLs on replacement, account
   change, clearing, and teardown. Workspace metadata publishes before avatar
   posters hydrate progressively; compact GIFs load only on identity
   hover/focus. Static cover posters
   load lazily for visible member rows, immediately for the always-visible
   shared user dock, or on demand for an open profile card or editor; cover
   animation loads only for the open card/editor. Reduced-motion
   mode never
   requests GIFs. If WebKit cannot decode a cached object URL, every shared
   profile-media surface removes the failed image immediately, evicts that
   account/bucket/path entry, retries authenticated Storage once, and otherwise
   keeps the neutral fallback instead of exposing a native broken-image icon.
   Realtime generation guards stop stale downloads from replacing newer
   profile state.
6. Cover framing uses a fixed 3:1 preview. Pointer drag or keyboard arrows
   update integer focal coordinates; Shift moves by a larger step and Reset
   returns to 50/50.
7. Audio settings retain the persisted device selectors, soundboard volume,
   enhanced-cleanup switch, selected voice effect, and interface-sound
   master/volume/category preferences in four spaced Voice Input, Voice Output,
   Video, and App Sounds categories. Opening settings does not request media.
   The explicit microphone test uses the same selected processing path as an
   outgoing call, plays it through the selected output, and warns headphones
   users before live monitoring. Successful microphone permission immediately
   refreshes device enumeration because macOS WebKit can reveal named speakers
   only after capture permission. Microphone and output tests acquire only
   temporary resources and release them when stopped or unmounted. Preview
   buttons activate and play one modern interface-sound category representative
   through the system output.
8. Settings is a modal overlay over the current canvas. It traps focus, restores
   the opener on close, exposes compact active-call controls, and confirms
   logout. Closing discards staged profile edits and revokes preview URLs; a
   failed save leaves the draft intact for retry. A failed logout leaves the
   overlay open with an inline error. Data & storage reports current-account
   message/media usage, the 200-message/256 MiB policy, freshness, and a
   confirmation-protected cache clear action.

### Channel management

1. The workspace snapshot loads ordered server categories and category-linked
   channels, and exposes the signed-in member's role. Only admins see create
   and rename actions in the channel shelf.
2. The client calls `create_channel` or `rename_channel`; the database derives
   identity, verifies exact-server admin membership, trims and validates the
   name, and maps uniqueness failures to a safe user-facing error.
3. Create locks the server row, finds the maximum position among uncategorized
   rooms of that server and kind, and appends at the next increment of ten.
   Rename changes only the name, preserving the UUID, category, kind, server,
   messages, active voice identity, and ordering.
4. Channel Realtime subscribes before its catch-up snapshot and replays buffered
   events after the snapshot, so an overlapping create or rename cannot be
   overwritten by stale data. Channels reconcile by stable ID and sort by
   position then ID. Only the creating client selects a new channel; selecting
   a newly created voice channel also joins it automatically.

### Text-channel chat and voice-message compatibility

1. A member selects a text channel. The upgraded renderer paints its
   user-scoped memory/IndexedDB thread immediately, then loads rows after the
   newest `(created_at, id)` cursor or the newest 50 on a miss. Upward
   pagination reads 50 older rows; only the newest 200 confirmed rows persist.
   Activity, drafts, and Realtime subscriptions remain limited to known
   text-channel IDs.
2. RLS verifies server membership. The deployed RPCs and schema still permit
   voice-channel messages for older clients, but upgraded clients do not expose
   that surface or create invisible voice unread state.
3. A submitted draft stages media locally. MP4Box rejects non-H.264 video,
   non-AAC optional audio, excessive duration, or excessive resolution. On
   send, TUS uploads each reserved original/poster with progress and retry;
   only after every object succeeds does the v2 RPC atomically publish the
   message. A failed attempt retains the complete draft for retry.
4. Plain structured text may still call the compatible legacy RPC. Replies,
   attachments, Bakbak stickers, and GIPHY presentations call the v2 RPC.
   GIPHY selections are staged in the composer, where the user may add text
   before sending; Bakbak sticker sends remain standalone. Postgres validates
   membership/participation, segment shape, reply scope, presentation metadata,
   reservation ownership, object existence, and quotas.
5. Supabase Realtime broadcasts INSERT/UPDATE plus sticker/reaction changes.
   The receiver hydrates the affected message by ID before cache replacement.
6. Clients reconcile cached, query, realtime, and optimistic events by stable
   ID and deterministic timestamp/ID order. Pending optimistic rows never
   persist.
7. A committed message from another user plays a short local notification tone.
   `get_channel_activity` compares the latest message with the account's private
   marker so unread emphasis follows the signed-in user across clients.
8. A visible selected text chat advances the marker through
   `mark_channel_read`. Realtime read-state changes refresh the activity
   snapshot on other signed-in clients.
9. Mention ranges are atomic draft metadata. Editing through one converts it to
   plain text; selecting a member from the accessible `@` combobox stores that
   member ID. Rendering resolves the current Realtime profile name and uses the
   segment fallback only when the member is no longer visible.
10. Composer drafts and loaded thread maps are controlled by the application
    shell per channel, so switching rooms or opening settings preserves
    unfinished and already-rendered conversation state.
11. The shared channel/DM composer exposes only implemented actions: attachment
    at the leading edge and GIPHY, Bakbak stickers, searchable native emoji, and
    send at the trailing edge. Choosing an emoji replaces the current selection,
    updates structured mention offsets through the normal draft-text boundary,
    and restores focus to the message input. With no staged preview, its wrapper
    and the context-panel user dock use the same 68 px footer height; the 52 px
    composer is vertically inset by 8 px while rich previews grow upward.

### Application presence

1. After loading a server, each authenticated upgraded client calls
   `heartbeat_presence_v3(server_id, voice_channel_id, is_streaming)`
   immediately and every 20 seconds. Local room/share transitions call
   `setVoiceState` immediately rather than waiting for the next interval.
   `heartbeat_presence_v2` and `heartbeat_presence` remain available for older
   builds and always clear LIVE, preventing stale streaming state.
2. The security-definer RPC derives the user from `auth.uid()`, verifies current
   server membership, and upserts the server/user row using database time. The
   renderer cannot insert or update heartbeat rows directly.
3. A non-null voice channel must belong to the requested server and have kind
   `voice`. LIVE cannot be true without that voice occupancy. Postgres assigns
   the join timestamp and preserves it while the user remains in the same room.
4. Voice state is published only after LiveKit connects and cleared on leave or
   connection error. Sharing and paused sharing publish LIVE; stop, failure,
   and disconnect clear it immediately. Server members can read online,
   voice-session, and LIVE state for every server room they have not joined.
5. Postgres Realtime refreshes the cached rows on every client. Clients expire
   rows older than 55 seconds and re-evaluate every five seconds, so a crashed
   client disappears without a graceful leave.
6. Presence is a UI hint only. The actual LiveKit screen publication is
   authoritative for Watch; database RLS and Edge Function checks remain
   authoritative for access.

### Voice room

1. Live workspace load prepares the public LiveKit endpoint. A 75 ms pointer
   dwell or immediate keyboard focus prepares only the newest voice channel by
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
4. Microphone capture requests mono 48 kHz input with WebRTC echo
   cancellation, noise suppression, and automatic gain control. When enhanced
   cleanup or a voice effect is selected, a LiveKit `TrackProcessor` routes
   capture through a shared 48 kHz AudioContext and AudioWorklet. After the
   first trusted gesture, Bakbak loads that worklet without requesting a
   microphone, then reuses the context for preview and voice. The worklet
   bridges 128-sample render quanta into 480-sample RNNoise frames, then applies
   the selected sender-side effect. Unsupported initialization keeps the raw
   capture track and records a non-fatal Settings warning.
5. After LiveKit connects, the processed or fallback speech track publishes as
   `bakbak-microphone` while output preparation and the existing
   soundboard-track preparation run concurrently. Bakbak still awaits
   soundboard `ensurePublished` settlement before reporting `connected`.
   Speech selection prefers that exact name and falls back to an unnamed,
   non-soundboard microphone publication for older clients.
6. Direct channel switching unpublishes the current microphone without
   stopping it, disconnects the old room, republishes it into the new room,
   and preserves its processor plus mute/deafen state. Input-device changes
   restart the processor on the replacement source. Leave, sign-out, a failed
   switch, and teardown stop every retained or pending microphone. Sign-out and
   application teardown close the shared processing context.
7. The renderer generation-gates all token, connection, and microphone work so
   a stale attempt can disconnect only its own room. A compact polite status
   loader announces authorization, connection, microphone, or soundboard work;
   reconnecting uses the same treatment.
8. Camera remains off through join. An explicit camera action publishes an
   adaptive 720p track. Local video is mirrored; subscribed remote tracks attach
   to participant tiles, and avatar fallbacks remain visible while video is off.
9. The current connection manages microphone, speaker, and camera switches,
   autoplay recovery, mute, deafen, participant, speaking, reconnect, and error
   state. Device discovery uses the browser's complete `enumerateDevices`
   result and refreshes on `devicechange`, explicit user refresh, successful
   mic testing, camera start, and room join. Permission-limited default-only
   discovery does not erase a remembered device ID. Output switching is
   capability-checked from `HTMLMediaElement.setSinkId`; a supported switch
   updates the soundboard monitor, LiveKit room, and every current or future
   hidden remote-audio element. Unsupported runtimes keep the selector
   read-only and use system output. A genuinely missing remembered device
   falls back to default after specific devices become visible.
10. Unsubscription, leaving, disconnecting, and unmounting detach remote audio
    and video, invalidate pending camera/join work, stop active local sounds,
    pause and detach the selected-speaker monitor, stop its MediaStream tracks,
    close its Web Audio context, disconnect the room, and release local tracks.
11. If direct WebRTC fails and relay succeeds, later joins prefer relay for ten
    minutes using only a non-sensitive LiveKit-host-scoped expiry. Relay-first
    failure retries direct; direct success or expiry clears the hint. A total
    failure is reported as a TURN/TLS or local network-policy problem rather
    than token/authentication failure.
12. Development diagnostics record preparation, authorization, connection,
    microphone capture/processing/publication, output routing, soundboard, and
    total timing without identifiers or tokens.
13. `CommunicationEffectEvent` is emitted only after lifecycle truth: self join
    follows the complete connected gate; normal self leave requires an explicit
    user leave; switches emit only the destination join; sign-out, teardown,
    canceled joins, and unexpected disconnects never imitate a normal leave.
    The initial remote roster and share publications are baselined before later
    remote participant/share events become eligible. Native share companions
    are excluded from voice-person events. Successful local microphone
    mute/unmute emits only after publication state changes. Reconnect and
    actionable failure use Status events rather than leave.

### Desktop screen share

1. A connected installed client opens a renderer confirmation with Entire
   screen / Application tabs on macOS 14+ and Windows. Source audio defaults on
   when matched audio is available; the presenter can turn it off with a
   switch. `ScreenShareSource.audioUnavailableReason` is authoritative for the
   selected source: the picker disables and clears audio when that reason is
   present. The confirmation exposes independent 480p/720p/1080p and 15/30/60-fps
   controls, defaults to 1080p/60 on first use, and persists only the last
   successful quality under `bakbak.screenSharePreferences.v1`. Browser clients
   have no share UI and force every screen publication unsubscribed.
2. For native capture, the renderer requests `{ channelId, purpose:
"screen_share" }`. The function repeats authentication, membership, and
   voice-channel checks, then signs a five-minute companion identity tied to
   the same room and owner.
3. Tauri validates that the caller is the main window, resolves the selected
   macOS display/application or privacy-filtered Windows source handle, and
   connects a second LiveKit room using only the returned public URL and token.
   It never receives a signing key.
4. macOS applies live ScreenCaptureKit configuration updates. Windows uses a
   free-threaded D3D11 frame pool, throttles to the selected cap, recreates on
   source-size/quality changes, reads frames back for CPU BGRA-to-I420
   conversion, and retains the same companion identity. Moving Windows scaling
   and color conversion fully onto the GPU remains an acceptance/performance
   follow-up. The presenter ceiling uses 0.8–8 Mbps H.264
   encoding limits across the nine quality combinations; LiveKit adaptive
   layers may deliver less to a viewer.
5. macOS application filters contain only the selected application; Entire
   screen keeps Bakbak visually present when selected but both modes apply
   ScreenCaptureKit current-process audio exclusion. Windows build 20348 or
   newer includes only the selected application process tree or excludes
   Bakbak's process tree for Entire screen. Enumeration and start-time
   validation reject Bakbak and descendant application processes. Older
   Windows builds and any isolated-audio startup failure keep video available,
   disable audio with a source-specific explanation/warning, and never broaden
   capture to unrelated output. `screen_share_audio` publication starts only
   after isolated capture succeeds.
6. A two-second gap without a complete frame mutes the publication, keeps the
   viewer's last frame visible, and reports “Source minimized or paused.”
   Capture automatically unmutes when a complete frame returns.
7. Companion participants are merged into their owner's UI state and omitted
   from ordinary participant cards. Every remote screen video/audio publication
   is immediately unsubscribed. `watchedScreenShareId` is the sole subscription
   gate: selecting an in-room share tile unsubscribes the previous remote share
   first, then subscribes the selected high-quality video and source audio. The
   watched share remains subscribed when focus returns to the gallery, where
   the same live track continues inside its tile; selecting a person, switching
   shares, target loss, disconnect, or leave performs the corresponding cleanup.
   The presenter's own companion video remains subscribed locally while its
   companion source audio is always forced unsubscribed.
   Deafen, selected output, and owner volume still apply to watched audio.
8. Sidebar LIVE is informational and has no Watch action or pending cross-room
   state. Database LIVE alone never creates a subscription; the viewer joins
   the voice room and selects the share tile. Each occupied channel shows one
   room-active timer based on its earliest current join. Occupants have no
   personal timers or redundant local-user suffix; compact avatars use a live
   speaking ring from the active LiveKit room.
9. Focused people and shares use one `minmax(0, 1fr)` media stage without a
   metadata header or people filmstrip. Shared media uses `object-fit: contain`
   against a black canvas, while Back to grid and fullscreen sit above its
   bottom corners; local quality controls share that overlay. Fullscreen is a
   fixed `100dvh` overlay reconciled with Tauri's actual `isFullscreen()` after
   requests, resize/focus events, Escape, target loss, disconnect, and teardown.
   Exit fullscreen stays pinned at the bottom while secondary controls hide
   after 2.5 seconds idle. Escape retains focus; active media or Back to grid
   exits fullscreen and clears focus without interrupting a watched share.
   Failures surface non-blocking status while renderer state returns to the
   actual native value.
10. Explicit stop, voice leave, source termination, terminal native-room
    disconnect, or main-window close releases capture immediately and closes the
    companion. Multiple app instances may present concurrently, but each app
    instance owns at most one share.
11. Local and remote share lifecycle changes emit typed start/stop effects after
    room baselining. Remote cues play at reduced gain, and deafen suppresses
    remote Voice/Screen-share cues without suppressing self actions, Messages,
    or Status.

### Soundboard

1. The application owns drawer dismissal. Outside pointer interaction, Escape,
   disconnect, channel switch, and unrelated modal/view opening close it.
   Both triggers, the drawer, and an edit modal marked
   `data-overlay-owner="soundboard"` count as inside. Escape/explicit close
   restore opener focus; outside pointer dismissal leaves focus at the clicked
   destination.
2. After workspace load, the renderer fetches the member-visible categories and
   sounds plus the signed-in user's favorite IDs. It downloads private Storage
   objects with the signed-in session,
   reuses IndexedDB blobs matching `{ soundId, audioRevision }`, and decodes
   ready clips into memory. Download or decode failure marks only that card as
   failed and can be retried.
3. Favorites, System, and Bakbak render in fixed order. Each section persists
   collapse state under `bakbak.soundboardSections.v1:<server ID>`; search
   reveals matching collapsed sections without saving the temporary state.
   Favorite mutations update optimistically, roll back on failure, and
   reconcile through private Realtime events.
4. Choosing Upload accepts a native audio/video preview, a start slider, and a
   0.1–5 second length slider. The lazy local FFmpeg worker extracts only the
   selected audio to normalized WAV. The renderer sends multipart
   `{ action, serverId, label, emoji, clip }`; the trusted function stores
   `<server>/<uploader>/<uuid>.wav`, atomically publishes the catalog row, and
   removes the object if publication fails. Delete requests contain only
   `{ action: "delete", soundId }`; member objects are removed and release
   quota, while operator sounds are archived.
5. Voice join publishes at most one room-scoped audio track named
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
6. The client also publishes a reliable UI-control message such as:

   ```json
   {
     "version": 2,
     "type": "soundboard:play",
     "eventId": "019f...",
     "soundId": "00000000-0000-4000-8000-000000002019",
     "sentAt": 1783820000000
   }
   ```

7. Receivers validate version, event ID, sound ID, and timestamp, deduplicate UI
   events, and derive the sender from the LiveKit participant callback. They
   never trust a payload sender or volume and never replay control messages
   locally; remote listeners hear only the participant's LiveKit audio track.
8. Activity state uses the catalog duration. Participant cards show the newest
   emoji, an overlap count up to five, Playing status, and the speaking
   treatment. Camera-off tiles replace the avatar with that emoji; camera-on
   tiles center it over video. Upgraded senders reserve pending/active activity
   before any asset work and reject a sixth start, rolling back reservations on
   every failure. Upgraded receivers render only the newest five events from an
   older sender. Local stop-all also invalidates pending asset starts before
   they can play or publish activity. A reliable `soundboard:stop-all` message
   clears that participant immediately; disconnect, leave, and track cleanup do
   the same.
9. Remote named tracks use `soundboard volume × participant volume`. Normal
   microphone speech keeps only participant volume. Deafen suppresses remote
   audio and the sender's local monitor branch without muting outbound
   soundboard audio.

Unknown message types, stale duplicates, and unknown sound IDs are ignored
safely. Built-in capture constraints plus RNNoise target echo, keyboard, and
steady background noise, but RNNoise is not speaker separation and cannot
guarantee acoustic isolation on every device. The laptop-speaker two-client
check therefore remains required.

### Local preferences

The renderer validates and stores only `{ inputDeviceId, outputDeviceId,
cameraDeviceId, soundboardVolume, enhancedNoiseSuppression, voiceEffect }`
under the versioned local-storage key `bakbak.devicePreferences.v2`. Valid v1
device and volume values migrate with enhanced cleanup enabled and Natural
voice selected. These preferences never sync to Supabase. If a remembered
device is absent, the selector returns to the runtime's default device.
Interface cues deliberately bypass the selected call output.
Soundboard section collapse state is stored independently per server under
`bakbak.soundboardSections.v1:<server ID>` and never syncs; favorite rows sync
through Supabase instead.
Appearance stores only `auto`, `light`, or `dark` under
`bakbak.appearancePreference.v1`. Invalid values restore Auto. Old
`bakbak.appearancePreferences.*` entries remain inert rather than receiving a
cleanup migration.
It stores `{ enabled, volume, categories }` under
`bakbak.interfaceSoundPreferences.v1`; the default is enabled at 55% with
Messages, Voice, Screen share, and Status enabled. Interface sounds lazily
preload after the first pointer/keyboard interaction, use the Web Audio system
destination, never queue blocked pre-gesture events, cap concurrency at three,
throttle messages to 350 ms, batch remote roster churn for 250 ms, and cool
failure alerts for two seconds. Panel visibility plus context/right widths use
`bakbak.layoutPreferences.v2`; malformed values restore defaults and widths are
reclamped to the viewport so at least 420 px remains for the centre canvas.
All of these preferences are device-local and never part of the profile or
Supabase schema.

Roundo v2.0 is vendored from Fontshare as
`public/fonts/roundo/Roundo-Variable.woff2` and served locally with no CDN
dependency. Its SHA-256 is
`74481965a428478803e36f6aaf21d163c36c5c8fc2cb27029dfbf1f9fb6f5a65`;
the upstream/download record and SIL Open Font License 1.1 notice live under
`third_party/roundo`. Every WAV under `public/interface-sounds` is original
Bakbak project output from the checked-in deterministic sine-pluck and
rounded-envelope generator. The modern pack contains no recordings, third-party
samples, square/triangle oscillators, or seeded grit. The microphone
worklet bundles `@jitsi/rnnoise-wasm` `0.2.1` and its RNNoise 0.2 synchronous
model; Jitsi's Apache/MIT notice and Xiph.Org's BSD 3-Clause notice ship under
`public/vendor/rnnoise`.

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

### `POST /functions/v1/soundboard-manage`

- **Authentication:** `Authorization: Bearer <Supabase access token>` with the
  platform JWT gate retained and claims revalidated inside the function
- **Upload request:** multipart
  `{ action: "upload", serverId, label, emoji, clip }`, where `clip` is
  normalized WAV
- **Delete request:** JSON `{ "action": "delete", "soundId": "<uuid>" }`
- **Upload validation:** trusted origin/method/content type, current server
  membership, the server-managed upload category, 1–50 character label,
  optional short Unicode emoji (default `🔊`), at most 600 KiB, RIFF/WAVE PCM,
  48 kHz, mono, 16-bit, and actual duration from 100–5000 ms
- **Publication:** stores
  `<server>/<authenticated uploader>/<generated UUID>.wav`, calls the
  service-role-only transaction for quota and catalog publication, and removes
  the object if publication fails
- **Deletion:** uploader or matching server admin; member objects are disabled,
  removed from Storage, then deleted from the catalog, while operator objects
  are archived by disabling the catalog row
- **Errors:** normalized authorization, validation, quota, storage,
  publication, moderation, and not-found codes without backend details

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

### `POST /rest/v1/rpc/heartbeat_presence_v3`

- **Authentication:** valid Supabase user session
- **Request:** `{ "p_server_id": "<server-uuid>", "p_voice_channel_id": "<voice-channel-uuid-or-null>", "p_is_streaming": true|false }`
- **Success:** database heartbeat timestamp
- **Validation:** `auth.uid()` identity, current server membership, and voice
  channel ownership/kind; streaming requires a non-null valid voice channel
- **Behavior:** database-owned stable join time for an unchanged room; null
  clears voice and LIVE state; direct table writes remain denied
- **Compatibility:** `heartbeat_presence_v2` and `heartbeat_presence` remain
  executable by older builds and always clear LIVE

### Direct-message RPCs

- `get_or_create_direct_conversation(target_user_id)` requires a shared server
  to create the canonical ordered pair and rejects self-DMs.
- `send_direct_message(conversation_id, content)` derives the author, validates
  the same 4,000-character structured message shape, and restricts mentions to
  the pair.
- `mark_direct_conversation_read(conversation_id, message_id)` maintains the
  caller's owner-private marker.
- `get_direct_conversation_activity()` exposes only participant-authorized
  conversations with latest-message and unread metadata.
- Established participants keep participant-only conversation, message,
  profile, avatar, and cover reads after shared membership disappears.

### `POST /rest/v1/rpc/create_channel`

- **Authentication:** valid Supabase user session
- **Request:** `{ "p_server_id": "<server-uuid>", "p_kind": "text|voice", "p_name": "<name>" }`
- **Success:** the created `channels` row
- **Validation:** `auth.uid()` identity, matching server admin membership,
  trimmed 1–80 character name, valid kind, and case-insensitive uniqueness
- **Behavior:** locks the server row and assigns the next position in increments
  of ten within uncategorized rooms of the requested kind

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

Messages, profile updates, private read-state, sound catalog, and private
favorite events use Supabase Realtime under RLS. Private profile posters and
GIF animations use authenticated Storage operations; sound mutation uses the
trusted management function.

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
| `VITE_GIPHY_API_KEY`     | Public GIPHY beta API key for direct GIF/sticker search and analytics          | No      |

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
RPC behavior. Ordered channel-layout work also covers exact category/room
counts and source order, category RLS, stable original UUIDs, the no-message
boundary, and sidebar scroll containment. The
first friend-test release also requires the manual Apple Silicon macOS matrix
in the active plans.
Soundboard upload work additionally runs reduced-core media tests, Deno
request/WAV/cleanup tests, category/favorite/creator/quota pgTAP checks, short
viewport modal QA, installed audio/video extraction, hosted two-account
Realtime/moderation/playback checks, and before/after installer-size recording.
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

- Plan 0019's adaptive semantic control tokens, shared sidebar user dock,
  presence-aware member groups, and lazy static member-cover accents are
  implemented with focused component, integration, contrast, and appearance
  regressions. Dark/light three-resolution and min/default/max panel-width
  visual QA plus installed macOS/Windows observation remain required.
- Plan 0018's system-adaptive glass tokens, native/fallback bootstrap, macOS
  material configuration, Windows 11 Mica gate, edge-to-edge five-track shell,
  persistent inert panel slots, centered signed-in title, bounded motion, and
  auto-hiding scrollbars are implemented with focused renderer/native contract
  coverage. Installed macOS and Windows 10/11 validation still must cover real
  vibrancy/Mica, inactive windows, varied-wallpaper contrast, startup flash,
  traffic lights/window controls, shadow, drag/resize/fullscreen, and both
  system schemes. Browser QA cannot prove those native effects.
- Plan 0017's 48 px titlebar, segmented Personal/Bakbak switch, centered
  draggable context jokes, rail-free geometry, comfortable Roundo scale,
  platform configurations, adapter tests,
  and dark mock-browser checks at 1024×680, 1280×800, and 2560×1440 are
  implemented. Installed macOS and Windows verification still must cover
  native controls, dragging, maximize/restore, resizing, light/dark modes,
  offline font loading, OS shortcuts, and screen-share cleanup on close.
- Plan 0016's neutral appearance and local Roundo bundle remain active, while a
  later user-directed follow-up restores only Auto/Light/Dark scheme selection
  and removes the typography summary. Accent, surface, and font controls remain
  absent. The appearance regression guard covers the scheme-only preference.
  Plan 0019 permits its scoped semantic control tokens, and plan 0020 permits
  one lime particle accent only in the generated product artwork and explicitly
  delimited server-header motion-brand block; ordinary chrome remains
  grayscale.
  The in-app browser's localhost policy blocked the mock-preview reload, so the
  dark/light 1024×680 and 1280×800 visual matrix plus installed macOS/Windows
  glyph, clipping, wrapping, and offline-network observation remain required.
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
  hosted additive migration is deployed and linted, and Docker-backed pgTAP
  passes. Installed-app profile/reduced-motion observation and the live
  two-account media/Realtime/outsider matrix remain required before
  distribution.
- Plan 0016 retires plan 0009's Signal Red visuals and appearance persistence
  while plan 0023 replaces its retro synthesis with a modern twelve-cue pack.
  The controller, preferences, and typed lifecycle routing remain. Installed-app
  multi-client audio observation is still required for rapid messages,
  simultaneous joins/leaves, mute/unmute, screen sharing, reconnect, deafen,
  and a call output different from the system output.
- The Warm Adda renderer, profile/avatar services, channel RPCs, and policies
  are implemented, and migration
  `202607120003_profile_avatars_and_channel_management.sql` is deployed to the
  hosted project. Live Realtime/profile/channel behavior still requires the
  browser-plus-native two-account acceptance run in plan 0004.
- Plan 0012's exact seven-category, 24-room Unlucky Boys layout passes local
  migration, RLS, renderer, and 1280×720/1024×680 scroll-containment checks.
  Migration `202607180003` is deployed, linked schema lint passes, and hosted
  migration history matches the repository. The five Discord lock-marked
  channel names are ordinary all-member Bakbak rooms until a separately
  approved channel-level ACL model exists. The hosted two-account
  hierarchy/RLS observation remains required.
- Plan 0013's local RNNoise processor, preference migration, fallback path, and
  Settings controls pass automated validation and a production renderer build.
  Human two-client observation is still required for keyboard rejection,
  intelligibility, Child/Robot/Walkie-talkie output, active effect changes,
  microphone switching, and processor cleanup on macOS and Windows.
- Hosted migration `006` and the camera-capable token function are deployed,
  but the Arc-plus-installed-app voice/video/device acceptance matrix still
  requires two signed-in users and human audio/video observation.
- The System/Bakbak consolidation, account favorites, owner/admin policies,
  trusted upload function, reduced local media pipeline, responsive modals,
  authenticated cache, and named LiveKit audio track are implemented. The
  `soundboard-manage` function and migration `202607180002` are deployed;
  linked schema lint passes, hosted migration history matches the repository,
  and the unauthenticated JWT probe returns 401. The two-account
  upload/Realtime/moderation matrix remains required; exact-once playback,
  laptop-speaker acoustic echo, output switching, volume multiplication,
  reconnect, and cleanup still require the planned two-client human acceptance
  run. Distribution rights for all 44 MP3s must be confirmed before friend
  testing.
- LiveKit's current server SDK throws while encoding `Track.Source.Unknown` in
  a token source allowlist. Bakbak therefore publishes the dedicated named
  soundboard track as a second microphone-source track and distinguishes it by
  `bakbak-soundboard`; speech is independently named `bakbak-microphone` so mute
  and reuse never depend on publication order.
- macOS 14+ native video and matched source audio are implemented. Older macOS
  retains the WebView fallback. Windows native picker, WGC video, and gated
  process/display-matched audio are implemented, but a Windows machine still
  must complete the installed-client isolation matrix. Cross-platform
  two-account verification and before/after installer-size measurements remain
  required by plans 0003 and 0010.
- The current production renderer is roughly 336 kB compressed; LiveKit and
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
- Browser/Linux screen sharing, recording, camera effects, custom emoji
  artwork, additional roles, global push-to-talk, notifications, tray behavior, Linux
  distribution, and operating-system signing/notarization remain outside the
  approved phases.
- Protected or DRM-controlled sources may be black or silent; Bakbak does not
  bypass operating-system capture policy.
