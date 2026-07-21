# 0016 — Flat monochrome + Roundo

- **Status:** Implemented locally; installed visual acceptance pending
- **Approved:** 2026-07-21
- **Scope:** Renderer appearance and typography only

## Summary

Bakbak uses one flat, grayscale interface that follows the operating system's
light/dark setting. Roundo v2.0 is the single product typeface and is bundled
locally so the installed app has no font CDN dependency.

This plan supersedes the visual-theme and typography decisions in plans 0005,
0006, 0009, and 0014. Their non-visual behavior remains in force, including
mentions, settings, interface sounds, the three-panel shell, voice controls,
Personal DMs, profiles, resizable panels, and live media behavior.

## Decisions

1. The renderer exposes no selectable theme, accent, intensity, surface, or
   preset. CSS `prefers-color-scheme` is the only appearance switch.
2. First-party UI chrome and the in-app Bakbak SVG are grayscale. Avatars,
   covers, emoji, camera video, and screen shares retain their source color.
3. Appearance remains a read-only Settings page showing `Flat`,
   `Follows system`, and `Roundo`.
4. Existing `bakbak.appearancePreferences.*` local-storage values are ignored.
   The renderer neither reads, migrates, rewrites, nor cleans them up.
5. Roundo v2.0's variable WOFF2 and SIL OFL notice are committed. One local
   `@font-face` exposes upright weights 200–700 with `font-display: swap`.
6. Body copy uses 400, controls and labels use 500, emphasis uses 600, and
   headings and primary actions use 700. Weights above 700 and synthetic
   italics are forbidden.
7. Native application/installer icons are outside this renderer-theme change.

## Acceptance criteria

- [x] Remove appearance preference types, migrations, state, setters, tests,
      bootstrap script, preset effect component, and visual texture assets.
- [x] Apply the approved dark/light grayscale tokens through
      `prefers-color-scheme` and publish matching media-qualified
      `theme-color` metadata.
- [x] Convert first-party CSS and the in-app Bakbak SVG to grayscale without
      filtering user or live media.
- [x] Replace Appearance controls with the read-only summary.
- [x] Vendor Roundo v2.0 and its OFL notice; remove Cormorant Garamond, League
      Gothic, IBM Plex Mono, and their Fontsource packages.
- [x] Add regression coverage for grayscale colors, removed theme machinery,
      pinned font bytes, offline loading, and supported font weights.
- [ ] Complete dark/light visual checks at 1024×680 and 1280×800 for auth,
      chat, voice, profiles, settings, dialogs, soundboard, errors, focus, and
      dense Roundo text.
- [x] Pass the repository's full renderer, security, native-build, and diff
      validation suite.

## Known release gate

The installed macOS and Windows builds still require human confirmation that
Roundo renders offline at 9–12 px UI and 14–16 px chat sizes without ambiguous
glyphs, clipping, cramped line height, or unacceptable wrapping.
