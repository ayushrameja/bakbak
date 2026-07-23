# 0001 — Bakbak desktop v1

- **Status:** Active
- **Approved:** 2026-07-11
- **Target users:** One private group of 5–10 friends
- **Primary platform:** Apple Silicon macOS and Windows x64 desktop releases;
  Linux after friend testing
- **First usable release:** Voice, persistent text chat, and a private hosted
  synchronized soundboard

## Summary

Build Bakbak as a private desktop app for 5–10 friends using **pnpm,
TypeScript, Tauri 2, React, and Vite**. The collaborative chat remains the
product and technical guide, while the repository keeps a durable record of
plans, decisions, completed work, and verification results so future work
starts with context instead of archaeological guessing.

## Project memory and agent rules

- Keep `AGENTS.md` at the repository root as the working contract for every
  future coding task. It records the current architecture and technology
  choices, security rules, required handoff checks, and documentation duties.
- Store approved plans as numbered files in `docs/plans`, beginning with this
  file.
- Maintain `docs/progress.md` as the one mandatory, append-only work log. Every
  entry records the date, completed work, key decisions, validation performed,
  known limitations, and next phase.
- Maintain `docs/architecture.md` as the current source of truth for folder
  structure, services, data flow, environment-variable names, and backend
  endpoints.
- Every implementation task must append to `docs/progress.md` before handoff.
  Update the architecture document and this plan when the task changes their
  source of truth. There is no “I’ll remember it” strategy.

## Accepted architecture and structure

- Use one pnpm application with strict TypeScript.
- Use Tauri 2 as the desktop shell and React + Vite as the UI layer.
- Organize frontend code by feature under
  `src/features/{auth,server,channels,chat,voice,soundboard,settings}`.
- Place shared UI in `src/components`, service clients in `src/lib`, and the
  application shell/providers in `src/app`.
- Keep native configuration and Rust code isolated in `src-tauri`.
- Use one neutral glass interface with device-local Auto, Light, and Dark
  choices; Auto follows the operating system. Keep scoped semantic
  status/control colors. A
  48 px app-owned titlebar places the
  Personal/Bakbak switch at the left and `OG Nahan Gang` at the true center;
  independently optional channel and member panels occupy an edge-to-edge
  five-track shell around a flexible conversation canvas, centered settings
  modal, sidebar call block, and auto-hiding floating voice dock. The renderer
  uses the locally bundled Roundo family at comfortable 500–700 product
  weights. A separate multi-server rail remains deferred until multi-server
  navigation. Plan 0020 adds one bounded Bakbak motion identity exception: its
  generated native artwork, animated renderer mark, theme-responsive
  server-header texture, and single lime particle accent remain isolated while
  ordinary chrome stays neutral.
- Commit `.env.example` only. Use ignored `.env` files locally and
  platform-managed secrets for backend functions.

## Defaults

- One private server with multiple text and voice rooms.
- Email/password authentication plus a single-use invite code.
- One seeded admin; all invited users become members.
- Apple Silicon macOS and Windows x64 installers; Linux afterward. Bakbak
  v0.4.0 remains the final Intel macOS release.
- The first usable release includes voice, text, and a private hosted
  soundboard whose audio files stay outside the desktop bundle.

## Phased implementation

Completion checkboxes describe verified outcomes, not merely created files.
Each phase also requires the documentation and checks listed later in this
plan.

### Phase 1 — Foundation: no secrets

- [x] Create the official pnpm + TypeScript + Tauri 2 + React + Vite scaffold.
- [x] Replace generated product metadata and starter content with Bakbak.
- [x] Add the feature-based folder structure and service boundaries.
- [x] Add mock data for one server with text and voice rooms.
- [x] Add local interaction states without a backend or committed secrets.
- [x] Build the dark desktop foundation: server rail, channel sidebar, main
      content area, and persistent voice controls.
- [x] Add linting, formatting, typechecking, and unit-test commands.
- [x] Add meaningful foundation tests and make all required checks pass.
- [x] Commit `.env.example` with placeholders and confirm local env files are
      ignored.
- [x] Record the approved plan and initial architecture/project-memory rules.
- [x] Record final Phase 1 validation and mark the phase complete.

### Phase 2 — Accounts and private access

- [x] Connect Supabase email/password authentication.
- [x] Create profiles, servers, memberships, channels, messages, and
      single-use `invite_codes`.
- [x] Implement atomic single-use invite redemption.
- [x] Provide the secure first-admin bootstrap and initial invite-code workflow
      with operator-run SQL; defer an admin UI.
- [x] Apply Row Level Security so only members can access their rooms and
      messages.
- [x] Unit-test invite validation and permissions.
- [x] Test Supabase policies as an admin, member, and non-member.
- [x] Update architecture, plan status, and the append-only progress log.

### Phase 3 — Voice rooms

- [x] Add a protected Supabase `livekit-token` Edge Function.
- [x] Validate the signed-in member and requested voice channel before token
      issuance.
- [x] Return a short-lived room token without exposing LiveKit API secrets.
- [x] Add join/leave and microphone selection.
- [x] Add mute, deafen, participant list, and speaking state.
- [x] Add per-user volume, reconnect, and actionable error states.
- [x] Unit-test LiveKit token request handling.
- [x] Confirm no compiled desktop bundle contains a LiveKit API secret or
      Supabase service-role key.
- [x] Update architecture, plan status, and the append-only progress log.

### Phase 4 — First friend-test build

- [x] Add persistent text chat with realtime updates.
- [x] Add a private hosted sound pack and typed member-visible catalog.
- [x] Send versioned LiveKit activity messages and a dedicated named audio track
      when a soundboard action occurs.
- [x] Play hosted clips once through the outbound track and local monitor path,
      with overlapping triggers, stop-all, deterministic final-silence cleanup,
      and listener volume controls.
- [x] Unit-test catalog caching, sound dispatch, audio routing, activity state,
      and UI behavior.
- [ ] Manually validate login and invite redemption on macOS.
- [x] Manually validate persistent two-client text chat.
- [ ] Manually validate two-person voice, mute/deafen, device changes, and
      reconnect behavior.
- [ ] Manually validate synchronized soundboard playback.
- [x] Update architecture, plan status, and the append-only progress log for
      plan 0010.

The first friend-test build explicitly excluded screen sharing, recording,
camera effects, global push-to-talk, and advanced roles. Its operator-only
sound-pack boundary is superseded by
`0011-soundboard-categories-favorites-and-uploads.md`: members can upload
locally normalized clips into the server-managed Bakbak category, manage their
own metadata/audio, and sync private favorites. Members still cannot create,
rename, reorder, or choose categories. Opt-in webcam video and local device
preferences were added by the approved follow-up plan
`0002-voice-video-and-presence.md`.
Desktop screen sharing is now an approved Phase 5 follow-up under
`0003-screen-sharing.md`.
The Warm Adda redesign, settings/profile work, admin channel management, and
Apple-Silicon-only release boundary are approved under
`0004-warm-adda-ui-settings-channels-arm64.md`.
Voice-channel chat, stable-ID mentions, account-synced unread state, the
full-app settings overlay, and local accent themes are approved under
`0005-voice-chat-mentions-settings-accents.md`.
The optional three-panel shell, Flat surfaces, centered settings modal,
voice-chat UI removal, floating call controls, and simplified voice canvas are
approved under `0006-discord-shaped-bakbak-hearted-ui.md`. Plan 0006 supersedes
only the conflicting UI decisions in plans 0004 and 0005; their backend and
compatibility work remains in force.
Prepared voice joins, verified-claims token authorization, microphone reuse,
compact participant sizing, animated sound activity, and the five-sound safety
limit are approved under
`0007-voice-join-acceleration-and-soundboard-polish.md`.
The Settings focus repair, animated GIF avatar/cover pipeline, plain-text
descriptions, cover focal points, and anchored private profile cards are
approved under `0008-rich-animated-profiles.md`.
The fixed Signal Red visual preset, edge-safe broadcast effects, original
generated interface sound pack, device-local sound controls, and typed
communication event semantics are approved under
`0009-signal-red-theme-and-interface-audio.md`.
Cross-platform native video capture, 1080p/60 presenter controls, paused-source
handling, gallery/focus/fullscreen call media, and soundboard ownership are
approved under `0010-cross-platform-screen-share-and-focus.md`. Plan 0010
supersedes plan 0003's 1080p/15 ceiling and plan 0006's always-featured share
layout while retaining their security and least-privilege companion boundary.
Collapsible System/Bakbak sections, account favorites, member-owned five-second
uploads, the trusted management function, and responsive dialog sizing are
approved under `0011-soundboard-categories-favorites-and-uploads.md`.
The exact seven-category, 18-text-room, and six-voice-room Unlucky Boys layout,
with no Discord message import or channel-level permission mapping, is approved
under `0012-unlucky-boys-channel-layout.md`.
The Signature premium appearance, shared destination shell, Personal
one-to-one DMs, resizable side panels, server-wide LIVE state, and explicit
opt-in remote stream subscriptions are approved under
`0014-bakbak-signature-shell-personal-dms-live-watching.md`.
Per-source native audio isolation, Bakbak process-tree rejection, bounded
Discord-like call tiles, reversible focus, informational LIVE state, and
native-state-synchronized fullscreen are approved under
`0015-screen-share-reliability-and-call-layout.md`. Plan 0015 supersedes plan
0014's sidebar Watch and pending cross-room watch flow while retaining explicit
in-room subscription consent.
The single neutral monochrome appearance and locally bundled Roundo typeface
are approved under
`0016-flat-monochrome-roundo.md`. Plan 0016 supersedes the visual theme and
typography portions of plans 0005, 0006, 0009, and 0014 while preserving their
non-visual behavior. A 2026-07-22 user-directed follow-up restores only
device-local Auto/Light/Dark scheme selection and removes the typography
summary; accents, surface variants, and font controls remain excluded.
The app-owned cross-platform titlebar, Personal/Bakbak segmented switch,
rail-free shell, and comfortable Roundo density are approved under
`0017-space-efficient-titlebar-and-comfortable-roundo.md`. Plan 0017 supersedes
plan 0014's fixed destination rail and plan 0016's dense 9–12 px product scale
while preserving its local font, monochrome palette, and system light/dark
behavior.
System-adaptive native glass, the edge-to-edge five-track panel shell, fixed
center title, bounded startup/space/panel motion, and auto-hiding scrollbars are
approved under `0018-native-glass-edge-to-edge-motion.md`. Plan 0018 supersedes
plan 0016's flat/opaque surfaces and plan 0017's centered switch, rounded panel,
outer-padding, and gutter decisions while preserving their typography,
platform-control, persistence, and minimum-canvas contracts.
Discord-inspired semantic controls, a shared Personal/server user footer,
presence-aware In Voice/Online/Offline member grouping, and lazy static member
cover accents are approved under
`0019-discord-inspired-controls-and-member-rail.md`. Plan 0019 supersedes only
plans 0016/0018's fully monochrome semantic-state rule while retaining their
neutral glass, system light/dark, typography, native material, and layout
contracts.
The minimal Bakbak motion icon, animated renderer identity surfaces,
theme-responsive textured server header, and removal of the old `Friends-only
adda` subtitle are approved under `0020-bakbak-orbit-branding.md`. Plan 0020
supersedes only the product-logo grayscale rule retained by plans 0016/0019;
the neutral shell and scoped semantic-control rules remain in force.

### Phase 5 — Post-v1 improvements

- [ ] Complete desktop screen sharing with matched system audio on macOS and
      Windows under plans `0003-screen-sharing.md` and
      `0010-cross-platform-screen-share-and-focus.md`; plan 0015's installed
      isolation matrix remains the release gate.
- [ ] Add invite management UI.
- [ ] Add desktop notifications and tray controls.
- [x] Add locally persisted microphone, speaker, and camera preferences.
- [x] Add System, Light, and Dark appearance preferences applied before render.
- [x] Add Profile, Audio & Video, and Appearance settings while
      preserving per-channel chat drafts and active voice state.
- [x] Organize Audio & Video into spaced Voice Input, Voice Output, Video, and
      App Sounds categories with audible processed-mic monitoring, complete
      post-permission device refresh, and selected-speaker routing.
- [x] Add a centered, focus-trapped settings modal with active-call controls and
      move confirmed logout into its navigation.
- [x] Add Coral, Purple, Red, and Yellow device-local accents with 25–100%
      intensity and pre-render application.
- [x] Preserve the deployed voice-message/read-state backend for older clients
      while filtering upgraded-client chat, activity, and subscriptions to text
      channels.
- [x] Add structured individual mentions backed by stable profile IDs.
- [x] Deploy the plan 0005 migration to hosted Supabase.
- [ ] Complete the plan 0005 browser-plus-native two-account acceptance run.
- [x] Add independently persisted channel/member panels, a sidebar call block,
      an auto-hiding floating voice dock, and a dock-anchored soundboard drawer.
- [x] Keep the soundboard drawer compact and internally scrolling rather than
      allowing it to consume the center canvas.
- [x] Add native Cmd/Ctrl `+`, `-`, and `0` interface zoom shortcuts.
- [x] Add Warm/Flat surface styles and apply them before React mounts.
- [x] Auto-join selected voice channels, remove the pre-join/initial connection
      surface, and retain the simplified participant/share layout under plan 0006.
- [x] Add hover/focus voice preparation, concurrent microphone acquisition,
      direct-switch microphone reuse, relay preference, and accessible join
      stages while preserving the soundboard-publication connection gate under
      plan 0007.
- [x] Add occupancy-aware participant tiles, active-sound emoji treatment, a
      sender-enforced five-sound limit, and prominent soundboard/dock stop
      controls under plan 0007.
- [x] Deploy the plan 0007 voice-context migration and token function with the
      JWT gate preserved.
- [ ] Measure hosted warm/cold joins and complete plan 0007's authenticated
      member/non-member probes plus browser-native two-account acceptance run.
- [x] Add private profile-avatar and admin channel-management code plus focused
      frontend/database tests under plan 0004.
- [x] Deploy the plan 0004 avatar/channel migration to hosted Supabase.
- [ ] Complete the plan 0004 browser-plus-native two-client acceptance run.
- [x] Add rich global profiles with GIF avatar/cover pairs, descriptions,
      cover focal positioning, and an accessible anchored profile card under
      plan 0008.
- [x] Deploy the plan 0008 rich-profile migration to hosted Supabase.
- [ ] Complete plan 0008's local pgTAP and live two-account profile/media
      acceptance matrix.
- [x] Add the Bakbak-owned Signal Red preset, pre-render v4 appearance
      migration, local display typography, edge-safe effects, and
      reduced-motion behavior under plan 0009.
- [x] Add the deterministic original interface sound pack, universal
      device-local controls, and typed message/voice/screen/status event routing
      under plan 0009.
- [ ] Complete plan 0009's installed-app multi-client audio acceptance matrix.
- [x] Add a private operator-managed sound bucket with server-member reads.
- [x] Fetch, revision-cache, and play the hosted sound pack in the renderer.
- [x] Add collapsible System/Bakbak sections and account-synced Favorites under
      plan 0011.
- [x] Add locally normalized member audio/video uploads, owner/admin
      moderation, and managed backend publication under plan 0011.
- [ ] Complete plan 0011's installed-client and hosted two-account acceptance
      matrix.
- [x] Add ordered channel categories and the exact visible Unlucky Boys room
      hierarchy under plan 0012 without importing messages.
- [x] Deploy plan 0012's additive category/layout migration.
- [ ] Complete plan 0012's hosted two-account hierarchy check.
- [x] Add local RNNoise microphone cleanup plus Child, Robot, and
      Walkie-talkie sender-side filters under plan 0013.
- [ ] Complete plan 0013's macOS and Windows installed two-client audio checks.
- [x] Add the Bakbak Signature preset, fixed destination rail, and
      accessible persisted side-panel resizing under plan 0014.
- [x] Reset every v5-or-older installation once to Classic System + Flat +
      Purple through the parser-blocking v6 appearance migration.
- [x] Add participant-private one-to-one DMs with retained former-member
      history, Realtime updates, unread/read state, and person details.
- [x] Add server-wide informational LIVE presence and explicit one-share tile
      subscriptions that keep remote screen video/audio unsubscribed before
      in-room user intent under plan 0015.
- [x] Deploy plan 0014's additive migration before distributing its renderer.
- [ ] Complete plan 0014's hosted DM and installed three-client LIVE/Watch
      acceptance matrices.
- [x] Add plan 0015's per-source audio policy, compact responsive gallery,
      media-first reversible focus with watched grid playback, fullscreen
      reconciliation, and room-level sidebar activity treatment.
- [ ] Complete plan 0015's installed macOS/Windows isolation, fullscreen, and
      visual acceptance matrices.
- [x] Replace selectable appearances and their persistence with plan 0016's
      flat grayscale system-following CSS, local Roundo v2.0 family, and
      read-only Appearance summary.
- [x] Restore device-local Auto, Light, and Dark scheme selection without
      restoring accent, surface, or typography controls.
- [x] Replace the fixed destination rail with plan 0017's app-owned titlebar,
      Personal/Bakbak segment, rail-free shell, and comfortable renderer-wide
      Roundo density.
- [x] Add plan 0018's native/fallback glass materials, edge-to-edge five-track
      shell, left space switch, fixed center title, bounded motion, and
      activity-revealed scrollbars without changing layout preference v2.
- [x] Make plan 0018's left/right pointer resizing immediate and suppress text
      selection only while a panel drag is active.
- [x] Add plan 0019's adaptive semantic control states, shared sidebar user
      footer, existing-presence member groups, and lazy static cover accents
      without changing backend or persisted state.
- [x] Add plan 0019's follow-up member spacing, static user-dock cover, and
      full non-control titlebar dragging with rotating idle/voice title copy.
- [x] Add plan 0020's minimal motion app icon, animated renderer mark, and
      theme-responsive textured server identity header without recolouring
      ordinary chrome.
- [ ] Complete plan 0016's installed dark/light typography and offline-font
      acceptance matrix on macOS and Windows.
- [ ] Complete plan 0017's installed macOS/Windows titlebar, window-control,
      resizing, and close-time screen-share acceptance matrix.
- [ ] Complete plan 0018's light/dark three-resolution browser matrix and
      installed macOS/Windows 10/11 native-material, contrast, startup-flash,
      and window-interaction acceptance matrix.
- [ ] Complete plan 0019's light/dark three-resolution and 200/240/360 px panel
      visual matrix plus installed macOS/Windows control/member observation.
- [ ] Evaluate optional global push-to-talk.
- [x] Implement Windows process/display-matched audio with build gating and
      video-only fallback.
- [ ] Complete the cross-platform installed-client acceptance matrix.
- [x] Update architecture, plan status, and the append-only progress log for
      plan 0014.

### Phase 6 — Distribution

- [x] Add synchronized SemVer tooling with patch-by-default release labels.
- [x] Add signed Tauri update artifacts, a public GitHub Releases endpoint, and
      an explicit in-app update-and-restart experience.
- [x] Add gated GitHub Actions validation and draft release workflows for macOS
      Apple Silicon and Windows x64 NSIS installers, rejecting Intel artifacts.
- [x] Configure the updater signing secrets and live renderer variables in
      GitHub Actions.
- [ ] Publish and validate the first updater-enabled `0.2.x` release.
- [ ] Manually validate an update from the first updater-enabled release to a
      later version on macOS and Windows.
- [ ] Build and validate the Apple-Silicon-only macOS installer in the updated
      GitHub Actions matrix.
- [x] Document initial unsigned and unnotarized installer warnings.
- [x] Build and validate the Windows x64 installer in GitHub Actions.
- [ ] Add Linux installer builds after friend testing.
- [ ] Revisit signing and notarization after the core product is stable.
- [ ] Update architecture, plan status, and the append-only progress log.

## Test and documentation requirements

### Automated tests

- Unit-test invite validation, permissions, sound dispatch, and LiveKit token
  request handling.
- Test Supabase policies as an admin, member, and non-member.
- Keep strict TypeScript, lint, formatting, unit tests, and renderer builds
  green.
- Add focused tests with each behavior change rather than postponing all test
  work until distribution.
- Reject chromatic first-party CSS/SVG colors outside plan 0020's explicitly
  delimited brand block, retired theme machinery,
  product text below 11 px/weight 500, unsupported Roundo weights, and changed
  vendored font bytes in regression tests.

### Manual Apple Silicon macOS acceptance

Before the first friend-test release, manually validate:

- login and single-use invite redemption;
- persistent text chat and realtime updates;
- two-person voice join/leave;
- mute and deafen;
- microphone/device changes;
- reconnect and error recovery; and
- synchronized soundboard playback.

### Security acceptance

- Confirm no compiled desktop bundle includes a Supabase service-role key or a
  LiveKit API secret.
- Keep all LiveKit API secrets exclusively in Edge Function secrets.
- Keep real local and hosted environment values out of source control.

### Documentation acceptance

After every phase:

1. Append completed work, decisions, validation, limitations, and the next step
   to `docs/progress.md`.
2. Revise `docs/architecture.md` if the system, setup, environment, data flow,
   or service contracts changed.
3. Mark phase criteria complete only after their required validation succeeds.

## Deferred and out of scope for v1

- Screen sharing, including system audio.
- Camera recording, effects, and virtual backgrounds.
- Member-created/reordered sound categories, uploaded custom emoji artwork, and
  retained source video. Five-second member uploads and owner/admin management
  are approved by plan 0011.
- Global push-to-talk.
- Advanced roles and permission management.
- Invite-management UI.
- Desktop notifications and tray controls.
- Linux distribution before friend testing.
- Intel macOS releases after Bakbak v0.4.0.
- Signing and notarization before the core product is stable.
