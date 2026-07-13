# Bakbak

Bakbak is a private desktop room for 5–10 friends: persistent text chat,
drop-in voice, desktop screen sharing, and a synchronized hosted soundboard. Its
Warm Adda interface includes light/dark theming, in-app profile and media
settings, private member avatars, and admin-managed text and voice rooms. It
uses React, strict TypeScript, Vite, Tauri 2, Supabase, and LiveKit.

The default local experience is fully interactive and needs no account or
credentials. Production integrations are present behind live mode and remain
protected by Supabase Row Level Security and a token-issuing Edge Function.

## Start locally

Prerequisites: Node.js, pnpm, Rust, and the platform dependencies required by
Tauri 2.

Distributed builds support Apple Silicon Macs running macOS 12.3 or later and
Windows x64. Bakbak v0.4.0 is the final Intel Mac release; existing Intel
installations are not remotely disabled, but they do not receive later builds.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Open the Vite URL and choose **Enter the preview**. For the native window, run:

```sh
pnpm tauri dev
```

To create a local macOS application bundle without release updater artifacts or
the protected updater signing key, run:

```sh
pnpm tauri:build:local
```

Signed updater artifacts are created only by the GitHub release workflow. A
plain `pnpm tauri build` still expects the updater private key because the main
Tauri configuration intentionally enables release updater artifacts.

Mock mode is selected by `VITE_DATA_MODE=mock`; it never connects to Supabase
or LiveKit.

## Connect Supabase and LiveKit

1. Create a Supabase project, link it with the current Supabase CLI, inspect
   `supabase db push --dry-run`, then run `supabase db push`. This applies the
   tracked migrations in order and records their migration history. The latest
   migration creates the private avatar bucket and admin channel RPCs, so apply
   it before using profile photos or channel management in live mode.
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

## Screen-share compatibility

- macOS 14 or later uses the native system picker and can include matched source
  audio when the checkbox is explicitly enabled. Grant Bakbak access under
  **System Settings → Privacy & Security → Screen & System Audio Recording** and
  relaunch after changing permission.
- macOS 12.3–13 and the current Windows build use a
  video-only WebView picker when available. Matched Windows process/display
  audio remains disabled until its native implementation and Windows CI matrix
  are complete.
- Browser and Linux clients do not publish or view shares in this phase.
- Protected or DRM-controlled content can be black or silent by operating
  system policy.

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
larger bump. A manual workflow run can also choose the bump explicitly. After
the installers and updater manifest are verified and the release is published,
the workflow opens and merges a small protected-branch-compatible PR that
synchronizes the released version in `package.json`, the Tauri configuration,
and the Rust package manifest and lockfile. That bot commit does not start
another release.

Because `main` requires pull requests, repository **Settings → Actions →
General → Workflow permissions** must allow GitHub Actions to create and
approve pull requests. The release job requests only the `contents: write` and
`pull-requests: write` permissions needed for its version-sync PR.

The release workflow builds one macOS Apple Silicon DMG plus one Windows x64
NSIS installer. It rejects Intel macOS assets and updater targets and keeps the
GitHub Release in draft state until both supported installers and the signed
`latest.json` updater manifest are present. Installed desktop clients check
that manifest shortly after launch and offer an explicit **Update and restart**
action. Existing `0.1.0` installations must install the first published
updater-enabled release manually once because they do not contain the updater.

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
`docs/plans/0001-bakbak-desktop-v1.md` plus its numbered follow-up plans, and
every task appends its honest handoff to `docs/progress.md`. That progress log
is the one mandatory memory file future work must update.
