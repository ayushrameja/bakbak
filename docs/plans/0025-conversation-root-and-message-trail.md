# 0025 — Conversation root and message trail

- **Status:** Implemented; automated and mock-browser validation complete,
  installed desktop observation pending
- **Approved:** 2026-07-24
- **Compatibility boundary:** Renderer-only channel and direct-message
  presentation; no message, draft, Realtime, storage, unread, or backend
  contract changes

## Goal

Give empty and populated text conversations the same connected visual language
as the channel shelf without turning the message canvas into an ARIA tree or
changing how chat works.

## Accepted behavior

- [x] Treat the existing channel or direct-message introduction as the root of
      the conversation and show a compact Quiet room or Conversation flowing
      state.
- [x] Replace the full-width dashed empty placeholder with a compact,
      accessible first-branch node whose copy adapts to channels and direct
      messages.
- [x] Connect populated messages with a subtle vertical rail aligned to the
      introduction icon and message-avatar centers.
- [x] Give each ungrouped message a short branch into its body, grouped
      messages a compact rail dot, and populated trails a terminal marker.
- [x] Preserve sending, drafts, mentions, profiles, replies, reactions,
      deletion, attachments, media, pending state, loading older messages, and
      composer behavior.
- [x] Keep the treatment responsive and theme-aware, with no horizontal
      document or conversation overflow at the supported minimum size.
- [x] Disable the empty-node entrance animation under
      `prefers-reduced-motion`.

## Validation

- [x] Cover channel and direct-message empty copy, populated state, grouped
      messages, terminal markers, and the retained interaction suite with
      focused component tests.
- [x] Lock rail, branch, avatar, empty-node, and reduced-motion geometry into a
      Node contract test.
- [x] Inspect empty and populated layouts in mock mode at 1280×800 and
      1024×680 in light and dark schemes.
- [x] Pass the repository check and local Apple Silicon application build.
- [ ] Observe the rebuilt treatment once in the installed macOS app and on the
      next Windows build with native material active.

## Out of scope

- Message grouping, ordering, pagination, or persistence changes
- Suggested-message buttons, prompts, or automated posting
- Voice-room canvas changes
- Backend schemas, APIs, permissions, or account preferences
