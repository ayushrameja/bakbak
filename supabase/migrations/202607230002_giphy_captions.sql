begin;

alter function public.send_message_v2(
  uuid, jsonb, uuid, boolean, uuid[], jsonb
) rename to send_message_v2_base;

alter function public.send_direct_message_v2(
  uuid, jsonb, uuid, boolean, uuid[], jsonb
) rename to send_direct_message_v2_base;

revoke all privileges on function public.send_message_v2_base(
  uuid, jsonb, uuid, boolean, uuid[], jsonb
) from public, anon, authenticated;

revoke all privileges on function public.send_direct_message_v2_base(
  uuid, jsonb, uuid, boolean, uuid[], jsonb
) from public, anon, authenticated;

create function public.send_message_v2(
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
  expected_attachments integer := coalesce(array_length(p_attachment_ids, 1), 0);
begin
  if p_presentation is null
    or p_presentation ->> 'kind' <> 'giphy'
    or jsonb_array_length(input_content) = 0
  then
    return query
    select * from public.send_message_v2_base(
      p_channel_id,
      p_content,
      p_reply_to_id,
      p_reply_notifies_author,
      p_attachment_ids,
      p_presentation
    );
    return;
  end if;

  if expected_attachments > 0 then
    raise exception using
      errcode = '22023',
      message = 'standalone_presentation_required';
  end if;

  select server_id into channel_server_id
  from public.channels
  where id = p_channel_id and kind = 'text';
  if channel_server_id is null or not exists (
    select 1 from public.memberships
    where server_id = channel_server_id and user_id = requesting_user_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Channel membership required.';
  end if;

  perform private.validate_rich_presentation(
    p_presentation,
    channel_server_id
  );

  if p_reply_to_id is not null then
    select * into parent
    from public.messages
    where id = p_reply_to_id
      and channel_id = p_channel_id
      and deleted_at is null;
    if not found then
      raise exception using
        errcode = '22023',
        message = 'reply_target_unavailable';
    end if;
  end if;

  select * into created_message
  from public.send_message(p_channel_id, input_content);

  update public.messages
  set
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

  return next created_message;
end;
$$;

create function public.send_direct_message_v2(
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
  expected_attachments integer := coalesce(array_length(p_attachment_ids, 1), 0);
begin
  if p_presentation is null
    or p_presentation ->> 'kind' <> 'giphy'
    or jsonb_array_length(input_content) = 0
  then
    return query
    select * from public.send_direct_message_v2_base(
      p_conversation_id,
      p_content,
      p_reply_to_id,
      p_reply_notifies_author,
      p_attachment_ids,
      p_presentation
    );
    return;
  end if;

  if expected_attachments > 0 then
    raise exception using
      errcode = '22023',
      message = 'standalone_presentation_required';
  end if;

  if not exists (
    select 1 from public.direct_conversations
    where id = p_conversation_id
      and requesting_user_id in (user_a_id, user_b_id)
  ) then
    raise exception using
      errcode = '42501',
      message = 'Conversation participation required.';
  end if;

  perform private.validate_rich_presentation(p_presentation, null);

  if p_reply_to_id is not null then
    select * into parent
    from public.direct_messages
    where id = p_reply_to_id
      and conversation_id = p_conversation_id
      and deleted_at is null;
    if not found then
      raise exception using
        errcode = '22023',
        message = 'reply_target_unavailable';
    end if;
  end if;

  select * into created_message
  from public.send_direct_message(p_conversation_id, input_content);

  update public.direct_messages
  set
    reply_to_id = p_reply_to_id,
    reply_notifies_author = (
      p_reply_to_id is not null
      and p_reply_notifies_author
      and parent.author_id <> requesting_user_id
    ),
    presentation = p_presentation
  where id = created_message.id
  returning * into created_message;

  return next created_message;
end;
$$;

grant execute on function public.send_message_v2(
  uuid, jsonb, uuid, boolean, uuid[], jsonb
) to authenticated;

grant execute on function public.send_direct_message_v2(
  uuid, jsonb, uuid, boolean, uuid[], jsonb
) to authenticated;

commit;
