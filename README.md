# Bakbak

Bakbak is a private desktop room for 5–10 friends: persistent text chat,
drop-in voice, and a synchronized bundled soundboard. It uses React, strict
TypeScript, Vite, Tauri 2, Supabase, and LiveKit.

The default local experience is fully interactive and needs no account or
credentials. Production integrations are present behind live mode and remain
protected by Supabase Row Level Security and a token-issuing Edge Function.

## Start locally

Prerequisites: Node.js, pnpm, Rust, and the platform dependencies required by
Tauri 2.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Open the Vite URL and choose **Enter the preview**. For the native window, run:

```sh
pnpm tauri dev
```

Mock mode is selected by `VITE_DATA_MODE=mock`; it never connects to Supabase
or LiveKit.

## Connect Supabase and LiveKit

1. Create a Supabase project and apply the migration in `supabase/migrations`.
2. Follow `supabase/admin/README.md` to assign the first admin and issue an
   invite. Plaintext invite codes are returned once and are never stored.
3. Deploy `supabase/functions/livekit-token` with JWT verification enabled.
4. Store `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` as managed
   Edge Function secrets.
5. Copy `.env.example` to an ignored `.env`, set the three public `VITE_*`
   service values, and change `VITE_DATA_MODE` to `live`.

Every `VITE_*` value is public in the compiled desktop renderer. Never place a
LiveKit secret or Supabase service-role key there.

## Checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm security:scan
pnpm tauri build
```

Database policy tests run through the Supabase CLI when local Supabase is
available. Edge Function unit tests run with Deno; see the backend README for
the exact command.

## Project memory

Read `AGENTS.md` before changing the repository. The current architecture lives
in `docs/architecture.md`, the approved scope in
`docs/plans/0001-bakbak-desktop-v1.md`, and every task appends its honest
handoff to `docs/progress.md`. That progress log is the one mandatory memory
file future work must update.
