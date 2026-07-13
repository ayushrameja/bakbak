# 0005 — Voice chat, mentions, settings overlay, and accent themes

**Status:** Implemented and deployed; two-account acceptance remains open.

## Goal

Make voice rooms useful as persistent conversations, keep mentions stable across
profile renames, move settings into a focused Discord-style overlay, and let
each device personalize Bakbak's accent without compromising theme contrast.

## Accepted scope

- Text chat is available in both text and voice channels. Voice chat is an open,
  collapsible 340 px dock at the 1280 px layout and a slide-over drawer at the
  supported 1024 px layout. Joining voice remains independent from reading or
  sending messages.
- Unread state is account-synced for both channel kinds. A voice channel remains
  unread while its chat is collapsed, even when that room is selected.
- Individual mentions store a stable profile UUID in structured message content.
  Current shared-server profile names render dynamically, with a stored fallback
  for profiles that are no longer visible. `@everyone`, mention sounds, and
  mention-only notifications are excluded.
- Settings is a full-app modal overlay with left navigation, scrollable content,
  X/Escape dismissal, focus trapping/restoration, active-call controls, and a
  confirmed red logout action. It is not a route and does not discard channel
  selection, drafts, or the current call.
- Appearance is device-local and includes System, Light, and Dark themes plus
  Coral, Purple, Red, and Yellow accents. Intensity ranges from 25–100% in 5%
  steps and changes vividness/ambience while preserving readable foregrounds.
- Only the radial accent gradient is removed from `.app-loading`; authentication
  and invite backgrounds are unchanged.

## Data contracts

- [x] Add nullable `messages.content jsonb` with text and stable-ID mention
      segments while retaining `messages.body` for existing clients.
- [x] Add membership-checked `send_message(channel_id, content)` validation for
      exact segment shapes, a 4,000-character fallback, at most 25 mentions,
      and mentioned users belonging to the channel's server.
- [x] Expand message reads to accessible text and voice channels while keeping
      direct cross-server access blocked.
- [x] Add private `channel_read_states`, membership-checked activity/read RPCs,
      monotonic read pointers, and Realtime publication.
- [x] Baseline existing memberships at current history and initialize new
      memberships at their server's current history boundary.
- [x] Add renderer message-segment, structured-draft, and channel-activity
      types plus service adapters.
- [x] Migrate local appearance storage from v1 theme-only data to
      `bakbak.appearancePreferences.v2`.

## Product behavior

- [x] Share the message list/composer between text channels and the voice-chat
      dock, including optimistic messages and profile-driven mention rendering.
- [x] Apply the same unread treatment to text and voice rows, and advance the
      hosted marker only while that channel's chat is visible.
- [x] Provide an accessible member combobox with avatar, keyboard/mouse
      selection, Escape dismissal, `(you)` identification, stable duplicate-name
      handling, and atomic mention editing semantics.
- [x] Replace the in-canvas settings view with the full-app overlay and move
      logout out of the channel shelf.
- [x] Keep active voice controls available inside settings and report logout
      failures inline without dismissing the overlay.
- [x] Apply theme, accent, and intensity tokens during the parser-blocking
      first-paint bootstrap and React runtime.
- [x] Remove the `.app-loading` radial gradient without changing its remaining
      loading treatment.

## Acceptance

- [x] Focused database tests cover voice-channel access, structured validation,
      mention membership, private/monotonic read markers, unread activity, and
      historical/new-member baselines.
- [x] Focused frontend tests cover structured drafts, mention rendering and
      lookup, voice unread styling, settings behavior, and appearance migration.
- [x] Mock browser QA covers 1280×800 and 1024×680 voice-chat layouts, mention
      selection, the settings overlay, and runtime accent application.
- [x] Apply the additive migration to the hosted Supabase project.
- [ ] Run the canonical browser-plus-native two-account acceptance for live
      voice-chat delivery, read synchronization, historical mention renames,
      active-call continuity, reduced motion, and the complete theme/accent/
      intensity matrix.
- [ ] Complete distribution-platform signing/notarization checks where hosted
      credentials are available.

## Rollout notes

The migration intentionally treats pre-existing history as read. Older clients
continue to display the generated plain-text `body`, but only upgraded clients
render renamed mentions dynamically. The hosted migration now precedes live
acceptance of the upgraded messaging and read-state clients.
