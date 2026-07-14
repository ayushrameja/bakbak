# 0006 — Discord-shaped, Bakbak-hearted UI redesign

- **Status:** Implemented; automated and mock-browser validation complete,
  browser-plus-native two-account acceptance pending
- **Approved:** 2026-07-14
- **Target users:** The existing private group of 5–10 friends
- **Compatibility boundary:** No database, token, presence, soundboard, or
  screen-capture contract changes

## Goal

Make the room easier to scan and the active call easier to control without
turning Bakbak into a Discord costume party. Friends should find Mute before
panic finds them.

## Slice 1 — Shell, appearance, settings, and chat removal

- [x] Use a 232 px channel panel, flexible center canvas, and 240 px member
      panel. Both side panels are visible by default and independently toggle.
- [x] Persist `{ leftPanelVisible, rightPanelVisible }` under
      `bakbak.layoutPreferences.v1`, with corruption fallback to both visible.
- [x] Keep all four panel combinations in normal document flow at 1280×800 and
      1024×680; released space goes to the center canvas without overlays.
- [x] Reduce shell padding/gaps to 5 px and halve comparable non-semantic panel,
      card, modal, input, drawer, and control radii. Circles, pills, avatars,
      and status dots remain unchanged.
- [x] Migrate appearance to `bakbak.appearancePreferences.v3` with
      `surfaceStyle: "warm" | "flat"`; v1/v2 values migrate to Warm.
- [x] Apply surface style in the parser-blocking bootstrap. Flat retains theme
      and accent choices while removing decorative gradients, blur, glow, and
      heavy shadows from product surfaces.
- [x] Replace full-app settings with a centered, internally scrolling modal up
      to 1000×720 with 16–24 px viewport margins, dim backdrop, X/Escape/
      backdrop dismissal, focus trapping/restoration, active-call controls,
      and confirmed logout.
- [x] Remove voice-channel chat, drafts, unread UI, loads, subscriptions,
      sends, and notification behavior from the upgraded renderer. Text chat
      and stable-ID mentions remain unchanged.
- [x] Keep the additive voice-message/read-state database contract for older
      installed clients; no destructive migration is introduced.

## Slice 2 — Voice controls and joined-room canvas

- [x] Replace the layout-consuming voice bar with an absolute centered dock
      available across channels during an active call.
- [x] Reveal the dock after connection, keyboard focus, or pointer movement in
      the lower 96 px of non-interactive canvas; hide it after 2.5 seconds idle.
      Hover, focus, More, and soundboard pin it open.
- [x] Keep the dock above a text composer, behind settings, and keyboard
      discoverable while visually hidden.
- [x] Provide direct microphone, camera, screen-share, soundboard, More, and
      disconnect actions. More contains Deafen and Audio & Video settings.
- [x] Add a channel-sidebar call block with connection/room state, normalized
      LiveKit quality, accurately labelled backend latency, disconnect, camera,
      screen share, and soundboard actions. The user row retains mute, deafen,
      and settings access.
- [x] Normalize local LiveKit quality as Unknown, Excellent, Good, or Poor;
      reconnecting takes display precedence and teardown resets to Unknown.
- [x] Auto-join a selected voice channel and switch calls when another voice
      channel is selected. Do not render a pre-join or initial connection
      surface. After joining, fill the canvas with equal participant tiles
      carrying minimal camera/avatar, name, mute, speaking, activity, and
      remote-volume overlays.
- [x] Preserve the selected featured screen share and presenter switching while
      moving participant tiles into a compact horizontal strip.
- [x] Keep autoplay, device, reconnect, and screen-share failures as compact
      banners. Preserve existing audio routing and screen-capture contracts.
- [x] Anchor soundboard above the floating dock and pin the dock until it closes.

## Follow-up — Compact soundboard and interface zoom

- [x] Replace the wide soundboard surface with a centered 480×380 maximum
      popover, compact three-column sound rows, internal catalog scrolling, and
      preserved search/category/volume/edit/retry/stop behavior.
- [x] Keep 10 px clearance above the floating dock and preserve the dock's
      composer clearance while browsing a text channel.
- [x] Enable Tauri's native Cmd/Ctrl `+`, Cmd/Ctrl `-`, and Cmd/Ctrl `0`
      interface zoom hotkeys with the scoped webview-zoom capability.
- [x] Cover the compact semantics and native configuration with focused tests,
      then verify the soundboard footprint at 1024×680 and 1280×800.
- [x] Cover voice-channel auto-join and room switching, with no manual Join
      control or “Joining quietly” surface.

## Validation

- [x] Focused tests cover layout defaults/corruption/persistence, all panel
      combinations, accessible toggles, appearance migration/bootstrap, modal
      behavior, voice-chat absence, dock timing/pinning, sidebar actions,
      quality normalization, participant layouts, and featured sharing.
- [x] Mock browser QA covers 1280×800 and 1024×680, all panel combinations,
      Warm/Flat with Light/Dark, settings scrolling/focus restoration, voice
      auto-join/joined layouts, dock hiding/reveal, soundboard anchoring, text
      composer clearance, active-call navigation, and zero console warnings.
- [ ] Run the canonical browser-plus-native two-account call with human media
      observation: mute/deafen, camera, screen share, soundboard, device changes,
      quality changes, text/settings navigation, panel hiding, reconnect, and
      disconnect from both control surfaces.
- [ ] Verify the updater-enabled Tauri build when protected signing credentials
      are available. Local app-only build results belong in `docs/progress.md`.

## Superseded decisions

This plan supersedes only the product/UI decisions in plans 0004 and 0005 that
required a People drawer, a layout-consuming persistent voice bar, full-app
settings, and voice-channel chat in upgraded clients. Their completed profile,
channel-management, mention, read-state, database, deployment, security, and
older-client compatibility work remains authoritative.
