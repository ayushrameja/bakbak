# 0035 — Titlebar, space motion, and circular voice-room polish

- **Status:** Implemented locally; installed visual acceptance remains
- **Approved:** 2026-08-02
- **Audience:** The existing private Bakbak server and Personal DMs

## Goal

Simplify signed-in chrome and call status, make Personal/Bakbak changes read as
directional workspace movement, and replace rectangular voice participant tiles
with profile-led circular groups without changing LiveKit, profiles, soundboard,
or screen-share lifecycle contracts.

## Accepted behavior

- [x] Keep the titlebar centre empty and draggable, with the single sidebar
      visibility control in the leading platform-safe area.
- [x] Keep the active sidebar call card compact around connection state, room,
      and leave while restoring its camera, screen-share, and soundboard action
      row alongside the global dock.
- [x] Increase Activity avatar/row breathing room, strengthen online identity
      and cover visibility without lifting offline emphasis, and remove the
      current-user dock cover while reducing its height.
- [x] Remove the divider below server text/voice headers while retaining DM,
      conversation, and outer-canvas boundaries.
- [x] Let only destination sidebar content below the stationary space switch
      enter directionally over 345 ms: Personal moves left from the right and
      Bakbak moves right from the left. The header, canvas, active call tree,
      and reduced-motion destination remain stable.
- [x] Use one centred participant and an overlapping two-to-four-person
      cluster, then place five to ten participants in a normal centred wrapping
      row with a denser wrapping fallback above ten. Increase each layout's
      participant circles by 20% at regular and compact breakpoints.
- [x] Render substantially larger static/GIF profiles or circular camera video
      with a forgiving above-avatar tooltip-style action popover that keeps the
      media clear and exposes profile, LIVE, and working 0–200% volume actions.
- [x] Make pointer volume changes use the range input event and verify the
      tooltip drives the attached participant's real stream-backed gain below
      and above unity without opening profile or LIVE media.
- [x] Keep non-LIVE profile and camera circles passive. Only a LIVE circle or
      its LIVE actions open the existing focused share stage; activating the
      focused media returns to people without a Back button, participant expand
      stage, or renderer fullscreen feature.
- [x] Derive LIVE from an owned screen share, combine its static red outer ring
      with the theme speaking ring, and keep a dedicated share focus/watch
      action plus an orphan-share fallback.
- [x] Blend the newest sound emoji over profile or camera at 20% opacity while
      retaining overlap counts and reduced-motion handling.

## Compatibility and safety

- Supabase, LiveKit, backend, RLS, persisted preference, profile-media, and
  soundboard wire contracts do not change.
- The global call dock remains the complete persistent microphone, camera,
  share, soundboard, device, and disconnect surface. The compact sidebar card
  duplicates only camera, share, and soundboard for convenient discovery.
- Installed and older clients keep their existing voice and screen-share data
  compatibility; this plan changes only renderer presentation and internal
  component props.

## Acceptance

- [x] Cover titlebar placement, compact call actions, channel context/timer,
      sidebar-only directional state, circular layouts, passive non-LIVE media,
      LIVE focus/media-return, volume, speaking/LIVE coexistence, sound
      blending, GIF autoplay, orphan shares, and keyboard identity actions with
      focused renderer tests.
- [ ] Verify light/dark Bakbak and Personal at 1280×800 and 1024×680 with
      hidden/minimum/maximum sidebar widths and 1, 2, 4, 5, and 10 people.
- [ ] Complete installed macOS/Windows camera, profile, LIVE watch/media-return,
      reduced-motion, titlebar, and multi-client voice checks.
- [x] Run every applicable repository check and record native build limitations
      truthfully in the canonical progress log.
