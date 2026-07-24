# 0020 — Bakbak identity branding

- **Status:** Implemented; installed-app icon observation remains open
- **Approved:** 2026-07-22
- **Scope:** Product identity artwork, desktop icon bundle, favicon, and the
  server identity header only

## Intent

Give Bakbak an ownable identity without recolouring the complete application.
The mark is a custom pair of linked lowercase `b` strokes: a direct Bakbak
monogram that suggests two voices without using a mascot, face, generic speech
bubble, or arcade silhouette. The same quiet static geometry serves renderer,
favicon, and native surfaces.

## Visual contract

- Use `public/bakbak.svg` as the canonical favicon and native-icon source. It
  uses a rounded graphite ground, warm off-white strokes, transparent outer
  corners, and no gradient, glow, face, bevel, grain, or three-dimensional
  treatment. Generate the tracked macOS, Windows, iOS, and Android variants
  from that SVG.
- Use the matching static code-native `BakbakMark` on authentication, invite,
  loading, and empty-Personal surfaces. Keep exactly two linked strokes and no
  particle, mouth, or ornamental animation.
- Keep the main glass shell and ordinary controls neutral.
- Keep the server header logo-free. Present a fixed Bakbak wordmark beside a
  compact `β · vX.Y.Z` release chip sourced from the current package version.
  The atmospheric identity surface uses graphite, warm ivory, and a restrained
  lime/green aurora in dark mode, with a pale theme-responsive counterpart in
  light mode. A sparse constellation and diagonal signal weave require no
  raster texture.
- Remove the `Friends-only adda` subtitle without replacing it with another
  tagline.
- Keep the mark decorative where visible text already names Bakbak.

## Acceptance

- [x] Replace the open-ring/particle icon set with the linked lowercase `bb`
      monogram generated from one canonical SVG.
- [x] Use the matching static code-native mark across renderer identity
      screens.
- [x] Add a theme-responsive atmospheric server identity header with a sparse
      constellation and signal-weave texture.
- [x] Keep the server header logo-free while retaining the accessible
      package-version-backed `β · vX.Y.Z` chip.
- [x] Remove `Friends-only adda` from the rendered header and cover it with a
      component regression.
- [x] Keep ordinary chrome grayscale with a delimited identity guard that
      contains the atmospheric gradients and verifies the texture and two-stroke
      mark contracts.
- [x] Verify the 232×80 px header, compact `β · vX.Y.Z` release chip, current
      version, absent logo, Bakbak wordmark, theme-responsive atmospheric
      surface, tagline removal, and zero horizontal overflow in mock mode.
- [ ] Observe the final dock/taskbar, app switcher, DMG, and Windows installer
      icon on installed macOS and Windows builds.
