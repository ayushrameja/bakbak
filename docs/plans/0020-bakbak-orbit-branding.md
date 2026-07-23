# 0020 — Bakbak motion branding

- **Status:** Implemented; installed-app icon observation remains open
- **Approved:** 2026-07-22
- **Scope:** Product identity artwork, desktop icon bundle, favicon, and the
  server identity header only

## Intent

Give Bakbak an ownable identity without recolouring the complete application.
The mark is one open circular conversation ring facing three message particles.
Its jaws close and the particles advance in the renderer, suggesting an ongoing
chomp through conversation without reproducing Pac-Man or another character or
logo. Native and favicon surfaces use a generated static frame of the same
minimal geometry.

## Visual contract

- Use one flat generated raster as the favicon and source for native macOS,
  Windows, iOS, and Android icon variants. It uses a graphite ground, warm
  off-white mark, restrained monochrome grain, and no gradient, glow, face,
  bevel, or three-dimensional treatment.
- Use a code-native SVG motion mark for authentication, invite, loading, and
  empty-Personal surfaces. Animate its two jaws and three particles, and keep a
  clear static state when reduced motion is requested.
- Keep the main glass shell and ordinary controls neutral. Only the nearest
  message particle may use a small theme-responsive lime accent.
- Do not repeat the logo in the server header. Present a fixed Bakbak wordmark
  beside a compact `β · vX.Y.Z` release chip sourced from the current package
  version. The solid identity surface uses graphite and warm ivory in dark
  mode, paper and ink in light mode; fine noise, border contrast, chip surface,
  and orbit lines adapt to the selected scheme while gradients remain absent.
- Remove the `Friends-only adda` subtitle without replacing it with another
  tagline.
- Keep the mark decorative where visible text already names the server.

## Acceptance

- [x] Replace the messaging-bubble desktop icon set with the minimal open-ring
      and three-particle static frame.
- [x] Use the code-native animated mark across renderer identity screens.
- [x] Add a gradient-free, theme-responsive server identity header with
      restrained monochrome noise and orbit texture.
- [x] Remove the logo from the server header and replace it with an accessible
      package-version-backed `β · vX.Y.Z` chip.
- [x] Remove `Friends-only adda` from the rendered header and cover it with a
      component regression.
- [x] Keep ordinary chrome grayscale with a delimited motion-brand guard that
      also rejects brand gradients and verifies noise, accent, and
      reduced-motion contracts.
- [x] Verify the 232×80 px header, compact `β · vX.Y.Z` release chip, current
      version, absent logo, Bakbak wordmark, theme-responsive surfaces/noise,
      tagline removal, and zero horizontal overflow at 1280×720 in mock mode.
- [ ] Observe the final dock/taskbar, app switcher, DMG, and Windows installer
      icon on installed macOS and Windows builds.
