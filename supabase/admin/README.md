# Bakbak database bootstrap

These operations are intentionally manual for v1. Run them as the database
owner in the Supabase SQL editor or through an operator-only PostgreSQL
connection. Do not run them from the desktop app and do not commit the output.

The migrations create the default server with this stable ID:

```text
00000000-0000-4000-8000-000000000001
```

## 1. Bootstrap the first admin

Apply all migrations first, then create the initial confirmed email/password
user from Authentication in the Supabase dashboard. This operator-only step
avoids the first-admin loop: the desktop join flow expects an invite, while an
invite cannot be issued until an admin exists. The auth trigger creates the
matching `public.profiles` row. Copy the user's UUID from Authentication, then
substitute it below:

```sql
insert into public.memberships (server_id, user_id, role)
values (
  '00000000-0000-4000-8000-000000000001',
  '<AUTH_USER_UUID>',
  'admin'
)
on conflict (server_id, user_id)
do update set role = excluded.role;

update public.servers
set created_by = '<AUTH_USER_UUID>'
where id = '00000000-0000-4000-8000-000000000001'
  and created_by is null;
```

No password belongs in SQL or source control. If the `insert` finds no matching
profile, stop and confirm that the user was created after the migrations in the
same project. After promotion, sign in through Bakbak to validate the live auth
path.

## 2. Issue a single-use invite

The operator-only helper generates 128 random bits, stores only a SHA-256 hash,
and returns the plaintext once:

```sql
select *
from private.issue_invite_code(
  '00000000-0000-4000-8000-000000000001',
  '<AUTH_USER_UUID>',
  now() + interval '7 days'
);
```

Copy `plaintext_code` directly to the intended friend. It cannot be recovered
from the database afterward. Do not paste it into a tracked file, issue, or log.

## 3. Inspect or revoke invites

Hashes and audit metadata are safe for operator inspection; they are not useful
to desktop clients and the table has no client privileges.

```sql
select id, server_id, created_at, expires_at, revoked_at, used_at, used_by
from public.invite_codes
order by created_at desc;
```

Revoke an unused code by ID:

```sql
update public.invite_codes
set revoked_at = now()
where id = '<INVITE_UUID>'
  and used_at is null
  and revoked_at is null;
```

## 4. Configure the LiveKit token function

Set these as Supabase Edge Function secrets, never as `VITE_` variables:

```text
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
```

For local development, copy `supabase/functions/.env.example` to an ignored
file and run the function with `supabase functions serve --env-file <file>`.
Deploy with JWT verification enabled; `supabase/config.toml` does this by
default. The client may know `VITE_LIVEKIT_URL`, but the API key and secret must
remain server-only.
