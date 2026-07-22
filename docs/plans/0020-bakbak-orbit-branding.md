# 0020 — Bakbak Orbit branding

- **Status:** Implemented; installed-app icon observation remains open
- **Approved:** 2026-07-22
- **Scope:** Product identity artwork, desktop icon bundle, favicon, and the
  server identity header only

## Intent

Give Bakbak an ownable identity without recolouring the complete application.
The mark uses two abstract circular conversation forms around a small spark: a
compact visual for two friends talking, with a geometric arcade-era nod that
does not reproduce Pac-Man or another existing character or logo.

## Visual contract

- Use the generated `Bakbak Orbit` raster as the favicon, empty-Personal-state
  mark, server identity image, and source for native macOS, Windows, iOS, and
  Android icon variants.
- Keep the main glass shell and ordinary controls neutral. Indigo, cyan, and
  coral chroma is allowed only inside the bounded brand block and the artwork.
- Present the active server name beside the mark on a fixed dark premium card
  with restrained aura, orbit lines, and fine dot grain in both system schemes.
- Remove the `Friends-only adda` subtitle without replacing it with another
  tagline.
- Keep the mark decorative where visible text already names the server.

## Acceptance

- [x] Replace the messaging-bubble desktop icon set with Bakbak Orbit.
- [x] Use the new artwork for the renderer favicon and empty Personal state.
- [x] Add the artwork, premium wordmark treatment, and bounded RGB texture to
      the server header.
- [x] Remove `Friends-only adda` from the rendered header and cover it with a
      component regression.
- [x] Keep ordinary chrome grayscale by stripping only the explicitly delimited
      brand block in the appearance guard.
- [x] Verify 232 px header sizing, loaded artwork, tagline removal, and zero
      horizontal overflow at 1280×720 and 1024×680 in mock mode.
- [ ] Observe the final dock/taskbar, app switcher, DMG, and Windows installer
      icon on installed macOS and Windows builds.
