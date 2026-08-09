# Bakbak

Bakbak is a private desktop room for 5–10 friends: persistent text chat,
drop-in voice, desktop screen sharing, and a synchronized hosted soundboard with
account favorites and five-second member uploads from audio or video. Its Warm
Adda interface includes light/dark theming, in-app profile and media settings,
private member avatars, automation-only System rooms, safe link previews, local
RNNoise microphone cleanup, opt-in voice effects, and admin-managed ordinary
text and voice rooms. It uses React, strict TypeScript, Vite, Electron, Supabase,
and LiveKit.

The default local experience is fully interactive and needs no account or
credentials. Production integrations are present behind live mode and remain
protected by Supabase Row Level Security and a token-issuing Edge Function.

## Start locally

Prerequisites: Node.js 22 and pnpm. Electron and its packaging tools are local
project dependencies; Rust and platform WebView toolchains are no longer used.

Distributed builds support Apple Silicon Macs running macOS 12.3 or later and
Windows x64. Bakbak v0.4.0 is the final Intel Mac release; existing Intel
installations are not remotely disabled, but they do not receive later builds.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Open the Vite URL and choose **Enter the preview**. For the desktop window with
live reload, run:

```sh
pnpm desktop:dev
```

To create an unpacked local application without publishing updater metadata,
run:

```sh
pnpm desktop:pack:local
```

To create this host's supported DMG/ZIP or NSIS artifacts, run
`pnpm desktop:build`. GitHub is the only supported place to publish update
metadata and the transitional signed payload consumed by existing Tauri
installations.

Before a stabilization release, add the `stabilization:candidate` label to the
ready pull request. The candidate workflow validates that exact PR-head commit,
runs the integrated renderer and native gates, and builds one Apple Silicon DMG
plus one Windows x64 NSIS installer. It uploads them as private GitHub Actions
artifacts for seven days, each with a `candidate-manifest.json` containing the
app version, full source revision, platform, and workflow run. Candidate builds
disable updater artifacts and never create or publish a GitHub Release. If the
PR head changes, discard the old artifacts and remove/re-add the label. Once
the workflow exists on `main`, it may also be dispatched manually with an exact
40-character commit SHA.

Mock mode is selected by `VITE_DATA_MODE=mock`; it never connects to Supabase
or LiveKit.

## Local cache and privacy

Live mode keeps a bounded, per-account IndexedDB read cache for the workspace,
the newest 200 messages in each visited channel or DM, and up to 256 MiB of
least-recently-used profile media plus 256 MiB of authenticated message/sticker
posters. Full videos, animated originals, and GIPHY assets are never stored
offline. It restores only after Supabase identifies
the signed-in user, then revalidates against RLS and Realtime. If Supabase is
temporarily unreachable, saved data remains visible in a clearly marked
read-only mode.

This cache remains on the computer after logout and relies on the operating
system account for protection; it is not application-encrypted. Use
**Settings → Data & storage → Clear cached data** to remove the current Bakbak
account's saved conversations, profile media, and message posters without
deleting cloud data, authentication settings, or device preferences.

## Connect Supabase and LiveKit

1. Create a Supabase project, link it with the current Supabase CLI, inspect
   `supabase db push --dry-run`, then run `supabase db push`. This applies the
   tracked migrations in order and records their migration history. Apply all
   migrations before distributing a renderer that uses rich profiles,
   channel-management RPCs, soundboard favorites, or member uploads.
2. Create a LiveKit Cloud project using its global endpoint. Store
   `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` only in Supabase
   Edge Function Secrets.
3. Deploy `supabase/functions/livekit-token` from this repository with JWT
   verification enabled; never pass `--no-verify-jwt`.
4. Deploy `supabase/functions/soundboard-manage` with JWT verification enabled.
   It uses platform-managed Supabase credentials; no service-role key belongs
   in a renderer environment file.
5. For rich messaging, deploy `supabase/functions/message-media-manage` and
   then `supabase/functions/sticker-manage`, both with JWT verification
   enabled. The additive rich-messaging migration must be applied first.
6. For System rooms and link cards, apply the plan 0027 migration, deploy
   `link-preview` with JWT verification and `system-events` with its dedicated
   function secret, then run the stable-release history workflow once. See the
   backend README for the safe rollout order.
7. Follow `supabase/admin/README.md` to create and assign the first admin, then
   issue an invite. Plaintext invite codes are returned once and never stored.
8. Copy `.env.example` to an ignored `.env`, set the public service values,
   optionally add the public GIPHY beta key to `VITE_GIPHY_API_KEY`, and change
   `VITE_DATA_MODE` to `live`. Without that key, the GIPHY picker explains why
   it is disabled; uploads and Bakbak stickers still work. Restart or rebuild
   after changing these values because Vite embeds them at build time.

Every `VITE_*` value is public in the compiled desktop renderer. Never place a
LiveKit secret or Supabase service-role key there.

## Screen-share compatibility

- Apple Silicon macOS 12.3 or later and Windows x64 use Bakbak's Entire screen /
  Application picker backed by Chromium desktop capture. Source audio can be
  requested and is published only when Chromium returns an audio track. On
  macOS, grant Bakbak access under **System Settings → Privacy & Security →
  Screen & System Audio Recording** and relaunch after changing permission.
- Electron requests Chromium's own-audio restriction, but the prototype no
  longer contains the former Rust process-tree capture proof. Treat echo and
  application-only audio isolation as an installed-client acceptance gate, not
  a guarantee made by the picker.
- Presenters can choose 480p, 720p, or 1080p and 15, 30, or 60 fps before
  sharing and change those caps while a share is live.
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
pnpm desktop:build
```

Database policy tests run through the Supabase CLI when local Supabase is
available. Edge Function unit tests run with Deno; see the backend README for
the exact command.

The locally bundled, reduced FFmpeg soundboard core and its reproducible Docker
recipe/license notices live under `third_party/ffmpeg-soundboard`. Maintainers
can rebuild the committed runtime assets with `pnpm ffmpeg:build`; ordinary app
setup does not rebuild FFmpeg. The Jitsi WebAssembly wrapper and Xiph.Org
RNNoise notices bundled with the local microphone processor live under
`public/vendor/rnnoise`.

## Desktop releases and updates

Bakbak uses SemVer and starts the updater-enabled release line at `0.2.0`.
Every merge to `main` publishes a patch release after validation unless the
pull request has `release:skip`; `release:minor` and `release:major` select a
larger bump. A manual workflow run can also choose the bump explicitly. After
the installers and updater metadata are verified and the release is published,
the workflow opens and merges a small protected-branch-compatible PR that
synchronizes the released version in `package.json`. That bot commit does not start
another release. A separate three-retry job also posts every verified stable
release to `#releases`;
publication itself remains successful if announcement delivery needs a rerun.
The manual System history workflow imports stable releases oldest-first and is
idempotent by GitHub release ID.

Do not merge a stabilization pull request for automatic release until both
candidate artifacts from the same revision pass the installed friend-test
gate. The candidate workflow is deliberately separate because “publish first,
test later” is a thrilling plot device and a terrible release process.

Because `main` requires pull requests, repository **Settings → Actions →
General → Workflow permissions** must allow GitHub Actions to create and
approve pull requests. The release job requests only the `contents: write` and
`pull-requests: write` permissions needed for its version-sync PR.

The release workflow builds one Apple Silicon DMG and ZIP plus one Windows x64
NSIS installer. It rejects Intel macOS assets and keeps the GitHub Release in
draft state until Electron's `latest-mac.yml` and `latest.yml` plus the signed
legacy `latest.json` are present. Electron clients use the YAML metadata for
future updates. The legacy JSON points existing Tauri clients at an Electron
`.app.tar.gz` on macOS and the same NSIS executable on Windows, preserving the
application identifier and release channel. On Windows, the Electron NSIS shim
keeps Tauri's `%LOCALAPPDATA%\Bakbak` install location, translates its passive
and restart arguments, and removes the obsolete Tauri uninstaller registration.
This bridge must pass installed `Tauri 1.6.0/latest -> first Electron release ->
later Electron release` rehearsals on both platforms before publication;
generating the files is not proof that either installer has completed that
surgery successfully.

Until that matrix passes, push-triggered releases stop at the workflow gate.
Set the non-secret repository variable `ELECTRON_MIGRATION_REHEARSED=true` only
after both installed paths pass, or explicitly confirm the equivalent checkbox
on a manual release run. The first Electron version must be greater than the
newest published Tauri tag.

Release builds require these GitHub Actions repository variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_LIVEKIT_URL`
- `VITE_BACKEND_REGION`
- `VITE_GIPHY_API_KEY`

The transitional first Electron release also requires the existing
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub
Actions secrets solely to sign the payload accepted by older Tauri clients; no
Tauri runtime or Rust code remains. System release announcements additionally
require `BAKBAK_SYSTEM_EVENTS_SECRET`, matching the Supabase Function Secret.
Private values must remain backed up and must never be committed. Current macOS
builds are ad-hoc signed and Windows builds are unsigned, so Developer ID
signing/notarization and Windows code signing remain production blockers rather
than decorative paperwork wearing a lanyard.

## Project memory

Read `AGENTS.md` before changing the repository. The current architecture lives
in `docs/architecture.md`, the approved scope in
`docs/plans/0001-bakbak-desktop-v1.md` plus its numbered follow-up plans, and
every task appends its honest handoff to `docs/progress.md`. That progress log
is the one mandatory memory file future work must update.
