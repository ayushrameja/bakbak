begin;

alter table public.messages
add column content jsonb;

comment on column public.messages.content is
  'Validated structured message segments. Null keeps legacy body-only messages compatible.';

create table public.channel_read_states (
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  channel_id uuid not null
    references public.channels (id) on delete cascade,
  last_read_message_id uuid not null
    references public.messages (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

create index channel_read_states_channel_idx
  on public.channel_read_states (channel_id, user_id);

alter table public.channel_read_states enable row level security;

revoke all privileges on table public.channel_read_states
from public, anon, authenticated;
grant select on table public.channel_read_states to authenticated;

create policy channel_read_states_select_own
on public.channel_read_states
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy messages_select_text_channel_members on public.messages;
drop policy messages_insert_text_channel_members on public.messages;

create policy messages_select_channel_members
on public.messages
for select
to authenticated
using (
  (select private.can_access_channel(messages.channel_id, 'text'))
  or (select private.can_access_channel(messages.channel_id, 'voice'))
);

create policy messages_insert_channel_members
on public.messages
for insert
to authenticated
with check (
  messages.author_id = (select auth.uid())
  and (
    (select private.can_access_channel(messages.channel_id, 'text'))
    or (select private.can_access_channel(messages.channel_id, 'voice'))
  )
);

create or replace function public.send_message(
  p_channel_id uuid,
  p_content jsonb
)
returns setof public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  channel_server_id uuid;
  segment jsonb;
  segment_type text;
  segment_text text;
  mentioned_user_id uuid;
  mentioned_display_name text;
  mention_count integer := 0;
  fallback_body text := '';
  normalized_content jsonb := '[]'::jsonb;
  created_message public.messages%rowtype;
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  select channel.server_id
  into channel_server_id
  from public.channels as channel
  inner join public.memberships as membership
    on membership.server_id = channel.server_id
  where channel.id = p_channel_id
    and membership.user_id = requesting_user_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Channel membership required.';
  end if;

  if p_content is null
    or pg_catalog.jsonb_typeof(p_content) <> 'array'
    or pg_catalog.jsonb_array_length(p_content) not between 1 and 100
  then
    raise exception using
      errcode = '22023',
      message = 'Message content must contain between 1 and 100 segments.';
  end if;

  for segment in
    select value from pg_catalog.jsonb_array_elements(p_content)
  loop
    if pg_catalog.jsonb_typeof(segment) <> 'object' then
      raise exception using
        errcode = '22023',
        message = 'Every message segment must be an object.';
    end if;

    segment_type := segment ->> 'type';
    if segment_type = 'text' then
      if not (segment ? 'text')
        or pg_catalog.jsonb_typeof(segment -> 'text') <> 'string'
        or segment - 'type' - 'text' <> '{}'::jsonb
      then
        raise exception using
          errcode = '22023',
          message = 'Text segments may contain only type and text.';
      end if;
      segment_text := segment ->> 'text';
      if segment_text = '' then
        continue;
      end if;
      fallback_body := fallback_body || segment_text;
      normalized_content := normalized_content || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type', 'text', 'text', segment_text)
      );
    elsif segment_type = 'mention' then
      if not (segment ? 'user_id')
        or pg_catalog.jsonb_typeof(segment -> 'user_id') <> 'string'
        or not (segment ? 'fallback')
        or pg_catalog.jsonb_typeof(segment -> 'fallback') <> 'string'
        or segment - 'type' - 'user_id' - 'fallback' <> '{}'::jsonb
      then
        raise exception using
          errcode = '22023',
          message = 'Mention segments may contain only type, user_id, and fallback.';
      end if;

      begin
        mentioned_user_id := (segment ->> 'user_id')::uuid;
      exception
        when invalid_text_representation then
          raise exception using
            errcode = '22023',
            message = 'Mention user IDs must be valid UUIDs.';
      end;

      select profile.display_name
      into mentioned_display_name
      from public.memberships as membership
      inner join public.profiles as profile on profile.id = membership.user_id
      where membership.server_id = channel_server_id
        and membership.user_id = mentioned_user_id;

      if not found then
        raise exception using
          errcode = '42501',
          message = 'Mentioned users must belong to this server.';
      end if;

      mention_count := mention_count + 1;
      if mention_count > 25 then
        raise exception using
          errcode = '22023',
          message = 'A message may contain at most 25 mentions.';
      end if;

      fallback_body := fallback_body || '@' || mentioned_display_name;
      normalized_content := normalized_content || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'type', 'mention',
          'user_id', mentioned_user_id,
          'fallback', mentioned_display_name
        )
      );
    else
      raise exception using
        errcode = '22023',
        message = 'Unsupported message segment type.';
    end if;
  end loop;

  if pg_catalog.char_length(pg_catalog.btrim(fallback_body)) not between 1 and 4000 then
    raise exception using
      errcode = '22023',
      message = 'Message body must be between 1 and 4000 characters.';
  end if;

  insert into public.messages (channel_id, author_id, body, content)
  values (
    p_channel_id,
    requesting_user_id,
    pg_catalog.btrim(fallback_body),
    normalized_content
  )
  returning * into created_message;

  return next created_message;
  return;
end;
$$;

create or replace function public.mark_channel_read(
  p_channel_id uuid,
  p_message_id uuid
)
returns setof public.channel_read_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  target_message public.messages%rowtype;
  existing_message public.messages%rowtype;
  saved_state public.channel_read_states%rowtype;
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  select message.*
  into target_message
  from public.messages as message
  inner join public.channels as channel on channel.id = message.channel_id
  inner join public.memberships as membership
    on membership.server_id = channel.server_id
  where message.id = p_message_id
    and message.channel_id = p_channel_id
    and membership.user_id = requesting_user_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Message unavailable or channel membership required.';
  end if;

  select message.*
  into existing_message
  from public.channel_read_states as state
  inner join public.messages as message
    on message.id = state.last_read_message_id
  where state.user_id = requesting_user_id
    and state.channel_id = p_channel_id;

  if found and (existing_message.created_at, existing_message.id)
    >= (target_message.created_at, target_message.id)
  then
    select state.*
    into saved_state
    from public.channel_read_states as state
    where state.user_id = requesting_user_id
      and state.channel_id = p_channel_id;
  else
    insert into public.channel_read_states (
      user_id,
      channel_id,
      last_read_message_id,
      updated_at
    )
    values (
      requesting_user_id,
      p_channel_id,
      p_message_id,
      pg_catalog.now()
    )
    on conflict (user_id, channel_id) do update set
      last_read_message_id = excluded.last_read_message_id,
      updated_at = excluded.updated_at
    returning * into saved_state;
  end if;

  return next saved_state;
  return;
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
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.memberships as membership
    where membership.server_id = p_server_id
      and membership.user_id = requesting_user_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Server membership required.';
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
    order by message.created_at desc, message.id desc
    limit 1
  ) as latest on true
  left join public.channel_read_states as state
    on state.channel_id = channel.id
    and state.user_id = requesting_user_id
  where channel.server_id = p_server_id
  order by channel.position, channel.id;
end;
$$;

create or replace function private.initialize_channel_read_states()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.channel_read_states (
    user_id,
    channel_id,
    last_read_message_id
  )
  select
    new.user_id,
    channel.id,
    latest.id
  from public.channels as channel
  inner join lateral (
    select message.id
    from public.messages as message
    where message.channel_id = channel.id
    order by message.created_at desc, message.id desc
    limit 1
  ) as latest on true
  where channel.server_id = new.server_id
  on conflict (user_id, channel_id) do nothing;

  return new;
end;
$$;

create trigger memberships_initialize_channel_read_states
after insert on public.memberships
for each row execute function private.initialize_channel_read_states();

insert into public.channel_read_states (
  user_id,
  channel_id,
  last_read_message_id
)
select
  membership.user_id,
  channel.id,
  latest.id
from public.memberships as membership
inner join public.channels as channel
  on channel.server_id = membership.server_id
inner join lateral (
  select message.id
  from public.messages as message
  where message.channel_id = channel.id
  order by message.created_at desc, message.id desc
  limit 1
) as latest on true
on conflict (user_id, channel_id) do nothing;

revoke all privileges on function public.send_message(uuid, jsonb)
from public, anon, authenticated;
revoke all privileges on function public.mark_channel_read(uuid, uuid)
from public, anon, authenticated;
revoke all privileges on function public.get_channel_activity(uuid)
from public, anon, authenticated;
revoke all privileges on function private.initialize_channel_read_states()
from public, anon, authenticated;

grant execute on function public.send_message(uuid, jsonb) to authenticated;
grant execute on function public.mark_channel_read(uuid, uuid) to authenticated;
grant execute on function public.get_channel_activity(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'channel_read_states'
  ) then
    execute 'alter publication supabase_realtime add table public.channel_read_states';
  end if;
end;
$$;

commit;
