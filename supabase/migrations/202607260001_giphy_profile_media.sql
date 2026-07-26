begin;

alter table public.profiles
add column avatar_giphy_id text,
add column cover_giphy_id text,
add constraint profiles_avatar_giphy_id_format check (
  avatar_giphy_id is null
  or avatar_giphy_id ~ '^[A-Za-z0-9_-]{1,128}$'
),
add constraint profiles_cover_giphy_id_format check (
  cover_giphy_id is null
  or cover_giphy_id ~ '^[A-Za-z0-9_-]{1,128}$'
),
add constraint profiles_avatar_media_source check (
  avatar_giphy_id is null
  or (
    avatar_url is null
    and avatar_path is null
    and avatar_animation_path is null
  )
),
add constraint profiles_cover_media_source check (
  cover_giphy_id is null
  or (
    cover_path is null
    and cover_animation_path is null
  )
);

grant update (
  avatar_giphy_id,
  cover_giphy_id
) on table public.profiles to authenticated;

drop function public.get_direct_conversations();

create function public.get_direct_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  avatar_path text,
  avatar_animation_path text,
  avatar_giphy_id text,
  cover_path text,
  cover_animation_path text,
  cover_giphy_id text,
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
    other_profile.avatar_giphy_id,
    other_profile.cover_path,
    other_profile.cover_animation_path,
    other_profile.cover_giphy_id,
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

revoke all privileges on function public.get_direct_conversations()
from public, anon, authenticated;
grant execute on function public.get_direct_conversations()
to authenticated;

commit;
