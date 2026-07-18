# Supabase backend

This directory contains Bakbak's server-authoritative data model, access rules,
single-use invite workflow, text-chat realtime publication, and protected
LiveKit token function. It also provisions the private `soundboard` Storage
bucket, Realtime-published sound catalog, and owner-private favorites. Objects
live under a server UUID prefix; only a signed-in member of that server can list
or download them. Renderer clients still cannot write Storage or directly
create/delete catalog rows. The authenticated `soundboard-manage` Edge Function
publishes locally normalized member WAV clips into the server-managed Bakbak
category and removes member objects after rechecking verified claims,
membership, quotas, format, duration, and uploader/admin authority. Members
edit only their own label/emoji metadata; server admins moderate all metadata
and sounds. Category administration remains trusted-server-only.
Private profile media uses two owner-prefixed buckets: `avatars` accepts
PNG/JPEG/WebP/GIF objects up to 5 MiB, and `profile-covers` accepts the same
types up to 10 MiB. Owners manage their objects; authenticated users may read
another person's objects only when both share a server. `avatar_path` remains
the canonical static poster for older clients, while optional animation and
cover paths live in the additive rich-profile fields.
Ordered `channel_categories` group the default server's 18 text and six voice
rooms into the seven-category Unlucky Boys layout. Categories and rooms are
member-readable, while category mutation remains operator-only.

## Local validation

The Supabase CLI requires Docker for the local stack:

```bash
pnpm dlx supabase@latest start
pnpm dlx supabase@latest db reset
pnpm dlx supabase@latest db lint --local
pnpm dlx supabase@latest test db
pnpm dlx supabase@latest functions serve livekit-token --env-file supabase/functions/.env.local
deno task --config supabase/deno.json test
deno test --allow-env --config supabase/functions/soundboard-manage/deno.json supabase/functions/tests/soundboard-manage
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
- Channel categories follow the same server-membership read boundary. Renderer
  sessions cannot create, update, or delete them.
- Membership and invite mutations happen only in audited database functions or
  through an operator connection.
- Invite plaintext is generated once and stored only as a SHA-256 hash.
- `LIVEKIT_API_SECRET` and `LIVEKIT_API_KEY` exist only in function secrets.
- The desktop chooses only a channel UUID. The function derives identity, room,
  TTL, and grants after rechecking verified claims and querying the
  security-invoker `get_voice_join_context` RPC under the caller's RLS session.
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
- Sound catalog RLS requires server membership. Column grants allow only label
  and emoji updates; RLS further requires the creator or matching server admin.
  Clients cannot assign categories or insert/delete sounds or categories.
- Favorite RLS permits only the signed-in owner to select, insert, or delete a
  row and also requires matching server membership. Same-server foreign keys
  and cascades prevent cross-server or stale favorites.
- The service-role-only upload RPC locks the server before enforcing 25 active
  member sounds per uploader and 200 per server. The management function alone
  calls it; operator sounds with null creators do not consume quota.
- Profile descriptions are plain text limited to 190 characters. Cover focal
  coordinates are required integers from 0–100. Every avatar and cover path is
  either null or begins with the authenticated owner's UUID; owner writes and
  shared-server reads are enforced independently for both private buckets.

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
pnpm dlx supabase@latest functions deploy soundboard-manage --use-api
```

Screen sharing changes only this Edge Function; no database migration is
required. Deploy the backward-compatible function before distributing a native
screen-sharing build, then repeat an unauthenticated invocation and confirm it
still returns HTTP 401.

Voice-join acceleration adds migration
`202607140001_voice_join_context.sql` and an updated function. Push the
migration before deploying that function. The RPC makes one RLS-protected
lookup for voice channel, server, membership, and display-name context;
missing, text, outsider, and cross-server requests return the same absent
result. After deployment, repeat the unauthenticated 401 probe and authenticated
member/non-member voice-token probes before distribution.

Rich profiles add migration `202607170001_rich_profiles.sql`. Push it before
distributing a renderer that selects the new profile fields. The migration is
additive, expands the existing avatar bucket, and creates `profile-covers`
without making either bucket public. After deployment, run linked schema lint,
confirm no migration remains pending, then use two authenticated accounts plus
an outsider to verify shared-server reads and cross-server denial.

The ordered channel layout adds migration
`202607180003_unlucky_boys_channel_layout.sql`. It creates seven
member-readable categories and the exact 24-room visible Discord hierarchy
without importing messages. The migration reuses the four original channel
UUIDs plus any same-name admin-created room so existing message, read-state,
presence, and voice references survive. New admin-created rooms remain
uncategorized. The migration is deployed to the hosted project; verify counts,
order, and member/outsider reads with two hosted accounts before distribution.

The soundboard bucket is private, accepts MPEG audio and normalized WAV, and
rejects objects larger than 1 MiB. Migration
`202607120002_soundboard_catalog.sql` seeds the original four ordered
categories and 23 sound rows.
`202607180001_import_unlucky_boys_soundboard.sql` adds the `Unlucky Boys`
category and 21 Discord imports, bringing the catalog to 44 sounds. Migration
`202607180002_member_soundboard.sql` transactionally consolidates those rows
into System and Bakbak, marks Bakbak as the one upload target, adds creators,
private favorites, uploader/admin metadata RLS, Realtime publication, and the
trusted quota-enforcing publication RPC. Imported objects retain stable
`discord-<Discord sound ID>.mp3` names; member objects use
`<server>/<uploader>/<uuid>.wav`.

The repository intentionally does not retain a second local copy of the 44
operator MP3s; the hosted bucket is the source of truth. Keep an
operator-controlled backup outside Git if the files need restoration.
Direct file writes and audio-field changes remain denied to client sessions;
do not add client upload policies or put a service-role credential in the
renderer. Deploy the migration before `soundboard-manage`, then run linked lint,
an unauthenticated 401 probe, member/outsider upload probes, uploader/admin/
other-member delete probes, and a final Storage/catalog cleanup check.

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
