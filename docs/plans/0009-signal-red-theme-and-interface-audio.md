# 0009 — Signal Red theme and universal interface audio

- **Status:** Implemented; automated and mock-browser validation complete,
  installed-app multi-client audio acceptance pending
- **Approved:** 2026-07-17
- **Target users:** The existing private group of 5–10 friends
- **Compatibility boundary:** Renderer and device-local state only; no
  Supabase, LiveKit protocol, migration, or server changes

## Goal

Give Bakbak one deliberately non-neutral visual preset and one original
communication sound language without borrowing another team's identity.
Signal Red may be dramatic around the edges; friends and their messages remain
the main event. The sound pack belongs to every visual theme.

## Signal Red appearance

- [x] Add `VisualPreset = "standard" | "signal-red"` and migrate appearance
      persistence from v3 to v4 without modifying the stored standard theme,
      accent, intensity, or surface style.
- [x] Apply the effective Dark + Flat Signal Red tokens in the parser-blocking
      bootstrap before React mounts.
- [x] Add an Appearance special-theme card and disable standard controls with
      an explanation while the fixed preset is active.
- [x] Bundle League Gothic and IBM Plex Mono through Fontsource and retain
      Inter for messages, profile fields, forms, and long text.
- [x] Uppercase headings, channel labels, buttons, status labels, tickers, and
      docks without transforming stored message or profile content.
- [x] Use sharp structural corners and fixed black/red/off-white tokens while
      preserving accessible focus, presence, warning, and danger colors.

## Ambient and communication effects

- [x] Add one pointer-transparent, accessibility-hidden effects layer above the
      shell and below Settings, dialogs, and profile surfaces.
- [x] Add a tiled static noise asset, stepped texture motion, red edge grid and
      orbit lines, diagonal broadcast bars, timecode fragments, and a
      22-second alternating ticker.
- [x] Schedule one Bakbak-only logo stamp at a time every 18–32 seconds in four
      predefined safe edge positions for 450–750 ms.
- [x] Pause random effects while the document is hidden or an interactive
      modal/profile/settings surface is open.
- [x] Render typed edge overlays for message, self/remote voice, local/remote
      screen share, reconnect, and communication interruption events.
- [x] Use clipped 450–700 ms edge wipes and brief type displacement without
      full-window title cards or center-content obstruction.
- [x] Freeze texture motion, remove tickers/glitches/random stamps, and retain
      only a static event label under reduced motion.

## Original interface sound pack

- [x] Replace the procedural message chirp with one central Web Audio
      controller routed to the operating-system default output.
- [x] Add a seeded Node synthesizer and commit deterministic 48 kHz, 16-bit
      mono WAVs for message, self/remote voice join/leave, screen-share
      start/stop, reconnect success, and actionable communication failure.
- [x] Enforce fades, deterministic bytes, expected durations, peak limits, WAV
      headers, required names, and a total bundle below 1 MB.
- [x] Decode lazily after the first pointer/keyboard interaction and discard
      pre-activation events rather than queueing stale cues.
- [x] Add device-local master enable/55% volume and Messages, Voice, Screen
      share, and Status category controls with representative previews.
- [x] Limit playback to three concurrent sounds, throttle messages to 350 ms,
      batch remote join/leave churn for 250 ms, cool repeated failures for two
      seconds, and degrade silently when Web Audio fails.

## Voice and screen-share semantics

- [x] Introduce typed `CommunicationEffectEvent` and `VoiceLeaveReason`
      boundaries between voice lifecycle handling and the app effects
      controller.
- [x] Emit self join only after the room, microphone, output, and soundboard
      gate are ready; emit normal self leave only for an explicit user exit.
- [x] Emit one destination join and no intermediate leave during a direct room
      switch; suppress leave for sign-out, teardown, canceled joins, and
      unexpected disconnects.
- [x] Baseline the initial roster, ignore native screen-share companions as
      people, and emit later remote join/leave only for the active room.
- [x] Emit local and remote screen-share start/stop after baselining, with
      reduced remote gain and no duplicate companion/track cues.
- [x] Emit reconnect success and communication failure status events.
- [x] Suppress remote Voice and Screen-share sounds while deafened while
      retaining self actions, Messages, and Status.
- [x] Preserve the existing committed-message rule for messages authored by a
      different user, regardless of selected text channel.

## Ownership and licenses

League Gothic and IBM Plex Mono are bundled from Fontsource packages whose
package metadata declares the SIL Open Font License 1.1 (`OFL-1.1`). Inter
remains the existing body typeface. Signal Red uses only Bakbak names, phrases,
logo geometry, and generated texture.

Every WAV in `public/interface-sounds` is original Bakbak project output from
the deterministic oscillator/filter/envelope/seeded-noise generator in
`scripts/generate-interface-sounds.mjs`. No recording, sampled pack, Sentinels
mark, slogan, footage, proprietary typeface, or third-party audio is included.

## Validation

- [x] Test v1/v2/v3 appearance migration, v4 persistence, first-paint
      bootstrap, fixed Signal Red tokens, and standard-setting restoration.
- [x] Test special-theme selection, disabled standard controls, audio controls,
      previews, and keyboard-operable native controls.
- [x] Test ambient timing bounds, safe positions, repeated scheduling,
      modal pausing, exact event copy, and reduced-motion suppression.
- [x] Test audio generation determinism, format, duration, peak/fade limits,
      names, and bundle size.
- [x] Test controller activation/caching, system destination, preferences,
      cooldowns, batching, deafen, gain, and concurrency.
- [x] Test self join/explicit leave/direct switch, initial roster suppression,
      remote/companion events, local screen share, reconnect, and failure
      semantics.
- [x] Complete mock-browser visual QA at 1280×800 and 1024×680 for text, voice,
      Settings Appearance, Audio & Video, overlays, content case, and overflow.
- [ ] Complete installed-app multi-client audio QA for rapid messages,
      simultaneous roster churn, local/remote screen sharing, reconnect,
      deafen, preferences, and call output different from system output.
