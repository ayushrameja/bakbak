# Bakbak

Bakbak is a private desktop room for 5–10 friends: persistent text chat,
drop-in voice, desktop screen sharing, and a synchronized hosted soundboard with
account favorites and five-second member uploads from audio or video. Its Warm
Adda interface includes light/dark theming, in-app profile and media settings,
private member avatars, automation-only System rooms, safe link previews, local
RNNoise microphone cleanup, opt-in voice effects, and admin-managed ordinary
text and voice rooms. Bakbak 2 uses React, strict TypeScript, Vite, Tauri 2,
Rust, Supabase, and LiveKit. Electron remains temporarily buildable only as the
rollback shell until the installed `2.0.0` acceptance matrix passes.

The default local experience is fully interactive and needs no account or
credentials. Production integrations are present behind live mode and remain
protected by Supabase Row Level Security and a token-issuing Edge Function.

## Start locally

Pinned prerequisites are Node.js 22.23.1, pnpm 11.17.0, Rust 1.93.1, and Deno
2.7.10. Install the normal [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/),
including Xcode command-line tools on macOS or WebView2/MSVC on Windows.

Distributed builds support Apple Silicon Macs running macOS 12.3 or later and
Windows x64. Bakbak v0.4.0 is the final Intel Mac release; existing Intel
installations are not remotely disabled, but they do not receive later builds.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Open the Vite URL and choose **Enter the preview**. For the Tauri desktop window
with live reload, run:

```sh
pnpm tauri:dev
```

To create this host's unpacked local Tauri application without updater
metadata, run:

```sh
pnpm tauri:build:local
```

To create this host's supported DMG or NSIS artifacts, run `pnpm tauri:build`.
The `desktop:*` Electron commands are fallback-only and are removed after the
installed migration gate. GitHub is the only supported update-metadata channel.

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

For the Windows signed-update gate, manually dispatch that workflow with the
exact source SHA and enable **Windows update rehearsal**. This opt-in job builds
the tracked base version and its derived next patch from the same source, signs
and verifies both NSIS payloads, and uploads one private seven-day Actions
artifact. The kit contains both installers and signatures, a loopback-only
`latest.json`, SHA-256 provenance, the rehearsal config, and exact local test
instructions. It never creates a GitHub Release. Follow
`REHEARSAL-INSTRUCTIONS.txt` on the Windows test machine: serve the extracted
folder only on `127.0.0.1:41793`, install the base, and update through Bakbak
Settings. Generating the kit is not acceptance evidence; record the observed
installed base-to-next result before marking the update gate complete.

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
  Application picker backed by the supervised native sidecar. On macOS, grant
  Bakbak access under **System Settings → Privacy & Security → Screen & System
  Audio Recording** and relaunch after changing permission.
- macOS 14.2 or newer and supported Windows builds 20348 or newer can publish
  isolated screen/application audio. Entire-screen audio excludes Bakbak's
  proven process tree; application audio includes only the selected process
  tree. Missing process or isolation proof always falls back to video-only.
- macOS 12.3–14.1 remains supported for video-only sharing with a clear picker
  explanation. Windows also falls back to video-only until its WebView2 audio
  process relationship is proven.
- Presenters can choose 480p, 720p, or 1080p and 15, 30, or 60 fps before
  sharing and change those caps while a share is live.
- Browser and Linux clients do not publish or view shares in this phase.
- Protected or DRM-controlled content can be black or silent by operating
  system policy.

## Soundboard in Discord or Meet

External-call mode needs a virtual cable installed by the user: [BlackHole 2ch](https://github.com/ExistentialAudio/BlackHole)
on macOS or [VB-CABLE](https://vb-audio.com/Cable/) on Windows. Bakbak does not
bundle or silently install drivers.

In **Settings → Audio → External-call soundboard**, choose:

1. your physical microphone;
2. the cable playback/render endpoint;
3. the paired cable capture endpoint shown by the wizard; and
4. headphones for effect monitoring.

Use the meters, sound test, and short local recording before starting. Then
select the paired cable capture endpoint as the microphone in Discord, Meet, or
the other call app. Do not choose the cable as Bakbak's physical microphone or
headphone output; the wizard rejects feedback routes. Bakbak voice and external
mode cannot run together and always ask before switching. The mixer monitors
effects, never your live microphone, and stores/uploads/logs no microphone
samples. Aggressive call-app noise suppression may remove effects.

While external audio is live, **hold Cmd+Shift+B (Mac) or Ctrl+Shift+B
(Windows)** to open the sound wheel. Point at a sound, then release the shortcut
or left-click to play it and close the wheel. The first sound is selected by
default. Each page holds up to six sounds from one existing category: scroll up
for the next page and down for the previous page, with wraparound. The wheel
remembers your last category/page for this account and server. Selection ticks
play through your configured headphones only.

**Escape** or the top-right **X** cancels without playing. Switching to another
app also cancels. **Open sound wheel** in settings or **Show Soundboard** in the
tray opens click-to-play browsing. Closing the wheel keeps the microphone live;
**Stop mic** ends external mode. Keep Bakbak's external mode running while your
call app uses the cable; switch that app back to your physical microphone when
you stop external mode.

The wheel covers the monitor under your pointer and takes normal keyboard/mouse
focus. Use a borderless/windowed game for testing: system shortcuts, exclusive
fullscreen, and games that capture input independently may bypass it.

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
pnpm tauri:build
deno task --config supabase/deno.json check
deno task --config supabase/deno.json test
```

Rust changes also require format, clippy-with-warnings-denied, and tests for
`native/screen-share-helper`, `native/external-audio`, and `src-tauri`.
Database policy tests run through the Supabase CLI when local Supabase is
available: `supabase start --exclude vector`, then `supabase test db`.

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
larger bump. A manual workflow run can also choose the bump explicitly. The
version must be synchronized in `package.json`, the Tauri config, Cargo
manifest, and lockfile before the stabilization candidate is built and
accepted. Release automation verifies that tracked version and exact candidate
SHA without rewriting source. It also cryptographically verifies the renamed
Windows installer signature against the committed Tauri updater public key
before artifact upload and again before manifest generation. Existing GitHub
Releases can be reused only as drafts targeting that exact candidate. A
separate three-retry job also posts every verified stable release to `#releases`;
publication itself remains successful if announcement delivery needs a rerun.
The manual System history workflow imports stable releases oldest-first and is
idempotent by GitHub release ID.

Do not merge a stabilization pull request for automatic release until both
candidate artifacts from the same revision pass the installed friend-test
gate. The candidate workflow is deliberately separate because “publish first,
test later” is a thrilling plot device and a terrible release process.

The publish job requests `contents: write` only for the exact-SHA draft and its
verified assets. Version bumps use the ordinary protected-branch pull-request
path before candidate acceptance.

`2.0.0` is a one-time manual shell replacement: macOS users replace Bakbak from
the DMG, Windows users uninstall Electron Bakbak and install the Tauri NSIS, and
everyone signs in again. Before Supabase starts, Tauri performs a one-time local
generation reset; cloud data returns after login, but local drafts, layout,
cache, device preferences, and authentication are intentionally not migrated.

The release workflow builds one Apple Silicon DMG plus one Windows x64 NSIS
installer and rejects Intel assets. macOS is manual-install-only while ad-hoc
signed: there is no ZIP, updater entry, or promise of permission continuity.
Windows requires the updater private key, an NSIS `.exe.sig`, and a Windows-only
`latest.json`. After the initial manual install, Windows may update
automatically only after the installed `2.0.0 → 2.0.1` rehearsal passes. macOS
continues with manual DMG replacement for `2.0.1`.

Until that matrix passes, push-triggered releases stop at the workflow gate.
Set the non-secret repository variable `TAURI_2_ACCEPTANCE_MATRIX_SHA` to the
exact 40-character candidate commit only after the installed shell/product,
screen-share, external-audio, migration, and update matrices pass. A manual
dispatch requires the same exact SHA plus explicit confirmation. A newer commit
invalidates that evidence automatically. Electron stays in source until the
same revision-bound evidence authorizes removal.

Release builds require these GitHub Actions repository variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_LIVEKIT_URL`
- `VITE_BACKEND_REGION`
- `VITE_GIPHY_API_KEY`

Windows updater releases require `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; unsigned updater payloads are rejected.
The release job prepares the helper and renderer before those secrets exist,
then exposes them only to the conditional Windows Tauri packaging step. That
step consumes the prebuilt renderer with Tauri's `beforeBuildCommand` disabled;
the macOS job receives neither updater-signing secret. The optional private
update-rehearsal job uses the same boundary independently for its base and
next-patch packaging steps; its fixed insecure HTTP endpoint exists only in
`tauri.update-rehearsal.conf.json` and accepts loopback traffic only. System
release announcements additionally
require `BAKBAK_SYSTEM_EVENTS_SECRET`, matching the Supabase Function Secret.
Private values must remain backed up and must never be committed. Current macOS
builds are ad-hoc signed, and the Windows updater signature is not a substitute
for operating-system executable signing. Developer ID signing/notarization and
Windows code signing remain production blockers rather
than decorative paperwork wearing a lanyard.

## Project memory

Read `AGENTS.md` before changing the repository. The current architecture lives
in `docs/architecture.md`, the approved scope in
`docs/plans/0001-bakbak-desktop-v1.md` plus its numbered follow-up plans, and
every task appends its honest handoff to `docs/progress.md`. That progress log
is the one mandatory memory file future work must update.
