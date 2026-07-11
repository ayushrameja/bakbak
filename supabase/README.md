# Supabase backend

This directory contains Bakbak's server-authoritative data model, access rules,
single-use invite workflow, text-chat realtime publication, and protected
LiveKit token function.

## Local validation

The Supabase CLI requires Docker for the local stack:

```bash
pnpm dlx supabase@latest start
pnpm dlx supabase@latest db reset
pnpm dlx supabase@latest db lint --local
pnpm dlx supabase@latest test db
pnpm dlx supabase@latest functions serve livekit-token --env-file supabase/functions/.env.local
deno task --config supabase/deno.json test
```

Use a git-ignored environment file copied from
`supabase/functions/.env.example`. The example values cannot sign a real token.

When Docker uses Colima and the optional vector container cannot mount the host
Docker socket, start with
`pnpm dlx supabase@latest start --exclude vector`. Database, RLS, Realtime,
Auth, and Edge Function validation do not depend on that analytics container.

For an end-to-end function check, create two local auth users, add only one as a
member, and invoke `livekit-token` with each session. The member must receive a
five-minute, microphone-only room token; the non-member must receive the same
404 used for a missing or text channel.

## Security invariants

- Unauthenticated roles receive no app-table privileges.
- Authenticated users can read only servers they have joined, and messages only
  in member-visible text channels.
- Membership and invite mutations happen only in audited database functions or
  through an operator connection.
- Invite plaintext is generated once and stored only as a SHA-256 hash.
- `LIVEKIT_API_SECRET` and `LIVEKIT_API_KEY` exist only in function secrets.
- The desktop chooses only a channel UUID. The function derives identity, room,
  TTL, and grants after rechecking authentication and membership.
- Online status uses the membership-checked `heartbeat_presence` RPC and an
  RLS-filtered `presence_heartbeats` table. Clients cannot forge heartbeat rows
  directly, and Postgres Realtime distributes row changes to server members.
- Tokens permit microphone audio plus LiveKit data messages for the bundled
  soundboard. Camera and screen-share sources are not granted in v1.

## Hosted deployment

Use migration-aware CLI deployment instead of pasting tracked files into the
hosted SQL editor:

```bash
pnpm dlx supabase@latest login
pnpm dlx supabase@latest link --project-ref <PROJECT_REF>
pnpm dlx supabase@latest db push --dry-run
pnpm dlx supabase@latest db push
pnpm dlx supabase@latest migration list
pnpm dlx supabase@latest functions deploy livekit-token
```

Keep `verify_jwt = true` from `supabase/config.toml`. Set `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` through the hosted Edge Function
Secrets dashboard before invoking the function. Do not pass secret values on a
shell command line or place them in renderer environment files.

## Important integration assumption

Signup happens before invite redemption. An account without a valid invite can
exist in Supabase Auth, but RLS lets it see only its own profile and no Bakbak
server, channel, membership, or message rows. This keeps private content gated
without putting an admin secret in the desktop signup flow.
