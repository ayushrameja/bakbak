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

## 2026-07-11 — Generate macOS updater artifacts in releases

- **Completed:** Fixed the publish-stage manifest failure by changing both
  macOS release jobs from DMG-only builds to `app,dmg` builds. This preserves
  the user-facing DMGs while also generating the `.app.tar.gz` updater bundles
  and signatures required for Darwin entries in `latest.json`. Added a
  regression test for both macOS matrix arguments and improved manifest errors
  to report the platform keys that were actually found.
- **Decisions:** Kept Tauri Action responsible for merging platform entries
  into the release manifest. The build logs explicitly showed that DMG is not
  an updater-enabled target and identified `app` as the required macOS target,
  so the fix corrects artifact generation rather than weakening the final
  three-platform assertion.
- **Validation:**
  - GitHub Actions run `29162883239` — prepare, validation, macOS Apple Silicon,
    macOS Intel, and Windows x64 jobs passed. Both DMGs and the Windows NSIS
    installer uploaded successfully.
  - The two macOS job logs — each warned that `--bundles dmg` created no
    updater-enabled target and skipped updater JSON contribution because no
    signature was found. The Windows job uploaded its installer, signature, and
    a Windows-only `latest.json`; publish then truthfully failed on missing
    `darwin-aarch64`.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 19 Vitest files
    with 95 tests, five release-script tests including the new workflow guard,
    version synchronization, the production renderer build, and compiled
    artifact secret scanning. The existing non-blocking large-chunk warning
    remains.
  - Workflow YAML parse for `ci.yml` and `release.yml` — passed before the final
    formatting-only test adjustment.
  - `git diff --check` — passed.
- **Documentation updated:** `README.md`, `docs/architecture.md`,
  `docs/plans/0001-bakbak-desktop-v1.md`, and `docs/progress.md`.
- **Known limitations:** The corrected macOS artifact generation still needs a
  new hosted release run. Re-running only the failed publish job would reuse the
  incomplete `0.2.0` artifacts. Because that draft release already created a
  `v0.2.0` tag, the next normal merge will resolve to `v0.2.1` unless the failed
  draft and tag are deleted first. End-to-end update installation remains
  unvalidated.
- **Next:** Open and merge a small release-workflow fix PR without
  `release:skip`, allow the new run to publish `v0.2.1`, then delete the failed
  `v0.2.0` draft and test the published installers plus the next in-app update.

## 2026-07-12 — Provision the private hosted soundboard bucket

- **Completed:** Moved the 23 operator-provided MP3 files out of Vite's
  `public` tree into the Supabase deployment assets, created and deployed the
  private `soundboard` Storage bucket, and uploaded all files under the default
  Bakbak server UUID prefix. Added a database migration and policy tests so the
  hosted configuration is reproducible instead of being dashboard folklore.
- **Decisions:** Limited the bucket to `audio/mpeg` objects no larger than 1
  MiB. Object paths begin with a server UUID, and authenticated users can read
  only paths matching one of their memberships. Renderer clients receive no
  insert, update, or delete policy; sound-pack changes remain an operator
  deployment action. Kept the existing synthesized renderer pack unchanged
  because fetching, caching, and playing hosted sounds is a separate product
  integration step.
- **Validation:**
  - `pnpm dlx supabase@latest db reset` — passed; all migrations, including
    `202607120001_soundboard_storage.sql`, applied to a clean local database.
  - `pnpm dlx supabase@latest db lint --local` — passed with no schema errors.
  - `pnpm dlx supabase@latest test db` — passed all four files and 78
    assertions, including private-bucket configuration, matching-member reads,
    cross-server isolation, anonymous denial, and client-upload denial.
  - `pnpm dlx supabase@latest db push --dry-run` — passed and reported only the
    new soundboard migration.
  - `pnpm dlx supabase@latest db push` — passed; migration
    `202607120001_soundboard_storage.sql` deployed to the linked hosted Bakbak
    project.
  - `pnpm dlx supabase@latest storage cp --experimental --recursive --linked ...`
    — passed; uploaded all 23 MP3 files. The first attempt without
    `--experimental` made no changes and returned the CLI's required-flag
    error.
  - `pnpm dlx supabase@latest storage ls --experimental --linked --recursive ss:///soundboard`
    — passed; returned exactly the 23 expected server-prefixed object paths.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 19 Vitest files
    with 95 tests, five release-script tests, version synchronization,
    production renderer build, and compiled-artifact secret scanning. The
    existing non-blocking large-chunk warning remains.
  - Renderer and built-app MP3 searches — passed with zero matches; moving the
    assets out of `public` keeps them out of both `dist` and `Bakbak.app`.
  - `pnpm tauri build --bundles app` — built and ad-hoc signed `Bakbak.app`,
    then exited non-zero while generating the updater archive because
    `TAURI_SIGNING_PRIVATE_KEY` was not available in this shell.
  - `codesign --verify --deep --strict --verbose=4 .../Bakbak.app` — passed.
  - `pnpm security:scan` — passed for `dist` and the desktop bundle.
  - `pnpm dlx supabase@latest migration list` — passed; local and remote
    migrations match through `202607120001`.
- **Documentation updated:** `supabase/README.md`, `docs/architecture.md`,
  `docs/plans/0001-bakbak-desktop-v1.md`, and `docs/progress.md`.
- **Known limitations:** The renderer still displays and plays its four
  synthesized Web Audio sounds; it does not yet list, download, cache, or play
  the hosted MP3 pack. The MP3s require a distribution-rights review before
  friend testing. A fully successful updater-artifact build still requires the
  protected updater private key in an approved release environment.
- **Next:** Add a typed hosted sound catalog, authenticated download and local
  cache service, preload readiness UI, and LiveKit sound-ID mapping, then run a
  two-client synchronized playback and deafen/output-routing acceptance test.

## 2026-07-12 — Integrate the hosted Discord-style soundboard

- **Completed:** Replaced the four synthesized sounds and client-side replay
  path with the 23 hosted MP3s. Added four ordered categories, a typed catalog,
  member metadata editing, Realtime refresh, authenticated preload, IndexedDB
  revision caching, and per-card readiness/retry state. Voice now publishes one
  persistent `bakbak-soundboard` audio track per participant, routes each local
  trigger once to unity-gain outbound audio and once to the selected-speaker
  monitor, permits overlapping full clips, and exposes Stop my sounds. Added
  version-2 play/stop control events, sender derivation from the LiveKit
  participant, event deduplication, duration-based activity cleanup, emoji and
  overlap participant badges, persisted 70% soundboard volume in both the room
  and settings, and remote global-by-participant volume multiplication. Mock
  mode uses catalog fixtures and simulated activity without protected audio.
- **Decisions:** Member updates are restricted to label, one emoji grapheme,
  and same-server category; operators retain file, duration, order, enabled,
  revision, and category control. LiveKit server SDK 2.17.0 exposes
  `Track.Source.Unknown` but throws `Cannot convert TrackSource 0 to string`
  while encoding a source-restricted token grant. The dedicated track therefore
  uses a second permitted microphone source and its exact name for routing;
  screen sharing remains denied. Control events carry UI state only, so remote
  clients never replay them and digital double playback is removed.
- **Validation:**
  - `pnpm dlx supabase@latest db reset` — passed from a clean local database.
  - `pnpm dlx supabase@latest db lint --local` — passed with no schema errors.
  - `pnpm dlx supabase@latest test db` — passed all five files and 96
    assertions, including catalog membership, metadata grants, immutable audio
    fields, cross-server category rejection, prohibited writes, and Realtime.
  - `deno check --config supabase/deno.json ...` and
    `deno task --config supabase/deno.json test` — passed; eight Edge Function
    tests passed and microphone/camera-only publish-source grants remain intact.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 21 Vitest files
    with 91 tests, five release-script tests, version synchronization,
    production renderer build, and compiled-artifact secret scanning. The
    existing non-blocking large-chunk warning remains.
  - Focused soundboard, voice, audio-routing, settings, and cache suites —
    passed, including revision invalidation, failures, overlap, stop-all,
    outbound unity gain, local monitoring, deafen, and volume multiplication.
  - In-app browser mock rehearsal — passed category filtering, all 23 ready
    cards, metadata modal, participant emoji activity, fast overlapping `+1`
    state, and Stop my sounds visibility; desktop visual inspection passed.
  - `pnpm dlx supabase@latest db push --dry-run` — passed and reported only
    `202607120002_soundboard_catalog.sql`.
  - `pnpm dlx supabase@latest db push` — passed; the catalog migration deployed
    to the linked hosted Bakbak project.
  - `pnpm dlx supabase@latest migration list` — passed; local and remote
    histories match through `202607120002`.
  - Renderer and built-app MP3 searches — passed with zero matches.
  - `pnpm tauri build --bundles app` — built and ad-hoc signed `Bakbak.app`,
    then exited non-zero after bundling because this shell does not have the
    protected `TAURI_SIGNING_PRIVATE_KEY` required to sign updater artifacts.
  - `codesign --verify --deep --strict .../Bakbak.app` — passed.
- **Documentation updated:** `supabase/README.md`, `docs/architecture.md`,
  `docs/plans/0001-bakbak-desktop-v1.md`, and `docs/progress.md`.
- **Known limitations:** The two-client browser-plus-installed-app audio matrix
  still needs human ears for exact-once playback, laptop-speaker acoustic echo,
  independent volume, device switching, reconnect, mute/deafen, leave, and
  cleanup. Echo cancellation is requested but remains hardware-dependent.
  Distribution rights for all 23 clips must be confirmed before friend testing.
  A fully successful updater-artifact build requires the protected signing key
  in the approved release environment.
- **Next:** Install the newly built client on both acceptance devices, sign in
  as separate members, complete the soundboard/audio matrix, then distribute an
  all-clients-required update only after licensing is confirmed.

## 2026-07-12 — Remove local soundboard source copies

- **Completed:** Removed the repository copies under `supabase/storage/`. The
  hosted private Supabase bucket remains unchanged and is now the runtime and
  deployment source of truth for the 23 MP3 objects.
- **Decisions:** Kept the app bundle clean and avoided maintaining duplicate
  audio assets in Git. Any restoration or re-upload must use an operator-held
  backup outside the repository.
- **Validation:**
  - `find supabase/storage -type f` — passed; directory no longer exists.
  - `rg` over application and build output — confirmed no local MP3 references
    are required by the renderer.
- **Documentation updated:** `docs/architecture.md`, `supabase/README.md`, and
  `docs/progress.md`.
- **Known limitations:** A future bucket restoration requires the operator
  backup; the hosted objects are unaffected by this local cleanup.
- **Next:** Continue with the two-client audio acceptance test and licensing
  confirmation.

## 2026-07-12 — Separate local app builds from signed updater builds

- **Completed:** Added `pnpm tauri:build:local` and a non-secret Tauri override
  that builds the macOS app bundle with updater artifact generation disabled.
  Local development builds no longer require the protected updater private key,
  while the main configuration and GitHub release workflow continue to require
  signed updater artifacts.
- **Decisions:** Did not rotate the updater key or replace the committed public
  key. The original local temporary key files and proposed home-directory backup
  are absent, and GitHub Actions secrets cannot be read back after creation.
  Keeping GitHub as the release signer preserves update compatibility; the local
  override changes only packaging output and does not weaken published releases.
- **Validation:**
  - `pnpm tauri:build:local` — passed; built and ad-hoc signed
    `Bakbak.app` without requesting `TAURI_SIGNING_PRIVATE_KEY`.
  - `codesign --verify --deep --strict --verbose=4 .../Bakbak.app` — passed.
  - Built bundle version check — passed; version is `0.2.0`.
  - `pnpm security:scan` — passed for the renderer and desktop bundle.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 21 Vitest files
    with 91 tests, five release-script tests, version synchronization, the
    production renderer build, and compiled-artifact secret scanning. The
    existing non-blocking large-chunk warning remains.
  - `git diff --check` — passed.
- **Documentation updated:** `README.md`, `docs/architecture.md`, and
  `docs/progress.md`.
- **Known limitations:** `pnpm tauri:build:local` intentionally produces no
  updater archive or updater signature and remains ad-hoc signed/unnotarized.
  A locally signed updater build is impossible without the matching private key
  backup; GitHub Actions remains the only configured signer for release builds.
- **Next:** Use `pnpm tauri:build:local` for local app installation and reserve
  the normal updater-enabled build for GitHub Actions. After the current
  soundboard work is ready, publish through the release workflow and retain an
  offline backup of any future signing-key rotation before replacing secrets.

## 2026-07-12 — Mute idle soundboard publication

- **Completed:** Inspected the supplied macOS screen recording and traced the
  persistent system-audio suppression to the dedicated LiveKit soundboard
  publication remaining enabled after its clips ended. The persistent named
  track is now published muted, unmutes only for active playback, stays enabled
  across overlapping clips, and mutes again after the final clip, stop-all, or
  cleanup. Added regression coverage for idle, overlapping, resumed, and
  stop-all track states.
- **Decisions:** Kept one pre-published named track so short sounds do not lose
  their opening while a new WebRTC publication negotiates. Muting the existing
  publication bounds its microphone-source behavior to real playback while
  preserving overlap and the established receiver contract.
- **Validation:**
  - `pnpm exec vitest run src/features/soundboard/soundboard-audio.test.ts` —
    passed; one focused test.
  - `pnpm typecheck` — passed both renderer and Node TypeScript projects.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 21 Vitest files
    with 91 tests, five release-script tests, version synchronization, the
    production renderer build, and compiled-artifact secret scanning. The
    existing non-blocking large-chunk warning remains.
  - `pnpm tauri:build:local` — passed; built and ad-hoc signed the macOS app
    bundle. Notarization was skipped because local Apple notarization
    credentials are intentionally absent.
  - `codesign --verify --deep --strict --verbose=4 .../Bakbak.app` — passed;
    the bundle is valid on disk and satisfies its designated requirement.
  - `pnpm security:scan` — passed against the final renderer and desktop
    bundle.
  - `pnpm format:check` and `git diff --check` — passed after the documentation
    update.
  - `pnpm test -- src/features/soundboard/soundboard-audio.test.ts` — the Vitest
    suite passed all 91 tests, but the overall command failed because the extra
    TypeScript path was also forwarded to the Node release-script runner. The
    focused Vitest command above is the valid per-file invocation.
- **Documentation updated:** `docs/architecture.md` and `docs/progress.md`.
- **Known limitations:** The supplied recording confirms the pre-fix symptom,
  but speaker suppression is hardware- and runtime-observable behavior. The new
  bundle still needs a human macOS check with unrelated system audio playing
  before, during, and after a clip, plus the planned two-client soundboard
  matrix. The app remains ad-hoc signed and unnotarized.
- **Next:** Install the new local bundle, confirm system audio recovers as soon
  as the last sound ends and after stop-all, then complete the Arc-plus-native
  synchronized soundboard acceptance run.

## 2026-07-12 — Destroy retained audio after an interrupted sound

- **Completed:** Inspected the second supplied macOS recording and confirmed a
  short non-silent waveform fragment repeated from roughly 5.9 seconds until
  the app closed near 14.9 seconds, including after the user left voice. Traced
  the retained fragment to the hidden selected-speaker `<audio>` element and
  its `MediaStreamDestination` surviving soundboard and room cleanup. Explicit
  stop-all and all voice reset paths now clean up the soundboard publisher,
  pause and detach the monitor element, stop every routing-stream track, and
  close the owning `AudioContext`. A later sound recreates the graph and
  reapplies the remembered speaker.
- **Decisions:** Retained idle publication muting and overlapping playback for
  normal completion. An explicit interrupted stop now performs the stronger
  graph reset because disconnecting only the `AudioBufferSourceNode` is not
  sufficient to flush WebKit's retained output frame. Soundboard publication
  cleanup runs before output-context cleanup so no publisher keeps nodes from a
  closed context.
- **Validation:**
  - `ffmpeg ... silencedetect ... 2026-07-12\ 12-59-58.mov` — confirmed the
    pre-fix repeated audio continues after the on-screen voice leave and ends
    only with app shutdown.
  - `pnpm exec vitest run <three focused audio lifecycle files>` — passed three
    files with 11 focused lifecycle tests after correcting the initial test
    constructor.
  - `pnpm typecheck` — passed both renderer and Node TypeScript projects.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 21 Vitest files
    with 93 tests, five release-script tests, version synchronization, the
    production renderer build, and compiled-artifact secret scanning. The
    existing non-blocking large-chunk warning remains.
  - `pnpm tauri:build:local` — passed; rebuilt and ad-hoc signed the macOS app
    bundle. Local notarization remained skipped because credentials are
    intentionally absent.
  - `codesign --verify --deep --strict --verbose=4 .../Bakbak.app` — passed;
    the final bundle is valid on disk and satisfies its designated requirement.
  - `pnpm security:scan` and `git diff --check` — passed against the final
    renderer, desktop bundle, and working diff.
  - `ditto .../Bakbak.app /Applications/Bakbak.app` — passed; installed the
    rebuilt local bundle for retesting.
  - `shasum -a 256 .../bakbak /Applications/Bakbak.app/.../bakbak` — passed;
    the built and installed executables both have SHA-256
    `65e323571267675a2e776c5e55148a1e84dc25f9d28f7caebc2eaef23a4d8315`.
  - `codesign --verify --deep --strict --verbose=4 /Applications/Bakbak.app` —
    passed; the installed app is valid on disk and satisfies its designated
    requirement.
  - `open /Applications/Bakbak.app` — passed; launched the installed rebuild for
    the human reproduction check.
- **Documentation updated:** `docs/architecture.md` and `docs/progress.md`.
- **Known limitations:** The first idle-mute correction did not flush the
  WebKit-selected-speaker graph and was insufficient on the user's machine.
  The new teardown behavior is covered at the service and hook boundaries, but
  the rebuilt native app still needs the same human hard-stop test because the
  retained-frame defect is runtime and hardware observable. Two intermediate
  `pnpm check` runs failed on formatting and then test-only lint issues; both
  were corrected before the final passing run.
- **Next:** In the launched installed rebuild, interrupt a
  sustained/high-frequency sound with Stop my sounds, verify immediate silence,
  then repeat while leaving the voice room before completing the two-client
  soundboard acceptance matrix.

## 2026-07-12 — Flush the monitor after natural sound completion

- **Completed:** The user confirmed that the stronger Stop my sounds teardown
  fixes interrupted playback, then identified the remaining natural-completion
  variant: a clip ending on a non-silent frequency could still leave WebKit
  cycling its final rendered frame. Added a final-idle callback to the
  soundboard publisher, guarded by both active and pending playback counts. When
  the last overlapping clip fires `onended`, the selected-speaker monitor now
  pauses, detaches, stops its MediaStream tracks, and is discarded. The next
  clip creates a fresh monitor and reapplies the selected speaker.
- **Decisions:** Natural completion resets only the local monitor stream. It
  deliberately keeps the shared `AudioContext` and named LiveKit publication
  alive, avoiding track renegotiation and clipped openings on short sounds.
  Explicit Stop my sounds and voice leave retain the stronger full-context and
  publication cleanup. Pending-playback accounting prevents a rapid next click
  from racing the final-idle monitor reset.
- **Validation:**
  - `pnpm exec vitest run <three focused audio lifecycle files>` — passed three
    files with 12 focused tests covering natural final-idle reset, overlap,
    selected-speaker restoration, explicit stop, and voice leave.
  - `pnpm typecheck` — passed both renderer and Node TypeScript projects.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 21 Vitest files
    with 94 tests, five release-script tests, version synchronization, the
    production renderer build, and compiled-artifact secret scanning. The
    existing non-blocking large-chunk warning remains.
  - `pnpm tauri:build:local` — passed; rebuilt and ad-hoc signed the macOS app
    bundle. Local notarization remained skipped because credentials are
    intentionally absent.
  - `pnpm security:scan` — passed against the final renderer and desktop bundle.
  - `ditto .../Bakbak.app /Applications/Bakbak.app` — passed after quitting the
    running app; installed the natural-completion fix.
  - `shasum -a 256 .../bakbak /Applications/Bakbak.app/.../bakbak` — passed;
    built and installed executables both have SHA-256
    `de81004b51dc6b4d28601ece8bc43ddf49b6dd9266992ed962381ca01b12db5f`.
  - `codesign --verify --deep --strict --verbose=4 /Applications/Bakbak.app` —
    passed; the installed app is valid on disk and satisfies its designated
    requirement.
  - `open /Applications/Bakbak.app` — passed; launched the installed rebuild for
    the natural-completion check.
- **Documentation updated:** `docs/architecture.md` and `docs/progress.md`.
- **Known limitations:** The automated tests prove ownership and teardown order,
  but WebKit's retained-frame behavior remains observable only in the native
  audio runtime. Two intermediate `pnpm check` runs failed on formatting and a
  test-only unbound-method lint reference; both were corrected before the final
  passing run.
- **Next:** Let a sound with a non-silent/high-frequency ending complete without
  pressing Stop my sounds and confirm immediate silence. Then repeat with
  overlapping clips before completing the Arc-plus-native soundboard matrix.

## 2026-07-12 — Synchronize tracked versions after releases

- **Completed:** Confirmed the existing release workflow already resolves
  patch, minor, major, or skipped releases from the merged pull request labels,
  but previously changed versions only inside isolated build checkouts. Added a
  post-publication job that synchronizes `package.json`, Tauri configuration,
  `Cargo.toml`, and the Bakbak package entry in `Cargo.lock`; commits those
  changes on a bot branch; then opens and immediately merges a version PR to
  comply with the protected `main` branch. Added a workflow regression test and
  advanced all tracked versions from `0.2.0` to the newly published `0.3.0`.
- **Decisions:** Kept tags and published GitHub Releases authoritative. The
  version commit runs only after installer and updater-manifest verification
  plus successful publication, so a failed release cannot advance tracked
  metadata. Used the repository `GITHUB_TOKEN`, least-privilege job permissions,
  and a `[skip ci]` commit annotation; GitHub does not recursively trigger a
  push workflow from that token. Preserved the active pull-request ruleset
  instead of bypassing it with a direct push.
- **Validation:**
  - GitHub Actions run `29192051294` — passed all prepare, validation, macOS
    Apple Silicon, macOS Intel, Windows x64, and publish jobs. PR #3's
    `release:minor` label resolved to `0.3.0`.
  - GitHub Release `v0.3.0` — passed; published as a non-draft, non-prerelease
    release at 2026-07-12 12:12:41 UTC.
  - Active repository ruleset inspection — confirmed `main` requires a pull
    request with zero required approvals and rejects direct updates.
  - `node --test scripts/release-version.test.mjs` — passed six release tests,
    including the new protected-branch version-sync workflow guard.
  - Ruby YAML parse for `.github/workflows/release.yml` — passed. `actionlint`
    was skipped because it is not installed.
  - Initial `pnpm check` — failed on the new test's countable-space lint rule;
    corrected the regex before the final run.
  - Final `pnpm check` — passed formatting, lint, strict TypeScript, 21 Vitest
    files with 94 tests, six release-script tests, `0.3.0` version
    synchronization, production renderer build, and compiled-artifact secret
    scanning. The existing non-blocking large-chunk warning remains.
  - `cargo check --locked --manifest-path src-tauri/Cargo.toml` — passed with
    Bakbak `0.3.0`, confirming the synchronized lockfile remains valid.
  - `pnpm tauri:build:local` — passed; built and ad-hoc signed the `0.3.0`
    macOS app bundle. Notarization was skipped because local Apple distribution
    credentials remain intentionally absent.
  - Bundle version, `codesign --verify --deep --strict --verbose=4`, and
    `pnpm security:scan` — passed for the final `0.3.0` bundle.
  - Final `pnpm format:check`, release-script test, version check, workflow YAML
    parse, and `git diff --check` — passed after the progress entry.
- **Documentation updated:** `README.md`, `docs/architecture.md`, and
  `docs/progress.md`.
- **Known limitations:** The new post-release job has not yet run on GitHub.
  The current GitHub CLI identity can inspect releases and rulesets but receives
  HTTP 403 for the Actions workflow-permissions setting, so the required
  **Allow GitHub Actions to create and approve pull requests** toggle could not
  be verified from this shell.
- **Next:** Enable or confirm that Actions workflow-permissions toggle, open
  this automation change as a PR with `release:skip` so `main` catches up to the
  already published `0.3.0` without producing an empty patch release, then
  verify that the next product release automatically merges its version-sync
  PR.

## 2026-07-12 — Add native macOS screen sharing and secure companions

- **Completed:** Added the approved screen-sharing plan and implemented
  backward-compatible `voice`/`screen_share` token purposes. Voice tokens keep
  microphone, camera, and data grants plus video-only screen fallback;
  generated screen companions can publish only screen video/audio into the
  exact voice room and cannot subscribe, send data, or update metadata. Added
  renderer confirmation with audio unchecked, call and persistent-dock
  controls, companion ownership/filtering, one featured stage, multi-presenter
  selection, selected-share-only subscriptions, browser hiding/unsubscription,
  owner volume and output routing for share audio, deafen handling, warnings,
  and voice-leave cleanup. Added main-window-only Tauri commands and a native
  macOS ScreenCaptureKit picker/capture service with a separate LiveKit room,
  1080p/15 fps H.264 video, optional 48 kHz stereo audio, Bakbak-process audio
  exclusion, video-only audio failure fallback, source/connection termination,
  and window-close teardown. Deployed only `livekit-token`; no database
  migration was needed. Target-gated Rust LiveKit, WebRTC, ScreenCaptureKit,
  and Tokio dependencies to macOS so the current Windows video-only fallback
  does not compile or ship an unused native media stack.
- **Decisions:** Native code receives only the public LiveKit URL and a
  five-minute member-authorized token. Captured labels and credentials are not
  logged. Browser clients remain ordinary voice/chat members and cannot view
  shares. Windows currently exposes only WebView video fallback with matched
  audio disabled; publishing unrelated system audio would be a privacy bug, not
  a fallback. Directly linking ScreenCaptureKit establishes macOS 12.3 as the
  bundle minimum; macOS 12.3–13 retain video-only WebView fallback and macOS 14+
  use the native picker/audio path.
- **Validation:**
  - `deno task --config supabase/deno.json test` — passed 12 Edge Function
    tests, including default-purpose compatibility, exact voice/screen grants,
    malformed purpose, unauthorized/non-member channel handling, generated
    companion identity, JWT verification, and normalized signer failure.
  - `pnpm exec vitest run src/features/voice src/features/channels/ChannelSidebar.test.tsx`
    — passed 13 files with 65 focused renderer tests.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 25 Vitest files
    with 108 tests, six release-script tests, version synchronization,
    production build, and compiled-artifact secret scanning. The existing
    non-blocking large-chunk warning remains.
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` — passed.
  - `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib`
    — passed three macOS/native boundary tests.
  - `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml` —
    passed.
  - Target-specific `cargo tree --locked --offline` inspection — Windows x64
    contained no LiveKit, WebRTC, or ScreenCaptureKit dependency; the macOS
    tree retained the native LiveKit/WebRTC path.
  - First `pnpm tauri:build:local` — failed because the sandbox could not
    resolve LiveKit's pinned GitHub WebRTC archive; the approved network retry
    downloaded it and built successfully. Bundle inspection then found Tauri's
    stale macOS 10.13 declaration and unresolved `@rpath` Swift concurrency
    dependency, so the minimum was corrected to 12.3 and the final rebuild
    passed in release mode with ad-hoc signing. Notarization was skipped because
    distribution credentials are intentionally absent.
  - `codesign --verify --deep --strict --verbose=4 <Bakbak.app>` — passed.
    `otool -L` confirmed `/usr/lib/swift/libswift_Concurrency.dylib` rather than
    an unresolved `@rpath`; bundled `Info.plist` reports macOS 12.3 and the
    screen-capture purpose string.
  - Bundle size — previous app 12,216 KB / executable 12,446,736 bytes; native
    screen-share app 35,724 KB / executable 36,518,848 bytes, an app increase of
    23,508 KB from native LiveKit/WebRTC.
  - `pnpm security:scan` and `git diff --check` — passed after the final bundle.
  - `pnpm dlx supabase@latest functions deploy livekit-token --use-api` —
    passed for the linked hosted project. A no-authorization POST to the
    deployed endpoint returned HTTP 401.
- **Documentation updated:** `README.md`, `supabase/README.md`,
  `docs/architecture.md`, `docs/plans/0001-bakbak-desktop-v1.md`,
  `docs/plans/0002-voice-video-and-presence.md`, new approved
  `docs/plans/0003-screen-sharing.md`, and this canonical progress entry.
- **Known limitations:** Windows native `Windows.Graphics.Capture`, matched
  window-process/display audio, Windows CI validation, and macOS-to-Windows plus
  Windows-to-macOS acceptance are not implemented or run. The macOS native
  picker, permission denial, source-audio behavior, OS-level stop, simultaneous
  presenters, reconnect, camera coexistence, deafen/output/volume behavior, and
  protected-content limitations still require real two-account observation.
  Native coordinator coverage currently validates request, frame sizing, audio
  conversion, build/link, and renderer teardown but does not yet provide the
  full mocked picker/capture/publisher fault matrix from plan 0003.
- **Next:** Implement the Windows native picker plus safe matched process/display
  audio, add its mocked coordinator and CI coverage, then install both platform
  builds and complete the bidirectional two-account matrix before marking the
  Phase 5 criterion complete.

## 2026-07-12 — Fix native WebRTC Objective-C category crash

- **Completed:** Diagnosed the supplied macOS crash report and reproduced its
  native initialization boundary. WebRTC's VP9 encoder called
  `+[NSString stringForAbslStringView:]`, but the app terminated with an
  unrecognized-selector exception. Confirmed that the pinned `libwebrtc.a`
  contains `NSString+StdString.o` and the required category method while the
  crashing Bakbak executable contained only the selector call. Updated the
  macOS build to extract and link that exact upstream archive member explicitly,
  added a native video-factory regression test, rebuilt the application, and
  replaced `/Applications/Bakbak.app` with the repaired build.
- **Decisions:** Link only WebRTC's category object instead of using Apple's
  broad `-ObjC` linker flag. `-ObjC` fixes category discovery but also
  force-loads the ScreenCaptureKit and `apple-cf` Swift archives that previously
  produced duplicate CoreMedia bridge symbols. Using the pinned upstream object
  preserves WebRTC's exact C++ ABI and limits the workaround to the missing
  code.
- **Validation:**
  - Supplied `.ips` report plus terminal stack — both identify
    `RTCVideoEncoderVP9.scalabilityModes` calling the missing
    `stringForAbslStringView:` selector on the native signaling thread.
  - Pre-fix `ar -t`/`nm` comparison — `libwebrtc.a` contained
    `NSString+StdString.o` and the method implementation; the Bakbak executable
    did not.
  - First focused factory test — failed because the synchronous test had no
    Tokio reactor; converted it to `#[tokio::test]` before evaluating WebRTC.
  - `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib`
    — passed four tests, including native WebRTC video-factory initialization.
  - `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml` and
    Rust formatting check — passed.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 25 Vitest files
    with 108 tests, six release-script tests, version synchronization,
    production build, and secret scanning. The existing non-blocking large
    chunk warning remains.
  - `pnpm tauri dev` — built and remained alive after launch until deliberately
    stopped; port 1420 was released afterward.
  - `pnpm tauri:build:local` — passed and produced the ad-hoc-signed macOS app;
    notarization was skipped because credentials remain intentionally absent.
  - Release-binary `nm` inspection — confirmed
    `+[NSString(AbslStringView) stringForAbslStringView:]` and the upstream
    `NSString` category are present.
  - Release and installed `codesign --verify --deep --strict --verbose=4` —
    passed. `pnpm security:scan` and `git diff --check` also passed.
  - `ditto <built Bakbak.app> /Applications/Bakbak.app` — passed. Built and
    installed executables share SHA-256
    `d8ef587fcb2b8694c050248a707e6db42e67e18997b4fcad1986023279941707`.
  - `open /Applications/Bakbak.app` plus `lsof` — passed; the repaired installed
    process remained active after launch.
- **Documentation updated:** `docs/architecture.md` and `docs/progress.md`.
- **Known limitations:** Automated native initialization now covers the exact
  crashing factory path, but the user still needs to repeat the real picker and
  screen/audio publication action in the installed app. The broader two-account
  screen-sharing acceptance matrix remains open.
- **Next:** In the already launched repaired app, join voice and retry Share
  screen with audio unchecked first, then checked. Confirm the picker opens and
  publication starts without an Objective-C exception before continuing the
  macOS acceptance matrix.

## 2026-07-12 — Complete native WebRTC category linking

- **Completed:** Diagnosed the second supplied macOS crash,
  `-[RTCVideoCodecInfo initWithNativeSdpVideoFormat:]: unrecognized selector`,
  as another runtime-only Objective-C category omitted from LiveKit's pinned
  static WebRTC archive. Replaced the earlier one-object workaround with a
  reviewed set of all eight category-only WebRTC bridge objects used by the
  macOS SDK, including the NSString, encoded-image, peer-connection,
  peer-connection-factory, video-codec, and encoder-settings bridges. Rebuilt,
  reinstalled, and launched `/Applications/Bakbak.app`. Each build recreates a
  dedicated extraction directory so stale objects cannot conceal an upstream
  archive mismatch.
- **Decisions:** Link the complete reviewed category set from the single pinned
  WebRTC archive. This closes the selector family proactively while preserving
  the narrow workaround needed to avoid the duplicate Swift bridge symbols
  caused by the global `-ObjC` linker flag. The fixed object names also make an
  upstream WebRTC archive change fail at build time instead of becoming a
  friend-test crash.
- **Validation:**
  - Supplied crash report and terminal stack — both identify
    `RTCVideoEncoderFactorySimulcast.supportedCodecs` calling the missing
    `RTCVideoCodecInfo(Private)` initializer on WebRTC's signaling thread.
  - `ar -t` plus `nm -A` archive inventory — confirmed the eight runtime-only
    category members and located `initWithNativeSdpVideoFormat:` in
    `RTCVideoCodecInfo+Private.o`.
  - `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib`
    — passed all four focused Rust tests.
  - `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml`,
    `cargo build --locked --offline --manifest-path src-tauri/Cargo.toml`, and
    Rust formatting check — passed.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 25 Vitest files
    with 108 tests, six release-script tests, version synchronization,
    production build, and secret scanning. The existing non-blocking large
    chunk warning remains.
  - `pnpm tauri:build:local` — passed and produced the ad-hoc-signed macOS app;
    notarization was skipped because credentials remain intentionally absent.
  - Release-binary `nm` plus `otool -ov` inspection — confirmed
    `stringForAbslStringView:`, `initWithNativeSdpVideoFormat:`,
    `nativeSdpVideoFormat`, and `initWithNativeVideoCodec:` are present, and
    that the missing initializer is registered on `RTCVideoCodecInfo`'s runtime
    method table.
  - Built and installed `codesign --verify --deep --strict --verbose=4` —
    passed. Their executable SHA-256 values match at
    `117a4e68fce60daa99deed6c8fd47d8fa5fe88f1c93315c998360deaaea58ef9`.
  - `open /Applications/Bakbak.app` plus `lsof` — passed; the installed process
    remained active after launch.
  - `git diff --check` — passed before the progress entry was appended.
- **Documentation updated:** `docs/architecture.md` and `docs/progress.md`.
- **Known limitations:** Startup, linking, and selector registration are
  verified, but Apple's native content picker and a real video/audio
  publication still require human interaction. The broader two-account screen
  sharing matrix remains open.
- **Next:** In the launched installed app, join voice and retry Share screen
  with audio unchecked first, then checked. If both publish successfully,
  continue the macOS-to-Windows acceptance cases from plan 0003.

## 2026-07-12 — Contain macOS first-frame failures and fix buffer ownership

- **Completed:** Diagnosed the third supplied macOS crash as a native
  `CVPixelBuffer` ownership violation rather than another linker failure. The
  ScreenCaptureKit wrapper supplied an owned +1 pixel-buffer retain, LiveKit's
  macOS bridge consumed and released that retain, and the Rust wrapper then
  released it a second time. CoreMedia later finalized the parent sample buffer
  and terminated in `CFRelease` with a pointer-authentication trap. Transferred
  the retain exactly once by preventing the consumed Rust wrapper from
  dropping. Added output-registration checks and a five-second first-frame
  gate; capture now stops safely and returns an error if macOS rejects an output,
  ends early, or never supplies usable video. Native lifecycle states and
  errors now print to the Tauri terminal, and the renderer prints sanitized
  failures to DevTools without logging tokens or source labels. Tauri string
  errors are preserved in the call alert, leave voice connected, and keep the
  screen-share state retryable.
- **Decisions:** Fix the proven retain imbalance at the zero-copy boundary
  instead of attempting to catch `SIGTRAP`; a CoreFoundation pointer-auth trap
  occurs below Rust/JavaScript and cannot be converted into a renderer error
  after memory has already been corrupted. Treat delivery of the first usable
  frame—not merely `SCStream.startCapture` returning—as successful startup.
  Keep diagnostic logs limited to state and safe error text.
- **Validation:**
  - Supplied macOS report — installed PID 70416 terminated with
    `EXC_BREAKPOINT (SIGTRAP)` on `com.screencapturekit.output.0`; the crashing
    stack is `CFRelease` -> `sBufFinalize` -> CoreMedia capture cleanup, while
    Bakbak was waiting in `SCStream.start_capture`.
  - Local dependency-source inspection — confirmed ScreenCaptureKit creates an
    owned pixel-buffer wrapper and LiveKit's Apple bridge calls
    `CVPixelBufferRelease` after constructing its native video buffer.
  - `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib`
    — passed six tests, including first-frame delivery and timeout behavior.
  - `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml` and
    Rust formatting — passed. `cargo clippy --locked --offline
--manifest-path src-tauri/Cargo.toml --lib -- -D warnings` also passed.
  - Focused screen-share service and voice-hook Vitest run — passed 13 tests,
    including sanitized DevTools logging and retryable native failure while
    voice remains connected.
  - `pnpm check` — passed after correcting one test-mock lint error; formatting,
    lint, strict TypeScript, 25 Vitest files with 111 tests, six release-script
    tests, version synchronization, production build, and secret scanning all
    passed. The existing non-blocking large-chunk warning remains.
  - `pnpm tauri:build:local` — passed and produced the ad-hoc-signed macOS app;
    notarization was skipped because distribution credentials remain absent.
  - Release-binary inspection — confirmed the first-frame failure and sanitized
    terminal diagnostic strings are present. Built and installed
    `codesign --verify --deep --strict --verbose=4` passed, and their executable
    SHA-256 values match at
    `cdc1b268e074ce435f74d92ab20ffc5d217c4e3194d1741e75d258f91dbd9a64`.
- **Documentation updated:** `docs/architecture.md` and `docs/progress.md`.
- **Known limitations:** The ownership correction is evidence-backed and all
  automated boundaries pass, but a real Apple picker/frame/publication remains
  a human test. A process-level hardware/framework trap cannot be made
  recoverable after it occurs; the fix prevents the known double release and
  converts ordinary capture startup failures before publication.
- **Next:** Run `pnpm tauri dev`, retry video-only screen sharing, and confirm
  either frames publish or the app remains alive with the exact failure in the
  call alert, DevTools console, and Tauri terminal. Then repeat with source
  audio enabled.

## 2026-07-12 — Repair cross-platform desktop release builds

- **Completed:** Diagnosed GitHub Actions run `29197115599` and fixed its three
  failed build jobs. Extracted Cargo lockfile version handling into a tested
  helper that accepts both LF and Windows CRLF line endings, then wired the
  release version updater through it. Added LF/CRLF regression coverage. Moved
  the Apple Silicon release job from the drifting `macos-latest` label to
  `macos-26` and the Intel job to `macos-26-intel`, whose Xcode SDK provides the
  macOS 26 Metal symbols required by the transitive `apple-metal 0.8.8` Swift
  bridge.
- **Decisions:** Keep the application deployment minimum at macOS 12.3 while
  using macOS 26 only as the release build host. Make the version script
  line-ending agnostic instead of relying on checkout normalization, so it is
  safe under Windows Git defaults and when invoked outside Actions. Lock the
  two host labels and both installer targets in release-script tests.
- **Validation:**
  - `gh run view 29197115599 --json ...` — confirmed `prepare` and `validate`
    passed, Windows failed in `set-version.mjs 0.4.0`, and both macOS jobs
    failed in `tauri-action` while compiling `apple-metal 0.8.8` against an
    older SDK.
  - `node --test scripts/set-version.test.mjs scripts/release-version.test.mjs`
    — passed eight focused tests, including LF, CRLF, Apple Silicon host, Intel
    host, and both macOS bundle targets.
  - First `pnpm check` — failed only because Prettier requested formatting in
    `scripts/release-version.test.mjs`; the touched files were formatted and
    the complete command was rerun.
  - Final `pnpm check` — passed formatting, lint, strict TypeScript, 25 Vitest
    files with 111 tests, eight release-script tests, version synchronization,
    production build, and compiled-artifact secret scanning. The existing
    non-blocking 500 kB chunk warning remains.
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` — passed.
  - `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib`
    — passed all six native tests.
  - `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml` —
    passed.
  - `pnpm tauri:build:local` — passed against the local macOS 26.5 SDK and
    produced an ad-hoc-signed `Bakbak.app`; notarization was skipped because
    distribution credentials are intentionally absent.
  - `codesign --verify --deep --strict --verbose=4
src-tauri/target/release/bundle/macos/Bakbak.app` — passed. The post-build
    `pnpm security:scan` also passed for `dist` and the release bundle.
- **Documentation updated:** `docs/architecture.md` and `docs/progress.md`.
- **Known limitations:** Local checks cannot execute the GitHub-hosted Windows
  or macOS matrix. The release remains blocked until a hosted run confirms all
  three jobs and publishes the updater manifest. The JavaScript chunk-size
  warning is unrelated to these failures and remains a later performance task.
- **Next:** Commit and push this correction, then inspect the resulting Desktop
  release run until Apple Silicon, Intel, Windows, publish, manifest
  verification, and version synchronization all complete successfully.

## 2026-07-12 — Build the Warm Adda redesign and end Intel releases

- **Completed:** Replaced the permanent three-column/member-panel layout with
  the Warm Adda channel shelf, conversation/settings canvas, header avatar
  cluster, accessible People drawer, and one persistent voice bar. Added a
  parser-blocking System/Light/Dark first-paint bootstrap, semantic oat/stone and
  charcoal theme tokens, per-channel drafts, in-shell Profile/Audio &
  Video/Appearance settings, explicit microphone/output tests, private avatar
  upload/replace/remove behavior, and a bar-anchored searchable soundboard
  drawer. Added admin-only create/rename controls for text and voice channels,
  stable-ID Realtime reconciliation, snapshot/event race protection, and
  profile/avatar sequencing. Added the private avatar Storage migration,
  `profiles.avatar_path`, profile/channel Realtime publication, and guarded
  `create_channel`/`rename_channel` RPCs. Removed Intel macOS from future
  release builds and hardened asset/updater-manifest verification for Apple
  Silicon macOS plus Windows x64 only.
- **Decisions:** Keep v0.4.0 as the final Intel release without remotely
  disabling installed clients. Keep `avatar_url` for older clients while new
  clients prefer private owner-prefixed `avatar_path` objects. Upload a new
  avatar before the canonical profile update, clean failed uploads, and delete
  replaced objects best-effort. Keep direct channel table mutation revoked and
  authorize exact-server admins inside blank-search-path security-definer RPCs.
  Subscribe before catch-up snapshots and replay buffered Realtime events so a
  stale snapshot cannot overwrite a newer profile or channel. Channel delete,
  reorder, topic editing, and kind conversion remain excluded.
- **Validation:**
  - Final `pnpm check` — passed formatting, zero-warning lint, strict
    TypeScript, 32 Vitest files with 138 tests, nine Node release/version tests,
    version synchronization, production build, and compiled-artifact secret
    scanning. Vite still reports the existing non-blocking renderer chunk over
    500 kB.
  - `pnpm dlx supabase@latest db reset` — passed and applied all migrations
    through `202607120003_profile_avatars_and_channel_management.sql` to a clean
    local database.
  - `pnpm dlx supabase@latest db lint --local` — passed with no schema errors.
  - `pnpm dlx supabase@latest test db` — passed all six pgTAP files and 141
    assertions, including avatar owner/shared-member/cross-server policies,
    direct channel-write denial, admin/member RPC boundaries, name validation,
    append ordering, and stable rename IDs. Supabase and Colima were stopped
    afterward, restoring the original local runtime state.
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` — passed.
  - `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib`
    — passed all six native tests.
  - `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml` —
    passed.
  - Final `pnpm tauri:build:local` — passed and produced the current
    ad-hoc-signed `Bakbak.app`; notarization was skipped because distribution
    credentials remain absent.
  - `codesign --verify --deep --strict --verbose=4
src-tauri/target/release/bundle/macos/Bakbak.app` — passed.
    `file` reported a Mach-O 64-bit arm64 executable, `lipo -archs` reported
    only `arm64`, and the post-build `pnpm security:scan` passed for `dist` and
    the release bundle.
  - In-app browser mock QA — exercised Light and Dark at 1280×800 and 1024×680,
    settings navigation, People focus restoration, an active call across text
    and settings, soundboard search/Escape dismissal, and a clean runtime
    console. The visual checkpoint preceded the final non-layout
    Realtime/media cleanup and avatar-upload focus-ring adjustments.
- **Documentation updated:** Added
  `docs/plans/0004-warm-adda-ui-settings-channels-arm64.md`; updated
  `docs/architecture.md`, `docs/plans/0001-bakbak-desktop-v1.md`, `README.md`,
  and this canonical progress log.
- **Known limitations:** Migration `202607120003...` is validated locally but
  not deployed to the hosted Supabase project. The canonical live
  browser-plus-native two-account rehearsal, profile/channel propagation against
  hosted Realtime, real microphone/output/camera/share observation, hosted
  Apple Silicon/Windows release jobs, updater installation, and no-Intel-asset
  publication proof remain pending. Local macOS output is ad-hoc signed and not
  notarized; Windows was not built locally. The existing renderer chunk-size
  warning remains a later performance task.
- **Next:** Run a hosted migration dry run, deploy the additive migration, then
  complete the plan 0004 browser-plus-native two-account rehearsal. If it
  passes, publish the next release with only the Apple Silicon DMG and Windows
  x64 installer and verify that `latest.json` contains no Intel macOS target.

## 2026-07-13 — Deploy the Warm Adda profile and channel migration

- **Completed:** Connected through the repository's existing Supabase CLI link,
  confirmed the hosted migration ledger matched local migrations through
  `202607120002`, dry-ran the single pending migration, and deployed
  `202607120003_profile_avatars_and_channel_management.sql`. Verified the
  hosted ledger now matches every tracked migration through `202607120003`.
- **Decisions:** Used the linked CLI deployment path rather than dashboard login
  because the existing login role authenticated successfully. Applied only the
  one tracked migration reported by the dry run; no seed data, user accounts,
  invite codes, Edge Functions, or unrelated hosted configuration changed.
- **Validation:**
  - Initial `pnpm dlx supabase@latest migration list` — passed; local and remote
    matched through `202607120002`, with only `202607120003` pending remotely.
  - `pnpm dlx supabase@latest db push --dry-run` — passed and reported exactly
    `202607120003_profile_avatars_and_channel_management.sql` as pending.
  - `pnpm dlx supabase@latest db push` — passed and applied the migration to the
    linked hosted database.
  - Final `pnpm dlx supabase@latest migration list` — passed; local and remote
    migration versions match through `202607120003`.
- **Documentation updated:** `docs/architecture.md`,
  `docs/plans/0001-bakbak-desktop-v1.md`,
  `docs/plans/0004-warm-adda-ui-settings-channels-arm64.md`, and
  `docs/progress.md`.
- **Known limitations:** Deployment verifies migration history and the database
  transaction, but the live browser-plus-native two-account acceptance run has
  not yet exercised login, private avatar reads/writes, profile Realtime, or
  admin channel creation/rename through the new client. A credential-level Auth
  failure would be separate from this schema migration.
- **Next:** Fully quit and restart the live Bakbak client, retry sign-in, and run
  the plan 0004 two-account profile/channel rehearsal. If login still fails,
  capture the exact visible error plus the browser/native console entry before
  changing Auth or invite data.

## 2026-07-13 — Accept Tauri updater manifest aliases

- **Completed:** Diagnosed Desktop release run `29220835128` and confirmed its
  validation, Apple Silicon, and Windows jobs passed while publish failed only
  because the repository verifier treated Tauri Action's generic and
  bundle-specific updater keys as duplicates. Downloaded the draft `v0.5.0`
  `latest.json`, confirmed it contains `darwin-aarch64`,
  `darwin-aarch64-app`, `windows-x86_64`, and `windows-x86_64-nsis`, then
  updated verification to accept only those aliases and validate every included
  entry. Pinned Tauri Action v1.0.0 to immutable commit
  `1deb371b0cd8bd54025b384f1cd735e725c4060f`.
- **Decisions:** Preserve generic keys for updater compatibility while allowing
  only the observed App and NSIS bundle aliases; do not broadly accept arbitrary
  target suffixes. Keep Intel macOS rejection ahead of the general unsupported
  target check, and require a URL and signature on every accepted alias so an
  invalid duplicate cannot hide behind a valid generic entry.
- **Validation:**
  - `gh run view 29220835128 --json ...` and `gh run view 29220835128
--log-failed` — confirmed `prepare`, `validate`, macOS Apple Silicon, and
    Windows x64 passed; only publish's manifest verifier failed on the two macOS
    aliases.
  - `gh release view v0.5.0 --json ...` and `gh release download v0.5.0
--pattern latest.json ...` — passed; confirmed the draft has one DMG, one
    Windows installer, their signed updater artifacts, and the four expected
    manifest keys.
  - `node --test scripts/release-version.test.mjs scripts/set-version.test.mjs`
    — passed all 10 focused release tests, including the four-key manifest,
    per-alias signature validation, unsupported suffix rejection, and immutable
    Action pin.
  - `node scripts/verify-updater-manifest.mjs
/tmp/bakbak-v0.5.0-manifest/latest.json 0.5.0` — passed against the exact
    manifest that failed in the hosted publish job.
  - Initial `pnpm check` — failed only because Prettier requested formatting in
    `scripts/verify-updater-manifest.mjs`; the touched files were formatted and
    the complete command was rerun.
  - Final `pnpm check` — passed formatting, zero-warning lint, strict
    TypeScript, 32 Vitest files with 138 tests, 10 release-script tests, version
    synchronization, production build, and compiled-artifact secret scanning.
    The existing non-blocking renderer chunk warning remains.
- **Documentation updated:** `docs/architecture.md` and `docs/progress.md`; the
  accepted scope and phase criteria did not change, so no plan checkbox moved.
- **Known limitations:** The patched verifier passes the downloaded hosted
  manifest, but GitHub Actions has not yet rerun the publish and version-sync
  jobs from a commit containing this fix. Tauri bundle builds were not rerun
  locally because both hosted build jobs already passed and this change affects
  only post-build JavaScript verification and Action version pinning.
- **Next:** Commit and push the fix, then confirm the next Desktop release run
  publishes draft `v0.5.0` and completes its protected-branch version-sync PR.

## 2026-07-13 — Add voice chat, stable mentions, overlay settings, and accents

- **Completed:** Added structured text/mention content with older-client body
  fallbacks, secured message/activity/read RPCs, private monotonic read states,
  voice-channel message access, Realtime read synchronization, and safe history
  baselines for existing and newly invited members. Refactored chat into a
  shared text/voice surface with an accessible member combobox and dynamic
  stable-ID mention rendering. Added the responsive voice-chat dock and shared
  text/voice unread styling. Replaced the in-canvas settings surface with a
  full-app focus-trapped overlay, kept compact call controls available, moved
  confirmed logout into its navigation, and preserved selected channels,
  drafts, and calls. Added v2 local appearance preferences with Coral, Purple,
  Red, and Yellow accents plus 25–100% intensity, including first-paint
  application and v1 migration. Removed only the radial gradient from the app
  loading state.
- **Decisions:** Keep message `body` as the compatibility fallback while the
  database owns structured-content validation and current mention fallback
  names. Treat only messages by another user as unread. Advance read state only
  when the relevant chat is actually visible, so a selected voice room with a
  collapsed dock can become unread. Keep appearance device-local, use one accent
  across themes, and calculate separate accessible foreground/surface/focus
  tokens instead of reducing control contrast with intensity. Keep the new
  migration local until the browser-plus-native rollout is explicitly started.
- **Validation:**
  - `CI=true pnpm dlx supabase@latest db reset` — passed and applied all tracked
    migrations through
    `202607130001_voice_chat_mentions_and_read_state.sql` to a clean local
    database.
  - `CI=true pnpm dlx supabase@latest db lint --local --schema public,private`
    — passed with no schema errors.
  - `CI=true pnpm dlx supabase@latest test db` — passed all seven pgTAP files
    with 167 assertions, including same-server voice messages, malformed and
    cross-server mention rejection, private/monotonic markers, size and
    mention-count bounds, unread activity, and existing/new-member baselines.
    Supabase and Colima were stopped after validation.
  - Initial `CI=true pnpm check` — stopped before project checks because pnpm
    tried to recreate `node_modules` and sandbox DNS blocked the registry. The
    frozen lockfile was restored with the approved network path. The next run
    reached lint and identified 12 unsafe structured-content reads plus two
    warnings; those parsing, hook dependency, and Fast Refresh issues were
    corrected.
  - Final `CI=true pnpm check` — passed formatting, zero-warning lint, strict
    TypeScript, 33 Vitest files with 150 tests, 10 release-script tests, version
    synchronization, production build, and compiled-artifact secret scanning.
    The existing non-blocking renderer chunk warning remains.
  - In-app browser mock QA — passed mention lookup/selection, the full settings
    overlay, runtime accent tokens, a right-side voice-chat dock at 1280×800,
    and its slide-over form at 1024×680 with no console errors. This check caught
    and corrected an inherited voice-room grid rule that initially pushed the
    dock below the room.
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` — passed.
  - `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --lib`
    — passed all six native tests.
  - `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml` —
    passed.
  - `CI=true pnpm tauri:build:local` — passed and produced the current
    ad-hoc-signed Apple Silicon `Bakbak.app`; notarization was skipped because
    distribution credentials are unavailable.
  - `codesign --verify --deep --strict --verbose=4
src-tauri/target/release/bundle/macos/Bakbak.app` — passed. `file` reported a
    Mach-O 64-bit arm64 executable, `lipo -archs` reported `arm64`, and the
    post-build `pnpm security:scan` passed for `dist` and the release bundle.
- **Documentation updated:** Added
  `docs/plans/0005-voice-chat-mentions-settings-accents.md`; updated
  `docs/architecture.md`, `docs/plans/0001-bakbak-desktop-v1.md`, and this
  canonical progress log.
- **Known limitations:** The additive plan 0005 migration is validated locally
  but not deployed to hosted Supabase. The canonical live browser-plus-native
  two-account run still needs to verify voice-chat delivery, cross-client read
  synchronization, historical mention rename propagation, active-call settings
  continuity, reduced motion, and the full Light/Dark accent-intensity matrix.
  The local macOS app is ad-hoc signed and not notarized; Windows was not built
  locally. Mention-only notifications and `@everyone` remain intentionally out
  of scope.
- **Next:** Dry-run and deploy migration `202607130001` to the linked hosted
  Supabase project, restart both upgraded clients, then complete plan 0005's
  browser-plus-native two-account acceptance matrix before distribution.

## 2026-07-13 — Deploy voice-chat, mention, and read-state migration

- **Completed:** Inspected the native-client failure showing “Messages could not
  be loaded,” verified the upgraded renderer was ahead of the hosted schema, and
  confirmed `202607130001_voice_chat_mentions_and_read_state.sql` was the only
  pending migration. Dry-ran and deployed that migration through the repository's
  existing linked Supabase project, then verified the hosted migration ledger
  matches every tracked local migration through `202607130001`.
- **Decisions:** Applied only the single migration named by both the ledger and
  dry run. Did not alter Auth users, invite codes, LiveKit, Storage objects, Edge
  Functions, or existing message history. Kept anonymous table access denied;
  an anonymous REST probe correctly received `42501` instead of weakening RLS
  merely to make a diagnostic request pass.
- **Validation:**
  - Initial `CI=true pnpm dlx supabase@latest migration list` — passed; local and
    remote histories matched through `202607120003`, with only `202607130001`
    pending remotely.
  - `CI=true pnpm dlx supabase@latest db push --dry-run` — passed and named only
    `202607130001_voice_chat_mentions_and_read_state.sql`.
  - `CI=true pnpm dlx supabase@latest db push` — passed and applied the single
    migration to the linked hosted database.
  - Final `CI=true pnpm dlx supabase@latest migration list` — passed; local and
    remote histories match through `202607130001`.
  - Anonymous hosted REST probe for `messages.id,content` — reached the hosted
    API and returned the expected `42501 permission denied for table messages`;
    anonymous access remains closed. The signed-in native client must be
    refreshed to complete user-session verification.
- **Documentation updated:** `docs/architecture.md`,
  `docs/plans/0001-bakbak-desktop-v1.md`,
  `docs/plans/0005-voice-chat-mentions-settings-accents.md`, and this canonical
  progress log.
- **Known limitations:** The hosted transaction and ledger are verified, but the
  current signed-in native session has not yet been refreshed and observed after
  deployment. The full browser-plus-native two-account delivery, read-sync, and
  historical mention-rename acceptance matrix remains open.
- **Next:** Fully quit and reopen Bakbak, select a text channel, and send one
  message. Then open a voice-channel chat and complete the plan 0005 two-account
  read-state and rename-propagation rehearsal.

## 2026-07-14 — Plan 0006 slice 1: shell, Flat surfaces, modal settings, and text-only chat

- **Completed:** Replaced the People drawer with a default-visible 240 px
  online/offline member panel and added independent persisted header toggles for
  it and the 232 px channel panel. Implemented all four in-flow panel layouts,
  reduced shell spacing and comparable non-semantic radii by about half, added
  `surfaceStyle` and the v3 appearance migration/bootstrap, and implemented
  crisp Warm/Flat surfaces across auth, invite, shell, voice, and settings.
  Replaced the full-app settings presentation with a centered, internally
  scrolling, focus-trapped modal. Removed upgraded-client voice chat, drafts,
  loads, subscriptions, sends, unread markers, and notification behavior while
  keeping text chat/mentions and the deployed database compatibility contract.
- **Decisions:** Panel visibility remains entirely user controlled even at
  1024×680; the layout never silently substitutes drawers or responsive hiding.
  Appearance v1/v2 migrates to Warm so existing devices keep their visual
  intent. Voice-message rows, RPCs, policies, and older-client behavior remain
  untouched; the renderer filters known text-channel IDs instead of performing
  a destructive migration.
- **Validation:**
  - Focused Vitest runs — passed layout default/corruption/persistence, all four
    shell states and accessible toggles, appearance v1/v2-to-v3 migration,
    parser-blocking Flat first paint, settings focus/Escape/backdrop/logout, and
    upgraded-client voice-chat absence while text chat remains available.
  - In-app browser mock QA at 1280×800 and 1024×680 — passed all four panel
    combinations, exact 232/flexible/240 px allocation, Warm/Flat with
    Light/Dark, centered 1000×720 maximum settings sizing, 23.5 px compact-
    viewport margins, internal Appearance scrolling, Escape focus restoration,
    and zero console warnings.
- **Documentation updated:** Added
  `docs/plans/0006-discord-shaped-bakbak-hearted-ui.md`; marked conflicting UI
  decisions in plans 0004 and 0005 as superseded; updated the main v1 plan,
  `docs/architecture.md`, and this canonical progress log.
- **Known limitations:** The final repository/native gate ran after slice 2 and
  is recorded in the next entry. The browser-plus-native two-account media call
  remains a human acceptance task. The updater-enabled build cannot run locally
  without the protected `TAURI_SIGNING_PRIVATE_KEY`.
- **Next:** Complete and validate plan 0006 slice 2's call controls and joined
  voice canvas, then perform the canonical two-account media rehearsal.

## 2026-07-14 — Plan 0006 slice 2: floating call controls and simplified voice canvas

- **Completed:** Replaced the layout-consuming voice bar with a centered global
  dock that reveals after connection, keyboard focus, or lower-canvas pointer
  movement and hides after 2.5 seconds idle. It stays pinned for hover, focus,
  More, and soundboard; clears the text composer; and is suppressed by settings.
  Added direct microphone, camera, screen-share, soundboard, More, and disconnect
  actions plus Deafen/Audio & Video inside More. Added the sidebar call block and
  compact user-row call actions, reusable accurately labelled backend latency,
  and normalized local LiveKit quality handling. Simplified pre-join to one
  room/occupancy card and joined voice to equal participant tiles, compact error
  banners, and the existing featured-share stage with a participant strip.
- **Decisions:** Reconnecting display takes precedence over connection quality,
  and teardown resets quality to Unknown. Soundboard is a dock-owned surface and
  therefore pins above it until closed. Existing camera, remote-volume,
  soundboard audio, selected-presenter, and native/renderer screen-capture paths
  remain behaviorally unchanged.
- **Validation:**
  - `pnpm format:check` — passed; all matched files use Prettier formatting.
  - `pnpm lint` — passed with zero warnings.
  - `pnpm typecheck` — passed both renderer and Node TypeScript projects.
  - `pnpm test` — passed 36 Vitest files with 160 tests plus all 10 release
    script tests.
  - `pnpm version:check` — passed; version `0.6.0` is synchronized.
  - `pnpm build` — passed; produced 69.75 kB CSS and 1,125.48 kB JavaScript.
    Vite retained the existing non-blocking large-chunk warning.
  - `pnpm security:scan` — passed after the renderer build and again after the
    native bundle for `dist` and `src-tauri/target/release/bundle`.
  - In-app browser mock QA at 1024×680 — passed compact pre-join, joined
    participant grid, no voice chat, sidebar controls/Excellent quality, dock
    idle hiding and lower-edge reveal, More-menu pinning beyond 2.5 seconds,
    soundboard pinning with a 10 px non-overlapping dock gap, text-composer
    clearance, active-call text/settings navigation, settings compact controls,
    disconnect, and zero console warnings. The 1280×800 shell/settings pass from
    slice 1 also remained clean.
  - `pnpm tauri:build:local` — passed and produced an ad-hoc-signed Apple
    Silicon `Bakbak.app`. Notarization was skipped because Apple credentials are
    unavailable.
  - `codesign --verify --deep --strict --verbose=4
src-tauri/target/release/bundle/macos/Bakbak.app` — passed. `file` identified
    a Mach-O 64-bit arm64 executable and `lipo -archs` returned `arm64`.
  - Updater-enabled `pnpm tauri build` — skipped because the protected
    `TAURI_SIGNING_PRIVATE_KEY` is unavailable in this local environment.
- **Documentation updated:** Completed plan 0006's implemented and mock-tested
  criteria; updated `docs/architecture.md`, the active v1 plan, supersession
  notes in plans 0004/0005, and this canonical progress log.
- **Known limitations:** Automated/mock validation cannot prove cross-device
  audio, real camera/screen tracks, LiveKit quality transitions, reconnect, or
  exact-once soundboard playback. The required browser-plus-native two-account
  call remains open, as do release signing/notarization and Windows-native
  acceptance. The production renderer still emits the existing large-chunk
  warning.
- **Next:** Run the canonical browser-plus-native two-account call in Warm/Flat
  and Light/Dark, covering both control surfaces, panel hiding, text/settings
  navigation, mute/deafen, camera, screen share, soundboard, device changes,
  quality changes, reconnect, and disconnect before distribution.

## 2026-07-14 — Compact soundboard and native interface zoom

- **Completed:** Reworked the dock-owned soundboard into a centered 480×380
  maximum popover with one compact search/action header, category chips,
  three-column 44 px sound rows, and an internally scrolling catalog. Preserved
  filtering, playback, loading/retry, editing, volume, stop-all, deafen status,
  dock pinning, and text-composer clearance. Enabled Tauri's native Cmd/Ctrl
  `+`, Cmd/Ctrl `-`, and Cmd/Ctrl `0` interface zoom for the main window.
- **Decisions:** Used the native Tauri webview zoom implementation instead of
  renderer-level CSS scaling so keyboard and wheel zoom follow desktop-window
  behavior. Granted only `core:webview:allow-set-webview-zoom`. Used the CSS
  individual `translate` property for soundboard centering so the existing
  entrance animation cannot overwrite horizontal placement.
- **Validation:**
  - `pnpm exec vitest run src/features/soundboard/Soundboard.test.tsx
src/app/native-zoom.test.ts` — passed 2 files and 5 tests.
  - Initial `pnpm test -- src/features/soundboard/Soundboard.test.tsx
src/app/native-zoom.test.ts` — unsuitable focused invocation: Vitest passed
    all 37 files/162 tests, but the package script also forwarded the source
    arguments to Node's release-script runner. Re-ran the focused tests with
    `pnpm exec vitest run` and the canonical suite with `pnpm check`.
  - `pnpm check` — passed formatting, lint, renderer/Node typechecks, 37 Vitest
    files with 162 tests, 10 release-script tests, version `0.6.0` sync, the
    production build, and the secret scan. Vite retained the existing
    non-blocking large-chunk warning; output was 72.01 kB CSS and 1,125.32 kB
    JavaScript.
  - In-app browser mock QA at 1024×680 and 1280×800 — passed exact 480×380
    maximum sizing, three columns, 44 px sound rows, horizontal centering, 10 px
    soundboard-to-dock clearance, 10 px dock-to-composer clearance, internal
    clipping/scrolling, and zero console errors.
  - `pnpm tauri:build:local` — passed and produced the ad-hoc-signed Apple
    Silicon `Bakbak.app`; notarization was skipped because Apple credentials are
    unavailable.
  - `codesign --verify --deep --strict --verbose=4
src-tauri/target/release/bundle/macos/Bakbak.app` — passed. `file` identified
    a Mach-O 64-bit arm64 executable and `lipo -archs` returned `arm64`.
  - Final `pnpm security:scan` — passed for `dist` and the native bundle.
- **Documentation updated:** Updated plan 0006, the active v1 plan,
  `docs/architecture.md`, and this canonical progress log.
- **Known limitations:** Browser automation cannot exercise Tauri-owned zoom
  hotkeys; the config test and native bundle validate their wiring, while a
  native-window keystroke remains a manual smoke check. The updater-enabled
  build remains skipped because the protected `TAURI_SIGNING_PRIVATE_KEY` is
  unavailable. The canonical browser-plus-native two-account call is still
  pending.
- **Next:** Open the generated native app, smoke-test Cmd `+`, Cmd `-`, and Cmd
  `0`, then include soundboard search/scroll/playback in the pending two-account
  call rehearsal.

## 2026-07-14 — Voice-channel auto-join

- **Completed:** Made voice-channel selection immediately join that room and
  made selecting another voice channel switch the active call. Removed the
  manual pre-join room/occupancy card, Join and microphone-check actions, the
  initial “Joining quietly” surface, and their unused styles. Kept sidebar
  occupancy, reconnect feedback, connection-error retry, settings device
  access, generation-gated switching, and the joined participant/share canvas.
- **Decisions:** Text-channel selection continues to navigate without changing
  an active call. Re-selecting the current room does not reconnect unless the
  call is disconnected or errored. Creating and selecting a new voice channel
  now follows the same auto-join rule.
- **Validation:**
  - `pnpm exec vitest run src/app/App.test.tsx
src/features/voice/VoiceRoom.test.tsx` — passed 2 files and 7 tests,
    including auto-join, room switching, and pre-join surface absence.
  - In-app browser mock QA at 1024×680 — passed Coffee table auto-join, direct
    participant-canvas rendering, switching to Quiet co-work, absence of Join/
    “Joining quietly” UI, and zero console errors.
  - `pnpm check` — passed formatting, lint, renderer/Node typechecks, 37 Vitest
    files with 162 tests, 10 release-script tests, version `0.6.0` sync, the
    production build, and the secret scan. Vite retained the existing
    non-blocking large-chunk warning; output was 71.04 kB CSS and 1,123.88 kB
    JavaScript.
  - `pnpm tauri:build:local` — passed and produced the ad-hoc-signed Apple
    Silicon `Bakbak.app`; notarization was skipped because Apple credentials are
    unavailable.
  - `codesign --verify --deep --strict --verbose=4
src-tauri/target/release/bundle/macos/Bakbak.app` — passed.
  - Final `pnpm security:scan` — passed for `dist` and the native bundle.
- **Documentation updated:** Updated plan 0006, the active v1 plan,
  `docs/architecture.md`, and this canonical progress log.
- **Known limitations:** Browser/mock validation cannot prove real permission
  prompts, cross-device LiveKit room switching, or audio continuity. The
  canonical browser-plus-native two-account call remains pending. The
  updater-enabled build remains skipped because the protected
  `TAURI_SIGNING_PRIVATE_KEY` is unavailable.
- **Next:** In the two-account rehearsal, click directly between both voice
  rooms and confirm remote presence/audio leave the old room and enter the new
  room exactly once.

## 2026-07-14 — Voice join acceleration and soundboard polish

- **Completed:** Added LiveKit endpoint prewarming plus 150 ms voice-channel
  hover/focus preparation, one-channel prepared-room/token reuse with a
  30-second expiry margin, click-time concurrent microphone acquisition,
  direct-switch microphone reuse, ten-minute in-memory relay preference, and
  development-only join-stage timings. Kept soundboard publication settlement
  as a required connection gate. Replaced the connecting/reconnecting blank
  canvas with a polite stage loader. Added compact solo/pair/group participant
  sizing, larger avatars, animated newest-sound emoji replacement/overlay, and
  reduced-motion behavior. Added a shared five-sound pending/active limit,
  newest-five remote clamping, failure rollback, pending-start cancellation, a
  sticky drawer stop footer, and a dock emergency stop that pins itself while
  sounds are active. Added the
  security-invoker `get_voice_join_context` migration and changed the token
  function from remote `getUser` plus serial table requests to verified
  `getClaims` plus one RLS-protected RPC.
- **Decisions:** Preparation never requests media, publishes presence, or joins
  a room. Slow asset fetches retain their sound reservation until playback or
  failure, so the limit cannot expire underneath pending work. Direct switches
  unpublish the microphone with `stopOnUnpublish=false` while the old room still
  tears down every other track. A relay success affects only this process for
  ten minutes; direct routing is probed again after expiry or immediately when
  relay-first fails. The sender enforces five sounds, while upgraded receivers
  defensively render the newest five from older clients. The migration and
  function are tracked locally but were not deployed as part of this task.
- **Validation:**
  - `pnpm exec vitest run src/features/voice/useVoiceRoom.test.tsx
src/features/voice/VoiceRoom.test.tsx
src/features/voice/VoiceControlDock.test.tsx
src/features/soundboard/Soundboard.test.tsx
src/features/channels/ChannelSidebar.test.tsx` — final run passed 5 files and
    46 tests. The first run had one test-only assertion expecting two track
    publications where the unavailable mock audio graph correctly produced
    one; the assertion now checks the actual invariant that a failed start
    publishes no sound activity event.
  - `deno task --config supabase/deno.json test` — passed 15 Edge Function
    tests, including verified claims and fail-closed malformed/error cases.
  - `deno task --config supabase/deno.json check` — passed lint for 10 files and
    typechecking of `livekit-token/index.ts`.
  - `pnpm dlx supabase@latest test db` — could not run because no local
    Supabase/Postgres stack was available. `pnpm dlx supabase@latest start
--exclude vector` also could not start because the Docker daemon was not
    running. The new 10-assertion pgTAP suite is tracked but remains unexecuted.
  - Initial `pnpm check` — formatting passed, then lint failed on seven new test
    double/style findings. They were corrected; no product-code failure was
    hidden.
  - Final `pnpm check` — passed formatting, lint, renderer/Node typechecks, 37
    Vitest files with 182 tests, 10 release-script tests, version `0.6.0` sync,
    production build, and secret scan. Vite retained the existing non-blocking
    large-chunk warning; output was 74.87 kB CSS and 1,130.38 kB JavaScript.
  - In-app mock-browser QA at 1024×680 and 1280×800 — passed the connecting
    status, responsive three-person grid, 96 px group avatars, representative
    Warm Light plus Flat Light/Dark styling, 1000×720 maximum settings sizing,
    all four panel combinations, five-click cap, drawer/dock stop controls,
    corrected footer clipping, 10 px drawer-to-dock clearance, and zero page
    overflow. The mock's intentional 420 ms join delay is not a hosted latency
    measurement.
  - `pnpm tauri:build:local` — passed and produced the ad-hoc-signed Apple
    Silicon `Bakbak.app`; notarization was skipped because Apple credentials are
    unavailable.
  - `codesign --verify --deep --strict --verbose=4
src-tauri/target/release/bundle/macos/Bakbak.app` — passed. `file` identified a
    Mach-O 64-bit arm64 executable and `lipo -archs` returned `arm64`.
  - Final `pnpm security:scan` — passed for `dist` and the native bundle.
- **Documentation updated:** Added plan 0007, updated the active v1 plan,
  documented voice preparation/token/microphone/relay/participant/sound-limit
  contracts in `docs/architecture.md`, updated `supabase/README.md`, and
  appended this canonical progress entry.
- **Known limitations:** Warm/cold hosted join timings were not measured, so the
  1.5/3-second targets are not yet claimed. The additive migration and updated
  token function are not deployed. The pgTAP suite is blocked on a running
  Docker-backed Supabase stack. The canonical browser-plus-native two-account
  audio/media rehearsal remains pending. The updater-enabled Tauri build was
  skipped because `TAURI_SIGNING_PRIVATE_KEY` is absent; the local app-only
  build does not exercise updater signing.
- **Next:** Start Docker and run the 10 RPC assertions, then push the migration
  before deploying `livekit-token`. Repeat unauthenticated/member/non-member
  probes, measure cold and prepared warm joins, and finish the browser-plus-
  native direct-switch/sound-overlap/reconnect/Leave rehearsal.

## 2026-07-14 — Hosted voice-join authorization rollout

- **Completed:** Deployed additive migration
  `202607140001_voice_join_context.sql` to the linked hosted Supabase project,
  then deployed the updated `livekit-token` Edge Function with the new
  `getClaims` verifier and one-query voice-context lookup. Confirmed local and
  remote migration history match through `202607140001`. Confirmed the hosted
  function is ACTIVE at version 5 with `verify_jwt` still enabled.
- **Decisions:** Kept the rollout migration-first so the new function never ran
  before its RPC dependency existed. Used the Supabase server-side `--use-api`
  bundler to avoid the known local `output.eszip` race. Reused the existing
  platform-managed LiveKit secrets without reading or changing them. Did not
  create durable Auth users merely to manufacture member/non-member probe
  credentials; those checks will reuse the existing two-account acceptance
  sessions.
- **Validation:**
  - `pnpm dlx supabase@latest db push --dry-run` — passed; reported exactly one
    pending migration, `202607140001_voice_join_context.sql`.
  - `pnpm dlx supabase@latest db push` — passed; applied
    `202607140001_voice_join_context.sql`.
  - `pnpm dlx supabase@latest migration list` — passed; all 11 local/remote
    migration versions match through `202607140001`.
  - `pnpm dlx supabase@latest functions deploy livekit-token --use-api` —
    passed and uploaded the new `auth.ts` module with the existing handler,
    signer, request, CORS, and HTTP modules.
  - `pnpm dlx supabase@latest functions list` — passed; `livekit-token` is
    ACTIVE at version 5 with `verify_jwt: true` and an import map.
  - Unauthenticated hosted `POST /functions/v1/livekit-token` — returned HTTP
    401 as required.
  - Hosted `POST /rest/v1/rpc/get_voice_join_context` using only the public
    anonymous credential — returned HTTP 401 as required.
  - `deno task --config supabase/deno.json test` — passed all 15 Edge Function
    tests.
  - `deno task --config supabase/deno.json check` — passed lint for 10 files and
    typechecking of the deployed function entrypoint.
  - `pnpm check` — passed formatting, lint, renderer/Node typechecks, 37 Vitest
    files with 182 tests, 10 release-script tests, version `0.6.0` sync,
    production build, and secret scan. Vite retained the existing non-blocking
    large-chunk warning; output remained 74.87 kB CSS and 1,130.38 kB
    JavaScript.
- **Documentation updated:** Marked the hosted backend deployed in plan 0007,
  the active v1 plan, and `docs/architecture.md`; appended this canonical
  rollout entry.
- **Known limitations:** Authenticated member/non-member hosted token probes
  were not run because this checkout has no reusable test-session credentials.
  The 10-assertion pgTAP RPC suite is still blocked on a running local Docker/
  Supabase stack. Warm/cold hosted timing and the canonical browser-plus-native
  two-account media rehearsal remain open. The Supabase CLI also emits a
  non-blocking warning that `[inbucket]` is deprecated in favor of
  `[local_smtp]`.
- **Next:** Use the existing signed-in browser and native test accounts to
  verify member voice success plus non-member/text/missing-channel not-found
  behavior, then capture cold and prepared warm join timings during the
  two-account rehearsal.

## 2026-07-16 — Target mute at the speech microphone

- **Completed:** Named the real speech publication `bakbak-microphone` and
  added one selector that prefers that name while falling back to an unnamed,
  non-soundboard microphone publication for older clients. Mute/unmute now
  controls that exact local publication instead of LiveKit's first
  microphone-source track. Participant mute indicators and direct room-switch
  microphone reuse use the same selector. Added actionable mute/unmute failure
  feedback without changing the displayed state, and expanded the LiveKit test
  double to model both microphone-source publications with the soundboard
  deliberately arriving first.
- **Decisions:** Kept `bakbak-soundboard` on `Track.Source.Microphone` because
  the current restricted token grant cannot encode `Track.Source.Unknown`.
  Track names, not same-source publication order, now separate speech from
  soundboard audio. Mock mode retains its local state-only behavior, and
  outbound soundboard audio remains independent while speech is muted.
- **Validation:**
  - `pnpm exec vitest run
src/features/voice/microphone-publication.test.ts
src/features/voice/useVoiceRoom.test.tsx
src/features/soundboard/soundboard-audio.test.ts` — passed 3 files and 27 tests,
    including soundboard-first publication order, named and legacy speech
    selection, speech-only mute/unmute, independent soundboard unmute, muted
    direct-switch reuse, and mute failure rollback.
  - Initial `pnpm check` — stopped at `format:check` because the architecture
    update needed Prettier formatting; formatted the file and reran.
  - Second `pnpm check` — stopped at lint on three unnecessary test-only type
    assertions; removed them and reran.
  - Final `pnpm check` — passed formatting, lint, renderer/Node typechecks, 38
    Vitest files with 186 tests, 10 release-script tests, synchronized version
    `0.7.0`, the production build, and the secret scan. Vite retained the
    existing non-blocking large-chunk warning; output was 74.87 kB CSS and
    1,130.97 kB JavaScript.
  - `pnpm tauri:build:local` — passed and produced an ad-hoc-signed Apple
    Silicon `Bakbak.app`; notarization was skipped because Apple credentials
    are unavailable.
  - `codesign --verify --deep --strict --verbose=4
src-tauri/target/release/bundle/macos/Bakbak.app` — passed.
  - `file src-tauri/target/release/bundle/macos/Bakbak.app/Contents/MacOS/bakbak`
    and `lipo -archs
src-tauri/target/release/bundle/macos/Bakbak.app/Contents/MacOS/bakbak` —
    identified a Mach-O 64-bit arm64 executable and returned `arm64`.
  - Final `pnpm security:scan` — passed for `dist` and the native bundle.
  - Final `pnpm format:check` and `git diff --check` — passed after appending
    this progress entry.
- **Documentation updated:** Updated `docs/architecture.md` with the named
  speech/soundboard publication contract and appended this canonical progress
  entry. The active plan's manual mute/deafen acceptance checkbox remains open.
- **Known limitations:** Automated tests prove track targeting and state
  behavior but cannot prove that a remote physical client stops hearing the
  microphone. The canonical browser-plus-native two-account audio rehearsal
  was not run. The updater-enabled `pnpm tauri build` was skipped because
  `TAURI_SIGNING_PRIVATE_KEY` is absent; the local app-only build does not test
  updater signing.
- **Next:** Run the browser-plus-native two-account call and verify mute from
  the sidebar, floating dock, and Settings; confirm remote speech stops,
  soundboard playback remains audible, unmute restores speech, and switching
  rooms preserves mute before completing the manual acceptance checkbox.

## 2026-07-17 — Rich animated profiles and Settings focus repair

- **Completed:** Fixed the Settings display-name field losing focus by keeping
  modal focus setup mount-scoped and reading the latest close callback through
  a ref. Rebuilt Profile Settings around one live preview and Save action with
  a 190-character plain-text description, PNG/JPEG/WebP/GIF avatar and cover
  selection, independent removals, 3:1 cover framing, pointer/keyboard focal
  positioning, failed-save retry retention, draft discard, and safe preview URL
  cleanup. Added bounded poster generation with GIF-original retention,
  transactional multi-object uploads/cleanup, a deduplicated private media
  cache, Realtime rich-profile reconciliation, and reduced-motion-aware lazy
  animation loading. Added one accessible anchored view-only profile card to
  member rows, message authors and mentions, voice identities, and the user
  dock, with flip/clamp positioning, profile switching, focus containment/
  restoration, privacy-safe fields, and Warm motion. Added and deployed
  `202607170001_rich_profiles.sql`, expanding private avatars to 5 MiB/GIF and
  adding the private 10 MiB `profile-covers` bucket plus description, animation,
  cover, focal, grants, checks, and Storage policies.
- **Decisions:** Kept profiles global while deriving presence and role from the
  current server. Preserved `avatar_path` as the canonical static poster and
  the legacy `avatar_url` fallback for older clients. Only original GIFs remain
  animated; every format receives a bounded static poster and animated WebP is
  intentionally flattened. Compact GIFs load only on hover/focus, cover media
  only for an open card/editor, and reduced-motion clients never request GIFs.
  The profile card remains view-only and excludes email, UUID, notes, DMs, and
  administrative actions.
- **Validation:**
  - `pnpm exec vitest run
src/features/settings/SettingsPage.test.tsx
src/components/ProfilePopover.test.tsx src/lib/profile-service.test.ts
src/lib/profile-media-cache.test.ts src/app/App.test.tsx
src/features/chat/ChatView.test.tsx
src/features/server/MemberPanel.test.tsx
src/features/channels/ChannelSidebar.test.tsx
src/features/voice/VoiceRoom.test.tsx` — passed 9 files and 47 focused
    tests.
  - Follow-up `pnpm exec vitest run
src/features/settings/SettingsPage.test.tsx` — passed all 19 Settings tests
    after adding dirty-state, failed-save retry, independent removal, pointer
    focal reset, and staged object-URL cleanup coverage.
  - Follow-up profile-trigger integration run across App, profile popover,
    channel sidebar, chat, and voice-room tests — passed 5 files and 25 tests,
    covering card switching, outside/Escape dismissal, message authors,
    mentions, voice occupancy, voice participants, and the signed-in user dock.
  - Initial `pnpm typecheck` after final formatting — failed on two test-only
    duplicate/tuple annotations; corrected both. Final `pnpm typecheck` passed.
  - A pre-final `pnpm check` rerun stopped at `format:check` after this progress
    entry changed; formatted the documentation before the final rerun.
  - Final `pnpm check` — passed formatting, lint, renderer/Node typechecks, 40
    Vitest files with 203 tests, 10 release-script tests, synchronized version `0.8.0`,
    production build, and secret scan. Vite retained the existing non-blocking
    large-chunk warning; output was 82.82 kB CSS and 1,153.88 kB JavaScript.
  - Mock-browser QA at 1280×800 and 1024×680 — passed display-name multi-key
    focus retention, draft discard, responsive editor layout, corrected avatar/
    cover overlap, right/left card placement and viewport clamping, empty
    description fallback, Escape dismissal, and exact-trigger focus
    restoration.
  - `pnpm dlx supabase@latest status` and `colima status` — local database
    validation blocked because Docker/Colima is not running. The new 28-assertion
    pgTAP file is present but was not executed.
  - Pre-deploy `pnpm dlx supabase@latest migration list` — passed and showed
    only local `202607170001` missing remotely.
  - `pnpm dlx supabase@latest db push --dry-run` — passed and reported exactly
    `202607170001_rich_profiles.sql`.
  - `pnpm dlx supabase@latest db push` — passed and applied the rich-profile
    migration to the linked hosted project.
  - `pnpm dlx supabase@latest db lint --linked` — passed with no schema errors.
    A concurrent post-deploy migration-list call stalled after initializing and
    was canceled; the final `db push --dry-run` passed and reported the remote
    database is up to date.
  - `pnpm tauri:build:local` — passed and produced the ad-hoc-signed Apple
    Silicon `Bakbak.app`; notarization was skipped because Apple credentials are
    unavailable.
  - `codesign --verify --deep --strict --verbose=4
src-tauri/target/release/bundle/macos/Bakbak.app` — passed.
    `file` identified a Mach-O 64-bit arm64 executable and `lipo -archs`
    returned `arm64`.
  - Final `pnpm security:scan` and `git diff --check` — passed.
- **Documentation updated:** Added plan 0008, updated the active v1 plan,
  documented rich-profile media, Storage/RLS, cache, Realtime, Settings, and
  popover contracts in `docs/architecture.md`, updated `supabase/README.md`,
  and appended this canonical progress entry.
- **Known limitations:** Docker-backed reset/lint/pgTAP was not available, so
  the new database assertions still need a local run. The live two-account
  Realtime/media matrix, outsider read denial, slow GIF observation, and
  installed-app Light/Dark, Warm/Flat, reduced-motion, pointer, and keyboard
  checks remain pending. The updater-enabled `pnpm tauri build` was skipped
  because `TAURI_SIGNING_PRIVATE_KEY` is absent; the local app-only build does
  not exercise updater signing or notarization.
- **Next:** Start Colima, run Supabase reset/lint/pgTAP, then use two shared-
  server accounts plus one outsider to verify profile propagation, private
  media reads/denial, GIF loading, and reduced-motion behavior in the installed
  application before friend-test distribution.

## 2026-07-17 — Signal Red theme and universal interface audio

- **Completed:** Added the device-local `VisualPreset` boundary and migrated
  appearance persistence/bootstrap from v3 to v4 while retaining exact
  Standard theme, accent, intensity, and surface values. Implemented the fixed
  Dark + Flat Signal Red tokens, locally bundled League Gothic/IBM Plex Mono
  display typography, sharp structural treatment, mixed-case identity/content
  exclusions, special-theme Settings card, disabled Standard controls, static
  noise asset, edge grids/orbits/bars/timecodes, alternating ticker, recurring
  safe-position Bakbak stamps, typed clipped communication labels, modal/
  visibility pausing, and reduced-motion fallback. Replaced the procedural
  message chirp with nine original deterministic 48 kHz/16-bit mono WAVs and
  one system-output Web Audio controller. Added master/55% volume, four
  category controls/previews, first-gesture preload, caching, three-sound
  concurrency, message/failure cooldowns, remote roster batching, reduced
  remote-share gain, and graceful audio failure handling. Wired typed
  message/self/remote voice, local/remote screen-share, reconnect, and
  interruption events through the app and voice lifecycle with explicit
  leave-reason, direct-switch, initial-roster, companion, and deafen semantics.
- **Decisions:** Signal Red changes effective presentation only; it never
  rewrites the user's Standard preferences and is not composable with alternate
  Light/accent choices. Interface sounds run under every visual theme and
  always target the OS system output, leaving call/soundboard output selection
  intact. Only communication lifecycle events are sonified. Bakbak phrases,
  logo geometry, generated texture, and synthesized audio are original; no
  Sentinels marks, slogans, footage, samples, or proprietary fonts are used.
  Fontsource's League Gothic and IBM Plex Mono manifests declare OFL-1.1.
- **Validation:**
  - `pnpm exec vitest run
src/features/settings/appearance-preferences.test.ts
src/features/settings/theme-bootstrap.test.ts
src/features/settings/SettingsPage.test.tsx
src/features/settings/SignalRedEffects.test.tsx
src/features/settings/interface-sound-preferences.test.ts
src/features/settings/interface-sounds.test.ts
src/features/voice/useVoiceRoom.test.tsx` — passed 7 files and 71 focused
    tests.
  - `node --test scripts/generate-interface-sounds.test.mjs` — passed
    deterministic bytes, required names, WAV format, expected duration, fade,
    peak, and total-size assertions. Committed sound assets total 276 KiB.
  - An initial `pnpm test -- <focused files>` attempt ran and passed the full
    40-file/205-test Vitest suite but failed overall because the package script
    forwarded the focused TypeScript paths to Node's `.mjs` test runner. The
    focused rerun used `pnpm exec vitest run` and passed.
  - The first `pnpm check` stopped at lint on a test matcher, timer callbacks,
    and component/helper co-location. Typed assertions, void timer callbacks,
    and a separate scheduler module corrected those findings.
  - Final `pnpm check` — passed formatting, lint, renderer/Node typechecks, 43
    Vitest files with 223 tests, 11 Node tests, synchronized version `0.8.0`,
    production build, and secret scan. Vite retained the existing non-blocking
    large-chunk warning.
  - Mock-browser QA with 1280×800 and 1024×680 viewport overrides — passed
    Signal Red text and voice shells, Appearance and Audio & Video Settings,
    locked Standard controls, live `VOICE LINKED` edge event, fixed tokens,
    content/chrome case boundary, and horizontal-overflow checks with no
    browser errors. The pass exposed profile-name uppercase inheritance; the
    final CSS scopes identity/profile/mention content back to Inter and
    `text-transform: none`.
  - `pnpm tauri:build:local` — passed after the Latin-only font import
    optimization, including strict typecheck and production build. Final output
    was 98.81 kB CSS and 1,168.51 kB JavaScript plus six local font files; the
    app-only Apple Silicon bundle was ad-hoc signed and notarization was skipped
    because Apple credentials are unavailable.
  - `codesign --verify --deep --strict --verbose=4
src-tauri/target/release/bundle/macos/Bakbak.app` — passed. `file` identified a
    Mach-O 64-bit arm64 executable and `lipo -archs` returned `arm64`.
  - Final `pnpm security:scan` and `git diff --check` — passed for the renderer,
    native bundle, and working diff.
- **Documentation updated:** Added plan 0009, updated the active v1 plan, and
  documented Signal Red composition, font/audio ownership and licenses,
  storage keys, effect layering, reduced motion, interface-audio routing, and
  voice/screen lifecycle semantics in `docs/architecture.md`.
- **Known limitations:** Human audio cannot be proven by unit tests or the
  in-app mock browser. The installed-app multi-client matrix for rapid
  messages, simultaneous joins/leaves, local/remote screen sharing, reconnect,
  deafen, preferences, and a call output different from system output remains
  pending. The full updater-enabled `pnpm tauri build` was skipped because
  `TAURI_SIGNING_PRIVATE_KEY` is unavailable; the local app-only build does not
  exercise updater signing or notarization. No database checks ran because
  this phase has no schema, RLS, Supabase, or server changes.
- **Next:** Run two installed clients with call audio routed away from the OS
  default, exercise the plan 0009 audio matrix, verify remote cues disappear
  under deafen while self/Message/Status remain, and then mark installed-app
  acceptance complete.

## 2026-07-17 — Cross-platform screen sharing and focused call media

- **Completed:** Added plan 0010 and superseded the old 1080p/15 and
  always-featured-share contracts. Added validated, device-local 480p/720p/1080p
  and 15/30/60-fps presenter settings with exact 0.8–8 Mbps ceilings, 1080p/60
  first-run defaults, pre-share controls, source-audio opt-in reset, active
  local-share controls, and rollback to the last working profile. Extended the
  Tauri capability/start/update contracts and paused lifecycle. macOS now
  explicitly permits Display, Window, and Application picker modes, updates
  ScreenCaptureKit configuration live, and freezes/mutes after two seconds
  without a complete frame. Added the Windows Screens/Applications picker,
  native handle revalidation and privacy filtering, in-memory WGC thumbnails,
  free-threaded D3D11 capture, frame throttling/reconfiguration, I420 delivery,
  and build-gated WASAPI process-loopback audio that includes an application
  process tree or excludes Bakbak for a display. Replaced the featured stage
  with a participant/share gallery and click-to-focus stage, low/high selective
  subscriptions, source-audio focus policy, fixed bounded media rows,
  `object-fit: contain`, Tauri OS fullscreen cleanup, and paused-source UI.
  Moved soundboard dismissal to the application layer with outside-pointer,
  Escape, channel/disconnect/modal cleanup, opener-focus restoration, and an
  owned-modal marker.
- **Decisions:** The existing least-privilege LiveKit companion and token
  authorization boundary remain unchanged; no database, migration, or Edge
  Function contract changed. Source audio is never persisted and unsupported
  Windows builds stay video-only rather than falling back to unrelated output.
  Gallery shares subscribe to low video/no audio, while only the focused share
  requests high video and source audio. Windows validates renderer-provided
  handles against current native sources before capture. Windows currently
  uses D3D11 capture/staging readback with CPU BGRA scaling/color conversion;
  fully GPU-side conversion remains open instead of being misreported as done.
- **Validation:**
  - `pnpm check` — passed Prettier, ESLint, renderer/Node typechecks, 46 Vitest
    files with 238 tests, 12 Node tests including the bottom-edge CSS
    regression, version synchronization, production build, and compiled secret
    scan. Vite retained the existing non-blocking large-chunk warning; final
    output was 104.83 kB CSS and 1,192.68 kB JavaScript.
  - `cargo test --manifest-path src-tauri/Cargo.toml --locked screen_share
--lib` — passed all 10 macOS/shared screen-share tests, including picker
    modes, all nine quality/bitrate profiles, aspect fitting, first-frame
    timeout, and pause handling.
  - `cargo check --manifest-path src-tauri/Cargo.toml --locked` and `cargo fmt
--manifest-path src-tauri/Cargo.toml --check` — passed.
  - `cargo xwin check --manifest-path src-tauri/Cargo.toml --locked --target
x86_64-pc-windows-msvc --tests` — passed, including compilation of the
    Windows-only source-filter, process-audio mode/build gate, throttle,
    resize, pause, sample conversion, preview, and cleanup paths.
  - `cargo xwin test --manifest-path src-tauri/Cargo.toml --locked --target
x86_64-pc-windows-msvc --no-run` — failed at the cross-host clang linker
    after the MSVC runtime was aligned: upstream LiveKit/WebRTC `PeerContext`
    symbols use incompatible class/struct mangling in this cargo-xwin link.
    This does not prove a native MSVC failure, so a real Windows runner remains
    required.
  - `deno task --config supabase/deno.json check` and `deno task --config
supabase/deno.json test` — passed lint/typecheck and all 15 unchanged token
    regression tests.
  - `pnpm tauri:build:local` — passed the Apple Silicon app-only release build,
    renderer build, ad-hoc signing, and bundle creation. Notarization was
    skipped because Apple credentials are unavailable.
  - `codesign --verify --deep --strict --verbose=2
src-tauri/target/release/bundle/macos/Bakbak.app`, `file`, and `lipo -info`
    — passed; the bundle contains a valid arm64 Mach-O. The pre-existing local
    app artifact was 36,812 KiB and the rebuilt artifact is 36,976 KiB, an
    increase of 164 KiB (about 0.45%). These are app-bundle measurements, not
    the still-pending cross-platform installer comparison.
  - Final `pnpm security:scan` and `git diff --check` — passed for the
    renderer, native bundle, and working diff.
- **Documentation updated:** Added plan 0010; updated plans 0001, 0003, and
  0006; documented the source picker, quality, pause, Windows capture/audio,
  gallery/focus/fullscreen, subscription, and soundboard ownership contracts in
  `docs/architecture.md`; and updated README compatibility/setup notes.
- **Known limitations:** A native Windows MSVC/Tauri build and runtime test were
  not available on this macOS host; cargo-xwin type-checks the Windows code but
  its LiveKit C++ cross-link fails as recorded above. Windows frame scaling and
  color conversion are CPU-side after D3D11 staging readback, not yet the
  requested GPU pipeline. The full updater-enabled `pnpm tauri build` was
  skipped because `TAURI_SIGNING_PRIVATE_KEY` is absent. The macOS/Windows
  installed-client matrix remains pending for every source kind, matched audio
  isolation, minimize/pause/resume, live quality changes, multiple presenters,
  member/share focus, fullscreen/Escape, 1024×680 and 1280×800 bottom-edge
  visibility, deafen/output/volume behavior, soundboard focus behavior, sender
  statistics, and installer-size comparison.
- **Next:** Run a native Windows x64 CI or workstation build, finish GPU-side
  Windows scaling/color conversion, then execute the bidirectional macOS
  14+/Windows installed-client matrix and record sender resolution/FPS stats
  plus signed installer sizes before marking plans 0003/0010 complete.

## 2026-07-18 — Import the Unlucky Boys Discord soundboard

- **Completed:** Inventoried all 21 sounds in the signed-in Unlucky Boys
  Discord soundboard, including the eight currently playable and thirteen
  boost-locked entries. Downloaded each clip from Discord's documented
  soundboard CDN, converted the returned Ogg/Opus audio to 48 kHz MP3, and
  uploaded it to the private hosted Bakbak bucket under stable
  `discord-<Discord sound ID>.mp3` paths. Added and deployed
  `202607180001_import_unlucky_boys_soundboard.sql`, creating the fifth
  `Unlucky Boys` category and 21 catalog rows while preserving the original 23
  sounds. Updated the mock catalog to the same five-category, 44-sound shape
  and added catalog-integrity coverage.
- **Decisions:** Preserved every source sound, including Discord's currently
  boost-locked entries, and enabled them in Bakbak without adding Discord's
  boost entitlement model. Preserved available Unicode emoji and used `🔊`
  where Discord exposed only custom artwork that Bakbak's text-emoji catalog
  cannot represent. Kept audio operator-managed and outside Git; no client
  upload permission or renderer secret was introduced. Corrected six
  unambiguous pgTAP column assertions and updated the rich-profile delete test
  for Supabase's current direct-storage-delete guard after the previously
  blocked local suite exposed those stale test assumptions.
- **Validation:**
  - Discord browser inventory — found exactly 21 server sounds: eight available
    and thirteen labeled `Requires higher Server Boost Level`.
  - `curl` plus `ffmpeg`/`ffprobe` conversion checks — passed for all 21 clips;
    every output is MP3, durations range from 1,300–5,000 ms, and sizes range
    from 32,876–121,580 bytes, below the private bucket's 1 MiB limit.
  - `pnpm exec vitest run
src/features/soundboard/Soundboard.test.tsx
src/features/soundboard/soundboard-audio.test.ts
src/features/soundboard/sound-events.test.ts
src/features/soundboard/sound-cache.test.ts` — passed four files and 14 tests
    before the final catalog-integrity test was added.
  - `pnpm dlx supabase@latest db reset` — passed from a clean local database
    and applied every migration through `202607180001`.
  - `pnpm dlx supabase@latest db lint --local` — passed with no schema errors.
  - Initial `pnpm dlx supabase@latest test db` — the soundboard catalog file
    passed, but the full run failed seven previously unexecuted rich-profile
    assertions: six ambiguous three-argument `has_column` calls and one direct
    Storage-table delete now blocked by Supabase. After test-only corrections,
    the final run passed all nine files and 205 assertions.
  - Local Storage upload rehearsal — passed all 21 files with `audio/mpeg` and
    the intended server-prefixed object paths.
  - Initial concurrent hosted migration dry-run — failed because the parallel
    migration-list command rotated the CLI's temporary login role. The
    sequential rerun passed and reported only
    `202607180001_import_unlucky_boys_soundboard.sql`.
  - Hosted Storage upload — uploaded all 21 files. Because the existing
    destination prefix caused the recursive CLI to nest the server UUID twice,
    each new object was moved to its exact catalog path before publication.
    Final hosted listing returned 44 total objects, 21 `discord-*` imports, and
    zero nested leftovers; the original 23 objects remained intact.
  - `pnpm dlx supabase@latest db push` — passed and deployed
    `202607180001_import_unlucky_boys_soundboard.sql`.
  - `pnpm dlx supabase@latest db lint --linked` — passed with no hosted schema
    errors. Final `pnpm dlx supabase@latest migration list` showed local and
    remote history matched through `202607180001`.
  - Mock-browser QA — passed connected-call soundboard rendering, the active
    fifth category, all 21 imported labels/emoji, internal scrolling, and the
    existing stop footer without layout overflow.
  - `pnpm check` — passed formatting, lint, renderer/Node typechecks, 44 Vitest
    files with 225 tests, 11 Node tests, synchronized version `0.10.0`,
    production build, and secret scan. Vite retained the existing non-blocking
    large-chunk warning; output was 98.81 kB CSS and 1,172.89 kB JavaScript.
  - `pnpm tauri:build:local` — passed and produced an ad-hoc-signed Apple
    Silicon `Bakbak.app`; notarization was skipped because Apple credentials
    are unavailable.
  - `codesign --verify --deep --strict --verbose=4
src-tauri/target/release/bundle/macos/Bakbak.app` — passed. `file` identified a
    Mach-O 64-bit arm64 executable and `lipo -archs` returned `arm64`.
  - Final `pnpm security:scan` and `git diff --check` — passed for the renderer,
    native bundle, and working diff before this entry was appended.
- **Documentation updated:** Updated `docs/architecture.md` and
  `supabase/README.md` with the five-category, 44-sound hosted contract,
  Discord-derived object naming/conversion, current 205-assertion database
  status, and external-backup/licensing boundaries. Appended this canonical
  progress entry; the active plan's soundboard playback acceptance checkbox
  remains open because it requires two human listeners.
- **Known limitations:** The repository intentionally retains no MP3 copies;
  the private hosted bucket remains the runtime source of truth and still
  requires an operator backup outside Git. Distribution rights must be
  confirmed for all 44 clips before friend testing. Mock QA proves catalog
  rendering but not decoded hosted audio, exact-once LiveKit playback, or
  two-client synchronization. The updater-enabled `pnpm tauri build` was
  skipped because the protected updater signing key is unavailable; the local
  app-only build does not exercise updater signing or notarization.
- **Next:** Restart or refresh a signed-in Bakbak client, open the `Unlucky
Boys` category, and run the two-installed-client soundboard matrix for all 21
  imports, including exact-once playback, overlap/stop-all, output routing,
  deafen, reconnect, and cleanup; then confirm distribution rights and retain
  an operator backup before friend testing.

## 2026-07-18 — Soundboard categories, favorites, and member uploads

- **Completed:** Replaced the flat soundboard filter with independently
  collapsible Favorites, System, and Bakbak sections; added per-server local
  collapse persistence, search-only expansion, optimistic account favorites,
  owner/admin controls, and connected-call upload entry points. Added audio and
  video preview, 0.1–5 second trim windows, locally normalized 48 kHz mono
  16-bit PCM WAV output, cancellation/worker cleanup, and exact client-side WAV
  verification. Added creator ownership, favorites, two-category consolidation,
  uploader/server quotas, least-privilege RLS, Realtime subscriptions, and the
  authenticated `soundboard-manage` upload/delete function. Portaled the shared
  modal above transformed drawers and added compact/default/wide sizing, a
  `100dvh` bound, fixed header, scrollable body, and sticky wrapping actions.
  Added plan 0011 because plan 0010 already belongs to cross-platform screen
  sharing; preserved the existing Discord-import changes.
- **Decisions:** Kept members inside the single Bakbak upload target and kept
  category assignment server-managed. Raw audio/video remains local; only the
  normalized WAV reaches trusted server code. The custom core pins FFmpeg
  5.1.4, ffmpeg.wasm/core 0.12.10, and Emscripten 3.1.40, disables GPL and
  non-free components, and enables only the required audio demuxers, native
  decoders/parsers, `aformat`/`anull`/`aresample`/`atrim`, PCM encoder, WAV
  muxer, and file protocol. The first real MP4 run exposed the otherwise-easy
  to miss `atrim` dependency; five seconds apparently wanted its own bouncer.
- **Validation:**
  - `pnpm dlx supabase@latest db reset` — passed from a clean local database
    through `202607180002`; the chained first lint attempt timed out while the
    reset restarted containers, then the standalone rerun succeeded.
  - `pnpm dlx supabase@latest db lint --local` — passed with no schema errors.
  - `pnpm dlx supabase@latest test db` — passed all 10 files and 224 pgTAP
    assertions covering consolidation, favorites privacy/cascades,
    creator/admin/cross-server rules, direct-mutation denial, duration, and
    25/200 quotas.
  - `deno task --config supabase/deno.json check` and
    `deno task --config supabase/deno.json test` — passed lint/typecheck and all
    32 LiveKit plus soundboard function tests. The focused soundboard run passed
    17 tests for authentication/origin/method handling, WAV validation, quotas,
    permissions, normalized failures, and publication cleanup.
  - Pinned reduced-core native build — passed with FFmpeg reporting LGPL 2.1+
    and only the intended components. Final `ffmpeg-core.js` is 84,881 bytes
    (SHA-256
    `04dee6d5b2ec113d83843d3ae238da11e07612adf82171937892e40ac9aa2a67`);
    `ffmpeg-core.wasm` is 1,539,655 bytes (SHA-256
    `2770ebbf93f43ee00b7607060d9a2b0ed0cd0f57dd6672756677166590edda1b`),
    30,692,764 bytes smaller than the stock 32,232,419-byte WASM.
  - Mock-browser media acceptance — passed real 7-second MP4/AAC and MP3
    sources, a 1.25-second start with a 4-second audio window, publication into
    Bakbak, and the exact normalized-WAV validator. Source files remained local.
  - Browser layout QA — passed at 1280×800, 1024×680, and 527×407 with no
    document horizontal overflow. The wide upload dialog measured 760×420.5 at
    both desktop sizes; the short compact edit dialog measured
    495.4×375.4 with its action row ending at 399.3 inside the 407-pixel
    viewport. Focus/Escape/restoration tests also passed.
  - `pnpm check` — passed Prettier, ESLint, renderer/Node typechecks, 50 Vitest
    files with 252 tests, 12 Node tests, synchronized version `0.11.0`,
    production build, and secret scan. Vite retained the existing non-blocking
    large-chunk warning; final output is 109.07 kB CSS and 1,214.25 kB main
    JavaScript (336.30 kB gzip), plus the lazy public core.
  - `pnpm tauri:build:local` — passed for an ad-hoc-signed ARM64 `Bakbak.app`;
    notarization was skipped because Apple credentials are unavailable.
  - `codesign --verify --deep --strict --verbose=4`, `file`, and `lipo -archs`
    — passed for the reduced-core app.
  - Stock/reduced size comparison on the same macOS ARM64 tree — the stock-core
    app was 45,184 KiB and the reduced app 37,712 KiB, saving 7,472 KiB. The
    stock-core DMG was 23,139,696 bytes and the reduced DMG 15,491,181 bytes,
    saving 7,648,515 bytes (33.1%). The final DMG SHA-256 is
    `0322cea7aa0f146db9074f901ba961bf058d149852e785a04a271bdcd3879bc6`;
    `hdiutil verify` passed. Against the pre-upload 36,976 KiB app, the final
    feature adds 736 KiB.
  - `pnpm dlx supabase@latest db push --dry-run` — passed and reported only
    `202607180002_member_soundboard.sql`. `soundboard-manage` deployed through
    the API and its unauthenticated hosted probe returned 401.
  - Hosted `db push` — not executed: the environment safety review requires
    explicit user approval for the shared schema/data migration. Read-only
    hosted schema lint passed, and migration history confirms local
    `202607180002` is the sole pending remote migration.
  - Final `pnpm security:scan` and `git diff --check` — passed for the reduced
    renderer, desktop artifacts, and final working tree.
- **Documentation updated:** Updated README, `docs/architecture.md`, active plan
  0001, new plan 0011, `supabase/README.md`, and the pinned source/build/license
  record under `third_party/ffmpeg-soundboard`; appended this canonical entry.
- **Known limitations:** The Docker recipe is pinned and complete, but its
  x86-only Emscripten 3.1.40 base was impractically slow under Apple Silicon
  emulation; the committed artifact was built with the same official pinned
  SDK natively and the Docker build was not allowed to run to completion.
  Hosted migration `202607180002` is still pending, so the deployed function
  must not be used by released clients yet. The authenticated two-account
  upload/favorite/Realtime/LiveKit/moderation/outsider/deletion matrix, a true
  installed-client media run, Developer ID/notarization, and the Windows signed
  installer comparison still require their respective environments. Rights
  for all 44 operator MP3s still require confirmation.
- **Next:** With explicit approval, push
  `202607180002_member_soundboard.sql`, repeat hosted lint/history checks, and
  run the two-account acceptance matrix. Then exercise representative MP3 and
  MP4 uploads inside the installed app before friend distribution.

## 2026-07-18 — Deploy hosted member soundboard migration

- **Completed:** After explicit user approval, applied
  `202607180002_member_soundboard.sql` to the linked hosted Bakbak project. The
  hosted catalog now uses System and Bakbak, and the creator, favorite,
  uploader/admin RLS, Realtime, quota RPC, and normalized-WAV bucket contracts
  are available to the already deployed management function.
- **Decisions:** Applied only the reviewed tracked migration; no production
  rows, credentials, or policies were changed through ad hoc SQL.
- **Validation:**
  - `pnpm dlx supabase@latest db push` — passed and applied only
    `202607180002_member_soundboard.sql`.
  - `pnpm dlx supabase@latest db lint --linked` — passed with no hosted schema
    errors.
  - `pnpm dlx supabase@latest migration list` — passed; local and remote
    histories match through `202607180002`.
  - `pnpm dlx supabase@latest functions list` — passed;
    `soundboard-manage` version 1 is ACTIVE with `verify_jwt = true`.
  - Unauthenticated hosted `POST /functions/v1/soundboard-manage` — returned
    HTTP 401 as required.
- **Documentation updated:** Updated the architecture deployment status, plan
  0011 status, and this canonical progress log.
- **Known limitations:** Authenticated two-account upload/favorite/Realtime,
  LiveKit playback, uploader/admin moderation, outsider denial, and deletion
  cleanup still need the planned human acceptance session.
- **Next:** Run the hosted two-account soundboard matrix, then repeat one MP3
  and one MP4 upload inside the installed desktop app before friend
  distribution.

## 2026-07-18 — Mirror the Unlucky Boys channel layout

- **Completed:** Added ordered channel categories and mirrored the currently
  visible Discord structure as seven categories, 18 text channels, and six
  voice channels. Reused the four existing channel UUIDs for `spawn`, `law`,
  `Queue`, and `Crash`, so existing Bakbak messages, reads, presence, and voice
  references remain attached; no Discord messages were imported or modified.
  Updated the mock workspace, live workspace loader, channel service, desktop
  sidebar, styling, and tests for the mixed text/voice hierarchy.
- **Decisions:** Category rows are trusted, operator-managed structure for this
  phase. Newly created admin channels remain uncategorized instead of silently
  changing the mirrored layout. The five rooms that appeared lock-marked in
  Discord (`old-edits`, `ink`, `preparation`, `meme`, and `wallpapers`) are
  ordinary member-visible Bakbak rooms because per-channel ACLs are not yet a
  product capability. No Discord token, scraping workflow, or history-import
  path was introduced.
- **Validation:**
  - `pnpm exec vitest run src/features/channels/ChannelSidebar.test.tsx
src/lib/channel-service.test.ts` — passed two files with 14 tests.
  - `pnpm exec vitest run src/app/App.test.tsx` — passed four tests after
    updating two stale assertions from the former mock room names. The first
    full `pnpm check` correctly failed on those old `lobby` and `Coffee table`
    labels before the assertions were corrected.
  - `pnpm dlx supabase@latest db reset` — passed through
    `202607180003_unlucky_boys_channel_layout.sql`.
  - `pnpm dlx supabase@latest db lint --local` — passed with no schema errors.
  - `pnpm dlx supabase@latest test db` — passed 11 pgTAP files with 248
    assertions, including exact category/room order, retained UUIDs, zero
    message import, and member/outsider RLS.
  - Browser layout QA — passed the exact seven-category/24-room DOM order at
    1280×720 and 1024×680. Both viewports had no document horizontal overflow;
    the channel navigation scrolled internally (568/1433 and 528/1433
    client/scroll heights).
  - `pnpm check` — passed Prettier, ESLint, renderer/Node typechecks, 50 Vitest
    files with 253 tests, 12 Node tests, synchronized version `0.11.0`,
    production build, and secret scan. Vite retained the existing non-blocking
    large-chunk warning; final output is 109.86 kB CSS and 1,216.19 kB main
    JavaScript (336.82 kB gzip).
  - `pnpm tauri:build:local` — passed for an ad-hoc-signed ARM64 `Bakbak.app`;
    notarization was skipped because Apple credentials are unavailable.
  - `pnpm dlx supabase@latest db push --dry-run` — passed and reported only
    `202607180003_unlucky_boys_channel_layout.sql`; no hosted change was made.
- **Documentation updated:** Updated `docs/architecture.md`, active plan 0001,
  new plan 0012, `supabase/README.md`, and this canonical progress log.
- **Known limitations:** The new migration is not yet deployed to the hosted
  project, so the live-data renderer must not ship before it. Per-channel
  permissions, category creation/reordering/collapse, Discord message history,
  and a hosted two-account layout/RLS check remain out of scope or pending.
  The updater-enabled distribution build was not run because protected signing
  credentials are unavailable; the app-only native bundle passed.
- **Next:** With explicit approval, push
  `202607180003_unlucky_boys_channel_layout.sql`, repeat hosted lint/history
  checks, and verify the exact order with an admin and a regular member. Treat
  per-channel ACLs and any consented message-history import as separate future
  phases.

## 2026-07-18 — Deploy hosted Unlucky Boys channel layout

- **Completed:** After explicit user approval, applied
  `202607180003_unlucky_boys_channel_layout.sql` to the linked hosted Bakbak
  project. The hosted database now has the ordered category model and mirrored
  room structure. The migration reused the existing admin-created `gaane` text
  room under Welcome, retaining that row and anything already attached to it.
- **Decisions:** Amended the still-pending tracked migration to reuse any
  same-server, same-kind room whose name matches the mirrored structure. This
  preserves existing room identity and data while preventing duplicates. No ad
  hoc hosted SQL, message mutation, Discord credential, or history import was
  used.
- **Validation:**
  - Initial `pnpm dlx supabase@latest db push` — safely failed on the existing
    `gaane` name uniqueness guard. `migration list` then confirmed
    `202607180003` remained pending, so the failed transaction committed
    nothing.
  - `pnpm dlx supabase@latest db reset` — passed from a clean database through
    the revised migration.
  - `pnpm dlx supabase@latest test db` — passed 11 pgTAP files with 248
    assertions.
  - `pnpm dlx supabase@latest db lint --local` — passed with no schema errors.
  - `pnpm dlx supabase@latest db push --yes` — passed and applied only
    `202607180003_unlucky_boys_channel_layout.sql`.
  - `pnpm dlx supabase@latest migration list` — passed; local and hosted
    histories match through `202607180003`.
  - `pnpm dlx supabase@latest db lint --linked` — passed with no hosted schema
    errors. An earlier concurrent lint process was interrupted after it stalled;
    the standalone retry completed normally.
  - `pnpm dlx supabase@latest db push --dry-run` — passed and reported the
    hosted database is up to date.
  - `pnpm check` — passed Prettier, ESLint, renderer/Node typechecks, 50 Vitest
    files with 253 tests, 12 Node tests, synchronized version `0.12.0`,
    production build, and bundle secret scan.
- **Documentation updated:** Updated `docs/architecture.md`, active plan 0001,
  plan 0012, `supabase/README.md`, and this canonical progress log.
- **Known limitations:** The authenticated hosted admin/member hierarchy and
  RLS observation remains pending. The five Discord lock-marked room names are
  still ordinary all-member Bakbak rooms; per-channel ACLs and Discord message
  history remain separate future work.
- **Next:** Open the deployed layout with one hosted admin and one regular
  member, confirm the exact seven-category/24-room order for both, and verify
  that an outsider cannot read the categories or rooms.

## 2026-07-18 — Add local microphone cleanup and voice lab

- **Completed:** Added a LiveKit-compatible sender-side microphone processor
  backed by a 48 kHz AudioWorklet and the synchronous RNNoise 0.2 WebAssembly
  model. The processor keeps built-in echo cancellation/noise
  suppression/automatic gain control, bridges 128-sample render quanta into
  RNNoise's 480-sample frames without starving output, and applies optional
  Child pitch, Robot modulation, or Walkie-talkie band-limited saturation
  after cleanup. Wired processor init/restart/update/teardown into initial
  microphone acquisition, live preference changes, input-device replacement,
  and direct room reuse while preserving the named `bakbak-microphone` and
  independent soundboard tracks. Added persisted Audio Settings controls,
  v1-to-v2 preference migration, the selected processing path in the explicit
  microphone meter test, unsupported/failure fallback messaging, focused
  tests, and bundled upstream license notices.
- **Decisions:** Enhanced cleanup defaults on and effects default to Natural.
  Processing and the model remain on-device; only the resulting speech track
  reaches the already-authorized LiveKit room. A missing AudioWorklet or RNNoise
  failure never blocks voice join and instead keeps WebRTC's built-in cleanup.
  Effects are intentionally sender-side, mutually exclusive, and excluded from
  soundboard audio. The Jitsi wrapper is pinned at `0.2.1`; its Apache/original
  MIT notice and Xiph.Org's BSD 3-Clause notice ship with the renderer.
- **Validation:**
  - `pnpm exec vitest run src/features/settings/device-preferences.test.ts
src/features/settings/SettingsPage.test.tsx
src/features/voice/microphone-processing.test.ts
src/features/voice/useVoiceRoom.test.tsx` — passed four files with 56 tests.
  - `pnpm check` — passed Prettier, ESLint, renderer/Node typechecks, 51 Vitest
    files with 259 tests, 12 Node tests, synchronized version `0.12.0`,
    production build, and secret scan. The build emits a 1,929.95 kB local
    microphone-worklet asset and retains the existing non-blocking large-chunk
    warning; main JavaScript is 1,222.88 kB (338.66 kB gzip).
  - Mock-browser Settings QA — passed cleanup-on default, Natural/Child/Robot/
    Walkie-talkie accessibility, Robot selection state, and a clean browser
    error log. No real microphone permission was requested.
  - `pnpm tauri:build:local` — passed for an ad-hoc-signed 38 MiB ARM64
    `Bakbak.app`; RNNoise notices were present in the production renderer
    assets. Notarization was skipped because Apple credentials are unavailable.
  - Post-bundle `pnpm security:scan` — passed for `dist` and the native release
    bundle.
- **Documentation updated:** Updated `README.md`, `docs/architecture.md`, active
  plan 0001, added plan 0013, bundled RNNoise/Jitsi notices under
  `public/vendor/rnnoise`, and appended this canonical progress entry.
- **Known limitations:** Real keyboard rejection, speech intelligibility, the
  three effects, live effect changes, device switching, and processor teardown
  still need human observation between two installed clients. Windows x64 was
  not available for its installed-client smoke test. RNNoise targets common
  stationary/background noise, not guaranteed speaker separation. The
  updater-enabled `pnpm tauri build` was not run because protected updater
  signing credentials are unavailable; the supported local app-only bundle
  passed.
- **Next:** Run plan 0013's installed macOS two-client matrix with keyboard,
  fan/room noise, laptop speakers, headphones, each effect, mute, input-device
  replacement, direct room switching, and leave/rejoin; then repeat the smoke
  test on Windows x64 before the next friend-test build.

## 2026-07-18 — Repair Audio & Video settings and device routing

- **Completed:** Rebuilt Audio & Video as four spaced Voice Input, Voice
  Output, Video, and App Sounds categories instead of the cramped two-column
  card grid. The microphone test now plays its processed preview through the
  selected speaker while retaining the live meter and tears down playback,
  capture, processing, animation, and analysis resources together. Replaced
  LiveKit-filtered discovery with the runtime's complete
  `enumerateDevices()` result, added explicit refresh, refreshed automatically
  after mic permission, and stopped default-only permission results from
  erasing a saved device ID. Selected-speaker changes now route the soundboard
  monitor, LiveKit room, and all current/future remote audio elements.
- **Decisions:** Output capability follows the browser primitive Bakbak
  actually uses, `HTMLMediaElement.setSinkId`, instead of requiring a second
  LiveKit capability opinion. macOS WebKit reveals named speakers only after
  capture permission, so opening Settings remains permission-free while the
  user-initiated mic test becomes the automatic discovery refresh point.
  Unsupported older runtimes truthfully retain system output rather than
  pretending a switch succeeded. Live monitoring includes a headphone warning
  because physics remains an enthusiastic participant in feedback loops.
- **Validation:**
  - `pnpm exec vitest run src/features/settings/SettingsPage.test.tsx
src/features/voice/media-devices.test.ts src/features/voice/remote-audio.test.ts
src/features/settings/device-preferences.test.ts
src/features/voice/useVoiceRoom.test.tsx` — passed five files with 66 tests.
  - Initial `pnpm test -- <focused paths>` — Vitest passed all 52 files and 265
    tests, then the package script incorrectly forwarded the TypeScript paths
    to its separate Node test command; the focused `pnpm exec vitest` command
    above and the unmodified full test command below both passed.
  - `pnpm check` — passed Prettier, ESLint, renderer/Node typechecks, 52 Vitest
    files with 266 tests, 12 Node tests, synchronized version `0.13.0`,
    production build, and secret scan. Vite retained the existing non-blocking
    large-chunk warning; output is 114.80 kB CSS, 1,227.54 kB main JavaScript
    (340.21 kB gzip), and the existing 1,929.95 kB local microphone worklet.
  - Mock-browser Settings QA at 1000×720 — passed all four category regions,
    954×674 dialog containment, 747/747 px canvas client/scroll width, 705/705
    px panel client/scroll width, internal 564/1144 px vertical scrolling, zero
    document horizontal overflow, complete upper/lower visual review, and a
    clean browser error log. No real microphone permission was requested.
  - `pnpm tauri:build:local` — passed for the ad-hoc-signed ARM64 `Bakbak.app`;
    notarization was skipped because Apple credentials are unavailable.
  - Post-bundle `pnpm security:scan` — passed for `dist` and the native release
    bundle; `git diff --check` also passed.
- **Documentation updated:** Updated `docs/architecture.md`, active plan 0001,
  plan 0013, and this canonical progress log.
- **Known limitations:** Audible microphone monitoring and physical output
  switching still require a human installed-client check with headphones and
  at least two real output devices. macOS versions whose bundled WebKit lacks
  speaker selection remain system-output-only, and Windows x64 was unavailable
  for installed-client validation. The updater-enabled `pnpm tauri build` was
  not run because protected signing credentials are unavailable; the supported
  local app-only bundle passed.
- **Next:** In the installed macOS app, grant microphone permission, confirm the
  refreshed list shows every connected speaker/headset, switch between two
  outputs during a two-client call, and compare Natural/Child/Robot/
  Walkie-talkie in the audible mic test before repeating the smoke test on
  Windows x64.

## 2026-07-18 — Harden soundboard final-frame silence

- **Completed:** Repaired the recurring WebKit soundboard loop after natural
  completion and mid-clip stops. Every clip now passes through a 20 ms
  final-silence envelope on both the outbound and local paths. Manual stop and
  stop-all first force that envelope to digital zero and then synchronously
  disconnect and settle the source without depending on a later `ended` event.
  Voice teardown invalidates pending playback/publication work and
  deterministically finishes any retained sources. Local selected-output
  monitors now hard-mute before their streams are detached. Remote soundboard
  elements explicitly mirror LiveKit track mute/unmute state and hard-mute as
  soon as the synchronized stop message arrives.
- **Decisions:** Preserved the prepublished, reusable LiveKit soundboard track
  and overlapping playback instead of renegotiating a track per clip. Protected
  both sender and receiver because the repeated frame can be retained by either
  hidden selected-output element. Generation checks ensure a stale async
  publication or decode cannot revive audio after leave/rejoin.
- **Validation:**
  - `pnpm exec vitest run
src/features/soundboard/soundboard-audio.test.ts
src/features/voice/audio-output-router.test.ts
src/features/voice/remote-audio.test.ts
src/features/voice/useVoiceRoom.test.tsx` — passed four files with 40 tests,
    including final-zero automation, manual stop without `ended`, teardown with
    a retained source, per-track remote muting, and synchronized stop handling.
    An initial focused run exposed a missing `AudioContext.currentTime` value in
    the test double; the double was corrected before the passing rerun.
  - `pnpm check` — passed Prettier, ESLint, renderer/Node typechecks, 52 Vitest
    files with 268 tests, 12 Node tests, synchronized version `0.13.0`,
    production build, and bundle secret scan. Vite retained the existing
    non-blocking large-chunk warning; output is 114.80 kB CSS, 1,229.29 kB main
    JavaScript (340.74 kB gzip), and the existing 1,929.95 kB local microphone
    worklet. An intermediate rerun stopped at ESLint on a newly added unbound
    test assertion; the assertion was corrected and the complete final gate
    passed.
  - `pnpm tauri:build:local` — passed for an ad-hoc-signed ARM64 `Bakbak.app`;
    notarization was skipped because Apple credentials are unavailable.
  - Post-bundle `pnpm security:scan` — passed for `dist` and the native release
    bundle; `git diff --check` also passed.
- **Documentation updated:** Updated `docs/architecture.md`, active plan 0001,
  and this canonical progress log.
- **Known limitations:** The retained-frequency symptom is specific to real
  WebKit audio output and still needs human observation with two installed
  clients. Test natural completion on a clip whose final waveform is non-zero,
  mid-clip stop, stop-all with overlaps, sender local monitoring, and receiver
  playback through each available output device. Windows x64 was unavailable.
  The updater-enabled `pnpm tauri build` was not run because protected updater
  signing credentials are unavailable; the supported local app-only bundle
  passed.
- **Next:** Install the rebuilt macOS bundle on two clients and repeat the
  natural-end, mid-stop, overlapping-stop, output-switch, leave/rejoin, and
  immediate-replay matrix while listening for any retained frame.

## 2026-07-18 — Make output fallback notices temporary

- **Completed:** Converted speaker fallback and output-switch errors from
  persistent room banners into eight-second notices. Each new failure restarts
  the timer, the new accessible close control dismisses it immediately, and
  the existing Review output action still opens Audio & Video settings.
  Successful switching, voice disconnect, and hook teardown clear the notice
  and its timer.
- **Decisions:** Kept the underlying selected-output preference unchanged so a
  transient notice does not silently rewrite the user's device choice. The
  notice state lives in the voice controller rather than only the visible room,
  so it expires even while Settings or another channel is open and can be
  reused by both join fallback and manual switch failures.
- **Validation:**
  - `pnpm exec vitest run src/features/voice/VoiceRoom.test.tsx
src/features/voice/useVoiceRoom.test.tsx
src/features/voice/VoiceControlDock.test.tsx && pnpm typecheck && pnpm lint` —
    passed three focused files with 43 tests, both TypeScript projects, and
    ESLint before the final timer regression test was added.
  - `pnpm check` — passed Prettier, ESLint, renderer/Node typechecks, 52 Vitest
    files with 270 tests, 12 Node tests, synchronized version `0.13.0`,
    production build, and bundle secret scan. The new regressions cover
    immediate dismissal, Review output, and eight-second automatic expiry.
    Vite retained the existing non-blocking large-chunk warning; output is
    115.22 kB CSS, 1,229.89 kB main JavaScript (340.84 kB gzip), and the
    existing 1,929.95 kB local microphone worklet.
  - Mock-browser QA — passed entering the local preview, joining Queue, opening
    Settings, and rendering the redesigned Audio & Video categories. The
    browser exposed only System default, so the unavailable-hardware branch was
    covered deterministically by the component/hook regressions rather than a
    fabricated device.
  - `pnpm tauri:build:local` — passed for an ad-hoc-signed ARM64 `Bakbak.app`;
    notarization was skipped because Apple credentials are unavailable.
  - Post-bundle `pnpm security:scan` — passed for `dist` and the native release
    bundle; `git diff --check` also passed.
- **Documentation updated:** Updated `docs/architecture.md` and this canonical
  progress log.
- **Known limitations:** The natural missing-speaker presentation still needs
  one installed-client observation with a previously selected output removed.
  Windows x64 was unavailable. The updater-enabled `pnpm tauri build` was not
  run because protected updater signing credentials are unavailable; the
  supported local app-only bundle passed.
- **Next:** In the installed app, select a removable headset, disconnect it,
  join voice, and confirm the fallback notice disappears after eight seconds or
  immediately through its close button while Review output still opens the
  correct Settings category.

## 2026-07-19 — Unified Entire screen / Application picker and audio default

- **Completed:** Replaced the macOS system picker with Bakbak's shared Entire
  screen / Application custom picker on macOS 14+, matching Windows. macOS now
  enumerates displays and running applications through ScreenCaptureKit and
  starts capture from a validated `source_id`. The share dialog defaults matched
  system audio on when available, uses a switch instead of a checkbox, shows
  loading/empty/retry source states, and uses a Share CTA once a source is
  selected. Windows thumbnail capture is time-budgeted so hung previews cannot
  block the picker. Desktop capabilities failures no longer advertise a broken
  WebView `getDisplayMedia` path on macOS/Windows.
- **Decisions:** Keep Windows application entries as native window handles so
  process-loopback audio matching stays exact. macOS Application capture uses
  `SCRunningApplication` with a display-anchored including-applications filter.
  Audio defaults on per share but is still not persisted across sessions.
- **Validation:**
  - `pnpm check` — passed Prettier, ESLint, typechecks, 52 Vitest files with
    271 tests, 12 Node tests, version sync, production build, and secret scan.
  - `cargo test --manifest-path src-tauri/Cargo.toml --locked screen_share
--lib` — passed 10/10 screen-share tests.
  - `cargo check --manifest-path src-tauri/Cargo.toml --locked` and
    `cargo fmt --check` — passed after formatting the macOS picker helpers.
  - `cargo xwin check --manifest-path src-tauri/Cargo.toml --locked --target
x86_64-pc-windows-msvc --tests` — passed.
  - Installed Windows friend-path observation and full `pnpm tauri build` —
    skipped on this macOS host / missing updater signing credentials.
- **Documentation updated:** Updated plans 0003 and 0010, `docs/architecture.md`,
  README screen-share notes, and this progress log.
- **Known limitations:** Native Windows MSVC runtime validation and the
  bidirectional installed-client media matrix remain open. macOS custom-picker
  thumbnails are not generated yet; labels remain sufficient for selection.
- **Next:** Rebuild and ship to Windows friends; confirm Entire screen /
  Application selection starts capture without stalling, with audio on by
  default.

## 2026-07-19 — Review and harden unified screen picker

- **Completed:** Reviewed the local unified picker as renderer, macOS, and
  Windows code rather than accepting the earlier green checks at face value.
  Preserved native string errors so the dialog now shows macOS permission
  guidance, kept an explicit audio-off choice stable while the presenter changes
  sources, and guaranteed video-only sources can never forward an audio request.
  Source buttons expose their selected state to assistive technology. macOS
  source enumeration and start-time revalidation now use the asynchronous
  ScreenCaptureKit API with a five-second ceiling, and application/display
  capture dimensions come from the resolved filter's point-to-pixel metadata
  instead of treating Retina window points as pixels. Windows enumeration runs
  on a blocking worker while retaining the bounded best-effort preview budget.
- **Decisions:** Audio defaults on once when a dialog opens, but a user's switch
  choice is authoritative for the rest of that dialog. A source that cannot
  provide matched audio stays shareable as video and forces the outgoing audio
  flag off. ScreenCaptureKit filter metadata is authoritative for macOS capture
  dimensions, with the selected display's pixel size as a defensive fallback.
- **Validation:**
  - `pnpm exec vitest run src/features/voice/ScreenShareDialog.test.tsx
src/features/voice/screen-share-service.test.ts
src/features/voice/useVoiceRoom.test.tsx` — passed 3 files with 41 tests,
    including native string errors, retry, stable audio intent, video-only
    source clamping, and accessible source selection.
  - `cargo test --manifest-path src-tauri/Cargo.toml --locked screen_share
--lib` — passed 11/11 screen-share tests.
  - `cargo check --manifest-path src-tauri/Cargo.toml --locked` — passed on
    Apple Silicon macOS.
  - `cargo xwin check --manifest-path src-tauri/Cargo.toml --locked --target
x86_64-pc-windows-msvc --tests` — passed; the first sandboxed attempt could not
    update cargo-xwin's external compiler cache, and the approved rerun passed.
  - `cargo xwin build --manifest-path src-tauri/Cargo.toml --locked --target
x86_64-pc-windows-msvc --release` — failed at the final cross-host link on the
    known LiveKit CXX bridge boundary: `lld-link` could not resolve the native
    create/set SDP observers and `rust::cxxbridge1::Box<PeerContext>::drop`.
    Windows picker code and tests had already passed the compile-only command
    above; a Windows MSVC runner remains required for the executable.
  - Mock-browser QA — passed a mock voice connection with browser screen sharing
    still disabled as required and no browser console errors.
  - `pnpm check` — passed Prettier, ESLint, renderer/Node typechecks, 52 Vitest
    files with 273 tests, 12 Node tests, synchronized version `0.14.0`,
    production build, and bundle secret scan. Vite retains the existing
    non-blocking large-chunk warning; main JavaScript is 1,231.24 kB
    (340.57 kB gzip).
  - `pnpm tauri:build:local` — passed and produced an ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    unavailable.
  - `codesign --verify --deep --strict --verbose=2
src-tauri/target/release/bundle/macos/Bakbak.app` — passed; the bundle is valid
    on disk and satisfies its designated requirement.
  - Final `pnpm format:check`, `cargo fmt --manifest-path
src-tauri/Cargo.toml --check`, `pnpm security:scan`, and `git diff --check` —
    passed; the post-bundle scan found no forbidden secret material in `dist` or
    the native release bundle.
- **Documentation updated:** Updated `docs/architecture.md` with bounded async
  enumeration and Retina pixel sizing, and appended this canonical review entry.
- **Known limitations:** The macOS Tauri app launched successfully in mock mode,
  but automated picker interaction was skipped because the host has not granted
  assistive access to the test runner. Windows code cross-compiles, but no
  Windows machine was available for a real source-list/start/audio observation,
  and the full cross-host release link remains blocked by the existing LiveKit
  CXX bridge symbol issue. The two-client LiveKit media matrix therefore remains
  open on both platforms; macOS picker thumbnails also remain unimplemented.
- **Next:** On an installed macOS client, grant Screen & System Audio Recording
  and verify both tabs, audio-off persistence, Retina application resolution,
  and actual remote playback; then ship a fresh Windows x64 build and repeat the
  source-list/start/audio isolation matrix with a friend.

## 2026-07-19 — Signature shell, Personal DMs, and opt-in watching

- **Completed:** Made Bakbak Signature the new-install default with a
  parser-blocking v5 migration, bundled Cormorant display type and owned subtle
  texture assets, and preserved Classic and Signal Red selections. Added the
  fixed Personal/Bakbak rail, destination-aware context panes, former-member DM
  entrance, reusable direct conversation experience, unread/read synchronization,
  person details, shared active-call controls, and accessible persisted panel
  resizing. Added canonical one-to-one conversations, messages, private read
  states, participant-only RLS/RPCs/Realtime, and retained participant
  profile/media access. Added server-wide LIVE presence with backward-compatible
  heartbeats, richer voice occupants, cross-room Watch sequencing, and an
  explicit one-stream subscription gate that keeps remote screen video and audio
  unsubscribed until Watch.
- **Decisions:** Signature is fixed premium furniture while Classic alone exposes
  variable theme controls. DMs are real conversation targets rather than fake
  channels. Database LIVE is advisory; the matching LiveKit publication remains
  authoritative. Switching watched streams unsubscribes the previous share
  first, and legacy heartbeat calls clear LIVE to prevent stale status.
- **Validation:**
  - `pnpm dlx supabase@latest db reset` — passed; the clean local database
    applied migration `202607190001`.
  - `pnpm dlx supabase@latest db lint --local --level warning` — passed with no
    schema errors.
  - `pnpm dlx supabase@latest test db` — passed 12 files with 288 pgTAP
    assertions, including DM isolation/retention and heartbeat compatibility.
  - Browser visual QA — passed Signature, Personal, DM creation/send, appearance
    migration, keyboard resizing, and centre-width clamping at 1280×800 and
    1024×680. The first pass exposed a post-send render loop; the unread-state
    reconciliation was made idempotent and covered by a regression test.
  - `pnpm check` — passed Prettier, ESLint, strict renderer/Node typechecks, 55
    Vitest files with 288 tests, 12 Node tests, version synchronization,
    production build, and bundle secret scan. Vite retains the non-blocking
    large-chunk warning; main JavaScript is 1,254.45 kB (346.95 kB gzip).
  - `pnpm tauri:build:local` — passed and produced the ad-hoc-signed ARM64
    `Bakbak.app`; strict deep code-sign verification and Mach-O inspection
    passed, while notarization was skipped because Apple credentials are absent.
- **Documentation updated:** Added plan 0014, updated the active Phase 5 plan,
  architecture, Supabase security/deployment guidance, and this canonical log.
- **Known limitations:** The additive migration has not been pushed to hosted
  Supabase. Installed two-account DM and three-client/two-room LIVE media
  acceptance, network proof of zero unwatched bytes, Windows bundle validation,
  and notarized distribution remain open.
- **Next:** Push migration `202607190001` before distributing the renderer, then
  run the documented two-account DM and three-client LIVE/Watch matrix on
  installed clients.

## 2026-07-19 — Stabilize presence, appearance, and macOS capture recovery

- **Completed:** Deployed the previously pending plan 0014 migration to the
  linked hosted project, eliminating the production mismatch behind online and
  voice-room publication errors. Added renderer downgrade compatibility for
  both halves of the old schema: heartbeat v3 falls back to v2, and
  streaming-aware presence reads fall back to legacy columns with LIVE false.
  Successful presence synchronization now clears stale presence banners.
  Changed the no-preference appearance default to Classic System + Flat +
  Purple while preserving stored choices, reordered Appearance around three
  understandable complete-style cards, and shows customization only for
  Classic. macOS capture now preflights/requests Screen Recording access and
  permission failures expose Open Privacy Settings and Restart Bakbak actions
  with guidance for stale or wrong-copy TCC entries.
- **Decisions:** Hosted deployment fixes the current production incident;
  renderer fallback still protects rollback and staggered deployments without
  falsely advertising LIVE on an old schema. Existing explicit appearance
  choices remain authoritative. macOS permission recovery identifies the exact
  running app copy because TCC approval for another build/path is not usable
  evidence.
- **Validation:**
  - `pnpm dlx supabase@latest db push --dry-run` — passed and identified only
    migration `202607190001`.
  - `pnpm dlx supabase@latest db push` — passed; migration `202607190001` was
    applied to the linked hosted project.
  - `pnpm dlx supabase@latest migration list` — passed with local and remote
    history synchronized through `202607190001`.
  - `pnpm dlx supabase@latest db lint --linked --level warning` — passed with no
    hosted schema errors.
  - Focused Vitest — passed six files with 60 tests covering presence fallback,
    first-paint/default appearance, Appearance interactions, and permission
    recovery.
  - Browser QA — confirmed the local app loads and a previously explicit
    Signature choice remains preserved; the parser bootstrap regression test
    covers the no-stored-choice Flat Purple first paint.
  - `pnpm check` — passed Prettier, ESLint, strict renderer/Node typechecks, 55
    Vitest files with 290 tests, 12 Node tests, version synchronization,
    production build, and bundle secret scan. Vite retains the existing
    non-blocking large-chunk warning; main JavaScript is 1,256.33 kB
    (347.38 kB gzip).
  - `cargo check --manifest-path src-tauri/Cargo.toml --locked` — passed on
    Apple Silicon macOS.
  - `cargo test --manifest-path src-tauri/Cargo.toml --locked screen_share
--lib` — passed 11/11 native screen-share tests.
  - `pnpm tauri:build:local` — passed and produced an ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are absent.
- **Documentation updated:** Updated architecture, plan 0014, active Phase 5,
  Supabase deployment guidance, and this canonical log.
- **Known limitations:** The new permission recovery path builds successfully,
  but the host's exact TCC state cannot be exercised by automated tests. A
  previously approved different Bakbak.app copy may still need removal and
  reapproval. Hosted authenticated DM/LIVE probes and the installed
  multi-client media matrix remain open.
- **Next:** Fully quit the installed Bakbak, launch the newly built exact app,
  use Open Privacy Settings if capture preflight fails, enable that entry, and
  use Restart Bakbak before retrying screen sharing; then run the hosted
  two-account DM and three-client LIVE/Watch matrix.

## 2026-07-19 — Force the upcoming update to Flat Purple once

- **Completed:** Bumped device-local appearance persistence from v5 to v6. On
  the first launch of the upcoming update, every installation without a valid
  v6 record—including all existing v5 Signature, Classic, and Signal Red
  choices—is reset before first paint to Classic, System theme, Flat surfaces,
  Purple accent, and 100% intensity. The reset writes v6 immediately; choices
  users make afterward remain persistent and are not repeatedly overridden.
- **Decisions:** This is a deliberate one-time update migration rather than a
  permanently forced theme. It guarantees a consistent rollout while keeping
  Appearance functional after users have seen the new default.
- **Validation:**
  - Focused Vitest — passed three files with 44 tests, including v1–v5 reset,
    parser-blocking v5 Signature replacement, v6 persistence, fixed presets,
    and Appearance interactions.
  - `pnpm typecheck` — passed strict renderer and Node TypeScript checks.
  - `pnpm check` — passed Prettier, ESLint, typechecks, 55 Vitest files with 291
    tests, 12 Node tests, version synchronization, production build, and bundle
    secret scan. Vite retains the existing non-blocking large-chunk warning;
    main JavaScript is 1,255.16 kB (347.11 kB gzip).
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app` with the v6 migration; notarization was skipped because Apple
    credentials are absent.
- **Documentation updated:** Updated architecture, plan 0014, active Phase 5,
  and this canonical log.
- **Known limitations:** Users may immediately choose another appearance after
  the one-time reset. That is intentional; enforcing Flat Purple forever would
  make the Appearance controls misleading.
- **Next:** Publish the upcoming renderer/native update and verify one existing
  v5 Signature installation resets before first paint, then verify its next
  user-selected appearance survives another restart.

## 2026-07-20 — Screen-share isolation and compact call layout

- **Completed:** Implemented plan 0015. Native source audio now has explicit
  isolation policies: macOS ScreenCaptureKit excludes current-process audio,
  Windows application capture includes only the selected process tree, and
  Windows Entire screen excludes Bakbak's process tree. macOS and Windows
  source enumeration and start validation reject Bakbak descendants. Added
  per-source `audioUnavailableReason`, video-only degradation with renderer
  warning, and a subscription rule that keeps the presenter's companion video
  while always forcing its companion audio off. Removed sidebar Watch and
  cross-room pending-watch state. Rebuilt calls around exact bounded 16:9
  count-aware tiles, reversible participant/share focus, a 72 px visual
  filmstrip, and truncated informational LIVE rows. Replaced shell-dependent
  fullscreen with a fixed `100dvh` overlay, pinned exit, 2.5-second idle
  controls, actual Tauri-state reconciliation, Escape handling, target-loss
  cleanup, and non-blocking failure recovery.
- **Decisions:** Installed isolation results remain authoritative: any
  platform/source mode that leaks voice ships video-only. Database LIVE no
  longer implies a cross-room media action; a member joins the room and selects
  a share tile. Narrow centers preserve exact 16:9 tile dimensions and scroll
  vertically instead of compressing media. Escape exits OS fullscreen without
  clearing focus; activating focused media or Back to grid clears focus,
  exits fullscreen, and releases remote subscriptions.
- **Validation:**
  - Focused Vitest — passed five files with 45 tests, then the final focused
    VoiceRoom run passed 21/21 tests covering reversible participant/share
    focus, fullscreen failure/reconciliation, target loss, Escape, and count
    layouts.
  - `pnpm check` — passed Prettier, ESLint, strict renderer/Node typechecks, 55
    Vitest files with 303 tests, 13 Node tests, version synchronization,
    production build, and bundle secret scan. Vite retains the existing
    non-blocking large-chunk warning; main JavaScript is 1,256.28 kB
    (347.25 kB gzip).
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --check` — passed.
  - `cargo check --manifest-path src-tauri/Cargo.toml --locked` — passed on
    Apple Silicon macOS.
  - `cargo test --manifest-path src-tauri/Cargo.toml --locked screen_share
--lib` — passed 13/13 macOS/common screen-share tests.
  - `cargo xwin check --manifest-path src-tauri/Cargo.toml --locked --target
x86_64-pc-windows-msvc --tests` — passed, including compilation of the
    Windows process-tree policy and rejection tests. The first sandboxed
    attempt could not update cargo-xwin's external compiler cache; the approved
    rerun passed.
  - Browser visual QA — at 1024×680 with the supported 420 px center, three
    targets measured exactly 380×214 with vertical scrolling and no horizontal
    overflow. At 1280×800, hiding the member panel reflowed the same targets
    into two 380×214 columns. Focused media measured a separate non-overlapping
    72 px filmstrip and returned through its active item. Classic Light/Dark,
    Signature, and Signal Red retained exact dimensions with no console errors.
  - `pnpm tauri:build:local` — passed for the final source state and produced an
    ad-hoc-signed ARM64 `Bakbak.app`; notarization was skipped because Apple
    credentials are absent.
  - `pnpm security:scan` and `git diff --check` — passed after the final bundle
    and source changes.
- **Documentation updated:** Added plan 0015; updated architecture, active plan
  0001, parent plans 0010/0014, and this canonical log.
- **Known limitations:** Installed three-client macOS/Windows source-audio
  isolation, direct-volume proof, deafen/output switching, pause/teardown,
  native fullscreen, Windows scaling, Retina sizing, and all source edges still
  require the acceptance matrix. Windows code cross-checks from macOS, but a
  Windows MSVC runner/native bundle was not available in this task. Browser QA
  used mock participants; automated layout tests cover 1/2/3/4/6/8 target
  buckets, while installed ultrawide/portrait shares and every panel/theme
  combination remain open. The macOS bundle is not notarized.
- **Next:** Install the final macOS build and a Windows MSVC build on three
  clients, run Entire screen and Application through plan 0015's isolation and
  fullscreen matrix, and keep any failing source mode video-only before
  release.

## 2026-07-20 — Media-first screen-share and room-presence polish

- **Completed:** Removed the focused share identity/audio header and the people
  filmstrip so the shared source owns the full bounded stage. Moved Back to grid,
  fullscreen, and local quality controls onto the bottom media overlay; the
  fullscreen exit remains pinned while secondary controls retain the idle-hide
  behavior. Returning to the gallery now preserves the selected remote
  subscription and renders its live track in the grid instead of reverting to
  “Watch stream.” Removed personal call durations and the redundant `(you)`
  suffix from call tiles and sidebar occupants. Added one room-active timer from
  the earliest current occupant, tightened occupant spacing, reduced avatars,
  enlarged/truncated names, and connected a sidebar avatar ring to LiveKit
  speaking state.
- **Decisions:** Focus is now presentation state rather than subscription state:
  Back or focused-media activation only changes layout, while selecting a
  person/another share, target loss, disconnect, or leave still performs
  cleanup. Black letterboxing is preferred over cropping any source edge.
  Database presence remains the source for room activity; LiveKit supplies the
  real-time speaking signal only for the currently joined room.
- **Validation:**
  - Focused Vitest — passed three files with 34/34 tests for media-first
    controls, still-playing grid return, filmstrip absence, room-level time,
    local-label removal, and speaking rings.
  - `pnpm exec vitest run src/app/App.test.tsx` — passed 6/6 after updating the
    application contract to expect the intentionally suffix-free local name.
  - `node --test scripts/focused-media-layout.test.mjs` — passed 3/3 layout
    checks for the single-row focus stage, pinned bottom fullscreen exit, and
    compact speaking-aware room shelf.
  - Browser visual QA — passed at 1280×720. The actual mock call showed compact
    participant tiles without personal timers or `(you)`, and a temporary
    isolated focused-share preview confirmed an edge-to-edge black media stage
    with non-overlapping bottom-left Back and bottom-right fullscreen controls;
    the preview fixture was removed afterward.
  - First `pnpm check` — failed only because `App.test.tsx` still expected
    `Ayush (you)`; no product check failed. The stale assertion was corrected.
  - Final `pnpm check` — passed Prettier, ESLint, strict renderer/Node
    typechecks, 55 Vitest files with 304 tests, 14 Node tests, version
    synchronization, production build, and secret scan. Vite retains the
    existing non-blocking large-chunk warning; main JavaScript is 1,254.66 kB
    (346.96 kB gzip).
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed Apple
    Silicon `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
  - `pnpm security:scan` and `git diff --check` — passed after the final bundle
    and source audit.
- **Documentation updated:** Updated architecture, active plan 0001, parent
  plans 0010/0014, plan 0015, and this canonical log.
- **Known limitations:** Browser QA used mock media and a CSS-equivalent focus
  fixture rather than a real native screen track. Installed macOS/Windows
  source-audio isolation, fullscreen/scaling, Retina sizing, ultrawide/portrait
  shares, and three-client teardown/switching remain gated by plan 0015's
  acceptance matrix. Room-active time is derived from the earliest currently
  present occupant because presence does not persist a separate room-session
  record.
- **Next:** Run the installed three-client macOS/Windows matrix with a watched
  share returned to the grid, then verify playback continuity, both bottom
  controls, speaking rings, room timing, and every source edge before release.

## 2026-07-21 — Flat monochrome appearance and local Roundo

- **Completed:** Replaced Classic, Signature, Signal Red, Warm/Flat, accents,
  intensity, and their appearance state with one flat grayscale renderer that
  follows `prefers-color-scheme`. Removed the parser-blocking theme bootstrap,
  appearance preference types/migrations/setters/tests, Signal Red effects and
  scheduler, and Signal/Signature texture assets while retaining interface
  sounds and typed communication behavior. Converted first-party CSS and the
  in-app Bakbak SVG to grayscale, kept user/live media unfiltered, and reduced
  Appearance to read-only `Flat`, `Follows system`, and `Roundo` cards. Vendored
  Roundo v2.0's variable WOFF2 and SIL OFL notice, removed all three Fontsource
  families, applied upright weights 200–700 locally, raised dense text to a
  9 px minimum, and set chat/composer text to 14 px. Added a regression test for
  chromatic CSS/SVG colors, old themes/assets/fonts, unsupported type weights,
  vendored font drift, and the fixed Appearance contract.
- **Decisions:** Operating-system light/dark is the only appearance switch;
  legacy `bakbak.appearancePreferences.*` keys remain inert rather than being
  cleaned up. Roundo Regular 400 is used for body/chat text, Medium 500 for
  controls and labels, SemiBold 600 for emphasis, and Bold 700 for headings and
  primary actions; synthetic italic and weights above 700 are not allowed.
  Grayscale semantic states use labels, icons, contrast, borders, rings, and
  opacity. Native installer/application icons remain outside plan 0016.
- **Validation:**
  - Focused `pnpm typecheck`, Settings/App Vitest, and the new monochrome Node
    test — passed strict TypeScript, 29/29 component tests, and 3/3 appearance
    regression tests during implementation.
  - `pnpm format:check` — passed with every matched file formatted.
  - `pnpm lint` — passed with zero warnings.
  - `pnpm typecheck` — passed both renderer and Node TypeScript projects.
  - `pnpm test` — passed 52 Vitest files with 279 tests and 17/17 Node tests.
  - `pnpm build` — passed after transforming 1,995 modules. The stylesheet is
    113.55 kB (19.26 kB gzip) and the main JavaScript chunk is 1,240.92 kB
    (342.67 kB gzip); Vite retains the existing non-blocking large-chunk
    warning.
  - Offline font audit — passed: the production build contains
    `dist/fonts/roundo/Roundo-Variable.woff2`, its CSS uses only that local URL,
    and the installed executable embeds the same route with no Google Fonts,
    Fontshare, or other remote font host string.
  - `pnpm security:scan` — passed for `dist` and the final native bundle before
    and after the Tauri build.
  - `pnpm tauri:build:local` — passed and produced an ad-hoc-signed Apple
    Silicon `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
  - `git diff --check` — passed.
  - In-app browser visual QA — skipped. The localhost policy blocked the mock
    preview reload, so no dark/light screenshot or manual layout result is
    claimed.
- **Documentation updated:** Added plan 0016, updated active plan 0001 and the
  architecture/licensing source of truth, added the Roundo upstream/hash record
  and OFL notice, and appended this canonical log entry.
- **Known limitations:** Dark/light visual checks at 1024×680 and 1280×800
  remain required across auth, chat, voice, profiles, Settings, dialogs,
  soundboard, errors, and focus. Installed macOS and Windows still need human
  review of Roundo's ambiguous glyphs, clipping, line height, and wrapping at
  9–12 px UI and 14–16 px chat sizes, plus an offline network observation. The
  macOS bundle is not notarized.
- **Next:** Install the macOS app and a Windows build, disconnect network font
  access, then complete plan 0016's two-scheme/two-viewport visual and dense
  typography matrix before v1 distribution.

## 2026-07-21 — Space-efficient titlebar and comfortable Roundo

- **Completed:** Replaced the fixed 68 px destination rail with a 48 px app
  frame titlebar and centered accessible Personal/Bakbak segmented switch.
  Preserved per-space selection, drafts, unread markers, active calls, and the
  rule that navigation never disconnects voice. Authentication, invite, and
  startup states now show titlebar branding without navigation; blocking
  dialogs disable only the switch, and voice fullscreen removes the complete
  titlebar. Added an injectable native-window adapter, renderer-owned Windows
  controls, native-overlay macOS configuration, narrow main-window
  capabilities, and a platform-config drift regression. Removed
  `DestinationRail`, moved `AppSpace` into a navigation-neutral module, removed
  the rail width constant/grid column, and returned the recovered width to the
  conversation canvas without changing layout preference v2 or its 232/240 px
  defaults. Applied shared 11–16 px type, 4 px spacing, control/row/composer
  height, 10/14/16/18 px curve, 500/600/700 weight, hover, press, focus, and
  reduced-motion contracts across the renderer; chat and composer text are
  15 px at weight 500 and the contextual header is 60 px.
- **Decisions:** Personal and Bakbak are destinations rather than a binary
  setting, so both labels remain visible and support Arrow/Home/End keyboard
  movement. macOS keeps native traffic lights at a 16×16 inset; Windows is
  undecorated but resizable with native shadow and app-owned controls; browser
  mode exposes no fake window buttons. Linux chrome remains deferred. The
  visual refresh keeps the one system-following grayscale theme, local Roundo,
  flat surfaces, and the existing layout preference key with no data or
  backend migration.
- **Validation:**
  - Focused component/integration runs — passed 15/15 Vitest assertions for
    switch selection/keyboard/state, browser/macOS/Windows chrome behavior,
    adapter reconciliation, and App dialog/auth integration; focused Node
    layout/config/appearance regressions passed 8/8.
  - Mock-browser visual and interaction QA — passed in the dark scheme at
    1024×680, 1280×800, and 2560×1440. The 1024 px shell retained a 492 px
    center canvas, titlebar/context headers measured 48/60 px, chat measured
    15 px weight 500, Settings remained internally scrollable with its switch
    disabled, Personal/server navigation worked, and no page overflow or
    console errors appeared.
  - First `pnpm check` — stopped at ESLint with 18 strict promise/mock errors in
    the new window-adapter test seam. The no-op promises and spy ownership were
    corrected; no runtime or product assertion failed.
  - Final `pnpm check` — passed Prettier, ESLint with zero warnings, both strict
    TypeScript projects, 53 Vitest files with 286 tests, 19/19 Node tests,
    version synchronization, production build, and secret scan. Vite retains
    the existing non-blocking large-chunk warning; the stylesheet is 119.86 kB
    (20.24 kB gzip) and the main JavaScript chunk is 1,244.45 kB (343.54 kB
    gzip).
  - `pnpm tauri:build:local` — passed and produced the ad-hoc-signed ARM64
    `Bakbak.app`. Notarization was skipped because Apple credentials are not
    present.
  - Final `pnpm security:scan`, Mach-O architecture inspection, and
    `git diff --check` — passed for renderer/native artifacts, confirmed the
    installed executable is ARM64, and found no whitespace errors.
- **Documentation updated:** Added plan 0017, updated active plan 0001 and the
  architecture shell/type/platform source of truth, and appended this canonical
  log entry.
- **Known limitations:** Browser QA covered dark mode only and cannot prove
  native traffic-light placement, Windows hit-testing/shadow behavior,
  dragging/double-click maximize, OS shortcuts, native resizing, installed
  light/dark rendering, offline Roundo loading, or screen-share cleanup on
  close. A Windows build and installed interaction matrix were not available in
  this macOS workspace. The local macOS bundle is not notarized.
- **Next:** Install the macOS ARM64 app and a Windows x64 build, then complete
  plan 0017's two-scheme, three-resolution interaction matrix before v1
  distribution.

## 2026-07-21 — Titlebar alignment and panel-control follow-up

- **Completed:** Removed the redundant Bakbak icon/name from the titlebar,
  leaving the left side as a clean native drag region. Moved the context and
  details panel toggles out of the 60 px contextual header and grouped them as
  two VS Code-style 32 px controls at the titlebar's right edge, immediately
  before Windows window controls when present. Preserved their accessible
  labels, `aria-controls`, expanded state, independent persistence, and all
  four panel combinations; blocking dialogs disable these layout controls
  alongside the space switch while native window controls remain available.
  Adjusted the macOS traffic-light inset from 16×16 to 16×24 so the native
  controls align vertically with the 48 px renderer titlebar, and updated the
  platform drift regression.
- **Decisions:** Authentication, invite, and startup screens retain product
  branding in their main content instead of duplicating it in window chrome.
  The contextual header now has one job—identify the current person or room.
  Panel controls use icon-only, borderless hover surfaces at the titlebar's
  right edge; the Personal/Bakbak segment remains geometrically centered.
- **Validation:**
  - Focused WindowTitlebar/App Vitest run — passed 2 files with 13 tests,
    including right-edge placement, callbacks, removal from the contextual
    header, persistence, dialog disabling, and native/browser control variants.
  - `node --test scripts/window-chrome-config.test.mjs` — passed 2/2 platform
    configuration and capability checks with the new macOS inset.
  - Initial `pnpm typecheck` — failed only because exact optional-property
    checking rejected an explicitly passed `undefined` panel-control contract;
    the prop is now omitted outside the signed-in shell. The final strict
    typecheck passed.
  - Mock-browser visual/interaction QA at 1280×800 — passed. The titlebar
    measured 48 px, segment 232×36 px at x=524, and right control group 82×32 px
    at x=1198; no titlebar brand or old contextual-header toggle remained.
    Both panel controls independently hid/restored their panels, the all-hidden
    canvas expanded to 1264 px, Settings disabled both controls, page overflow
    was absent, and the console had no errors.
  - Final `pnpm check` — passed formatting, ESLint, both strict TypeScript
    projects, 53 Vitest files with 287 tests, 19/19 Node tests, version sync,
    production build, and secret scan. Vite retains the existing non-blocking
    large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are absent.
  - Final `pnpm security:scan`, Mach-O architecture inspection, and
    `git diff --check` — passed.
- **Documentation updated:** Updated plan 0017, the architecture titlebar/UI
  composition contract, and this canonical progress log.
- **Known limitations:** Browser QA cannot display native macOS traffic lights,
  so the 16×24 installed alignment still needs direct observation. Windows
  native control spacing and installed light-mode rendering remain part of plan
  0017's release matrix. The local macOS bundle is not notarized.
- **Next:** Open the rebuilt macOS app to confirm traffic-light centering, then
  repeat the titlebar/control check in the Windows x64 build before v1
  distribution.

## 2026-07-21 — Native glass, edge-to-edge panels, and motion polish

- **Completed:** Added plan 0018's system-adaptive glass hierarchy with dark
  68% black/light 66% white panels, 82% strong controls, and 24 px blur at 120%
  saturation while leaving avatars, covers, emoji, video, and screen shares
  unfiltered. Added pre-React native/fallback material detection, transparent
  macOS `underWindowBackground` material with active-state following and the
  required private API feature, plus Rust-gated Windows 11 Mica with an opaque
  Windows 10/browser underlay. Rebuilt the signed-in shell as a stable
  edge-to-edge five-track grid with straight 1 px separators, overlapping 9 px
  resize targets, zero outer padding/gutters/rounding/shadows, and persistent
  side slots that become inert and assistive-technology-hidden at zero width.
  Moved the 232 px space switch left after the macOS safe area, fixed `OG Nahan
Gang` at the true window center, and retained panel/Windows controls at the
  right. Added 220 ms panel collapse, 0/40/80 ms replaceable space entrances, a
  one-shot sub-500 ms launch assembly with an eight-row message cap, immediate
  reduced-motion layout, and delegated 6 px scrollbars that clear scroll
  activity after 650 ms. Preserved `bakbak.layoutPreferences.v2`, panel sizes,
  visibility, drafts, navigation, voice ownership, backend contracts, and the
  420 px center minimum.
- **Decisions:** Browser and Windows 10 use an opaque CSS underlay rather than
  exposing desktop content; Windows 10 deliberately receives no Acrylic.
  Windows native material is limited to build 22000 or newer. macOS private
  material is accepted for Bakbak's private distribution even though it rules
  out Mac App Store submission. Hidden panel components remain mounted for
  local state continuity, but both their controls and resizer contract disable
  immediately. Motion is visual only: app/voice/draft state remains above the
  keyed entrance subtrees, and repeated switches replace the current revision
  rather than queueing it.
- **Validation:**
  - Focused Vitest and Node contract runs — passed 44/44 component/App tests and
    9/9 glass, shell, appearance, native-config, and window-capability checks.
  - Initial `pnpm lint` — failed on two unhandled `act(...)` return values in
    the new scrollbar timer test; both are now explicitly ignored with `void`.
    No product assertion failed, and the final lint passed with zero warnings.
  - Dark mock-browser QA — passed at 1024×680, 1280×800, and 2560×1440 with no
    document overflow or console warnings/errors. The shell measured from x=0
    to the full viewport with 0 px padding/gap, tracks were `266/1/516/1/240`
    at the minimum viewport, and the title center was within 0.01 px of the
    window center. All four panel combinations settled to the correct stable
    five-track geometry; hidden slots remained mounted, inert, `aria-hidden`,
    and paired with disabled resizers. The scrollbar thumb was transparent at
    rest, visible during focus/scroll, and hidden after 650 ms. Startup moved
    from `running` to `complete` once, and Personal/Bakbak used the approved
    0/40/80 ms stagger without interrupting shell state.
  - `pnpm check` — passed Prettier, ESLint, both strict TypeScript projects, 54
    Vitest files with 290 tests, 23/23 Node tests, version synchronization,
    production build, and secret scan. Vite retains the existing non-blocking
    large-chunk warning; the stylesheet is 128.79 kB (21.50 kB gzip) and the
    main JavaScript chunk is 1,246.31 kB (344.17 kB gzip).
  - `cargo fmt --check`, `cargo check --manifest-path src-tauri/Cargo.toml`, and
    `git diff --check` — passed.
  - `pnpm tauri:build:local` — passed and produced the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are not
    present. Post-build secret scan, strict deep code-sign verification, and
    Mach-O inspection passed and confirmed an ARM64 executable.
- **Documentation updated:** Added plan 0018 as the current visual/layout
  authority, recorded its supersession boundaries in plans 0016 and 0017,
  updated active plan 0001, updated architecture material/layout/motion and
  scrollbar contracts, changed the Appearance summary to `Glass`, and appended
  this canonical log entry.
- **Known limitations:** Browser automation exposed only the dark system scheme,
  so light tokens have automated/static coverage but the light visual matrix
  remains open. The rebuilt macOS app was compiled and signature-verified but
  still needs direct installed observation of wallpaper vibrancy, inactive
  state, traffic lights, shadow, drag/resize/fullscreen, contrast, and startup
  flash. Windows 10 fallback and Windows 11 Mica require installed Windows
  checks; no Windows build target was available in this macOS workspace. The
  local app is not notarized.
- **Next:** Run the light browser matrix, inspect the rebuilt macOS app over
  varied wallpapers and active/inactive states, then validate the same startup
  and window-interaction matrix on installed Windows 10 and Windows 11 builds.

## 2026-07-22 — Discord-inspired controls and member rail

- **Completed:** Added plan 0019's system-adaptive semantic palette while
  keeping the glass shell and ordinary chrome neutral. Rebuilt the connected
  voice footer as a stacked status/action surface, extracted one
  `SidebarUserDock` for Personal and server spaces, and aligned the retained
  floating voice dock and soundboard stop action with the same selected,
  destructive, disabled, and icon states. Reworked the server member rail into
  compact In Voice, Online, and Offline groups with deterministic sorting,
  current-call-over-heartbeat deduplication, streaming/channel labels, offline
  treatment, and lazy authenticated static cover-poster accents that preserve
  focal position without requesting cover animation. Kept profile opening,
  panel persistence, call continuity, media authorization, and backend
  contracts unchanged.
- **Decisions:** Plan 0019 supersedes only plans 0016/0018's fully monochrome
  semantic-state clauses. Neutral chrome stays grayscale; only the approved
  positive, danger, selected, warning, and icon tokens may be chromatic. The
  current connected/reconnecting call overwrites matching presence activity so
  local state appears immediately, while activity for unknown voice channels
  is ignored. Missing or failed cover posters remain neutral and silent.
- **Validation:**
  - Focused Vitest and Node contract runs — passed 5 component/App files with
    22 tests and 7 appearance/glass tests while implementing the change.
  - Dark mock-browser QA — passed at 1024×680, 1280×800, and 2560×1440 with
    200/240/360 px side panels, no document overflow, and no console warnings
    or errors. Verified disconnected and active call hierarchy, In Voice
    grouping, muted danger state, selected soundboard/pinned dock behavior,
    visible disconnect/stop controls, correct positive/danger/warning computed
    colors, offline treatment, and panel resizing/reset. The mock fixtures have
    no cover posters, so focal positioning, lazy loading, and failure fallback
    were verified in component tests rather than this visual pass.
  - `pnpm format:check` — passed; all tracked files match Prettier.
  - `pnpm lint` — passed with zero warnings.
  - `pnpm typecheck` — passed both strict TypeScript projects.
  - `pnpm test` — passed 55 Vitest files with 298 tests and 24/24 Node tests.
  - `pnpm build` — passed; Vite produced the renderer bundle and retained the
    existing non-blocking large-chunk warning. The stylesheet is 136.82 kB
    (22.67 kB gzip) and the main JavaScript chunk is 1,248.28 kB (344.98 kB
    gzip).
  - `pnpm security:scan` — passed for `dist` and the existing release bundle.
  - `pnpm tauri:build:local` — passed and produced the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are absent.
  - `git diff --check` and a changed-diff secret-pattern inspection — passed.
- **Documentation updated:** Added plan 0019, recorded its narrow supersession
  in plans 0001/0016/0018, updated the architecture UI, presence-merge, and
  profile-media contracts, and appended this canonical progress entry.
- **Known limitations:** The selected browser exposed only the dark system
  scheme; light tokens have exact palette/contrast static coverage, but the
  light visual matrix remains open. Installed macOS material, light-mode,
  inactive-window, and interaction observation was not performed. Windows 10
  fallback and Windows 11 Mica/member-rail checks require an installed Windows
  build. The local macOS bundle is not notarized.
- **Next:** Run the light browser matrix with cover-bearing fixtures, inspect
  the rebuilt macOS bundle directly, then repeat the member/control state
  matrix on installed Windows 10 and Windows 11 builds.

## 2026-07-22 — Member spacing, draggable jokes, and user-dock cover

- **Completed:** Increased the visual separation between compact member cards
  to 5 px. Made the complete centered title track use the existing native
  drag/double-click window adapter, added deterministic eight-second idle jokes,
  and switched immediately to concise room-aware connecting, connected,
  reconnecting, and error copy when voice state changes. Added the signed-in
  member's authenticated static cover poster as a focal-positioned background
  across the shared Personal/server user dock with a neutral contrast gradient.
  The dock never requests cover animation, and missing or failed posters retain
  the existing neutral surface.
- **Decisions:** Title copy rotates locally without persistence, randomness, or
  backend state so tests and layouts remain deterministic. `OG Nahan Gang`
  remains the first idle line. The centered track stays independently centered
  and clips unusually long room names without changing the titlebar grid. The
  user dock reuses `ProfileMediaCache` and the existing private cover-poster
  authorization path; no media, voice, database, or preference contract changed.
- **Validation:**
  - Focused Vitest run — passed 3 files with 19 titlebar, App, and shared-user-
    dock tests, including center dragging, title rotation/voice reset, static-
    only focal cover loading, failure fallback, and existing callbacks.
  - Focused appearance contract run — passed 7/7 glass and semantic-color tests.
  - Initial `pnpm lint` — failed on one floating `act(...)` result in the new
    timer test; the callback now returns nothing. Final lint passed with zero
    warnings.
  - Dark mock-browser QA at 1280×720 — passed with a measured 5 px gap between
    member cards, automatic idle-title rotation, immediate
    `Queue: chaos connected` copy after joining Queue, an interactive center
    title surface, no document overflow, and no console warnings or errors. The
    mock profile has no cover, so the dock cover's focal rendering and failure
    behavior were verified in component/static tests instead of this screenshot.
    Browser automation cannot physically drag the native desktop window; the
    adapter invocation is covered by the component regression.
  - `pnpm format:check` — passed; all files match Prettier.
  - `pnpm lint` — passed with zero warnings.
  - `pnpm typecheck` — passed both strict TypeScript projects.
  - `pnpm test` — passed 55 Vitest files with 301 tests and 24/24 Node tests.
  - `pnpm version:check` — passed at synchronized version `0.16.0`.
  - `pnpm build` — passed; Vite retains the existing non-blocking large-chunk
    warning. The stylesheet is 137.62 kB (22.79 kB gzip) and the main JavaScript
    chunk is 1,249.67 kB (345.46 kB gzip).
  - Final `pnpm security:scan`, `git diff --check`, and changed-diff secret-
    pattern inspection — passed with no forbidden material.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; strict deep code-sign verification and Mach-O inspection
    passed. Notarization was skipped because Apple credentials are absent.
- **Documentation updated:** Updated plans 0001, 0017, and 0019, the titlebar,
  member-rail, sidebar-media architecture contracts, and this canonical log.
- **Known limitations:** Direct installed observation is still required for
  macOS/Windows drag and double-click behavior. Light-mode cover contrast and an
  actual cover-bearing user dock were not available in the mock browser fixture.
  The local macOS bundle is not notarized.
- **Next:** Open the rebuilt macOS bundle to confirm title dragging from the
  text itself and cover contrast with the signed-in profile, then repeat those
  checks in light mode and the Windows installed build.

## 2026-07-22 — Full titlebar drag hit-area correction

- **Completed:** Inspected the supplied 15.93-second macOS recording and
  confirmed the previous fix covered only selected leading, centered, and
  trailing children rather than the complete 48 px titlebar. Moved mouse-down
  drag and double-click maximize handling to one header-level boundary so every
  blank region and non-control descendant delegates to the existing native
  window adapter. Removed the child-level handlers and explicitly excluded the
  Personal/Bakbak navigation, panel controls, Windows controls, links, and form
  controls from drag/maximize handling.
- **Decisions:** The renderer continues using the narrowly scoped Tauri window
  adapter; no capability or native command changed. Header event delegation is
  used instead of relying on empty flex spans whose rendered hit area can
  collapse. Primary-button drag prevents default text behavior, while control
  groups retain their normal pointer interaction and never start a drag.
- **Validation:**
  - `ffprobe` plus an eight-frame contact sheet of the supplied 1632×1068 H.264
    recording — confirmed the failed attempts occurred over titlebar regions
    outside the previously instrumented child surfaces.
  - Focused `WindowTitlebar` Vitest run — passed 8/8 tests covering direct
    header, leading, centered text, center track, trailing, and pre-shell drag
    targets; blank-region double-click maximize; and zero drag/maximize calls
    from navigation, panel, and window controls.
  - `node --test scripts/glass-shell.test.mjs` — passed 3/3 contracts and now
    enforces exactly one titlebar mouse-down/double-click handler plus control
    target filtering.
  - Dark mock-browser QA at 1280×720 — the titlebar measured 1280×48 px with
    `pointer-events: auto`; 40/40 sampled points at both the top and bottom and
    31 non-control points at mid-height resolved to drag territory, while the
    remaining nine mid-height samples were intentional controls. No sample was
    uncovered, the Personal switch remained clickable, and the console had no
    warnings or errors.
  - `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and
    `pnpm version:check` — passed; version remains synchronized at `0.16.0`.
  - `pnpm test` — passed 55 Vitest files with 302 tests and 24/24 Node tests.
  - `pnpm build` — passed; Vite retains the existing non-blocking large-chunk
    warning. The stylesheet is 137.84 kB (22.83 kB gzip) and the main JavaScript
    chunk is 1,250.39 kB (345.69 kB gzip).
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; strict deep code-sign verification and Mach-O inspection
    passed. Notarization was skipped because Apple credentials are absent.
  - Final `pnpm security:scan`, `git diff --check`, and changed-diff secret-
    pattern inspection — passed with no forbidden material.
- **Documentation updated:** Corrected the titlebar contract in plans 0001,
  0017, and 0019, updated the architecture description, and appended this
  correction rather than rewriting the earlier progress entry.
- **Known limitations:** Browser automation verifies complete renderer hit-area
  ownership and component tests verify native adapter calls, but it cannot
  physically move the installed macOS/Windows window. The rebuilt macOS bundle
  still requires one direct drag and maximize observation; it is not notarized.
- **Next:** Launch the rebuilt macOS bundle and drag from the far-left blank
  area, centered text, upper/lower titlebar edges, and blank space before the
  panel controls, then repeat the same matrix on Windows.

## 2026-07-22 — Instant panel resizing without selection

- **Completed:** Made left and right pointer resizing bypass the shell's 220 ms
  grid transition for the exact duration of an active drag, so the side panel
  and conversation canvas respond to the same current width instead of chasing
  it. Pointer start now prevents the browser's native selection gesture, clears
  any existing range, focuses/captures the separator, and applies a temporary
  document-wide `user-select: none` plus resize cursor. Pointer release,
  cancellation, lost capture, or window blur removes listeners and restores
  normal selection and motion. Panel show/hide animation, keyboard arrows,
  Home/End, double-click reset, persisted widths, and the 200–360 px bounds are
  unchanged.
- **Decisions:** The resize guard is a short-lived root class rather than
  persisted React state, so transition removal happens synchronously before the
  first movement and adds no render-frame delay. Window-level release/cancel
  listeners supplement pointer capture for cleanup if a platform delivers the
  terminal event away from the separator.
- **Validation:**
  - Focused Vitest run — passed 2 files with 11 PanelResizer and App layout
    tests, including pointer delta, focus/capture, selection clearing, active
    class cleanup, both directions, keyboard bounds, reset, and hidden state.
  - `node --test scripts/glass-shell.test.mjs` — passed 3/3 shell, resize,
    glass, motion, and scrollbar contract tests.
  - Dark mock-browser QA at 1280×720 — observed zero selection ranges and a
    `0s` grid transition while the resize guard was active, followed by normal
    `0.22s` collapse motion after cleanup; there was no page overflow or console
    warning/error. The browser automation backend could not reliably deliver a
    movement sequence to the captured 9 px separator, so exact pointer delta
    and terminal-event behavior use the component regression above.
  - The first full-suite attempt ran all heavyweight jobs concurrently and one
    existing App draft test exceeded its timeout under contention. Its immediate
    isolated rerun passed 7/7, and the final sequential `pnpm test` passed 55
    Vitest files with 302 tests plus 24/24 Node tests.
  - `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and
    `pnpm version:check` — passed; version remains synchronized at `0.16.0`.
  - `pnpm build` — passed; Vite retains the existing non-blocking large-chunk
    warning. The stylesheet is 137.84 kB (22.83 kB gzip) and the main JavaScript
    chunk is 1,250.39 kB (345.69 kB gzip).
  - Final `pnpm security:scan`, `git diff --check`, and changed-diff secret-
    pattern inspection — passed with no forbidden material.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; strict deep code-sign verification and Mach-O inspection
    passed. Notarization was skipped because Apple credentials are absent.
- **Documentation updated:** Updated plan 0018, active plan 0001, the shell and
  local-preference resize architecture, and this canonical progress log.
- **Known limitations:** The rebuilt macOS and Windows applications still need
  direct human observation of continuous pointer feel and selection suppression
  because the mock browser cannot reproduce native WebView pointer capture
  perfectly. The local macOS bundle is not notarized.
- **Next:** Drag both installed panel separators rapidly across their full range
  on macOS, then repeat on Windows and confirm the canvas remains locked to the
  pointer with no blue selection residue.

## 2026-07-22 — Personal, voice, appearance, and soundboard polish

- **Completed:** Replaced the Personal DM header's generic message icon with
  the selected person's avatar. Made the Personal details rail load and play
  GIF avatar/cover media while respecting reduced motion and preserving cover
  focal position. Reworked the new-message member picker so long names remain
  contained and outside pointer or Escape dismisses it. Added a funny,
  actionable disconnected voice-room state with a direct rejoin action instead
  of a blank canvas. Restored device-local Auto, Light, and Dark scheme
  selection, applied it before React mounts, synchronized theme-color metadata,
  removed the typography summary, and repaired the responsive Appearance
  layout. Replaced the soundboard's large stop footer with a bottom-left
  circular stop control and an active `n/5` count; the floating dock count now
  uses the same format.
- **Decisions:** Theme selection is intentionally scheme-only: accent, surface,
  intensity, preset, and typography controls remain excluded. Auto continues
  to follow live operating-system changes; invalid stored values fall back to
  Auto. GIF playback remains disabled under reduced motion. The member picker
  is a non-modal anchored dialog, so click-away dismissal does not make the
  rest of the Personal space inert. Unrelated concurrent Bakbak Orbit
  branding/icon changes were preserved and were not treated as work completed
  by this task.
- **Validation:**
  - Focused strict TypeScript plus Vitest/Node appearance run — passed 7 files
    with 65 tests and all 4 appearance contract tests.
  - Mock-browser QA at 1280×800 — passed. The 216 px picker stayed inside the
    232 px Personal rail with `scrollWidth === clientWidth`, outside click
    dismissed it, and the DM header exposed the selected participant avatar.
  - Mock-browser Appearance QA at 1280×800 and 1024×720 — passed. Auto, Light,
    and Dark each applied the expected computed color scheme; the compact page,
    canvas, and picker had no horizontal/document overflow; Auto was restored;
    and the console had no warnings or errors.
  - `pnpm format:check` — passed; all files match Prettier.
  - `pnpm lint` — passed with zero warnings.
  - `pnpm typecheck` — passed both strict TypeScript projects.
  - `pnpm test` — passed 58 Vitest files with 310 tests and 24/24 Node tests.
  - `pnpm version:check` — passed at synchronized version `0.16.0`.
  - `pnpm build` — passed; Vite produced the renderer bundle with the existing
    non-blocking large-chunk warning. The stylesheet is 146.19 kB (24.14 kB
    gzip) and the main JavaScript chunk is 1,254.51 kB (346.86 kB gzip).
  - Final `pnpm security:scan`, changed-diff secret-pattern inspection, and
    `git diff --check` — passed with no forbidden material or whitespace errors.
  - `pnpm tauri:build:local` — passed and produced the ad-hoc-signed ARM64
    `Bakbak.app`; strict deep code-sign verification and Mach-O inspection
    passed. Notarization was skipped because Apple credentials are absent.
- **Documentation updated:** Updated the architecture's DM media/picker,
  disconnected voice, appearance preference, local-storage, and compact
  sound-stop contracts; amended active plan 0001 and plan 0016's supersession
  boundary; appended this canonical progress entry.
- **Known limitations:** The mock profiles do not contain GIF assets, so
  animated DM avatar/cover loading and focal positioning were verified in
  component tests rather than the browser preview. The browser path auto-joins
  selected voice rooms and had no active sound stack, so the disconnected voice
  state and compact active sound counter were verified in component tests.
  Real installed GIF playback, explicit-theme native material contrast,
  post-leave voice copy, and sound-stop behavior still require direct macOS and
  Windows observation. The local macOS bundle is not notarized.
- **Next:** In the installed app, open a DM with a GIF avatar/cover, switch all
  three schemes, leave and rejoin a voice room, and play/stop overlapping sounds;
  then repeat the interaction and contrast checks on Windows.

## 2026-07-22 — Bakbak Orbit branding and native app icon

- **Completed:** Replaced the messaging-bubble identity with the original
  generated Bakbak Orbit artwork: two abstract circular conversation forms
  facing a central spark over a dark aurora surface. Added the 512 px renderer
  asset, switched the favicon, authentication, invite, loading, and empty
  Personal identity surfaces to it, regenerated the tracked macOS, Windows,
  iOS, and Android icon variants from the full-resolution output, and rebuilt
  the local macOS app. Reworked the server header into a
  contained 84 px premium brand card with a 46 px artwork tile, active server
  name, restrained indigo/cyan/coral aura, orbit lines, and fine dot grain.
  Removed `Friends-only adda` without adding another subtitle.
- **Decisions:** Kept ordinary glass chrome neutral and treated the generated
  artwork plus one explicitly delimited CSS brand block as the sole decorative
  chroma exception. The mark remains decorative beside the visible server name.
  The two-form silhouette is an original conversation metaphor with an
  arcade-circle influence, not a Pac-Man, Discord, Gemini, or speech-bubble
  reproduction. Used the built-in image generator and kept the project-bound
  result at `public/bakbak-orbit.png`.
- **Validation:**
  - Focused ChannelSidebar Vitest — passed 11/11 tests, including artwork
    presence and retired-tagline absence.
  - `node --test scripts/monochrome-appearance.test.mjs` — passed 4/4 brand,
    semantic-colour, font, and appearance guards; ordinary chrome remains
    grayscale after removing only the marked brand block.
  - Mock-browser dark QA at 1280×720 and 1024×680 — observed a 232×84 header,
    loaded 512 px source artwork rendered at 46×46, no `Friends-only adda`, no
    sidebar overflow, no page overflow, and a 550 px centre canvas at the
    minimum viewport.
  - `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and
    `pnpm version:check` — passed; version remains synchronized at `0.16.0`.
  - `pnpm test` — passed 58 Vitest files with 310 tests plus 24/24 Node tests.
  - `pnpm build` — passed; Vite retains the existing non-blocking large-chunk
    warning. The stylesheet is 146.36 kB (24.24 kB gzip), the main JavaScript
    chunk is 1,254.51 kB (346.17 kB gzip), and the renderer icon is 312 kB.
  - `pnpm security:scan`, changed-diff secret-pattern inspection,
    `git diff --check`, and the rendered-text search — passed with no forbidden
    material or remaining rendered tagline.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app` with the generated icon bundle. Notarization was skipped because
    Apple credentials are absent.
- **Documentation updated:** Added plan 0020 and updated the active plan,
  architecture identity/appearance contracts, repository structure, visual
  regression boundary, and this canonical progress log.
- **Known limitations:** The final macOS Dock/app-switcher/DMG icon and Windows
  taskbar/installer icon still need human observation. Browser QA covered the
  dark mock shell; the fixed dark identity card is designed for both schemes but
  still needs direct light-mode and installed native-material observation. The
  standard updater-enabled `pnpm tauri build` was not run because protected
  updater signing material is unavailable locally; the repository-supported
  local app-only bundle passed instead.
- **Next:** Open the rebuilt macOS app and inspect the icon in the Dock and app
  switcher, then confirm the Windows taskbar/NSIS artwork and the header against
  light native material before the next friend-test build.

## 2026-07-23 — Hydrate Direct Message avatars

- **Completed:** Fixed Personal conversation rows that showed initials even
  when the other participant had an uploaded avatar. Direct-conversation
  results now resolve their private `avatar_path` through the existing
  profile-media cache before entering application state, so the left DM list
  and selected-conversation header share the real poster URL. Matching
  already-downloaded workspace avatars are reused.
- **Decisions:** Kept avatar hydration outside the presentational sidebar so
  every consumer of the selected direct participant receives the same resolved
  media. A failed private-media download remains non-blocking and falls back to
  initials, preserving access to the conversation.
- **Validation:**
  - Focused avatar/sidebar/details Vitest run — passed 3 files with 6 tests,
    including private-path download, workspace-avatar reuse, and graceful
    failure coverage.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects, 59
    Vitest files with 313 tests, 24/24 Node contract tests, synchronized version
    `0.16.0`, the production renderer build, and the bundle secret scan. Vite
    retained the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are absent.
  - Final `git diff --check` and changed-diff secret-pattern inspection —
    passed.
- **Documentation updated:** Documented private DM avatar-poster hydration in
  the application-shell data flow and appended this canonical progress entry.
- **Known limitations:** The live signed-in account and private Storage path
  were not available to the automated browser fixture, so the exact Bhindi and
  Thanda Admin posters still need a quick installed-app visual confirmation.
  The local macOS bundle is not notarized.
- **Next:** Reopen Personal in the installed app and confirm both uploaded
  posters appear in the left DM list and selected-conversation header.

## 2026-07-23 — Replace Orbit with minimal motion branding

- **Completed:** Replaced the colorful Bakbak Orbit treatment with a generated
  flat native/favicon frame built from one open conversation ring and three
  particles. Added the reusable code-native `BakbakMotionMark` SVG to
  authentication, invite, loading, empty-Personal, and server identity
  surfaces; its jaws chomp and particles advance while reduced-motion users
  receive a static mark. Regenerated the complete Tauri macOS, Windows, iOS,
  and Android icon bundle. Rebuilt the server identity header as a solid,
  gradient-free surface with light/dark-responsive ink, paper, border, orbit,
  mark, lime-particle accent, and fine monochrome noise.
- **Decisions:** Kept the desktop icon as a static, legible frame because native
  shells do not provide one portable animated-icon contract; the renderer owns
  the actual motion. Used an original open-ring conversation metaphor instead
  of a character face or direct Pac-Man copy. Kept the texture in a separate
  turbulence SVG so CSS can tint its blend and opacity per scheme without
  baking another fixed background into the interface.
- **Validation:**
  - Focused motion-mark and channel-sidebar Vitest run — passed 2 files with 12
    tests.
  - `node --test scripts/monochrome-appearance.test.mjs` — passed 4/4 motion
    branding, semantic-color, Roundo, and appearance contracts, including the
    no-gradient, noise, bounded-accent, and reduced-motion guards.
  - Mock-browser QA at 1280×720 and 1024×680 — passed. The header measured
    232×80 px with a 48 px mark; the jaw transform changed over 360 ms; dark
    used a solid `rgb(16, 17, 20)` surface with 0.14 noise opacity; light used
    `rgb(242, 240, 233)` with ink `rgb(21, 22, 25)`, lime
    `rgb(93, 122, 24)`, and 0.10 noise opacity. No gradient, page/sidebar
    overflow, console warning, or console error was present.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects, 60
    Vitest files with 314 tests, 24/24 Node contract tests, synchronized version
    `0.16.0`, production renderer build, and bundle secret scan before a
    separate concurrent soundboard edit entered the shared tree. On that final
    shared tree, lint, both TypeScript projects, the same 314/24 tests,
    production build, and bundle secret scan passed again; the repository-wide
    format recheck failed only on that unrelated
    `src/features/soundboard/Soundboard.test.tsx` edit. An explicit check of all
    branding files passed.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are absent.
  - Full-resolution inspection of `src-tauri/icons/icon.png` — passed for
    centered geometry, safe margins, clean silhouette, and restrained grain.
- **Documentation updated:** Updated the current architecture, active v1 plan,
  and plan 0020 visual/acceptance contracts; appended this canonical progress
  entry.
- **Known limitations:** Native desktop icons remain static by platform
  contract. The rebuilt icon still needs final installed Dock/app-switcher and
  Windows taskbar/installer observation; the local macOS bundle is not
  notarized. A concurrent soundboard test edit remains unformatted and was
  preserved rather than modified as part of this branding task.
- **Next:** Open the rebuilt app for the installed macOS icon check, then verify
  the Windows taskbar and installer artwork before the next friend-test build.

## 2026-07-23 — Float the soundboard stop control

- **Completed:** Removed the soundboard's dedicated stop footer and replaced it
  with a standalone circular control over the drawer's bottom-right corner.
  The optional active `n/5` count now sits immediately to the button's left,
  while a compact radial scrim fades from transparent into the active theme's
  dark or light glass. The existing voice-control dock remains the full
  bottom-bar treatment.
- **Decisions:** Kept the stop control mounted and disabled at zero sounds so
  its location stays predictable. The scrim is pointer-transparent except for
  the button, and the scrolling sound list keeps enough trailing space that the
  overlay cannot hide the final sound row.
- **Validation:**
  - Focused Soundboard Vitest — passed 9/9 tests, including the new standalone
    non-footer contract and stop behavior.
  - `node --test scripts/monochrome-appearance.test.mjs` — passed 4/4
    appearance and semantic-control contracts.
  - Mock-browser QA in Dark and Light — passed. The stop button remained the
    rightmost item at an 11 px drawer-edge gap, the active `1/5` count rendered
    to its left, and computed scrim colors resolved to black and white
    respectively. The browser console had no warnings or errors; Auto theme was
    restored after validation.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects, 60
    Vitest files with 314 tests, 24/24 Node contract tests, synchronized version
    `0.16.0`, the production renderer build, and the bundle secret scan. Vite
    retained the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are absent.
  - Final `git diff --check` and changed-diff secret inspection — passed.
- **Documentation updated:** Updated the soundboard runtime contract and plan
  0007's completed stopping-control criterion; appended this canonical progress
  entry.
- **Known limitations:** The corner fade still needs direct observation over
  native macOS and Windows material. The local macOS bundle is not notarized.
- **Next:** Open the installed soundboard in both schemes, play two overlapping
  sounds, and confirm the bottom-right Stop plus `2/5` remain clear while
  scrolling the final row.

## 2026-07-23 — Add instant local workspace cache and voice acceleration

- **Completed:** Added the user-scoped `bakbak-cache` IndexedDB database for
  normalized account state, confirmed thread history, and profile-media blobs.
  Restored the last text channel or Personal DM stale-while-revalidate, kept
  per-thread in-session history, added cursor pagination and stable message
  merging, progressively hydrated visible profile media through memory,
  IndexedDB, then Supabase Storage, and introduced a clearly marked read-only
  cached/offline state with online, focus, and bounded-backoff recovery.
  Added Data & storage usage, retention copy, and confirmation-protected
  current-account clearing. Accelerated voice preparation with immediate
  keyboard focus, 75 ms hover dwell, a reusable prewarmed 48 kHz RNNoise
  AudioContext, host-scoped ten-minute relay hints, and identifier-free stage
  timings.
- **Decisions:** Kept Supabase RLS, current membership, Storage policy,
  Realtime, and LiveKit authorization authoritative; cached records only paint
  the interface. Retained cache across logout but isolated every key by Bakbak
  user ID. Persisted only the newest 200 confirmed messages per thread and
  capped profile media at 256 MiB per account with least-recently-used pruning.
  Kept soundboard caching separate and never persisted LiveKit tokens, rooms,
  tracks, credentials, optimistic messages, or object URLs.
- **Validation:**
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects, 62
    Vitest files with 325 tests, 24/24 Node contract tests, synchronized version
    `0.16.0`, the production renderer build, and the bundle secret scan. Vite
    retained the existing non-blocking large-chunk warning.
  - Mock-browser QA — passed the Data & storage layout, current usage and
    freshness presentation, 200-message/256 MiB policy copy, two-step clear
    confirmation, safe cancellation, and zero browser warnings or errors.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are absent.
- **Documentation updated:** Added plan 0021, linked its delivery from the
  active desktop-v1 plan, updated architecture data flow/security and cache
  contracts, added the README privacy/retention explanation, and appended this
  canonical progress entry.
- **Known limitations:** The 300 ms cached-startup, 100 ms room-switch, 1.5
  second prepared-voice, and 3 second cold-voice targets still require ten
  installed runs with median, p95, and failure records on macOS and Windows.
  Installed offline restore/reconnect/clear acceptance also remains pending on
  both platforms. The local macOS bundle is not notarized.
- **Next:** Run the plan 0021 installed performance matrix on macOS and Windows,
  record median/p95 plus exact failures, and tune only stages that miss their
  target.

## 2026-07-23 — Recover stale cached profile covers

- **Completed:** Replaced raw cached cover `<img>` elements with one shared
  profile-media image boundary across the member rail, signed-in user dock,
  profile popover, and Personal details panel. A WebKit decode failure now
  removes the broken frame immediately, evicts that account/bucket/path from
  memory and IndexedDB, coalesces concurrent recovery requests, and retries the
  authenticated Storage object once. A second failure or pathless legacy-image
  failure stays on the neutral fallback instead of showing the native blue
  question-mark icon.
- **Decisions:** Recovered only the exact failed media revision rather than
  clearing the account cache or slowing every successful cache hit with an
  eager decode probe. Limited recovery to one network retry per mounted image
  so a deleted or genuinely invalid source cannot loop or hammer private
  Storage. Kept retry authorization on the existing Supabase Storage path.
- **Validation:**
  - Focused profile-media Vitest run — passed 6 files with 21 tests, including
    stale-path eviction, Storage refresh, one-retry behavior, final neutral
    fallback, profile popover, member rail, user dock, and Personal details.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects, 63
    Vitest files with 328 tests, 24/24 Node contract tests, synchronized version
    `0.16.0`, the production renderer build, and bundle secret scan. Vite kept
    the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are absent.
- **Documentation updated:** Updated the profile-media lifecycle and failure
  recovery contract in architecture and appended this canonical progress entry.
- **Known limitations:** The exact private covers shown in the report are not
  available in mock mode, so their successful authenticated retry still needs
  one installed-app observation. The local macOS bundle is not notarized, and
  Windows WebView2 observation remains pending.
- **Next:** Open the rebuilt installed app, revisit the reported member rail,
  user dock, and Bhindi profile, and confirm each stale cached cover refreshes
  once without a question-mark placeholder.

## 2026-07-23 — Replace the server logo with a Beta version chip

- **Completed:** Removed the animated Bakbak mark from the channel-panel server
  header and replaced it with an accessible `BETA` / `v0.16.0` release chip
  beside the current server name. Added one renderer version constant sourced
  directly from `package.json`, so the chip follows future synchronized release
  bumps instead of carrying a second hardcoded version. Preserved the solid
  theme-responsive header surface, restrained noise, orbit texture, and logo
  use on the app icon and larger authentication/loading identity screens.
- **Decisions:** Limited removal to the compact server header shown in the
  report rather than deleting Bakbak's product icon globally. Used a 30 px
  pill with an internal divider, tabular version numerals, the existing Roundo
  11 px readability floor, and truncation only for unusually long server names.
  Kept the complete release context in an accessible label.
- **Validation:**
  - Focused `ChannelSidebar` Vitest run — passed 11/11 tests, including the
    current version, Beta label, retired tagline, and absent header-mark
    contracts.
  - `node --test scripts/monochrome-appearance.test.mjs` — passed 4/4 branding,
    semantic-color, Roundo, and appearance contracts.
  - Mock-browser QA at 1280×720 — passed in Dark and Light. The header measured
    232×80 px and the chip 100.77×30 px; `BETA v0.16.0` and the complete mock
    server name, The Corner, rendered without a logo or horizontal overflow.
    Dark resolved to `rgb(16, 17, 20)` with 0.14 noise opacity; Light resolved
    to `rgb(242, 240, 233)` with 0.10 noise opacity. Appearance was restored to
    Auto after testing.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects, 63
    Vitest files with 328 tests, 24/24 Node contract tests, synchronized version
    `0.16.0`, production renderer build, and bundle secret scan. Vite retained
    the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are absent.
- **Documentation updated:** Updated the current architecture, active desktop-v1
  plan, plan 0020 visual contract, and this canonical progress log.
- **Known limitations:** The compact header still needs one installed
  macOS/Windows native-material observation. The local macOS bundle is not
  notarized.
- **Next:** Confirm the Beta/version chip against real native light and dark
  materials, then let the synchronized release tooling supply the next version
  automatically.

## 2026-07-23 — Refine the server header release chip

- **Completed:** Replaced the shouty `BETA` / `v0.16.0` header badge with a
  quieter Bakbak wordmark plus compact `β · v0.16.0` release chip. Kept the
  version sourced from `package.json`, preserved the no-logo server header, and
  retained the theme-responsive solid surface, noise, and orbit treatment.
- **Decisions:** Made Bakbak the fixed brand text in the identity header rather
  than repeating the mock server name, because this header is now product
  branding instead of multi-server navigation. Used the visible beta symbol for
  polish while keeping the accessible label as `Beta release, version 0.16.0`.
  Added real spaces around the dot so copied/inspected text matches the visual
  `β · vX.Y.Z` contract.
- **Validation:**
  - Focused `ChannelSidebar` Vitest run — passed 11/11 tests, including the
    Bakbak wordmark, `β · v0.16.0` chip text, accessible beta/version label,
    retired tagline, and absent header-logo contracts.
  - `node --test scripts/monochrome-appearance.test.mjs` — passed 4/4 branding,
    semantic-color, Roundo, and appearance contracts.
  - Mock-browser QA at 1280×720 — passed in Dark and Light. The header measured
    232×80 px, the chip measured 76.41×30 px, `β · v0.16.0` rendered with
    `Beta release, version 0.16.0`, no logo appeared, and there was no page or
    sidebar horizontal overflow. Dark resolved to `rgb(16, 17, 20)` with 0.14
    noise opacity; Light was selected through Settings and resolved to
    `rgb(242, 240, 233)` with 0.10 noise opacity. Appearance was restored to
    Auto after testing.
  - Initial `pnpm check` — failed at Prettier for
    `src/features/channels/ChannelSidebar.tsx`; formatted the touched files and
    reran.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects, 63
    Vitest files with 328 tests, 24/24 Node contract tests, synchronized
    version `0.16.0`, production renderer build, and bundle secret scan. Vite
    retained the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
  - Post-documentation `pnpm format:check`, `git diff --check`, and
    `git check-ignore -v .env.local supabase/functions/.env.local` — passed;
    both local environment files remained ignored and outside the change set.
- **Documentation updated:** Updated the current architecture, active
  desktop-v1 plan, plan 0020 visual contract, and this canonical progress log.
- **Known limitations:** The compact header still needs one installed
  macOS/Windows native-material observation. The local macOS bundle is not
  notarized.
- **Next:** Confirm the refined `β · vX.Y.Z` chip against real native light and
  dark materials during the next installed-app pass.

## 2026-07-23 — Implement rich messaging, media, replies, and stickers

- **Completed:** Implemented plan 0022 across text channels and Personal DMs.
  Added compatible v2 rich-message contracts, same-thread replies with
  notification coercion, author soft deletion, private attachment
  reservations/finalization, server Bakbak stickers, sticker reactions,
  deleted-message-aware activity, and Realtime hydration. Added private
  `message-media` and `message-stickers` buckets plus authenticated
  `message-media-manage` and `sticker-manage` Edge Functions. The shared
  composer now supports staged/pasted/dropped images and GIFs, validated H.264
  MP4, resumable progress/cancellation/retry, quoted replies, standalone
  Bakbak stickers, direct GIPHY GIF/sticker search, and accessible message
  actions. Rendering includes responsive media, static-first/reduced-motion
  behavior, expanded images, lazy videos with offscreen pause, reaction pills,
  deleted-parent placeholders, and offline labels. IndexedDB schema v2 adds a
  256 MiB/account authenticated message/sticker poster LRU while excluding
  videos, animated originals, transient URLs, and GIPHY assets. Existing GIF
  avatar/cover behavior was not changed.
- **Decisions:** Kept `send_message` and `send_direct_message` untouched for
  installed-client rollback and generated compatibility bodies in v2. Kept
  GIPHY entirely client-direct with rating `r`, `messaging_non_clips`,
  20-result pages, attribution/analytics, ID-only persistence, 100-ID history
  batches, session/in-flight deduplication, and a disabled missing-key state.
  Used signed TUS reservations rather than renderer Storage grants, client-side
  MP4Box inspection rather than extending the audio-only FFmpeg core, advisory
  locks for quota/reaction races, and archived referenced stickers while
  hard-deleting only unreferenced sticker assets.
- **Validation:**
  - Initial `pnpm check` — failed only because `src/app/App.tsx` needed
    Prettier after the last upload-progress edit; formatted it and reran.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects, 66
    Vitest files with 337 tests, 24/24 Node contract tests, synchronized
    version `0.16.0`, production renderer build, and bundle secret scan. Vite
    retained the existing non-blocking large-chunk warning; MP4Box is a lazy
    130.33 kB chunk.
  - `pnpm dlx supabase@latest db reset` — passed from a clean local database
    with migration `202607230001_rich_messaging.sql`.
  - `pnpm dlx supabase@latest test db` — passed 13 files and 331 pgTAP
    assertions, including admin/member/outsider RLS, reply isolation,
    attachment object finalization, sticker ownership/archive history,
    reaction uniqueness/user cap, deletion tombstones, activity recalculation,
    and Realtime publication.
  - `deno test --allow-env --config supabase/deno.json
supabase/functions/tests` — passed 37/37 tests, including media request
    authentication/limits/lifecycle and PNG/GIF/WebP sticker inspection.
  - Mock browser smoke at 1280×720 and 1024×680 — passed channel rendering,
    GIPHY missing-key explanation, empty Bakbak sticker management, reply bar
    with default Notify, sent quoted reply, picker/composer bounds, and no
    horizontal overflow or console warnings/errors.
  - `pnpm tauri build` — compiled and ad-hoc signed `Bakbak.app`, then failed
    while running the local DMG wrapper. `pnpm tauri:build:local` passed and
    rebuilt the ARM64 app bundle; notarization was skipped because Apple
    credentials are absent.
  - `pnpm dlx supabase@latest db push --dry-run` — passed and listed only
    `202607230001_rich_messaging.sql`.
  - `pnpm dlx supabase@latest db push` — passed and deployed the additive rich
    messaging migration to the linked hosted project.
  - `pnpm dlx supabase@latest functions deploy message-media-manage --use-api`
    and `sticker-manage --use-api` — passed for hosted project
    `ezdwfqcmrofcemmfzxgl`; unauthenticated probes to both functions returned
    HTTP 401.
  - `pnpm dlx supabase@latest migration list` — passed; local and hosted
    migration history match through `202607230001`.
  - GitHub Actions repository-variable inspection — confirmed
    `VITE_GIPHY_API_KEY` is not configured; no secret value was read or
    invented.
- **Documentation updated:** Added plan 0022; updated architecture, the active
  v1 plan, root/Supabase setup and deployment documentation, release GIPHY
  build configuration, `.env.example`, Data & storage privacy copy, and this
  canonical progress entry.
- **Known limitations:** The GitHub Actions `VITE_GIPHY_API_KEY` repository
  variable is not configured, so the renderer has not been released. Real
  GIPHY attribution/analytics/CSP delivery and 429 behavior still require that
  beta key. The two-account channel/DM Realtime/media/deletion matrix, real
  H.264/AAC playback, reduced-motion/offline cache, existing GIF avatar/cover
  regression, Windows installed test, and full macOS installed test remain
  pending. The local DMG wrapper failure and missing signing/notarization
  credentials remain packaging limitations.
- **Next:** Configure the public `VITE_GIPHY_API_KEY` GitHub Actions repository
  variable, run the plan 0022 hosted two-account and installed macOS/Windows
  acceptance matrix, then release the renderer.

## 2026-07-23 — Repair rich-message loading and false offline state

- **Completed:** Reproduced the reported cached-DM/offline screen against local
  PostgREST and found that both channel and DM rich selects used generated
  self-constraint-name hints that PostgREST rejected with `PGRST200`, despite
  the reply foreign keys existing. Switched both reply embeds to the accepted
  `reply_to_id` column hint. Added connectivity-error classification so
  PostgREST/API contract failures remain actionable alerts instead of placing
  the entire app into read-only offline mode. Thread refreshes now participate
  in the existing workspace reconnect revision, allowing genuine network
  failures to retry after connectivity returns.
- **Decisions:** Kept the deployed database and Edge Functions unchanged; the
  fault was in the renderer's PostgREST select syntax. Retained HTTP 401 for
  unauthenticated function and table probes because protected resources must
  require an authenticated Supabase session.
- **Validation:**
  - Original anonymous local rich-DM and channel REST queries — reproduced
    `PGRST200` because PostgREST could not resolve
    `*_reply_to_id_fkey` as a self-relation hint.
  - Corrected complete anonymous rich-DM REST query — reached the expected
    table authorization boundary with HTTP 401 and no `PGRST200`, confirming
    that PostgREST resolved replies, attachments, and reactions before denying
    the unauthenticated read.
  - Focused Vitest run — passed 3 files and 6 tests covering relationship hints,
    connectivity classification, and existing DM behavior.
  - Initial final `pnpm check` — failed only because
    `src/lib/connectivity.test.ts` needed Prettier after the last assertion;
    formatted it and reran.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 68 Vitest files
    with 341 tests, 24/24 Node contract tests, version synchronization,
    production build, and bundle secret scan.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
- **Documentation updated:** Updated the cached/offline and rich-reply query
  contracts in architecture and appended this canonical progress entry.
- **Known limitations:** The rebuilt app still needs the signed-in account's
  installed-app observation against hosted Supabase. Windows installed
  validation, full plan 0022 two-account acceptance, and the GIPHY repository
  variable remain pending.
- **Next:** Quit the previously running build, open the rebuilt app, verify
  channel and DM refresh/send while signed in, then continue the plan 0022
  rollout matrix.

## 2026-07-23 — Repair signed resumable message uploads

- **Completed:** Reproduced the reported TUS HTTP 403 from its response text
  and traced it to the renderer posting a valid signed upload token to
  Storage's ordinary `/upload/resumable` endpoint. Switched hosted and local
  message uploads to Supabase's signed
  `/storage/v1/upload/resumable/sign` route, using the public project key and
  scoped `x-signature` header. Removed the unnecessary user bearer header from
  the signed object transfer while retaining authenticated reservation,
  cancellation, finalization, and cleanup. Added a concise retry/sign-in
  message for future TUS authorization failures instead of exposing the raw
  transport exception.
- **Decisions:** Preserved the no-insert RLS policy for renderers; widening
  Storage INSERT access would bypass reservation limits and atomic message
  publication. Kept the deployed management function unchanged because it
  already generated correct path-scoped upload tokens.
- **Validation:**
  - Focused Vitest run — passed 2 files and 5 tests for media preparation plus
    signed hosted/local endpoints, public-key/signature headers, and readable
    TUS authorization errors.
  - Initial `pnpm check` — failed at lint because the first TUS response parser
    used an unsafe function cast; replaced it with a strict type guard and
    reran.
  - `pnpm check` — passed formatting, lint, strict TypeScript, 69 Vitest files
    with 344 tests, 24/24 Node contract tests, version synchronization,
    production build, and bundle secret scan.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
- **Documentation updated:** Updated the signed message-media upload boundary
  in architecture and appended this canonical progress entry.
- **Known limitations:** A signed-in installed-app retry against hosted Storage
  is still required. Windows installed validation, full plan 0022 two-account
  acceptance, and the GIPHY repository variable remain pending.
- **Next:** Quit the previous build, open the rebuilt app, retry the image send
  in `#wallpapers`, then exercise cancellation/retry and one DM upload.

## 2026-07-23 — Repair reply attribution, deletion, and GIPHY composing

- **Completed:** Removed the phantom “Former friend” row from ordinary rich
  messages by replacing the recursive PostgREST reply embed with explicit
  scalar `reply_to_id` hydration for both channel and DM history/Realtime
  detail loads. Replaced the renderer's native delete prompt with an accessible
  in-app confirmation dialog that awaits the delete request and displays
  backend failures. Enlarged the GIPHY picker to a 680 px desktop maximum with
  stable 150 px result rows. GIPHY selections now stage in the composer with a
  removable preview, accept an optional text caption, preserve the draft after
  failure, and register send analytics only after publication. Added and
  deployed additive channel/DM v2 RPC wrappers that accept validated GIPHY
  presentations with structured text while preserving standalone Bakbak
  stickers and installed-client compatibility.
- **Decisions:** Hydrated reply parents in a second authorized query because
  PostgREST exposes the recursive reverse relation as an array, where an empty
  array had been mistaken for a reply object. Used the shared Modal component
  instead of `window.confirm` so delete behavior is consistent in Tauri
  WebViews. Kept Bakbak stickers immediate and standalone, but treated GIPHY
  assets like staged attachment content so users explicitly send them with or
  without text.
- **Validation:**
  - Focused ESLint plus Vitest — passed 3 files and 8 tests covering explicit
    reply hydration, rejection of empty reply arrays, staged GIPHY captions and
    analytics, and confirmation-gated deletion.
  - In-app browser mock-mode QA — passed: the delete dialog rendered with Keep
    and Delete actions; the GIPHY picker measured 680×593 px with three 214 px
    columns. Live GIPHY results were intentionally unavailable under the fake
    visual-test key; the mocked interaction test covered selection and caption
    send.
  - `pnpm dlx supabase@latest db reset` — passed with migration
    `202607230002_giphy_captions.sql`.
  - `pnpm dlx supabase@latest test db` — passed 13 pgTAP files and 335
    assertions, including channel and DM GIPHY-caption publication.
  - `pnpm dlx supabase@latest db push --dry-run` — passed and identified only
    `202607230002_giphy_captions.sql`.
  - `pnpm dlx supabase@latest db push` — passed; the additive GIPHY-caption RPC
    migration was applied to the linked hosted project.
  - `pnpm dlx supabase@latest migration list` — passed; local and hosted
    histories match through `202607230002`.
  - Initial `pnpm check` — stopped at one unsafe-assignment lint finding in the
    new GIPHY interaction test; replaced the matcher-derived `any` value with a
    typed captured draft.
  - Final `pnpm check` — passed formatting, lint, strict TypeScript, 70 Vitest
    files with 346 tests, 24/24 Node contract tests, version synchronization,
    production build, and bundle secret scan.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
  - `git diff --check` — passed.
- **Documentation updated:** Updated architecture and plan 0022 for explicit
  reply-parent hydration, staged/captioned GIPHY sends, and the preserved
  standalone Bakbak-sticker boundary; appended this canonical progress entry.
- **Known limitations:** The real `VITE_GIPHY_API_KEY` GitHub Actions variable
  remains unconfigured, so a release build cannot exercise real GIPHY
  attribution/analytics. Hosted two-account confirmation for deletion,
  channel/DM captioned GIF sends, and Windows installed acceptance remain
  pending. The local macOS build is ad-hoc signed and not notarized.
- **Next:** Quit the previously running app, open the rebuilt
  `src-tauri/target/release/bundle/macos/Bakbak.app`, then verify one channel
  and one DM GIPHY-caption send plus confirmed deletion with two signed-in
  accounts.

## 2026-07-23 — Refine the message composer, emoji picker, and delete dialog

- **Completed:** Reorganized the shared channel/DM composer into one
  Discord-shaped bar with attachment at the leading edge, a flexible message
  field, and GIF, Bakbak sticker, emoji, and send actions at the trailing edge.
  Added a searchable five-category Unicode emoji picker that inserts at the
  active text selection, updates mention offsets through the existing
  structured-draft boundary, and restores input focus. Simplified the delete
  confirmation from three repetitions of “Delete message” to one clear
  irreversible-action label, a concise title/description, and distinct Keep
  and Delete actions. Added 18–20 px of body/action inset so dialog buttons no
  longer touch the outer border.
- **Decisions:** Kept only implemented composer tools instead of copying
  Discord's unsupported gift/application buttons. Used platform-rendered
  Unicode emoji without a new dependency or custom artwork. Preserved the
  explicit send button for pointer and assistive-technology users while Enter
  continues to submit from the message field.
- **Validation:**
  - Focused ESLint plus Vitest — passed 2 chat files and 6 tests, including
    cursor-position emoji insertion, picker dismissal, GIPHY staging, and
    confirmation-gated deletion.
  - Mock in-app browser QA at 1280×800 and 1024×680 — passed composer, emoji
    picker, and delete-dialog visual/interaction checks. At the minimum
    viewport, the composer measured 502 px wide, its action strip remained
    inside the bar, the 388×401 px emoji picker remained fully in bounds,
    document width stayed exactly 1024 px, and the console reported no
    warnings or errors.
  - Initial `pnpm check` — failed only because the GIF badge used a forbidden
    10 px product-text size; changed it to the approved 11 px caption token.
  - Final `pnpm check` — passed formatting, lint, both strict TypeScript
    projects, 70 Vitest files with 347 tests, 24/24 Node contract tests,
    synchronized version `0.16.0`, production renderer build, and bundle
    secret scan. Vite retained the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
- **Documentation updated:** Updated the current architecture and plan 0022
  composer contracts, and appended this canonical progress entry.
- **Known limitations:** The picker intentionally starts with a curated common
  Unicode set; recent emoji, skin-tone variants, and the complete Unicode
  catalog are not yet included. Installed macOS/Windows light/dark observation
  remains part of the pending plan 0022 acceptance matrix. The local macOS
  bundle is ad-hoc signed and not notarized.
- **Next:** Exercise the composer, picker, and confirmation once in the rebuilt
  installed macOS app, then continue the plan 0022 two-account channel/DM
  acceptance matrix.

## 2026-07-23 — Align the composer and sidebar footer

- **Completed:** Replaced the composer's asymmetric zero-top/20 px bottom
  padding and the user dock's independent 58 px height with one shared 68 px
  conversation-footer token. The resting 52 px message bar now has an even
  8 px vertical inset, while the sidebar username dock fills the same footer
  band. Added a shell regression that preserves the shared geometry.
- **Decisions:** Aligned the footer surfaces by height and centre line instead
  of fixing the entire composer area to one row; reply, attachment, and GIPHY
  previews can still grow upward without compressing the message input.
- **Validation:**
  - Focused `glass-shell` contract test — passed 4/4 checks, including the new
    shared conversation/identity footer rhythm.
  - Mock in-app browser QA at 1280×800 — passed with both footer bands at
    68 px and centre y=766; the 52 px composer measured y=740–792 with 8 px
    above and below. At 1024×680, both bands shared centre y=646, document
    width stayed exactly 1024 px, and the console reported no warnings or
    errors.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects,
    70 Vitest files with 347 tests, 25/25 Node contract tests, synchronized
    version `0.16.0`, production renderer build, and bundle secret scan. Vite
    retained the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
- **Documentation updated:** Updated the current architecture and plan 0022
  footer-alignment contract, and appended this canonical progress entry.
- **Known limitations:** The rebuilt app still needs direct installed-macOS
  observation against the user's exact long display name and cover artwork.
  Windows installed validation remains part of the pending plan 0022 matrix.
- **Next:** Open the rebuilt `Bakbak.app` and confirm the username dock and
  message bar remain centred on the same footer line with the reported account.

## 2026-07-24 — Repair the Linux Tauri feature allowlist check

- **Completed:** Added `app.macOSPrivateApi: true` to the base Tauri
  configuration so plain cross-platform Cargo builds see the allowlist required
  by the enabled `tauri/macos-private-api` feature. Preserved the macOS override
  and added a native-config regression assertion for the base configuration.
- **Decisions:** Kept the private API enabled because Bakbak's approved macOS
  glass treatment depends on it. Duplicating the allowlist in the base and
  macOS-specific configurations preserves the platform override contract while
  allowing the Ubuntu `cargo check` job to validate the dependency features.
- **Validation:**
  - `node --test scripts/window-chrome-config.test.mjs` — passed 3/3 tests.
  - `cargo check --locked --manifest-path src-tauri/Cargo.toml` — passed.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects,
    70 Vitest files with 347 tests, 25/25 Node contract tests, synchronized
    version `0.16.0`, the production renderer build, and bundle secret scan.
    Vite retained the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
  - `git diff --check` — passed.
- **Documentation updated:** Updated the Tauri shell contract in
  `docs/architecture.md` and appended this canonical progress entry. The active
  plan scope and acceptance state did not change.
- **Known limitations:** The exact Ubuntu runner cannot be executed on the
  local macOS host; the base-config regression covers the configuration path
  missing from that runner, and the hosted PR check still needs to rerun.
- **Next:** Push the fix and rerun PR #33's locked Rust check on Ubuntu.

## 2026-07-24 — Replace retro cues with modern interface audio

- **Completed:** Replaced the nine retro interface WAVs with an original,
  deterministic twelve-cue pack built from soft sine plucks, quiet second
  harmonics, rounded envelopes, and approximately -6 dBFS peaks. Added
  committed message-send and successful microphone mute/unmute events alongside
  the modernized message-receive, voice join/leave, screen-share start/stop,
  reconnect, and failure cues. Updated the Settings description while
  preserving system-output routing and the existing preference schema.
- **Decisions:** Kept soundboard clips, microphone processing, voice effects,
  LiveKit contracts, and native code outside this renderer-only change. Outgoing
  messages play only after channel or DM commit, mute/unmute plays only after
  the publication change succeeds, and remote screen-share entry continues to
  mean another participant starts presenting rather than watching. The pack is
  newly generated Bakbak work and contains no Discord or third-party samples.
- **Validation:**
  - `node --test scripts/generate-interface-sounds.test.mjs` — passed 1/1
    deterministic asset contract for twelve exact names/durations, 48 kHz
    16-bit mono PCM, fades, peak bounds, and the sub-1 MB ceiling; the committed
    pack totals approximately 292 KB.
  - Focused Vitest run for `App`, `interface-sounds`, and `useVoiceRoom` —
    passed 3 files with 44/44 tests, including committed channel/DM sends,
    failed-send silence, successful mute/unmute, failed-mute silence, gains,
    throttling, and remote deafen behavior.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects,
    70 Vitest files with 350 tests, 25/25 Node contract tests, synchronized
    version `0.16.0`, production renderer build, and bundle secret scan. Vite
    retained the existing non-blocking large-chunk warning.
  - `cargo check --locked --manifest-path src-tauri/Cargo.toml` — passed.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
  - `git diff --check` — passed.
- **Documentation updated:** Added plan 0023, marked its implemented Phase 5
  scope in plan 0001, updated the current architecture and sound ownership
  contract, and appended this canonical progress entry.
- **Known limitations:** Automated checks validate lifecycle timing, binary
  format, amplitude, determinism, and packaging but cannot judge the perceived
  tone. Installed macOS and Windows two-client auditory QA remains required for
  rapid messages, roster churn, mute/unmute, local/remote sharing, reconnect,
  deafen, headphones, and separate system/call outputs.
- **Next:** Audition all four Settings previews plus message send/receive and
  mute/unmute in the rebuilt macOS app, tune only the generator if needed, then
  run the same two-client matrix on Windows.

## 2026-07-24 — Refresh the server identity header

- **Completed:** Reworked the 232×80 px top-left server identity surface around
  the existing Bakbak mark, wordmark, and package-backed beta chip. Added a
  compact static frame of the code-native mark and replaced the previous
  noise/orbit treatment with a theme-responsive graphite-or-paper atmosphere,
  sparse constellation, and diagonal signal weave. Removed the now-unused
  `brand-noise.svg` raster dependency.
- **Decisions:** Used the supplied T3 Code reference for compact composition and
  atmosphere without copying its purple palette or importing new artwork.
  Kept the texture code-native and contained to the brand header, preserved
  neutral ordinary chrome, kept the existing version chip, and disabled the
  mark's animation in this always-visible surface.
- **Validation:**
  - Focused Prettier, ESLint, ChannelSidebar/BakbakMotionMark Vitest, branding
    contract, and `git diff --check` — passed after correcting an initially
    over-nested test selector; 12/12 focused component tests and 4/4 branding
    contract tests passed.
  - Mock in-app browser QA at 1280×800 and 1024×680 — passed in dark and light
    schemes. The header remained exactly 232×80 px, the 36 px mark, wordmark,
    and 78.4 px release chip stayed in bounds, horizontal overflow remained
    zero, and the console reported no warnings or errors.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects, 70
    Vitest files with 350 tests, 25/25 Node contract tests, synchronized version
    `0.16.0`, production build, and bundle secret scan. Vite retained the
    existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
- **Documentation updated:** Updated the current branding architecture and plan
  0020 visual/acceptance contract, and appended this canonical progress entry.
- **Known limitations:** The rebuilt native app still needs direct observation
  with the macOS overlay traffic lights and native window material. Windows
  installed light/dark observation remains part of the open cross-platform
  appearance matrix.
- **Next:** Open the rebuilt `Bakbak.app`, inspect the header once in native
  macOS light and dark modes, then tune only the contained atmosphere if the
  native material changes its perceived contrast.

## 2026-07-24 — Replace the chomp logo with a linked-bb identity

- **Completed:** Removed the logo from the top-left server brand strip so it
  now contains only the Bakbak wordmark, package-backed beta/version chip, and
  atmospheric texture. Replaced the open-ring/three-particle identity with a
  custom static pair of linked lowercase `b` strokes. Promoted
  `public/bakbak.svg` to the canonical browser/native source, switched the
  favicon, replaced `BakbakMotionMark` with the static `BakbakMark`, removed the
  old Orbit raster, and regenerated the complete tracked macOS, Windows, iOS,
  and Android icon bundle.
- **Decisions:** Chose a direct `bb` monogram because it names Bakbak at 16–32
  px without a mascot, face, mouth, dot sequence, generic speech bubble, or
  ornamental animation. Kept a flat graphite rounded-square ground with warm
  ivory strokes for native consistency. Preserved the separately approved
  server-header atmosphere while making that always-visible strip explicitly
  logo-free.
- **Validation:**
  - Full-resolution and 32 px generated-icon inspection — passed for a clean
    linked-`bb` silhouette, transparent rounded corners, safe margins, and
    small-size legibility.
  - Focused ESLint, App/ChannelSidebar/BakbakMark Vitest, and identity contract
    checks — passed 21/21 component tests and 4/4 Node contract tests. The
    contract verifies the canonical SVG favicon, exactly two SVG paths, absent
    circles/filters/gradients, absent server-header mark, and contained
    atmospheric colors.
  - Mock in-app browser QA at 1280×800 — passed in light and dark. The auth mark
    rendered at 42×42 px, Personal at 76×76 px, both used exactly two strokes
    and zero circles, and the server header remained 232×80 px with zero
    embedded SVG/mark nodes and zero horizontal overflow. The console reported
    no warnings or errors.
  - First `pnpm check` — stopped at formatting for the expanded identity test.
    After formatting, the second run stopped at one missing `access` import in
    that test; restored the import.
  - Final `pnpm check` — passed formatting, lint, both strict TypeScript
    projects, 70 Vitest files with 350 tests, 25/25 Node contract tests,
    synchronized version `0.16.0`, production build, and bundle secret scan.
    Vite retained the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app` with the regenerated icon bundle; notarization was skipped
    because Apple credentials are absent.
- **Documentation updated:** Updated the current identity architecture, active
  v1 contract, plan 0020 visual/acceptance contract, and this canonical progress
  log.
- **Known limitations:** The new native icon still needs direct human
  observation in the macOS Dock/app switcher and Windows taskbar/installer. The
  local macOS bundle is ad-hoc signed and not notarized.
- **Next:** Open the rebuilt `Bakbak.app`, judge the linked-`bb` icon once in
  the macOS Dock and app switcher, then repeat the taskbar/installer observation
  on the next Windows build.

## 2026-07-24 — Add the collapsible channel tree

- **Completed:** Replaced static channel-category headings with accessible
  disclosure controls and an Apple-style connector tree while retaining the
  existing hash/speaker room icons, mixed ordering, selection, unread state,
  voice preparation, timers, occupant/profile rows, LIVE labels, and admin
  controls. Added collapsed selected/unread/voice-occupancy summaries, the same
  behavior for uncategorized Conversations and Voice rooms shelves, and
  per-server device-local persistence with safe fallbacks.
- **Decisions:** Kept collapse state renderer-only under
  `bakbak.channelCategories.v1:<server ID>` with every new group expanded by
  default. Collapsed groups remain closed during selection and activity, using
  their header to summarize hidden state instead of surprising the user by
  reopening. Retained disclosure/list semantics rather than claiming the full
  ARIA tree keyboard model. Used plan number 0024 because plan 0023 already
  owns the modern interface-audio work.
- **Validation:**
  - Focused ChannelSidebar and preference Vitest run — passed 2 files with
    19/19 tests covering pointer/keyboard disclosure, hidden-child inertness,
    ordering, persistence, new/stale groups, server isolation, summaries,
    synthetic shelves, and existing channel/voice behavior.
  - `node --test scripts/channel-tree-layout.test.mjs` — passed 1/1 connector,
    terminal-branch, and reduced-motion CSS contract.
  - Mock in-app browser QA at 1280×800 and 1024×680 — passed expanded and
    collapsed interaction in light and dark. The 232 px sidebar retained
    contained scrolling, branch geometry measured 1 px with an 8 px terminal
    radius, document width matched the viewport at both sizes, and the console
    reported no warnings or errors.
  - Initial `pnpm check` — stopped at formatting for the new channel-tree
    contract test; formatted that file.
  - Final `pnpm check` — passed formatting, lint, both strict TypeScript
    projects, 71 Vitest files with 358 tests, 26/26 Node contract tests,
    synchronized version `0.16.0`, production build, and bundle secret scan.
    Vite retained the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
- **Documentation updated:** Added plan 0024, updated the current architecture
  and active v1 contract, and appended this canonical progress entry.
- **Known limitations:** The rebuilt tree still needs direct observation with
  installed macOS native material and on the next Windows build. The local
  macOS bundle is ad-hoc signed and not notarized.
- **Next:** Open the rebuilt `Bakbak.app`, inspect expanded/collapsed categories
  once with native macOS material, then repeat the sidebar observation on the
  next Windows build.

## 2026-07-24 — Connect empty and populated conversations

- **Completed:** Reframed the shared channel/DM introduction as a conversation
  root with Quiet room or Conversation flowing state. Replaced the oversized
  dashed empty placeholder with an accessible, target-aware first-branch node.
  Added a theme-responsive populated-message rail aligned to the root icon and
  avatar centers, short body branches, grouped-message dots, and a terminal
  marker while preserving the complete existing chat interaction surface.
- **Decisions:** Reused the current message order and grouping rather than
  introducing a specialized tree role or new navigation model. Kept the
  treatment renderer-only and descriptive: quiet/flowing state comes solely
  from the currently rendered message list and does not affect subscriptions,
  read state, pagination, drafts, or persistence. Added no suggested-post
  actions so the empty state cannot send anything on the user's behalf.
- **Validation:**
  - Focused ChatView Vitest, conversation-trail Node contract, and strict
    TypeScript run — passed 7/7 component tests, 2/2 geometry/reduced-motion
    contracts, and both TypeScript projects.
  - Mock in-app browser QA at 1280×800 and 1024×680 — passed empty and populated
    layouts in dark and light schemes. Root, spark, and avatar centers stayed
    within 0.5 px, the empty card compressed from 620 px to 385 px at minimum
    size, messages wrapped cleanly, and conversation/document horizontal
    overflow remained zero.
  - Initial `pnpm check` — stopped at the typography contract because the new
    eyebrow used unsupported weight 800; changed it to the approved 700.
  - Final `pnpm check` — passed formatting, lint, both strict TypeScript
    projects, 71 Vitest files with 360 tests, 28/28 Node contract tests,
    synchronized version `0.16.0`, production build, and bundle secret scan.
    Vite retained the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
  - Post-documentation `pnpm format:check` and `git diff --check` — passed;
    the ignored `.env.local` remained outside the change set.
- **Documentation updated:** Added plan 0025, updated the current architecture
  and active v1 contract, and appended this canonical progress entry.
- **Known limitations:** The rebuilt treatment still needs direct observation
  with installed macOS native material and on the next Windows build. The local
  macOS bundle is ad-hoc signed and not notarized.
- **Next:** Open the rebuilt `Bakbak.app`, inspect empty and populated text
  rooms once in native macOS light and dark modes, then repeat the observation
  on the next Windows build.

## 2026-07-24 — Unify the interface around the system accent

- **Completed:** Added `get_system_accent` and the
  `system-accent-changed` native bridge. macOS now converts
  `NSColor.controlAccentColor` to sRGB and retains a system-color notification
  observer; Windows reads `UISettings` Accent and retains its color-change
  subscription. Added the pre-render renderer service with strict payload
  validation, a 250 ms neutral fallback, live event/focus refresh, light/dark
  recomputation, contrast normalization, black/white on-accent choice, and the
  complete CSS token family. Replaced fixed green branding and blue selection
  with that accent across glass atmosphere, channels, Personal conversations,
  unread state, conversation trails, focus/hover, resizers, composer, and
  ordinary active call controls. Added a read-only Appearance swatch and
  bounded development-only red/blue/Graphite preview injection.
- **Decisions:** Followed the OS-owned accent rather than reading wallpaper
  pixels; Windows Automatic may derive that OS color from wallpaper, while
  macOS follows its Appearance setting. Kept online/connected/in-voice green,
  destructive/error/leave red, and warning/reconnecting/idle amber independent
  because those colors carry meaning. Normalized the accent against the
  resolved canvas instead of assuming every OS choice is readable. Increased
  dark canvas/panel/strong neutral bases to 64/72/84% and light bases to
  60/72/84%, then mixed only 6/5/3% accent into them so native wallpaper remains
  visible without becoming a competing theme.
- **Validation:**
  - Focused renderer validation — passed lint, strict TypeScript, 4 Vitest files
    with 44/44 tests, and 12/12 system-accent/appearance/glass Node contracts.
    Coverage includes malformed payloads, fallback, red/blue/yellow/black/white/
    Graphite contrast in both schemes, on-accent choice, listener-before-query
    ordering, live updates, focus refresh, query-only degradation, scheme
    recomputation, cleanup, read-only source reporting, and mute/deafen styling.
  - `cargo test --locked system_accent --manifest-path src-tauri/Cargo.toml` —
    passed 2/2 focused macOS-native/fallback tests; 13 unrelated native tests
    were filtered out.
  - Mock in-app browser matrix at 1280×800 and 1024×680 — passed red, blue, and
    Graphite injections in dark and light schemes. Server panels, member rail,
    selected channel, populated trail, composer, Settings, Personal lounge,
    selected DM, empty first branch, and populated DM remained coherent.
    Document, left/right panel, introduction, and composer overflow all measured
    zero; the console reported no warnings or errors.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects, 72
    Vitest files with 372 tests, 32/32 Node contract tests, synchronized version
    `0.16.0`, production build, and bundle secret scan. Vite retained the
    existing non-blocking large-chunk warning.
  - `cargo check --locked` — passed on the current Apple Silicon macOS target.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
- **Documentation updated:** Added plan 0026, updated the current appearance,
  renderer/native bridge, persistence, validation, and repository-structure
  architecture contracts, updated the active v1 scope/checklist, and appended
  this canonical progress entry.
- **Known limitations:** The Windows source and feature contract are present,
  but this macOS run did not compile or observe a Windows binary. Live accent
  switching still needs direct observation in the rebuilt installed macOS app
  and on Windows, including Windows Automatic wallpaper-derived color.
  Connected mute/deafen and reduced-motion visual observation remain pending;
  both have automated styling coverage.
- **Next:** Open the rebuilt `Bakbak.app`, change macOS Accent Color while it is
  running, and verify the live event plus focus fallback; then repeat the
  connected-control and Automatic-accent matrix on the next Windows build.

## 2026-07-24 — Add system rooms, safe previews, and deafen cues

- **Completed:** Added the topmost expanded System category with stable
  automation-only `releases` and `general` channels, typed system messages,
  membership welcome insertion, current-membership history, historical-read
  baselining, and idempotent release publication. Added the protected
  `system-events` and authenticated `link-preview` Edge Functions, gated
  release announcement/history workflows, URL tokenization for channel and DM
  text, external opening, text-only page cards, click-to-load privacy-enhanced
  YouTube embeds, and preview delivery through existing Realtime updates.
  Added deterministic 170 ms deafen/undeafen cues under the Voice preference
  and routed them to system output only after successful current operations.
  Aligned the category chevron, connector spine, and row elbows to one shared
  CSS axis.
- **Decisions:** Kept `ChannelKind` about transport and introduced a separate
  purpose discriminator so older text/voice behavior remains intact. Enforced
  System immutability in tables, policies, and RPCs instead of relying on a
  disabled composer. Kept release bodies readable for older clients and
  service-role insertion behind a dedicated constant-time secret. Preview
  functions re-read stored messages, resolve only public HTTPS targets, bound
  redirects/time/size, store text metadata only, and never delay message
  sending. Imported history is visible but marked read; future events retain
  the normal unread and incoming-message behavior.
- **Validation:**
  - Focused renderer, audio, and layout suites — passed, including system-card
    rendering, absent composer/actions, fallback bodies, link punctuation and
    unsafe schemes, preview retries, Realtime update replacement, incoming
    system sound, deterministic WAV properties, successful/stale/failed
    deafen transitions, and the shared tree axis.
  - `pnpm dlx supabase@latest db reset` and the complete database test suite —
    passed all 14 files and 365 assertions, including member/admin write
    denial, outsider isolation, trigger/read-state behavior, historical
    timestamps, and release idempotency.
  - Supabase Edge Function tests — passed all 44 tests across the existing and
    new suites, including event-secret/repository validation and preview
    authorization, DNS/IP rejection, redirects, timeouts, size limits, and
    sanitization.
  - `pnpm dlx supabase@latest db lint --local` — passed with no schema errors.
  - Initial `pnpm check` — stopped at lint because an unknown thrown preview
    error was interpolated directly; normalized it to a safe error string.
  - Final `pnpm check` — passed formatting, lint, both strict TypeScript
    projects, 73 Vitest files with 378 tests, 34/34 Node contract tests,
    synchronized version `0.16.0`, production build, and bundle secret scan.
    Vite retained the existing non-blocking large-chunk warning.
  - `cargo check --locked --manifest-path src-tauri/Cargo.toml` — passed on the
    current Apple Silicon macOS target.
  - Mock in-app browser QA at 1280×800 and 1024×680 — passed the expanded and
    collapsed System category in dark and light schemes. The System view had
    no composer, message actions, or rename controls; the automation footer
    remained visible; chevron and spine centers differed by 0 px; and
    horizontal overflow remained zero.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
  - Post-documentation `pnpm format:check` and `git diff --check` — passed;
    the ignored `.env.local` remained outside the change set.
- **Documentation updated:** Added plan 0027; updated the architecture, active
  v1 scope, root setup/release documentation, Supabase deployment notes, and
  this canonical progress entry.
- **Known limitations:** Hosted migration and Edge Function deployment, secret
  configuration, the one-time stable release history sync, and enabling
  `SYSTEM_CHANNELS_ENABLED` remain deliberate rollout steps. Live
  multi-client unread/audio behavior and real network YouTube/page-preview
  rendering still need friend-test observation. The local macOS bundle is
  ad-hoc signed and not notarized, and this macOS run did not build Windows.
- **Next:** Rotate any credential exposed during local setup, deploy the
  migration and both Edge Functions, configure the system-event secret in
  Supabase and GitHub, run the manual stable-release history workflow, verify
  its imported rows/read baseline, then enable automatic announcements.

## 2026-07-24 — Deploy System rooms and calm channel selection

- **Completed:** Removed `SYSTEM_CHANNELS_ENABLED` from both release workflows
  so stable announcements and manual history sync are standard behavior.
  Removed the active channel's inset accent stripe while retaining its neutral
  selected surface and accent-colored room icon. Applied hosted migration
  `202607240001`, deployed `link-preview` and `system-events`, synchronized a
  newly generated high-entropy System secret between Supabase and GitHub
  Actions, and imported 15 published stable releases oldest-first in
  historical mode.
- **Decisions:** Kept the one-time history import manually invoked because it
  is an operator action, while future verified stable releases announce
  automatically. Kept the function's narrow shared-secret boundary and rotated
  one generated value into both managed secret stores without persisting or
  printing it. Removed only the selected-room inset stripe; the neutral
  background and icon emphasis still identify the current room without drawing
  a bright bracket through the connector tree.
- **Validation:**
  - `pnpm dlx supabase@latest db push --dry-run` — passed and listed only
    `202607240001_system_channels_and_link_previews.sql`.
  - `pnpm dlx supabase@latest db push` — passed and applied migration
    `202607240001` to the linked hosted project.
  - `pnpm dlx supabase@latest migration list --linked` — passed with every
    local migration, including `202607240001`, matched remotely.
  - Function deployment/list checks — passed; hosted `link-preview` version 3
    is ACTIVE with JWT verification enabled, while hosted `system-events`
    version 3 is ACTIVE with its intended platform JWT gate disabled.
  - Managed-secret checks — passed; `BAKBAK_SYSTEM_EVENTS_SECRET` is present in
    both Supabase Function Secrets and GitHub Actions without reading its
    value.
  - First direct history-sync attempt — inserted zero rows because this GitHub
    CLI rejects `--slurp` together with `--jq`; moved page aggregation to
    standard `jq --raw-output --slurp`.
  - Corrected direct history sync — passed and posted 15 stable releases
    oldest-first through the protected function.
  - Unauthenticated hosted probes — both `system-events` and `link-preview`
    returned HTTP 401.
  - `pnpm dlx supabase@latest db lint --linked` — passed with no hosted schema
    errors.
  - Initial focused workflow/layout run — 9/10 passed; the new neutral-selection
    assertion inspected only styles after the later channel-tree marker.
    Pointing that assertion at the complete stylesheet corrected the test, not
    the implementation.
  - Final focused workflow/layout run — passed 10/10 tests, including absence
    of either workflow gate, portable paginated history aggregation, and the
    neutral active-row contract.
  - Mock in-app browser QA at 1280×800 — passed. The selected `spawn` row
    computed `box-shadow: none`, zero left-border width, and zero document
    overflow; direct visual inspection confirmed the accent stripe is gone.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects,
    73 Vitest files with 378 tests, 34/34 Node contract tests, synchronized
    version `0.16.0`, production build, and bundle secret scan. Vite retained
    the existing non-blocking large-chunk warning.
  - Post-documentation `pnpm format:check`, `git diff --check`, and release-gate
    search — passed; no active `SYSTEM_CHANNELS_ENABLED` reference remains and
    the ignored `.env.local` stayed outside the change set.
- **Documentation updated:** Updated root/Supabase setup, architecture,
  plan 0027 status, active v1 deployment criteria, and this canonical progress
  entry.
- **Known limitations:** The gate-free GitHub workflow changes take effect only
  after this working tree is committed and merged. Installed two-client
  welcome/release unread and sound observation plus the remaining native
  multi-zoom/light-dark matrix are still pending.
- **Next:** Merge the workflow and renderer changes, then observe the next real
  stable release arriving automatically in `#releases` and verify its unread
  marker plus incoming-message cue on a second installed client.

## 2026-07-24 — Repair live System category catch-up

- **Completed:** Verified that the hosted server already contained the stable
  topmost `System` category plus its `releases` and `general` channels.
  Identified the missing live category subscription as the reason an app kept
  open during migration could receive the channels without learning their
  category. Added category INSERT/UPDATE Realtime reconciliation with an
  ordered subscribe-before-snapshot catch-up and buffered race protection.
  Added and deployed
  `202607240002_channel_category_realtime.sql` so hosted category rows are
  published through Supabase Realtime.
- **Decisions:** Repaired the live data path instead of requiring cache
  deletion, sign-out, or a permanent restart workaround. Mirrored the existing
  channel subscription contract so category and channel collections both
  reconcile by stable ID and deterministic position. Retained category RLS and
  trusted-migration-only writes.
- **Validation:**
  - Hosted category/channel query — passed and returned `System` at position
    zero with the `system-releases`/`releases` and
    `system-general`/`general` text rows on the expected server.
  - Focused channel/workspace renderer suites — passed 23/23 tests, including
    ordered category catch-up, Realtime subscription/cleanup, and System before
    Welcome reconciliation.
  - `pnpm typecheck` — passed both strict TypeScript projects.
  - Initial focused Prettier invocation — failed because Prettier has no SQL
    parser and the edited TypeScript test needed formatting; formatted the
    supported TypeScript files and used the repository-wide formatter contract
    for the final check.
  - `pnpm dlx supabase@latest db reset` — passed through migration
    `202607240002`.
  - `pnpm dlx supabase@latest test db` — passed all 14 files and 366 assertions,
    including the new category-publication contract.
  - `pnpm dlx supabase@latest db push --dry-run` and
    `pnpm dlx supabase@latest db push` — passed and applied only follow-up
    migration `202607240002` to the linked hosted project.
  - `pnpm dlx supabase@latest migration list --linked` — passed with local and
    hosted history matched through `202607240002`.
  - Hosted publication query — passed with
    `channel_categories_realtime = true`.
  - `pnpm dlx supabase@latest db lint --linked` — passed with no hosted schema
    errors. An earlier parallel CLI attempt lacked a transient legacy auth
    context; the sequential linked rerun passed.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects,
    73 Vitest files with 379 tests, 34/34 Node contract tests, synchronized
    version `0.16.0`, production build, and bundle secret scan. Vite retained
    the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
- **Documentation updated:** Updated architecture and Supabase deployment
  notes for category Realtime/catch-up, then appended this canonical entry.
- **Known limitations:** A currently running copy with the older renderer must
  be relaunched once to load this repair. The local macOS bundle remains ad-hoc
  signed and not notarized. Installed two-client System unread/audio and the
  complete multi-zoom/light-dark matrix remain pending.
- **Next:** Relaunch the rebuilt app and confirm `System` appears above
  `Welcome` without clearing local data; then observe the next real join or
  stable release on a second client.

## 2026-07-24 — Prepare Bakbak 1.0 interaction and loading polish

- **Completed:** Added plan 0028's shared successful-loading scene with six
  staggered uppercase `BAKBAK` letters, an adaptive moving gradient, and an
  immediate reduced-motion result while retaining the existing workspace-error
  recovery. Replaced channel/DM smooth scrolling with synchronous initial
  placement, 96 px bottom detection, exact history-prepend anchoring, a
  pending history control, and a pluralized New message pill. Added a shared
  viewport-clamped user menu to member/voice rails, message authors and
  mentions, voice participant cards, Personal identities/details, and the
  shared user dock. The menu supports profile, DM, user-ID copy, keyboard
  navigation, focus restoration, offline/self rules, and participant-local
  mute with last-volume restoration across speech, soundboard, and share
  audio. Added remote hover/focus Watch Stream actions, channel-aware member
  activity, cross-room join/switch requests, authoritative requested-owner
  share discovery, automatic focus, and a ten-second stale-stream notice.
  Created GitHub label `release:major` with description “Publish the next major
  SemVer release” and applied it to open PR #33; its only label is
  `release:major`.
- **Decisions:** Kept package/Tauri versions at `0.16.0` because the release
  workflow owns version injection and post-publication synchronization. Kept
  the Watch action as explicit user intent and reused
  `watchedScreenShareId`, so one remote share remains the only subscribed
  video/source-audio pair. Treated plan 0028 as a narrow supersession of plan
  0015's informational-only/cross-room restriction while retaining all native
  isolation, source-audio, presenter-companion, explicit-subscription, and
  cleanup rules. Kept moderation and database/native-capture changes outside
  this pass.
- **Validation:**
  - Live GitHub release/PR inspection — passed; newest published tag remained
    `v0.16.0`, PR #33 remained open against `main`, and the final label set was
    exactly `release:major` with no `release:skip`.
  - `node scripts/release-version.mjs --current v0.16.0 --fallback 0.16.0
--labels release:major` — passed with `version=1.0.0`, `tag=v1.0.0`,
    `skip=false`, and `bump=major`.
  - Focused renderer run — passed 8 files and 100 tests covering loading,
    anchored channel/DM scrolling, context-menu input/actions, member/voice
    Watch actions, delayed/timeout stream discovery, and participant mute
    restoration.
  - Focused Node run — passed 12 tests covering the exact major resolver and
    adaptive/reduced-motion loading contracts.
  - Initial `pnpm lint` — failed on two timer callbacks in the new timeout test
    returning values to React `act`; converted them to explicit void callbacks.
    Final `pnpm lint` passed with zero warnings.
  - Initial full `pnpm test` — failed one new menu assertion because the tested
    action now executes in a guarded promise; awaited the user action. Final
    `pnpm test` passed 75 Vitest files with 393 tests and 37/37 Node contract
    tests.
  - `pnpm format:check` — passed.
  - `pnpm typecheck` — passed both strict TypeScript projects.
  - `pnpm build` — passed; Vite retained the existing non-blocking
    large-chunk warning.
  - `pnpm security:scan` — passed for the renderer and existing desktop bundle.
  - `pnpm version:check` — passed with synchronized tracked version `0.16.0`.
  - `cargo check --locked` — passed in `src-tauri`.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; follow-up `codesign --verify --deep --strict` passed.
- **Documentation updated:** Added plan 0028, updated architecture and the
  active v1 plan with the new loading/scroll/user-action/watch contracts and
  narrow plan 0015 supersession, then appended this canonical entry.
- **Known limitations:** Direct installed observation of the loading scene in
  light, dark, and reduced-motion modes was not performed. The required
  three-client macOS/Windows matrix for same/cross-room watching, delayed and
  stale presence, source audio, replacement, target stop, and cleanup remains
  pending. The local macOS bundle is ad-hoc signed and not notarized; the full
  production updater-signed `pnpm tauri build` was skipped because release
  credentials belong to CI. PR #33 was not merged and no release workflow was
  dispatched.
- **Next:** Perform plan 0028's installed loading and three-client watch
  matrix. Immediately before any separately approved merge of PR #33, recheck
  the newest published tag and stop if `v1.0.0` already exists.

## 2026-07-25 — Repair the Windows release configuration

- **Completed:** Reproduced the Windows release's Tauri schema failure by
  explicitly merging `tauri.windows.conf.json`, removed the unsupported
  `noRedirectionBitmap` window property, and changed the existing titlebar
  contract test to guard against reintroducing that property while the pinned
  released Tauri schema rejects it. The transparent renderer-owned Windows
  window, native shadow, Windows 11 Mica application, and opaque pre-render
  fallback remain unchanged.
- **Decisions:** Kept the released Tauri CLI at `2.11.4`, which is the newest
  version resolved by the lockfile and does not accept the recently documented
  upstream option. Preferred removing one optional startup-flash hint over
  depending on unreleased Tauri source or widening the release change.
- **Validation:**
  - Initial `pnpm tauri build --no-bundle --config
src-tauri/tauri.windows.conf.json` — failed before the fix with the same
    `app > windows > 0` additional-property error for
    `noRedirectionBitmap` reported by Windows CI.
  - `node --test scripts/window-chrome-config.test.mjs` — passed 3/3 focused
    native-window configuration tests.
  - Final `pnpm tauri build --no-bundle --config
src-tauri/tauri.windows.conf.json` — passed the merged Windows
    configuration schema, production renderer build, and release-mode native
    compile on macOS.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects,
    75 Vitest files with 393 tests, 37/37 Node contract tests, version
    synchronization, production renderer build, and bundle secret scanning;
    Vite retained the existing non-blocking large-chunk warning.
  - `cargo check --locked --manifest-path src-tauri/Cargo.toml` — passed.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
  - Follow-up `codesign --verify --deep --strict` — passed for the rebuilt
    application.
  - Initial post-documentation `pnpm format:check` — failed because the new
    progress entry required Prettier wrapping; `pnpm exec prettier --write
docs/progress.md` corrected it. Final `pnpm format:check` and
    `git diff --check` passed.
- **Documentation updated:** Updated the Tauri shell contract in
  `docs/architecture.md` and appended this canonical progress entry. The active
  plan was unchanged because this restores the already-approved Windows x64
  release path without changing scope or acceptance criteria.
- **Known limitations:** This macOS host cannot produce or install the Windows
  NSIS bundle, so the GitHub Windows runner must confirm the final installer.
  The production updater-signed `pnpm tauri build` remains CI-only because its
  signing credentials are not available locally. Omitting
  `noRedirectionBitmap` may allow a brief pre-webview flash on some Windows
  systems, mitigated by Bakbak's existing opaque pre-render fallback.
- **Next:** Rerun the failed release workflow and confirm the Windows job
  produces its x64 NSIS installer and signed updater artifacts.

## 2026-07-25 — Harden release version synchronization

- **Completed:** Inspected Desktop release run `30120007215` and confirmed that
  validation, both native builds, publication, and the System announcement
  succeeded for v1.0.0; only the post-publication `sync-version` job failed.
  Replaced its unguarded GraphQL `gh pr create`/`gh pr merge` sequence with a
  tested Node boundary over GitHub's REST API. The boundary discovers an
  existing branch-specific PR before creation, recovers after uncertain
  responses, retries creation/merge/deletion three times, verifies the exact
  expected head SHA before merging, sets `[skip ci]` explicitly on the merge
  commit, and deletes the automation branch only after a confirmed merge.
- **Decisions:** Treated GitHub's generic GraphQL error as a transient service
  failure rather than a repository permission problem: the job had
  `contents: write` and `pull-requests: write`, repository Actions settings
  permit write-created PRs, the version commit pushed successfully, and no PR
  existed afterward. Kept retries bounded at three with 5- and 10-second
  backoff, and preserved the branch after exhaustion so recovery remains
  inspectable and cannot silently merge a changed head.
- **Validation:**
  - Authenticated `gh run view 30120007215 --json ... --log-failed` — confirmed
    every release job except `sync-version` passed, v1.0.0 published, and PR
    creation alone returned GitHub's internal GraphQL error.
  - GitHub repository/branch inspection — confirmed Actions write permissions,
    protected `main` at `549b368`, no PR for the failed attempt, and orphaned
    branch `automation/release-v1.0.0-30120007215-1` exactly one commit ahead
    with only the four expected version metadata files changed.
  - Initial focused Node run — passed 14/14 release workflow and sync boundary
    tests. The first `pnpm format:check` then failed on the two new files;
    `pnpm exec prettier --write` corrected them, and the final focused run
    passed 14/14 again.
  - Live recovery boundary — safely exhausted three REST attempts five times
    because GitHub returned an empty HTTP 500, found no half-created PR after
    any uncertain response, and left the verified version branch intact.
    Direct authenticated GraphQL creation returned the matching internal
    service error, while a GitHub-app fallback lacked repository write
    permission.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects,
    75 Vitest files with 393 tests, 41/41 Node contract tests, version
    synchronization, production renderer build, and bundle secret scanning;
    Vite retained the existing non-blocking large-chunk warning.
  - `cargo check --locked --manifest-path src-tauri/Cargo.toml` — passed.
  - Final focused Node run, `pnpm format:check`, and `git diff --check` —
    passed.
- **Documentation updated:** Updated the release flow in
  `docs/architecture.md` and appended this canonical progress entry. The active
  plan was unchanged because the approved release/version contract and product
  scope are unchanged.
- **Known limitations:** GitHub's PR creation APIs were still returning server
  errors at handoff time. The tested workflow fix is pushed at `27786d7` on
  `OpenBhai/fix-release-version-sync`, but its `release:skip` PR could not yet
  be opened. Published v1.0.0 remains tracked as `0.16.0` on `main`; the exact
  `1.0.0` commit remains recoverable on the preserved automation branch. The
  full Tauri bundle was not rebuilt because this change affects only release
  orchestration, Node tests, and documentation.
- **Next:** Retry the idempotent v1.0.0 recovery after GitHub PR creation
  recovers, then publish this workflow fix in a `release:skip` PR and confirm
  the next release synchronizes its tracked version without leaving an
  automation branch.

## 2026-07-25 — Simpler chat and reliable voice input

- **Completed:** Implemented plan 0029 end to end in the renderer: selected
  text/voice channels now use a persistent soft accent pill with thin outline,
  brighter icon/label, distinct active hover, and `aria-current="page"`;
  conversation rails/branches/Quiet-Flowing badges/empty-branch decoration are
  gone while channel/DM welcome intros and compact empty copy remain; chat-only
  author avatars are circular; Voice Lab effects and their worklet DSP are
  removed; connected microphone and macOS capture-mode changes use one
  serialized `restartTrack` transaction with mute preservation, pending-state
  serialization, success commit, recovered rollback, failed rollback, and
  stale-room rejection; device preferences migrate to
  `bakbak.devicePreferences.v3` with cleanup plus default-off
  `macosKeepOtherAudioFullVolume`; installed macOS alone exposes the full-volume
  switch and mic-test capture constraints. Fixed one Settings test lint failure
  by asserting exact capture options instead of an untyped matcher.
- **Decisions:** Kept speaker-safe echo cancellation as the default and limited
  `echoCancellation: false` to opt-in installed macOS, because RNNoise is not
  acoustic echo cancellation. Removed the redundant
  `setMicrophoneEnabled` switch path so LiveKit restarts the existing named
  speech track and its attached processor. Plan 0029 supersedes plan 0013 Voice
  Lab effects, plan 0025 conversation trail, and plan 0027's neutral-only
  selected-room treatment without backend or LiveKit protocol changes.
- **Validation:**
  - Focused voice/settings/layout suites — passed during implementation,
    including microphone restart success, mute preservation, serialization,
    rollback, failed rollback, stale-room cleanup, v1/v2-to-v3 migration, and
    macOS control visibility.
  - Initial `pnpm check` — failed eslint on
    `SettingsPage.test.tsx` (`no-unsafe-assignment` from
    `expect.objectContaining`).
  - Final `pnpm check` — passed formatting, lint, both strict TypeScript
    projects, 75 Vitest files with 405 tests, 40/40 Node contract tests,
    version synchronization, production renderer build, and bundle secret
    scanning; Vite retained the existing non-blocking large-chunk warning.
  - `cargo check --locked --manifest-path src-tauri/Cargo.toml` — passed.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are
    absent.
  - Follow-up `codesign --verify --deep --strict` — passed for the rebuilt
    application.
  - `git diff --check` — passed.
- **Documentation updated:** Added
  `docs/plans/0029-simpler-chat-and-reliable-voice-input.md`, updated
  `docs/architecture.md` and the active v1 plan scope/checkboxes, and appended
  this canonical progress entry.
- **Known limitations:** Plan 0029's installed/manual acceptance remains open:
  speaker-safe echo, full-volume non-call audio, muted/unmuted device switching,
  two-client intelligibility, Windows absence of the macOS control, and
  light/dark channel/chat inspection at 1280×800 and 1024×680. The production
  updater-signed `pnpm tauri build` remains CI-only because release credentials
  are not available locally.
- **Next:** Run plan 0029's installed macOS and Windows two-client audio matrix
  and the light/dark layout pass, then mark those acceptance items when the
  checks succeed.

## 2026-07-26 — Media and voice reliability

- **Completed:** Implemented plan 0030 across renderer and native capture.
  Remote speech, soundboard, and watched-share tracks now attach through one
  owner/source-aware renderer that writes gain to the real HTML audio element;
  participant cards use a separate focus control and continuous accessible
  slider. Added explicit microphone processing states, RNNoise
  ready/configuration acknowledgement, sender restoration and fallback-error
  handling, plus a deterministic tested 128-to-480-sample bridge. Migrated
  device preferences to v4 with the macOS full-volume mode default on and a
  one-time v3 false-to-true migration. macOS 14.2+ capture now applies
  fail-closed ScreenCaptureKit process-tree filters and refreshes them after
  topology changes. Windows capture validates display loopback exclusion,
  checks cursor inclusion, restores application focus best-effort, classifies
  sustained black/cursor-only frames, and returns one-click Entire screen plus
  Borderless Windowed recovery without game hooks. Added stable structured
  failures and sanitized diagnostics. macOS call media now uses serialized,
  timeout-bounded Tauri simple fullscreen with opaque staging and native-glass
  restoration on every exit path; Windows retains native fullscreen.
- **Decisions:** Kept all changes client/native-local with no Supabase, RLS,
  token, or LiveKit server-contract change. The macOS audio transport remains
  ScreenCaptureKit with proven include/exclude process filters rather than
  adding a separate Core Audio process-tap transport; release acceptance still
  requires the installed two-client isolation test. `Keep other audio at full
volume` disables only macOS echo cancellation and retains browser noise
  suppression, automatic gain control, RNNoise, and the headphone warning.
  Valorant recovery deliberately uses Entire screen plus Borderless Windowed
  rather than injection or anti-cheat-sensitive hooks.
- **Validation:**
  - Focused voice/settings suites during implementation — passed 131/131 tests
    before the final recovery-button regression was added; the final full suite
    below includes that additional test.
  - Initial `pnpm check` — application tests passed 419/419, but one Node visual
    contract rejected the slightly chromatic fullscreen stage color `#08090b`.
    Changing it to neutral `#090909` fixed the contract.
  - Final `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test &&
pnpm version:check && pnpm build && pnpm security:scan` — passed formatting,
    lint, both strict TypeScript projects, 77 Vitest files with 420 tests, 40/40
    Node contracts, synchronized version `1.1.0`, production renderer build,
    and bundle secret scan. Vite retained the existing non-blocking large-chunk
    warning.
  - `cargo test --manifest-path src-tauri/Cargo.toml` — passed 17/17 macOS
    native tests, including process policy, first-frame behavior, failure
    structure, and sanitized diagnostics.
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --check` — passed.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are absent.
  - `codesign --verify --deep --strict
src-tauri/target/release/bundle/macos/Bakbak.app` — passed.
  - `pnpm tauri build` — failed after compiling the release binary and
    rebuilding/signing `Bakbak.app`; Tauri's local `bundle_dmg.sh` failed while
    creating `Bakbak_1.1.0_aarch64.dmg`. The dedicated local app bundle above
    remains successful.
  - `cargo check --target x86_64-pc-windows-msvc` — skipped as a code verdict:
    cross-compilation stopped in `ring` before Bakbak's Windows source because
    this Mac lacks the Windows CRT/MSVC header `assert.h`. Windows CI was not
    triggered because no branch was pushed.
  - Final `pnpm security:scan`, `git diff --check`, Cargo formatting check, and
    strict app signature verification — passed.
- **Documentation updated:** Added
  `docs/plans/0030-media-and-voice-reliability.md`, updated the architecture's
  voice, capture, fullscreen, diagnostic, and v4 preference contracts, updated
  Phase 5 acceptance criteria in the active v1 plan, and appended this canonical
  progress entry.
- **Known limitations:** Installed/macOS and Windows friend tests remain open:
  two-client call-audio exclusion, actual 100/50/0 speech/soundboard/share
  listening, fan/keyboard RNNoise A/B, Valorant Application fallback and Entire
  screen cursor/game pixels in Borderless Windowed, and ten-cycle macOS
  fullscreen plus Escape/Back/loss/disconnect. The Windows native code still
  requires a real Windows CI/build runner, the local production DMG packager
  failed as recorded above, and a dedicated Core Audio process-tap backend was
  not introduced.
- **Next:** Run Windows CI and the installed macOS/Windows Plan 0030 matrix,
  investigate the local DMG packaging failure separately, and close acceptance
  items only from observed audio/video/fullscreen results.

## 2026-07-26 — Restore the Windows Tauri Send boundary

- **Completed:** Fixed the Windows release compile failure introduced by
  best-effort application focus restoration. `PreparedCapture` now stores the
  selected window handle as a pointer-width integer rather than a non-`Send`
  `HWND`; native `HWND` reconstruction is limited to the immediate synchronous
  `SetForegroundWindow` call before the next await. Added a Windows compile-time
  assertion that `PreparedCapture` implements `Send`.
- **Decisions:** Preserved focus restoration without an unsafe `Send`
  implementation. The scalar handle representation carries the same opaque
  platform value across the async boundary while ensuring no raw pointer is
  retained in the Tauri command future.
- **Validation:**
  - Attached Windows release log — confirmed `PreparedCapture` retained
    `*mut c_void` across the `start_publisher(...).await`, making
    `start_screen_share` fail Tauri's required `Future + Send` bound.
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --check` — passed.
  - `cargo test --manifest-path src-tauri/Cargo.toml` — passed 17/17 available
    macOS native tests.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects, 77
    Vitest files with 420 tests, 40/40 Node contracts, version synchronization,
    production renderer build, and bundle secret scan. Vite retained the
    existing non-blocking large-chunk warning.
  - Windows `x86_64-pc-windows-msvc` Cargo cross-check — could not reach Bakbak
    source on this Mac because the Windows MSVC toolchain/CRT is absent
    (`lib.exe` and `assert.h`).
  - GitHub workflow recheck — deferred until the focused branch is published;
    the supplied Actions log was used for diagnosis, and CLI authentication was
    later restored for publication.
- **Documentation updated:** Appended this canonical progress entry.
  Architecture and active plan are unchanged because capture behavior and scope
  did not change.
- **Known limitations:** The new `PreparedCapture: Send` assertion is
  Windows-only and therefore requires the Windows runner to compile it. The
  release workflow remains the authoritative verification for the original
  failure.
- **Next:** Rerun the Windows Tauri release job after publication and confirm it
  advances past Rust compilation into NSIS bundling.

## 2026-07-26 — GIPHY profile avatars and covers

- **Completed:** Added separate target-aware GIF-only GIPHY pickers for Avatar
  and Cover settings while preserving local PNG/JPEG/WebP/GIF uploads. Provider
  selections now stage in the existing preview, replace the other field source,
  keep cover focal controls, survive failed saves, and emit selection analytics
  only after a successful profile commit. Added image-compatible avatar and
  cover renditions, batched static avatar resolution, attention-driven
  animation/cover loading, reduced-motion fallbacks, broken-media initials/no
  cover behavior, signed-in/workspace/DM/Realtime reconciliation with stale
  guards, and v2 cache normalization that retains provider IDs while removing
  every provider URL. Added the nullable bounded `avatar_giphy_id` and
  `cover_giphy_id` columns, mutually exclusive upload/provider constraints,
  owner update grants, and both fields in the participant-authorized
  `get_direct_conversations()` result. Deployed migration
  `202607260001_giphy_profile_media.sql` to the linked hosted project.
- **Decisions:** Kept chat's GIF/sticker defaults, rating `r`, attribution,
  analytics, and rate-limit behavior unchanged by making target and GIF-only
  mode optional picker inputs. Stored GIPHY IDs only; Supabase, Storage, and
  IndexedDB never receive provider files or URLs. Static avatar posters resolve
  in deduplicated batches, while animations and covers resolve only for
  hover/focus, opened profile surfaces, or the editor. Provider resolution
  failure intentionally falls back to initials for avatars and no cover.
  Uploaded private objects are deleted only after the profile row successfully
  switches to GIPHY.
- **Validation:**
  - Initial `pnpm lint` — failed on one test `require-await` error and three
    exhaustive-dependency warnings; the test and effect dependencies were
    corrected. Final lint is included in `pnpm check`.
  - `pnpm test` — passed 80 Vitest files with 431/431 tests and 40/40 Node
    contract tests.
  - `CI=true pnpm dlx supabase@latest db reset` — applied every migration
    through `202607260001` and seeded the clean local database, then exited 1
    because the Storage readiness check timed out; subsequent Docker status
    reported the database, Storage, Auth, Realtime, and API containers healthy.
  - `CI=true pnpm dlx supabase@latest db lint --local --schema public,private
--level warning` — passed with no schema errors.
  - Initial `CI=true pnpm dlx supabase@latest test db` — 383/384 assertions
    passed; the new anonymous-RPC assertion had reset to the test superuser
    instead of the `anon` role. After correcting the test role, one transient
    connection timeout occurred and the final retry passed all 15 files and
    384/384 pgTAP assertions.
  - `CI=true pnpm dlx supabase@latest db push --dry-run` — passed and listed
    only `202607260001_giphy_profile_media.sql`.
  - `CI=true pnpm dlx supabase@latest db push` — passed and deployed the single
    GIPHY profile-media migration.
  - `CI=true pnpm dlx supabase@latest db lint --linked --schema public,private
--level warning` — passed with no hosted schema errors.
  - `CI=true pnpm dlx supabase@latest migration list` — passed and confirmed
    local/remote parity through `202607260001`.
  - `pnpm check` — passed formatting, lint, both strict TypeScript projects,
    80 Vitest files with 431 tests, 40/40 Node contracts, synchronized version
    `1.2.0`, production renderer build, and bundle secret scan. Vite retained
    the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are absent.
  - `pnpm tauri build` — produced `Bakbak.app`, the ARM64 DMG, and the updater
    archive, then exited 1 because this workstation has the public updater key
    but no `TAURI_SIGNING_PRIVATE_KEY`.
  - Mock browser acceptance at 1280×800 and 1024×680 — passed in Light and Dark.
    Both target pickers opened centered with GIPHY attribution, live `hello`
    search returned GIFs, avatar and cover selections staged in the preview,
    cover selection exposed a 50/50 focal point, and no browser console errors
    were recorded.
  - `git diff --check` and the aggregate bundle secret scan — passed.
- **Documentation updated:** Added
  `docs/plans/0031-giphy-profile-avatars-and-covers.md`, updated the current
  profile/storage/data-flow contract in `docs/architecture.md`, marked the
  implementation and hosted migration in the active v1 plan, and appended this
  canonical progress entry.
- **Known limitations:** The installed macOS/Windows Light/Dark and
  reduced-motion matrix, live two-account Realtime check, and offline provider
  fallback check remain open. Reduced motion, missing-key, rate-limit,
  failed-save retry, cache URL removal, and stale-request behavior are covered
  by automated tests but were not all repeated manually. Full updater packaging
  still requires the protected private signing key in release CI.
- **Next:** Run the installed two-account macOS/Windows matrix for Realtime
  avatar/cover changes, hover/focus animations, reduced motion, provider outage
  and offline fallbacks, then close the remaining plan 0031 acceptance items.

## 2026-07-26 — Windows screen-share audio isolation

- **Completed:** Replaced Entire screen's Windows Tauri-host PID exclusion with
  a native WebView2 process-group tracker. Startup now reads
  `GetProcessInfos` from Tauri's native webview, requires one browser root,
  proves every reported helper is its descendant, and refreshes the snapshot
  through `ProcessInfosChanged` without exposing or logging PIDs. Display
  WASAPI now excludes that browser tree; Application sharing still includes
  only the selected process tree and rejects both Tauri-host and WebView2
  descendants. Display audio remains unavailable below Windows build 20348 or
  without current proof. The exact topology is rechecked before and after
  WASAPI activation and watched during sharing. Proof loss stops native audio
  frames before unpublishing only the audio track, keeps video live, and emits
  `audio-isolation-unavailable`. Extended native and renderer lifecycle
  contracts with `audioUnavailableReason`, updated live warning/audio state,
  changed display diagnostics to `exclude-webview2-process-tree`, and added a
  Windows pull-request Cargo check/test job.
- **Decisions:** Isolation remains fail-closed: no failure retries unrestricted
  system loopback. Any WebView2 topology change invalidates the active audio
  snapshot even if its browser PID is unchanged; a later share must establish a
  fresh proof. Application capture received rejection/regression coverage but
  no redesign. No Supabase, RLS, token, or LiveKit server contract changed.
  Tauri is pinned to the already-locked 2.11.5 release so the native
  `with_webview` handle and WebView2 COM dependency remain version-aligned.
- **Validation:**
  - Focused renderer suites — passed 2 files and 47/47 tests, including startup
    and live audio-isolation warnings with video retained.
  - `cargo test --locked --manifest-path src-tauri/Cargo.toml` — passed all
    17/17 native tests available on macOS. Windows policy tests are
    target-gated for the new Windows CI job.
  - Initial `pnpm check` — stopped at lint because a new test used an async
    callback without `await`; the callback was corrected. Final `pnpm check` —
    passed formatting, zero-warning lint, both strict TypeScript projects, 80
    Vitest files with 434/434 tests, 40/40 Node contracts, synchronized version
    `1.2.0`, production renderer build, and secret scan. Vite retained the
    existing non-blocking large-chunk warning.
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --check` — passed.
  - `cargo check --locked --manifest-path src-tauri/Cargo.toml` — passed on the
    macOS host.
  - `cargo check --locked --target x86_64-pc-windows-msvc --manifest-path
src-tauri/Cargo.toml` — could not reach Bakbak's Windows source because this
    Mac lacks the MSVC librarian/CRT (`lib.exe` and `assert.h`); the new
    `windows-latest` CI job is the authoritative compile/test gate.
  - `pnpm tauri:build:local` — passed and rebuilt the ad-hoc-signed ARM64
    `Bakbak.app`; notarization was skipped because Apple credentials are absent.
  - Post-bundle `pnpm security:scan`,
    `codesign --verify --deep --strict
src-tauri/target/release/bundle/macos/Bakbak.app`, and `git diff --check` —
    passed.
- **Documentation updated:** Added plan 0032, updated the screen-share and CI
  contracts in `docs/architecture.md`, updated Phase 5 status and acceptance in
  the active v1 plan, and appended this canonical progress entry.
- **Known limitations:** The Windows-native source and tests cannot compile on
  this macOS host and still require the new Windows PR runner. A Windows x64
  Tauri bundle, bundle secret scan, and the installed three-client Entire
  screen/Application matrix remain open. The full cross-platform `pnpm tauri
build` was not rerun because this host cannot produce the required Windows
  bundle; the applicable local macOS app bundle passed.
- **Next:** Run the Windows PR job and x64 release bundle, then complete plan
  0032's muted-presenter three-client isolation matrix on default/selected
  outputs, stop/restart, source switching, and Application sharing.

## 2026-07-28 — Fix Windows isolation test ownership

- **Completed:** Corrected the Windows-only WebView2 topology-change test so its
  changed process proof is cloned before the first assertion consumes it,
  allowing the later stop-once assertions to reuse the same fixture.
- **Decisions:** Kept the fix limited to test ownership; production capture and
  isolation behavior are unchanged.
- **Validation:**
  - `pnpm format:check` — passed; Prettier confirmed all files match the
    repository style.
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --check` — passed.
  - `cargo check --locked --manifest-path src-tauri/Cargo.toml` — passed on the
    macOS host.
  - `cargo test --locked --manifest-path src-tauri/Cargo.toml` — passed all
    17/17 native tests available on macOS.
- **Documentation updated:** Appended this canonical progress entry.
- **Known limitations:** The corrected test is Windows-target-gated, so this
  macOS host cannot compile or execute it; the Windows pull-request job remains
  the authoritative validation.
- **Next:** Push the correction and rerun the Windows native capture job for PR
  #44.

## 2026-07-30 — Plan friend-test core stabilization

- **Completed:** Added plan 0033 to turn the six-person cross-region incident
  into five gated work packets: LiveKit voice continuity and diagnostics,
  authoritative/stable voice presence, Windows paste and private-image
  reliability, measured 200% listener gain, and one integrated release gate.
  Recorded dependencies, safe parallel-agent ownership, automated criteria,
  installed macOS/Windows criteria, privacy boundaries, and the required agent
  handoff fields. Linked the plan and its two open Phase 5 gates from the active
  v1 plan.
- **Decisions:** Kept the four failure boundaries separate during
  implementation because voice, presence, private media, and loudness have
  different authorities and regression risks. Approved Packets B and C for
  parallel work, required Packet A before Packet D because both edit remote
  playback, and required all packets to ship from one source revision only
  after the six-person integrated matrix passes. Kept IndexedDB classified as
  a possible amplifier of invalid poster data rather than a common root cause.
  No runtime architecture, backend contract, schema, policy, or application
  behavior changed in this documentation-only task.
- **Validation:**
  - `./node_modules/.bin/prettier --check
docs/plans/0033-friend-test-voice-presence-and-media-stabilization.md
docs/plans/0001-bakbak-desktop-v1.md` — passed after formatting the new
    plan; both changed plan files use repository style.
  - `git diff --check` — passed with no whitespace errors before the progress
    entry.
  - `pnpm format:check` — interrupted after 60 seconds with no output because
    the Corepack-backed command did not start; the installed local Prettier
    check above is the focused formatting result.
  - `./node_modules/.bin/prettier --check
docs/plans/0033-friend-test-voice-presence-and-media-stabilization.md
docs/plans/0001-bakbak-desktop-v1.md docs/progress.md` and final
    `git diff --check` — passed on the complete documentation change.
- **Documentation updated:** Added
  `docs/plans/0033-friend-test-voice-presence-and-media-stabilization.md`,
  updated plan 0001's Phase 5 source of truth, and appended this canonical
  progress entry. `docs/architecture.md` was not changed because no runtime
  behavior or contract changed.
- **Known limitations:** This task records the approved execution plan only.
  No implementation, product tests, installed builds, or multi-client
  acceptance items were completed. The canonical pnpm wrapper remains blocked
  before execution in this environment.
- **Next:** Assign Packet A for voice continuity first. Packets B and C may run
  concurrently in isolated branches/worktrees, then Packet D follows the merged
  Packet A audio lifecycle and Packet E validates one integrated source
  revision.

## 2026-07-30 — Stabilize remote voice continuity

- **Completed:** Implemented plan 0033 Packet A. Upgraded `livekit-client` from
  2.20.1 to resolved version 2.21.0, which contains the buffered resume-event
  fix. Remote audio now reconciles the active room's current subscribed
  publications after initial connection, signal resume, full reconnect, and
  output-device changes. One publication reuses one hidden audio element;
  stale/unsubscribed publications detach and late events cannot revive them.
  Subscription failure/status, stream pause/resume, media
  pause/stall/error/end, and autoplay rejection now feed bounded recovery and
  an actionable continuity warning. Added a bounded in-memory diagnostic
  recorder and explicit Copy controls in the call warning and Settings. The
  snapshot preserves safe connection, publication, renderer, and inbound audio
  health data across cleanup without automatic transmission.
- **Decisions:** Limited subscription and playback recovery to two attempts so
  a broken track cannot create an infinite resubscribe or playback loop.
  Reconciliation reads current LiveKit room truth instead of treating events as
  a complete ledger. Diagnostics whitelist ephemeral participant/publication
  SIDs and numeric WebRTC health fields; they exclude identities, display
  names, messages, tokens, device labels, audio, ICE candidates, and addresses.
  Kept the existing 0–100% element gain path unchanged because 200% gain belongs
  to Packet D after this lifecycle is integrated. No backend, schema, policy,
  token grant, or presence contract changed.
- **Validation:**
  - `pnpm add livekit-client@2.21.0` — passed; the lockfile resolves
    `livekit-client` 2.21.0 and `@livekit/protocol` 1.50.4.
  - Focused Vitest run for `remote-audio`, `voice-diagnostics`,
    `useVoiceRoom`, `VoiceRoom`, and `SettingsPage` — passed 5 files and
    116/116 tests, including missed signal/full reconnect events, idempotent
    attachment, stale-event rejection, bounded retry, autoplay, stream state,
    diagnostic privacy, and copy controls.
  - `pnpm check` — passed formatting, zero-warning lint, both strict TypeScript
    projects, 81 Vitest files with 447/447 tests, 40/40 Node contracts,
    synchronized version 1.4.0, production renderer build, and bundle secret
    scan. The renderer built at 406.37 kB gzip and retained Vite's non-blocking
    large-chunk warning.
  - `./node_modules/.bin/tauri build --bundles app --config
src-tauri/tauri.local.conf.json` — passed, including its `pnpm build`
    prebuild, optimized Rust compile, and ad-hoc-signed Apple Silicon
    `Bakbak.app`; notarization was skipped because Apple release credentials
    are absent.
  - Post-bundle `node scripts/check-bundle-secrets.mjs` and `codesign --verify
--deep --strict --verbose=2
src-tauri/target/release/bundle/macos/Bakbak.app` — passed.
  - Final `./node_modules/.bin/prettier --check .` and `git diff --check` —
    passed on the complete implementation and documentation diff.
- **Documentation updated:** Updated the LiveKit version, remote-audio
  reconciliation/recovery contract, privacy-safe diagnostics flow, and current
  bundle size in `docs/architecture.md`; marked Packet A's scope and automated
  acceptance in plan 0033; split Packet A from the remaining plan 0033 Phase 5
  implementation gate in plan 0001; and appended this canonical progress
  entry.
- **Known limitations:** Packet A's installed six-person, 60-minute
  India/Canada macOS/Windows matrix remains open, including real network
  interruption/interface handoff, game/background focus, mute/unmute, and
  output-device switching. No Windows bundle or installed Windows behavior was
  validated on this macOS host. The full updater build was not run because this
  workstation lacks `TAURI_SIGNING_PRIVATE_KEY`; the applicable local macOS app
  bundle passed. The production renderer is about 70 kB gzip larger than the
  previously recorded baseline and should be startup-profiled before deciding
  whether to lazy-load LiveKit.
- **Next:** Install one shared Packet A source revision on the available macOS
  and Windows clients and run its six-client cross-region matrix. If selective
  silence recurs, copy diagnostics from one affected and one unaffected
  listener before either rejoins. Packets B and C may proceed independently;
  Packet D can start after Packet A is integrated.

## 2026-07-30 — Gate Windows native PR validation

- **Completed:** Added an always-running lightweight `Detect native changes`
  job to PR CI. It compares the pull request base/head revisions and starts the
  Windows native capture job only when `src-tauri/**` or
  `.github/workflows/ci.yml` changes. Manual `workflow_dispatch` runs always
  select Windows validation. The ordinary Ubuntu `validate` job remains
  unconditional for every pull request. Added a Node contract test that
  protects the path list, manual path, job output, dependency, and conditional.
- **Decisions:** Kept the Windows job inside the always-triggered CI workflow
  and gated the job with `if` instead of filtering the whole workflow. A
  conditionally skipped job reports success, whereas a path-filtered workflow
  can remain pending if it later becomes a required check. Detection fails
  toward running Windows: any non-zero `git diff --quiet` result selects the
  native job. Kept `.github/workflows/ci.yml` in scope so changes to the gate
  validate themselves. Retained the existing manual dispatch and Windows
  renderer/Cargo commands.
- **Validation:**
  - `node --test scripts/ci-workflow.test.mjs` — passed 1/1 focused workflow
    contract.
  - `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml")'` —
    passed; the workflow parses as YAML.
  - Local gate probes — unchanged native paths produced `required=false`; the
    known Windows-native implementation commit produced `required=true`.
  - `pnpm check` — passed formatting, zero-warning lint, both strict TypeScript
    projects, 81 Vitest files with 447/447 tests, 41/41 Node contracts,
    synchronized version 1.4.0, production renderer build, and bundle secret
    scan. Vite retained the existing non-blocking large-chunk warning.
  - Final `./node_modules/.bin/prettier --check .` and `git diff --check` —
    passed on the complete workflow, test, and documentation diff.
- **Documentation updated:** Documented the conditional Windows PR contract in
  `docs/architecture.md`, refined plan 0032's implemented and automated
  acceptance wording, added `scripts/ci-workflow.test.mjs`, and appended this
  canonical progress entry.
- **Known limitations:** The new workflow revision has not been pushed, so a
  GitHub-hosted non-native PR skip has not yet been observed. Because this
  change edits `.github/workflows/ci.yml`, its first PR run intentionally
  selects Windows validation; later renderer/docs-only PRs will show the job as
  skipped. Release Windows builds remain unconditional.
- **Next:** Push the current branch and confirm one successful
  workflow-change-triggered Windows job. On the next non-native-only PR,
  confirm `Detect native changes` succeeds and `Windows native capture` is
  skipped while `validate` runs normally.

## 2026-07-30 — Make active voice presence authoritative

- **Completed:** Implemented plan 0033 Packet B. Added one voice-occupancy
  selector shared by the channel tree and member rail. It replaces the joined
  room's heartbeat occupants with the current LiveKit participant IDs, retains
  that confirmed roster through signal/full reconnect, continues using fresh
  heartbeat sessions for other rooms, and lets an active participant override
  a stale heartbeat in another room. Current server membership supplies profile
  data and filters unknown identities; users deduplicate by ID. Every channel
  now sorts occupants by NFKC-normalized lowercase display name and stable user
  ID, including after rerender and category collapse. Presence refreshes now
  queue one follow-up query while a query is in flight and discard the
  superseded result.
- **Decisions:** Kept LiveKit authoritative only for the room the local client
  has actually joined; using it for other rooms would require subscriptions the
  privacy/product model does not permit. Reused the existing retained
  `useVoiceRoom` participant state during reconnect and verified it rather than
  changing Packet A's room/audio lifecycle. Made `VoiceRoomOccupant.joinedAt`
  nullable so an authenticated LiveKit participant without a usable timestamp
  still appears instead of receiving a fabricated timer. Kept all heartbeat
  reads behind the existing server-scoped RLS contract and made no schema,
  policy, token, or IndexedDB changes.
- **Validation:**
  - Focused Vitest run for `voice-occupancy`, `presence-service`,
    `ChannelSidebar`, and `useVoiceRoom` — passed 4 files and 72/72 tests.
    Coverage includes active roster equality, heartbeat-expired participants,
    active-room ghost removal, other-room heartbeats, membership filtering,
    user-ID deduplication, deterministic input/profile ordering, category
    collapse/expand, signal/full reconnect retention, and a delayed
    superseded heartbeat response.
  - Focused zero-warning ESLint and both strict TypeScript projects — passed.
  - `pnpm check` — passed formatting, zero-warning lint, both strict TypeScript
    projects, 82 Vitest files with 455/455 tests, 41/41 Node contracts,
    synchronized version 1.4.0, production renderer build, and bundle secret
    scan. The renderer built at 406.62 kB gzip and retained Vite's non-blocking
    large-chunk warning.
  - Final focused 4-file/72-test Vitest run,
    `./node_modules/.bin/prettier --check .`, bundle secret scan, and
    `git diff --check` — passed on the complete code and documentation diff.
- **Documentation updated:** Updated the application-presence authority,
  refresh serialization, identity resolution, and sorting contract in
  `docs/architecture.md`; marked Packet B scope/automated acceptance complete
  in plan 0033; split Packet B from the remaining Phase 5 implementation gate
  in plan 0001; and appended this canonical progress entry.
- **Known limitations:** Packet B's installed six-person macOS/Windows
  acceptance remains open. Real clients still need gallery/sidebar comparison
  during join, leave, signal/full reconnect, app backgrounding, game focus, and
  channel switching without clearing local data. This renderer/service-only
  change did not rerun a Tauri bundle or Windows installed build; the production
  renderer and full automated suite passed.
- **Next:** Run Packets A and B together during the integrated six-client
  session. If the gallery and sidebar diverge, record their user IDs and
  connection state before rejoining. Implement Packet C's Windows clipboard and
  private-image recovery next; Packet D is unblocked by Packet A.

## 2026-07-30 — Make pasted private images recoverable

- **Completed:** Implemented plan 0033 Packet C. The shared channel/DM composer
  now reads file-kind entries from both clipboard `items` and `files`, restores
  a missing Windows File MIME type from its item, deduplicates equivalent
  representations, and preserves the existing attachment limits. Private
  poster retrieval now requires a stable authenticated account, classifies
  offline/session/forbidden/missing/invalid/decode/transient outcomes, validates
  non-zero PNG/JPEG/WebP blobs by decoding before cache admission, evicts
  poisoned cache entries, and performs one fresh authenticated retrieval.
  Attachment rendering keeps the last usable preview while loading, replaces
  bare broken images with sanitized diagnostics and Retry, and revokes
  renderer-owned URLs on replacement/unmount. Added an optimistic-media lease
  across local-to-persisted message replacement and channel navigation; a
  persisted poster load, cancellation, or account teardown releases its local
  preview exactly once, while a failed send returns ownership to the restored
  draft.
- **Decisions:** Kept account identity and Storage RLS as the authorization
  boundary and made no schema or policy change without live evidence. Cached
  media remains keyed by account and a session change during download blocks
  the write, preventing a cross-account race. Used bounded diagnostic codes
  instead of raw Storage errors so signed URLs, headers, and session data never
  enter UI or logs. Kept full originals memory-only; only validated static
  posters enter IndexedDB.
- **Validation:**
  - Focused Packet C Vitest run — passed 5 files and 35/35 tests covering
    PNG/JPEG/WebP clipboard items, text plus image, unsupported items,
    duplicate file/item exposure, missing File MIME repair, authenticated cache
    validation/eviction, offline/401/403/404/transient/session-change outcomes,
    explicit retry UI, navigation handoff, and exact-once URL revocation.
  - Focused chat/media Vitest run — passed 15 files and 69/69 tests before the
    final retrieval edge-case additions.
  - `pnpm check` — passed formatting, zero-warning lint, both strict TypeScript
    projects, 84 Vitest files with 478/478 tests, 41/41 Node contracts,
    synchronized version 1.4.0, production renderer build, and bundle secret
    scan. Vite retained the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed the renderer rebuild, optimized Rust
    release build, ad-hoc signing, and macOS `Bakbak.app` bundle creation.
    Notarization was skipped because Apple notarization credentials are not
    configured.
  - Final focused Prettier and `git diff --check` — passed on the code and plan
    diff before this log entry.
- **Documentation updated:** Documented Windows clipboard normalization,
  stable-account poster validation/cache admission, sanitized recovery
  outcomes, and optimistic URL ownership in `docs/architecture.md`; marked
  Packet C code/automated acceptance complete while retaining its real
  two-account and installed checks in plan 0033; split completed Packet C from
  pending Packet D in plan 0001; and appended this canonical progress entry.
- **Known limitations:** The real hosted private Storage/RLS path still needs
  two authenticated accounts: one authorized recipient and one non-member or
  otherwise forbidden account. Windows paste and installed sender/recipient
  cache behavior were not executable on this macOS host. The macOS app bundle
  built but was not launched for the full paste/upload/channel/DM/navigation/
  restart/warm-cache/cleared-cache matrix. Packet C therefore is not installed
  acceptance complete.
- **Next:** Implement Packet D's measured, limited 0–200% listener gain without
  changing sender capture defaults. Then install one integrated A–D revision on
  macOS and Windows and run Packet E's six-client cross-region matrix plus
  Packet C's two-account private Storage probes.

## 2026-07-30 — Add safe listener-local 200% voice gain

- **Completed:** Implemented plan 0033 Packet D's code and automated
  acceptance. Remote speech, named soundboard tracks, and watched-share audio
  now enter one listener-owned Web Audio gain stage per subscribed track and
  mix through one shared 4×-oversampled soft limiter with a 98% ceiling. The
  participant control supports 0–200%, exposes the exact percentage and a
  boosted-state accessibility label, preserves values above 100% through local
  mute/unmute, and remains session-local. The shared limited output follows the
  selected speaker. Unsupported Web Audio creation falls back to the existing
  0–100% media-element path; diagnostics identify whether a track is using the
  limited output. Track detach, participant departure, room replacement, and
  renderer cleanup disconnect gain nodes and release the shared output stream,
  monitor, and context.
- **Decisions:** Kept browser automatic gain control, echo cancellation,
  capture constraints, RNNoise, and sender publication unchanged because the
  required repeatable macOS/Windows microphone measurements have not happened
  yet. Applied boost only on each listener so one friend's preference cannot
  alter anybody else's mix. Kept soundboard/global/base gain bounded to unity
  and multiplied it once with participant gain before the shared limiter.
  Reused the existing bounded playback recovery path for the output monitor,
  while treating graph-construction failure as a safe direct-audio fallback
  rather than an autoplay outage.
- **Validation:**
  - Focused Packet D Vitest run — passed 4 files and 92/92 tests covering exact
    0%, 50%, 100%, 150%, and 200% gain; limiter bounds; independent per-track
    stages with one shared limiter; output selection and teardown; safe
    unsupported-runtime fallback; mute restoration above unity; idempotent late
    attachment; soundboard/share multiplication; autoplay recovery; and the
    participant control.
  - Voice and soundboard Vitest run — passed 34 files and 219/219 tests.
  - Focused zero-warning ESLint — passed for every changed voice module and
    test.
  - `pnpm check` — passed formatting, zero-warning lint, both strict TypeScript
    projects, 85 Vitest files with 485/485 tests, 41/41 Node contracts,
    synchronized version 1.4.0, production renderer build, and bundle secret
    scan. Vite retained the existing non-blocking large-chunk warning.
  - `pnpm tauri:build:local` — passed the renderer rebuild, optimized Rust
    release build, ad-hoc signing, and macOS `Bakbak.app` bundle creation.
    Notarization was skipped because Apple notarization credentials are not
    configured.
- **Documentation updated:** Documented the listener-owned gain graph, shared
  limiter, selected-output monitor, fallback diagnostics, lifecycle, and
  unchanged sender pipeline in `docs/architecture.md`; marked Packet D's
  implementable scope and automated acceptance complete while retaining its
  measurement and installed checks in plan 0033; split completed Packet D code
  from its pending installed measurements in plan 0001; and appended this
  canonical progress entry.
- **Known limitations:** No repeatable before/after microphone measurement was
  performed on this host or Windows, so Packet D deliberately makes no claim
  that RNNoise or browser capture processing causes the reported low sender
  level. The built app was not launched with multiple installed clients.
  Headphone and laptop-speaker checks at 0%, 50%, 100%, 150%, and 200%,
  clipping/echo observations, and the quiet-versus-normal speaker comparison
  remain open. Web Audio graph failure intentionally limits the compatibility
  fallback to the HTML media element's 100% ceiling. The macOS bundle was not
  notarized.
- **Next:** Measure representative quiet, normal, and noisy microphones before
  and after browser processing/RNNoise on macOS and Windows, then run Packet D's
  installed 0–200% headphone and laptop-speaker matrix. Use the same integrated
  A–D revision for Packet C's two-account Storage probes and Packet E's
  six-person, 60-minute India/Canada stabilization gate.

## 2026-08-01 — Prepare exact-revision stabilization candidates

- **Completed:** Implemented Packet E's candidate-production gate without
  claiming its human acceptance. Added a read-only GitHub Actions workflow that
  runs only when the exact `stabilization:candidate` label is added to a pull
  request or an operator manually supplies a full 40-character commit SHA. It
  verifies and checks out that revision, runs the integrated renderer and
  locked Rust gates, then builds one Apple Silicon DMG and one Windows x64 NSIS
  installer with live public configuration and updater publication disabled.
  Both private seven-day artifacts share the same short revision in their name
  and include a bounded manifest with app version, full revision, platform, and
  workflow run. Candidate/release builds now embed their public source revision
  in copied voice diagnostics. Compiled-secret discovery now includes generic
  and target-specific Tauri bundle directories.
- **Decisions:** Kept candidate production separate from the stable release
  workflow because the existing release path publishes immediately after its
  two-platform build. Candidate automation has `contents: read`, receives no
  updater key, creates no GitHub Release, and cannot announce or update clients.
  A PR label event avoids adding macOS/Windows build spinners to ordinary pull
  requests. Any source change invalidates both artifacts and requires the label
  to be removed and re-added. The release workflow also injects its exact
  `github.sha`, while local builds normalize missing or invalid revisions to
  `local` instead of presenting false provenance.
- **Validation:**
  - `node --test scripts/*.test.mjs` — passed 45/45 contracts, including the
    label/manual trigger, exact-SHA checkout, two supported installer targets,
    non-publishing permissions, seven-day artifacts, candidate manifest
    validation, target-specific secret discovery, and existing CI/release
    behavior.
  - Focused Vitest with a 40-character `VITE_BUILD_REVISION` — passed 2 files
    and 4/4 tests for revision normalization and diagnostic provenance.
  - Focused zero-warning ESLint, Prettier, workflow YAML parsing, and
    `git diff --check` — passed.
  - `pnpm check` — passed formatting, zero-warning lint, both strict TypeScript
    projects, 86 Vitest files with 486/486 tests, 45/45 Node contracts,
    synchronized version 1.4.0, production renderer build, and compiled secret
    scan. Vite retained the existing non-blocking large-chunk warning.
  - `cargo check --locked --manifest-path src-tauri/Cargo.toml` — passed.
  - `cargo test --locked --manifest-path src-tauri/Cargo.toml` — passed 17/17
    native tests with no failures in the binary or doc-test targets.
  - Exact local Apple candidate command using `--target
aarch64-apple-darwin --bundles app,dmg` plus
    `src-tauri/tauri.local.conf.json` — passed the renderer rebuild, optimized
    native compile, ad-hoc-signed app bundle, and DMG generation. Post-build
    compiled secret scanning included the target-specific bundle; strict
    `codesign` verification and `hdiutil verify` both passed.
- **Documentation updated:** Documented candidate creation and invalidation in
  `README.md`; added its non-publishing release boundary, public build revision,
  diagnostics provenance, artifact lifecycle, and validation contract to
  `docs/architecture.md`; marked Packet E integration, automation, and local
  automated gates complete while retaining hosted/installed acceptance in plan
  0033; recorded candidate automation in plan 0001; and appended this canonical
  progress entry.
- **Known limitations:** The new workflow has not been pushed or triggered, so
  no GitHub-hosted Apple Silicon/Windows artifact pair exists yet. Windows x64
  cannot be built or installed on this macOS host. The locally generated DMG is
  a workflow-command validation artifact from a dirty working tree with
  `buildRevision: local`; it is not the exact-revision friend-test candidate
  and must not be distributed as one. The app/DMG remain ad-hoc signed and
  unnotarized, while the future Windows candidate is unsigned. Packet C's real
  two-account Storage probe, Packet D's microphone/input measurements, every
  installed A–D check, and Packet E's six-person 60-minute India/Canada session
  remain open. No stable release was created or published.
- **Next:** Commit and push this Packet E infrastructure, freeze the pull
  request head, add `stabilization:candidate`, and download only the macOS and
  Windows artifacts whose manifests share that new full revision. Install
  those two candidates and run the complete six-person matrix. Append sanitized
  observations before either allowing the merge/release or returning a failure
  to its owning packet.

## 2026-08-01 — Buzz-inspired unified Bakbak redesign

- **Completed:** Replaced the signed-in five-track shell with one resizable,
  collapsible gradient sidebar and one rounded solid conversation canvas. Moved
  the Personal/Bakbak switch into both sidebar modes, added the top-four online
  preview and focus-trapped grouped member overlay, removed the right member/DM
  rail, and routed DM/member identities through the existing profile surface.
  Added the flat Welcome, Chat, Volt, Random Things, and Game #1–#3 room shelf,
  compact admin create/rename actions, empty mock conversations, Inter Variable,
  space-specific light/dark palettes, v3 layout preferences, denser grouped
  messages, shared curved control tokens, and Appearance palette previews.
  Added the local archival migration and active-only client/database contracts,
  updated Welcome automation, and removed the release chat job, history
  workflow, Edge Function, secret placeholder, configuration, and RPC surface.
- **Decisions:** Historical categories, rooms, messages, attachments, reactions,
  and reads are archived rather than deleted. The fresh visible rooms use new
  stable IDs and begin empty. Welcome retains `system-general` internally but
  loses the System-category/lock presentation. Layout v2 migration keeps only
  the former left panel's visibility/width. Native system-accent plumbing may
  remain dormant for compatibility, while signed-in rendering derives its
  accent from the active Bakbak or Personal space. The production archival
  migration was deliberately not applied; it needs a separate data approval.
- **Validation:**
  - `pnpm check` — passed Prettier, zero-warning ESLint, both strict TypeScript
    projects, 86 Vitest files with 475/475 tests, 44/44 Node contract tests,
    synchronized version 1.5.0, production renderer build, and compiled-secret
    scan. Vite retained its existing non-blocking large-chunk warning and emitted
    the bundled Inter Variable WOFF2 subsets.
  - `deno test --allow-env --config supabase/deno.json supabase/functions/tests`
    — passed 42/42 remaining Edge Function tests after removing system-events.
  - `pnpm dlx supabase@latest db reset` — failed before migration execution
    because Docker/Colima was not running at
    `/Users/ayushrameja/.colima/default/docker.sock`; pgTAP was therefore not
    run and no database assertion is claimed.
  - Local Tauri app bundle (`tauri build --bundles app` with the local config) —
    passed the renderer rebuild, optimized native compile, ad-hoc signing, and
    local `Bakbak.app` bundle. Notarization was skipped because Apple credentials
    were not configured.
  - In-app mock-browser checks at 1280×800 and 1024×680 — passed light/dark
    Bakbak, light/dark Personal, 248/280/340 px and hidden sidebar states,
    persistence, empty chat, member overlay focus, profile access, Settings
    palettes, voice room, soundboard, and Personal/Bakbak switching during an
    active call. Document overflow stayed zero, intended long voice/soundboard
    content remained internally scrollable, controls stayed reachable, and the
    console reported no errors.
  - `git diff --check` and focused forbidden-secret review — passed again at
    final handoff validation.
- **Documentation updated:** Added plan 0034, marked its local implementation
  gates, updated plan 0001's active scope and regression contract, rewrote the
  current architecture and backend boundaries, updated Supabase deployment
  guidance, and appended this canonical progress entry.
- **Known limitations:** The Docker-backed reset, schema lint, and pgTAP suite
  remain blocked, so the new SQL migration is implemented and reviewed but not
  runtime-validated. Hosted Supabase remains on the pre-0034 hierarchy. The
  two-client presence ordering, live Show all updates, admin room Realtime,
  future Welcome event, archived-room disappearance, active-call transition,
  profile/DM matrix, populated-chat visual matrix, Windows build, and installed
  macOS/Windows observation remain open. The local macOS app is ad-hoc signed
  and unnotarized.
- **Next:** Start Docker/Colima, run a clean local reset, schema lint, and the
  complete pgTAP suite, fix any migration failures, then repeat the two-client
  local acceptance matrix. Request explicit production-data approval before any
  hosted `db push`; after approval, take an operator backup and migrate before
  distributing this renderer.

## 2026-08-01 — Deploy the unified channel archive

- **Completed:** Applied
  `202608010001_unified_bakbak_channels.sql` to the linked, healthy Bakbak
  project in Canada Central after the user explicitly approved the production
  data migration. Confirmed the hosted migration ledger matches the repository,
  ran linked schema lint after the push, and deleted the retired hosted
  `system-events` Edge Function. The old category/room rows and their related
  history remain stored with archive timestamps; the fresh Channels category
  and seven-room workspace are now the active hosted layout.
- **Decisions:** Proceeded only after resolving the linked target and proving
  that exactly one migration was pending. Kept the rollout to the accepted
  archive-not-delete transaction and its release-announcement cleanup. Supabase
  reported WAL archiving enabled but no available physical snapshot; the CLI
  logical-backup path requires Docker, which is stopped on this host. Because
  the migration dry run was clean, the SQL contains no row deletion, table
  drop, or truncation, and `db push` applies each migration transactionally, the
  approved rollout proceeded without pretending a backup existed.
- **Validation:**
  - `supabase projects list` — passed; the linked target was the active healthy
    `bakbak` project in `ca-central-1`.
  - `supabase migration list` before the push — passed; only
    `202608010001` was local-only.
  - `supabase backups list` — passed; WAL archiving was enabled, PITR was
    disabled, and no physical backup snapshot was available.
  - Static migration audit for `DELETE`, `TRUNCATE`, and `DROP TABLE` — passed;
    the only data transition is archive-timestamp updates plus fresh inserts.
  - `supabase db push --linked --dry-run` — passed and named only
    `202608010001_unified_bakbak_channels.sql`.
  - `supabase db dump --linked --data-only --schema public` — failed before
    dumping because Docker/Colima was unavailable; its zero-byte temporary file
    contained no production data.
  - `supabase db push --linked --yes` — passed; migration `202608010001` was
    applied successfully.
  - `supabase migration list` after the push — passed; local and remote both
    report `202608010001`.
  - `supabase db lint --linked --level error` — passed with no schema errors.
  - `supabase functions delete system-events` — passed; the retired hosted
    Edge Function was deleted.
  - `supabase functions list` after deletion — passed; the hosted list contains
    the five active app functions and no `system-events` entry.
  - `./node_modules/.bin/prettier --check .` and `git diff --check` — passed;
    the deployment documentation is formatted and the worktree has no
    whitespace errors. The `pnpm --dir ... format:check` wrapper produced no
    output while waiting on this host's pnpm 11.17 bootstrap and was interrupted;
    the repository-local Prettier binary ran the same format check directly.
- **Documentation updated:** Marked the hosted migration and function cleanup
  complete in plan 0034 and plan 0001, updated the current hosted backend state
  in `docs/architecture.md` and `supabase/README.md`, and appended this canonical
  deployment entry.
- **Known limitations:** No physical or logical operator backup was available
  for this rollout. Docker-backed reset/pgTAP remains unrun on this host. The
  hosted two-client presence, Show all, admin room Realtime, future Welcome
  event, archived-room disappearance, profile/DM, and active-call transition
  matrix remains open, as do installed macOS/Windows checks.
- **Next:** Run the hosted two-account acceptance matrix against the migrated
  workspace, then repeat the installed macOS/Windows visual and active-call
  checks before distributing the redesigned renderer.

## 2026-08-01 — Center Personal/Bakbak selector labels

- **Completed:** Kept the Personal and Bakbak labels geometrically centered in
  their equal-width selector segments when unread or active-call markers are
  present. Grouped status markers in a right-aligned, non-layout wrapper so
  both indicators remain visible without shifting the selected label.
- **Decisions:** Preserved the existing accessible button labels, keyboard
  navigation, unread markers, and call marker semantics. The visual correction
  belongs in the shared switcher structure and CSS so it applies consistently
  in both sidebar modes.
- **Validation:**
  - `./node_modules/.bin/prettier --check src/components/SpaceSwitcher.tsx src/components/SpaceSwitcher.test.tsx src/styles.css` — passed.
  - `./node_modules/.bin/vitest run src/components/SpaceSwitcher.test.tsx` — passed 3/3 tests.
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false && ./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.node.json` — passed.
  - `./node_modules/.bin/vitest run` — passed 86 files and 475 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 tests.
  - `./node_modules/.bin/vite build` — passed; the existing large-chunk warning remains non-blocking.
  - In-app mock visual check at 1280×720 with an active voice marker — passed; the Bakbak label center matched its button center within 0.01 px and the browser console had no errors.
  - `git diff --check` — passed.
  - `./node_modules/.bin/tauri build --bundles app --config src-tauri/tauri.local.conf.json` — skipped after the command stalled in Tauri's installed-package lookup and then the repository `pnpm build` prebuild hook; the verified renderer build passed separately.
- **Documentation updated:** Appended this canonical progress entry. No
  architecture or plan source of truth changed.
- **Known limitations:** The host's pnpm bootstrap remains unable to complete
  interactively, and the native bundle was not rebuilt in this task because
  Tauri could not reach its native build phase. Existing installed-client and
  multi-client acceptance gaps remain unchanged.
- **Next:** Continue the existing hosted and installed acceptance matrix for
  plan 0034.

## 2026-08-01 — Remove selector hover tooltip

- **Completed:** Removed the redundant native `title` tooltip from the Bakbak
  selector button. The visible Bakbak label and accessible name remain intact,
  while hover no longer paints a floating “Bakbak server” label over the
  titlebar and makes the sidebar alignment appear incorrect.
- **Decisions:** Kept the selector in its accepted sidebar position and kept
  the existing disabled-state accessible name (`Server invite needed`) rather
  than adding another custom tooltip surface.
- **Validation:**
  - `./node_modules/.bin/prettier --check src/components/SpaceSwitcher.tsx src/components/SpaceSwitcher.test.tsx` — passed.
  - `./node_modules/.bin/eslint src/components/SpaceSwitcher.tsx src/components/SpaceSwitcher.test.tsx --max-warnings=0` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false && ./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.node.json` — passed.
  - `./node_modules/.bin/vitest run src/components/SpaceSwitcher.test.tsx` — passed 3/3 tests.
  - `./node_modules/.bin/vite build` — passed; the existing large-chunk warning remains non-blocking.
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/vitest run` — passed 86 files and 475 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 tests.
  - `git diff --check && node scripts/check-bundle-secrets.mjs` — passed.
  - In-app mock visual check — passed; both labels stayed centered and the
    hover tooltip was absent.
- **Documentation updated:** Appended this canonical progress entry. No
  architecture or plan source of truth changed.
- **Known limitations:** The native Tauri bundle was not rerun; the previous
  entry records the host's pnpm/Tauri build-phase blocker. Existing installed
  client and multi-client acceptance gaps remain unchanged.
- **Next:** Continue the existing hosted and installed acceptance matrix for
  plan 0034.

## 2026-08-01 — Contain selector segments inside parent

- **Completed:** Fixed the Personal/Bakbak selector’s sidebar box model. The
  parent remains a 36 px control with 3 px padding and 1 px borders, while
  both child segments now fill only the available inner track instead of
  overflowing below the dark parent background.
- **Decisions:** Kept the existing control height and visual padding contract;
  removed the conflicting 34 px minimum height from the sidebar-specific
  override and used `height: 100%` with `min-height: 0` for the two segments.
- **Validation:**
  - `./node_modules/.bin/prettier --check src/components/SpaceSwitcher.tsx src/components/SpaceSwitcher.test.tsx src/styles.css` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false && ./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.node.json` — passed.
  - `./node_modules/.bin/vitest run` — passed 86 files and 475 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 tests.
  - `./node_modules/.bin/vite build` — passed; the existing large-chunk warning remains non-blocking.
  - `git diff --check && node scripts/check-bundle-secrets.mjs` — passed.
  - In-app mock visual check — passed; parent measured 36 px, each segment measured 28 px, both segments fit inside the parent, and top/bottom insets were equal.
- **Documentation updated:** Appended this canonical progress entry. No
  architecture or plan source of truth changed.
- **Known limitations:** The native Tauri bundle was not rerun; the earlier
  entry records the host’s pnpm/Tauri build-phase blocker. Existing installed
  client and multi-client acceptance gaps remain unchanged.
- **Next:** Continue the existing hosted and installed acceptance matrix for
  plan 0034.

## 2026-08-01 — Use theme surfaces for text and voice canvases

- **Completed:** Added theme-safe conversation surface defaults for the signed-in
  shell. Automatic dark mode now receives the dark canvas tokens, automatic
  light mode follows the system light media query, and explicit Dark/Light
  preferences still override those defaults. Applied the same solid surface
  directly to the connected voice room so the space gradient remains confined
  to the sidebar.
- **Decisions:** Kept the existing sidebar gradient and the established dark
  `#171717` / light `#fbfbf8` canvas colors. The root cause was an unset
  `--conversation-canvas` when Auto removed `data-color-scheme`, not a layout
  change in the chat or voice components.
- **Validation:**
  - `./node_modules/.bin/prettier --check src/styles.css` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false && ./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.node.json` — passed.
  - `./node_modules/.bin/vitest run` — passed 86 files and 475 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 tests.
  - `./node_modules/.bin/vite build` — passed; the existing large-chunk warning remains non-blocking.
  - `git diff --check && node scripts/check-bundle-secrets.mjs` — passed.
  - In-app mock visual check at 1280×720 — passed; Auto dark, explicit Dark,
    and explicit Light produced solid text and connected voice canvases, while
    the sidebar retained its gradient. The dark text and voice states were
    also visually reviewed in rendered screenshots.
- **Documentation updated:** Appended this canonical progress entry. No
  architecture or plan source of truth changed because the documented shell
  contract already calls for a solid theme-aware conversation canvas.
- **Known limitations:** The native Tauri bundle was not rerun; the earlier
  entry records the host’s pnpm/Tauri build-phase blocker. Existing installed
  client and multi-client acceptance gaps remain unchanged.
- **Next:** Continue the existing hosted and installed acceptance matrix for
  plan 0034.

## 2026-08-01 — Match Buzz message-area hierarchy

- **Completed:** Removed the text-channel topic subtitle from the top bar so
  the header now carries only the channel identity. Restyled the channel intro
  as an unboxed Buzz-style conversation start, changed its heading to the
  channel name (`#Chat`), and tightened the intro/message insets so the first
  message aligns with the canvas edge rhythm from the reference.
- **Decisions:** Kept the channel topic visible inside the conversation intro
  rather than deleting useful context. Direct-message identity/status remains
  unchanged, and message/composer behavior remains untouched.
- **Validation:**
  - `./node_modules/.bin/prettier --check src/app/App.tsx src/app/App.test.tsx src/features/chat/ChatView.tsx src/features/chat/ChatView.test.tsx src/styles.css` — passed.
  - `./node_modules/.bin/vitest run src/app/App.test.tsx src/features/chat/ChatView.test.tsx` — passed 2 files and 24 tests.
  - `node --test scripts/conversation-layout.test.mjs` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false && ./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.node.json` — passed.
  - `./node_modules/.bin/vitest run` — passed 86 files and 476 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 tests.
  - `./node_modules/.bin/vite build` — passed; the existing large-chunk warning remains non-blocking.
  - `git diff --check && node scripts/check-bundle-secrets.mjs` — passed.
  - In-app mock visual check at 1280×720 — passed; the channel header has no
    topic subtitle, the intro is transparent with a bottom divider, and the
    first message aligns at the updated 20 px canvas inset.
- **Documentation updated:** Appended this canonical progress entry. No
  architecture or plan source of truth changed.
- **Known limitations:** The native Tauri bundle was not rerun; the earlier
  entry records the host's pnpm/Tauri build-phase blocker. Existing installed
  client and multi-client acceptance gaps remain unchanged.
- **Next:** Continue the existing hosted and installed acceptance matrix for
  plan 0034.

## 2026-08-01 — Match Buzz channel header

- **Completed:** Replaced the signed-in channel header's large icon-and-title
  treatment with a compact Buzz-style `# channel` identity. Added the member
  count, headphones, and ellipsis action cluster; the member action opens the
  existing grouped member overlay, the headphones action opens Audio & video
  settings, and the ellipsis menu exposes those same actions. Lifted only the
  overlay open state to the shell so sidebar and header entry points share one
  dialog. Reduced the channel header row to 56 px while keeping direct-member
  identity/status and voice-channel topic behavior intact.
- **Decisions:** Scoped the Buzz-style action cluster to server channels and
  used the actual workspace member count rather than inventing a channel-local
  count. Kept the text-channel topic in the body intro, where the previous
  hierarchy change placed it, and kept direct-message chrome unchanged.
- **Validation:**
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false && ./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.node.json` — passed.
  - `./node_modules/.bin/vitest run src/app/App.test.tsx src/features/channels/ChannelSidebar.test.tsx` — passed 2 files and 18 tests.
  - `./node_modules/.bin/vitest run` — passed 86 files and 476 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 tests.
  - `./node_modules/.bin/vite build` — passed; the existing large-chunk warning remains non-blocking.
  - `node scripts/check-bundle-secrets.mjs` — passed.
  - `git diff --check` — passed.
  - In-app mock visual check at 1280×720 — passed; text and voice headers
    render the compact channel identity and right-side action cluster, and the
    member action opens the real overlay.
- **Documentation updated:** Appended this canonical progress entry. No
  architecture or plan source of truth changed.
- **Known limitations:** The native Tauri bundle was not rerun; the earlier
  entry records the host's pnpm/Tauri build-phase blocker. Existing installed
  client and multi-client acceptance gaps remain unchanged.
- **Next:** Continue the existing hosted and installed acceptance matrix for
  plan 0034.

## 2026-08-01 — Match header surface and simplify actions

- **Completed:** Set the signed-in channel header background to the exact
  conversation-canvas token so it no longer appears as a lighter raised strip.
  Removed the direct members/count and headphones controls from the header,
  leaving only the ellipsis button. The ellipsis menu still exposes the real
  Show members and Audio & video settings actions, and the focused header test
  now verifies that the removed controls stay absent.
- **Decisions:** Kept the existing menu output and its functionality while
  reducing the persistent chrome to the single control requested. No changes
  were made to the sidebar member preview, voice dock, or direct-message
  header.
- **Validation:**
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false && ./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.node.json` — passed.
  - `./node_modules/.bin/vitest run src/app/App.test.tsx src/features/channels/ChannelSidebar.test.tsx` — passed 2 files and 18 tests.
  - `./node_modules/.bin/vitest run` — passed 86 files and 476 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 tests.
  - `./node_modules/.bin/vite build` — passed; the existing large-chunk warning remains non-blocking.
  - `node scripts/check-bundle-secrets.mjs` — passed.
  - `git diff --check` — passed.
  - In-app mock visual check at 1280×720 — passed; the header matches the
    canvas surface, shows only the ellipsis, and retains its two menu actions.
- **Documentation updated:** Appended this canonical progress entry. No
  architecture or plan source of truth changed.
- **Known limitations:** The native Tauri bundle was not rerun; the earlier
  entry records the host's pnpm/Tauri build-phase blocker. Existing installed
  client and multi-client acceptance gaps remain unchanged.
- **Next:** Continue the existing hosted and installed acceptance matrix for
  plan 0034.

## 2026-08-02 — Refine Activity and channel navigation

- **Completed:** Replaced the sidebar's Online preview with a flat `Activity`
  section that previews up to six other members regardless of status and keeps
  `Show all` as the seventh row. Reused the former member-rail cover poster
  behavior for subtle Activity-row texture, while retaining avatar status
  indicators and profile/context actions. Tightened Activity and channel row
  density, changed the visible heading to `Channels`, made inactive channel
  labels regular weight, made navigation icons white, and reduced active-row
  emphasis to a quiet neutral wash. Softened the Bakbak and Personal gradients
  and expanded mock data to exercise the six-member layout.
- **Decisions:** Kept current-user exclusion because the signed-in identity
  remains pinned in the user dock, and kept voice/online/away/offline ordering
  deterministic while allowing offline members into the preview. Kept covers
  as low-opacity row texture rather than restoring a colored Activity card so
  the sidebar reads as one clean channel area.
- **Validation:**
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `pnpm build` — passed strict TypeScript and the production renderer build;
    Vite's existing large-chunk warning remains non-blocking.
  - `./node_modules/.bin/vitest run` — passed 86 files and 477 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 tests.
  - `node scripts/check-bundle-secrets.mjs` — passed for the renderer and
    available Tauri bundle directories.
  - `git diff --check` — passed.
  - Focused `ChannelSidebar` and `MemberPanel` tests — passed 17/17 combined;
    Activity cover rendering, six-member ordering, offline inclusion, and
    Show all focus restoration are covered.
  - In-app mock visual check at 1280×720 — passed; six Activity members,
    seventh Show all row, all seven channels, subtle gradient, white icons,
    regular inactive labels, and restrained active styling were reviewed.
- **Documentation updated:** Updated `docs/architecture.md`, the Plan 0034
  accepted UI scope, the sidebar contract test, and this canonical progress
  entry.
- **Known limitations:** `pnpm format:check` and `pnpm security:scan` were
  interrupted after the host's pnpm wrapper produced no output; the
  repository-local Prettier and secret-scan binaries passed the equivalent
  checks. `pnpm tauri build` was also interrupted after stalling before native
  build output, so no new installed bundle is claimed. Existing hosted,
  installed-client, and multi-client acceptance gaps remain unchanged.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Finalize settings/profile redesign pass

- **Completed:** Final working-tree validation confirms the selected-speaker
  error is owned by Audio & Video settings with an inline dismiss action, and
  member profile popovers use the new solid, avatar-led presentation.
- **Decisions:** No additional runtime or scope changes after the settings
  dismissal follow-up; the room remains free of the old output banner.
- **Validation:**
  - Focused profile, settings, and voice tests — passed 4 files and 108 tests.
  - Full Vitest — passed 86 files and 481 tests.
  - Prettier, ESLint, renderer/node TypeScript, Vite build, script tests,
    secret scan, and `git diff --check` — passed.
- **Documentation updated:** This final chronological progress entry was
  appended; architecture and Plan 0034 already contain the updated behavior.
- **Known limitations:** `pnpm tauri build` remains interrupted by the
  host's no-output native build stall; no installed bundle is claimed.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Revert settings/profile UI experiment

- **Completed:** Reverted the previous settings/profile visual experiment.
  Restored the temporary output warning banner and its eight-second
  auto-dismiss behavior, restored the cover-based profile popover, and removed
  the added settings-only output dismissal wiring.
- **Decisions:** Reverted only the last task's files and documentation changes;
  unrelated existing redesign work remains untouched. The append-only history
  entries describing the experiment remain in place, with this entry recording
  the correction.
- **Validation:**
  - Focused profile, settings, and voice tests — passed 4 files and 107 tests.
  - Focused Prettier checks — passed.
  - Focused ESLint checks — passed.
  - `git diff --check` — passed.
- **Documentation updated:** Restored the architecture and Plan 0034 text to
  their pre-experiment behavior and appended this canonical revert entry.
- **Known limitations:** The broader repository remains in its pre-existing
  dirty state; no unrelated changes were reset.
- **Next:** Continue the existing Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Validate settings-side output dismissal

- **Completed:** Added the existing output-warning dismissal action to the
  Audio & Video settings error row so moving the notice out of the room did
  not remove the user's recovery escape hatch.
- **Decisions:** Kept dismissal local to the settings row; successful output
  recovery and voice room lifecycle changes still clear the same state.
- **Validation:**
  - Focused profile, settings, and voice tests — passed 4 files and 108 tests.
  - Full `./node_modules/.bin/vitest run` — passed 86 files and 481 tests.
  - Full Prettier, ESLint, renderer/node TypeScript, Vite build, script tests,
    secret scan, and `git diff --check` — passed.
- **Documentation updated:** Appended this validation correction to
  `docs/progress.md`; no architecture or plan change was needed.
- **Known limitations:** The native `pnpm tauri build` remains unverified
  because the host stalls before native build output.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Move output recovery into settings and flatten profiles

- **Completed:** Removed the temporary selected-speaker failure banner from
  the voice-room canvas. Output fallback and speaker-switch errors now remain
  available to the Audio & Video settings surface instead of auto-expiring in
  room chrome. Reworked anchored member profile popovers into a compact solid
  panel with avatar-led identity details; cover posters, cover animations, and
  cover focal positioning are no longer rendered in that popover, while avatar
  animation behavior remains available.
- **Decisions:** Kept device recovery beside the output selector so the
  conversation stays focused on the call, and made the error state persistent
  until the output is recovered or the voice lifecycle clears it. Preserved
  rich cover media for profile editing and other existing surfaces; only the
  legacy cover-based profile presentation was removed to match the current
  solid-background redesign.
- **Validation:**
  - `pnpm format:check` — interrupted after the launcher produced no output;
    local `./node_modules/.bin/prettier --check .` passed.
  - `pnpm lint` — interrupted after the launcher produced no output; local
    `./node_modules/.bin/eslint . --max-warnings=0` passed.
  - `pnpm typecheck` — interrupted after the launcher produced no output;
    local renderer and node `tsc --noEmit --pretty false` checks passed.
  - `pnpm test` — passed 86 files and 481 Vitest tests plus 44/44 script
    tests.
  - `pnpm build` — passed typechecking and the production Vite build; the
    existing large-chunk warning remains non-blocking.
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/vitest run` — passed 86 files and 481 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 script tests.
  - `node scripts/check-bundle-secrets.mjs` — passed for available bundle
    directories.
  - `git diff --check` — passed.
  - Focused profile, settings, and voice tests — passed 107 tests before the
    final settings regression addition; the full 481-test run passed after it.
  - `pnpm tauri build` — interrupted after the documented native no-output
    stall; no new installed bundle is claimed.
- **Documentation updated:** Updated `docs/architecture.md`, updated the
  active Plan 0034 acceptance notes, and appended this canonical progress
  entry.
- **Known limitations:** Installed macOS/Windows, hosted two-client, and
  multi-client profile/voice acceptance remain open. The repository pnpm
  launcher still stalls without output for formatting, lint, and typecheck
  scripts on this host.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Polish channel shelf actions and spacing

- **Completed:** Replaced the paired text/voice creation buttons with one
  accessible `Add channel` plus control and a small Text channel / Voice
  channel menu. The menu closes after selection or Escape and restores focus
  to the plus trigger. Centered the per-row rename action against the channel
  row, reserved its right-side space, and increased the channel shelf rhythm
  by roughly 10% through row height, horizontal inset, and list spacing.
- **Decisions:** Kept creation choices inside the existing admin-only boundary
  and left the underlying `onCreateChannel` flow unchanged. Used a local menu
  rather than a second modal because the two choices are short and directly
  actionable; kept the channel list independently scrollable so the larger
  rhythm does not hide any rooms.
- **Validation:**
  - `pnpm test` — passed 86 files and 480 Vitest tests plus 44/44 script
    tests.
  - `pnpm build` — passed `pnpm typecheck` for renderer and node configs and
    the production renderer build; Vite's existing large-chunk warning remains
    non-blocking.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/tsc --noEmit` — passed.
  - `node scripts/check-bundle-secrets.mjs` — passed for available bundle
    directories.
  - `git diff --check` — passed.
  - Focused `ChannelSidebar` tests — passed 11/11, including menu selection,
    Escape focus restoration, rename behavior, and channel ordering.
  - In-app mock visual check at 1280×720 — passed; the plus menu is readable,
    the rename button geometry is vertically centered, and the channel rows
    have the intended looser rhythm.
- **Documentation updated:** Updated `docs/architecture.md` and appended
  this canonical progress entry.
- **Known limitations:** `pnpm tauri build` was not rerun because the host's
  native build phase is still the documented no-output stall; no new installed
  bundle is claimed. Existing hosted, installed-client, and multi-client
  acceptance gaps remain unchanged.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Restore Activity presence and animated media

- **Completed:** Fixed Activity presence visibility by applying the semantic
  online and away status colors to its avatar indicators. Activity rows and
  the expanded Members view now autoplay available avatar and cover GIF media
  over their static posters, including uploaded and GIPHY sources, while
  preserving profile-media fallback behavior.
- **Decisions:** Kept the six-member Activity selection and current-user
  exclusion unchanged; the fix makes online members readable when they are in
  that preview rather than duplicating the signed-in user dock. Autoplay is
  scoped to presence/member rows so the rest of the app keeps its lighter
  hover/focus loading behavior. Reduced-motion mode never requests or renders
  animated media.
- **Validation:**
  - `pnpm test` — passed 86 files and 479 Vitest tests plus 44/44 script
    tests.
  - `pnpm build` — passed `pnpm typecheck` for renderer and node configs and
    the production renderer build; Vite's existing large-chunk warning remains
    non-blocking.
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/tsc --noEmit` — passed.
  - `node scripts/check-bundle-secrets.mjs` — passed for available bundle
    directories.
  - `git diff --check` — passed.
  - Focused Activity/member/profile tests — passed 24/24.
  - In-app mock visual check at 1280×720 — passed; online dots render green,
    Activity remains flat, and the compact channel layout is unchanged.
- **Documentation updated:** Updated `docs/architecture.md` and appended
  this canonical progress entry.
- **Known limitations:** `pnpm format:check` and `pnpm lint` were interrupted
  after the host's pnpm wrapper produced no output; repository-local Prettier
  and ESLint equivalents passed. `pnpm tauri build` was also interrupted
  after stalling before native build output, so no new installed bundle is
  claimed. Existing hosted, installed-client, and multi-client acceptance gaps
  remain unchanged.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Compact Buzz-like current-user dock

- **Completed:** Reworked the shared Personal/Bakbak user dock into a flat,
  compact footer row with a quiet cover texture, stronger identity hierarchy,
  semantic Online/Away/Offline or In voice status text, and smaller restrained
  Settings/voice controls. Profile, Settings, and active-call behavior remain
  unchanged.
- **Decisions:** Kept the existing profile trigger and settings action instead
  of adding a second account/status menu without matching backend actions. The
  current user dock remains 68 px tall so it keeps the established composer
  rhythm, while the cover remains available as a low-opacity texture rather
  than competing with the identity row.
- **Validation:**
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.node.json` — passed.
  - `./node_modules/.bin/vitest run` — passed 86 files and 480 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 script tests.
  - `./node_modules/.bin/vite build` — passed; Vite's existing large-chunk
    warning remains non-blocking.
  - `node scripts/check-bundle-secrets.mjs` — passed for available bundle
    directories.
  - `git diff --check` — passed.
  - Focused sidebar/dock tests — passed 17/17.
  - In-app mock visual check at 1280×720 — passed; the footer is a quiet
    identity row on the sidebar gradient and the old card-like background is
    no longer prominent.
- **Documentation updated:** Updated `docs/architecture.md` and appended this
  canonical progress entry.
- **Known limitations:** The repository `pnpm` launcher produced no output and
  stalled even for `pnpm --version`; a focused `pnpm vitest run` was stopped
  after the same behavior. Repository-local equivalents above passed. The
  native `pnpm tauri build` remains skipped because of the documented host
  no-output native build stall, so no new installed bundle is claimed.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Align current-user dock to the footer edge

- **Completed:** Removed the current-user dock's top divider and bottom-aligned
  its identity/status row with a smaller lower inset, keeping the Settings and
  active-call controls on the same baseline.
- **Decisions:** Kept the dock's established 68 px height and quiet cover
  treatment; only the vertical alignment and divider were changed so the
  footer does not grow or affect the channel shelf's available space.
- **Validation:**
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/vitest run` — passed 86 files and 480 tests.
  - `./node_modules/.bin/vite build` — passed; Vite's existing large-chunk
    warning remains non-blocking.
  - `git diff --check` — passed.
  - In-app mock visual check at 1280×720 — passed; the divider is absent and
    the identity row is visibly anchored to the lower edge without clipping.
- **Documentation updated:** Appended this canonical progress entry; the
  existing architecture description remains accurate.
- **Known limitations:** `pnpm` and the native `pnpm tauri build` remain
  unavailable because of the documented host no-output stall; local-equivalent
  renderer checks passed and no new installed bundle is claimed.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Refine the connected voice card

- **Completed:** Restyled the active voice panel as a compact rounded card with
  a clear green connection/quality hierarchy, isolated red leave action, and
  three equal low-noise camera, screen-share, and soundboard controls above
  the current-user dock. Existing labels, handlers, disabled states, and
  backend-quality tooltip behavior remain unchanged.
- **Decisions:** Kept the current semantic state colors and accessible action
  names, using the existing markup so the visual pass does not alter voice
  lifecycle behavior. The card gets separation through spacing and a darker
  surface rather than a new heavy border.
- **Validation:**
  - `./node_modules/.bin/prettier --check .` — pending after this entry.
  - `./node_modules/.bin/eslint . --max-warnings=0` — pending after this entry.
  - `./node_modules/.bin/vitest run` — pending after this entry.
  - `./node_modules/.bin/vite build` — pending after this entry.
  - In-app mock visual check at 1280×720 — passed; the connected card matches
    the requested compact status, leave, and three-action composition.
- **Documentation updated:** Updated `docs/architecture.md` and appended this
  canonical progress entry.
- **Known limitations:** The `pnpm` launcher and native `pnpm tauri build`
  remain affected by the documented host no-output stall; local-equivalent
  renderer checks are being run for this CSS-only change.
- **Next:** Finish local renderer validation, then continue the Plan 0034
  hosted two-client and installed macOS/Windows visual acceptance matrix.

## 2026-08-02 — Validate connected voice card polish

- **Completed:** Finalized the CSS-only connected voice card refinement and
  replaced the pending validation placeholders from the preceding entry with
  this append-only result.
- **Decisions:** No runtime or voice lifecycle code changed; the existing
  focused component contract remains sufficient for the visual-only update.
- **Validation:**
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.node.json` — passed.
  - `./node_modules/.bin/vitest run` — passed 86 files and 480 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 script tests.
  - `./node_modules/.bin/vite build` — passed; Vite's existing large-chunk
    warning remains non-blocking.
  - `node scripts/check-bundle-secrets.mjs` — passed for available bundle
    directories.
  - `git diff --check` — passed.
  - In-app mock visual check at 1280×720 — passed; the connected card matches
    the requested status, leave, and three-action composition.
- **Documentation updated:** Appended this canonical validation correction.
- **Known limitations:** The `pnpm` launcher and native `pnpm tauri build`
  remain affected by the documented host no-output stall; no new installed
  bundle is claimed.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Match the spacious active voice panel reference

- **Completed:** Reworked the signed-in active-call sidebar presentation to
  match the supplied reference: the connection card now uses a large Wi-Fi
  signal, responsive room/status hierarchy, and isolated warm danger leave
  action. Quality and backend-latency metadata remain available through the
  accessible status node, while camera, screen-share, and soundboard actions
  stay in the centered global call dock. The active user dock now scales its
  avatar, identity, mute/deafen, and Settings controls with the available
  sidebar width; active-call fallback avatars use the target square light
  treatment and muted controls use the target red-on-warm-surface treatment.
  Added focused regression assertions for the signal mark and active-call
  avatar behavior.
- **Decisions:** Used container-relative sizing so the compact existing
  sidebar remains usable while wider panels grow toward the reference's
  65–pixel avatar, 57–pixel controls, and 66–pixel signal. Kept the voice
  lifecycle/API contract unchanged and moved only the default visual emphasis
  away from secondary sidebar media controls; the global dock remains the
  interaction surface for those actions.
- **Validation:**
  - `./node_modules/.bin/prettier --check src/features/voice/SidebarVoicePanel.tsx src/features/voice/SidebarUserDock.tsx src/features/voice/SidebarVoicePanel.test.tsx src/features/voice/SidebarUserDock.test.tsx src/styles.css docs/architecture.md` — passed.
  - `./node_modules/.bin/eslint src/features/voice/SidebarVoicePanel.tsx src/features/voice/SidebarUserDock.tsx src/features/voice/SidebarVoicePanel.test.tsx src/features/voice/SidebarUserDock.test.tsx` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.node.json` — passed.
  - Focused `SidebarVoicePanel` and `SidebarUserDock` tests — passed 2 files and 6 tests.
  - `./node_modules/.bin/vitest run` — passed 86 files and 480 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 script tests.
  - `./node_modules/.bin/vite build` — passed; the existing large-chunk warning remains non-blocking.
  - `node scripts/check-bundle-secrets.mjs` — passed for available renderer/Tauri bundle directories.
  - `git diff --check` — passed.
  - In-app mock visual check at 1280×720 — passed; the active sidebar card is simplified to the signal/room/leave composition and the expanded user dock is aligned beneath it.
  - `pnpm check` — interrupted after approximately one minute with no output from the host pnpm wrapper; local equivalents above passed.
- **Documentation updated:** Updated `docs/architecture.md` and appended
  this entry to `docs/progress.md`.
- **Known limitations:** `pnpm tauri build` was not rerun for this
  renderer-only change because the host's native build phase remains the
  documented no-output stall; no new installed bundle is claimed. The
  installed macOS/Windows visual, voice, and multi-client acceptance gaps
  remain unchanged.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Revert settings/profile UI experiment (canonical handoff)

- **Completed:** Reverted the previous settings/profile visual experiment.
  Restored the temporary output warning banner and its eight-second
  auto-dismiss behavior, restored the cover-based profile popover, and removed
  the added settings-only output dismissal wiring.
- **Decisions:** Reverted only the last task's files and documentation changes;
  unrelated existing redesign work remains untouched. The append-only history
  entries describing the experiment remain in place, with this entry recording
  the correction.
- **Validation:**
  - Focused profile, settings, and voice tests — passed 4 files and 107 tests.
  - Focused Prettier checks — passed.
  - Focused ESLint checks — passed.
  - git diff --check — passed.
  - Renderer and node TypeScript checks — passed.
- **Documentation updated:** Restored the architecture and Plan 0034 text to
  their pre-experiment behavior and appended this canonical revert entry.
- **Known limitations:** The broader repository remains in its pre-existing
  dirty state; no unrelated changes were reset.
- **Next:** Continue the existing Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Finalize settings/profile redesign pass

- **Completed:** Final working-tree validation confirms the selected-speaker
  error is owned by Audio & Video settings with an inline dismiss action, and
  member profile popovers use the new solid, avatar-led presentation.
- **Decisions:** No additional runtime or scope changes after the settings
  dismissal follow-up; the room remains free of the old output banner.
- **Validation:**
  - Focused profile, settings, and voice tests — passed 4 files and 108 tests.
  - Full Vitest — passed 86 files and 481 tests.
  - Prettier, ESLint, renderer/node TypeScript, Vite build, script tests,
    secret scan, and `git diff --check` — passed.
- **Documentation updated:** This final chronological progress entry was
  appended; architecture and Plan 0034 already contain the updated behavior.
- **Known limitations:** `pnpm tauri build` remains interrupted by the
  host's no-output native build stall; no installed bundle is claimed.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Revert spacious active voice panel reference

- **Completed:** Reverted the previous reference-pass UI change after it
  caused layout regressions. Restored the compact connected voice card,
  visible quality and media controls, original sidebar spacing, small user
  avatar, and presence indicator. Removed only the reference-pass CSS,
  JSX, focused assertions, and matching architecture wording; unrelated
  working-tree changes remain untouched.
- **Decisions:** Kept the existing voice lifecycle, status labels, handlers,
  and global dock behavior unchanged. The earlier reference implementation is
  retained as historical context in the append-only log, while this correction
  records the current source of truth.
- **Validation:**
  - Focused `SidebarVoicePanel` and `SidebarUserDock` tests — passed 2 files and 6 tests.
  - `./node_modules/.bin/prettier --check src/features/voice/SidebarVoicePanel.tsx src/features/voice/SidebarUserDock.tsx src/features/voice/SidebarVoicePanel.test.tsx src/features/voice/SidebarUserDock.test.tsx src/styles.css docs/architecture.md docs/progress.md` — passed.
  - `./node_modules/.bin/eslint src/features/voice/SidebarVoicePanel.tsx src/features/voice/SidebarUserDock.tsx src/features/voice/SidebarVoicePanel.test.tsx src/features/voice/SidebarUserDock.test.tsx` — passed.
  - `./node_modules/.bin/tsc --noEmit --pretty false` — passed.
  - `./node_modules/.bin/vite build` — passed; the existing large-chunk warning remains non-blocking.
  - `./node_modules/.bin/vitest run` — passed 86 files and 480 tests.
  - `node --test scripts/*.test.mjs` — passed 44/44 script tests.
  - `node scripts/check-bundle-secrets.mjs` — passed for available renderer/Tauri bundle directories.
  - `git diff --check` — passed.
- **Documentation updated:** Restored the compact voice-panel contract in
  `docs/architecture.md` and appended this correction to `docs/progress.md`.
- **Known limitations:** `pnpm tauri build` was not rerun for this
  renderer-only revert because the host's native build phase remains the
  documented no-output stall; no new installed bundle is claimed.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Revert settings/profile UI experiment (final handoff)

- **Completed:** Reverted the previous settings/profile visual experiment.
  Restored the temporary output warning banner and its eight-second
  auto-dismiss behavior, restored the cover-based profile popover, and removed
  the added settings-only output dismissal wiring.
- **Decisions:** Reverted only the last task's files and documentation changes;
  unrelated existing redesign work remains untouched. Earlier experiment
  entries remain in the append-only history, with this entry recording the
  correction at handoff.
- **Validation:**
  - Focused profile, settings, and voice tests — passed 4 files and 107 tests.
  - Focused Prettier checks — passed.
  - Focused ESLint checks — passed.
  - git diff --check — passed.
  - Renderer and node TypeScript checks — passed.
- **Documentation updated:** Restored the architecture and Plan 0034 text to
  their pre-experiment behavior and appended this final revert entry.
- **Known limitations:** The broader repository remains in its pre-existing
  dirty state; no unrelated changes were reset.
- **Next:** Continue the existing Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Validate settings/profile rollback

- **Completed:** Verified the reverted settings/profile behavior against the
  full renderer test and production build paths.
- **Decisions:** Kept the rollback scoped to the prior settings/profile
  experiment; no unrelated dirty-tree changes were reset.
- **Validation:**
  - Full Vitest — passed 86 files and 480 tests.
  - node script tests — passed 44/44.
  - Vite production build — passed; the existing large-chunk warning remains
    non-blocking.
  - Renderer and node TypeScript checks — passed.
  - Full Prettier-equivalent check on the changed files — passed.
  - Focused ESLint checks — passed.
  - Bundle secret scan — passed for available bundle directories.
  - git diff --check — passed.
  - pnpm format:check, pnpm lint, and pnpm typecheck — interrupted after
    repeated host-side no-output stalls; local repository binaries passed the
    equivalent checks.
- **Documentation updated:** Appended this validation entry to
  docs/progress.md.
- **Known limitations:** pnpm tauri build remains unverified because the host
  stalls before native build output; no installed bundle is claimed.
- **Next:** Continue the Plan 0034 hosted two-client and installed
  macOS/Windows visual acceptance matrix.

## 2026-08-02 — Titlebar, space motion, and circular voice-room polish

- **Completed:** Removed rotating titlebar copy and moved the sidebar toggle to
  the leading platform-safe area; simplified Personal and Bakbak call status;
  removed server channel-header dividers; added directional 230 ms space
  transitions; and replaced the voice gallery with accessible solo, cluster,
  orbit, and overflow circular layouts. Circular participants retain animated
  profiles, camera focus/back, profile and context actions, remote volume,
  simultaneous speaking/LIVE rings, orphan-share access, and blended
  soundboard activity.
- **Decisions:** Kept one live application and voice tree while animating only
  destination presentation; kept the global voice dock as the sole default
  media-control surface; derived LIVE from an owned screen share without wire
  changes; and retained the existing focused media stage for camera/share
  watching. Reduced motion disables the new movement and animated rings.
- **Validation:**
  - Focused Plan 0035 Vitest suite — passed 7 files and 67 tests.
  - `pnpm test` — passed 86 Vitest files / 485 tests and 44/44 node contract
    tests.
  - `pnpm build` — passed renderer/node TypeScript checks and the Vite
    production build; the existing large-chunk warning remains non-blocking.
  - Direct Prettier, ESLint, renderer TypeScript, and node TypeScript checks —
    passed.
  - Standalone `pnpm format:check`, `pnpm lint`, and the first standalone
    `pnpm typecheck` attempts — interrupted after host-side no-output stalls;
    their direct repository binaries passed, and `pnpm build` subsequently ran
    the same `pnpm typecheck` script successfully.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist` and the
    available generic and Apple Silicon Tauri bundle directories.
  - `git diff --check` — passed.
  - In-app browser at 1280×800 and 1024×680 — passed for blank titlebar,
    leading collapse control, divider removal, three-person circular cluster,
    keyboard details, stable active call, and both directional space states;
    browser console contained no warnings or errors.
  - `pnpm tauri build` — interrupted after 60 seconds with no output from the
    host-side native build path; no installed bundle is claimed.
- **Documentation updated:** Added Plan 0035, linked its implementation from
  the v1 plan, updated the renderer architecture contract, updated the shell
  contract test, and appended this progress entry.
- **Known limitations:** The complete installed macOS/Windows, two-client,
  reduced-motion, light/dark, hidden/minimum/maximum sidebar, and 1/2/4/5/10
  participant visual matrix remains pending. The native build could not be
  verified on this host because it stalled before emitting build output.
- **Next:** Complete the remaining Plan 0035 installed visual matrix alongside
  the existing Plan 0034 multi-client and platform acceptance work.

## 2026-08-02 — Refine Activity and reversible circular voice controls

- **Completed:** Increased Activity rows to 46 px with 38 px avatars, wider
  gaps, bold online names, and clearer online cover art while preserving quiet
  offline treatment. Removed the current-user dock cover and reduced the dock
  to 56 px. Roughly doubled solo/cluster participant circles, replaced the
  avatar-obscuring hover card with an external tooltip-style action popover,
  and added a circular expanded participant stage with identity, microphone,
  profile, LIVE, and 0–200% volume controls.
- **Decisions:** Kept the underlying participant/share focus state and LiveKit
  wire contracts unchanged. A normal primary circle expands its participant;
  a LIVE primary circle opens the owned share directly; explicit popover
  actions expose both paths. Clicking expanded participant media or focused
  share media returns to people. LIVE keeps a visual badge but uses a static
  red ring with no pulse/glow animation. Range input now uses React's change
  path and remains isolated from media/profile activation.
- **Validation:**
  - Focused ChannelSidebar, SidebarUserDock, and VoiceRoom Vitest suite —
    passed 3 files and 46 tests.
  - `pnpm test` — passed 86 Vitest files / 485 tests and 45/45 node contract
    tests.
  - Direct renderer and node TypeScript checks — passed; `pnpm build` also ran
    the same nested `pnpm typecheck` successfully.
  - `pnpm build` — passed the production renderer build; the existing
    large-chunk warning remains non-blocking.
  - Direct Prettier and ESLint checks — passed.
  - `node scripts/set-version.mjs --check` — passed at synchronized version
    1.5.1.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist` and the
    available generic and Apple Silicon Tauri bundle directories.
  - `git diff --check` — passed.
  - In-app mock browser at 1280×720 — passed for larger Activity rows, compact
    cover-free user dock, three-person cluster, keyboard-revealed action
    popover and per-action tooltip, participant expansion/click-back, and live
    volume output changes; browser console contained no warnings or errors.
  - Standalone `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and
    `pnpm version:check` attempts — interrupted after host-side no-output
    stalls; their direct repository commands passed, and `pnpm build` verified
    the typecheck script.
  - `pnpm tauri build` — interrupted after 60 seconds with no output from the
    host-side native build path; no installed bundle is claimed.
- **Documentation updated:** Updated the renderer architecture contract, Plan
  0035 accepted behavior, the active v1 plan, the shell contract tests, and
  this canonical progress log.
- **Known limitations:** Real two-client listener-volume perception, LIVE
  capture/watch, installed macOS/Windows behavior, and the complete Plan 0035
  light/dark/resolution/participant-count matrix still require human
  acceptance. The native build remains blocked by the existing host-side
  no-output stall.
- **Next:** Run the remaining Plan 0035 two-client installed acceptance matrix,
  paying particular attention to pointer-driven 0–200% gain and repeated
  participant/share enter-return navigation.

## 2026-08-02 — Simplify LIVE activation and restore sidebar shortcuts

- **Completed:** Removed participant expansion and its action, made non-LIVE
  profile/camera circles passive, and kept LIVE circles/badges as the sole
  direct share-focus targets. Moved the participant action tooltip above its
  circle with a larger pointer bridge and slower dismissal. Removed Back and
  fullscreen controls plus the renderer voice-fullscreen implementation; the
  focused share media now returns directly to people. Restored camera,
  screen-share, and soundboard shortcuts to both sidebar call cards, aligned
  the room timer to a clearer trailing slot, changed LIVE to a compact solid-red
  badge, and limited the directional space transition to sidebar contents below
  the stationary switch with a 345 ms duration.
- **Decisions:** Preserved the existing LiveKit share subscription, profile,
  context-menu, GIF, soundboard overlay, and 0–200% listener-gain contracts.
  LIVE remains derived only from owned screen share. The global dock remains
  the complete call surface while the sidebar intentionally duplicates the
  three discovery-friendly media actions.
- **Validation:**
  - Focused App, ChannelSidebar, PersonalSidebar, SidebarVoicePanel,
    VoiceRoom, and ScreenShareStage Vitest suite — passed 6 files and 60 tests.
  - Full Vitest — passed 85 files and 478 tests.
  - Node contract suite — passed 45/45.
  - Direct Prettier, ESLint, renderer TypeScript, and node TypeScript checks —
    passed.
  - `node scripts/set-version.mjs --check` — passed at synchronized version
    1.5.1.
  - Direct Vite production build — passed; the existing large-chunk warning
    remains non-blocking.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist` and the
    available generic and Apple Silicon Tauri bundle directories.
  - `git diff --check` — passed.
  - In-app mock browser at 1280×720 — passed for restored sidebar actions,
    passive non-LIVE media, above-avatar keyboard tooltip and profile action,
    keyboard listener-volume changes, trailing timer treatment, and both
    sidebar-only directions with a stationary switch/header/canvas.
  - Standalone `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and
    `pnpm version:check` attempts — interrupted after repeatable host-side
    no-output stalls; their exact direct repository commands passed.
  - Direct Tauri build — interrupted after roughly 70 seconds after only
    reporting its installed-package version lookup; no installed bundle is
    claimed.
- **Documentation updated:** Updated Plan 0035, the active v1 plan, the
  renderer architecture contract, and this canonical progress log.
- **Known limitations:** Real two-client pointer-driven listener gain, camera,
  LIVE capture/watch/media-return, installed macOS/Windows behavior, and the
  complete light/dark/resolution/sidebar-width/participant-count matrix still
  require human acceptance. The browser tool validated keyboard range changes
  but could not synthesize a reliable range-pointer drag. The native build
  remains blocked by the host-side package-lookup stall.
- **Next:** Complete the remaining Plan 0035 installed two-client acceptance
  matrix, prioritizing LIVE share activation, pointer volume perception, and
  reduced-motion/sidebar-width combinations.

## 2026-08-02 — Harden cross-platform screen-audio self-exclusion

- **Completed:** Audited the complete renderer/native screen-share path and
  confirmed the original macOS display filter and Windows WebView2
  `ExcludeProcessTree` implementation remain present. Closed an application
  capture gap on both platforms by rejecting a selected tree when it contains
  Bakbak, is contained by Bakbak, or cannot be proven disjoint. Windows now
  exposes those unsafe application sources as video-only in the picker. macOS
  additionally verifies that ScreenCaptureKit accepted current-app audio
  exclusion before starting native audio and otherwise retries video-only.
  Corrected macOS diagnostics from the Windows-specific WebView2 label to
  `exclude-bakbak-process-tree`, and added an OS-independent source contract
  covering both native policies plus the renderer's audio-free fallback.
- **Decisions:** Isolation remains fail-closed: no failure or unknown ancestry
  falls back to unrestricted system loopback. Entire-screen Windows capture
  still excludes the proven WebView2 browser root, macOS display capture still
  combines the Bakbak application filter with current-app audio exclusion, and
  application capture includes only a tree proven disjoint from Bakbak. No
  Supabase, LiveKit token, RLS, database, or public renderer contract changed.
- **Validation:**
  - Focused renderer screen-share suite — passed 3 files and 60 tests.
  - Cross-platform source isolation contract — passed 3/3.
  - Native macOS Cargo suite — passed 20/20 tests, including the actual
    ScreenCaptureKit exclusion configuration and bidirectional tree policy.
  - Full Vitest — passed 85 files and 478 tests.
  - Full Node contract suite — passed 48/48.
  - Direct Prettier, Rustfmt, ESLint, renderer TypeScript, node TypeScript, and
    locked native macOS Cargo checks — passed.
  - `node scripts/set-version.mjs --check` — passed at synchronized version
    1.5.1.
  - Direct Vite production build — passed; the existing large-chunk warning
    remains non-blocking.
  - `cargo build --locked --release --manifest-path src-tauri/Cargo.toml` —
    passed the optimized native macOS build.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist` and the
    available generic and Apple Silicon Tauri bundle directories.
  - `git diff --check` — passed.
  - Windows cross-target Cargo check on macOS — failed before Bakbak compiled
    because the host lacks MSVC `lib.exe` and Windows CRT headers; the existing
    changed-native-files Windows CI gate remains required.
  - Direct Tauri bundle attempts with normal and CI/update-skip environments —
    interrupted after the host stalled at its installed-package version lookup;
    the direct optimized Cargo build passed, but no fresh bundle is claimed.
- **Documentation updated:** Updated the architecture contract, plans 0030 and
  0032, the active v1 plan, and this canonical progress log.
- **Known limitations:** Automated checks prove policy selection, fail-closed
  transitions, renderer routing, and the native macOS configuration, but they
  cannot prove what reaches another person's speakers. The installed muted-
  presenter two-client test remains mandatory on macOS and Windows, including
  Entire screen, Application, stop/restart, and explicitly selected output.
- **Next:** Run the Windows native CI job, then complete the installed
  two-client matrix with the presenter microphone muted so digital loopback is
  measured separately from ordinary speaker-to-microphone echo.

## 2026-08-02 — Repair tooltip participant attenuation and boost

- **Completed:** Repaired the circular participant tooltip's listener-volume
  path at both boundaries. Pointer movement now uses the range control's native
  continuous `input` event. Remote audio now waits for LiveKit to attach the
  concrete stream before creating its gain source, prefers a direct
  `MediaStreamAudioSourceNode`, and keeps the companion LiveKit element muted at
  zero volume so `Room.startAudio()` cannot create an unscaled duplicate path.
  Engines that reject the stream source retry the limited media-element graph;
  engines without a usable graph retain the existing direct 0–100% fallback.
- **Decisions:** Kept participant identity, LiveKit wire data, the listener-local
  session map, selected-output monitor, soundboard/share multiplication, and
  shared limiter unchanged. The repair belongs in the listener renderer rather
  than sender gain: every listener can independently attenuate or boost the
  same friend, and no preference is published to the room.
- **Validation:**
  - Focused tooltip/hook/remote-audio/gain Vitest suite — passed 4 files and
    98/98 tests, including native range input, participant-identity propagation,
    attached-stream ordering, 40% attenuation, 175% boost, duplicate-route
    suppression, mute restoration, and element/direct fallbacks.
  - `pnpm test` — passed 85 Vitest files / 481 tests and 48/48 Node contract
    tests.
  - `pnpm build` — passed both strict TypeScript projects and the production
    Vite build; the existing large-chunk warning remains non-blocking.
  - Direct full-repository Prettier and zero-warning ESLint checks — passed.
  - Direct renderer and Node TypeScript checks — passed; `pnpm build` also ran
    the repository's exact `pnpm typecheck` script successfully.
  - `node scripts/set-version.mjs --check` — passed at synchronized version
    1.5.1.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist` and the
    available generic and Apple Silicon Tauri bundle directories.
  - `git diff --check` — passed.
  - Standalone `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` attempts —
    interrupted after the existing host-side no-output stalls; their exact
    direct repository binaries passed, and `pnpm build` independently verified
    the typecheck script.
  - `pnpm tauri build` — interrupted after roughly one minute with no build
    output from the existing host-side stall; no fresh installed bundle is
    claimed.
- **Documentation updated:** Updated the remote-audio architecture contract,
  plans 0030, 0033, and 0035, the active v1 phase, and this canonical progress
  log.
- **Known limitations:** Automated tests prove event delivery and the actual
  stream/gain-node values, but this host cannot impersonate a second person's
  ears. Installed macOS and Windows clients still need the planned two-client
  0%, 40%, 100%, 150%, and 200% perception check, including selected-output,
  deafen/recovery, watched-share, and soundboard cases. The direct compatibility
  fallback intentionally cannot boost above the media element's 100% ceiling.
- **Next:** Build the same revision on macOS and Windows and run the installed
  two-client participant-volume matrix before closing Packet D's listening
  acceptance gate.

## 2026-08-02 — Make desktop updates recoverable

- **Completed:** Replaced the startup notice's one-shot 15-second updater call
  with one app-wide update provider shared by the global notice and Settings.
  Checks now allow 60 seconds, retry twice after bounded two- and five-second
  delays, prevent overlapping requests, classify offline/timeout/service
  failures without exposing raw errors, and persist only the last successful
  check time. Added an Updates settings section with installed and available
  versions, manual checks, visible status and retry count, signed download
  progress, install retry, a GitHub Releases fallback, and copyable privacy-safe
  diagnostics. Update downloads now receive a ten-minute ceiling.
- **Decisions:** Kept the automatic global notice as the normal path and made
  Settings the recovery path instead of creating two independent updater
  clients. Diagnostics contain only public app/build versions, bounded updater
  state and timestamps, retry counts, and online status; account data,
  messages, credentials, raw request failures, and response bodies are excluded.
  Existing `1.6.0` and older installations cannot receive this renderer logic
  remotely, so users whose old 15-second check keeps timing out need a manual
  installer or one successful fast check before future updates become
  recoverable in-app.
- **Validation:**
  - Focused updater and Settings Vitest — passed 3 files and 34/34 tests,
    covering desktop/browser startup behavior, 60-second request options,
    three-attempt timeout recovery, successful-check persistence, release-page
    fallback, signed install invocation, and sanitized diagnostics.
  - `pnpm test` — passed 86 Vitest files / 484 tests and 48/48 Node contract
    tests.
  - Direct full-repository Prettier and zero-warning ESLint checks — passed.
  - Direct renderer and Node TypeScript checks — passed; `pnpm build` also ran
    the repository's exact `pnpm typecheck` script successfully.
  - `pnpm build` — passed strict typechecking and the production Vite build;
    the existing large-chunk warning remains non-blocking.
  - `cargo check --locked --manifest-path src-tauri/Cargo.toml` — passed.
  - `node scripts/set-version.mjs --check` — passed at synchronized version
    1.6.0.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist` and the
    available generic and Apple Silicon Tauri bundle directories.
  - In-app browser mock QA — passed entry into Preview, Settings navigation,
    Updates-panel content and accessible controls, desktop-only browser state,
    and a clean warning/error console.
  - `git diff --check` — passed.
  - Standalone `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` attempts —
    interrupted after repeated no-output package-manager stalls; their exact
    direct binaries passed, and `pnpm build` independently completed the exact
    typecheck script.
  - `pnpm tauri build` — interrupted after 60 seconds of the existing no-output
    host-side stall; no fresh installed or updater-signed bundle is claimed.
- **Documentation updated:** Updated the desktop updater runtime contract in
  `docs/architecture.md`, marked the updater-recovery scope complete in the
  active desktop-v1 plan, and appended this canonical entry.
- **Known limitations:** The signed updater flow still requires the protected
  CI signing key and installed macOS/Windows validation. Browser mock mode can
  verify layout and desktop-only messaging but cannot call the native updater.
  Already-installed clients through `1.6.0` retain the old 15-second one-shot
  check until they install the fixed release.
- **Next:** Publish the next patch release, provide its manual GitHub installer
  link to friends who do not receive the old startup popup, then validate
  automatic and manual `1.6.1 -> later patch` updates on installed Apple Silicon
  macOS and Windows x64 clients.

## 2026-08-09 — Replace Tauri with an Electron prototype

- **Completed:** Removed the Rust workspace, Cargo configuration, Tauri source,
  capabilities, plugins, and package dependencies. Added a hardened Electron
  main/preload boundary with a sandboxed renderer, secure `app://bakbak`
  protocol, typed narrow bridge, native window/accent/link/update controls,
  Chromium screen-source selection, and Electron updater lifecycle. Moved
  screen-share publication to renderer-owned LiveKit tracks while keeping its
  short-lived token out of the main process. Added electron-builder DMG/ZIP and
  NSIS packaging for Apple Silicon macOS and Windows x64, Electron YAML update
  metadata, signed legacy Tauri manifest generation, compiled-bundle secret
  scanning, and Electron-only PR/candidate/release workflows. Added a Windows
  NSIS shim that keeps `%LOCALAPPDATA%\Bakbak`, translates Tauri's passive and
  restart arguments, and removes its obsolete uninstaller/registry material.
  The first public Electron release is gated on an explicit installed migration
  rehearsal.
- **Decisions:** Preserved `com.bakbak.desktop`, product/release identity,
  macOS 12.3 minimum, Apple Silicon and Windows x64 targets, and the existing
  GitHub latest-release endpoint. Kept the old Tauri minisign key only in pinned
  release tooling so installed Tauri clients can verify the transition payload;
  no Rust or Tauri runtime ships. macOS uses `Bakbak.app`, while Windows retains
  `bakbak.exe` for the legacy install path. Electron does not attempt a brittle
  WebView2-to-Chromium local-storage copy; cloud data stays authoritative and a
  one-time sign-in is acceptable. Native process-tree screen-audio isolation was
  not claimed after moving capture to Chromium.
- **Validation:**
  - Direct Prettier check — passed for every tracked supported file after
    resolving one non-idempotent multiline Markdown code span.
  - Direct zero-warning ESLint — passed.
  - Direct renderer, Node/Vite, and Electron TypeScript checks — passed.
  - Direct Vitest — passed 85 files / 481 tests.
  - Direct Node contract suite — passed 49/49 tests, including packaging,
    architecture, workflow, updater-manifest, and Windows migration-shim
    contracts.
  - `node scripts/set-version.mjs --check` — passed at tracked version `1.6.0`.
  - Direct Vite production build — passed; the existing 1.46 MB application and
    1.93 MB RNNoise worklet chunk warnings remain non-blocking.
  - `pnpm check` — passed once after the core migration at 85/481 Vitest and
    47/47 Node tests. The final rerun hit the existing package-manager
    no-output stall and was stopped after 60 seconds; every exact underlying
    formatter, linter, three-project typecheck, 85/481 Vitest, expanded 49/49
    Node, version, production-build, and secret-scan command passed afterward.
  - `pnpm desktop:build` — passed the initial Apple Silicon Electron package.
    The final direct electron-builder rebuild passed with `Bakbak.app`, one
    129 MB DMG, one 145 MB ZIP, blockmaps, and `latest-mac.yml`.
  - Direct electron-builder Windows cross-package — passed with a 107 MB NSIS
    installer, blockmap, and `latest.yml`; `file` confirmed the packaged app is
    PE32+ x86-64. The first NSIS compile exposed a missing LogicLib include; it
    was fixed and the exact build then exited successfully.
  - `codesign --verify --deep --strict` — passed for the ad-hoc hardened ARM64
    `Bakbak.app`; `file` confirmed its main executable is Mach-O arm64.
  - Legacy macOS updater archive inspection — passed with one top-level
    `Bakbak.app`; the pinned Tauri updater source confirms it strips that first
    component before replacing the existing bundle path.
  - Packaged launch smoke — Electron loaded the renderer and began its updater
    check without a main/renderer crash. The check returned the expected 404
    because the current published Tauri release has `latest.json` but no
    Electron `latest-mac.yml` yet.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist`,
    `electron-dist`, and both packaged release trees.
  - `git diff --check` — passed.
  - GitHub-hosted PR/candidate/release matrices — skipped because this local
    task did not push or dispatch workflows.
  - Installed Tauri-to-Electron and later Electron update rehearsals — skipped;
    they require real installed Apple Silicon macOS and Windows x64 clients plus
    a signed staged release newer than the current Tauri tag.
- **Documentation updated:** Updated `AGENTS.md`, `README.md`, the architecture
  source of truth, the active desktop-v1 plan, and this canonical progress log
  for the Electron boundary, commands, distribution bridge, release gate, and
  accepted limitations.
- **Known limitations:** The compatibility artifacts and both native installers
  compile, but the updater handoff is not accepted until installed clients prove
  `Tauri -> first Electron -> later Electron` on both platforms. Current macOS
  output is ad-hoc signed and unnotarized; Windows output is unsigned, so
  Developer ID/notarization and Windows code signing remain production
  blockers. Existing users may need one sign-in after Chromium takes over local
  storage. Chromium capture no longer proves the former native process-tree
  audio isolation, so echo and source-audio behavior need the installed matrix.
  The local `1.6.0` prototype is below the currently published Tauri release and
  must never be published as-is; the release workflow will resolve a newer
  version once the migration gate opens.
- **Next:** Run the Electron PR and stabilization-candidate matrices on GitHub,
  inspect both exact-revision artifacts, configure production OS signing, then
  rehearse the signed latest-Tauri-to-Electron-to-Electron sequence with
  rollback/manual recovery on real Apple Silicon macOS and Windows x64 clients.
  Set `ELECTRON_MIGRATION_REHEARSED=true` and publish only after that matrix
  passes.

## 2026-08-09 — Fix local Electron development startup

- **Completed:** Bound the Vite development server explicitly to
  `127.0.0.1:1420` and changed `desktop:dev` to wait for that TCP listener
  before starting Electron. Added a contract test that keeps the Vite host,
  readiness check, and Electron development URL aligned.
- **Decisions:** Kept the existing IPv4 development origin trusted by the main
  process. An explicit loopback bind is deterministic across macOS hosts where
  `localhost` may otherwise bind only to IPv6 and leave the Electron launcher
  waiting forever on `127.0.0.1`.
- **Validation:**
  - Reproduced the original startup state — Vite listened only on IPv6
    `[::1]:1420`, while `wait-on http://127.0.0.1:1420` remained blocked and no
    Electron process started.
  - Corrected `pnpm desktop:dev` smoke — passed: Vite listened on IPv4
    `127.0.0.1:1420`; the readiness gate advanced; and the Electron main, GPU,
    network, renderer, audio, and video-capture processes stayed alive.
  - Direct Prettier and zero-warning ESLint checks — passed.
  - Direct renderer, Node/Vite, and Electron TypeScript checks — passed.
  - Direct Vitest — passed 85 files / 481 tests.
  - Direct Node contract suite — passed 50/50 tests, including the new aligned
    desktop-development-origin contract.
  - `node scripts/set-version.mjs --check` — passed at version `1.6.1`.
  - Direct Vite production build — passed; the existing large-chunk warnings
    remain non-blocking.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist`,
    `electron-dist`, and `release`.
  - `git diff --check` — passed.
- **Documentation updated:** Updated the Electron shell development-origin
  contract in `docs/architecture.md` and this canonical progress log.
- **Known limitations:** None for local desktop startup; production signing and
  installed updater-migration rehearsals remain tracked by the migration entry
  above.
- **Next:** Continue the Electron PR and installed updater-migration validation.

## 2026-08-09 — Redesign authentication welcome

- **Completed:** Replaced the small floating authentication card with a
  responsive two-part Bakbak welcome: a honey-to-teal private-room story and a
  focused sign-in/invite panel. Added field icons, explicit password
  visibility, accessible tab semantics, compact invite density, a narrow-window
  form-only layout, and regression coverage for live and mock flows.
- **Decisions:** Kept all authentication service behavior, browser autofill,
  native validation, invite-only messaging, and navigation-free desktop chrome
  unchanged. Removed transformed form ancestors and overflow-producing
  decorative nodes so Electron validation UI stays anchored and neither login
  mode creates hidden scrollbars.
- **Validation:**
  - Direct Prettier and zero-warning ESLint checks — passed.
  - Direct renderer, Node/Vite, and Electron TypeScript checks — passed.
  - Direct Vitest — passed 86 files / 483 tests, including new live-mode tab,
    password-visibility, invite-field, and credential-free mock-entry coverage.
  - Direct Node contract suite — passed 50/50 tests.
  - `node scripts/set-version.mjs --check` — passed at version `1.6.1`.
  - Direct Vite production build — passed; the existing large-chunk warnings
    remain non-blocking.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist`,
    `electron-dist`, and `release`.
  - Local browser visual checks — passed at the default 1280×720 viewport for
    sign-in and the denser invite form, and at 760×720 for the form-only
    breakpoint. DOM measurements confirmed zero horizontal or vertical page
    overflow, and the password textbox retained the concise accessible name.
  - `git diff --check` — passed.
- **Documentation updated:** Updated the current authentication experience in
  `docs/architecture.md` and this canonical progress log.
- **Known limitations:** None identified for the redesigned authentication
  surface.
- **Next:** Continue the Electron PR and installed updater-migration validation.

## 2026-08-09 — Simplify entry and loading surfaces

- **Completed:** Reworked the authentication redesign into the signed-in app's
  minimal rail-and-canvas geometry, removing the marketing headline, feature
  list, fake member activity, security topline, and duplicate privacy footer.
  Replaced the full-screen animated word scene with the same quiet shell and one
  bounded progress cue. Made the navigation-free titlebar transparent over the
  entry gradient so its color belongs to the page like the main app.
- **Decisions:** Reused the server shell's 280 px rail, 8 px outer inset,
  16 px rounded canvas, honey-to-teal gradient, and dark/light conversation
  colors. Kept authentication fields, invite switching, password visibility,
  autofill, validation, and service behavior unchanged.
- **Validation:**
  - Direct Prettier and zero-warning ESLint checks — passed.
  - Direct renderer, Node/Vite, and Electron TypeScript checks — passed.
  - Direct Vitest — passed 86 files / 483 tests, including the revised loading
    structure, entry-surface frame state, and minimal authentication flows.
  - Direct Node contract suite — passed 50/50 tests, including the new shared
    rail/canvas loading geometry and bounded-motion contracts.
  - `node scripts/set-version.mjs --check` — passed at version `1.6.1`.
  - Direct Vite production build — passed; the existing large-chunk warnings
    remain non-blocking.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist`,
    `electron-dist`, and `release`.
  - Local browser visual checks — passed for desktop sign-in, desktop invite,
    the 760×720 compact breakpoint, and the transient loading scene. They also
    caught and corrected inherited flex alignment that initially shrank the
    loading canvas; final DOM measurements showed zero page overflow.
  - `git diff --check` — passed.
- **Documentation updated:** Updated the current entry, loading, and titlebar
  contract in `docs/architecture.md` and appended this correction to the
  canonical progress log.
- **Known limitations:** None identified for the simplified entry surfaces.
- **Next:** Continue the Electron PR and installed updater-migration validation.

## 2026-08-09 — Add per-space sidebar themes

- **Completed:** Added independent, account-scoped Personal and Bakbak sidebar
  themes with solid or three-color gradient modes, darker/lighter adjustment,
  bounded transparency, none/dots/grain texture, live previews, and per-space
  reset. Added a focus-trapped one-time post-login setup prompt with Skip and
  Save actions, then reused the same editor in Settings → Appearance.
- **Decisions:** Kept preferences device-local under
  `bakbak.sidebarThemes.v1:<user ID>` so accounts sharing a machine do not
  inherit each other's choices. Skip records completion with defaults, and the
  parser restores safe per-space defaults for corrupt or out-of-range values.
  User colors affect the sidebar/titlebar background only; fixed semantic
  space accents continue to protect control contrast.
- **Validation:**
  - `pnpm check` — passed formatting, zero-warning lint, renderer/Node/Electron
    typechecks, all tests, version check, production renderer build, and bundle
    secret scan.
  - `pnpm test` — passed 87 Vitest files / 487 tests and 50/50 Node contract
    tests, including per-account persistence, malformed-value recovery,
    gradient generation, Settings interaction, and one-time Skip coverage.
  - Local browser visual and interaction checks — passed at 1280×800 for the
    onboarding prompt, independent Bakbak/Personal tabs, dots on the live
    Personal sidebar/titlebar, immediate Save application, and the reusable
    Appearance Settings editor.
  - `git diff --check` — passed.
- **Documentation updated:** Updated `docs/architecture.md`, the active v1 plan,
  appearance source-contract tests, and this canonical progress log.
- **Known limitations:** Sidebar themes intentionally do not sync between
  devices. Installed macOS/Windows visual observation remains part of the
  broader Electron acceptance matrix.
- **Next:** Continue the Electron PR and installed updater-migration validation.

## 2026-08-09 — Refine the sidebar picker and native transparency

- **Completed:** Replaced the compact hex-box color controls with an Arc-like
  dotted blend field containing three click-to-recolor, pointer-draggable color
  points. Added keyboard point movement, darker/lighter shortcuts, and eight
  one-click presets below the field. Gradient point placement now determines
  direction and the middle stop. Repaired the transparency path through the
  renderer document, Electron BrowserWindow, macOS under-window vibrancy, and
  Windows Mica.
- **Decisions:** Kept old `bakbak.sidebarThemes.v1:<user ID>` records compatible
  by supplying bounded default point positions when the new field is absent.
  Native material is enabled only in Electron; browser/mock mode retains an
  opaque underlay. Windows keeps its frameless requirement for transparent
  windows, and Mica remains available only where Electron supports it.
- **Validation:**
  - `pnpm check` — passed formatting, zero-warning lint, renderer/Node/Electron
    typechecks, full tests, version check, production renderer build, and bundle
    secret scan.
  - `pnpm test` — passed 88 Vitest files / 489 tests and all 50 Node contract
    tests.
  - Focused renderer tests — passed for preset application, three color inputs,
    Alt+Arrow point movement, malformed-point fallback, directional gradient
    generation, and 45% transparency alpha.
  - Focused Node contracts — passed for native renderer material selection,
    transparent Electron window configuration, macOS vibrancy, Windows Mica,
    and the new picker source contract.
  - Local browser visual checks — passed at 1280×800 in both first-login and
    Settings layouts; all color points, presets, controls, Skip, and Save remain
    visible in onboarding, with internal scrolling retained in Settings.
- **Documentation updated:** Updated the current native-material and picker
  contracts in `docs/architecture.md`, the active v1 plan, and this log.
- **Known limitations:** Browser QA cannot display a native desktop backdrop.
  The Electron process must be fully restarted to observe the BrowserWindow
  transparency change; installed macOS/Windows material observation remains in
  the distribution acceptance matrix.
- **Next:** Restart the desktop app, visually confirm backdrop visibility on a
  supported native host, then continue updater-migration validation.

## 2026-08-09 — Normalize larger voice-call layouts

- **Completed:** Removed the five-to-ten-person orbit and its absolute
  coordinate generation. Calls now keep the existing centred solo and
  two-to-four-person overlap layouts, use a normal centred wrapping row for
  five to ten people, and retain a denser wrapping fallback above ten.
  Increased every participant-circle size clamp by exactly 20% at regular and
  compact breakpoints, including the former orbit sizing now used by the
  five-to-ten-person row.
- **Decisions:** Kept participant media, LIVE/speaking rings, hover and keyboard
  controls, volume, sound activity, and screen-share behavior unchanged. Kept
  a separate dense layout above ten so very large calls do not inherit the
  roomier five-to-ten sizing.
- **Validation:**
  - Focused Prettier check of all eight changed implementation, regression,
    architecture, plan, and progress files — passed.
  - `vitest run src/features/voice/VoiceRoom.test.tsx` — passed 1 file / 30
    tests, including 1–4 unchanged layout selection, 5/10 wrapping rows, the
    above-ten dense fallback, and the absence of inline orbit positioning.
  - `node --test scripts/glass-shell.test.mjs` — passed 5/5 contracts,
    including exact 1.2× circle clamps, wrapping behavior, and removal of orbit
    CSS/coordinate generation.
  - Local mock-browser visual check — passed for the available three-person
    default cluster at 1280×720: circles measured 190.08 px square, every orb
    remained in relative document flow, page overflow measured 0 px on both
    axes, and the console contained no warnings or errors.
  - `pnpm test` — passed 88 Vitest files / 489 tests and 50/50 Node contract
    tests.
  - `pnpm version:check` — passed at version `1.6.1`.
  - `pnpm security:scan` — passed for `dist`, `electron-dist`, and `release`.
  - `pnpm check` / `pnpm format:check` — failed on nine pre-existing,
    unrelated formatting violations in shell/sidebar-theme files; no listed
    violation is in this task's implementation or documentation files.
  - `pnpm lint` — failed on ten pre-existing unsafe-`any` errors in
    `SettingsPage.test.tsx` and `SidebarGradientPicker.test.tsx`.
  - `pnpm typecheck` — failed on eight pre-existing possibly-undefined point
    errors in `SidebarGradientPicker.tsx`.
  - `pnpm build` and `pnpm desktop:build` — failed at their shared typecheck
    gate on those same pre-existing `SidebarGradientPicker.tsx` errors, before
    bundling or packaging.
  - `git diff --check` — passed; the changed diff contained no service-role,
    LiveKit secret, bearer-token, or private-key pattern.
- **Documentation updated:** Updated `docs/architecture.md`, the active v1 plan,
  plan 0035's accepted voice layout, and this canonical progress log.
- **Known limitations:** The local mock call exposes three participants, so the
  five/ten-person row is covered by component and source-contract regression
  tests but not a live five-person browser screenshot. Unrelated sidebar-theme
  formatting, lint, and TypeScript failures currently prevent a fully green
  repository build and desktop package.
- **Next:** Resolve the existing sidebar-theme validation failures, then observe
  five- and ten-person wrapping rows in an installed multi-client call at both
  supported viewport sizes.

## 2026-08-09 — Make sidebar Activity collapsible

- **Completed:** Turned the Bakbak sidebar Activity title into an accessible
  disclosure control with a directional chevron. Activity defaults expanded,
  collapses to its 28 px header without hiding or moving Channels, and restores
  the saved choice after the sidebar or app is reopened. Added a versioned
  device-local preference scoped independently by signed-in account and server.
- **Decisions:** Kept the existing six-person ordering, profile/media behavior,
  Show all modal, member actions, and presence data flow unchanged. Stored only
  the convenience boolean locally; no profile, Supabase, or layout-preference
  contract changed.
- **Validation:**
  - Focused Prettier and zero-warning ESLint checks for all changed Activity
    implementation, regression, style, architecture, and plan files — passed.
  - Focused Vitest — passed 2 files / 17 tests, including default-expanded
    behavior, click and keyboard disclosure, Channels remaining available,
    remount restoration, account/server isolation, and unavailable-storage
    fallback.
  - Focused Node source contracts — passed 10/10 tests across the glass-shell
    and appearance suites.
  - Local mock-browser interaction at 1280×720 — passed: Activity collapsed
    from 366 px to a 28 px header, Channels moved to 132 px from the viewport
    top, the content became hidden, re-entering the mock app restored the
    collapsed state, document overflow stayed 0 px on both axes, and the
    console contained no warnings or errors.
  - `pnpm test` — passed 89 Vitest files / 494 tests and 50/50 Node contract
    tests.
  - `pnpm version:check` — passed at version `1.6.1`.
  - `pnpm security:scan` — passed for `dist`, `electron-dist`, and `release`.
  - `pnpm format:check` — failed on the same nine pre-existing unrelated
    formatting violations recorded by the preceding voice-layout task; every
    file changed for Activity passes focused formatting.
  - `pnpm lint` — failed on the same ten pre-existing unsafe-`any` errors in
    `SettingsPage.test.tsx` and `SidebarGradientPicker.test.tsx`; focused lint
    for the Activity implementation passes.
  - `pnpm typecheck` — failed on the same eight pre-existing
    possibly-undefined point errors in `SidebarGradientPicker.tsx`.
  - `pnpm build` and `pnpm desktop:build` — failed at their shared typecheck
    gate on those same pre-existing `SidebarGradientPicker.tsx` errors, before
    bundling or packaging.
  - `git diff --check` — passed; the changed diff contained no service-role,
    LiveKit secret, bearer-token, or private-key pattern.
- **Documentation updated:** Updated `docs/architecture.md`, the active v1 plan,
  plan 0034's Activity contract, and this canonical progress log.
- **Known limitations:** The current unrelated sidebar-theme formatting, lint,
  and TypeScript failures still prevent a fully green repository build and
  desktop package. Installed macOS/Windows observation remains part of the
  broader shell acceptance matrix.
- **Next:** Resolve the existing sidebar-theme validation failures, then include
  the Activity disclosure in the installed light/dark sidebar acceptance pass.

## 2026-08-09 — Repair PR 54 validation failures

- **Completed:** Fixed the gradient picker's strict tuple-indexing errors by
  restricting color-point operations to the three valid theme indices. Replaced
  unsafe JSON and nested matcher values in the related tests with typed theme
  reads and callback assertions. Applied the repository formatter to all nine
  files reported by the CI formatting gate.
- **Decisions:** Preserved the three-point theme schema and picker behavior
  instead of weakening `noUncheckedIndexedAccess` or adding non-null assertions.
  Treated the formatter and lint failures as part of the same repair because the
  validation job would remain red after fixing TypeScript alone.
- **Validation:**
  - `pnpm check` — passed formatting, zero-warning lint, renderer/Node/Electron
    typechecks, 89 Vitest files / 494 tests, 50/50 Node contract tests, version
    validation at `1.6.1`, production renderer build, and bundle secret scan.
  - `pnpm desktop:build` — passed the renderer and Electron compilation, native
    dependency rebuild, ad-hoc-signed macOS Apple Silicon app packaging, ZIP and
    DMG generation, and block-map generation.
  - `git diff --check` — passed.
- **Documentation updated:** Appended this canonical progress entry; no behavior,
  architecture, setup, or accepted-scope contract changed.
- **Known limitations:** Windows x64 packaging cannot run on this macOS host and
  remains covered by PR CI. Local macOS notarization was skipped because no
  notarization credentials were configured, as expected for a local build.
- **Next:** Commit and push this repair, then confirm all three PR 54 CI jobs pass
  on the updated head.

## 2026-08-09 — Make in-call devices and Studio testing reliable

- **Completed:** Made active-call input changes update LiveKit's input-device
  bookkeeping after the existing speech-track restart, without switching the
  synthetic soundboard microphone publication. Serialized output changes on an
  independent pending state and made Bakbak's audible soundboard/final-mix
  sinks authoritative when silent autoplay or LiveKit bookkeeping fails. Added
  Bakbak Studio mic testing with simultaneous raw and processed meters, live
  RNNoise toggling, selected-output monitoring, raw fallback, and exact
  active-call mute/deafen isolation plus restoration. Enforced deafen on the
  final remote mix, every source gain, and LiveKit track volume so remote
  soundboard audio cannot bypass it. Corrected the disconnected Studio control
  from a permanent `Starting…` label to its ready state.
- **Decisions:** Kept connected input replacement on the named speech track
  because LiveKit's room-wide input switch would also target the separately
  published soundboard track. Treated renderer-owned audible sinks as the
  output transaction's source of truth and LiveKit output selection as
  best-effort bookkeeping. Kept participant boost in Bakbak's owned gain graph;
  LiveKit volume is only a binary deafen safety boundary. Described Studio as
  reducing keyboard, fan, and steady room noise rather than promising complete
  speaker separation or acoustic isolation.
- **Validation:**
  - Focused Vitest — passed 7 files / 125 tests covering active-call input and
    output switching, output autoplay/bookkeeping failure, Studio live toggle
    and fallback, call isolation/restoration, and final-mix/track deafen.
  - Local mock-browser visual check — passed for Settings → Audio & video at
    1280×720, including dual meters, selected-output copy, Studio controls, and
    the corrected ready `On` state. The pass caught and corrected the stale
    idle `Starting…` state.
  - `pnpm check` — passed formatting, zero-warning lint, renderer/Node/Electron
    typechecks, 89 Vitest files / 502 tests, all 50 Node contract tests, version
    validation at `1.6.1`, the production renderer build, and bundle secret
    scanning for `dist`, `electron-dist`, and `release`. The existing large
    chunk warning remains non-blocking.
  - `pnpm desktop:build` — passed the renderer and Electron compilation, native
    dependency rebuild, ad-hoc-signed Apple Silicon app packaging, ZIP and DMG
    generation, and block-map generation. The first sandboxed attempt could not
    fetch Electron; the scoped network retry and final exact-tree run passed.
    Local notarization was skipped because credentials were not configured.
  - `git diff --check` — passed; the compiled bundle secret scan found no
    service-role or LiveKit secret material.
- **Documentation updated:** Updated `docs/architecture.md`, the active v1 plan,
  plans 0029 and 0030, and this canonical progress log.
- **Known limitations:** RNNoise is not acoustic echo cancellation or guaranteed
  voice isolation. Physical-device behavior still needs the installed macOS and
  Windows two-client matrix; non-`setSinkId` runtimes remain system-output only.
- **Next:** In installed two-client calls, switch between two microphones and
  outputs while muted and unmuted, compare Studio off/on with repeatable fan and
  keyboard noise, and confirm mute plus deafen suppresses remote soundboard
  clips before restoring prior state.

## 2026-08-09 — Restore released-app voice token requests

- **Completed:** Reproduced the released Electron failure as a production CORS
  preflight rejection: `app://bakbak` returned 403 while the development and
  legacy Tauri origins returned 204. Confirmed the installed 1.7.0 artifact uses
  the secure `app://bakbak` renderer and contains the expected live Supabase and
  LiveKit hosts. Restored both legacy Tauri origins alongside Electron and the
  two fixed development origins, then deployed only `livekit-token` to the
  linked hosted project.
- **Decisions:** Kept exact-origin allowlisting and did not use a wildcard.
  Preserved `tauri://localhost` and `http://tauri.localhost` so fixing Electron
  voice does not break clients still completing the signed updater handoff.
  Limited the production mutation to `livekit-token`; no database, secret,
  renderer, or other Edge Function was changed.
- **Validation:**
  - Pre-deploy hosted preflights — `app://bakbak` returned 403 without an allow
    header, `http://127.0.0.1:1420` returned 204, and `tauri://localhost`
    returned 204, proving the deployed function still carried the pre-Electron
    bundle.
  - Focused LiveKit-token Deno tests — passed 12/12, including Electron, macOS
    Tauri, Windows Tauri, unauthenticated preflight, hostile-origin rejection,
    authorization, and token grants.
  - Full Edge Function Deno suite — passed 44/44 tests.
  - `deno lint` for the shared CORS, token function, and focused test — passed;
    `deno check --config supabase/deno.json
supabase/functions/livekit-token/index.ts` — passed.
  - `pnpm check` — passed formatting, zero-warning lint, renderer/Node/Electron
    typechecks, 89 Vitest files / 502 tests, all 50 Node contract tests, version
    validation at `1.6.1`, the production renderer build, and bundle secret
    scanning. The existing large-chunk warning remains non-blocking.
  - `pnpm dlx supabase@latest functions deploy livekit-token --use-api` —
    passed for project `ezdwfqcmrofcemmfzxgl`; the deployment uploaded the
    token modules plus `_shared/http.ts` and the corrected `_shared/cors.ts`.
  - Post-deploy hosted preflights — Electron, macOS Tauri, and Windows Tauri
    returned 204; the Electron response included
    `Access-Control-Allow-Origin: app://bakbak`; an untrusted HTTPS origin
    remained 403.
- **Documentation updated:** Updated the Electron trust boundary in
  `docs/architecture.md`, completed the distribution CORS item in the active v1
  plan, and appended this canonical progress entry.
- **Known limitations:** The authenticated installed-app join still needs a
  user-session retry after deployment. Other Edge Functions bundle the shared
  CORS module independently and were not redeployed in this voice-only repair.
- **Next:** Retry the released app's voice room. If another packaged Edge
  Function feature reports the same fetch-level error, probe its Electron
  preflight and redeploy that function's current bundle separately.

## 2026-08-09 — Reject signature-breaking macOS updater metadata

- **Completed:** Traced the Electron updater loop to 228 AppleDouble `._*`
  files materialized inside the installed 1.7.0 app by the transitional Tauri
  archive, which invalidated Electron's sealed framework resources. Updated the
  macOS release job to verify the source app's nested code signature and create
  the legacy `.app.tar.gz` without macOS sidecars or extended attributes. Added
  a Linux publication boundary that rejects AppleDouble/`__MACOSX` metadata,
  traversal, extra roots, and missing Bakbak executable or Info.plist entries
  before a GitHub Release draft can be created.
- **Decisions:** Kept Electron's normal ZIP/DMG output unchanged because the
  downloaded 1.7.1 ZIP matched `latest-mac.yml`, extracted with zero sidecars,
  and passed strict code-signature validation. Put the archive verifier before
  draft creation so a bad compatibility payload cannot become public even if
  the macOS creation flag regresses. Disabled extended attributes as well as
  AppleDouble generation because neither is required to preserve the app's
  file-based code signature.
- **Validation:**
  - Focused Node contracts — passed 13/13 across release-version/workflow and
    legacy macOS archive validation, including clean bundle acceptance plus
    AppleDouble, `__MACOSX`, traversal, extra-root, and incomplete-bundle
    rejection.
  - `pnpm check` — the first run failed only because the updated workflow
    contract test needed formatting; after formatting, the final exact-tree run
    passed formatting, zero-warning lint, renderer/Node/Electron typechecks, 89
    Vitest files / 502 tests, 53/53 Node contracts, version validation at
    `1.7.1`, the production renderer build, and bundle secret scanning.
  - `pnpm desktop:build` — passed the renderer and Electron compilation, native
    dependency rebuild, ad-hoc-signed Apple Silicon app packaging, ZIP/DMG
    generation, and block maps. Local notarization remained skipped because no
    notarization credentials were configured.
  - Corrected legacy archive rehearsal — the source app passed
    `codesign --verify --deep --strict`; the no-metadata/no-xattr tar contained
    601 clean `Bakbak.app` entries, retained the executable and Info.plist, and
    enumerated without an AppleDouble entry.
- **Documentation updated:** Updated the desktop release/update contract in
  `docs/architecture.md`, Phase 6 acceptance in the active v1 plan, and this
  canonical progress log.
- **Known limitations:** Existing 1.7.0 installations already polluted by the
  old Tauri archive cannot repair their invalid bundle through Squirrel and
  need one manual DMG replacement. Developer ID signing/notarization remains
  required before treating macOS distribution as production-ready. The fixed
  GitHub-hosted archive and installed Tauri-to-Electron path still require
  post-merge observation.
- **Next:** Publish the repair branch, pass the native PR matrix, merge it with
  the default patch bump, inspect every v1.7.2 updater artifact, then rehearse a
  clean Tauri installation upgrading through the corrected archive.

## 2026-08-12 — Implement Arc shell, Glass chrome, and typed permission recovery

- **Completed:** Removed the layout-consuming titlebar and contextual top bar;
  replaced renderer Windows caption buttons with native Window Controls Overlay;
  added a native View-menu `Cmd/Ctrl+B` action and one platform-safe sidebar
  close/reopen control; migrated layout preferences to v4; and made a hidden,
  mounted/inert sidebar produce a borderless full-window canvas without changing
  drafts, calls, shares, or soundboard state. Rehomed DM profile access to the
  conversation introduction and added accessible main-region labels. Migrated
  account-scoped appearance data to `bakbak.chromeThemes.v2`, made scheme-aware
  Glass the untouched default, preserved deliberate solid/gradient choices and
  dormant values, removed forced theme onboarding, and added vibrancy/Mica/opaque
  capability fallbacks without filtering live media. Added typed microphone and
  Screen Recording snapshots, explicit-action-only microphone requests,
  structured screen-source/capture failures, focus rechecks, platform-correct
  settings/restart actions, and strict Electron permission frame/origin checks.
- **Decisions:** Kept macOS ad-hoc signing as requested and documented that it
  cannot preserve TCC grants between changing builds. Windows microphone copy
  describes the global desktop-app privacy switch and never invents a per-app
  screen permission. Windows system output is offered only for whole-display
  capture; application and macOS custom-picker sources remain video-only.
  Chromium own-audio suppression is described as best effort, not isolation.
  Existing customized themes migrate per space; exact old defaults become Glass.
- **Validation:**
  - Focused integration Vitest — passed 8 files / 160 tests after the final
    permission, Glass, WCO, and blocking-dialog audit.
  - Browser/mock visual and semantic pass — passed at 1280×800 and 1024×680 in
    light/dark Glass with visible/hidden sidebars, text, voice, settings, modal
    toggle suppression, full-bleed geometry, zero document overflow, and no
    console warnings. The pass found and corrected pale-Glass white copy.
  - `pnpm --pm-on-fail=ignore format:check` — passed.
  - `pnpm --pm-on-fail=ignore lint` — passed with zero warnings.
  - `pnpm --pm-on-fail=ignore typecheck` — passed renderer, Node, and Electron
    strict TypeScript checks.
  - `pnpm --pm-on-fail=ignore test` — passed 90 Vitest files / 531 tests and all
    56 Node source-contract tests.
  - `./node_modules/.bin/vite build` — passed the final production renderer
    build; the existing large-chunk warning remains non-blocking.
  - `pnpm --pm-on-fail=ignore version:check` — passed at `1.7.2`.
  - `pnpm --pm-on-fail=ignore security:scan` — passed for `dist`,
    `electron-dist`, and `release`.
  - `./node_modules/.bin/tsc --pretty false -p tsconfig.electron.json` — passed
    final Electron compilation.
  - `./node_modules/.bin/electron-builder --mac --arm64 --publish never` — an
    integration checkpoint passed native rebuild, ad-hoc signing, and Apple
    Silicon ZIP/DMG plus block-map generation. The final exact-tree rerun was
    blocked by the execution environment's usage limit after all source checks;
    `codesign --verify --deep --strict --verbose=2` passed on the generated app.
  - `git diff --check` — passed.
- **Documentation updated:** Added plan 0036, revised the current architecture
  and active v1 phase criteria, and appended this canonical entry.
- **Known limitations:** Ad-hoc macOS updates may require microphone and Screen
  Recording re-grants; Developer ID signing/notarization is the future persistence
  path. Native Windows WCO/Mica/scaling/global-microphone/policy behavior and the
  installed two-build permission matrix remain untested on this macOS host. The
  final package rerun could not execute after the tool usage limit, and neither
  platform's full installed interaction/accessibility matrix was performed.
- **Next:** Run plan 0036's installed Apple Silicon macOS matrix, then Windows
  x64 native-controls/Mica/fallback/scaling and permission-policy matrix. Before
  claiming permission persistence, ship two consecutive Developer ID-signed and
  notarized macOS builds with one stable Team ID and bundle identifier.

## 2026-08-14 — Flatten the Arc shell to the full window

- **Completed:** Removed the visible shell's right/bottom gutter plus the
  conversation canvas border, radius, and shadow. Removed the default Glass
  sidebar-slot fill and accent wash so the sidebar and text/voice canvas share
  one continuous light/dark surface while floating controls retain their Glass
  treatment. Kept the mounted sidebar, resizer, overlay toggle, internal chat
  rhythm, voice people padding, and call lifecycle unchanged. Added source
  contract coverage for the zero-padding, borderless canvas, and shared Glass
  background.
- **Decisions:** Scoped the flattened background to untouched Glass so a user
  who deliberately selected a solid or gradient per-space theme keeps that
  customization. Removed only shell-level spacing; content-specific padding
  remains where it protects the overlay control or lays out chat and voice
  contents.
- **Validation:**
  - `node --test scripts/glass-shell.test.mjs` — passed 7/7 focused Arc/Glass
    shell contracts.
  - Browser/mock visual and geometry pass at 1280×800 — passed light and dark
    text chat plus dark connected voice with the visible sidebar. The shell,
    content, and voice rectangles reached all four applicable viewport edges;
    shell padding, canvas border, and radius computed to zero; frame and content
    backgrounds matched; and the console reported no warnings or errors.
  - Browser/mock hidden-sidebar voice pass — passed; the mounted sidebar reached
    zero width, the connected call remained present, and content/voice expanded
    to the complete 1280×800 viewport.
  - `pnpm check` — passed formatting, zero-warning lint, renderer/Node/Electron
    strict TypeScript, 90 Vitest files / 531 tests, all 56 Node source-contract
    tests, version validation at `1.7.2`, the production renderer build, and the
    compiled bundle secret scan. The existing large-chunk warning remains
    non-blocking.
  - `pnpm desktop:build` — passed renderer/Electron compilation, native
    dependency rebuild, ad-hoc signing, Apple Silicon ZIP/DMG generation, and
    both block maps. The first sandboxed builder attempt could not resolve
    GitHub; the approved network retry and final canonical command passed.
  - `git diff --check` — passed before the progress entry.
- **Documentation updated:** Updated the Arc shell/current UI contract in
  `docs/architecture.md`, the active v1 plan, plan 0036, and this canonical
  progress log.
- **Known limitations:** Windows x64 packaging and installed native
  macOS/Windows observation remain outside this macOS browser/mock pass.
  Custom solid/gradient themes retain their intentionally distinct sidebar
  background and were not flattened.
- **Next:** Run the installed plan 0036 macOS and Windows visual matrix with the
  visible sidebar in text/voice/share views, then complete the remaining native
  permission and material-fallback checks.

## 2026-08-14 — Keep the sidebar transparent and restore window dragging

- **Completed:** Made the signed-in sidebar slot permanently transparent for
  both Glass and Gradient themes, removed Solid from Appearance Settings, and
  kept an independent transparency slider for Personal and Bakbak in both
  remaining modes. Added a 30 px, action-free drag strip to the top of the main
  canvas so the frameless window has a reliable grab target without restoring a
  contextual header. Normalized saved v1/v2 Solid records into single-color
  translucent gradients, clamped theme transparency to 20–80%, and retained
  customized gradient colors, points, shade, and texture. Added focused unit and
  source-contract coverage for the editor, migration, style, and shell geometry.
- **Decisions:** Kept the conversation canvas solid for legibility while the
  sidebar reveals the native material or selected translucent theme. Preserved
  old Solid colors through migration instead of discarding user choices. The
  compact drag strip consumes only 30 px and contains no interactive or
  contextual UI; the existing native-safe sidebar toggle remains an overlay.
- **Validation:**
  - Focused Vitest — passed 5 files / 58 tests covering App, Settings,
    `SidebarThemeEditor`, `SidebarGradientPicker`, and chrome-theme preferences.
  - `node --test scripts/glass-shell.test.mjs` — passed 7/7 Arc/Glass shell
    source contracts.
  - Browser/mock visual, semantic, and geometry pass at 1280×800 — passed dark
    text and voice layouts with visible and hidden sidebars. The main drag strip
    computed to 30 px with `-webkit-app-region: drag`; the sidebar background
    computed fully transparent; Appearance exposed Glass/Gradient without Solid;
    reset restored 45% Glass transparency; and the console had no warnings or
    errors.
  - `pnpm check` — the first network-restricted sandbox attempt produced no
    output and was interrupted; the approved exact-tree retry passed formatting,
    zero-warning lint, renderer/Node/Electron strict TypeScript, 90 Vitest files
    / 532 tests, all 56 Node source-contract tests, version validation at
    `1.7.2`, the production renderer build, and the compiled bundle secret scan.
    The existing large-chunk warning remains non-blocking.
  - `pnpm desktop:build` — passed renderer/Electron compilation, native
    dependency rebuild, ad-hoc signing, Apple Silicon ZIP/DMG generation, and
    both block maps. Notarization remained skipped because credentials are not
    configured.
  - `git diff --check` — passed after the final documentation update.
- **Documentation updated:** Updated the current shell, appearance storage, and
  migration contracts in `docs/architecture.md`; updated plan 0036 and the
  active v1 plan; and appended this canonical entry.
- **Known limitations:** The in-app browser can verify the CSS drag-region
  contract but cannot physically move the native Electron window. Installed
  Apple Silicon macOS and Windows x64 dragging, native material, reduced-
  transparency, and permission-recovery observation remain open. The ad-hoc
  macOS package is intentionally not notarized.
- **Next:** Run the installed plan 0036 macOS matrix and confirm dragging from
  the new main strip, then repeat the WCO/Mica/fallback/scaling and permission
  matrix on Windows x64.

## 2026-08-14 — Repair Arc sidebar chrome and round the user dock

- **Completed:** Scoped the signed-in titlebar overlay to the current sidebar
  width while visible and a 52 px reopen rail while hidden. Made the sidebar
  toggle itself an explicit `no-drag` Electron hit region so it remains
  clickable above the full-width main drag strip. Added a narrow typed preload
  command that aligns macOS traffic lights at `{ x: 16, y: 16 }`, hides them
  with the sidebar, and restores them when the sidebar or non-signed-in shell is
  shown; Windows retains native Window Controls Overlay on the right. Changed
  Glass's new/reset transparency default and slider maximum to 100%, promoted
  untouched v2 Glass records from the former 45% default, and persisted that
  normalization without overwriting custom gradients. Gave the current-user
  dock a bordered 12 px rounded, scheme-aware raised background.
- **Decisions:** Kept the hidden reopen button visible even while macOS native
  caption buttons are hidden, so pointer users are not forced to discover
  `Cmd/Ctrl+B`. Scoped native-button hiding to macOS; Windows caption placement
  continues to follow Window Controls Overlay conventions. Migrated only the
  exact former Glass default to 100%, preserving deliberate non-default theme
  values.
- **Validation:**
  - Focused Vitest — passed 6 files / 68 tests covering App,
    `WindowTitlebar`, theme preferences/editor/Settings, and the user dock.
  - `node --test scripts/glass-shell.test.mjs scripts/window-chrome-config.test.mjs`
    — passed 10/10 shell, native-control, preload, and packaging contracts.
  - Focused strict TypeScript — passed renderer, Node, and Electron projects.
  - Browser/mock visual, semantic, and geometry pass at 1280×806 — passed
    visible → hidden → visible pointer interaction. The open overlay matched
    the 340 px saved sidebar, the hidden rail measured 52 px, the toggle itself
    computed `-webkit-app-region: no-drag`, and the main strip remained the drag
    region. The dock computed a 12 px radius with a bordered raised background
    in dark and light modes. Appearance Reset reported 100% and produced a
    fully transparent Glass tint. The console had no warnings or errors.
  - `pnpm check` — the first run stopped at one unbound-method lint error in the
    new optional bridge call; calling through the bridge object fixed it. The
    final exact-tree retry passed formatting, zero-warning lint,
    renderer/Node/Electron strict TypeScript, 90 Vitest files / 534 tests, all
    56 Node source-contract tests, version validation at `1.7.2`, the production
    renderer build, and bundle secret scanning. The existing large-chunk
    warning remains non-blocking.
  - `pnpm desktop:build` — passed renderer/Electron compilation, native
    dependency rebuild, ad-hoc signing, Apple Silicon ZIP/DMG generation, and
    both block maps. Notarization remained skipped because credentials are not
    configured.
  - `git diff --check` — passed after the final documentation update.
- **Documentation updated:** Updated the Arc overlay, native-control,
  appearance migration, and rounded user-dock contracts in
  `docs/architecture.md`, plan 0036, the active v1 plan, and this canonical log.
- **Known limitations:** Browser/mock verifies the click and CSS hit regions but
  cannot visually observe native macOS traffic lights hiding or physically move
  the packaged window. Installed Apple Silicon macOS and Windows x64
  window-control/scaling observation remains open. The ad-hoc macOS package is
  intentionally not notarized.
- **Next:** Install the generated Apple Silicon build and verify traffic-light
  alignment plus repeated pointer collapse/reopen cycles, then repeat native
  WCO/Mica/scaling checks on Windows x64.

## 2026-08-14 — Harden collapsed macOS window controls

- **Completed:** Confirmed the reported overlap came from a running
  `desktop:dev` process whose Electron main process and preload predated the
  renderer hot reload. Added an acknowledgement state so the collapsed-sidebar
  control occupies the vacated macOS traffic-light area only after the native
  visibility command resolves. A stale, absent, or failed preload now keeps the
  control clickable in a wider nonoverlapping fallback rail and identifies the
  restart requirement in its tooltip. Moved native visibility ownership into a
  main-process helper and reapplied the last state after ready/show, focus,
  restore, and fullscreen return.
- **Decisions:** Kept native macOS traffic lights instead of recreating their
  close/minimize/fullscreen semantics in HTML. The renderer treats successful
  IPC completion as the boundary for reclaiming their space. The fallback is
  intentionally wider only while native state cannot be managed; a restarted
  current build returns to the normal 52 px reopen rail.
- **Validation:**
  - Temporary Electron 43 hidden-inset probe via
    `./node_modules/.bin/electron scripts/.window-button-visibility-probe.cjs`
    — passed on macOS: desktop-capture screenshots showed all three native
    buttons before `setWindowButtonVisibility(false)` and none afterward; the
    temporary probe source was removed.
  - Focused Vitest — passed 2 files / 22 tests for `WindowTitlebar` and `App`,
    including the native-acknowledgement transition.
  - `node --test scripts/glass-shell.test.mjs scripts/window-chrome-config.test.mjs`
    — passed 10/10 Arc shell and native lifecycle contracts.
  - Full direct check equivalents — passed formatting, zero-warning lint,
    renderer/Node/Electron strict TypeScript, 90 Vitest files / 535 tests, all
    56 Node source-contract tests, and version validation at `1.7.2`.
  - `./node_modules/.bin/vite build` — passed the production renderer build;
    the existing large-chunk warning remains non-blocking.
  - `./node_modules/.bin/tsc --pretty false -p tsconfig.electron.json` — passed
    and refreshed the compiled main process/preload output.
  - `./node_modules/.bin/electron-builder --publish never` — the sandboxed
    attempt failed because GitHub DNS was unavailable; the approved network
    retry passed native rebuild, ad-hoc signing, Apple Silicon ZIP/DMG and both
    block maps. Notarization remained skipped without credentials.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist`,
    `electron-dist`, and `release`.
  - `git diff --check` and the added-line secret-pattern audit — passed.
- **Documentation updated:** Clarified the main-process native-control
  lifecycle and stale-preload fallback in `docs/architecture.md`, plan 0036,
  the active v1 plan, and this canonical log.
- **Known limitations:** The already-running development app must be fully quit
  and relaunched because Vite cannot hot-reload Electron main/preload code. The
  canonical `pnpm check` wrapper was interrupted when the machine's global pnpm
  11.3 shim stalled while the project requires pnpm 11.17; every constituent
  check was run directly and passed. Exact packaged-app collapse/reopen still
  needs one post-relaunch visual confirmation, and Windows native observation
  remains open.
- **Next:** Fully restart the development or packaged app, confirm one
  visible-sidebar → hidden-sidebar → visible-sidebar cycle on macOS, then run
  the outstanding Windows x64 WCO/Mica/scaling acceptance matrix.

## 2026-08-14 — Remove the hidden-sidebar reopen control

- **Completed:** Removed the renderer sidebar control whenever the sidebar is
  hidden, deleted the `PanelLeftOpen` path, collapsed the non-Windows titlebar
  overlay from its former reopen rail to zero width, and removed the 52 px alert
  clearance that only protected that overlay. The visible sidebar retains its
  clickable close control. `Cmd/Ctrl+B` and View → Toggle Sidebar remain the
  supported restore paths, while macOS traffic lights still hide and restore
  through the main-process lifecycle.
- **Decisions:** Applied the request only to the hidden state so the sidebar can
  still be closed by pointer while visible. Accepted keyboard/menu-only restore
  after hiding in exchange for a completely clean full-window canvas.
- **Validation:**
  - Focused Vitest — passed 2 files / 22 tests for `WindowTitlebar` and `App`,
    including persisted hidden state and keyboard restoration.
  - `node --test scripts/glass-shell.test.mjs scripts/window-chrome-config.test.mjs`
    — passed 10/10 Arc shell and native chrome contracts.
  - Browser/mock visual and geometry pass — passed visible → hidden → keyboard
    restore. Hidden state had zero Hide/Show buttons, zero Sidebar controls
    groups, a `0 px`-wide noninteractive titlebar overlay, the main drag bar as
    the top-left hit target, and no console warnings or errors. `Cmd+B` restored
    the sidebar and visible close button.
  - Full direct check equivalents — passed formatting, zero-warning lint,
    renderer/Node/Electron strict TypeScript, 90 Vitest files / 535 tests, all
    56 Node source-contract tests, and version validation at `1.7.2`.
  - `./node_modules/.bin/vite build` — passed the production renderer build;
    the existing large-chunk warning remains non-blocking.
  - `./node_modules/.bin/tsc --pretty false -p tsconfig.electron.json` — passed.
  - `./node_modules/.bin/electron-builder --publish never` — passed native
    rebuild, ad-hoc signing, Apple Silicon ZIP/DMG generation, and both block
    maps. Notarization remained skipped without credentials.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist`,
    `electron-dist`, and `release`.
  - `git diff --check` and the added-line secret-pattern audit — passed.
- **Documentation updated:** Updated the overlay and restore-path contracts in
  `docs/architecture.md`, plan 0036, the active v1 plan, and this canonical log.
- **Known limitations:** Hidden-sidebar restoration is intentionally keyboard or
  native-menu only. Installed Windows x64 observation remains open, and the
  ad-hoc macOS package is intentionally not notarized.
- **Next:** Confirm the clean hidden state once in the refreshed desktop app,
  then run the outstanding Windows x64 WCO/Mica/scaling acceptance matrix.

## 2026-08-14 — Move the sidebar control and add right-side placement

- **Completed:** Removed the signed-in renderer control from the empty
  titlebar overlay and placed the sidebar-close button directly after Settings
  in the bottom user dock. Added an Appearance Settings choice for Left or
  Right navigation, mirrored the grid track, hidden-state motion, and resizer
  direction, and persisted the position through layout preferences v5. The v5
  parser migrates v4 visibility/width and every older layout to the safe left
  default while retaining the existing 248–340 px clamp and keyboard/menu
  restore paths.
- **Decisions:** Kept Left as the default and made placement device-local rather
  than account-scoped. Kept native caption buttons on their platform-standard
  edge; on macOS the traffic lights coincide with the sidebar only when it is
  left-positioned. Retained the mounted/inert zero-width sidebar so voice,
  share, drafts, and selected context do not remount during collapse.
- **Validation:**
  - Focused Vitest — passed 7 files / 81 tests covering v5 migration, empty
    titlebar chrome, dock control semantics, both sidebar compositions,
    Appearance selection, app placement persistence, and collapse behavior.
  - `node --test scripts/glass-shell.test.mjs scripts/window-chrome-config.test.mjs`
    — passed 10/10 Arc shell and native chrome contracts during the focused
    pass.
  - Browser/mock interaction at 1280×720 — passed left and right full-height
    geometry, Settings/toggle adjacency, zero titlebar controls, right-side
    collapse to a 1280 px canvas, `Cmd+B` restoration, reversed keyboard
    resizing, and right-side persistence after reload. The pass exposed and
    fixed an initial CSS Grid auto-row split before acceptance.
  - Full direct check equivalents — passed formatting, zero-warning lint,
    renderer/Node/Electron strict TypeScript, 90 Vitest files / 538 tests, all
    56 Node source-contract tests, and version validation at `1.7.2`.
  - `./node_modules/.bin/vite build` — passed the production renderer build;
    the existing large-chunk warning remains non-blocking.
  - `./node_modules/.bin/electron-builder --publish never` — the sandboxed
    attempt failed because GitHub DNS was unavailable; the approved network
    retry passed native rebuild, Electron download, ad-hoc signing, Apple
    Silicon ZIP/DMG generation, and both block maps. Notarization remained
    skipped without credentials.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist`,
    `electron-dist`, and `release`.
  - `git diff --check` and the added-line secret-pattern audit — passed.
- **Documentation updated:** Updated the current shell/layout contract in
  `docs/architecture.md`, plan 0036, the active v1 plan, and this canonical log.
- **Known limitations:** The global pnpm shim again produced no output for the
  wrapper checks before the bounded wait, so their exact local binaries ran and
  passed instead. Installed Windows x64 right-sidebar WCO behavior and packaged
  macOS traffic-light/drag observation remain open; the macOS package remains
  intentionally ad-hoc signed and unnotarized.
- **Next:** Confirm left/right placement, collapse/restore, resizer direction,
  and native caption controls in refreshed installed macOS and Windows builds,
  then complete plan 0036's outstanding native acceptance matrix.

## 2026-08-14 — Center right-sidebar macOS traffic lights

- **Completed:** Extended the narrow native window-controls command to carry
  the current sidebar position with visibility. macOS now retains
  `{ x: 16, y: 16 }` inside the taller left-sidebar chrome and uses
  `{ x: 16, y: 8 }` when the sidebar is on the right, centering the traffic
  lights vertically in the compact 30 px main drag strip. Focus, restore,
  ready-to-show, and fullscreen-return recovery reapply both position and
  visibility. Authentication/unmount restores the left/default position.
- **Decisions:** Kept the native buttons on macOS's platform-standard left edge
  and changed only their vertical alignment. Preserved backward compatibility:
  a renderer or preload that omits the new position argument safely defaults to
  `left`, while invalid values are rejected in the trusted main process.
- **Validation:**
  - Screenshot inspection — confirmed the reported right-sidebar buttons used
    the `y: 16` sidebar offset and visibly crossed the 30 px drag-strip bottom;
    the correction removes that eight-pixel mismatch.
  - Focused Vitest and source contracts — passed 2 files / 24 tests plus 10/10
    Arc/native chrome Node tests, including right-position bridge arguments,
    main-process coordinate constants, and native lifecycle reapplication.
  - Full direct check equivalents — passed formatting, zero-warning lint,
    renderer/Node/Electron strict TypeScript, 90 Vitest files / 539 tests, all
    56 Node source-contract tests, and version validation at `1.7.2`.
  - `./node_modules/.bin/vite build` — passed the production renderer build;
    the existing large-chunk warning remains non-blocking.
  - `./node_modules/.bin/electron-builder --publish never` — the sandboxed
    attempt failed because GitHub DNS was unavailable; the approved network
    retry passed native rebuild, Electron download, ad-hoc signing, Apple
    Silicon ZIP/DMG generation, and both block maps. Notarization remained
    skipped without credentials.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist`,
    `electron-dist`, and `release`.
  - `git diff --check` and the added-line secret-pattern audit — passed.
- **Documentation updated:** Documented side-specific macOS traffic-light
  coordinates and native-state synchronization in `docs/architecture.md`, plan
  0036, the active v1 plan, and this canonical log.
- **Known limitations:** Vite cannot hot-reload Electron main/preload changes,
  so an already-running desktop development app must be fully quit and
  relaunched before the corrected coordinates appear. The fresh package
  compiled successfully, but final installed macOS observation and Windows WCO
  acceptance remain open; the macOS package is still ad-hoc signed and
  unnotarized.
- **Next:** Fully restart Bakbak, select the right sidebar, confirm the traffic
  lights are centered in the main drag strip through one focus/fullscreen
  cycle, then complete the remaining native plan 0036 matrix.

## 2026-08-14 — Fail closed screen audio and enforce exact-once playback

- **Completed:** Made every current Windows and macOS Electron screen source
  video-only. Main-process capabilities/source metadata now explain that Bakbak
  call audio cannot be safely excluded, audio-enabled prepared selections are
  rejected, and the display-media callback returns only the exact selected
  video source with no Chromium loopback branch. The renderer independently
  normalizes stale or unsafe bridge claims to video-only before capture. Added
  an exact-once remote-audio invariant across LiveKit-like attach/unmute and
  `volumechange`, blocked/restored room playback, output changes, `playing`, and
  bounded pause/stall/error/ended recovery. Direct MediaStream routes rebuild
  their gain stage on error/ended reattachment; a re-entry guard prevents
  route mutations from recursively reacting to their own `volumechange`
  events. Element fallback remains available. Privacy-safe diagnostics schema
  v3 now includes route type, attachment state/count, and invariant status.
- **Decisions:** Chose a product-level fail-closed boundary instead of treating
  Chromium's best-effort `restrictOwnAudio` as process isolation. System audio
  can return only through a native path that proves Bakbak's process tree is
  excluded on installed Windows and macOS clients. Kept listener gain in one
  renderer-owned route and reapplied its invariant after every known LiveKit,
  recovery, and output mutation point rather than trusting one-time attach
  state.
- **Validation:**
  - Focused Vitest — passed 4 files / 88 tests covering remote routing,
    screen-share service normalization, room playback-status reconciliation,
    and diagnostics.
  - `node --test scripts/screen-share-audio-isolation.test.mjs` — passed 2/2
    Electron video-only/fail-closed source-contract tests.
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed with zero warnings.
  - Direct strict TypeScript checks for the renderer, Node scripts, and
    Electron process — all passed.
  - Full Vitest — passed 90 files / 539 tests.
  - `node --test scripts/*.test.mjs` — passed all 56 Node source-contract tests.
  - `./node_modules/.bin/vite build` — passed after transforming 2,053 modules;
    the existing large-chunk warning remains non-blocking.
  - Electron compile plus `electron-builder --publish never` — the sandboxed
    packaging attempt failed when `github.com` DNS was unavailable; the
    approved network retry passed native rebuild, ad-hoc signing, Apple Silicon
    ZIP/DMG generation, and both block maps. Notarization remained skipped
    because credentials are not configured.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist`,
    `electron-dist`, and `release`.
  - `git diff --check` — passed.
- **Documentation updated:** Updated `docs/architecture.md`, the active v1
  plan, and this canonical progress log with the fail-closed capture boundary,
  exact-once remote routing, diagnostic schema v3, and future native-isolation
  gate.
- **Known limitations:** System audio is intentionally unavailable for every
  current Electron screen share. This removes shared-loopback self-return but
  does not replace the required installed two-client Windows/macOS voice,
  speaker echo-cancellation, reconnect, output-change, and video-share
  observation. The element fallback cannot boost beyond the media element's
  0–100% range when Web Audio graph creation is unavailable.
- **Next:** Run the installed two-client matrix on Apple Silicon macOS and
  Windows x64 to confirm one copy of remote speech across watch, reconnect,
  playback recovery, and speaker changes; separately design and prove a native
  process-isolated system-audio path before restoring the audio checkbox.

## 2026-08-14 — Restore native Electron screen-audio isolation

- **Completed:** Added the bundled `bakbak-screen-share-helper` contract and
  Electron protocol-v1 supervisor with exact hello, correlated JSON-lines
  requests, strict input/result validation, bounded lines/tokens/sources,
  sanitized errors, lifecycle forwarding, timeout/crash cleanup, and graceful
  shutdown. Replaced preload `prepare` with capabilities/list/start/update/stop
  plus lifecycle methods. The renderer now delegates capture and companion
  publication to the helper; Electron `desktopCapturer`, display-media handling,
  `display-capture` permission, Chromium loopback, and renderer screen-track
  publication are removed. Added locked Rust build/test/staging scripts,
  `extraResources`, macOS/Windows CI checks, and a clean staging directory so
  the executable lands at `resources/native`. Added the compile-time rollout
  gate: default, PR, and release builds embed audio disabled, while only an
  exact-revision stabilization candidate embeds it enabled.
  Closing the last app window now invokes a bounded, restartable helper teardown
  that stops or kills any active/in-flight share without preventing a later
  macOS Dock activation from starting a fresh helper. On macOS, an audio
  downgrade now reconfigures ScreenCaptureKit with native audio disabled while
  preserving video and quality settings. `apple-metal` is pinned to 0.6.0; a
  scoped dependency clean plus locked standard-target rebuild proved the staged
  and packaged helpers have no unused MetalFX load dependency.
- **Decisions:** Native audio fails closed unless the helper proves the Electron
  process tree is excluded for display capture or only the selected process tree
  is included for application capture. The helper receives an allowlisted
  environment and neither request payloads nor raw stderr are logged. Only the
  nine existing 854×480/1280×720/1920×1080 at 15/30/60 quality/bitrate tuples
  are accepted. A protocol fault, unknown response, oversized remainder,
  timeout, or crash kills the child and fails an active share. Audio rollout is
  compiled into Electron rather than relying on an installer-time environment
  variable.
- **Validation:**
  - `pnpm format:check` — interrupted without output because the machine's
    global pnpm 11.3 shim stalls while the project requests pnpm 11.17; the
    equivalent project-local checks below ran directly.
  - `./node_modules/.bin/prettier --check .` — passed.
  - `./node_modules/.bin/eslint . --max-warnings=0` — passed.
  - Renderer, Node, Electron, and Electron-test strict TypeScript commands —
    passed all four configurations.
  - `./node_modules/.bin/vitest run` — passed 91 files / 547 tests, including
    helper handshake/correlation/malformed/timeout/crash/line-bound/URL/gate
    coverage, restartable window teardown, and renderer downgrade/cleanup
    behavior.
  - `node --test scripts/*.test.mjs` — passed 60/60 source, rollout, CI, and
    packaging contract tests.
  - `cargo test --locked --manifest-path native/screen-share-helper/Cargo.toml
--quiet` — passed 13 library tests plus 1 binary test; doc tests had 0.
  - Locked `cargo fmt --check`/Clippy checks — passed.
  - `cargo build --release --locked --manifest-path
native/screen-share-helper/Cargo.toml` — the sandboxed attempt failed only
    because DNS could not download LiveKit's pinned WebRTC archive; the approved
    network retry passed and produced an Apple Silicon Mach-O helper.
  - `cargo clean -p apple-metal --release` followed by the locked standard
    release build — passed. `cargo tree --locked -i apple-metal` resolved only
    0.6.0; staged and packaged helper `otool`/`strings` checks found no
    MetalFX/MTLFX linkage or symbols, and `vtool -show-build` reported macOS
    `minos 11.0`.
  - Direct packaged-path helper pipe smoke — passed hello → ready → capabilities
    → shutting-down → shutdown with correlated responses and exit 0.
  - `./node_modules/.bin/vite build` and Electron compile — passed; Vite retains
    the existing non-blocking large-chunk warning.
  - `./node_modules/.bin/electron-builder --publish never` — passed native
    rebuild, ad-hoc deep signing, Apple Silicon ZIP/DMG, and block maps after the
    approved download. The packaged arm64 helper exists and is executable at
    `Bakbak.app/Contents/Resources/native/bakbak-screen-share-helper`;
    `codesign --verify --deep --strict` passed. Notarization was skipped without
    credentials. After the clean native rebuild, the full Apple Silicon ZIP/DMG
    and block maps were regenerated successfully and the packaged helper passed
    the dependency and signing checks again.
  - `node scripts/check-bundle-secrets.mjs` — passed for `dist`,
    `electron-dist`, and `release`.
- **Documentation updated:** Replaced the Chromium capture contract in
  `docs/architecture.md`, added plan 0037, updated the active v1 plan, and added
  this canonical entry.
- **Known limitations:** Native audio remains disabled in ordinary and release
  builds. Installed Apple Silicon macOS and Windows x64 source/audio/permission,
  signing, teardown, helper-crash, and application-audio matrices remain open,
  as does the 30-minute three-client proof that the presenter hears no self
  return and every remote speaker exactly once. Windows packaging runs only in
  CI. The MetalFX/load-floor and ScreenCaptureKit stop-audio results are local
  binary/unit evidence, not substitutes for that installed capture matrix. The
  local macOS package is ad-hoc signed and intentionally not notarized.
- **Next:** Build the exact-revision stabilization candidate on both supported
  runners, complete plan 0037's installed matrices and three-client observation,
  then record the evidence before enabling native audio in release builds.
