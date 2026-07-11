# Bakbak repository working agreement

This file is the durable contract for every human or coding agent working in
this repository. Follow it before changing code, configuration, schemas, or
documentation.

## Start every task with context

Read these files, in this order:

1. `docs/architecture.md` for the current system boundaries, structure, data
   flow, environment variables, and backend contracts.
2. The newest entry in `docs/progress.md` for the actual state of the work,
   validation results, limitations, and next step.
3. The active phase in `docs/plans/0001-bakbak-desktop-v1.md` for accepted
   scope and completion criteria.

Inspect the working tree before editing. Preserve unrelated changes and never
assume that an unchecked plan item has already been implemented.

## One mandatory work log

`docs/progress.md` is the single canonical chronological work log. Every task
that changes the repository must append one entry before handoff. Do not create
parallel status, session, handoff, or TODO log files. Computers are excellent
at forgetting things in suspiciously high resolution; this log is how Bakbak
avoids joining them.

An entry must include:

- date and a short task title;
- completed work;
- key decisions and their rationale;
- validation commands and exact outcomes;
- documentation changed;
- known limitations or failed/skipped checks; and
- the next concrete phase or task.

Append corrections in a new entry instead of rewriting old entries. Never
claim a check passed unless it ran successfully in the current working tree.

Other documentation is updated only when relevant:

- Update `docs/architecture.md` when behavior, architecture, setup, folder
  ownership, services, data flow, environment variables, or endpoints change.
- Update the active plan when scope changes or an acceptance criterion is
  genuinely completed. A file existing is not proof that a phase works.
- Update user-facing setup documentation when developer or friend-test setup
  changes.

## Product and technical contract

- Bakbak is a private desktop app for 5–10 friends.
- Use `pnpm`; do not introduce npm, Yarn, or Bun lockfiles.
- Use strict TypeScript, React, and Vite for the renderer and Tauri 2 for the
  desktop shell.
- Organize product code by feature under
  `src/features/{auth,server,channels,chat,voice,soundboard,settings}`.
- Put reusable UI in `src/components`, service clients and shared utilities in
  `src/lib`, and application shell/providers in `src/app`.
- Keep native Rust code, capabilities, and desktop configuration in
  `src-tauri`.
- Keep Supabase migrations, policy tests, seed/setup SQL, and Edge Functions in
  `supabase` when that phase begins.
- Preserve the v1 defaults and exclusions in the active plan. Do not quietly
  grow the scope while fixing an adjacent problem.
- Prefer small, testable modules. Keep network and desktop side effects behind
  service boundaries so permission, invite, token, and sound behavior can be
  unit-tested.

## Security rules

- Never commit passwords, private keys, access tokens, raw production invite
  codes, Supabase service-role keys, or LiveKit API secrets.
- Commit only documented placeholders in `.env.example`; keep real `.env`
  files ignored.
- Treat every `VITE_*` variable as public because Vite embeds it in the desktop
  renderer bundle.
- Supabase publishable/anonymous credentials may be client-visible, but all
  data access must still be protected by Row Level Security.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_KEY`, and
  `LIVEKIT_API_SECRET` only in platform-managed Edge Function secrets.
- Validate the signed-in user, server membership, and requested voice channel
  inside the token function before issuing a short-lived LiveKit token.
- Redeem invite codes atomically and never expose the invite-code table through
  a broad client policy.
- Do not log passwords, authorization headers, session tokens, invite codes,
  or secret values.
- Before a friend-test or distribution build, inspect the compiled application
  for forbidden service-role and LiveKit secret material.

## Required checks before handoff

Run every check that applies to the change and that the repository currently
supports:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm tauri build
```

The full Tauri bundle build is phase- and platform-dependent; if it cannot run,
record the reason. Also run focused tests for the changed feature. Database
work requires policy tests for admin, member, and non-member access. Voice or
soundboard work requires the relevant manual multi-client checks described in
the plan.

Before handoff:

1. Check the diff for unrelated changes and accidentally committed secrets.
2. Run applicable automated and manual validation.
3. Update architecture and plan documentation when their source of truth
   changed.
4. Append the mandatory `docs/progress.md` entry with truthful results.

## Progress entry template

```md
## YYYY-MM-DD — Short task title

- Completed:
- Decisions:
- Validation:
  - `command` — passed/failed/skipped with useful detail
- Documentation updated:
- Known limitations:
- Next:
```
