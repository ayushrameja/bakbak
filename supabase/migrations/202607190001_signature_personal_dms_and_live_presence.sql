begin;

create table public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint direct_conversations_distinct_users check (user_a_id <> user_b_id),
  constraint direct_conversations_canonical_pair check (user_a_id < user_b_id),
  constraint direct_conversations_unique_pair unique (user_a_id, user_b_id)
);

create index direct_conversations_user_a_updated_idx
on public.direct_conversations (user_a_id, updated_at desc);

create index direct_conversations_user_b_updated_idx
on public.direct_conversations (user_b_id, updated_at desc);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.direct_conversations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  constraint direct_messages_body_length check (
    char_length(btrim(body)) between 1 and 4000
  ),
  constraint direct_messages_content_array check (
    jsonb_typeof(content) = 'array'
  )
);

create index direct_messages_conversation_created_idx
on public.direct_messages (conversation_id, created_at desc, id desc);

create table public.direct_read_states (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null
    references public.direct_conversations(id) on delete cascade,
  last_read_message_id uuid references public.direct_messages(id)
    on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_read_states enable row level security;

revoke all privileges on table public.direct_conversations
from public, anon, authenticated;
revoke all privileges on table public.direct_messages
from public, anon, authenticated;
revoke all privileges on table public.direct_read_states
from public, anon, authenticated;

grant select on table public.direct_conversations to authenticated;
grant select on table public.direct_messages to authenticated;
grant select on table public.direct_read_states to authenticated;

create or replace function private.is_direct_conversation_participant(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.direct_conversations as conversation
    where conversation.id = p_conversation_id
      and (select auth.uid()) in (
        conversation.user_a_id,
        conversation.user_b_id
      )
  );
$$;

create policy direct_conversations_select_participants
on public.direct_conversations
for select
to authenticated
using (
  (select auth.uid()) in (
    direct_conversations.user_a_id,
    direct_conversations.user_b_id
  )
);

create policy direct_messages_select_participants
on public.direct_messages
for select
to authenticated
using (
  (select private.is_direct_conversation_participant(
    direct_messages.conversation_id
  ))
);

create policy direct_read_states_select_own
on public.direct_read_states
for select
to authenticated
using (user_id = (select auth.uid()));

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
    )
    or exists (
      select 1
      from public.direct_conversations as conversation
      where (select auth.uid()) in (
        conversation.user_a_id,
        conversation.user_b_id
      )
        and p_profile_id in (
          conversation.user_a_id,
          conversation.user_b_id
        )
    );
$$;

create policy "direct conversation participants can read avatar objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  and (select private.can_read_profile(
    ((storage.foldername(name))[1])::uuid
  ))
);

create policy "direct conversation participants can read profile covers"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-covers'
  and name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  and (select private.can_read_profile(
    ((storage.foldername(name))[1])::uuid
  ))
);

create or replace function public.get_or_create_direct_conversation(
  p_target_user_id uuid
)
returns setof public.direct_conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  canonical_a uuid;
  canonical_b uuid;
  conversation public.direct_conversations%rowtype;
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  if p_target_user_id is null or p_target_user_id = requesting_user_id then
    raise exception using
      errcode = '22023',
      message = 'Choose another Bakbak member.';
  end if;

  if not exists (
    select 1
    from public.memberships as mine
    inner join public.memberships as theirs
      on theirs.server_id = mine.server_id
    where mine.user_id = requesting_user_id
      and theirs.user_id = p_target_user_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'A shared Bakbak server is required.';
  end if;

  canonical_a := least(requesting_user_id, p_target_user_id);
  canonical_b := greatest(requesting_user_id, p_target_user_id);

  insert into public.direct_conversations (user_a_id, user_b_id)
  values (canonical_a, canonical_b)
  on conflict (user_a_id, user_b_id) do nothing;

  select *
  into strict conversation
  from public.direct_conversations
  where user_a_id = canonical_a
    and user_b_id = canonical_b;

  insert into public.direct_read_states (user_id, conversation_id)
  values
    (canonical_a, conversation.id),
    (canonical_b, conversation.id)
  on conflict (user_id, conversation_id) do nothing;

  return next conversation;
  return;
end;
$$;

create or replace function public.send_direct_message(
  p_conversation_id uuid,
  p_content jsonb
)
returns setof public.direct_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  conversation public.direct_conversations%rowtype;
  segment jsonb;
  segment_type text;
  segment_text text;
  mentioned_user_id uuid;
  mentioned_display_name text;
  mention_count integer := 0;
  fallback_body text := '';
  normalized_content jsonb := '[]'::jsonb;
  created_message public.direct_messages%rowtype;
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  select *
  into conversation
  from public.direct_conversations
  where id = p_conversation_id
    and requesting_user_id in (user_a_id, user_b_id);

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Direct-conversation access required.';
  end if;

  if p_content is null
    or jsonb_typeof(p_content) <> 'array'
    or jsonb_array_length(p_content) not between 1 and 100
  then
    raise exception using
      errcode = '22023',
      message = 'Message content must contain between 1 and 100 segments.';
  end if;

  for segment in select value from jsonb_array_elements(p_content)
  loop
    if jsonb_typeof(segment) <> 'object' then
      raise exception using
        errcode = '22023',
        message = 'Every message segment must be an object.';
    end if;

    segment_type := segment ->> 'type';
    if segment_type = 'text' then
      if not (segment ? 'text')
        or jsonb_typeof(segment -> 'text') <> 'string'
        or segment - 'type' - 'text' <> '{}'::jsonb
      then
        raise exception using
          errcode = '22023',
          message = 'Text segments may contain only type and text.';
      end if;
      segment_text := segment ->> 'text';
      if segment_text <> '' then
        fallback_body := fallback_body || segment_text;
        normalized_content := normalized_content || jsonb_build_array(
          jsonb_build_object('type', 'text', 'text', segment_text)
        );
      end if;
    elsif segment_type = 'mention' then
      if not (segment ? 'user_id')
        or jsonb_typeof(segment -> 'user_id') <> 'string'
        or not (segment ? 'fallback')
        or jsonb_typeof(segment -> 'fallback') <> 'string'
        or segment - 'type' - 'user_id' - 'fallback' <> '{}'::jsonb
      then
        raise exception using
          errcode = '22023',
          message = 'Mention segments may contain only type, user_id, and fallback.';
      end if;

      begin
        mentioned_user_id := (segment ->> 'user_id')::uuid;
      exception when invalid_text_representation then
        raise exception using
          errcode = '22023',
          message = 'Mention user ID must be a UUID.';
      end;

      if mentioned_user_id not in (
        conversation.user_a_id,
        conversation.user_b_id
      ) then
        raise exception using
          errcode = '42501',
          message = 'Mentions must name a conversation participant.';
      end if;

      select display_name
      into mentioned_display_name
      from public.profiles
      where id = mentioned_user_id;

      mention_count := mention_count + 1;
      if mention_count > 25 then
        raise exception using
          errcode = '22023',
          message = 'A message may contain at most 25 mentions.';
      end if;

      fallback_body := fallback_body || '@' || mentioned_display_name;
      normalized_content := normalized_content || jsonb_build_array(
        jsonb_build_object(
          'type', 'mention',
          'user_id', mentioned_user_id,
          'fallback', mentioned_display_name
        )
      );
    else
      raise exception using
        errcode = '22023',
        message = 'Unknown message segment type.';
    end if;
  end loop;

  fallback_body := btrim(fallback_body);
  if char_length(fallback_body) not between 1 and 4000 then
    raise exception using
      errcode = '22023',
      message = 'Message text must contain between 1 and 4000 characters.';
  end if;

  insert into public.direct_messages (
    conversation_id,
    author_id,
    body,
    content
  )
  values (
    p_conversation_id,
    requesting_user_id,
    fallback_body,
    normalized_content
  )
  returning * into created_message;

  update public.direct_conversations
  set updated_at = created_message.created_at
  where id = p_conversation_id;

  insert into public.direct_read_states (
    user_id,
    conversation_id,
    last_read_message_id,
    updated_at
  )
  values (
    requesting_user_id,
    p_conversation_id,
    created_message.id,
    created_message.created_at
  )
  on conflict (user_id, conversation_id)
  do update set
    last_read_message_id = excluded.last_read_message_id,
    updated_at = excluded.updated_at;

  return next created_message;
  return;
end;
$$;

create or replace function public.mark_direct_conversation_read(
  p_conversation_id uuid,
  p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  requested_message public.direct_messages%rowtype;
  current_message public.direct_messages%rowtype;
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  if not (select private.is_direct_conversation_participant(
    p_conversation_id
  )) then
    raise exception using
      errcode = '42501',
      message = 'Direct-conversation access required.';
  end if;

  select *
  into requested_message
  from public.direct_messages
  where id = p_message_id
    and conversation_id = p_conversation_id;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'Message does not belong to this conversation.';
  end if;

  select message.*
  into current_message
  from public.direct_read_states as state
  inner join public.direct_messages as message
    on message.id = state.last_read_message_id
  where state.user_id = requesting_user_id
    and state.conversation_id = p_conversation_id;

  if found and (
    current_message.created_at,
    current_message.id
  ) >= (
    requested_message.created_at,
    requested_message.id
  ) then
    return;
  end if;

  insert into public.direct_read_states (
    user_id,
    conversation_id,
    last_read_message_id,
    updated_at
  )
  values (
    requesting_user_id,
    p_conversation_id,
    p_message_id,
    statement_timestamp()
  )
  on conflict (user_id, conversation_id)
  do update set
    last_read_message_id = excluded.last_read_message_id,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.get_direct_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  avatar_path text,
  avatar_animation_path text,
  cover_path text,
  cover_animation_path text,
  cover_position_x smallint,
  cover_position_y smallint,
  description text,
  created_at timestamptz,
  updated_at timestamptz,
  latest_message_id uuid,
  latest_message_author_id uuid,
  latest_message_body text,
  latest_message_created_at timestamptz,
  has_unread boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  return query
  select
    conversation.id,
    other_profile.id,
    other_profile.display_name,
    other_profile.avatar_url,
    other_profile.avatar_path,
    other_profile.avatar_animation_path,
    other_profile.cover_path,
    other_profile.cover_animation_path,
    other_profile.cover_position_x,
    other_profile.cover_position_y,
    other_profile.description,
    conversation.created_at,
    conversation.updated_at,
    latest.id,
    latest.author_id,
    latest.body,
    latest.created_at,
    exists (
      select 1
      from public.direct_messages as unread
      left join public.direct_messages as read_message
        on read_message.id = state.last_read_message_id
      where unread.conversation_id = conversation.id
        and unread.author_id <> requesting_user_id
        and (
          read_message.id is null
          or (unread.created_at, unread.id)
            > (read_message.created_at, read_message.id)
        )
    )
  from public.direct_conversations as conversation
  inner join public.profiles as other_profile
    on other_profile.id = case
      when conversation.user_a_id = requesting_user_id
        then conversation.user_b_id
      else conversation.user_a_id
    end
  left join lateral (
    select message.*
    from public.direct_messages as message
    where message.conversation_id = conversation.id
    order by message.created_at desc, message.id desc
    limit 1
  ) as latest on true
  left join public.direct_read_states as state
    on state.user_id = requesting_user_id
    and state.conversation_id = conversation.id
  where requesting_user_id in (
    conversation.user_a_id,
    conversation.user_b_id
  )
  order by coalesce(latest.created_at, conversation.created_at) desc,
    conversation.id;
end;
$$;

revoke all privileges on function private.is_direct_conversation_participant(
  uuid
) from public, anon, authenticated;
revoke all privileges on function public.get_or_create_direct_conversation(uuid)
from public, anon, authenticated;
revoke all privileges on function public.send_direct_message(uuid, jsonb)
from public, anon, authenticated;
revoke all privileges on function public.mark_direct_conversation_read(
  uuid,
  uuid
) from public, anon, authenticated;
revoke all privileges on function public.get_direct_conversations()
from public, anon, authenticated;

grant execute on function private.is_direct_conversation_participant(uuid)
to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid)
to authenticated;
grant execute on function public.send_direct_message(uuid, jsonb)
to authenticated;
grant execute on function public.mark_direct_conversation_read(uuid, uuid)
to authenticated;
grant execute on function public.get_direct_conversations()
to authenticated;

alter table public.presence_heartbeats
add column is_streaming boolean not null default false,
add constraint presence_heartbeats_streaming_voice_check check (
  not is_streaming or voice_channel_id is not null
);

create or replace function public.heartbeat_presence(p_server_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  heartbeat_at timestamptz := statement_timestamp();
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  if not exists (
    select 1 from public.memberships
    where server_id = p_server_id and user_id = (select auth.uid())
  ) then
    raise exception using
      errcode = '42501',
      message = 'Server membership required.';
  end if;

  insert into public.presence_heartbeats (
    server_id, user_id, last_seen_at, voice_channel_id, voice_joined_at,
    is_streaming
  )
  values (p_server_id, (select auth.uid()), heartbeat_at, null, null, false)
  on conflict (server_id, user_id)
  do update set
    last_seen_at = excluded.last_seen_at,
    voice_channel_id = null,
    voice_joined_at = null,
    is_streaming = false;

  return heartbeat_at;
end;
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
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  if not exists (
    select 1 from public.memberships
    where server_id = p_server_id and user_id = (select auth.uid())
  ) then
    raise exception using
      errcode = '42501',
      message = 'Server membership required.';
  end if;

  if p_voice_channel_id is not null and not exists (
    select 1 from public.channels
    where id = p_voice_channel_id
      and server_id = p_server_id
      and kind = 'voice'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Voice channel is invalid.';
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
  on conflict (server_id, user_id)
  do update set
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
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  if not exists (
    select 1 from public.memberships
    where server_id = p_server_id and user_id = (select auth.uid())
  ) then
    raise exception using
      errcode = '42501',
      message = 'Server membership required.';
  end if;

  if p_voice_channel_id is not null and not exists (
    select 1 from public.channels
    where id = p_voice_channel_id
      and server_id = p_server_id
      and kind = 'voice'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Voice channel is invalid.';
  end if;

  if coalesce(p_is_streaming, false) and p_voice_channel_id is null then
    raise exception using
      errcode = '22023',
      message = 'Streaming requires an active voice channel.';
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
  on conflict (server_id, user_id)
  do update set
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

revoke all privileges on function public.heartbeat_presence_v3(
  uuid,
  uuid,
  boolean
) from public, anon, authenticated;
grant execute on function public.heartbeat_presence_v3(uuid, uuid, boolean)
to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_conversations'
  ) then
    execute 'alter publication supabase_realtime add table public.direct_conversations';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.direct_messages';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_read_states'
  ) then
    execute 'alter publication supabase_realtime add table public.direct_read_states';
  end if;
end;
$$;

commit;
