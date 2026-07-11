# 0001 — Bakbak desktop v1

- **Status:** Active
- **Approved:** 2026-07-11
- **Target users:** One private group of 5–10 friends
- **Primary platform:** macOS first; Windows and Linux after friend testing
- **First usable release:** Voice, persistent text chat, and a bundled
  synchronized soundboard

## Summary

Build Bakbak as a private desktop app for 5–10 friends using **pnpm,
TypeScript, Tauri 2, React, and Vite**. The collaborative chat remains the
product and technical guide, while the repository keeps a durable record of
plans, decisions, completed work, and verification results so future work
starts with context instead of archaeological guessing.

## Project memory and agent rules

- Keep `AGENTS.md` at the repository root as the working contract for every
  future coding task. It records the current architecture and technology
  choices, security rules, required handoff checks, and documentation duties.
- Store approved plans as numbered files in `docs/plans`, beginning with this
  file.
- Maintain `docs/progress.md` as the one mandatory, append-only work log. Every
  entry records the date, completed work, key decisions, validation performed,
  known limitations, and next phase.
- Maintain `docs/architecture.md` as the current source of truth for folder
  structure, services, data flow, environment-variable names, and backend
  endpoints.
- Every implementation task must append to `docs/progress.md` before handoff.
  Update the architecture document and this plan when the task changes their
  source of truth. There is no “I’ll remember it” strategy.

## Accepted architecture and structure

- Use one pnpm application with strict TypeScript.
- Use Tauri 2 as the desktop shell and React + Vite as the UI layer.
- Organize frontend code by feature under
  `src/features/{auth,server,channels,chat,voice,soundboard,settings}`.
- Place shared UI in `src/components`, service clients in `src/lib`, and the
  application shell/providers in `src/app`.
- Keep native configuration and Rust code isolated in `src-tauri`.
- Use a dark, calm, polished desktop interface with a server rail, channel
  sidebar, main content area, and persistent voice controls.
- Commit `.env.example` only. Use ignored `.env` files locally and
  platform-managed secrets for backend functions.

## Defaults

- One private server with multiple text and voice rooms.
- Email/password authentication plus a single-use invite code.
- One seeded admin; all invited users become members.
- macOS first; Windows and Linux afterward.
- The first usable release includes voice, text, and a bundled soundboard.

## Phased implementation

Completion checkboxes describe verified outcomes, not merely created files.
Each phase also requires the documentation and checks listed later in this
plan.

### Phase 1 — Foundation: no secrets

- [x] Create the official pnpm + TypeScript + Tauri 2 + React + Vite scaffold.
- [x] Replace generated product metadata and starter content with Bakbak.
- [x] Add the feature-based folder structure and service boundaries.
- [x] Add mock data for one server with text and voice rooms.
- [x] Add local interaction states without a backend or committed secrets.
- [x] Build the dark desktop foundation: server rail, channel sidebar, main
      content area, and persistent voice controls.
- [x] Add linting, formatting, typechecking, and unit-test commands.
- [x] Add meaningful foundation tests and make all required checks pass.
- [x] Commit `.env.example` with placeholders and confirm local env files are
      ignored.
- [x] Record the approved plan and initial architecture/project-memory rules.
- [x] Record final Phase 1 validation and mark the phase complete.

### Phase 2 — Accounts and private access

- [x] Connect Supabase email/password authentication.
- [x] Create profiles, servers, memberships, channels, messages, and
      single-use `invite_codes`.
- [x] Implement atomic single-use invite redemption.
- [x] Provide the secure first-admin bootstrap and initial invite-code workflow
      with operator-run SQL; defer an admin UI.
- [x] Apply Row Level Security so only members can access their rooms and
      messages.
- [x] Unit-test invite validation and permissions.
- [x] Test Supabase policies as an admin, member, and non-member.
- [x] Update architecture, plan status, and the append-only progress log.

### Phase 3 — Voice rooms

- [x] Add a protected Supabase `livekit-token` Edge Function.
- [x] Validate the signed-in member and requested voice channel before token
      issuance.
- [x] Return a short-lived room token without exposing LiveKit API secrets.
- [x] Add join/leave and microphone selection.
- [x] Add mute, deafen, participant list, and speaking state.
- [x] Add per-user volume, reconnect, and actionable error states.
- [x] Unit-test LiveKit token request handling.
- [x] Confirm no compiled desktop bundle contains a LiveKit API secret or
      Supabase service-role key.
- [x] Update architecture, plan status, and the append-only progress log.

### Phase 4 — First friend-test build

- [x] Add persistent text chat with realtime updates.
- [x] Add a bundled sound pack.
- [x] Send a LiveKit data message containing a sound ID when a soundboard action
      occurs.
- [x] Play the bundled matching clip on every connected client.
- [x] Unit-test sound dispatch.
- [ ] Manually validate login and invite redemption on macOS.
- [x] Manually validate persistent two-client text chat.
- [ ] Manually validate two-person voice, mute/deafen, device changes, and
      reconnect behavior.
- [ ] Manually validate synchronized soundboard playback.
- [ ] Update architecture, plan status, and the append-only progress log.

The first friend-test build explicitly excludes screen sharing, webcam video,
user uploads, cloud sound storage, global push-to-talk, and advanced roles.

### Phase 5 — Post-v1 improvements

- [ ] Add screen sharing without system audio.
- [ ] Add invite management UI.
- [ ] Add desktop notifications and tray controls.
- [ ] Add persisted device preferences.
- [ ] Evaluate optional global push-to-talk.
- [ ] Investigate system-audio sharing separately for each operating system.
- [ ] Update architecture, plan status, and the append-only progress log.

### Phase 6 — Distribution

- [ ] Build and validate macOS first.
- [ ] Document any initial unsigned or unnotarized installer warnings.
- [ ] Add Windows installer builds after friend testing.
- [ ] Add Linux installer builds after friend testing.
- [ ] Revisit signing and notarization after the core product is stable.
- [ ] Update architecture, plan status, and the append-only progress log.

## Test and documentation requirements

### Automated tests

- Unit-test invite validation, permissions, sound dispatch, and LiveKit token
  request handling.
- Test Supabase policies as an admin, member, and non-member.
- Keep strict TypeScript, lint, formatting, unit tests, and renderer builds
  green.
- Add focused tests with each behavior change rather than postponing all test
  work until distribution.

### Manual macOS acceptance

Before the first friend-test release, manually validate:

- login and single-use invite redemption;
- persistent text chat and realtime updates;
- two-person voice join/leave;
- mute and deafen;
- microphone/device changes;
- reconnect and error recovery; and
- synchronized soundboard playback.

### Security acceptance

- Confirm no compiled desktop bundle includes a Supabase service-role key or a
  LiveKit API secret.
- Keep all LiveKit API secrets exclusively in Edge Function secrets.
- Keep real local and hosted environment values out of source control.

### Documentation acceptance

After every phase:

1. Append completed work, decisions, validation, limitations, and the next step
   to `docs/progress.md`.
2. Revise `docs/architecture.md` if the system, setup, environment, data flow,
   or service contracts changed.
3. Mark phase criteria complete only after their required validation succeeds.

## Deferred and out of scope for v1

- Screen sharing, including system audio.
- Webcam video.
- User-uploaded sounds and cloud sound storage.
- Global push-to-talk.
- Advanced roles and permission management.
- Invite-management UI.
- Desktop notifications and tray controls.
- Windows and Linux distribution before friend testing.
- Signing and notarization before the core product is stable.
