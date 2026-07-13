begin;

alter table public.profiles
add column avatar_path text,
add constraint profiles_avatar_path_owner_check check (
  avatar_path is null
  or avatar_path ~ (
    '^'
    || id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

grant update (avatar_path) on table public.profiles to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "avatar owners can read objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

create policy "shared server members can read avatar objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  and exists (
    select 1
    from public.memberships as mine
    inner join public.memberships as theirs
      on theirs.server_id = mine.server_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id::text = (storage.foldername(name))[1]
  )
);

create policy "avatar owners can insert objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

create policy "avatar owners can update objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
)
with check (
  bucket_id = 'avatars'
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

create policy "avatar owners can delete objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

alter table public.channels
add constraint channels_name_trimmed check (name = btrim(name));

create or replace function public.create_channel(
  p_server_id uuid,
  p_kind public.channel_kind,
  p_name text
)
returns setof public.channels
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  normalized_name text;
  next_position integer;
  created_channel public.channels%rowtype;
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  perform 1
  from public.memberships as membership
  where membership.server_id = p_server_id
    and membership.user_id = requesting_user_id
    and membership.role = 'admin'
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Server admin permission required.';
  end if;

  if p_kind is null then
    raise exception using
      errcode = '22023',
      message = 'Channel kind is required.';
  end if;

  normalized_name := pg_catalog.btrim(p_name);
  if normalized_name is null
    or pg_catalog.char_length(normalized_name) not between 1 and 80
  then
    raise exception using
      errcode = '22023',
      message = 'Channel name must be between 1 and 80 characters.';
  end if;

  perform 1
  from public.servers as server
  where server.id = p_server_id
  for update;

  select coalesce(max(channel.position), 0) + 10
  into next_position
  from public.channels as channel
  where channel.server_id = p_server_id
    and channel.kind = p_kind;

  begin
    insert into public.channels (server_id, kind, name, position)
    values (p_server_id, p_kind, normalized_name, next_position)
    returning * into created_channel;
  exception
    when unique_violation then
      raise exception using
        errcode = '23505',
        message = 'channel_name_unavailable';
  end;

  return next created_channel;
  return;
end;
$$;

create or replace function public.rename_channel(
  p_channel_id uuid,
  p_name text
)
returns setof public.channels
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  normalized_name text;
  renamed_channel public.channels%rowtype;
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  select channel.*
  into renamed_channel
  from public.channels as channel
  inner join public.memberships as membership
    on membership.server_id = channel.server_id
  where channel.id = p_channel_id
    and membership.user_id = requesting_user_id
    and membership.role = 'admin'
  for update of channel, membership;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Channel unavailable or admin permission required.';
  end if;

  normalized_name := pg_catalog.btrim(p_name);
  if normalized_name is null
    or pg_catalog.char_length(normalized_name) not between 1 and 80
  then
    raise exception using
      errcode = '22023',
      message = 'Channel name must be between 1 and 80 characters.';
  end if;

  begin
    update public.channels
    set name = normalized_name
    where id = p_channel_id
    returning * into renamed_channel;
  exception
    when unique_violation then
      raise exception using
        errcode = '23505',
        message = 'channel_name_unavailable';
  end;

  return next renamed_channel;
  return;
end;
$$;

revoke all privileges on function public.create_channel(
  uuid,
  public.channel_kind,
  text
)
from public, anon, authenticated;
revoke all privileges on function public.rename_channel(uuid, text)
from public, anon, authenticated;

grant execute on function public.create_channel(
  uuid,
  public.channel_kind,
  text
)
to authenticated;
grant execute on function public.rename_channel(uuid, text)
to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) then
    execute 'create publication supabase_realtime';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'channels'
  ) then
    execute 'alter publication supabase_realtime add table public.channels';
  end if;
end;
$$;

commit;
