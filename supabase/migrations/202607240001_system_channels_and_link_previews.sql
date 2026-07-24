begin;

alter table public.channels
add column purpose text not null default 'chat';

alter table public.channels
add constraint channels_purpose_valid check (
  purpose in ('chat', 'system-releases', 'system-general')
);

create unique index channels_server_system_purpose_key
on public.channels (server_id, purpose)
where purpose <> 'chat';

alter table public.messages
add column message_kind text not null default 'member',
add column system_event jsonb,
add column automation_key text,
add column link_preview jsonb,
add column link_preview_attempted_at timestamptz;

alter table public.direct_messages
add column link_preview jsonb,
add column link_preview_attempted_at timestamptz;

alter table public.messages
add constraint messages_kind_valid check (
  message_kind in ('member', 'system')
),
add constraint messages_system_shape check (
  (
    message_kind = 'member'
    and system_event is null
    and automation_key is null
  )
  or (
    message_kind = 'system'
    and author_id is null
    and jsonb_typeof(system_event) = 'object'
    and char_length(automation_key) between 1 and 240
  )
),
add constraint messages_link_preview_object check (
  link_preview is null or jsonb_typeof(link_preview) = 'object'
);

alter table public.direct_messages
add constraint direct_messages_link_preview_object check (
  link_preview is null or jsonb_typeof(link_preview) = 'object'
);

create unique index messages_channel_automation_key
on public.messages (channel_id, automation_key)
where automation_key is not null;

insert into public.channel_categories (id, server_id, name, position)
values (
  '00000000-0000-4000-8000-000000000300',
  '00000000-0000-4000-8000-000000000001',
  'System',
  0
)
on conflict (id) do update set
  name = excluded.name,
  position = excluded.position;

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
    '00000000-0000-4000-8000-000000000119',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000300',
    'text',
    'releases',
    10,
    'system-releases'
  ),
  (
    '00000000-0000-4000-8000-000000000120',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000300',
    'text',
    'general',
    20,
    'system-general'
  )
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  position = excluded.position,
  purpose = excluded.purpose;

create or replace function private.guard_channel_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.message_kind = 'member'
    and not exists (
      select 1
      from public.channels as channel
      where channel.id = new.channel_id
        and channel.purpose = 'chat'
    )
  then
    raise exception using
      errcode = '42501',
      message = 'system_channel_read_only';
  end if;
  return new;
end;
$$;

create trigger messages_guard_channel_insert
before insert on public.messages
for each row execute function private.guard_channel_message_insert();

drop policy messages_insert_channel_members on public.messages;

create policy messages_insert_channel_members
on public.messages
for insert
to authenticated
with check (
  messages.author_id = (select auth.uid())
  and messages.message_kind = 'member'
  and exists (
    select 1
    from public.channels as channel
    where channel.id = messages.channel_id
      and channel.purpose = 'chat'
      and (
        (select private.can_access_channel(channel.id, 'text'))
        or (select private.can_access_channel(channel.id, 'voice'))
      )
  )
);

create or replace function private.guard_system_channel_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.purpose <> 'chat'
    and (
      new.name is distinct from old.name
      or new.kind is distinct from old.kind
      or new.server_id is distinct from old.server_id
      or new.category_id is distinct from old.category_id
      or new.position is distinct from old.position
      or new.purpose is distinct from old.purpose
    )
  then
    raise exception using
      errcode = '42501',
      message = 'system_channel_managed_by_automation';
  end if;
  return new;
end;
$$;

create trigger channels_guard_system_update
before update on public.channels
for each row execute function private.guard_system_channel_update();

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
    )
  then
    raise exception using
      errcode = '42501',
      message = 'system_channel_read_only';
  end if;
  return new;
end;
$$;

create trigger message_attachments_guard_system_channel
before insert or update of channel_id on public.message_attachments
for each row execute function private.guard_system_channel_attachment();

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
    )
  then
    raise exception using
      errcode = '42501',
      message = 'system_message_reactions_disabled';
  end if;
  return new;
end;
$$;

create trigger message_reactions_guard_system_message
before insert on public.message_sticker_reactions
for each row execute function private.guard_system_message_reaction();

create or replace function private.handle_membership_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  general_channel_id uuid;
  member_name text;
  welcome_message public.messages%rowtype;
begin
  select channel.id
  into general_channel_id
  from public.channels as channel
  where channel.server_id = new.server_id
    and channel.purpose = 'system-general';

  select profile.display_name
  into member_name
  from public.profiles as profile
  where profile.id = new.user_id;

  if general_channel_id is not null then
    insert into public.messages (
      channel_id,
      author_id,
      body,
      content,
      created_at,
      message_kind,
      system_event,
      automation_key
    )
    values (
      general_channel_id,
      null,
      'Welcome ' || coalesce(member_name, 'Friend') || ' to Bakbak!',
      jsonb_build_array(
        jsonb_build_object(
          'type',
          'text',
          'text',
          'Welcome ' || coalesce(member_name, 'Friend') || ' to Bakbak!'
        )
      ),
      new.joined_at,
      'system',
      jsonb_build_object(
        'type',
        'member_joined',
        'member_id',
        new.user_id,
        'member_name',
        coalesce(member_name, 'Friend'),
        'joined_at',
        new.joined_at
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
      and message.deleted_at is null
    order by message.created_at desc, message.id desc
    limit 1
  ) as latest on true
  where channel.server_id = new.server_id
  on conflict (user_id, channel_id) do update set
    last_read_message_id = excluded.last_read_message_id,
    updated_at = now();

  return new;
end;
$$;

drop trigger memberships_initialize_channel_read_states
on public.memberships;

create trigger memberships_handle_created
after insert on public.memberships
for each row execute function private.handle_membership_created();

insert into public.messages (
  channel_id,
  author_id,
  body,
  content,
  created_at,
  message_kind,
  system_event,
  automation_key
)
select
  general.id,
  null,
  'Welcome ' || profile.display_name || ' to Bakbak!',
  jsonb_build_array(
    jsonb_build_object(
      'type',
      'text',
      'text',
      'Welcome ' || profile.display_name || ' to Bakbak!'
    )
  ),
  membership.joined_at,
  'system',
  jsonb_build_object(
    'type',
    'member_joined',
    'member_id',
    membership.user_id,
    'member_name',
    profile.display_name,
    'joined_at',
    membership.joined_at
  ),
  'member-joined:' || membership.server_id::text || ':'
    || membership.user_id::text || ':'
    || extract(epoch from membership.joined_at)::text
from public.memberships as membership
inner join public.profiles as profile on profile.id = membership.user_id
inner join public.channels as general
  on general.server_id = membership.server_id
  and general.purpose = 'system-general'
on conflict (channel_id, automation_key)
  where automation_key is not null
do nothing;

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
  and channel.purpose <> 'chat'
inner join lateral (
  select message.id
  from public.messages as message
  where message.channel_id = channel.id
  order by message.created_at desc, message.id desc
  limit 1
) as latest on true
on conflict (user_id, channel_id) do update set
  last_read_message_id = excluded.last_read_message_id,
  updated_at = now();

create or replace function public.publish_system_release(
  p_release_id bigint,
  p_tag text,
  p_name text,
  p_notes text,
  p_url text,
  p_published_at timestamptz,
  p_historical boolean default false
)
returns setof public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  release_channel public.channels%rowtype;
  release_message public.messages%rowtype;
  normalized_tag text := left(btrim(coalesce(p_tag, '')), 80);
  normalized_name text := left(btrim(coalesce(p_name, '')), 160);
  normalized_notes text := left(btrim(coalesce(p_notes, '')), 2000);
begin
  if p_release_id <= 0
    or normalized_tag = ''
    or normalized_name = ''
    or p_url !~ '^https://github\.com/ayushrameja/bakbak/releases/tag/'
    or p_published_at is null
  then
    raise exception using errcode = '22023', message = 'invalid_release';
  end if;

  select channel.*
  into release_channel
  from public.channels as channel
  where channel.purpose = 'system-releases'
  order by channel.created_at
  limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'release_channel_missing';
  end if;

  insert into public.messages (
    channel_id,
    author_id,
    body,
    content,
    created_at,
    message_kind,
    system_event,
    automation_key
  )
  values (
    release_channel.id,
    null,
    'Bakbak ' || normalized_tag || ' is now available.',
    jsonb_build_array(
      jsonb_build_object(
        'type',
        'text',
        'text',
        'Bakbak ' || normalized_tag || ' is now available.'
      )
    ),
    p_published_at,
    'system',
    jsonb_build_object(
      'type',
      'release_published',
      'release_id',
      p_release_id,
      'tag',
      normalized_tag,
      'name',
      normalized_name,
      'notes',
      normalized_notes,
      'url',
      p_url,
      'published_at',
      p_published_at
    ),
    'github-release:' || p_release_id::text
  )
  on conflict (channel_id, automation_key)
    where automation_key is not null
  do update set automation_key = excluded.automation_key
  returning * into release_message;

  if p_historical then
    insert into public.channel_read_states (
      user_id,
      channel_id,
      last_read_message_id
    )
    select
      membership.user_id,
      release_channel.id,
      release_message.id
    from public.memberships as membership
    where membership.server_id = release_channel.server_id
    on conflict (user_id, channel_id) do update set
      last_read_message_id = excluded.last_read_message_id,
      updated_at = now()
    where public.channel_read_states.last_read_message_id is null
      or exists (
        select 1
        from public.messages as current_read
        where current_read.id =
          public.channel_read_states.last_read_message_id
          and (
            current_read.created_at,
            current_read.id
          ) <= (
            release_message.created_at,
            release_message.id
          )
      );
  end if;

  return next release_message;
end;
$$;

revoke all privileges on function public.publish_system_release(
  bigint,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean
)
from public, anon, authenticated;

grant execute on function public.publish_system_release(
  bigint,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean
)
to service_role;

revoke all privileges on function private.guard_channel_message_insert()
from public, anon, authenticated;
revoke all privileges on function private.guard_system_channel_update()
from public, anon, authenticated;
revoke all privileges on function private.guard_system_channel_attachment()
from public, anon, authenticated;
revoke all privileges on function private.guard_system_message_reaction()
from public, anon, authenticated;
revoke all privileges on function private.handle_membership_created()
from public, anon, authenticated;

commit;
