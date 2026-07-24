# 0026 — System-adaptive unified accent

- **Status:** Implemented; automated and mock-browser validation complete,
  installed cross-platform observation pending
- **Approved:** 2026-07-24
- **Compatibility boundary:** Native appearance bridge and renderer
  presentation only; no Supabase, account preference, local-storage, channel,
  chat, permission, or backend contract changes

## Goal

Replace competing decorative green and blue colors with one live
operating-system accent, then calm wallpaper bleed so Bakbak reads as one
interface without erasing native glass.

## Accepted behavior

- [x] Query macOS `NSColor.controlAccentColor` in sRGB and observe
      `NSSystemColorsDidChangeNotification` for live changes.
- [x] Query Windows `UISettings.GetColorValue(Accent)` and retain a
      `ColorValuesChanged` subscription for the application lifetime.
- [x] Expose `get_system_accent` and `system-accent-changed` with validated RGB
      byte channels and explicit macOS, Windows, or fallback sources.
- [x] Start the renderer listener before its first query, use a neutral fallback
      within 250 ms, refresh on focus, and re-derive the accent on resolved
      scheme changes.
- [x] Normalize arbitrary accents to 4.5:1 text contrast against the active
      canvas, choose the higher-contrast black or white on-accent color, and
      publish the complete system-accent token family.
- [x] Apply the accent to branding atmosphere, selected channels and Personal
      conversations, unread state, trails, hover/focus, resizers, and active
      composer/call controls while inactive SVG controls remain neutral.
- [x] Keep online/connected/in-voice green, destructive/error/leave red, and
      warning/reconnecting/idle amber independent of decorative selection.
- [x] Use dark neutral glass at approximately 64/72/84% and light glass at
      60/72/84%, mixed with 6/5/3% accent plus 8% ordinary hover.
- [x] Keep only Auto/Light/Dark preferences and add a read-only System accent
      swatch with the current native or fallback source.
- [x] Keep linked-`bb`, favicon, and native icon artwork graphite/ivory and
      preserve user/live media color.
- [x] Disable the new 160 ms color, border, background, and shadow transitions
      under `prefers-reduced-motion`.

## Validation

- [x] Cover payload validation, neutral fallback, contrast normalization,
      on-accent choice, initial query, listener ordering and updates, focus
      refresh, source reporting, theme recomputation, and cleanup with focused
      renderer/native tests.
- [x] Lock native bridge, dynamic-token reach, semantic-color independence,
      glass opacity, Appearance, and reduced-motion behavior into Node contract
      tests.
- [x] Pass the repository check, locked native check, focused native tests, and
      local Apple Silicon application build.
- [x] Inspect red, blue, and Graphite accents at 1280×800 and 1024×680 in dark
      and light mock mode across server, Personal, chat, composer, members,
      and Settings.
- [ ] Inspect connected mute/deafen controls and the reduced-motion interaction
      pass in an installed client where native media state is available.
- [ ] Change Accent Color while the installed macOS build is open and verify
      its live update.
- [ ] Repeat native accent and Automatic wallpaper-derived accent observation
      on Windows.

## Out of scope

- Direct wallpaper image sampling
- A manual accent picker, toggle, or persisted accent preference
- Recoloring user media or the canonical linked-`bb` icon assets
- Backend, account, channel, chat, permission, or subscription changes
