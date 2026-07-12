# Supabase backend

This directory contains Bakbak's server-authoritative data model, access rules,
single-use invite workflow, text-chat realtime publication, and protected
LiveKit token function. It also provisions the private, operator-managed
`soundboard` Storage bucket and the Realtime-published sound catalog. Objects
live under a server UUID prefix; only a signed-in member of that server can list
or download them, and renderer clients cannot upload, replace, or delete
sounds. Members may edit a catalog sound's label, emoji, and same-server
category; all audio fields and category administration remain operator-only.

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
member, and invoke `livekit-token` with each session. An omitted `purpose` must
return the backward-compatible five-minute voice token; `purpose:
"screen_share"` must return a companion token limited to screen video/audio
publication with no subscriptions or data. The non-member must receive the
same 404 used for a missing or text channel.

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
- Online and voice-room status use the membership-checked
  `heartbeat_presence_v2` RPC and an RLS-filtered `presence_heartbeats` table.
  The original `heartbeat_presence` RPC remains for older installed builds.
  Clients cannot forge heartbeat rows or join timestamps directly, and
  Postgres Realtime distributes row changes to server members.
- Voice tokens permit microphone, camera, LiveKit data messages, and a
  video-only screen source for installed-client fallback. The renderer
  publishes its persistent `bakbak-soundboard` audio track as a second named
  microphone-source track because the current LiveKit server SDK cannot encode
  `Track.Source.Unknown` in source-restricted grants. Screen-companion tokens
  use a server-generated identity plus owner metadata and permit only
  `screen_share` and `screen_share_audio`, with subscriptions, data publishing,
  and metadata updates disabled.
- Sound catalog RLS requires server membership. Column grants allow only label,
  emoji, and category metadata updates, while a composite foreign key rejects
  categories from another server. Clients cannot insert or delete sounds or
  categories.

## Hosted deployment

Use migration-aware CLI deployment instead of pasting tracked files into the
hosted SQL editor:

```bash
pnpm dlx supabase@latest login
pnpm dlx supabase@latest link --project-ref <PROJECT_REF>
pnpm dlx supabase@latest db push --dry-run
pnpm dlx supabase@latest db push
pnpm dlx supabase@latest migration list
pnpm dlx supabase@latest functions deploy livekit-token --use-api
```

Screen sharing changes only this Edge Function; no database migration is
required. Deploy the backward-compatible function before distributing a native
screen-sharing build, then repeat an unauthenticated invocation and confirm it
still returns HTTP 401.

The bucket is private, accepts only `audio/mpeg`, and rejects objects larger
than 1 MiB. Migration `202607120002_soundboard_catalog.sql` seeds the four
ordered categories and 23 sound rows whose `storage_path` values match these
objects. The repository intentionally does not retain a second local copy of
the MP3s; the hosted bucket is the source of truth. Keep an operator-controlled
backup outside Git if the files need to be restored or copied to another
project. File writes and audio-field changes remain operator deployment steps;
do not add client upload policies or put a service-role credential in the
renderer.

Keep `verify_jwt = true` from `supabase/config.toml`. Set `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` through the hosted Edge Function
Secrets dashboard before invoking the function. Do not pass secret values on a
shell command line or place them in renderer environment files.

`--use-api` uses Supabase's server-side bundler and avoids a macOS CLI
`output.eszip` temporary-file race observed with the default local bundler.

## Important integration assumption

Signup happens before invite redemption. An account without a valid invite can
exist in Supabase Auth, but RLS lets it see only its own profile and no Bakbak
server, channel, membership, or message rows. This keeps private content gated
without putting an admin secret in the desktop signup flow.
