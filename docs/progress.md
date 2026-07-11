# Bakbak progress log

This is the repository's single canonical chronological work log. Every task
that changes the repository appends an entry before handoff. Do not rewrite old
entries; append a correction if earlier information becomes inaccurate.

Current architecture belongs in `docs/architecture.md`. Approved scope and
phase completion belong in `docs/plans/0001-bakbak-desktop-v1.md`. Do not create
competing task-status, session, or handoff logs.

## 2026-07-11 — Scaffold and durable project memory

- **Completed:** Created the official Tauri 2 React + TypeScript + Vite scaffold
  with pnpm. Enabled strict TypeScript through the scaffold configuration. Added
  the repository working agreement, approved desktop-v1 plan, current
  architecture source of truth, and this append-only work log.
- **Decisions:** `docs/progress.md` is the one file every repository-changing
  task must update. `docs/architecture.md` changes only when the current system
  or setup changes, and plan checkboxes change only when their acceptance
  criteria are verified. Real secrets stay out of renderer bundles and source
  control.
- **Validation:**
  - Repository structure, `package.json`, strict TypeScript configuration, and
    Tauri configuration were inspected.
  - Dependency compatibility and automated commands have not yet been recorded
    as passing. No lint, format, test, renderer build, or Tauri bundle result is
    claimed by this entry.
- **Documentation updated:** Added `AGENTS.md`,
  `docs/plans/0001-bakbak-desktop-v1.md`, `docs/architecture.md`, and
  `docs/progress.md`.
- **Known limitations:** The renderer remains the generated starter UI. The
  Bakbak feature structure, mock rooms, product shell, Supabase backend,
  LiveKit voice, text chat, and soundboard are not implemented. Generated
  desktop metadata and security configuration still require review.
- **Next:** Finish Phase 1 by implementing the Bakbak desktop shell and local
  mock interactions, completing tooling/environment setup, adding foundation
  tests, running all applicable checks, and appending their exact results.

## 2026-07-11 — Desktop v1 implementation and macOS build

- **Completed:** Replaced the starter with the Bakbak product shell and local
  preview; added feature-first auth, channels, chat, voice, soundboard, server,
  and settings code; added Supabase authentication/data/Realtime adapters;
  added the schema, least-privilege grants, RLS, hashed single-use invites,
  operator bootstrap workflow, deterministic rooms, and message publication;
  added a protected five-minute LiveKit token function; implemented voice
  join/leave, device selection, mute/deafen, participant/speaking state,
  per-user volume, reconnect/error handling, and reliable sound-ID dispatch;
  generated Bakbak desktop icons; and produced an unsigned macOS app and DMG.
- **Decisions:** The app falls back safely to mock mode when live public
  configuration is absent. Signup happens before invite redemption, and a
  signed-in account without membership sees a dedicated invite gate. Invite
  plaintext is returned once to an operator and only its SHA-256 hash is stored.
  LiveKit room, identity, grants, and TTL are server-derived. The initial sound
  pack uses deterministic bundled Web Audio recipes so v1 has no uploads,
  external assets, or licensing ambiguity. `docs/progress.md` remains the one
  mandatory file every future task appends.
- **Validation:**
  - `pnpm check` — passed Prettier, ESLint, strict TypeScript, 45 Vitest tests,
    the Vite production build, and compiled-artifact secret scanning.
  - `deno task --config supabase/deno.json check` — passed lint and type checks
    for all Edge Function code.
  - `deno task --config supabase/deno.json test` — 8/8 request, authorization,
    token-TTL, room-grant, microphone-only, and data-permission tests passed.
  - `cargo check --manifest-path src-tauri/Cargo.toml` — passed after Cargo
    dependencies were downloaded.
  - `pnpm tauri build` — passed outside the restricted sandbox; produced
    `Bakbak.app` and `Bakbak_0.1.0_aarch64.dmg`. The first sandboxed attempt
    built the app but could not run Apple's disk-image tooling.
  - In-app browser smoke test — visually checked welcome, full desktop shell,
    compact desktop layout, chat send/clear, channel switching, voice join and
    leave, mute/deafen, settings, soundboard dispatch, and sign-out. No browser
    warnings or errors were recorded.
  - `strings` scan of the macOS executable — no `LIVEKIT_API_SECRET`,
    `SUPABASE_SERVICE_ROLE_KEY`, or `sb_secret_` marker found.
  - Supabase pgTAP suites — not run: the Supabase CLI is unavailable and the
    local Docker/Colima daemon is not running. The admin/member/non-member SQL
    tests are present under `supabase/tests/database`.
- **Documentation updated:** Replaced the scaffold README; updated current
  architecture, implemented plan criteria, backend/operator setup, environment
  contract, security model, validation strategy, and this canonical log.
- **Known limitations:** No real Supabase or LiveKit project was configured, so
  hosted auth/invite flows, persistent two-client chat, two-person voice,
  reconnect, device changes, and synchronized playback still need the manual
  macOS friend-test matrix. The generated macOS artifacts are unsigned and
  unnotarized. The production renderer emits a non-blocking large-chunk warning
  (about 283 kB compressed) from the Supabase and LiveKit SDKs.
- **Next:** Start a local or hosted Supabase stack, run the migrations and
  pgTAP suites, bootstrap the first admin, deploy the token function, configure
  LiveKit, execute the two-client macOS acceptance matrix, then decide whether
  the first friend-test build is ready for distribution.

## 2026-07-11 — Live-service readiness and local policy validation

- **Completed:** Aligned client invite validation with the backend's real
  `BK` plus 32-hex format; fixed an ambiguous invite-redemption conflict target
  found by database lint; attached and cleaned up subscribed LiveKit audio;
  added autoplay recovery, safe microphone-switch errors, and all-audio Deafen
  behavior; cancelled stale or signed-out connection attempts before microphone
  publication; added focused tests; configured the macOS microphone purpose
  string, audio-input entitlement, hardened runtime, and ad-hoc signing; started
  a local Supabase stack and passed the complete schema, invite, and RLS suites.
- **Decisions:** Deafen stops remote speech and active/future soundboard
  rendering on that client while still publishing outbound sound events, with
  no replay after undeafening. Remote media elements are owned by a small
  teardown boundary. The undeployed migration now targets
  `memberships_pkey` explicitly so PL/pgSQL output variables cannot make the
  conflict target ambiguous. The first hosted admin will be created through the
  Supabase dashboard after migrations, then promoted with the documented SQL.
  Voice joins own their local room and use generation checks after every async
  boundary, while mute, Deafen, and device changes wait for a stable connection.
- **Validation:**
  - Initial `supabase db lint --local` — reported SQLSTATE `42702`, ambiguous
    `server_id` in `redeem_invite_code`; corrected before hosted deployment.
  - Initial `supabase test db` — failed 6/12 invite assertions because of that
    ambiguity; schema and RLS files passed.
  - `supabase db reset` after the correction — passed all three migrations and
    seed data from a clean database.
  - `supabase db lint --local` after the correction — passed with no schema
    errors.
  - `supabase test db` after the correction — 48/48 pgTAP assertions passed
    across schema, invite, and admin/member/non-member RLS behavior.
  - `pnpm check` — passed Prettier, ESLint, strict TypeScript, 70 Vitest tests
    across 11 files, the Vite production build, and compiled-artifact secret
    scanning; the existing large-chunk warning remains non-blocking.
  - `deno task --config supabase/deno.json check` — passed lint and type checks.
  - `deno task --config supabase/deno.json test` — 8/8 Edge Function tests
    passed.
  - `pnpm tauri build` — the sandboxed run built and signed the app but failed
    at Apple's DMG tooling; the approved host run passed and produced the
    ad-hoc-signed app and ARM64 DMG.
  - `codesign --verify --deep --strict --verbose=4` — passed; the release app
    contains the expected microphone purpose string and
    `com.apple.security.device.audio-input` entitlement.
  - `pnpm security:scan` and a direct executable marker scan — passed with no
    forbidden service-role or LiveKit secret material found.
  - In-app browser mock safety smoke — Mute and Deafen were disabled while a
    join was connecting; signing out before that join settled returned to the
    welcome screen and produced no new console logs.
  - `git diff --check` — passed.
- **Documentation updated:** Updated current architecture, hosted/local setup,
  first-admin bootstrap, the Phase 2 policy-test criterion, and this canonical
  log.
- **Known limitations:** Hosted Supabase and LiveKit creation, managed secrets,
  migration/function deployment, live `.env`, admin bootstrap, and the
  native-plus-browser rehearsal are not complete because both available service
  dashboard sessions require the user to sign in. The real macOS microphone
  permission prompt and capture remain untested. Colima required excluding the
  optional vector container, and the current Supabase config emits a deprecated
  `inbucket` warning. Developer ID signing/notarization and a real two-Mac friend
  test remain deferred.
- **Next:** Sign in to Supabase and LiveKit Cloud, create the friend-test
  projects, deploy the tracked migrations and protected token function, add only
  public renderer values to ignored `.env`, bootstrap the admin/invite, then run
  and record the one-Mac native-plus-browser rehearsal without marking the real
  two-person voice or synchronized-soundboard criteria complete.

## 2026-07-11 — Dashboard-session limitation recorded

- **Completed:** Recorded the current limitation affecting hosted Supabase and
  LiveKit setup: the embedded browser has no authenticated dashboard session.
- **Decisions:** Perform dashboard-only actions (service login, project setup,
  managed secrets, migrations/function deployment, and live verification) in
  the user's signed-in Arc session. This does not affect Bakbak's desktop
  runtime; it only blocks operator dashboard work in the embedded browser.
- **Validation:** Inspected the current architecture, active plan, canonical
  progress log, and working tree. No hosted-service action or automated check
  was run in this documentation-only task.
- **Documentation updated:** `docs/progress.md`.
- **Known limitations:** Hosted Supabase and LiveKit remain unverified until
  the operator completes the dashboard setup in Arc.
- **Next:** In Arc, sign in to Supabase and LiveKit Cloud, then continue the
  documented hosted setup and one-Mac native-plus-browser rehearsal.

## 2026-07-11 — Configure the local renderer for live services

- **Completed:** Replaced the ignored root `.env.local` with the four
  renderer-visible variables Bakbak expects and switched `VITE_DATA_MODE` from
  `mock` to `live`. Derived the public Supabase project URL from the existing
  JWKS URL, mapped the Supabase publishable key to the current client variable,
  mapped the public LiveKit URL, and removed backend-only credentials from the
  renderer environment file.
- **Decisions:** Keep `.env.local` limited to public `VITE_*` values. LiveKit
  signing credentials remain reserved for Supabase-managed Edge Function
  secrets and are never exposed to the renderer bundle.
- **Validation:**
  - Environment-name inspection — passed: exactly `VITE_DATA_MODE`,
    `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_LIVEKIT_URL` are
    present; values were not printed.
  - `git check-ignore -v .env.local` — passed; the local file remains ignored.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 70 Vitest tests,
    the Vite live-mode production build, and compiled-artifact secret scanning.
    The existing non-blocking large-chunk warning remains.
- **Documentation updated:** `docs/progress.md`.
- **Known limitations:** Hosted migrations, Edge Function deployment, managed
  LiveKit secrets, admin bootstrap, and multi-client acceptance remain
  unverified.
- **Next:** Complete Supabase/LiveKit hosted deployment, bootstrap the first
  admin and invite, then run the Arc-plus-macOS friend-test matrix.

## 2026-07-11 — Deploy hosted Supabase backend

- **Completed:** Authenticated the Supabase CLI through the user's Arc session,
  linked the checkout to the hosted `bakbak` project, previewed and deployed
  all three tracked migrations, and deployed the protected `livekit-token`
  Edge Function.
- **Decisions:** Applied only tracked migration files so hosted migration
  history remains authoritative. No hosted users were created before the
  profile trigger existed. The LiveKit function was deployed before managed
  secrets; Supabase exposes newly added function secrets without requiring a
  redeploy.
- **Validation:**
  - `supabase projects list` — passed; the linked project is `bakbak` in Canada
    Central.
  - `supabase db push --dry-run` — passed and listed only migrations
    `202607110001`, `202607110002`, and `202607110003`.
  - `supabase db push` — passed; all three migrations applied successfully.
  - `supabase migration list` — passed; all three local and remote migration
    versions match.
  - Initial `supabase functions deploy livekit-token` — failed because the
    local bundler did not produce its temporary `output.eszip` file.
  - `supabase functions deploy livekit-token --use-api` — passed; function
    version 1 is active.
  - `supabase secrets list` — passed and returned no configured secrets.
- **Documentation updated:** `docs/architecture.md` and `docs/progress.md`.
- **Known limitations:** `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and
  `LIVEKIT_API_SECRET` still need to be added as hosted Edge Function secrets.
  No hosted admin, invite, or second test account exists yet, and the
  Arc-plus-macOS acceptance matrix has not run.
- **Next:** Add the three managed LiveKit secrets, create the first hosted Auth
  user, promote that profile to admin, issue one invite, create the second user
  through Bakbak, and run the two-client acceptance checks.

## 2026-07-11 — Add local Edge Function secret template

- **Completed:** Created the ignored `supabase/functions/.env.local` file with
  placeholders for `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`.
- **Decisions:** Kept real values out of the repository and out of chat. The
  file is only a local handoff template for loading managed Edge Function
  secrets; it is not used by the desktop renderer.
- **Validation:**
  - `git check-ignore -v supabase/functions/.env.local` — passed; the file is
    ignored by the repository's `.env.*` rule.
  - Placeholder/name inspection — passed; only the three documented variable
    names and placeholders are present.
- **Documentation updated:** `docs/progress.md`.
- **Known limitations:** The placeholders still need to be replaced locally
  with the user's LiveKit values and uploaded to Supabase Edge Function
  secrets. No real secret was added or tested.
- **Next:** Replace the placeholders locally, then upload and verify the three
  managed secrets before creating test accounts.

## 2026-07-11 — Bootstrap hosted friend-test accounts

- **Completed:** Uploaded the three ignored LiveKit values to Supabase-managed
  Edge Function secrets, confirmed the hosted profile trigger created both test
  profiles, assigned the first profile as server admin and the second as a
  member, and recorded the admin as creator of the default Bakbak server.
- **Decisions:** Used the two dashboard-created accounts directly for the first
  Arc-plus-macOS media rehearsal. Invite issuance and redemption remain a
  separate manual acceptance check; no plaintext invite was written to the
  repository or task log.
- **Validation:**
  - `supabase secrets set --env-file supabase/functions/.env.local` — passed.
  - `supabase secrets list` — passed; `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and
    `LIVEKIT_API_SECRET` are present alongside Supabase-managed defaults.
  - Linked profile query — passed; both supplied Auth UUIDs have corresponding
    `public.profiles` rows created by the trigger.
  - Linked membership transaction — passed; the default server has one `admin`
    and one `member` matching the supplied profiles.
  - Unauthenticated hosted `livekit-token` POST — returned HTTP 401 as required
    by the JWT gate.
- **Documentation updated:** `docs/architecture.md` and `docs/progress.md`.
- **Known limitations:** An authenticated LiveKit token, real microphone audio,
  Realtime text chat, synchronized soundboard playback, reconnect behavior, and
  invite redemption have not yet been verified across two clients.
- **Next:** Sign in as the two test users in Arc and the macOS app, run the
  Phase 4 acceptance matrix, and record each observed result without marking
  untested criteria complete.

## 2026-07-11 — Launch hosted two-client rehearsal

- **Completed:** Revalidated the live-mode renderer and launched the Tauri
  development app with its shared Vite server at `http://localhost:1420` for an
  isolated Arc login session.
- **Decisions:** Use the admin account in the native app and the member account
  in Arc for the first rehearsal. Both accounts were assigned membership
  directly; this session does not count as invite-redemption acceptance.
- **Validation:**
  - `pnpm check` — passed formatting, lint, strict TypeScript, 70 Vitest tests,
    the live Vite production build, and compiled-artifact secret scanning. The
    existing non-blocking large-chunk warning remains.
  - `git diff --check` — passed.
  - `pnpm tauri dev` — passed startup; Vite is serving on port 1420 and the
    native debug application launched successfully.
- **Documentation updated:** `docs/progress.md`.
- **Known limitations:** The two-client chat, microphone, voice, soundboard,
  reconnect, and device controls are ready for user observation but have not
  yet been claimed as passing.
- **Next:** Complete the Arc-plus-macOS acceptance sequence and report exact
  successes or errors for the canonical log.

## 2026-07-11 — Fix live presence and add voice relay fallback

- **Completed:** Replaced the static member status with server-scoped Supabase
  Realtime Presence, added private Presence authorization by server membership,
  and added one relay-only LiveKit retry after a peer-connection/ICE failure.
  The final voice error now distinguishes successful signaling from blocked
  TURN/TLS media connectivity.
- **Decisions:** Presence uses a private topic and is an ephemeral UI hint, not
  an authorization source. A unique session key supports the same user being
  connected on multiple devices. Voice retries relay only for peer-connection
  failures and never retries rejected credentials or cancelled joins.
- **Validation:**
  - Reported browser trace — token issuance and LiveKit signaling reached India
    West; failure occurred during ICE peer-connection establishment. The
    `about:webrtc` diagnostic is Firefox-specific, and the rejected Cloudflare
    cookie is unrelated to media connectivity.
  - Focused Presence and voice tests — 7/7 passed.
  - `supabase db reset` — passed all four migrations from a clean local database.
  - `supabase db lint --local` — passed with no schema errors.
  - `supabase test db` — 53/53 schema, invite, RLS, and Presence authorization
    assertions passed.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 73 Vitest tests,
    the live production build, and compiled-artifact secret scanning. The
    existing non-blocking large-chunk warning remains.
  - Hosted migration dry run — listed only
    `202607110004_private_presence.sql`.
  - Hosted `supabase db push` and migration-list verification — passed; local
    and remote migration versions `001` through `004` match.
- **Documentation updated:** `docs/architecture.md`, `supabase/README.md`, and
  `docs/progress.md`.
- **Known limitations:** Real Presence sync still needs observation with both
  clients. Relay-only retry cannot bypass a device, VPN, DNS filter, or firewall
  that blocks `*.turn.livekit.cloud` on TCP 443. The reported browser should be
  retested in actual Arc/Chrome because the supplied console trace came from
  Firefox.
- **Next:** Relaunch both clients, confirm both members become online, and retry
  Lounge in Arc. If relay also fails, test without VPN/Private Relay and verify
  TURN/TLS access before marking voice acceptance complete.

## 2026-07-11 — Install latest live macOS build

- **Completed:** Stopped the development session, created fresh macOS app and
  DMG release bundles from the current live-mode working tree, replaced the
  existing `/Applications/Bakbak.app`, and launched the installed application.
- **Decisions:** Kept the existing local friend-test release model: the app is
  ad-hoc signed for this Mac and uses the ignored live Supabase and LiveKit
  renderer configuration. Developer ID signing and Apple notarization remain a
  later distribution concern.
- **Validation:**
  - `pnpm tauri build` — passed; built `Bakbak.app` and
    `Bakbak_0.1.0_aarch64.dmg`. The existing non-blocking renderer chunk-size
    warning remains, and notarization was skipped because distribution
    credentials are not configured.
  - `codesign --verify --deep --strict --verbose=4
src-tauri/target/release/bundle/macos/Bakbak.app` — passed.
  - `pnpm security:scan` — passed for `dist` and the Tauri release bundle.
  - Installed executable SHA-256 comparison — passed; the source bundle and
    `/Applications/Bakbak.app` executables are identical.
  - `codesign --verify --deep --strict --verbose=4
/Applications/Bakbak.app` — passed.
  - Installed bundle version check — passed; version is `0.1.0`.
  - `open /Applications/Bakbak.app` — passed.
  - `pnpm format:check` — passed after formatting this entry.
  - `git diff --check` — passed.
- **Documentation updated:** `docs/progress.md`.
- **Known limitations:** This local build is ad-hoc signed and not notarized, so
  it is suitable for local testing but not yet a polished public distribution.
  The Presence and relay-fallback changes still need two-client observation.
- **Next:** Test the installed app against Arc: confirm both members become
  online, join Lounge from both clients, then verify microphone and soundboard
  playback.

## 2026-07-11 — Replace isolated Presence and polish chat UI

- **Completed:** Replaced the private-channel Presence implementation that
  showed only the current client with membership-checked database heartbeats,
  RLS-filtered heartbeat reads, Postgres Realtime refreshes, and automatic stale
  client expiry. Deployed migration `005` to the hosted project. Added a soft
  incoming-message tone, background-channel unread emphasis, and read clearing
  when a channel opens. Removed the duplicate rail avatar, fake typing status,
  and decorative controls for servers, channel creation, help, notifications,
  pins, search, attachments, soundboard, and emoji. Rebuilt, installed, and
  launched the updated native app; the existing Bakbak Vite process remains
  available for Arc on port 1420.
- **Decisions:** Used the proven Postgres Realtime path already carrying chat
  messages instead of continuing with Supabase Presence sessions that were
  isolated in the two observed clients. Heartbeats run every 20 seconds and
  expire after 55 seconds. The RPC derives the user and database timestamp so
  renderer clients cannot forge rows. Message sounds are synthesized with Web
  Audio, avoiding another binary asset, and are armed on the first user gesture
  to respect autoplay rules. Unread state is intentionally session-local in v1.
- **Validation:**
  - User screenshots — confirmed persistent two-client chat and reproduced the
    online-status defect: each client showed only itself online.
  - Focused renderer tests — passed as part of the 13-file, 78-test suite.
  - `pnpm typecheck` and `pnpm lint` — passed before database deployment.
  - `pnpm dlx supabase@latest db reset` — passed all five migrations from a
    clean local database.
  - `pnpm dlx supabase@latest db lint --local` — passed with no schema errors.
  - `pnpm dlx supabase@latest test db` — passed 59/59 schema, invite, RLS, and
    heartbeat assertions.
  - Hosted migration dry run — listed only
    `202607110005_presence_heartbeats.sql`.
  - Hosted database push and migration-list verification — passed; local and
    remote versions `001` through `005` match.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 78 Vitest tests,
    the live production build, and compiled-artifact secret scanning. The
    existing non-blocking large-chunk warning remains.
  - `pnpm tauri build` — the signed app bundle succeeded, but the optional DMG
    wrapper failed without a diagnostic after app signing.
  - `pnpm tauri build --bundles app` — passed; the ad-hoc-signed macOS app
    bundle was created successfully.
  - Source and installed bundle signature verification, secret scan, and
    executable SHA-256 comparison — passed.
  - Installed app launch — passed.
  - Targeted Prettier write including SQL files — returned exit code 2 because
    this repository has no SQL parser; supported files were formatted and the
    later full `pnpm format:check` passed.
  - Fresh `pnpm dev` attempt — failed because the existing Bakbak Vite process
    already owns port 1420; its workspace and HTTP 200 response were verified,
    so it was preserved instead of terminated.
  - `open -a Arc http://localhost:1420` — passed.
- **Documentation updated:** `docs/architecture.md`,
  `docs/plans/0001-bakbak-desktop-v1.md`, `supabase/README.md`, and
  `docs/progress.md`.
- **Known limitations:** The new cross-client heartbeat display, notification
  tone, and unread clearing still require observation with the signed-in Arc and
  native accounts. A closed client can remain online for at most 55 seconds by
  design. Unread state does not persist across restart. The DMG wrapper failure
  remains unexplained; local app installation is unaffected.
- **Next:** Reload Arc at `http://localhost:1420`, keep the installed app open,
  and verify both members appear online within one heartbeat cycle. Then send a
  message to `#random` while viewing `#general` and confirm the tone plus bold
  unread channel, followed by read clearing when `#random` opens.

## 2026-07-11 — Add voice video, routed output, and room occupancy

- **Completed:** Added locally remembered microphone, speaker, and camera
  selectors; capability-aware speaker routing for incoming LiveKit audio and
  the bundled soundboard; explicit 720p camera publication; local and remote
  participant video tiles; camera controls in the room and persistent voice
  dock; pre-join and sidebar voice-room occupants with elapsed timers; and
  database-backed voice sessions layered onto the existing online heartbeat.
  Added macOS camera purpose text and entitlement. Deployed hosted migration
  `006`, deployed the updated LiveKit token function, built and installed the
  signed application, restarted the Arc development client, and opened both
  clients for testing.
- **Decisions:** Camera remains off until the user explicitly enables it. The
  selected speaker applies to call audio and soundboard playback, while chat
  alerts stay on system output. Device IDs use the validated local-only key
  `bakbak.devicePreferences.v1` and never sync to Supabase. The new
  `heartbeat_presence_v2` RPC derives identity and join time from Postgres,
  validates membership and voice-channel ownership, and preserves join time
  across heartbeats. The original RPC remains compatible with older installed
  clients and clears voice state. Tokens permit only microphone, camera, and
  data publication; screen sharing remains forbidden.
- **Validation:**
  - `pnpm check` — passed formatting, lint, strict TypeScript, 17 Vitest files
    with 91 tests, the production renderer build, and the compiled-artifact
    secret scan. The existing non-blocking large-chunk warning remains.
  - `pnpm dlx supabase@latest db reset` — passed all six migrations from a
    clean local database.
  - `pnpm dlx supabase@latest db lint --local --schema public,private` — passed
    with no Bakbak schema errors. Restricting the schemas avoids linting pgTAP's
    own extension functions after the test extension is installed.
  - `pnpm dlx supabase@latest test db` — passed all 71 schema, invite, RLS,
    online-presence, and voice-presence assertions.
  - `deno task --config supabase/deno.json check` — passed.
  - `deno task --config supabase/deno.json test` — passed all 8 Edge Function
    tests, including microphone/camera/data grants and screen-share denial.
  - Hosted migration dry run — listed only
    `202607110006_voice_presence.sql`.
  - Hosted database push and migration-list verification — passed; local and
    remote versions `001` through `006` match.
  - Default `functions deploy livekit-token` — failed twice because Supabase
    CLI 2.109.1 lost its temporary `output.eszip`; the code had already passed
    Deno validation. `functions deploy livekit-token --use-api` — passed using
    Supabase's server-side bundler.
  - Unauthenticated hosted `livekit-token` POST — returned HTTP 401, preserving
    the JWT gate after deployment.
  - `pnpm tauri build --bundles app` — passed and produced the ad-hoc-signed
    macOS application.
  - Source bundle signature, camera/microphone usage strings, camera/audio
    entitlements, and post-bundle secret scan — passed.
  - Installed `/Applications/Bakbak.app` signature and version checks — passed;
    version is `0.1.0`.
  - Built and installed executable SHA-256 comparison — passed; both hashes are
    `07e8569ffb6b197a6fa22972a9d26c20afdd9cdb1437593a880eb2cf1e20d2e4`.
  - Fresh `pnpm dev` — passed; Arc's live client returns HTTP 200 on
    `http://localhost:1420`, and both Arc and the installed app were launched.
- **Documentation updated:** `docs/architecture.md`,
  `docs/plans/0001-bakbak-desktop-v1.md`,
  `docs/plans/0002-voice-video-and-presence.md`, `supabase/README.md`, and
  `docs/progress.md`.
- **Known limitations:** The final two-account Arc-plus-macOS test requires
  human observation and is not marked complete. It must confirm cross-client
  occupancy/timers, microphone/output/camera switching, both video feeds,
  mute/deafen, soundboard routing, reconnect, graceful leave, and 55-second
  crash expiry. Speaker selection correctly falls back to “System output only”
  in runtimes without `setSinkId`. The app remains ad-hoc signed and unnotarized.
- **Next:** Use the admin account in one client and friend account in the other,
  join Lounge from one side first to confirm pre-join occupancy, then join from
  the second side and run the media/device/reconnect/expiry checklist. Record
  the observed results before closing plan `0002`.

## 2026-07-11 — Repair chat layout and streamline the private room UI

- **Completed:** Repaired the desktop grid so the chat composer stays pinned to
  the bottom of the window and the member panel fills the remaining height.
  Removed the unused server/DM rail, simplified the sign-in experience to one
  centered private-room card, and added light Nahan/Hinglish copy in the mock
  experience. Added a hover/focus connection detail that measures a Supabase
  Auth health round trip every 30 seconds, labels the deployed Supabase backend
  as Canada Central (`ca-central-1`), and separately identifies the observed
  LiveKit voice region as India West.
- **Decisions:** Kept backend and voice status distinct: API latency is not
  presented as voice latency. Made the backend region a public
  `VITE_BACKEND_REGION` label with the deployed region as the default, so a
  future backend move changes the label without leaking any secret. Deferred
  the server rail until multi-server navigation is actually in scope. Local
  jokes appear only in friendly, non-critical copy; authentication, errors,
  and voice controls remain direct.
- **Validation:**
  - `pnpm test -- ConnectionStatus.test.tsx ChannelSidebar.test.tsx` — passed;
    18 files and 93 tests passed.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 18 Vitest files
    with 93 tests, production renderer build, and compiled-artifact secret
    scan. The existing non-blocking large-chunk warning remains.
  - `pnpm tauri build` — completed the renderer build and Rust compilation but
    did not return a final bundle result in the terminal capture.
  - `pnpm tauri build --bundles app` — passed; produced an ad-hoc-signed macOS
    `Bakbak.app`. Notarization was skipped because Apple distribution
    credentials are not configured.
  - Local mock visual check at `http://127.0.0.1:1421` — passed: the composer
    bottom was 27 px above a 720 px viewport and the member panel ran from the
    67 px header to the viewport bottom. The simplified sign-in and chat
    layouts rendered with the rail removed. The browser harness did not expose
    a synthetic CSS hover state, but the connection detail content is present
    in the accessible DOM and covered by its component test.
  - `git diff --check` — passed.
- **Documentation updated:** `.env.example`, `docs/architecture.md`,
  `docs/plans/0001-bakbak-desktop-v1.md`, and `docs/progress.md`.
- **Known limitations:** The top-bar voice entry identifies the last observed
  India West signaling region and connected/standby state; it does not yet
  expose a LiveKit media RTT. The full native friend-test acceptance sequence
  for presence, voice, video, devices, reconnect, and soundboard remains open.
- **Next:** Relaunch the installed app for a human two-account friend-test;
  verify the connection detail in live mode and record the actual API and media
  behavior alongside the existing voice/video acceptance checklist.

## 2026-07-11 — Add versioned desktop releases and signed updates

- **Completed:** Advanced the approved distribution scope to macOS and Windows,
  synchronized the tracked application version at `0.2.0`, added tested SemVer
  resolution and manifest verification scripts, and added pull-request CI plus
  a serialized release workflow. The release matrix builds macOS Apple Silicon,
  macOS Intel, and Windows x64 NSIS installers, keeps releases in draft state
  until every installer and updater target is verified, and then publishes the
  release as latest. Added the Tauri updater and process plugins, minimal
  updater/restart capabilities, signed updater artifacts, a public GitHub
  Releases endpoint, passive Windows installation, and a global update notice
  that checks automatically but requires an explicit Update and restart action.
- **Decisions:** Git tags and published releases are the release source of
  truth; `0.2.0` is the first-release floor and later CI builds inject their
  calculated version without bot commits. Merged changes default to a patch;
  `release:minor`, `release:major`, and `release:skip` labels control exceptions.
  Installation remains user-confirmed so Bakbak does not interrupt an active
  conversation. The first updater keypair was discarded before use when the
  pnpm wrapper echoed its generated password; a fresh password-protected pair
  was generated through the underlying Tauri binary, and only its public key is
  present in the repository.
- **Validation:**
  - `pnpm exec vitest run src/features/settings/AppUpdateNotice.test.tsx` —
    passed; both updater UI tests passed.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 19 Vitest files
    with 95 tests, four Node release-script tests, version synchronization,
    production renderer build, and compiled-artifact secret scanning. The
    existing non-blocking large-chunk warning remains.
  - `cargo check --locked --manifest-path src-tauri/Cargo.toml` — passed with
    the updater and process plugins locked.
  - Workflow YAML parse, representative patch/minor/skip calculations, and
    `git diff --check` — passed. `actionlint` is not installed, so the workflows
    have not yet been executed by GitHub Actions.
  - `pnpm tauri build` with the updater signing key — compiled and signed the
    `0.2.0` macOS app, then failed in the local DMG wrapper with the repository's
    existing diagnostic-free `bundle_dmg.sh` error.
  - `pnpm tauri build --bundles app` with the updater signing key — passed and
    produced the ad-hoc-signed `Bakbak.app`, `Bakbak.app.tar.gz`, and its 404-byte
    updater signature. Code-sign verification, bundle version checks, and the
    post-bundle secret scan passed.
  - GitHub Actions variable and label configuration — failed because the active
    GitHub CLI credentials are invalid/read-only. Updater-secret upload was not
    attempted after the security approval gate rejected sending the private key
    without explicit user authorization.
- **Documentation updated:** `README.md`, `docs/architecture.md`,
  `docs/plans/0001-bakbak-desktop-v1.md`, and `docs/progress.md`.
- **Known limitations:** GitHub Actions still needs the four public live
  renderer variables plus the two updater signing secrets, and the release
  labels do not yet exist remotely. The current valid private key and password
  remain only in protected temporary local files and need a durable operator
  backup. The macOS DMGs, Windows installer, `latest.json`, first `0.2.0`
  release, and a real cross-version update have not been validated in CI.
  macOS remains ad-hoc signed/unnotarized and Windows remains unsigned.
- **Next:** Explicitly approve the updater-key upload, authenticate GitHub CLI
  as `ayushrameja` with repository and Actions settings access, back up the key,
  configure the variables/secrets/labels, then merge and observe the first
  `0.2.0` release before testing an update to the next version on both platforms.

## 2026-07-11 — Pin pnpm for GitHub Actions

- **Completed:** Fixed the pull-request CI failure reported by
  `pnpm/action-setup@v4` by declaring `pnpm@11.3.0` in the root
  `packageManager` field. Both CI and release workflows now discover the same
  pnpm version used by the working repository without duplicating it in each
  workflow.
- **Decisions:** Kept the package-manager version in `package.json` as the one
  source of truth instead of adding separate workflow-specific versions that
  could drift.
- **Validation:**
  - User-supplied GitHub Actions screenshot — confirmed the setup job failed
    before installation with `Error: No pnpm version is specified`.
  - `pnpm --version` — confirmed local version `11.3.0` before pinning.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 19 Vitest files
    with 95 tests, four release-script tests, version synchronization, the
    production renderer build, and compiled-artifact secret scanning. The
    existing non-blocking large-chunk warning remains.
  - Workflow YAML parse for `ci.yml` and `release.yml` — passed.
  - `git diff --check` — passed.
- **Documentation updated:** `docs/architecture.md` and `docs/progress.md`.
- **Known limitations:** The corrected workflow still needs a GitHub-hosted
  rerun; this local change does not prove the remote runner or later release
  jobs pass.
- **Next:** Commit and push this fix to the open PR, confirm CI advances past
  pnpm setup, and address only any newly surfaced downstream failure before
  merging.

## 2026-07-11 — Install Tauri Linux prerequisites in CI

- **Completed:** Fixed the Ubuntu Cargo validation failure by installing the
  official Tauri Debian/Ubuntu development dependencies before Rust checks in
  both the pull-request CI job and the release validation job.
- **Decisions:** Kept the Linux prerequisite list identical across CI and
  release validation and aligned it with Tauri's documented WebKitGTK 4.1,
  AppIndicator, SVG, X11, OpenSSL, and compiler requirements rather than adding
  only the first missing GLib package from the error.
- **Validation:**
  - User-supplied GitHub Actions log — confirmed `cargo check --locked` reached
    native compilation and failed because `pkg-config` could not find
    `glib-2.0`, `gobject-2.0`, or `gio-2.0` on the Ubuntu runner.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 19 Vitest files
    with 95 tests, four release-script tests, version synchronization, the
    production renderer build, and compiled-artifact secret scanning. The
    existing non-blocking large-chunk warning remains.
  - Workflow YAML parse for `ci.yml` and `release.yml` — passed.
  - `git diff --check` — passed.
- **Documentation updated:** `docs/architecture.md` and `docs/progress.md`.
- **Known limitations:** The Ubuntu package installation and subsequent Cargo
  check require a new GitHub-hosted run; macOS and Windows release jobs remain
  unvalidated.
- **Next:** Commit and push this workflow fix, confirm pull-request CI passes,
  then merge only after the green result so the first desktop release can run.
