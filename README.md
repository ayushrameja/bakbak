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

1. Create a Supabase project, link it with the current Supabase CLI, inspect
   `supabase db push --dry-run`, then run `supabase db push`. This applies the
   three tracked migrations in order and records their migration history.
2. Create a LiveKit Cloud project using its global endpoint. Store
   `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` only in Supabase
   Edge Function Secrets.
3. Deploy `supabase/functions/livekit-token` from this repository with JWT
   verification enabled; never pass `--no-verify-jwt`.
4. Follow `supabase/admin/README.md` to create and assign the first admin, then
   issue an invite. Plaintext invite codes are returned once and never stored.
5. Copy `.env.example` to an ignored `.env`, set the three public service
   values, and change `VITE_DATA_MODE` to `live`. Restart or rebuild after
   changing these values because Vite embeds them at build time.

Every `VITE_*` value is public in the compiled desktop renderer. Never place a
LiveKit secret or Supabase service-role key there.

For the internal rehearsal, email/password authentication remains enabled while
email confirmation may be disabled temporarily. Before external friend testing,
configure custom SMTP and re-enable confirmation.

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

## Desktop releases and updates

Bakbak uses SemVer and starts the updater-enabled release line at `0.2.0`.
Every merge to `main` publishes a patch release after validation unless the
pull request has `release:skip`; `release:minor` and `release:major` select a
larger bump. A manual workflow run can also choose the bump explicitly.

The release workflow builds macOS Apple Silicon and Intel DMGs plus a Windows
x64 NSIS installer. It keeps the GitHub Release in draft state until every
installer and the signed `latest.json` updater manifest are present. Installed
desktop clients check that manifest shortly after launch and offer an explicit
**Update and restart** action. Existing `0.1.0` installations must install
`0.2.0` manually once because they do not contain the updater.

Release builds require these GitHub Actions repository variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_LIVEKIT_URL`
- `VITE_BACKEND_REGION`

They also require `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as GitHub Actions secrets. The committed
public key verifies updates; the private key must remain backed up and must
never be committed. The current macOS builds remain ad-hoc signed and Windows
builds remain unsigned, so first-install operating-system warnings are expected
until Developer ID/notarization and Windows code signing are configured.

## Project memory

Read `AGENTS.md` before changing the repository. The current architecture lives
in `docs/architecture.md`, the approved scope in
`docs/plans/0001-bakbak-desktop-v1.md`, and every task appends its honest
handoff to `docs/progress.md`. That progress log is the one mandatory memory
file future work must update.
