begin;

alter table public.channels
add column archived_at timestamptz;

alter table public.channel_categories
add column archived_at timestamptz;

drop index public.channels_server_kind_name_key;
drop index public.channels_category_position_key;
drop index public.channels_server_system_purpose_key;
drop index public.channel_categories_server_name_key;
drop index public.channel_categories_server_position_key;

create unique index channels_server_kind_name_key
on public.channels (server_id, kind, lower(name))
where archived_at is null;

create unique index channels_category_position_key
on public.channels (category_id, position)
where category_id is not null and archived_at is null;

create unique index channels_server_system_purpose_key
on public.channels (server_id, purpose)
where purpose <> 'chat' and archived_at is null;

create index channels_server_active_position_idx
on public.channels (server_id, category_id, position, id)
where archived_at is null;

create unique index channel_categories_server_name_key
on public.channel_categories (server_id, lower(name))
where archived_at is null;

create unique index channel_categories_server_position_key
on public.channel_categories (server_id, position)
where archived_at is null;

create index channel_categories_server_active_position_idx
on public.channel_categories (server_id, position, id)
where archived_at is null;

-- End active calls before hiding their old room identity. Historical presence
-- rows remain useful as ordinary online/away state.
update public.presence_heartbeats as heartbeat
set
  voice_channel_id = null,
  voice_joined_at = null,
  is_streaming = false
where heartbeat.server_id = '00000000-0000-4000-8000-000000000001'
  and heartbeat.voice_channel_id is not null;

update public.channels
set archived_at = statement_timestamp()
where server_id = '00000000-0000-4000-8000-000000000001'
  and archived_at is null;

update public.channel_categories
set archived_at = statement_timestamp()
where server_id = '00000000-0000-4000-8000-000000000001'
  and archived_at is null;

insert into public.channel_categories (
  id,
  server_id,
  name,
  position
)
values (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000001',
  'Channels',
  10
);

insert into public.channels (
  id,
  server_id,
  category_id,
  kind,
  name,
  position,
  purpose
)
values
  (
    '00000000-0000-4000-8000-000000000121',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000401',
    'text',
    'Welcome',
    100,
    'system-general'
  ),
  (
    '00000000-0000-4000-8000-000000000122',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000401',
    'text',
    'Chat',
    200,
    'chat'
  ),
  (
    '00000000-0000-4000-8000-000000000123',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000401',
    'text',
    'Volt',
    300,
    'chat'
  ),
  (
    '00000000-0000-4000-8000-000000000124',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000401',
    'text',
    'Random Things',
    400,
    'chat'
  ),
  (
    '00000000-0000-4000-8000-000000000125',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000401',
    'voice',
    'Game #1',
    1100,
    'chat'
  ),
  (
    '00000000-0000-4000-8000-000000000126',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000401',
    'voice',
    'Game #2',
    1200,
    'chat'
  ),
  (
    '00000000-0000-4000-8000-000000000127',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000401',
    'voice',
    'Game #3',
    1300,
    'chat'
  );

drop policy channels_select_server_members on public.channels;
create policy channels_select_server_members
on public.channels
for select
to authenticated
using (
  archived_at is null
  and (select private.is_server_member(channels.server_id))
);

drop policy channel_categories_select_server_members
on public.channel_categories;
create policy channel_categories_select_server_members
on public.channel_categories
for select
to authenticated
using (
  archived_at is null
  and (select private.is_server_member(channel_categories.server_id))
);

drop policy channel_read_states_select_own
on public.channel_read_states;
create policy channel_read_states_select_own
on public.channel_read_states
for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.channels as channel
    where channel.id = channel_read_states.channel_id
      and channel.archived_at is null
  )
);

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
      and channel.archived_at is null
      and membership.user_id = (select auth.uid())
  );
$$;

create or replace function private.guard_channel_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.channels as channel
    where channel.id = new.channel_id
      and channel.archived_at is null
  ) then
    raise exception using
      errcode = '42501',
      message = 'channel_unavailable_or_read_only';
  end if;
  if new.message_kind = 'member'
    and not exists (
      select 1
      from public.channels as channel
      where channel.id = new.channel_id
        and channel.purpose = 'chat'
        and channel.archived_at is null
    )
  then
    raise exception using
      errcode = '42501',
      message = 'channel_unavailable_or_read_only';
  end if;
  return new;
end;
$$;

drop trigger messages_guard_channel_insert on public.messages;
create trigger messages_guard_channel_insert
before insert or update on public.messages
for each row execute function private.guard_channel_message_insert();

create or replace function private.guard_system_channel_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.channel_id is not null
    and not exists (
      select 1
      from public.channels as channel
      where channel.id = new.channel_id
        and channel.purpose = 'chat'
        and channel.archived_at is null
    )
  then
    raise exception using
      errcode = '42501',
      message = 'channel_unavailable_or_read_only';
  end if;
  return new;
end;
$$;

create or replace function private.guard_system_message_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.message_id is not null
    and not exists (
      select 1
      from public.messages as message
      inner join public.channels as channel on channel.id = message.channel_id
      where message.id = new.message_id
        and message.message_kind = 'member'
        and channel.purpose = 'chat'
        and channel.archived_at is null
    )
  then
    raise exception using
      errcode = '42501',
      message = 'message_reactions_disabled';
  end if;
  return new;
end;
$$;

create or replace function private.guard_active_channel_read_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.channels as channel
    where channel.id = new.channel_id
      and channel.archived_at is null
  ) then
    raise exception using
      errcode = '42501',
      message = 'channel_archived';
  end if;
  return new;
end;
$$;

create trigger channel_read_states_guard_active_channel
before insert or update of channel_id, last_read_message_id
on public.channel_read_states
for each row execute function private.guard_active_channel_read_state();

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
  active_category_id uuid;
  next_position integer;
  created_channel public.channels%rowtype;
begin
  if requesting_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if not exists (
    select 1
    from public.memberships as membership
    where membership.server_id = p_server_id
      and membership.user_id = requesting_user_id
      and membership.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Server admin permission required.';
  end if;
  if p_kind is null then
    raise exception using errcode = '22023', message = 'Channel kind is required.';
  end if;
  normalized_name := pg_catalog.btrim(p_name);
  if normalized_name is null
    or pg_catalog.char_length(normalized_name) not between 1 and 80
  then
    raise exception using errcode = '22023', message = 'Channel name must be between 1 and 80 characters.';
  end if;

  perform 1 from public.servers where id = p_server_id for update;
  select category.id
  into active_category_id
  from public.channel_categories as category
  where category.server_id = p_server_id
    and category.archived_at is null
    and lower(category.name) = 'channels'
  order by category.position, category.id
  limit 1;
  if active_category_id is null then
    raise exception using errcode = 'P0001', message = 'active_channels_category_missing';
  end if;

  select coalesce(
    max(channel.position),
    case when p_kind = 'text' then 0 else 1000 end
  ) + 100
  into next_position
  from public.channels as channel
  where channel.server_id = p_server_id
    and channel.category_id = active_category_id
    and channel.kind = p_kind
    and channel.archived_at is null;

  begin
    insert into public.channels (
      server_id, category_id, kind, name, position, purpose
    )
    values (
      p_server_id,
      active_category_id,
      p_kind,
      normalized_name,
      next_position,
      'chat'
    )
    returning * into created_channel;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'channel_name_unavailable';
  end;

  return next created_channel;
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
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select channel.*
  into renamed_channel
  from public.channels as channel
  inner join public.memberships as membership
    on membership.server_id = channel.server_id
  where channel.id = p_channel_id
    and channel.archived_at is null
    and channel.purpose = 'chat'
    and membership.user_id = requesting_user_id
    and membership.role = 'admin'
  for update of channel, membership;
  if not found then
    raise exception using errcode = '42501', message = 'Channel unavailable or admin permission required.';
  end if;

  normalized_name := pg_catalog.btrim(p_name);
  if normalized_name is null
    or pg_catalog.char_length(normalized_name) not between 1 and 80
  then
    raise exception using errcode = '22023', message = 'Channel name must be between 1 and 80 characters.';
  end if;

  begin
    update public.channels
    set name = normalized_name
    where id = p_channel_id
    returning * into renamed_channel;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'channel_name_unavailable';
  end;

  return next renamed_channel;
end;
$$;

create or replace function private.handle_membership_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  welcome_channel_id uuid;
  member_name text;
  welcome_message public.messages%rowtype;
begin
  select channel.id
  into welcome_channel_id
  from public.channels as channel
  where channel.server_id = new.server_id
    and channel.purpose = 'system-general'
    and channel.archived_at is null
  order by channel.created_at
  limit 1;

  select profile.display_name into member_name
  from public.profiles as profile
  where profile.id = new.user_id;

  if welcome_channel_id is not null then
    insert into public.messages (
      channel_id, author_id, body, content, created_at, message_kind,
      system_event, automation_key
    )
    values (
      welcome_channel_id,
      null,
      'Welcome ' || coalesce(member_name, 'Friend') || ' to Bakbak!',
      jsonb_build_array(jsonb_build_object(
        'type', 'text', 'text',
        'Welcome ' || coalesce(member_name, 'Friend') || ' to Bakbak!'
      )),
      new.joined_at,
      'system',
      jsonb_build_object(
        'type', 'member_joined',
        'member_id', new.user_id,
        'member_name', coalesce(member_name, 'Friend'),
        'joined_at', new.joined_at
      ),
      'member-joined:' || new.server_id::text || ':' || new.user_id::text
        || ':' || extract(epoch from new.joined_at)::text
    )
    on conflict (channel_id, automation_key)
      where automation_key is not null
    do update set automation_key = excluded.automation_key
    returning * into welcome_message;
  end if;

  insert into public.channel_read_states (
    user_id, channel_id, last_read_message_id
  )
  select new.user_id, channel.id, latest.id
  from public.channels as channel
  inner join lateral (
    select message.id
    from public.messages as message
    where message.channel_id = channel.id
      and message.deleted_at is null
    order by message.created_at desc, message.id desc
    limit 1
  ) as latest on true
  where channel.server_id = new.server_id
    and channel.archived_at is null
  on conflict (user_id, channel_id) do update set
    last_read_message_id = excluded.last_read_message_id,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.get_channel_activity(p_server_id uuid)
returns table (
  channel_id uuid,
  latest_message_id uuid,
  last_read_message_id uuid,
  has_unread boolean
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  requesting_user_id uuid := (select auth.uid());
begin
  if requesting_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if not exists (
    select 1 from public.memberships
    where server_id = p_server_id and user_id = requesting_user_id
  ) then
    raise exception using errcode = '42501', message = 'Server membership required.';
  end if;

  return query
  select
    channel.id,
    latest.id,
    state.last_read_message_id,
    exists (
      select 1
      from public.messages as unread
      left join public.messages as read_message
        on read_message.id = state.last_read_message_id
      where unread.channel_id = channel.id
        and unread.deleted_at is null
        and unread.author_id is distinct from requesting_user_id
        and (
          read_message.id is null
          or (unread.created_at, unread.id)
            > (read_message.created_at, read_message.id)
        )
    )
  from public.channels as channel
  left join lateral (
    select message.id
    from public.messages as message
    where message.channel_id = channel.id
      and message.deleted_at is null
    order by message.created_at desc, message.id desc
    limit 1
  ) as latest on true
  left join public.channel_read_states as state
    on state.channel_id = channel.id
    and state.user_id = requesting_user_id
  where channel.server_id = p_server_id
    and channel.archived_at is null
  order by channel.position, channel.id;
end;
$$;

create or replace function public.get_voice_join_context(p_channel_id uuid)
returns table (
  channel_id uuid,
  server_id uuid,
  display_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select channel.id, channel.server_id, profile.display_name
  from public.channels as channel
  join public.memberships as membership
    on membership.server_id = channel.server_id
    and membership.user_id = auth.uid()
  join public.profiles as profile on profile.id = auth.uid()
  where channel.id = p_channel_id
    and channel.kind = 'voice'
    and channel.archived_at is null
  limit 1
$$;

create or replace function public.heartbeat_presence_v2(
  p_server_id uuid,
  p_voice_channel_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  heartbeat_at timestamptz := statement_timestamp();
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if not exists (
    select 1 from public.memberships
    where server_id = p_server_id and user_id = (select auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'Server membership required.';
  end if;
  if p_voice_channel_id is not null and not exists (
    select 1 from public.channels
    where id = p_voice_channel_id
      and server_id = p_server_id
      and kind = 'voice'
      and archived_at is null
  ) then
    raise exception using errcode = '22023', message = 'Voice channel is invalid.';
  end if;

  insert into public.presence_heartbeats (
    server_id, user_id, last_seen_at, voice_channel_id, voice_joined_at,
    is_streaming
  )
  values (
    p_server_id,
    (select auth.uid()),
    heartbeat_at,
    p_voice_channel_id,
    case when p_voice_channel_id is null then null else heartbeat_at end,
    false
  )
  on conflict (server_id, user_id) do update set
    last_seen_at = excluded.last_seen_at,
    voice_channel_id = excluded.voice_channel_id,
    voice_joined_at = case
      when excluded.voice_channel_id is null then null
      when public.presence_heartbeats.voice_channel_id = excluded.voice_channel_id
        then public.presence_heartbeats.voice_joined_at
      else excluded.voice_joined_at
    end,
    is_streaming = false;
  return heartbeat_at;
end;
$$;

create or replace function public.heartbeat_presence_v3(
  p_server_id uuid,
  p_voice_channel_id uuid,
  p_is_streaming boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  heartbeat_at timestamptz := statement_timestamp();
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if not exists (
    select 1 from public.memberships
    where server_id = p_server_id and user_id = (select auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'Server membership required.';
  end if;
  if p_voice_channel_id is not null and not exists (
    select 1 from public.channels
    where id = p_voice_channel_id
      and server_id = p_server_id
      and kind = 'voice'
      and archived_at is null
  ) then
    raise exception using errcode = '22023', message = 'Voice channel is invalid.';
  end if;
  if coalesce(p_is_streaming, false) and p_voice_channel_id is null then
    raise exception using errcode = '22023', message = 'Streaming requires an active voice channel.';
  end if;

  insert into public.presence_heartbeats (
    server_id, user_id, last_seen_at, voice_channel_id, voice_joined_at,
    is_streaming
  )
  values (
    p_server_id,
    (select auth.uid()),
    heartbeat_at,
    p_voice_channel_id,
    case when p_voice_channel_id is null then null else heartbeat_at end,
    coalesce(p_is_streaming, false)
  )
  on conflict (server_id, user_id) do update set
    last_seen_at = excluded.last_seen_at,
    voice_channel_id = excluded.voice_channel_id,
    voice_joined_at = case
      when excluded.voice_channel_id is null then null
      when public.presence_heartbeats.voice_channel_id = excluded.voice_channel_id
        then public.presence_heartbeats.voice_joined_at
      else excluded.voice_joined_at
    end,
    is_streaming = excluded.is_streaming;
  return heartbeat_at;
end;
$$;

drop function public.publish_system_release(
  bigint,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean
);

revoke all privileges on function private.guard_active_channel_read_state()
from public, anon, authenticated;

commit;
