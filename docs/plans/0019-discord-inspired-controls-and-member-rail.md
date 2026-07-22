# 0019 — Discord-inspired controls and member rail

- **Status:** Implemented locally; light and installed visual acceptance pending
- **Approved:** 2026-07-22
- **Scope:** Sidebar controls, semantic control colors, and the server member panel
- **Compatibility boundary:** No backend, presence, voice, media, or persistence migration

## Summary

Bakbak keeps its system-adaptive neutral glass shell while using a small,
Discord-inspired semantic palette for positive, destructive, selected, warning,
and icon states. The server and Personal sidebars share one user-control footer,
the floating voice dock uses the same state language, and the server member rail
groups people as In Voice, Online, and Offline with clearer separation. A
follow-up places the signed-in member's static cover behind the shared user
dock and turns the centered title into a draggable, context-aware joke line.

This plan supersedes only plan 0016's fully monochrome semantic-state rule and
plan 0018's preservation of that rule. Their neutral glass, system light/dark,
local Roundo, native-material, layout, motion, and unfiltered-media contracts
remain authoritative.

## Decisions

1. Neutral chrome remains grayscale. The only approved chromatic UI tokens are
   dark/light positive `#23a55a/#18733e`, danger `#da373c/#b9252b`, selected
   `#5865f2/#3d49b8`, warning `#f0b232/#8a5a00`, primary icon
   `#f2f3f5/#1e1f22`, and secondary icon `#b5bac1/#4e5058`.
2. Every filled semantic control uses an explicit foreground token. Text keeps
   at least 4.5:1 contrast and non-text icon states keep at least 3:1.
3. The server and Personal channel panels use one `SidebarUserDock`. Mute and
   deafen remain visible only during an active call; no disconnected mute
   preference is introduced.
4. The existing floating dock, hide timing, keyboard access, More menu,
   soundboard anchoring, and dual-control behavior remain unchanged.
5. `MemberPanel` receives a renderer-only `MemberVoiceActivity` view model.
   Known server presence is merged with the current LiveKit call, with current
   call state winning until the next heartbeat.
6. The member rail omits empty groups and prevents duplication. Streaming sorts
   before admin, then names sort case-insensitively; other groups sort admin
   first and then by name.
7. Visible member rows lazily request only the static cover poster through the
   existing authenticated media cache. The poster retains its focal point and
   source color; animation is never requested in the rail, and failures fall
   back silently.
8. Bot identity, app/game art, and full rich presence remain out of scope.
9. Member surfaces retain their 44 px density with a 5 px visual gap. The
   always-visible shared user dock immediately requests only the signed-in
   member's static poster, preserves its focal point, and applies a neutral
   contrast gradient beneath all identity and control content.
10. The centered title rotates deterministic idle copy every eight seconds.
    Voice connection state resets it immediately to concise connecting,
    connected-room, reconnecting, or error copy. One handler on the complete
    titlebar delegates native dragging and double-click maximize to the window
    adapter for every non-control target; navigation and control groups are
    excluded.

## Acceptance criteria

- [x] Add adaptive semantic tokens and explicit foreground-on-fill states.
- [x] Extract and use one shared sidebar user dock in Personal and server space.
- [x] Restyle sidebar and floating call controls without changing behavior.
- [x] Add In Voice/Online/Offline grouping from existing presence and current-call data.
- [x] Add lazy static cover accents with focal positioning and failure fallback.
- [x] Add focused component, integration, appearance, and contrast regressions.
- [x] Increase member-card separation and add a static cover background to the
      shared user dock without loading cover animation.
- [x] Make the complete non-control titlebar draggable and rotate
      idle/voice-aware funny copy.
- [ ] Complete dark/light browser QA at 1024×680, 1280×800, and 2560×1440 with
      200/240/360 px panel widths and the full call/member state matrix.
- [ ] Complete installed macOS and Windows visual/interaction checks.
- [x] Pass the final renderer, native build, security, and diff validation suite.

## Known release gate

Browser automation cannot establish native vibrancy/Mica contrast, inactive
window material, or installed system-scheme switching. Those checks remain part
of the existing plan 0018 macOS and Windows release matrix.
