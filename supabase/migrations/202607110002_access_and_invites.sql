begin;

create or replace function private.is_server_member(p_server_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships as membership
    where membership.server_id = p_server_id
      and membership.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_read_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_profile_id = (select auth.uid())
    or exists (
      select 1
      from public.memberships as mine
      inner join public.memberships as theirs
        on theirs.server_id = mine.server_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = p_profile_id
    );
$$;

create or replace function private.can_access_channel(
  p_channel_id uuid,
  p_expected_kind public.channel_kind
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.channels as channel
    inner join public.memberships as membership
      on membership.server_id = channel.server_id
    where channel.id = p_channel_id
      and channel.kind = p_expected_kind
      and membership.user_id = (select auth.uid())
  );
$$;

create or replace function private.normalize_invite_code(p_code text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.upper(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_code),
      '[^A-Za-z0-9]',
      '',
      'g'
    )
  );
$$;

create or replace function private.hash_invite_code(p_code text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(private.normalize_invite_code(p_code), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function private.issue_invite_code(
  p_server_id uuid,
  p_created_by uuid,
  p_expires_at timestamptz default now() + interval '7 days'
)
returns table (
  invite_id uuid,
  plaintext_code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  random_hex text;
  generated_code text;
  generated_id uuid;
begin
  if p_expires_at <= statement_timestamp() then
    raise exception using
      errcode = '22023',
      message = 'Invite expiration must be in the future.';
  end if;

  if not exists (
    select 1
    from public.memberships as membership
    where membership.server_id = p_server_id
      and membership.user_id = p_created_by
      and membership.role = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only a server admin can be recorded as the invite issuer.';
  end if;

  loop
    random_hex := pg_catalog.upper(
      pg_catalog.encode(extensions.gen_random_bytes(16), 'hex')
    );
    generated_code := pg_catalog.concat(
      'BK-',
      pg_catalog.substr(random_hex, 1, 8),
      '-',
      pg_catalog.substr(random_hex, 9, 8),
      '-',
      pg_catalog.substr(random_hex, 17, 8),
      '-',
      pg_catalog.substr(random_hex, 25, 8)
    );

    begin
      insert into public.invite_codes (
        server_id,
        code_hash,
        created_by,
        expires_at
      )
      values (
        p_server_id,
        private.hash_invite_code(generated_code),
        p_created_by,
        p_expires_at
      )
      returning id into generated_id;

      exit;
    exception
      when unique_violation then
        -- A 128-bit collision is extraordinarily unlikely, but retrying makes
        -- the function correct even if it ever happens.
    end;
  end loop;

  invite_id := generated_id;
  plaintext_code := generated_code;
  expires_at := p_expires_at;
  return next;
end;
$$;

create or replace function public.redeem_invite_code(p_code text)
returns table (
  server_id uuid,
  server_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  normalized_code text;
  requested_hash text;
  invite public.invite_codes%rowtype;
  membership_created boolean := false;
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  normalized_code := private.normalize_invite_code(p_code);

  if normalized_code !~ '^BK[0-9A-F]{32}$' then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_or_unavailable_invite';
  end if;

  requested_hash := private.hash_invite_code(normalized_code);

  select candidate.*
  into invite
  from public.invite_codes as candidate
  where candidate.code_hash = requested_hash
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_or_unavailable_invite';
  end if;

  if invite.used_at is not null then
    if invite.used_by = requesting_user_id
      and exists (
        select 1
        from public.memberships as membership
        where membership.server_id = invite.server_id
          and membership.user_id = requesting_user_id
      )
    then
      return query
      select server.id, server.name
      from public.servers as server
      where server.id = invite.server_id;
      return;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'invalid_or_unavailable_invite';
  end if;

  if invite.revoked_at is not null
    or invite.expires_at <= statement_timestamp()
  then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_or_unavailable_invite';
  end if;

  if exists (
    select 1
    from public.memberships as membership
    where membership.server_id = invite.server_id
      and membership.user_id = requesting_user_id
  ) then
    return query
    select server.id, server.name
    from public.servers as server
    where server.id = invite.server_id;
    return;
  end if;

  insert into public.memberships (server_id, user_id, role)
  values (invite.server_id, requesting_user_id, 'member')
  on conflict on constraint memberships_pkey do nothing
  returning true into membership_created;

  -- Two different invite codes can be redeemed for the same user at the same
  -- time. If another transaction created the membership first, keep this code
  -- unused and return the now-existing membership instead of wasting two codes.
  if not coalesce(membership_created, false) then
    return query
    select server.id, server.name
    from public.servers as server
    where server.id = invite.server_id;
    return;
  end if;

  update public.invite_codes
  set
    used_at = statement_timestamp(),
    used_by = requesting_user_id
  where id = invite.id;

  return query
  select server.id, server.name
  from public.servers as server
  where server.id = invite.server_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.memberships enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.invite_codes enable row level security;

revoke all privileges on table public.profiles from anon, authenticated;
revoke all privileges on table public.servers from anon, authenticated;
revoke all privileges on table public.memberships from anon, authenticated;
revoke all privileges on table public.channels from anon, authenticated;
revoke all privileges on table public.messages from anon, authenticated;
revoke all privileges on table public.invite_codes from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;
grant select on table public.servers to authenticated;
grant select on table public.memberships to authenticated;
grant select on table public.channels to authenticated;
grant select on table public.messages to authenticated;
grant insert (channel_id, body) on table public.messages to authenticated;

create policy profiles_select_visible_members
on public.profiles
for select
to authenticated
using ((select private.can_read_profile(profiles.id)));

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (profiles.id = (select auth.uid()))
with check (profiles.id = (select auth.uid()));

create policy servers_select_members
on public.servers
for select
to authenticated
using ((select private.is_server_member(servers.id)));

create policy memberships_select_server_members
on public.memberships
for select
to authenticated
using ((select private.is_server_member(memberships.server_id)));

create policy channels_select_server_members
on public.channels
for select
to authenticated
using ((select private.is_server_member(channels.server_id)));

create policy messages_select_text_channel_members
on public.messages
for select
to authenticated
using (
  (select private.can_access_channel(messages.channel_id, 'text'))
);

create policy messages_insert_text_channel_members
on public.messages
for insert
to authenticated
with check (
  messages.author_id = (select auth.uid())
  and (select private.can_access_channel(messages.channel_id, 'text'))
);

revoke all privileges on all functions in schema private
from public, anon, authenticated;
revoke all privileges on function public.redeem_invite_code(text)
from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_server_member(uuid) to authenticated;
grant execute on function private.can_read_profile(uuid) to authenticated;
grant execute on function private.can_access_channel(uuid, public.channel_kind)
to authenticated;
grant execute on function public.redeem_invite_code(text) to authenticated;

alter default privileges in schema public
revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private
revoke execute on functions from public, anon, authenticated;

commit;
