# Bakbak architecture

This document is the mutable, current source of truth for Bakbak's structure,
runtime boundaries, service contracts, data flow, and environment variables.
Historical work and verification belong in `docs/progress.md`; accepted scope
and phase completion belong in the numbered files under `docs/plans`.

## Current implementation state

As of 2026-08-23, Bakbak has a complete local/mock product path and production
Supabase and LiveKit adapters. The signed-in renderer uses an Arc-like
two-track shell with no full app titlebar or contextual conversation header.
A zero-width native-safe overlay contains no renderer controls, while the main
canvas starts with a compact 30 px drag strip that has no contextual text or
actions. The visible sidebar's bottom user dock places its close control
directly after Settings; `Cmd/Ctrl+B` or the native View menu restores the
sidebar after hiding. macOS aligns native traffic lights at `{ x: 16, y: 16 }`
inside left-positioned sidebar chrome and at `{ x: 16, y: 8 }` to center them
vertically in the 30 px main drag strip when the sidebar is on the right;
Windows keeps Bakbak-styled window buttons on the platform-standard right edge.
The Personal/Bakbak segmented switch lives at the top of the unified sidebar.
Authentication and loading keep the same full-window geometry without adding
a renderer header row. Authentication keeps only the Bakbak lockup, a short
private-space label, and the focused sign-in/invite form; narrow windows
collapse to the canvas and compact lockup. Loading shows the same empty shell
with one bounded progress cue. Their form/loading canvas uses the same 8 px top,
right, and bottom inset while the story rail remains flush to the left window
edge. Sign-in and invite mode preserve native autofill
and validation, explicit password visibility, and keyboard-accessible tabs.

### Bakbak 2.0 desktop authority

Plan 0038 restores Tauri 2 as the target desktop runtime under `src-tauri` and
versions the migration candidate as `2.0.0`. Electron remains buildable only as
a temporary rollback shell until the installed Apple Silicon macOS and Windows
x64 acceptance matrices pass. Electron-specific lifecycle, capture, updater,
and five-sound statements later in this document describe that fallback or
pre-2.0 history; this section and plan 0038 supersede them for the target
runtime. No release or Electron deletion is implied by source completion.

The renderer's only native boundary remains `src/lib/desktop-runtime.ts`.
`src/lib/tauri-desktop-runtime.ts` implements its allowlisted Tauri commands and
events; feature modules cannot import `@tauri-apps/*`, a restriction enforced by
a repository contract test. Native commands authorize the main or overlay
window as appropriate and validate bounded device identifiers, settings,
tokens, URLs, and audio payloads. The bridge exposes window actions,
permission/recovery state, updater delivery mode, tray/overlay lifecycle,
external-audio state and levels, and the supervised screen-helper lifecycle;
it exposes no generic command, path, URL, or IPC primitive.

The Tauri shell retains `com.bakbak.desktop`, macOS 12.3 minimum deployment,
Apple Silicon macOS, and Windows x64. It owns single-instance/deep-link
activation, secure production content/CSP, validated external links, native
menus, permission recovery, relaunch, persisted main-window state, teardown,
and crash recovery. macOS traffic lights remain native-command-owned. Windows
uses renderer-drawn Bakbak minimize, maximize/restore, and close buttons in a
native-safe top-right region instead of Electron Window Controls Overlay.
On macOS, Bakbak's explicit Tauri content-process termination hook reloads only
the trusted main or soundboard-overlay webview and requests a normal application
restart if that reload fails. Before the main webview reloads, Bakbak
synchronously stops the supervised screen-share helper and clears its native
session so an invisible companion publication cannot outlive its owning
renderer; recovering only the soundboard overlay leaves a main-window screen
share alone. On Windows, Bakbak subscribes to WebView2 process failures:
renderer/frame-render exits or an unresponsive renderer reload the webview,
while browser-process or unclassified failures request an application restart;
both actions stop native screen sharing before recovery begins. The native menu
Reload action uses the same stop-before-reload order. Renderer-only main-window
recovery deliberately leaves the external-call mixer running so its state can
rehydrate; a true process restart or quit releases it through normal application
teardown.
Holding `Cmd/Ctrl+Shift+B` opens the full-screen sound wheel on the monitor
under the pointer; release plays the selected sound and hides the window.
The first sound in the remembered category/page is selected on each opening.
Six sounds occupy equal radial sectors; hovering selects with animation and a
quiet headphone-only tick, while left-click plays once and dismisses. Scroll
up advances and scroll down goes back through existing category pages, wrapping
at both ends. A non-passive wheel listener handles either axis (Shift in the
held shortcut can remap vertical mouse input to horizontal), consumes webview
zoom/pan defaults, and accepts single-line notches without a pixel threshold.
A 180 ms same-direction throttle limits momentum; reversal is immediate.
Each account/server remembers its page locally. Escape, the
top-right close button, and losing focus cancel without playback. Native
interaction IDs fence repeated key-down, stale release, and click/release races;
the native release hides even if the renderer is slow. Tray/settings opening is
click-to-play browsing without requiring a held shortcut. Ordinary main-window
close exits; while external-call audio is live, the first close explains that
audio will continue and a confirmed close hides the window. Tray actions show
Bakbak, show Soundboard, stop the external microphone, or quit.

Before Supabase initialization on the first Tauri generation-2 launch, Bakbak
clears legacy WebView storage, known and discovered IndexedDB databases, caches,
drafts, layout, and device preferences. It writes the generation marker only
after database enumeration and every deletion complete successfully. A failed
enumeration or deletion leaves the marker unset and shows a bounded retry
screen; Supabase is not initialized against partially reset local state. The
reset does not migrate authentication tokens, so `2.0.0` requires sign-in again
while cloud messages, profiles, favorites, and server state restore normally.

The screen-share helper now uses a shell-neutral `{ hostRootPid, audioRootPid,
bundleId, appVersion }` host contract and ships as a supervised Tauri sidecar.
Entire-screen capture excludes the proven Bakbak host process tree; application
capture includes only the chosen application's process tree. On Windows, the
shell tracks the WebView2 audio process and withholds isolated audio until the
relationship is proven. macOS 14.2+ and Windows build 20348+ can expose isolated
system/application audio; older supported macOS versions remain video-only.
Missing identity or isolation proof always fails closed to video-only. Video,
quality/pause state, helper recovery, companion LiveKit publication, and the
single remote playback route remain available through the same typed adapter.

Soundboard playback is single-active and latest-wins. One persistent named
LiveKit publication and the decode cache are reused. Starting a replacement
cancels any pending fetch/decode, fades and stops the current source, and fences
stale asynchronous completions; failure returns the coordinator to an idle,
usable state. `activeSound | null` and stop-current replace count, five-sound,
and stop-all UI contracts. The named LiveKit track is audible truth; reliable
v2 stop-then-play data messages are bounded UI metadata and must roll out to the
small friend group together.

External-call mode is a Tauri-managed Rust audio engine that survives hidden
windows. Users explicitly choose a physical microphone, BlackHole 2ch or
VB-CABLE render endpoint, its paired call-app capture endpoint, and headphones.
The wizard rejects cable-as-microphone selections and loops, provides meters,
a sound test, and a bounded in-memory local test recording. The engine mixes a
48 kHz mono microphone at 100% with one latest-wins clip at 70%, applies a soft
limiter and bounded real-time buffers, and monitors effects—but never the live
microphone—through headphones. Bakbak voice and external-call mode require an
explicit confirmed handoff in either direction. Logout, device or permission
loss, sleep, stop, and quit silence and release all streams; sleep never resumes
them automatically. Microphone samples are never stored, uploaded, or logged.

macOS `2.0.x` delivery is manual DMG replacement while the app is ad-hoc signed;
the build emits no automatic-updater entry and permission continuity is not
promised. Windows uses signed Tauri updater artifacts after the one-time manual
`2.0.0` installation, and missing updater signatures fail packaging. Electron
source and artifacts stay until plan 0038's installed shell, screen-share,
external-audio, and migration/update gates all pass.

macOS uses a hidden-inset titlebar, native overlay traffic lights, and
active-state-following `under-window` vibrancy. Windows uses a transparent
hidden titlebar with a Bakbak-rendered native-safe control region and applies
Mica on Windows 11 22H2 or newer. Reduced-transparency, high-contrast, older
Windows, browser, and unsupported environments use an opaque scheme-aware
fallback. The native View
menu owns `Cmd/Ctrl+B`; browser/mock uses the same renderer shortcut. The
user-dock control closes the visible sidebar and disappears with it; the native
View menu and `Cmd/Ctrl+B` remain the restore paths.
macOS traffic-light visibility and vertical alignment are native-shell-owned
and reapplied after window focus, restore, and fullscreen return.
The sidebar defaults to 280 px on the left, can move to the right from
Appearance Settings, resizes from 248–340 px on either side, stays mounted but
inert at zero width when hidden, and leaves a
420 px minimum conversation canvas while visible. Both tracks use the complete
window without an outer inset; the conversation canvas has no shell border,
radius, or shadow. Hiding the sidebar lets text, voice, or focused share fill
the window without changing call state. Layout preferences v5 persist
`sidebarVisible`, `sidebarWidth`, and `sidebarPosition`; migrate v4/v3/v2
left-panel fields and v1 visibility; and discard retired right-panel state.
Settings remains a centred,
focus-trapped in-app modal with internal scrolling, active-call controls,
confirmed logout, and account-scoped cache management.

Glass is the default per-space control-chrome mode. The sidebar slot itself is
always unpainted so the current window material or translucent theme remains
visible behind it, while the conversation canvas stays solid and the segmented
switch, composer, call dock, user dock, dialogs, and other floating controls
retain scheme-aware Glass. Each signed-in account can independently use Glass
or a three-stop translucent gradient for Personal and Bakbak, set 20–100%
transparency, make gradients darker or lighter, and choose no texture, dots,
or grain. Glass defaults to 100% transparency. Untouched v1 sidebar defaults
migrate to that Glass value; untouched v2 Glass records from the former 45%
default are promoted once, while legacy Solid records
become single-color translucent gradients, and existing gradients keep their
colors and positions within the new transparency clamp. The retired one-time
appearance prompt and completion flag are neither rendered nor persisted.
The gradient picker places three draggable, click-to-recolor points on the live
field; their positions determine gradient direction and the middle stop.
Alt+Arrow provides keyboard positioning, and eight one-click presets sit below
the field.
The interaction accents remain the space-owned honey/teal and violet/blue tokens
so control contrast does not depend on a user-selected background. Switching
spaces updates the gradient and accents while
only the destination sidebar content below the stationary space switch enters
directionally over 345 ms: Personal moves left from the right and Bakbak moves
right from the left. The channel header, conversation canvas, live application
tree, and global call dock stay mounted and still; reduced motion applies the
destination immediately. The
conversation canvas is `#171717` in dark mode and near-white in light mode.
Auto, Light, and Dark appearance choices remain device-local and apply before
React mounts. Appearance Settings contains the live per-space chrome editor.

Desktop media recovery now crosses the preload boundary as typed permission
snapshots and a discriminated screen-source result instead of renderer string
inspection. Microphone capture/test actions may request macOS access, then
surface platform-correct Privacy Settings and restart actions after denial.
Windows recovery points to the global microphone and desktop-app privacy
switches. Screen-source enumeration reports macOS denied/restricted states,
source and system-audio capabilities, and enumeration failure separately; on
Windows it never claims a Bakbak-specific screen-capture permission exists.
Local macOS packages remain ad-hoc signed. When Apple credentials are
available, releases use one stable Developer ID Application identity for both
`Bakbak.app` and the screen-share helper, followed by notarization, stapling,
and Gatekeeper assessment. Until the project can enroll in the Apple Developer
Program, an explicit all-credentials-missing fallback publishes only an ad-hoc
DMG plus a manual-install warning. It removes the macOS ZIP, `latest-mac.yml`,
and legacy macOS updater payload instead of advertising an unsafe automatic
update; partially configured credentials still fail the build. The first
Developer ID release changes identity from older ad-hoc installs and can
require one final manual replacement and permission grant; subsequent releases
signed by the same team preserve the code requirement that macOS uses for
microphone and Screen Recording continuity.

Inter Variable is bundled locally at weights 400–700 with `Inter`,
`Avenir Next`, `Segoe UI`, and `sans-serif` fallbacks. The rem-based scale uses
16 px chat, 14 px controls, 12 px metadata, and 11 px captions. Controls use
8–10 px curves, cards 14 px, the conversation canvas 16 px, and dialogs 20 px,
with one-pixel borders, two-pixel focus rings, and restrained shadows.

Profiles retain validated display names, 190-character plain-text
descriptions, static or GIF avatars, 3:1 static or GIF covers, integer cover
focal points, target-specific GIPHY selection, private media, and accessible
anchored cards. Admin-only controls create or rename ordinary text and voice
rooms through a single plus menu that offers Text channel and Voice channel
choices. The sole non-collapsible Channels shelf contains Welcome, Chat, Volt,
Random Things, then Game #1–#3. Welcome keeps the internal `system-general`
purpose and is automation-only for future member joins, but has no System
category or lock-heavy presentation. New text rooms append after Random Things
and new voice rooms after the last voice room.

The sidebar previews up to six other members regardless of online status,
prioritising people in voice, then online, away, and offline members with
deterministic name order. Its Activity header is an accessible disclosure that
defaults open and remembers its collapsed state per account and server on the
device. A seventh flat row opens Show all in a centred focus-trapped overlay
grouped as In Voice, Online, Away, and Offline, including the current user as
You while preserving profile, DM, context, and stream-watching actions.
Forty-six-pixel preview rows use 38 px avatars and more breathing room. Online
names are bold and their lazy cover texture is clearer, while away/offline
treatment remains quiet. Personal omits this server preview. The right
member/details rail no longer exists; the DM conversation-introduction identity
opens the same profile surface. Category and channel snapshots
request active rows only, archive Realtime reconciliation removes navigation
rows, and an archived selection falls back to the first active room.

Upgraded clients expose chat, structured individual mentions, account-synced
unread emphasis, incoming-message sounds, and drafts only for text channels.
One original soft, rounded interface-sound controller covers committed message
send, incoming messages, successful microphone mute/unmute and
deafen/undeafen, self/remote voice join/leave, local/remote screen-share
start/stop, reconnect success, and actionable communication failure. The
170 ms deafen cues are deterministic 48 kHz mono 560→390 Hz and 390→560 Hz
glides at controller gain 0.72. These cues run through the system output,
independently of the selected call/soundboard output.
Voice-channel message rows, RPC permissions, and read-state data remain intact
for installed-client compatibility, but the upgraded renderer neither loads,
subscribes to, sends, drafts, notifies, nor shows unread state for them. No
destructive database migration accompanies this client-only boundary.

Text channels and Personal DMs now share the plan 0022 rich-message boundary.
Each keeps its channel- or person-specific welcome introduction, followed by a
plain message history or a compact accessible `No messages yet` status with
target-specific first-message copy. Conversation rails, branches, grouped-row
dots, terminal markers, decorative empty branches, and Quiet/Flowing labels
are absent. Chat-author avatars and voice-room participant media are circular;
member, profile, and sidebar avatar geometry retains its established shapes.
A shared conversation scroll contract opens each channel or DM at the bottom
without smooth motion. Within 96 px of the bottom, new rows pin immediately.
Otherwise message appends preserve the viewport and increment a pluralized New
message pill; hydration-only message, reaction, and preview updates never move
the reader. Older-history fetches disable their trigger and restore the exact
viewport through the post/pre `scrollHeight` delta.
A draft may contain structured text/mentions plus up to four private
image/GIF/H.264 MP4 attachments, one standalone Bakbak sticker, or one GIPHY
GIF/sticker with an optional text caption, and may quote one visible message
in the same thread. The shared Discord-shaped composer keeps attachment on the
left, text in the flexible centre, and supported GIF, Bakbak sticker, searchable
native emoji, and send actions on the right. Emoji insertion respects the
current text selection and preserves structured mention ranges. In its resting
state, the composer wrapper keeps its 68 px footer band and 52 px message bar.
The sidebar user dock is a separate compact 56 px control row with a 12 px
rounded raised background and no profile cover backdrop, keeping identity and
call controls readable without competing artwork.
Replies notify the other author by default, self/deleted/former-author
notifications are disabled by the database, and author deletion leaves a
scrubbed tombstone so read pointers and reply references remain valid. Message
hover/focus actions provide Reply, Bakbak sticker reaction, and author-only
Delete. Message INSERT/UPDATE and sticker/reaction events hydrate the complete
row before replacing the cache, avoiding cross-table Realtime ordering
assumptions. Existing `send_message` and `send_direct_message` remain available
for installed-client compatibility; v2 sends generate `[Image]`, `[Video]`,
`[GIF]`, or `[Sticker]` fallback bodies.

Plain-text segments in channel messages and Personal DMs recognize `http://`,
`https://`, and `www.` URLs without disturbing mention segments or trailing
punctuation. Links open through the desktop adapter's validated system-browser bridge, with a
`noopener` browser fallback. After a committed send—or once per session for
loaded history—the renderer asynchronously requests one preview without
delaying the message. The authenticated `link-preview` function re-reads the
stored row through the caller's RLS session, extracts the first URL itself,
allows only public HTTPS HTML, and stores text-only page metadata or a bounded
YouTube descriptor. DNS A/AAAA, credentials, custom ports, IP literals,
private/reserved networks, every redirect, three redirects, a three-second
deadline, and 512 KiB are enforced server-side. Failed previews are timestamped
for a 24-hour retry; Realtime UPDATE hydration distributes results without
replaying incoming-message sounds. Generic remote images and markup never
render. YouTube uses a CSP-limited `youtube-nocookie.com` iframe only after an
explicit click and a permitted `i.ytimg.com` thumbnail.

Voice rooms retain locally persisted microphone/speaker/camera selection,
opt-in 720p camera calls, sidebar occupancy with elapsed timers, mute/deafen,
listener-local 0–200% per-participant volume, remote-track audio/video
rendering, autoplay recovery, and reconnect/error states. The people view uses
one centred profile/camera circle, a two-to-four-person overlap cluster, a
normal centred wrapping row for five to ten people, and a denser wrapping
fallback above ten. Participant circles are 20% larger than their original
circular-layout sizes. Hover or keyboard
focus reveals a forgiving above-avatar identity/action tooltip with profile,
LIVE, and remote-volume controls without covering the avatar. Non-LIVE profile
and camera circles are passive; only a LIVE circle or its LIVE action opens the
owner's focused share.
Microphone capture keeps WebRTC noise suppression and automatic gain control
and defaults to a second device-local RNNoise stage in a 48 kHz AudioWorklet
before LiveKit publication.
Audio settings expose only the Bakbak noise-cleanup switch; the former Natural,
Child, Robot, and Walkie-talkie Voice Lab effects no longer exist. Unsupported
or failed RNNoise processing enters an explicit built-in-WebRTC fallback state
without blocking the call. The switch commits On only after the worklet reports
ready and acknowledges its configuration. Runtime processor failure restores
the original sender track or reports that the call must be rejoined. Installed
macOS additionally offers a default-on `Keep other audio at full volume`
switch. It sets `echoCancellation: false` to avoid
WebKit/macOS voice-processing attenuation while retaining WebRTC noise
suppression, automatic gain control, and RNNoise, and warns the user to wear
headphones because RNNoise is not acoustic echo cancellation. Browser/mock,
Windows, and other platforms always keep echo cancellation enabled and do not
show this control. The explicit microphone test uses the same resolved capture
mode and processed preview through the selected call output, renders separate
raw-input and Studio-output meters, and lets the user toggle RNNoise live
without reopening capture. When a call is active, starting the test first
temporarily mutes and deafens that exact room; stop, failure, unmount, or stale
startup restores the user's previous mute and deafen state. The test releases
the monitor, stream, processor, analysers, and call-isolation transaction
together on stop. If the preview worklet is unavailable, testing continues on
the raw WebRTC-cleaned stream with an explicit fallback notice.
Connected microphone and macOS capture-mode changes are one serialized restart
transaction on the existing named speech track. LiveKit preserves its mute
state and restarts any attached RNNoise processor against the new source.
Controls remain disabled while pending; the renderer commits and persists the
new selection only after successful capture. A failed capture restarts the
previous complete constraint set and reports whether rollback recovered or the
old microphone could not be restored. Leaving or replacing the room makes the
pending result stale, so it cannot commit to the next room.
Every shared user identity can open one viewport-clamped portal action menu by
right-click, Menu, or Shift+F10. The accessible menu supports profile, direct
message, and user-ID copy actions, omits self messaging, and keeps existing DMs
available offline while disabling offline creation. Remote participants in the
active call additionally expose a local mute toggle. Participant volume zero
is applied across speech, soundboard, and share audio; unmute restores the last
non-zero level—including a boosted level—or 100%. One remote-audio renderer
owns every hidden speech, soundboard, and watched-share element with
owner/source/base-gain metadata. LiveKit first attaches the remote stream, then
the renderer feeds that concrete MediaStream into one listener-owned Web Audio
gain stage; the companion element stays muted at zero volume so LiveKit
playback recovery cannot create an unprocessed duplicate. Engines that reject
the stream source retry an element-backed gain stage. All stages mix through one
4×-oversampled soft limiter whose linear region ends at 90% and whose output
ceiling is 98%. Participant gain ranges from 0 to 2, while
source/global/base gains remain bounded to unity, so speech uses participant
gain once and soundboard/share retain their existing multiplication without
receiving the boost twice. A single hidden MediaStream output monitor routes
the limited mix through the selected speaker. Unsupported graph creation falls
back to the existing 0–100% media-element path and is visible as
`limitedOutput: false` in the privacy-safe voice diagnostics.
The renderer treats this as an exact-once routing invariant rather than a
one-time setup step. A stream-backed companion must remain attached exactly
once, muted, and at zero element volume; an element-backed graph or unsupported-
graph fallback retains its single audible element route. LiveKit-like
`volumechange`, room playback-status changes (blocked or restored), output
changes, `playing`, and bounded pause/stall/error/ended recovery all reassert
the correct route. Error/ended reattachment rebuilds a direct MediaStream gain
stage before playback resumes so a replacement stream cannot leave the old
graph connected. Privacy-safe diagnostics schema v3 reports only the route
type, attachment state/count, and invariant result alongside existing opaque
participant/publication SIDs and playback health; it records no device label,
stream content, token, or persistent user identity.
Deafen is enforced at the final listener mix as well as each source boundary:
the shared output monitor is hard-muted, current and future gain stages are
zeroed, and attached LiveKit remote-audio tracks receive binary zero volume.
Undeafen reopens those boundaries and reapplies the existing participant and
soundboard gain model, so speech, watched-share audio, and soundboard clips
cannot leak through a deafened client.
The renderer reconciles LiveKit's current subscribed publications after
initial connection, signal resume, full reconnect, and output changes instead
of depending on a future subscription event. Publication and gain-stage
ownership are idempotent, and output autoplay plus paused, stalled, failed, or
ended source playback use the same bounded recovery path. Detach, departure,
room replacement, and hook teardown disconnect every source/gain node, stop
the routed stream, remove its monitor, and close the context. Listener-owned
session state, not backend metadata, drives both current and future
attachments; LiveKit track volume is only a binary deafen safety boundary.
Sender capture constraints, browser AGC, echo cancellation, and RNNoise
defaults are unchanged pending repeatable installed macOS/Windows input
measurements.
Selecting a voice channel immediately joins it; selecting another voice channel switches
the active call without a pre-join or initial connection surface. An active call
adds a sidebar status block with connection state, room, disconnect, and a
compact camera, screen-share, and soundboard action row. The
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
The drawer retains persisted global volume, per-participant volume, retry
states, and one activity badge. Every ready sound remains clickable; choosing a
new sound replaces the current clip. A standalone bottom-right circular stop
action stops only the current clip. There is no concurrency counter or stop-all
contract. The global voice dock keeps the same compact stop-current action.
Participant circles autoplay GIF profiles unless reduced motion is requested,
crop active cameras, and blend the newest sound emoji over either surface at
20% opacity with overlap counting. Screen-share ownership adds a static red
outer LIVE ring and squared red badge while the theme speaking ring remains
independently visible; the LIVE circle and tooltip action focus/watch the
share, and a share without a reconciled participant receives a fallback LIVE
circle. The focused stage contains only the share media plus presenter quality
controls when applicable; activating that media returns to the unchanged
people view without a participant expansion, Back control, or renderer
fullscreen mode. Deafen suppresses remote
speech and local/incoming soundboard
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
transient and optimistic object URLs; full video, original animated media,
GIPHY URLs, and GIPHY assets are never persisted. A message poster is admitted
to that cache only after a stable authenticated account is confirmed and its
blob has non-zero bytes, a PNG/JPEG/WebP MIME type, and a successful image
decode. An invalid cached poster is evicted before one authenticated fresh
download; an account change during retrieval prevents the result from being
cached. Offline, unauthenticated, forbidden, missing-object, invalid-blob,
decode, and transient failures remain distinct sanitized outcomes. Data &
storage clearing removes both media caches without touching cloud content.

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

The additive `202607260001_giphy_profile_media.sql` migration is implemented,
validated locally, and deployed to the hosted project. It adds mutually
exclusive bounded `avatar_giphy_id` and `cover_giphy_id` profile sources and
extends the participant-authorized direct-conversation summary RPC with those
identifiers. Provider files and URLs never enter Postgres or Storage.

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

Migration `202607240001_system_channels_and_link_previews.sql` introduced the
historical System rooms, welcome/release automation, and protected link
previews. Its follow-up publishes category changes through Realtime. Plan 0034
retires only the release-announcement portion: the hosted `system-events`
function, manual history workflow, release job, secret, and
`publish_system_release` RPC are removed. Link previews and typed Welcome
automation remain.

The additive `202608010001_unified_bakbak_channels.sql` migration was applied to
the hosted Bakbak project after explicit production approval on 2026-08-01. It
adds nullable channel/category archive timestamps, archives every pre-0034
category and room without deleting related history, creates one fresh Channels
category and seven fresh empty rooms, and restricts member/admin policies,
activity, presence, read states, and management RPCs to active rows. Future
membership events target the fresh active Welcome room; historical membership
and release events are not backfilled.

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
to muted after the active sound ends or stop-current runs. This prevents
an idle synthetic microphone stream from keeping system audio in a suppressed
communications state. Track name, rather than source, distinguishes soundboard
audio from speech. Every clip applies a 20 ms final envelope to digital zero on
both outbound and local paths, and manual stops zero that envelope before
stopping the source. Explicit stop-current and voice teardown invalidate
in-flight playback work and disconnect the active source. The shared
`AudioContext`, selected-output monitor graph, decode cache, and LiveKit
publication remain reusable, avoiding renegotiation before the next sound.
Receiver-side soundboard elements mirror LiveKit mute/unmute state and
hard-mute immediately on a synchronized stop event, preventing a retained final
media frame from remaining audible. The final Arc-plus-native
voice, video, device, soundboard, reconnect, and crash-expiry rehearsal remains
open for human observation.

Installed Apple Silicon macOS and Windows x64 clients share one Bakbak Entire
screen / Application picker before capture starts. Tauri delegates bounded
source discovery and native capture to the packaged
`bakbak-screen-share-helper`, which publishes least-privilege companion tracks
to LiveKit over a supervised, versioned JSON-lines protocol. If its handshake,
identity proof, or runtime fails, the shell downgrades that share to video-only
instead of disabling Share or attempting Chromium loopback. Entire-screen audio
excludes Bakbak's proven host process tree; application audio includes only the
selected process tree. Windows additionally proves the tracked WebView2 audio
process before advertising isolated audio. The temporary Electron fallback
uses the same helper protocol but is not the target release backend. The
presenter still selects 480p/720p/1080p and 15/30/60 fps with exact 0.8–8 Mbps
ceilings. Helper crash, timeout, malformed protocol, source end, voice leave,
explicit stop, window teardown, and app quit terminate the native session and
emit sanitized lifecycle state. The desktop bundle minimum remains macOS 12.3.

Tauri owns application metadata, secure window creation, the application
protocol/CSP, least-privilege permissions, icons, purpose strings, menus, tray,
and update delivery. GitHub Actions validate the renderer, Deno functions, all
Rust crates, pgTAP policies, boundary contracts, compiled artifacts, and native
packages. Native runners package an Apple Silicon DMG and Windows x64 NSIS
installer. macOS remains manual-DMG-only while ad-hoc signed; Windows emits
signature-mandatory Tauri updater payloads after the initial manual install.
The application ID stays `com.bakbak.desktop`, the product name stays `Bakbak`,
and GitHub Releases remains the delivery channel. Bakbak v0.4.0 remains the
final Intel macOS release. Developer ID signing/notarization, Windows code
signing, and installed migration/update rehearsals remain release gates.

## Technology stack

| Layer                | Technology                        | Responsibility                                                                            |
| -------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| Package/tooling      | pnpm, TypeScript                  | Dependency management and strict static types                                             |
| Renderer             | React, Vite                       | Desktop UI, local interaction state, and stale-while-revalidate restoration               |
| Local read cache     | IndexedDB                         | User-scoped workspace, recent messages, and bounded authenticated profile/message posters |
| Desktop shell        | Tauri 2, Rust                     | Sandboxed window, typed adapter, native controllers, packaging, tray, and updates         |
| Identity/data        | Supabase Auth, Postgres, Realtime | Accounts, membership, channels, messages, invites, and realtime chat                      |
| Trusted backend      | Supabase Edge Functions           | Voice tokens, managed media, System events, and authenticated safe link metadata          |
| Object media         | Supabase Storage                  | Private sound, profile, message, video, and sticker objects with RLS-filtered access      |
| Local microphone DSP | Web Audio, RNNoise WebAssembly    | Off-thread enhanced cleanup with a built-in WebRTC fallback                               |
| External-call audio  | Rust, CPAL, virtual cable         | Bounded physical-mic/effect mixing into user-installed BlackHole or VB-CABLE              |
| Voice/data transport | LiveKit                           | Voice rooms, participant state, processed speech, soundboard audio, and control data      |
| Validation/testing   | Zod, Vitest, Testing Library      | Boundary validation and unit/component tests                                              |

There is one pnpm application, not a frontend/backend monorepo. `package.json`
pins pnpm `11.17.0` through `packageManager` so local installs and GitHub Actions
use the same package-manager release. Supabase assets live alongside the app for
local development and deployment.

## Repository structure

The intended structure is:

```text
bakbak/
├── AGENTS.md
├── .github/
│   └── workflows/                 # Pull-request validation and desktop releases
├── build/                          # Bundle icons and macOS entitlements
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
│       ├── 0023-modern-interface-audio.md
│       ├── 0024-collapsible-channel-tree.md
│       ├── 0025-conversation-root-and-message-trail.md
│       ├── 0026-system-adaptive-unified-accent.md
│       ├── 0027-system-channels-link-previews-and-deafen-audio.md
│       ├── 0028-bakbak-1-0-interaction-and-loading-polish.md
│       ├── 0029-simpler-chat-and-reliable-voice-input.md
│       ├── 0030-media-and-voice-reliability.md
│       ├── 0031-giphy-profile-avatars-and-covers.md
│       ├── 0032-windows-screen-share-audio-isolation.md
│       ├── 0033-friend-test-voice-presence-and-media-stabilization.md
│       ├── 0034-buzz-inspired-unified-bakbak-redesign.md
│       ├── 0035-titlebar-space-motion-and-circular-voice-polish.md
│       ├── 0036-arc-glass-shell-and-permission-recovery.md
│       ├── 0037-native-electron-screen-audio-isolation.md
│       └── 0038-tauri-2-reliability-upgrade.md
├── public/
│   ├── bakbak.svg                 # canonical favicon/native-icon source
│   ├── fonts/roundo/              # pinned Roundo v2.0 variable WOFF2
│   ├── interface-sounds/          # generated original 48 kHz mono WAV cues
│   └── vendor/
│       ├── ffmpeg/                # lazy reduced LGPL core and license
│       └── rnnoise/               # bundled RNNoise/Jitsi license notices
├── scripts/                       # checks, release/audio generation, reduced-core build
├── electron/                      # temporary, buildable 2.0 rollback shell
├── native/
│   ├── external-audio/            # bounded CoreAudio/WASAPI external-call mixer
│   └── screen-share-helper/       # process-isolated native capture sidecar
├── src-tauri/                     # trusted Tauri shell, commands, and capabilities
├── third_party/roundo/             # Roundo source record and SIL OFL notice
├── src/
│   ├── app/                       # application shell, routing, providers
│   ├── components/                # reusable UI, including the static SVG mark
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
├── third_party/
│   └── ffmpeg-soundboard/         # pinned reduced-core recipe and notices
└── supabase/
    ├── functions/
    │   ├── link-preview/
    │   ├── livekit-token/
    │   ├── message-media-manage/
    │   ├── soundboard-manage/
    │   └── sticker-manage/
    ├── migrations/
    ├── seed.sql
    └── tests/                     # RLS and database behavior tests
```

The feature folders shown above contain the implemented v1 slices; empty
architectural placeholder folders are not used.

## UI composition

The renderer uses a native-overlay, two-track desktop layout and modal layer:

1. No full renderer titlebar or contextual header remains. The signed-in
   native-safe overlay is zero-width and contains no renderer controls.
   macOS keeps native traffic lights on the platform-standard left edge (inside
   the sidebar when it is left-positioned) and vertically centers them in the
   main drag strip when the sidebar is right-positioned; Windows keeps
   Bakbak-rendered caption controls on the right. The main canvas contributes a 30 px,
   action-free drag strip so the
   frameless window always has a predictable grab target. The native View menu
   and browser fallback expose the same `Cmd/Ctrl+B` action; blocking dialogs
   suppress the toggle.
2. The 280 px default sidebar is permanently unpainted over the current window
   material or translucent theme and begins with the glass Personal/Bakbak
   segmented switch. Bakbak then shows a default-open, locally remembered
   collapsible Activity preview of six members plus a Show all row, followed by
   one flat Channels shelf; admins use one plus control to choose a text or
   voice channel from a small menu, while rename actions stay centered on their
   channel rows. Personal shows its
   heading, New message, and DM list without duplicating server presence.
   Active-call controls and the current-user dock stay pinned at the bottom in
   both spaces. The active-call card uses a compact connection state/room
   block, isolated leave action, and three equal camera/share/soundboard
   controls. The dock is a 56 px, cover-free Buzz-like identity row with a
   12 px rounded raised surface, profile trigger, semantic presence label, and
   Settings/voice controls plus one adjacent keyboard-described sidebar-close
   button. One resizer keeps the track within 248–340 px on either edge.
   Appearance Settings can place the sidebar on the left or right without
   changing its saved width or visibility. At zero width the dock control is
   clipped and inaccessible with the mounted slot `aria-hidden` and inert.
   `Cmd/Ctrl+B` or View → Toggle Sidebar restores it.
3. Beneath the compact drag strip, the flexible solid canvas contains the text
   or voice conversation without a contextual top bar. Its accessible
   main-region name carries the selected
   text channel, voice channel, DM, or Personal context. When the sidebar is
   hidden, the canvas becomes borderless and full-window with no hidden overlay
   clearance. Text channels and DMs use a 16 px Buzz/Slack-style
   timeline: author/avatar headers start five-minute groups, follow-ups compact,
   hover/focus actions float above the row, and the rounded composer stays at
   the bottom. Replies, mentions, rich media, reactions, deletion, unread
   behavior, scrolling, and drafts keep their established contracts.
4. Show all opens the reusable wide modal and groups members as In Voice,
   Online, Away, and Offline. The modal traps and restores focus, includes You,
   and retains profile, DM, context-menu, and Watch Stream actions. Known
   heartbeat sessions merge with the current LiveKit room so active members
   appear before the next heartbeat.
5. During a call, an absolute centered dock appears across channel navigation.
   It auto-hides without consuming layout, clears the text composer, remains
   keyboard discoverable, and owns its More menu and compact 480×380 maximum
   soundboard popover anchoring.
6. Selecting a voice channel joins it immediately, and selecting another voice
   channel switches the active call. Hover/focus can prepare one candidate room
   without media or presence side effects; click consumes that work and shows a
   compact stage loader instead of a blank canvas. A disconnected room offers
   a concise rejoin action instead of going blank. After connection, the people
   view uses one centred circular participant, an overlapping two-to-four
   cluster, a normal centred wrapping row for five to ten people, and a denser
   wrapping fallback above ten. Every participant circle is 20% larger than its
   original circular-layout size.
   Normal profile and camera circles are passive while their above-avatar
   tooltip exposes identity, profile, and listener-volume actions. A LIVE
   circle or LIVE action opens its share in a media-only focused stage; clicking
   that media returns to the people view. Watched share playback continues in
   the LIVE circle, while target loss also clears its subscription.
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
   conversation canvas remains solid while the sidebar slot stays transparent
   and floating navigation and controls use Glass. Deliberate translucent
   gradients remain scoped to their selected space. Independent positive,
   danger, warning,
   and icon colors retain
   their semantic roles; selection and ordinary controls use the active
   Bakbak or Personal accent.
   Renderer identity screens and the Personal empty state use the static
   linked-`bb` Bakbak mark. The unified sidebar no longer spends vertical space
   on a separate server brand/version header. A one-shot renderer-launch assembly
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

### Tauri shell and native controllers

Tauri owns the native window, stable application identity, desktop bundle,
update delivery, screen-helper supervision, external-audio engine, and
operating-system integrations. The main window keeps the established 1280×800
geometry with a 1024×680 minimum and persisted position/maximized state. macOS
uses a hidden-inset titlebar with traffic lights at `{ x: 16, y: 16 }` for the
left sidebar and `{ x: 16, y: 8 }` for the right sidebar's 30 px drag strip.
Windows uses a hidden titlebar, optional Mica, and renderer caption buttons that
invoke only minimize, maximize/restore, and close. CSS drag regions remain the
window movement boundary. Native menus own sidebar and zoom actions, and the
global soundboard overlay accelerator is `Cmd/Ctrl+Shift+B`.

Production content runs under Tauri's application protocol with the configured
CSP; development accepts only the fixed `http://127.0.0.1:1420` Vite origin.
Navigation and popups are denied by default, and validated external opening
accepts only HTTP(S). Capability files split ordinary main-window access,
external-soundboard access, and Windows updater access. Renderer features call
the shell-neutral desktop adapter, which exposes individual typed methods and
events rather than `invoke`, filesystem paths, arbitrary URLs, shell execution,
or a generic event channel. Native calls are convenience boundaries, not
substitutes for Supabase RLS or Edge Function authorization. Edge Function CORS
continues to accept the exact desktop origins required by supported installed
clients, never a wildcard.

The application ID remains `com.bakbak.desktop`. A generation-2 marker guards
the one-time local WebView reset before backend startup. Browser/mock and
unsupported hosts use typed renderer fallbacks. Native accent changes,
permission snapshots, settings recovery, relaunch, updater state, and window
state cross the same bounded adapter. Windows cannot reliably preflight its
microphone grant through this shell API, so an `unknown` snapshot remains an
actionable recovery state with the native settings route available; an actual
capture denial surfaces that route instead of pretending the permission is
permanently unavailable.

Screen-share methods are limited to sanitized `hostIdentity`, `capabilities`,
`listSources`, `selectVideoSource`, `start`, `update`, `stop`, and lifecycle
subscription. Hello, audio-disable, and shutdown remain Rust-internal. Start transfers the five-minute
companion URL/token once to the sidecar; request payloads and raw stderr are
never logged. Protocol v1 requires hello before other commands, correlates every
response, limits a line to 32 MiB, a token to 16 KiB, and source lists to 256.
Hello times out at 5 seconds, start at 30 seconds, and other public commands at
15 seconds. A malformed response, unknown request ID, timeout, identity change,
or crash rejects pending requests, terminates the child, and emits a sanitized
failure for an active share. Packaged builds spawn only the Tauri external-bin
sidecar with an allowlisted environment that excludes service credentials.
Quality changes commit only after capture and companion publication both
succeed. A failure before unpublication may restore the prior capture settings;
once unpublish/publish state is uncertain, the helper terminates the companion
session instead of risking a second remote audio route.

The external-audio controller accepts only stable enumerated device IDs and
bounded mono PCM for sound effects/test playback. It owns CPAL streams and the
real-time mixer while all windows are hidden. Level/state/failure events contain
no raw microphone samples. A macOS workspace sleep observer and Windows suspend
notification stop and release the session; device/stream errors take the same
release path. The overlay may show or hide, but cannot keep streams alive after
logout, explicit stop, sleep, permission loss, fatal device loss, or quit.

The tray owns show-main, show-overlay, stop-external-microphone, and quit. The
tray action opens a browsing wheel and `Cmd/Ctrl+Shift+B` opens it only while
held, including while external mode is idle. Idle playback stays disabled;
the renderer's ordinary show-overlay command remains live-session-gated.
`src-tauri/src/soundboard_overlay.rs` owns interaction snapshots, release,
cancellation, and the once-only native commit. Its get/finish commands authorize
only the overlay window. Borderless monitor geometry covers normal applications
without creating a macOS fullscreen Space, and native focus restoration returns
to the previous application on ordinary dismissal. OS shortcuts, exclusive
fullscreen games, and protected input are outside the overlay's guarantees.
The hidden overlay keeps event processing active; a cold release before its
catalog is available dismisses without playing a stale selection. Selection
ticks are generated only in the native monitor callback, never in cable output
or the latest-wins clip slot. Main
close quits while external audio is idle. During an external session, the first
close emits a one-time explanation and a confirmed repeat hides the main
window; closing the overlay always hides it. Process exit synchronously stops
the external engine and supervised screen sidecar.

The temporary Electron main/preload implementation remains in `electron` and
implements the same public adapter shape only for rollback validation. Feature
code has no Electron-specific path, and the fallback is deleted only after the
plan 0038 installed release gate.

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

The renderer uses `livekit-client` 2.21.0, including its buffered resume-event
fix. LiveKit transports a named `bakbak-microphone` speech track, opt-in camera
tracks, at most one named soundboard audio track, desktop screen companions,
participant/speaking state, and small soundboard control messages.
Before publication, the renderer may replace the speech track's source with
the output of its device-local microphone AudioWorklet. LiveKit receives only
that selected processed or fallback speech track; it does not configure or
host the RNNoise stage. Live input changes restart that same named track with
an exact non-default device constraint and the complete capture settings;
LiveKit restarts the attached processor and retains track mute state without
republishing a second microphone. Bakbak reads LiveKit's normalized active
device after the restart and commits the selector/device map only when it
matches. A silent fallback to the previous device triggers rollback and an
actionable error, leaving the separate synthetic soundboard microphone
publication untouched.
A protected Supabase Edge Function is the only component allowed to sign
LiveKit participant tokens. Voice tokens allow microphone, camera, data, and
video-only screen publication. Screen-companion tokens use generated identities
plus owner metadata and allow only screen video/audio publication into the exact
voice room, without subscriptions or data. Each client identifies the
soundboard track by its exact `bakbak-soundboard` name and applies global
soundboard volume multiplied once by the listener-local participant volume
before the shared output limiter.

## Data model

All identifiers are UUIDs unless noted otherwise. Exact migrations become
authoritative once Phase 2 starts.

| Entity                      | Key fields and constraints                                                                                                                                                                                                               | Access intent                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `profiles`                  | `id` references `auth.users`; 1–50 character display name; 0–190 character description; legacy `avatar_url`; mutually exclusive owner-prefixed upload paths or bounded GIPHY IDs per avatar/cover; integer 0–100 cover focal coordinates | User updates their row; shared-server members and established DM participants read member-facing fields    |
| `servers`                   | owner/admin reference, name, timestamps                                                                                                                                                                                                  | Members of the server can read it                                                                          |
| `memberships`               | unique `(server_id, user_id)`; v1 admin/member role                                                                                                                                                                                      | A user can read memberships for servers they belong to                                                     |
| `channel_categories`        | `server_id`, trimmed 1–80 character name, unique ordered position                                                                                                                                                                        | Members read their server categories; trusted migrations manage them                                       |
| `channels`                  | `server_id`, optional category ID, trimmed name, ordered position, immutable `text`/`voice` kind, `chat`/`system-releases`/`system-general` purpose; one System purpose/server                                                           | Members read; admins manage only ordinary chat rooms through RPCs                                          |
| `messages`                  | channel/nullable author, compatibility body/content, member/system kind, typed System event, automation key, reply/media/reaction/deletion metadata, optional text-only preview and attempt timestamp                                    | Members read accessible channels; member writes require ordinary chat purpose; trusted code inserts System |
| `channel_read_states`       | private user/channel key, monotonic last-read message pointer and timestamp                                                                                                                                                              | The owner reads through RLS; membership-checked RPCs advance/query state                                   |
| `direct_conversations`      | canonical ordered participant pair, unique pair, creation/activity timestamps                                                                                                                                                            | Only either established participant can select; creation uses a shared-membership RPC                      |
| `direct_messages`           | conversation/author, compatibility body, structured content, reply/notify metadata, presentation, soft-delete timestamp, optional text-only preview and attempt timestamp                                                                | Established participants read; validated legacy/v2 RPCs write; trusted preview function updates metadata   |
| `direct_read_states`        | private user/conversation key, monotonic last-read message pointer and timestamp                                                                                                                                                         | Only the owner selects; participant-checked RPC advances                                                   |
| `message_attachments`       | private reservation target, uploader, kind/limits, original/poster paths, optional channel/DM message link, lifecycle timestamps                                                                                                         | RLS permits current channel members or established DM participants; trusted functions reserve/delete       |
| `stickers`                  | server/uploader, label, poster/optional animation paths, dimensions, active/archive lifecycle                                                                                                                                            | Current members see the catalog; referenced history stays readable; renderer has no mutation grants        |
| `message_sticker_reactions` | exactly one channel/DM message, server sticker, reactor, timestamp; partial uniqueness indexes                                                                                                                                           | Authorized viewers select; the cap-enforcing toggle RPC alone mutates                                      |
| `invite_codes`              | server ID, one-way code digest, creator, expiry, redemption fields                                                                                                                                                                       | No broad client read policy; redeemed atomically through a controlled function                             |
| `presence_heartbeats`       | unique server/user row, last seen, nullable voice channel/join time, LIVE boolean constrained to voice occupancy                                                                                                                         | Members can read server rows; only security-definer heartbeat RPCs can write                               |
| `soundboard_categories`     | server ID, name, ordered position, sole upload-target flag                                                                                                                                                                               | Members read; trusted server setup manages categories                                                      |
| `soundboard_sounds`         | server/category, label, emoji, Storage path, duration, order, revision, nullable creator, created time                                                                                                                                   | Members read; uploader/admin label and emoji updates only                                                  |
| `soundboard_favorites`      | private user/server/sound key and created time; cascading server/sound/owner references                                                                                                                                                  | The signed-in owner alone selects, inserts, or deletes                                                     |
| `storage.objects`           | private sound/profile objects plus `message-media/<uploader>/<uuid>/{original,poster}` and server sticker paths                                                                                                                          | Trusted functions write message/sticker media; RLS authorizes current channel or retained DM/history reads |

Initial admin membership and initial invite codes are managed with reviewed SQL.
An invite-management UI is deferred until post-v1.

## Authorization model

- Authentication alone does not grant server access.
- Membership in the channel's server is required to read server, channel,
  membership, and message data.
- Channel categories use the same server-membership read boundary as channels.
  Authenticated clients cannot insert, update, or delete categories.
- System room purposes are unique per server and automation-managed. Direct
  writes plus legacy/rich send, reply, media-reservation, reaction, deletion,
  and rename paths reject them for members and admins. Only the membership
  trigger and service-role-only release RPC create authorless typed events.
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
- Link previews are metadata, not client-supplied fetch instructions. The
  authenticated function loads channel rows through membership RLS or DM rows
  through participant RLS, extracts the first stored URL, and lets only its
  service-role client update preview/attempt columns. System releases suppress
  the generic preview.
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
- Profile display names, descriptions, upload paths or bounded GIPHY IDs, and
  cover focal points remain canonical in `public.profiles`. Avatar and cover
  sources are mutually exclusive. Private objects must use
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

1. The segmented switch at the top of the unified sidebar selects an `AppSpace`
   discriminant between Personal and the single server. Each space keeps its
   latest in-memory conversation/channel selection. A cold start remains on
   Bakbak when membership loads; missing membership plus established DM history
   resolves to Personal; neither history nor membership resolves to InviteGate.
2. The sidebar swaps the Personal conversation list and flat server channel
   shelf while retaining shared active-call and current-user footers. Settings
   remains an overlay. The last selected active server text channel or Personal
   DM is cached per account; voice rooms are never restored or auto-joined.
3. Layout preferences v5 store `sidebarVisible`, the sidebar's 248–340 px width,
   and `sidebarPosition` (`left` or `right`). The two-track grid mirrors its
   columns and resizer direction while keeping at least 420 px for the canvas. A
   9 px pointer target overlays the visual separator; keyboard resizing supports
   arrows, Shift+arrows, Home/End, and reset. The user-dock control, View menu,
   and `Cmd/Ctrl+B` close or restore the mounted sidebar without changing
   voice/share state. Migration reads v4, v3/v2 left-side values, and v1
   visibility, defaults them to the left, then intentionally discards all
   retired right-panel state.
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
9. The DM conversation row and conversation introduction hydrate the other
   participant's private avatar poster through the shared profile-media cache.
   Activating the introduction identity opens the existing profile surface,
   which can play their GIF avatar and cover unless reduced motion is enabled.
   The Personal member picker
   truncates long names and dismisses on outside pointer or Escape. Media
   resolves memory first, then the user-scoped IndexedDB blob, then authenticated
   Storage. Workspace metadata publishes before avatar hydration, so a slow
   image cannot hold the shell hostage.

### Profile, appearance, and modal settings

1. The renderer imports locally installed Inter Variable before mounting React.
   A validated `auto | light | dark` preference applies before
   React mounts; Auto delegates to CSS `prefers-color-scheme`, so operating-
   system changes continue to apply live. The document starts on an opaque
   fallback underlay before renderer initialization. The desktop shell then reports
   `vibrancy | mica | fallback` plus reduced-transparency state; Windows applies
   Mica and macOS exposes under-window vibrancy only when native accessibility
   state permits it. Unsupported, high-contrast, and reduced-transparency hosts
   retain the deterministic opaque fallback. Dark
   canvas/panel/strong bases use
   64/72/84% black; light bases use 60/72/84% white. Accent mixes of 6/5/3%
   unify those surfaces while keeping wallpaper bleed subordinate. Primary
   chrome uses 24 px blur and 120% saturation, never a filter on user/live
   media. The native accent listener starts before its initial query, falls
   back to neutral within 250 ms, validates byte channels, normalizes to 4.5:1
   text contrast, chooses black or white on-accent text, and refreshes on
   native color events, focus, and resolved scheme changes. Legacy
   `bakbak.appearancePreferences.*` keys are neither read nor deleted. Shared
   type, spacing, height, and radius tokens enforce the
   500/600/700 UI hierarchy, 4 px spacing rhythm, 36/40/44 px controls and rows,
   52 px composer, and restrained 10/14/16/18 px curves. Hover transitions use
   color and border changes; reduced motion disables transitions and press
   scaling.
2. Chrome theme preferences are stored per account under
   `bakbak.chromeThemes.v2:<user ID>`. Each record contains independent Personal
   and Bakbak `glass | gradient` modes, colors, brightness, 20–100%
   transparency, texture, and three bounded gradient points. New and reset
   Glass themes default to 100%. Parsing clamps
   numeric values and rejects malformed colors or points. Migration reads both
   current v2 and `bakbak.sidebarThemes.v1` records; untouched legacy defaults
   become Glass, untouched v2 Glass records at the retired 45% default become
   100%, legacy Solid becomes a single-color gradient, and genuine gradients
   keep their colors and positions within the current clamp.
   The onboarding completion flag and setup dialog are retired. The full editor
   remains available in Appearance Settings.
3. Profile edits validate a trimmed 1–50 character display name, a
   190-character plain-text description, integer 0–100 cover coordinates, and
   optional PNG/JPEG/WebP/GIF media. Avatars are limited to 5 MiB, covers to 10
   MiB, and every decoded image to 16 megapixels and 8192 px on either side.
   Separate Avatar and Cover actions open the existing attributed GIPHY search
   in GIF-only, target-aware mode.
4. The renderer decodes each upload before storage and paints a bounded static
   poster: at most 512 px on the avatar long edge or 1600 px on the cover long
   edge, encoded as WebP with PNG fallback. GIF uploads retain the original
   animation beside the poster; other animated formats are flattened.
5. Changed poster/animation objects upload to
   `<user UUID>/<generated UUID>` before one profile-row update. Any failure
   removes every newly uploaded object. Success mirrors the display name into
   Auth metadata and best-effort deletes replaced/removed objects. Choosing
   GIPHY instead writes only its bounded asset ID, clears the field's upload
   paths/legacy URL, and then removes replaced private objects; choosing an
   upload or removal clears the corresponding provider ID.
6. A memory plus user-scoped IndexedDB bucket/path cache deduplicates
   authenticated downloads and revokes object URLs on replacement, account
   change, clearing, and teardown. Workspace metadata publishes before avatar
   posters hydrate progressively. Activity and expanded member rows request
   animated avatars and cover media alongside their visible static posters, so
   GIFs play automatically and loop wherever the source GIF loops; other
   compact identity surfaces retain hover/focus loading. Static cover posters
   load lazily for visible member rows, immediately for the always-visible
   shared user dock, or on demand for an open profile card or editor. Reduced-
   motion mode never requests GIFs. If WebKit cannot decode a cached object
   URL, every shared profile-media surface removes the failed image
   immediately, evicts that account/bucket/path entry, retries authenticated
   Storage once, and otherwise keeps the neutral fallback instead of exposing
   a native broken-image icon.
   Realtime generation guards stop stale downloads from replacing newer
   profile state. GIPHY IDs persist in account/DM snapshots, but normalization
   strips all resolved provider URLs. Online clients batch-resolve static avatar
   posters, use the session-deduplicated provider adapter for attention-driven
   animation and cover loads, and fall back to initials/no cover on API or
   rendition failure.
7. Cover framing uses a fixed 3:1 preview. Pointer drag or keyboard arrows
   update integer focal coordinates; Shift moves by a larger step and Reset
   returns to 50/50.
8. Audio settings retain the persisted device selectors, soundboard volume,
   enhanced-cleanup switch, and interface-sound
   master/volume/category preferences in four spaced Voice Input, Voice Output,
   Video, and App Sounds categories. Opening settings does not request media.
   The explicit microphone test uses the same selected processing path as an
   outgoing call, plays it through the selected output, compares raw and Studio
   meters, supports a live cleanup toggle, and warns headphones users before
   monitoring. An active call is temporarily muted and deafened for the test,
   then returns to its exact previous state. Microphone join/test capture first
   requests a typed permission snapshot only from that explicit user action.
   Denied/restricted states produce platform-specific recovery copy instead of
   string-sniffing a capture exception. Audio Settings re-reads status after an
   input failure and on window focus, then offers the typed settings/restart
   actions supported by that platform: macOS Privacy & Security plus restart,
   or Windows' global microphone/desktop-app switches. Successful microphone
   permission immediately refreshes device enumeration because macOS WebKit can
   reveal named speakers only after capture permission. Microphone and output
   tests acquire only temporary resources and release them when stopped or
   unmounted. Preview buttons activate and play one modern interface-sound
   category representative through the system output.
9. Settings is a modal overlay over the current canvas. It traps focus, restores
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
4. Channel and channel-category Realtime subscribe before their catch-up
   snapshots and replay buffered events after the snapshot, so an overlapping
   create, rename, or category migration cannot be overwritten by stale data.
   Both collections reconcile by stable ID and sort by position then ID. Only
   the creating client selects a new channel; selecting a newly created voice
   channel also joins it automatically.

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
   message. The composer reads clipboard files from both the `files` and
   file-kind `items` representations used by Windows, restores a missing File
   MIME type from the item when available, deduplicates equivalent
   representations, and then applies the same four-file/type/size/decode limits
   as the file picker. A failed attempt retains the complete draft for retry.
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
   persist. A sender's staged object URL is leased across the optimistic-to-
   persisted message-ID replacement and channel navigation. The persisted
   poster loads behind that preview; only its successful image load, explicit
   optimistic cancellation, or account teardown revokes the preview, exactly
   once. Renderer-owned downloaded URLs revoke on replacement or unmount.
   Failed poster retrieval or decoding renders a retry control with a bounded
   diagnostic code rather than a broken image or raw Storage/session detail.
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
12. System channels replace that composer with a compact automation-only
    footer and render typed welcome/release cards without member avatars or
    message actions. Membership creation inserts the welcome before initializing
    the joiner's read pointers, so their own event starts read while existing
    members receive it as normal unread Realtime activity. Preview requests run
    after send/history hydration; a preview UPDATE replaces the stable-ID cache
    row without replaying unread or sound side effects.

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
   client disappears without a graceful leave. Refresh requests are serialized;
   an event received during an in-flight query queues another query and prevents
   the superseded response from being emitted.
6. One voice-occupancy selector resolves both the channel tree and member rail
   through current server membership. For the room this client has joined,
   LiveKit's current participant roster replaces heartbeat occupancy entirely;
   the retained roster remains visible through signal or transport reconnect
   and clears on terminal disconnect. Fresh heartbeat sessions remain the
   authority for every other room. Active participants override a stale
   heartbeat in another room, unknown identities are dropped, users are
   deduplicated by ID, and each room sorts by NFKC-normalized lowercase display
   name followed by stable user ID. The channel component applies the same
   comparator defensively across rerenders and category collapse.
7. Presence is a UI hint only. The actual LiveKit screen publication is
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
   cleanup is selected, a LiveKit `TrackProcessor` routes
   capture through a shared 48 kHz AudioContext and AudioWorklet. After the
   first trusted gesture, Bakbak loads that worklet without requesting a
   microphone, then reuses the context for preview and voice. The worklet
   uses a deterministic ring bridge from 128-sample render quanta to 480-sample
   RNNoise frames. A `ready` plus request-ID configuration handshake must finish
   before cleanup becomes active. Unsupported initialization or processor error
   restores the unprocessed sender, keeps built-in WebRTC cleanup, and records
   a non-fatal explicit fallback warning.
5. After LiveKit connects, the processed or fallback speech track publishes as
   `bakbak-microphone` while output preparation and the existing
   soundboard-track preparation run concurrently. Bakbak still awaits
   soundboard `ensurePublished` settlement before reporting `connected`.
   Speech selection prefers that exact name and falls back to an unnamed,
   non-soundboard microphone publication for older clients.
6. Direct channel switching unpublishes the current microphone without
   stopping it, disconnects the old room, republishes it into the new room,
   and preserves its processor plus mute/deafen state. Input-device changes
   restart the processor on the replacement source with an exact constraint,
   verify the normalized active device, and update LiveKit's active input-device
   map only after that proof. Leave, sign-out, a failed switch, and
   teardown stop every retained or pending microphone. Sign-out and application
   teardown close the shared processing context.
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
   capability-checked from `HTMLMediaElement.setSinkId`; a supported switch is
   serialized independently from input capture and updates the soundboard plus
   the renderer-owned remote-audio monitor for every current or future source.
   Those audible routes are authoritative, so a silent monitor's autoplay
   rejection or LiveKit's auxiliary device-bookkeeping failure cannot roll a
   working sink back; reconciliation and later playback recovery retry as
   needed. Unsupported runtimes keep the selector read-only and use system
   output. A genuinely missing remembered device falls back to default after
   specific devices become visible.
10. Initial connection, signal resume, full reconnect, and output changes
    reconcile every currently subscribed remote audio publication against the
    active room. The renderer reuses the publication's existing audio element,
    removes stale elements, rejects late events for removed publications, and
    responds to subscription status, stream pause/resume, media
    pause/stall/error/end, and autoplay rejection. Subscription and playback
    recovery stop after two attempts and expose an actionable warning instead
    of looping.
11. Unsubscription, participant departure, leaving, disconnecting, and
    unmounting detach remote audio and video, invalidate pending camera/join
    work, stop active local sounds, pause and detach the selected-speaker
    monitor, stop its MediaStream tracks, close its Web Audio context,
    disconnect the room, and release local tracks.
12. If direct WebRTC fails and relay succeeds, later joins prefer relay for ten
    minutes using only a non-sensitive LiveKit-host-scoped expiry. Relay-first
    failure retries direct; direct success or expiry clears the hint. A total
    failure is reported as a TURN/TLS or local network-policy problem rather
    than token/authentication failure.
13. Development diagnostics record preparation, authorization, connection,
    microphone capture/processing/publication, output routing, soundboard, and
    total timing without identifiers or tokens. The Settings voice diagnostic
    additionally keeps the most recent bounded snapshot in memory until the
    user explicitly copies it. It contains only ephemeral participant and
    publication SIDs, connection/signal/subscription/stream/playback state, and
    whitelisted inbound audio packet, byte, loss, jitter, and round-trip
    metrics. Candidate/release builds also include the public app version and
    exact source revision so affected and unaffected listeners can prove they
    ran the same candidate. It excludes names, message content, tokens, device
    labels, audio, ICE candidates, and IP addresses, and is never transmitted
    automatically.
14. `CommunicationEffectEvent` is emitted only after lifecycle truth: self join
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
   screen / Application tabs. The Tauri shell supervises native helper source
   enumeration and returns a discriminated result through the typed desktop
   adapter. Success contains bounded labels, thumbnails,
   normalized permission status, global capabilities, and per-source audio
   availability. A macOS denied/restricted result is distinct from source
   enumeration failure and offers Privacy Settings/restart only when valid.
   Windows enumeration failure explicitly states that Windows has no
   Bakbak-specific screen-capture permission and offers Retry rather than a
   fictional settings link. The confirmation exposes independent
   480p/720p/1080p and 15/30/60-fps controls, defaults to 1080p/60 on first use,
   and persists only the last successful quality under
   `bakbak.screenSharePreferences.v1`. Browser clients have no share UI and
   force every screen publication unsubscribed.
2. The renderer sends the selected bounded source ID through the desktop
   adapter. The shell re-enumerates it and forwards one correlated command to
   the supervised native sidecar; there is no Chromium loopback audio path. A
   15-fps share remains detail-first. A 30/60-fps share is marked as motion,
   preserves frame rate rather than resolution under congestion, and publishes
   a half-resolution 30-fps fallback layer instead of a static-screen 3-fps
   fallback.
3. The renderer requests
   `{ channelId, purpose: "screen_share" }`. The function
   repeats authentication, membership, and voice-channel checks, then signs a
   five-minute companion identity tied to the same room and owner.
4. The renderer sends the selected source, include-audio flag, exact quality
   tuple, and short-lived companion URL/token through narrow `start` adapter
   input. Tauri validates the calling window; the helper manager validates
   `wss`, token length, source ID, and one of the nine supported quality tuples
   before writing one correlated request to the child.
5. The helper connects the companion with subscriptions disabled, captures and
   publishes native screen video plus optional `ScreenShareAudio`. Native H.264
   publication prefers the platform hardware encoder with a safe SDK fallback.
   Its 30/60-fps profiles use frame-rate-first congestion adaptation and the
   same half-resolution 30-fps simulcast fallback; 15-fps keeps
   resolution-first detail behavior. The renderer owns UI state only. Quality
   changes call the helper's correlated `update` and never mutate Chromium
   media tracks or WebRTC senders.
6. System audio is requested only when the presenter enables it and the helper
   reports process-tree isolation. Entire-screen capture excludes the Tauri host
   root, WebView audio root where applicable, and all proven descendants;
   application capture includes only the selected process tree. macOS exposes
   isolated audio only on 14.2+, and Windows requires build 20348+ plus WebView2
   process proof. No Chromium loopback fallback is permitted. System-audio
   capability and per-source availability are independent of Screen Recording
   permission. Missing or failed isolation/audio proof leaves video live and
   reports a bounded unavailable reason instead of relabeling it as permission
   denial.
7. Explicit stop, source end, terminal companion disconnect, voice leave,
   window teardown, helper crash, timeout, and app quit disconnect the
   companion. Structured capture failures remain sanitized and never include
   the short-lived token or source content.
8. Companion participants are merged into their owner's UI state and omitted
   from ordinary participant cards. Every remote screen video/audio publication
   is immediately unsubscribed. `watchedScreenShareId` is the sole subscription
   gate: selecting an in-room LIVE circle unsubscribes the previous remote share
   first, then subscribes the selected high-quality video and source audio. The
   watched share remains subscribed when focus returns to people, where the
   same live track continues inside its LIVE circle; switching shares, target
   loss, disconnect, or leave performs the corresponding cleanup.
   The presenter's own companion video remains subscribed locally while its
   companion source audio is always forced unsubscribed.
   Deafen, selected output, and owner volume still apply to watched audio.
9. Sidebar and member-overlay LIVE remains presence information until a remote
   viewer activates its hover/focus Watch Stream action. That action stores a
   request ID, owner ID, and channel ID, joins or switches to the advertised
   voice room, and waits for the owner's authoritative LiveKit share before
   invoking the same one-share subscription gate and focusing it. Database LIVE
   alone never creates a subscription. A request with no matching share ten
   seconds after connection clears with a dismissible stream-ended notice.
   Each occupied channel shows one room-active timer based on its earliest
   current join. Occupants have no personal timers or redundant local-user
   suffix; compact avatars use a live speaking ring from the active LiveKit
   room. This is plan 0028's narrow supersession of plan 0015's
   informational-only/cross-room restriction; plan 0015's isolation,
   source-audio, explicit-subscription, and cleanup contracts remain active.
10. A focused share uses one `minmax(0, 1fr)` media stage without a metadata
    header, people filmstrip, Back control, or fullscreen mode. Shared media uses
    `object-fit: contain` against a black canvas and local presenter quality
    controls share that surface. The focused stage drops voice-view padding,
    borders, radius, and shadow; with the sidebar hidden it fills the complete
    native window. Activating the focused media returns to people
    without interrupting the watched share; target loss, disconnect, and
    teardown clear focus and perform the existing subscription cleanup.
11. Explicit stop, voice leave, source termination, terminal native-room
    disconnect, or main-window close releases capture immediately and closes the
    companion. Multiple app instances may present concurrently, but each app
    instance owns at most one share.
12. Local and remote share lifecycle changes emit typed start/stop effects after
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
   the coordinator connects the one current decoded buffer to the outbound
   track at unity gain and to the selected-speaker monitor path at the local
   soundboard volume. Starting B invalidates any pending A, fades/stops the
   current source, and fences stale download/decode completions before B may
   start. The track is muted after the active clip ends or stop-current runs so
   idle playback cannot suppress system audio. The publication, decode cache,
   shared context, and selected-output graph remain ready; a failed replacement
   returns to idle without rebuilding the voice session.
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
8. Activity state contains at most one local or remote item. Participant cards
   show the current emoji, Playing status, and speaking treatment. Camera-off
   tiles replace the avatar with that emoji; camera-on tiles center it over
   video. A v2 replacement sends ordered stop-current then play metadata, but
   the named LiveKit track's mute/publication state is the source of truth for
   audible state. Local stop-current invalidates pending asset starts before
   they can play. Disconnect, leave, and track cleanup clear activity too.
9. Remote named tracks use `soundboard volume × participant volume`; watched
   share audio uses participant volume once, and normal microphone speech keeps
   only participant volume. The listener-local gain accepts 0–200%, then all
   remote sources share the final bounded limiter and selected-output monitor.
   Deafen hard-mutes the final remote mix, zeros every current and future remote
   gain stage and LiveKit track volume, and mutes the sender's local monitor
   branch without muting outbound soundboard audio.

Unknown message types, stale duplicates, and unknown sound IDs are ignored
safely. Built-in suppression plus RNNoise target keyboard and steady background
noise. Echo cancellation applies only when the macOS full-volume option is off;
RNNoise is not speaker separation and cannot guarantee acoustic isolation on
every device. The laptop-speaker two-client check therefore remains required.

### External-call soundboard

1. The setup wizard enumerates native input and output devices using CoreAudio
   UIDs on macOS and WASAPI endpoint IDs on Windows. It requires a physical
   microphone, the render side of BlackHole 2ch or VB-CABLE, the paired capture
   endpoint the user selects in the call app, and headphones. It rejects the
   cable as the physical microphone or monitor and rejects duplicate/looping
   routes. Bakbak never bundles or installs the virtual cable.
2. Preflight meters the selected input, plays a bounded effect test through the
   selected monitor/cable route, and supports a short in-memory local test
   recording. Recording bytes are discarded when the test ends or the wizard
   closes; they are never persisted, uploaded, or logged.
3. Start requires explicit confirmation if Bakbak voice is connected. Joining a
   Bakbak voice channel while the native external session is starting/live also
   requires confirmation and stops the external session first. There is no
   silent voice disconnect in either direction.
4. The Rust engine converts input to a bounded 48 kHz mono bus. Physical
   microphone gain defaults to 1.0 and soundboard gain to 0.7. One latest-wins
   clip mixes with the microphone through a soft limiter and bounded queues.
   Headphone monitoring receives sound effects only; it never monitors the live
   microphone. Automatic ducking and RNNoise are intentionally absent from this
   first native mode, and the UI warns that aggressive call-app suppression can
   remove effects.
5. The compact always-on-top overlay shows LIVE state, microphone level/mute,
   favorites, recents, search, current sound/stop, and stop-session. Upload and
   edit stay in the main window. Closing either window may hide it while the
   native session continues, according to the explained close lifecycle.
6. Logout, permission loss, device/stream loss, operating-system sleep,
   explicit stop, tray stop, or app quit silence output and drop all streams.
   Sleep never auto-resumes. State and level events are bounded metadata; raw
   microphone samples never cross into logs, storage, or network calls.

### Local preferences

The renderer validates and stores only `{ inputDeviceId, outputDeviceId,
cameraDeviceId, soundboardVolume, enhancedNoiseSuppression,
macosKeepOtherAudioFullVolume }` under the versioned local-storage key
`bakbak.devicePreferences.v4`. Valid v1/v2 device, volume, and cleanup values
migrate; the old v2 `voiceEffect` is ignored and the macOS full-volume mode
defaults on. Because v3 cannot distinguish its automatically saved false from
an intentional choice, every v3 false migrates to true once; subsequent v4
choices persist normally. These preferences never sync to Supabase. If a
remembered device is absent, the selector returns to the runtime's default
device.
Interface cues deliberately bypass the selected call output.
Soundboard section collapse state is stored independently per server under
`bakbak.soundboardSections.v1:<server ID>` and never syncs; favorite rows sync
through Supabase instead.
Activity disclosure state is stored per account and server under
`bakbak.activityPreviewCollapsed.v1:<user ID>:<server ID>`, defaults expanded,
and never syncs.
Legacy channel-category collapse state may remain under
`bakbak.channelCategories.v1:<server ID>`, but the sole Channels shelf is flat
and non-collapsible, so the redesigned shell neither reads nor writes it.
Appearance stores only `auto`, `light`, or `dark` under
`bakbak.appearancePreference.v1`. Invalid values restore Auto. Old
`bakbak.appearancePreferences.*` entries remain inert rather than receiving a
cleanup migration. The native system-accent bridge remains dormant for desktop
compatibility; no accent preference or system-accent summary is exposed.
Per-account chrome themes use `bakbak.chromeThemes.v2:<user ID>` and never
leave the device; Glass defaults restore independently for Personal and Bakbak
when a record is absent or malformed. Migration reads
`bakbak.sidebarThemes.v1:<user ID>`, promotes untouched legacy defaults to
Glass, converts genuinely customized Solid records to single-color translucent
gradients, and preserves customized gradient colors and positions. Current v2
records receive the same normalization and 20–100% transparency clamp;
untouched Glass records at the former 45% default become the new 100% default.
It stores `{ enabled, volume, categories }` under
`bakbak.interfaceSoundPreferences.v1`; the default is enabled at 55% with
Messages, Voice, Screen share, and Status enabled. Interface sounds lazily
preload after the first pointer/keyboard interaction, use the Web Audio system
destination, never queue blocked pre-gesture events, cap concurrency at three,
throttle messages to 350 ms, batch remote roster churn for 250 ms, and cool
failure alerts for two seconds. Sidebar visibility, width, and left/right
position use `bakbak.layoutPreferences.v5`; v4 migrates visibility and width,
v3/v2 migrate only their left-side values, v1 migrates visibility with the
default width, and all legacy values default to the left while retired
right-panel state is dropped. Malformed values restore the 280 px visible-left
default, and widths are clamped to 248–340 px while leaving at least 420 px for
canvas.
All of these preferences are device-local and never part of the profile or
Supabase schema.

Inter Variable is installed through the pinned `@fontsource-variable/inter`
package and bundled by Vite, with no runtime CDN dependency. The legacy Roundo
source and license remain in the repository for provenance but are not loaded
by the renderer. Every WAV under `public/interface-sounds` is original
Bakbak project output from the checked-in deterministic sine-pluck and
rounded-envelope generator. The modern pack contains no recordings, third-party
samples, square/triangle oscillators, or seeded grit. The microphone
worklet bundles `@jitsi/rnnoise-wasm` `0.2.1` and its RNNoise 0.2 synchronous
model; Jitsi's Apache/MIT notice and Xiph.Org's BSD 3-Clause notice ship under
`public/vendor/rnnoise`.

### Desktop release and update

1. Pull requests run formatting, lint, strict renderer/adapter/fallback
   TypeScript, renderer and Node contract tests, version synchronization, Deno
   lint/check/tests, pgTAP when Supabase is available, format/clippy/tests for
   all three Rust manifests, a production build, and a compiled secret scan. A
   native packaging matrix builds the Apple Silicon DMG and Windows x64 NSIS so
   a shell cannot merge merely because its source looks optimistic.
2. A pull request receives the `stabilization:candidate` label only when its
   head is ready for installed acceptance. The label-triggered workflow checks
   out and verifies that exact 40-character revision, runs the integrated Tauri
   gate while compile-checking the Electron fallback, then builds an Apple
   Silicon DMG and Windows x64 NSIS
   installer with the live public renderer configuration. A manual dispatch can
   build another exact revision after the workflow exists on `main`.
3. Candidate workflows never publish a release. They scan the compiled bundles
   and upload private seven-day artifacts named with the same short revision.
   Each contains one installer plus bounded provenance containing the app
   version, full revision, platform, and workflow run. An opt-in manual dispatch
   also runs a Windows-only signed-update rehearsal job. From that same exact
   source it builds the tracked base version and a version-metadata-only derived
   next patch, with the helper and each matching renderer prepared before the
   two narrow signing steps. Both renamed NSIS payloads and signatures are
   verified against the committed updater public key. The private artifact
   includes both pairs, a signed local `latest.json`, SHA-256 provenance, and
   instructions; it never creates a GitHub Release.
4. A merge to `main` resolves the next stable SemVer from the newest `v*` tag
   only after the non-secret `TAURI_2_ACCEPTANCE_MATRIX_SHA` repository variable
   equals the exact candidate commit that passed the complete installed
   shell/product, 30-minute capture, 30-minute external-audio, and
   migration/update gates. Until then, only a manual dispatch that supplies the
   same exact SHA and explicit full-matrix confirmation may continue. A newer
   commit invalidates the attestation automatically. Patch is the
   default; `release:minor` and `release:major` labels override it, while
   `release:skip` suppresses documentation-only releases. The resolver
   regression fixes the `v0.16.0 + release:major` boundary at `v1.0.0`. Before
   candidate acceptance, a normal source change must already set
   `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the
   Tauri lockfile to that exact resolved version. A version bump therefore
   requires a fresh candidate and installed acceptance; release automation
   never builds mutated source after the accepted SHA gate.
5. The release checkout verifies the four tracked version values are
   synchronized and exactly match the calculated release version, then builds
   them without modification. Tauri produces one Apple Silicon DMG and one
   Windows x64 NSIS installer. macOS is deliberately ad-hoc/manual-only: it
   first builds and verifies the ad-hoc signed application and packaged helper,
   then creates and checksum-verifies the DMG in a separate bundle step because
   the DMG bundler removes its staging application. It emits no updater archive,
   signature, ZIP, or updater manifest. Intel macOS builds ended at v0.4.0.
6. The Windows job requires the protected Tauri updater private key and
   password and produces a signed NSIS updater payload. A repository-owned
   Node verifier mirrors Tauri's outer-base64 Minisign verification with
   Ed25519 and BLAKE2b-512, checks both the artifact and trusted-comment
   signatures against the public key in `src-tauri/tauri.conf.json`, and runs
   on the exact renamed installer before private artifact upload and again
   before manifest generation. Missing, malformed, stale, wrong-key, or invalid
   signatures fail the job. The initial Electron-to-Tauri `2.0.0` replacement
   remains manual; later Windows updates may use this signed channel only after
   the installed `2.0.0 → 2.0.1` rehearsal passes.
7. The workflow holds the GitHub Release as a draft until it verifies exactly
   one Apple Silicon DMG, one Windows x64 NSIS setup executable, its mandatory
   signature, the version-matched Windows-only Tauri manifest, no Intel macOS
   artifact, and no macOS automatic-updater metadata.
8. Release automation never writes tracked source versions or opens a
   post-publication synchronization PR. A pre-existing release may be reused
   only while it is still a draft whose `targetCommitish` is the exact accepted
   `github.sha`; the same draft and target are rechecked immediately before
   publication. This prevents old drafts or differently versioned source from
   borrowing a newer candidate's acceptance evidence.
9. A separate announcement job always reads the verified published release
   from GitHub's API and posts it to the protected System endpoint with three
   retries. Failures do not unpublish the desktop release, and the release ID
   makes reruns idempotent. A manual workflow independently streams every
   stable release oldest-first in historical mode and advances current
   members' release read baseline.
10. The desktop adapter reports updater delivery as `automatic` on Windows and
    `manual` on macOS. Windows checks the signed Tauri `latest.json`; macOS
    presents a manual DMG/release-page notice and cannot invoke download or
    install. One renderer-owned provider is shared by the global notice and
    Settings. Requests are bounded, sanitized, and single-flight.
11. Settings includes an Updates section with installed/available versions,
    persisted last-successful-check time, manual retry, signed download
    progress, install-and-restart, a GitHub Releases fallback, and privacy-safe
    copyable diagnostics containing only public build/update/connectivity
    state. Raw request errors, account data, messages, credentials, and endpoint
    responses are never copied or persisted.
12. An available update is still shown globally. Windows installation/restart
    requires explicit user action so an active conversation is not interrupted;
    macOS always opens the manual release path. Failed checks or downloads
    retain retry and manual-release recovery.

Git tags and published Releases are the release source of truth. The tracked
version and exact accepted candidate SHA are the build provenance; release jobs
only verify and consume them. Preparing a later release requires a normal
version-bump change followed by a new candidate and acceptance run.

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

### `POST /functions/v1/link-preview`

- **Authentication:** platform JWT gate plus verified Supabase claims
- **Request:** `{ "scope": "channel|direct", "messageId": "<uuid>" }`
- **Authorization:** the caller's RLS client must read the stored channel
  message or DM; the function ignores caller-provided URL/content
- **Network policy:** first stored URL only; public HTTPS DNS results, standard
  port, no credentials/IP/local host, every redirect revalidated, at most three
  redirects, three seconds, 512 KiB, and HTML/XHTML only
- **Result:** one sanitized text page card or YouTube descriptor; the
  service-role client stores the result and attempt time, with null attempts
  retryable after 24 hours

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
  ordinary `chat` purpose, trimmed 1–80 character name, and case-insensitive
  uniqueness
- **Behavior:** changes only the name; ID, server, kind, position, history, and
  active voice identity remain stable

### `POST /rest/v1/rpc/send_message`

- **Authentication:** valid Supabase user session
- **Request:** `{ "p_channel_id": "<channel-uuid>", "p_content": [segments] }`
- **Success:** the inserted message row with generated plain-text body and
  structured content
- **Validation:** matching ordinary `chat` text/voice channel membership,
  1–100 exact text or mention segments, at most 4,000 fallback characters, at
  most 25 mentions, and every mentioned UUID belonging to the channel's server
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
| `VITE_BUILD_REVISION`    | Exact public source commit embedded by candidate/release automation            | No      |

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

Candidate and release workflows read the service-facing renderer values from
GitHub Actions repository variables, force `VITE_DATA_MODE=live`, and inject
the exact public `VITE_BUILD_REVISION` selected for that build. Windows releases
read `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from
GitHub Actions secrets to sign every updater payload. Dependency installation,
native controller validation, helper staging, and the renderer build finish
before either secret is injected. Only the Windows Tauri packaging step receives
them; its final `tauri.prebuilt.conf.json` override disables
`beforeBuildCommand`, so no renderer or package lifecycle command runs inside
the signing boundary. The macOS matrix leg receives neither updater-signing
secret. The optional private update-rehearsal job applies the same boundary to
two separate Windows packaging steps after preparing the base and derived-patch
renderers. Its explicit `tauri.update-rehearsal.conf.json` is the only config
that enables insecure updater transport, and it pins the endpoint to
`http://127.0.0.1:41793/latest.json`; release and ordinary candidate configs do
not inherit it. The key/password are never Vite variables, renderer inputs,
release assets, or committed files. Missing signatures fail Windows updater packaging.
Operating-system code-signing identities remain required before public
distribution. A future signed
production macOS path additionally reads `MAC_CSC_LINK`,
`MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER`, and `APPLE_TEAM_ID` only from GitHub Actions secrets. These
hold the Developer ID certificate/password, notarization credentials, and
expected signing team; none enter Vite, the renderer, or release assets. All
six absent selects the temporary manual-install-only ad-hoc path; any partial
set fails closed.

## Validation strategy

Required repository-level checks are:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm version:check
pnpm build
pnpm security:scan
deno task --config supabase/deno.json check
deno task --config supabase/deno.json test
cargo fmt --check --manifest-path native/screen-share-helper/Cargo.toml
cargo clippy --locked --manifest-path native/screen-share-helper/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path native/screen-share-helper/Cargo.toml
cargo fmt --check --manifest-path native/external-audio/Cargo.toml
cargo clippy --locked --manifest-path native/external-audio/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path native/external-audio/Cargo.toml
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Run `pnpm tauri:build` when validating platform integration or a distributable
bundle; compile the Electron shell separately while it remains the fallback.
When local Supabase is available, run `supabase start --exclude vector` and
`supabase test db`. Database phases add Supabase migration/RLS and
Storage-policy tests;
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
System/link work additionally runs exact-layout and automation-only pgTAP,
release-secret/idempotency and preview SSRF/redirect/timeout/size Deno tests,
renderer URL/card/Realtime-side-effect checks, deterministic deafen-WAV tests,
and multi-zoom dark/light connector alignment observation.
Screen-sharing work additionally runs the Deno token suite, focused renderer
and desktop-adapter boundary tests, native macOS and Windows packages, compiled
secret scans, and the bidirectional installed-client matrix in plan 0003. Pull
requests always run the Ubuntu validation job and the native packaging matrix
for both supported targets.
Plan 0036 additionally covers layout/theme migrations, overlay/sidebar
accessibility and shortcut behavior, focused-share geometry, window appearance,
native menu/window-control source contracts, permission snapshots, structured source
failures, and recovery actions. Automated checks do not replace installed
macOS/Windows observation, and an ad-hoc macOS build cannot prove TCC grant
continuity across future signatures.

The stabilization-candidate workflow runs only when its exact label is added
to a pull request or when an operator manually supplies a full commit SHA. It
checks out and verifies that revision, then builds both supported installers
without updater signing or release publication. The uploaded installer names
and manifests carry one shared revision; any later source change invalidates
both artifacts and requires a fresh run.

A manual dispatch may additionally request the private Windows update-rehearsal
kit. Its base and derived next-patch NSIS installers come from that one revision,
are signed and verified against the committed key, and carry bounded workflow
provenance and SHA-256 digests. The extracted folder is served only on fixed
loopback port `41793`; the base app's rehearsal-only updater config reads the
local manifest and downloads the signed next installer from that same origin.
Creating this artifact proves buildability and provenance, not the installed
update. The operator must still record the real base install, update/relaunch,
observed versions, and full platform matrix in `docs/progress.md`.

GitHub release validation additionally requires successful Apple Silicon macOS
and Windows x64 packages, one ARM64 DMG, one NSIS executable and mandatory
updater signature, no Intel macOS artifact, no macOS updater metadata, and a
complete version-matched Windows-only `latest.json`. A release remains a draft
when any platform or manifest check fails. Before `2.0.0`, installed Electron
clients must complete the one-time manual replacement and re-login on real
Apple Silicon macOS and Windows x64 machines. Windows must then prove a signed
`2.0.0 → 2.0.1` update; macOS must prove manual DMG replacement.

Security validation must scan built renderer and desktop artifacts for forbidden
service-role or LiveKit secret values. Record commands, results, and skipped
checks in `docs/progress.md`; this document describes the strategy, not a claim
that it has passed.

## Current limitations and deferred work

- Plan 0038's Tauri shell, typed adapter, supervised sidecar, latest-wins
  soundboard, external-call mixer/wizard/overlay, runtime reset, and platform
  updater split are implemented in source. The installed macOS/Windows product
  matrix, both 30-minute three-client screen-share sessions, both 30-minute
  Discord/Meet external-audio sessions, installed migration/update paths, and
  startup/bundle/installer/memory baselines remain open. Electron therefore
  remains in the repository and `2.0.0` is not release-cleared.
- Plan 0036's native-overlay/full-bleed shell, layout v5 migration, compact
  main-canvas drag strip, user-dock sidebar toggle, left/right placement, macOS traffic-light
  ownership, rounded user dock, permanently transparent sidebar slot,
  chrome-theme v2 Glass/gradient normalization, structured source failures, and typed
  microphone recovery are implemented. Installed macOS/Windows window-control,
  drag, material,
  reduced-transparency, media-permission, and active-call continuity acceptance
  remain required. The ad-hoc macOS signature cannot guarantee TCC continuity
  across changing builds; Developer ID signing/notarization remains deferred.
- Plan 0034's Inter typography, active-only flat room shelf, online preview,
  member overlay, retired release automation, hosted archival migration, and
  hosted `system-events` removal remain complete inside plan 0036's replacement
  shell. Two-client presence/Welcome/admin/Realtime/active-call acceptance
  remains required.
- Plan 0027's protected link previews and deafen audio remain active. Plan 0034
  retires its release function/workflows and archives its System hierarchy.
  Hosted Supabase now runs the active-only plan 0034 channel schema.
- Plan 0028's loading, scroll anchoring, user actions, local participant mute,
  and requested-owner stream handoff are implemented and covered by focused
  renderer/release regressions. Direct light/dark/reduced-motion observation
  and the installed macOS/Windows three-client watch matrix remain required
  before release acceptance.
- Plan 0034 supersedes plan 0016's active typography and plan 0026's visible
  system-accent treatment with bundled Inter Variable and distinct Bakbak and
  Personal customization. Plan 0036 makes Glass the untouched default while
  retaining translucent gradient customization and normalizing legacy Solid
  choices. Auto/Light/Dark remains the
  global canvas choice. Installed macOS/Windows glyph, clipping, native
  material, fallback, and offline-font observation remain required.
- Plan 0006's centered settings modal, sidebar call controls, and simplified
  voice canvas remain active inside plan 0036's replacement two-track shell.
  The canonical browser-plus-native two-account call still requires human
  audio, camera, screen-share, soundboard, quality, reconnect, and
  dual-control-surface observation before distribution.
- Plan 0007's prepared-room lifecycle, claims validation, microphone reuse,
  loader, participant sizing, and sound emoji treatment
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
- The host-neutral native helper and Tauri sidecar supervision are implemented,
  while the Electron supervisor remains fallback-only. Installed macOS/Windows
  capture, packaged helper signing, process-tree
  isolation, application audio, protected content, teardown, and three-client
  no-self/no-duplicate-audio behavior still require plan 0038's acceptance
  matrix before native audio can ship. Failed isolation proof remains
  video-only.
- The current production renderer is roughly 406 kB compressed; LiveKit and
  Supabase can be lazy-loaded in a later performance pass if startup profiling
  shows a meaningful benefit.
- Local and temporary unenrolled macOS packages use an ad-hoc hardened-runtime
  signature and are not a TCC-continuity proof. Temporary releases publish the
  DMG for manual installation only and deliberately omit macOS updater
  metadata. The first production Developer ID release replaces the old ad-hoc
  identity, so existing users can require one final manual DMG replacement and
  microphone/Screen Recording grant. The first signed installed update and
  subsequent signed-to-signed update still require real-device validation.
- The Windows release job cryptographically signs Tauri updater payloads, but
  the NSIS executable remains without an operating-system code-signing identity;
  SmartScreen warnings are expected until one is configured.
- GitHub Actions now defines PR, candidate, and release Tauri packaging for
  Apple Silicon macOS and Windows x64. The workflows and manifest contracts are
  covered by source tests, but the native matrix still needs hosted and
  installed runs. The first release must rehearse `Electron -> Tauri 2.0.0`,
  then the platform-specific `2.0.1` path; a package compiling is not an
  installed replacement test, however confidently it wears an installer icon.
  v0.4.0 remains the final Intel release.
- Tauri generation 2 deliberately clears old local WebView state and never
  migrates authentication tokens. Existing users sign in once after the shell
  transition; cloud data remains authoritative and unchanged.
- Browser/Linux screen sharing, recording, camera effects, custom emoji
  artwork, additional roles, global push-to-talk, notifications, Linux
  distribution, and operating-system signing/notarization remain outside the
  approved phases.
- Protected or DRM-controlled sources may be black or silent; Bakbak does not
  bypass operating-system capture policy.
