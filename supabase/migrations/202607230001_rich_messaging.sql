begin;

alter table public.messages
add column reply_to_id uuid references public.messages(id) on delete set null,
add column reply_notifies_author boolean not null default false,
add column presentation jsonb,
add column deleted_at timestamptz;

alter table public.direct_messages
add column reply_to_id uuid references public.direct_messages(id) on delete set null,
add column reply_notifies_author boolean not null default false,
add column presentation jsonb,
add column deleted_at timestamptz;

alter table public.messages
add constraint messages_presentation_object check (
  presentation is null or jsonb_typeof(presentation) = 'object'
);

alter table public.direct_messages
add constraint direct_messages_presentation_object check (
  presentation is null or jsonb_typeof(presentation) = 'object'
);

create index messages_reply_to_idx on public.messages(reply_to_id);
create index direct_messages_reply_to_idx on public.direct_messages(reply_to_id);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete cascade,
  conversation_id uuid references public.direct_conversations(id)
    on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  direct_message_id uuid references public.direct_messages(id)
    on delete cascade,
  kind text not null check (kind in ('image', 'gif', 'video')),
  mime_type text not null,
  byte_size bigint not null check (byte_size between 1 and 52428800),
  poster_byte_size bigint not null check (
    poster_byte_size between 1 and 10485760
  ),
  width integer not null check (width between 1 and 8192),
  height integer not null check (height between 1 and 8192),
  duration_ms integer check (duration_ms between 1 and 60000),
  object_path text not null unique,
  poster_path text not null unique,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz,
  object_deleted_at timestamptz,
  constraint message_attachments_one_target check (
    (channel_id is not null)::integer
      + (conversation_id is not null)::integer = 1
  ),
  constraint message_attachments_one_message check (
    (message_id is not null)::integer
      + (direct_message_id is not null)::integer <= 1
  ),
  constraint message_attachments_target_matches_message check (
    (message_id is null or channel_id is not null)
    and (direct_message_id is null or conversation_id is not null)
  ),
  constraint message_attachments_video_duration check (
    (kind = 'video' and duration_ms is not null)
    or (kind <> 'video' and duration_ms is null)
  )
);

create index message_attachments_channel_idx
on public.message_attachments(channel_id, created_at);

create index message_attachments_conversation_idx
on public.message_attachments(conversation_id, created_at);

create index message_attachments_message_idx
on public.message_attachments(message_id)
where message_id is not null;

create index message_attachments_direct_message_idx
on public.message_attachments(direct_message_id)
where direct_message_id is not null;

create table public.stickers (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 50),
  poster_path text not null unique,
  animation_path text unique,
  width integer not null check (width between 1 and 512),
  height integer not null check (height between 1 and 512),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  object_deleted_at timestamptz
);

create index stickers_server_enabled_idx
on public.stickers(server_id, enabled, created_at, id);

create table public.message_sticker_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  direct_message_id uuid references public.direct_messages(id)
    on delete cascade,
  sticker_id uuid not null references public.stickers(id) on delete restrict,
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint message_sticker_reactions_one_message check (
    (message_id is not null)::integer
      + (direct_message_id is not null)::integer = 1
  )
);

create unique index message_sticker_reactions_channel_unique
on public.message_sticker_reactions(message_id, sticker_id, user_id)
where message_id is not null;

create unique index message_sticker_reactions_direct_unique
on public.message_sticker_reactions(direct_message_id, sticker_id, user_id)
where direct_message_id is not null;

create index message_sticker_reactions_message_idx
on public.message_sticker_reactions(message_id, created_at)
where message_id is not null;

create index message_sticker_reactions_direct_message_idx
on public.message_sticker_reactions(direct_message_id, created_at)
where direct_message_id is not null;

alter table public.message_attachments enable row level security;
alter table public.stickers enable row level security;
alter table public.message_sticker_reactions enable row level security;

revoke all privileges on table public.message_attachments
from public, anon, authenticated;
revoke all privileges on table public.stickers
from public, anon, authenticated;
revoke all privileges on table public.message_sticker_reactions
from public, anon, authenticated;

grant select on table public.message_attachments to authenticated;
grant select on table public.stickers to authenticated;
grant select on table public.message_sticker_reactions to authenticated;

create or replace function private.can_read_message_attachment(
  p_attachment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.message_attachments as attachment
    where attachment.id = p_attachment_id
      and attachment.deleted_at is null
      and attachment.object_deleted_at is null
      and (
        attachment.uploader_id = (select auth.uid())
        or (
          attachment.message_id is not null
          and exists (
            select 1
            from public.messages as message
            inner join public.channels as channel
              on channel.id = message.channel_id
            inner join public.memberships as membership
              on membership.server_id = channel.server_id
            where message.id = attachment.message_id
              and message.deleted_at is null
              and membership.user_id = (select auth.uid())
          )
        )
        or (
          attachment.direct_message_id is not null
          and (select private.is_direct_conversation_participant(
            attachment.conversation_id
          ))
          and exists (
            select 1
            from public.direct_messages as message
            where message.id = attachment.direct_message_id
              and message.deleted_at is null
          )
        )
      )
  );
$$;

create policy message_attachments_visible
on public.message_attachments
for select
to authenticated
using ((select private.can_read_message_attachment(id)));

create or replace function private.can_read_sticker(p_sticker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stickers as sticker
    where sticker.id = p_sticker_id
      and sticker.object_deleted_at is null
      and (
        exists (
          select 1
          from public.memberships as membership
          where membership.server_id = sticker.server_id
            and membership.user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.direct_messages as message
          inner join public.direct_conversations as conversation
            on conversation.id = message.conversation_id
          where (select auth.uid()) in (
            conversation.user_a_id,
            conversation.user_b_id
          )
            and (
              message.presentation ->> 'kind' = 'sticker'
              and message.presentation ->> 'sticker_id' = sticker.id::text
            )
        )
        or exists (
          select 1
          from public.message_sticker_reactions as reaction
          inner join public.direct_messages as message
            on message.id = reaction.direct_message_id
          inner join public.direct_conversations as conversation
            on conversation.id = message.conversation_id
          where reaction.sticker_id = sticker.id
            and (select auth.uid()) in (
              conversation.user_a_id,
              conversation.user_b_id
            )
        )
      )
  );
$$;

create policy stickers_visible
on public.stickers
for select
to authenticated
using ((select private.can_read_sticker(id)));

create policy message_sticker_reactions_visible
on public.message_sticker_reactions
for select
to authenticated
using (
  (
    message_id is not null
    and exists (
      select 1
      from public.messages as message
      where message.id = message_sticker_reactions.message_id
        and message.deleted_at is null
        and (select private.can_access_channel(message.channel_id, 'text'))
    )
  )
  or (
    direct_message_id is not null
    and exists (
      select 1
      from public.direct_messages as message
      where message.id = message_sticker_reactions.direct_message_id
        and message.deleted_at is null
        and (select private.is_direct_conversation_participant(
          message.conversation_id
        ))
    )
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'message-media',
    'message-media',
    false,
    52428800,
    array[
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'video/mp4'
    ]
  ),
  (
    'message-stickers',
    'message-stickers',
    false,
    5242880,
    array['image/png', 'image/webp', 'image/gif']
  )
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "authorized users can read message media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-media'
  and exists (
    select 1
    from public.message_attachments as attachment
    where (attachment.object_path = name or attachment.poster_path = name)
      and (select private.can_read_message_attachment(attachment.id))
  )
);

create policy "authorized users can read message stickers"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-stickers'
  and exists (
    select 1
    from public.stickers as sticker
    where (
      sticker.poster_path = name
      or sticker.animation_path = name
    )
      and (select private.can_read_sticker(sticker.id))
  )
);

create or replace function public.reserve_message_attachment(
  p_uploader_id uuid,
  p_channel_id uuid,
  p_conversation_id uuid,
  p_kind text,
  p_mime_type text,
  p_byte_size bigint,
  p_poster_byte_size bigint,
  p_width integer,
  p_height integer,
  p_duration_ms integer,
  p_object_path text,
  p_poster_path text
)
returns setof public.message_attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  used_bytes bigint;
  created_attachment public.message_attachments%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('message-media:' || p_uploader_id::text, 0)
  );
  if (p_channel_id is null)::integer
      + (p_conversation_id is null)::integer <> 1 then
    raise exception using errcode = '22023', message = 'invalid_target';
  end if;
  if p_kind not in ('image', 'gif', 'video') then
    raise exception using errcode = '22023', message = 'invalid_media_kind';
  end if;
  if p_channel_id is not null and not exists (
    select 1
    from public.channels as channel
    inner join public.memberships as membership
      on membership.server_id = channel.server_id
    where channel.id = p_channel_id
      and channel.kind = 'text'
      and membership.user_id = p_uploader_id
  ) then
    raise exception using errcode = '42501', message = 'target_access_required';
  end if;
  if p_conversation_id is not null and not exists (
    select 1
    from public.direct_conversations as conversation
    where conversation.id = p_conversation_id
      and p_uploader_id in (
        conversation.user_a_id,
        conversation.user_b_id
      )
  ) then
    raise exception using errcode = '42501', message = 'target_access_required';
  end if;

  select
    coalesce(sum(byte_size + poster_byte_size), 0)
    + coalesce((
      select sum(byte_size)
      from public.stickers
      where created_by = p_uploader_id
        and object_deleted_at is null
    ), 0)
  into used_bytes
  from public.message_attachments
  where uploader_id = p_uploader_id
    and object_deleted_at is null;

  if used_bytes + p_byte_size + p_poster_byte_size > 1073741824 then
    raise exception using errcode = '23514', message = 'member_media_limit';
  end if;

  insert into public.message_attachments (
    uploader_id,
    channel_id,
    conversation_id,
    kind,
    mime_type,
    byte_size,
    poster_byte_size,
    width,
    height,
    duration_ms,
    object_path,
    poster_path
  )
  values (
    p_uploader_id,
    p_channel_id,
    p_conversation_id,
    p_kind,
    p_mime_type,
    p_byte_size,
    p_poster_byte_size,
    p_width,
    p_height,
    p_duration_ms,
    p_object_path,
    p_poster_path
  )
  returning * into created_attachment;

  return next created_attachment;
end;
$$;

create or replace function public.cancel_message_attachment(
  p_attachment_id uuid,
  p_uploader_id uuid
)
returns setof public.message_attachments
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.message_attachments
  set
    deleted_at = now(),
    object_deleted_at = now()
  where id = p_attachment_id
    and uploader_id = p_uploader_id
    and published_at is null
  returning *;
end;
$$;

create or replace function public.publish_message_sticker(
  p_server_id uuid,
  p_created_by uuid,
  p_label text,
  p_poster_path text,
  p_animation_path text,
  p_width integer,
  p_height integer,
  p_byte_size bigint
)
returns setof public.stickers
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_sticker public.stickers%rowtype;
  member_count integer;
  server_count integer;
  used_bytes bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stickers:' || p_server_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('message-media:' || p_created_by::text, 0)
  );
  if not exists (
    select 1
    from public.memberships
    where server_id = p_server_id
      and user_id = p_created_by
  ) then
    raise exception using errcode = '42501', message = 'server_membership_required';
  end if;

  select count(*) into member_count
  from public.stickers
  where server_id = p_server_id
    and created_by = p_created_by
    and enabled;
  select count(*) into server_count
  from public.stickers
  where server_id = p_server_id
    and enabled;
  if member_count >= 25 then
    raise exception using errcode = '23514', message = 'member_sticker_limit';
  end if;
  if server_count >= 200 then
    raise exception using errcode = '23514', message = 'server_sticker_limit';
  end if;

  select
    coalesce(sum(byte_size + poster_byte_size), 0)
    + coalesce((
      select sum(byte_size)
      from public.stickers
      where created_by = p_created_by
        and object_deleted_at is null
    ), 0)
  into used_bytes
  from public.message_attachments
  where uploader_id = p_created_by
    and object_deleted_at is null;
  if used_bytes + p_byte_size > 1073741824 then
    raise exception using errcode = '23514', message = 'member_media_limit';
  end if;

  insert into public.stickers (
    server_id,
    created_by,
    label,
    poster_path,
    animation_path,
    width,
    height,
    byte_size
  )
  values (
    p_server_id,
    p_created_by,
    btrim(p_label),
    p_poster_path,
    p_animation_path,
    p_width,
    p_height,
    p_byte_size
  )
  returning * into created_sticker;
  return next created_sticker;
end;
$$;

create or replace function public.archive_message_sticker(
  p_sticker_id uuid,
  p_actor_id uuid
)
returns setof public.stickers
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.stickers as sticker
  set enabled = false, archived_at = now()
  where sticker.id = p_sticker_id
    and (
      sticker.created_by = p_actor_id
      or exists (
        select 1
        from public.memberships
        where server_id = sticker.server_id
          and user_id = p_actor_id
          and role = 'admin'
      )
    )
  returning sticker.*;
end;
$$;

create or replace function private.validate_rich_presentation(
  p_presentation jsonb,
  p_server_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  presentation_kind text;
  sticker_id uuid;
begin
  if p_presentation is null then
    return;
  end if;
  if jsonb_typeof(p_presentation) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_presentation';
  end if;
  presentation_kind := p_presentation ->> 'kind';
  if presentation_kind = 'sticker' then
    begin
      sticker_id := (p_presentation ->> 'sticker_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_sticker';
    end;
    if p_presentation - 'kind' - 'sticker_id' <> '{}'::jsonb
      or not exists (
        select 1 from public.stickers
        where id = sticker_id
          and server_id = p_server_id
          and enabled
          and object_deleted_at is null
      )
    then
      raise exception using errcode = '22023', message = 'invalid_sticker';
    end if;
  elsif presentation_kind = 'giphy' then
    if p_presentation - 'kind' - 'asset_id' - 'asset_kind'
        - 'title' - 'alt_text' - 'width' - 'height' <> '{}'::jsonb
      or p_presentation ->> 'asset_kind' not in ('gif', 'sticker')
      or char_length(p_presentation ->> 'asset_id') not between 1 and 100
      or char_length(p_presentation ->> 'title') > 200
      or char_length(p_presentation ->> 'alt_text') > 500
      or (p_presentation ->> 'width')::integer not between 1 and 4096
      or (p_presentation ->> 'height')::integer not between 1 and 4096
    then
      raise exception using errcode = '22023', message = 'invalid_giphy_asset';
    end if;
  else
    raise exception using errcode = '22023', message = 'invalid_presentation';
  end if;
end;
$$;

create or replace function public.send_message_v2(
  p_channel_id uuid,
  p_content jsonb default '[]'::jsonb,
  p_reply_to_id uuid default null,
  p_reply_notifies_author boolean default true,
  p_attachment_ids uuid[] default '{}'::uuid[],
  p_presentation jsonb default null
)
returns setof public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  channel_server_id uuid;
  parent public.messages%rowtype;
  created_message public.messages%rowtype;
  input_content jsonb := coalesce(p_content, '[]'::jsonb);
  fallback text;
  expected_attachments integer := coalesce(array_length(p_attachment_ids, 1), 0);
begin
  select server_id into channel_server_id
  from public.channels
  where id = p_channel_id and kind = 'text';
  if channel_server_id is null or not exists (
    select 1 from public.memberships
    where server_id = channel_server_id and user_id = requesting_user_id
  ) then
    raise exception using errcode = '42501', message = 'Channel membership required.';
  end if;

  perform private.validate_rich_presentation(p_presentation, channel_server_id);
  if expected_attachments > 4 then
    raise exception using errcode = '22023', message = 'attachment_limit';
  end if;
  if p_presentation is not null and (
    expected_attachments > 0 or jsonb_array_length(input_content) > 0
  ) then
    raise exception using errcode = '22023', message = 'standalone_presentation_required';
  end if;
  if jsonb_array_length(input_content) = 0
    and expected_attachments = 0
    and p_presentation is null
  then
    raise exception using errcode = '22023', message = 'message_content_required';
  end if;
  if p_reply_to_id is not null then
    select * into parent from public.messages
    where id = p_reply_to_id
      and channel_id = p_channel_id
      and deleted_at is null;
    if not found then
      raise exception using errcode = '22023', message = 'reply_target_unavailable';
    end if;
  end if;
  if expected_attachments > 0 and (
    select count(*)
    from public.message_attachments
    where id = any(p_attachment_ids)
      and uploader_id = requesting_user_id
      and channel_id = p_channel_id
      and message_id is null
      and direct_message_id is null
      and deleted_at is null
      and created_at > now() - interval '24 hours'
      and exists (
        select 1 from storage.objects
        where bucket_id = 'message-media'
          and name = message_attachments.object_path
      )
      and exists (
        select 1 from storage.objects
        where bucket_id = 'message-media'
          and name = message_attachments.poster_path
      )
  ) <> expected_attachments then
    raise exception using errcode = '22023', message = 'attachments_unavailable';
  end if;

  if jsonb_array_length(input_content) = 0 then
    fallback := case
      when p_presentation ->> 'kind' = 'sticker' then '[Sticker]'
      when p_presentation ->> 'kind' = 'giphy'
        and p_presentation ->> 'asset_kind' = 'sticker' then '[Sticker]'
      when p_presentation ->> 'kind' = 'giphy' then '[GIF]'
      when exists (
        select 1 from public.message_attachments
        where id = any(p_attachment_ids) and kind = 'video'
      ) then '[Video]'
      when exists (
        select 1 from public.message_attachments
        where id = any(p_attachment_ids) and kind = 'gif'
      ) then '[GIF]'
      else '[Image]'
    end;
    input_content := jsonb_build_array(
      jsonb_build_object('type', 'text', 'text', fallback)
    );
  end if;

  select * into created_message
  from public.send_message(p_channel_id, input_content);

  update public.messages
  set
    content = case
      when p_content is null then '[]'::jsonb
      else p_content
    end,
    reply_to_id = p_reply_to_id,
    reply_notifies_author = (
      p_reply_to_id is not null
      and p_reply_notifies_author
      and parent.author_id is not null
      and parent.author_id <> requesting_user_id
      and exists (
        select 1 from public.memberships
        where server_id = channel_server_id
          and user_id = parent.author_id
      )
    ),
    presentation = p_presentation
  where id = created_message.id
  returning * into created_message;

  update public.message_attachments
  set message_id = created_message.id, published_at = now()
  where id = any(p_attachment_ids);

  return next created_message;
end;
$$;

create or replace function public.send_direct_message_v2(
  p_conversation_id uuid,
  p_content jsonb default '[]'::jsonb,
  p_reply_to_id uuid default null,
  p_reply_notifies_author boolean default true,
  p_attachment_ids uuid[] default '{}'::uuid[],
  p_presentation jsonb default null
)
returns setof public.direct_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  parent public.direct_messages%rowtype;
  created_message public.direct_messages%rowtype;
  input_content jsonb := coalesce(p_content, '[]'::jsonb);
  fallback text;
  expected_attachments integer := coalesce(array_length(p_attachment_ids, 1), 0);
  shared_server_id uuid;
begin
  if not exists (
    select 1 from public.direct_conversations
    where id = p_conversation_id
      and requesting_user_id in (user_a_id, user_b_id)
  ) then
    raise exception using errcode = '42501', message = 'Conversation participation required.';
  end if;

  select mine.server_id into shared_server_id
  from public.memberships as mine
  inner join public.direct_conversations as conversation
    on conversation.id = p_conversation_id
  inner join public.memberships as theirs
    on theirs.server_id = mine.server_id
    and theirs.user_id = case
      when conversation.user_a_id = requesting_user_id
        then conversation.user_b_id
      else conversation.user_a_id
    end
  where mine.user_id = requesting_user_id
  limit 1;

  if p_presentation ->> 'kind' = 'sticker' and shared_server_id is null then
    raise exception using errcode = '42501', message = 'server_membership_required';
  end if;
  if p_presentation is not null then
    perform private.validate_rich_presentation(p_presentation, shared_server_id);
  end if;
  if expected_attachments > 4 then
    raise exception using errcode = '22023', message = 'attachment_limit';
  end if;
  if p_presentation is not null and (
    expected_attachments > 0 or jsonb_array_length(input_content) > 0
  ) then
    raise exception using errcode = '22023', message = 'standalone_presentation_required';
  end if;
  if jsonb_array_length(input_content) = 0
    and expected_attachments = 0
    and p_presentation is null
  then
    raise exception using errcode = '22023', message = 'message_content_required';
  end if;
  if p_reply_to_id is not null then
    select * into parent from public.direct_messages
    where id = p_reply_to_id
      and conversation_id = p_conversation_id
      and deleted_at is null;
    if not found then
      raise exception using errcode = '22023', message = 'reply_target_unavailable';
    end if;
  end if;
  if expected_attachments > 0 and (
    select count(*)
    from public.message_attachments
    where id = any(p_attachment_ids)
      and uploader_id = requesting_user_id
      and conversation_id = p_conversation_id
      and message_id is null
      and direct_message_id is null
      and deleted_at is null
      and created_at > now() - interval '24 hours'
      and exists (
        select 1 from storage.objects
        where bucket_id = 'message-media'
          and name = message_attachments.object_path
      )
      and exists (
        select 1 from storage.objects
        where bucket_id = 'message-media'
          and name = message_attachments.poster_path
      )
  ) <> expected_attachments then
    raise exception using errcode = '22023', message = 'attachments_unavailable';
  end if;

  if jsonb_array_length(input_content) = 0 then
    fallback := case
      when p_presentation ->> 'kind' = 'sticker' then '[Sticker]'
      when p_presentation ->> 'kind' = 'giphy'
        and p_presentation ->> 'asset_kind' = 'sticker' then '[Sticker]'
      when p_presentation ->> 'kind' = 'giphy' then '[GIF]'
      when exists (
        select 1 from public.message_attachments
        where id = any(p_attachment_ids) and kind = 'video'
      ) then '[Video]'
      when exists (
        select 1 from public.message_attachments
        where id = any(p_attachment_ids) and kind = 'gif'
      ) then '[GIF]'
      else '[Image]'
    end;
    input_content := jsonb_build_array(
      jsonb_build_object('type', 'text', 'text', fallback)
    );
  end if;

  select * into created_message
  from public.send_direct_message(p_conversation_id, input_content);

  update public.direct_messages
  set
    content = case
      when p_content is null then '[]'::jsonb
      else p_content
    end,
    reply_to_id = p_reply_to_id,
    reply_notifies_author = (
      p_reply_to_id is not null
      and p_reply_notifies_author
      and parent.author_id <> requesting_user_id
    ),
    presentation = p_presentation
  where id = created_message.id
  returning * into created_message;

  update public.message_attachments
  set direct_message_id = created_message.id, published_at = now()
  where id = any(p_attachment_ids);

  return next created_message;
end;
$$;

create or replace function public.toggle_message_sticker_reaction(
  p_message_kind text,
  p_message_id uuid,
  p_sticker_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  target_server_id uuid;
  existing_id uuid;
  per_user_count integer;
  distinct_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'sticker-reaction:' || p_message_kind || ':' || p_message_id::text,
      0
    )
  );
  if p_message_kind = 'channel' then
    select channel.server_id into target_server_id
    from public.messages as message
    inner join public.channels as channel on channel.id = message.channel_id
    inner join public.memberships as membership
      on membership.server_id = channel.server_id
    where message.id = p_message_id
      and message.deleted_at is null
      and membership.user_id = requesting_user_id;
  elsif p_message_kind = 'direct' then
    if not exists (
      select 1
      from public.direct_messages as message
      where message.id = p_message_id
        and message.deleted_at is null
        and (select private.is_direct_conversation_participant(
          message.conversation_id
        ))
    ) then
      raise exception using errcode = '42501', message = 'message_access_required';
    end if;
    select membership.server_id into target_server_id
    from public.memberships as membership
    inner join public.stickers as sticker
      on sticker.server_id = membership.server_id
      and sticker.id = p_sticker_id
    where membership.user_id = requesting_user_id;
  else
    raise exception using errcode = '22023', message = 'invalid_message_kind';
  end if;

  if target_server_id is null or not exists (
    select 1 from public.stickers
    where id = p_sticker_id
      and server_id = target_server_id
      and enabled
      and object_deleted_at is null
  ) then
    raise exception using errcode = '42501', message = 'sticker_access_required';
  end if;

  select id into existing_id
  from public.message_sticker_reactions
  where sticker_id = p_sticker_id
    and user_id = requesting_user_id
    and (
      (p_message_kind = 'channel' and message_id = p_message_id)
      or (p_message_kind = 'direct' and direct_message_id = p_message_id)
    );
  if existing_id is not null then
    delete from public.message_sticker_reactions where id = existing_id;
    return false;
  end if;

  select count(distinct sticker_id) into per_user_count
  from public.message_sticker_reactions
  where user_id = requesting_user_id
    and (
      (p_message_kind = 'channel' and message_id = p_message_id)
      or (p_message_kind = 'direct' and direct_message_id = p_message_id)
    );
  select count(distinct sticker_id) into distinct_count
  from public.message_sticker_reactions
  where (
    (p_message_kind = 'channel' and message_id = p_message_id)
    or (p_message_kind = 'direct' and direct_message_id = p_message_id)
  );
  if per_user_count >= 5 then
    raise exception using errcode = '23514', message = 'user_reaction_limit';
  end if;
  if distinct_count >= 20 then
    raise exception using errcode = '23514', message = 'message_reaction_limit';
  end if;

  insert into public.message_sticker_reactions (
    message_id,
    direct_message_id,
    sticker_id,
    user_id
  )
  values (
    case when p_message_kind = 'channel' then p_message_id end,
    case when p_message_kind = 'direct' then p_message_id end,
    p_sticker_id,
    requesting_user_id
  );
  return true;
end;
$$;

create or replace function public.delete_own_message(
  p_message_kind text,
  p_message_id uuid
)
returns table (
  attachment_id uuid,
  object_path text,
  poster_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
begin
  if p_message_kind = 'channel' then
    if not exists (
      select 1 from public.messages
      where id = p_message_id
        and author_id = requesting_user_id
        and deleted_at is null
    ) then
      raise exception using errcode = '42501', message = 'message_delete_forbidden';
    end if;
    update public.messages
    set
      body = '[Message deleted]',
      content = null,
      presentation = null,
      reply_notifies_author = false,
      deleted_at = now()
    where id = p_message_id;
    delete from public.message_sticker_reactions
    where message_id = p_message_id;
    return query
    update public.message_attachments
    set deleted_at = now()
    where message_id = p_message_id and deleted_at is null
    returning id, message_attachments.object_path, message_attachments.poster_path;
  elsif p_message_kind = 'direct' then
    if not exists (
      select 1 from public.direct_messages
      where id = p_message_id
        and author_id = requesting_user_id
        and deleted_at is null
    ) then
      raise exception using errcode = '42501', message = 'message_delete_forbidden';
    end if;
    update public.direct_messages
    set
      body = '[Message deleted]',
      content = jsonb_build_array(
        jsonb_build_object('type', 'text', 'text', '[Message deleted]')
      ),
      presentation = null,
      reply_notifies_author = false,
      deleted_at = now()
    where id = p_message_id;
    delete from public.message_sticker_reactions
    where direct_message_id = p_message_id;
    return query
    update public.message_attachments
    set deleted_at = now()
    where direct_message_id = p_message_id and deleted_at is null
    returning id, message_attachments.object_path, message_attachments.poster_path;
  else
    raise exception using errcode = '22023', message = 'invalid_message_kind';
  end if;
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
    select 1 from public.memberships
    where server_id = p_server_id and user_id = requesting_user_id
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
  order by channel.position, channel.id;
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
        and unread.deleted_at is null
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
      and message.deleted_at is null
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

revoke all privileges on function public.reserve_message_attachment(
  uuid, uuid, uuid, text, text, bigint, bigint, integer, integer, integer,
  text, text
) from public, anon, authenticated;
grant execute on function public.reserve_message_attachment(
  uuid, uuid, uuid, text, text, bigint, bigint, integer, integer, integer,
  text, text
) to service_role;

revoke all privileges on function public.cancel_message_attachment(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.cancel_message_attachment(uuid, uuid)
to service_role;

revoke all privileges on function public.publish_message_sticker(
  uuid, uuid, text, text, text, integer, integer, bigint
) from public, anon, authenticated;
grant execute on function public.publish_message_sticker(
  uuid, uuid, text, text, text, integer, integer, bigint
) to service_role;

revoke all privileges on function public.archive_message_sticker(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.archive_message_sticker(uuid, uuid)
to service_role;

revoke all privileges on function public.send_message_v2(
  uuid, jsonb, uuid, boolean, uuid[], jsonb
) from public, anon, authenticated;
grant execute on function public.send_message_v2(
  uuid, jsonb, uuid, boolean, uuid[], jsonb
) to authenticated;

revoke all privileges on function public.send_direct_message_v2(
  uuid, jsonb, uuid, boolean, uuid[], jsonb
) from public, anon, authenticated;
grant execute on function public.send_direct_message_v2(
  uuid, jsonb, uuid, boolean, uuid[], jsonb
) to authenticated;

revoke all privileges on function public.toggle_message_sticker_reaction(
  text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.toggle_message_sticker_reaction(
  text, uuid, uuid
) to authenticated;

revoke all privileges on function public.delete_own_message(text, uuid)
from public, anon, authenticated;
grant execute on function public.delete_own_message(text, uuid)
to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'stickers'
  ) then
    execute 'alter publication supabase_realtime add table public.stickers';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_sticker_reactions'
  ) then
    execute 'alter publication supabase_realtime add table public.message_sticker_reactions';
  end if;
end
$$;

commit;
