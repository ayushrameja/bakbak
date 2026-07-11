begin;

alter table public.presence_heartbeats
add column voice_channel_id uuid references public.channels(id) on delete set null,
add column voice_joined_at timestamptz,
add constraint presence_heartbeats_voice_pair_check check (
  (voice_channel_id is null and voice_joined_at is null)
  or (voice_channel_id is not null and voice_joined_at is not null)
);

create index presence_heartbeats_voice_channel_idx
on public.presence_heartbeats (voice_channel_id)
where voice_channel_id is not null;

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
    select 1
    from public.memberships as membership
    where membership.server_id = p_server_id
      and membership.user_id = (select auth.uid())
  ) then
    raise exception using
      errcode = '42501',
      message = 'Server membership required.';
  end if;

  insert into public.presence_heartbeats (
    server_id,
    user_id,
    last_seen_at,
    voice_channel_id,
    voice_joined_at
  )
  values (p_server_id, (select auth.uid()), heartbeat_at, null, null)
  on conflict (server_id, user_id)
  do update set
    last_seen_at = excluded.last_seen_at,
    voice_channel_id = null,
    voice_joined_at = null;

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
    select 1
    from public.memberships as membership
    where membership.server_id = p_server_id
      and membership.user_id = (select auth.uid())
  ) then
    raise exception using
      errcode = '42501',
      message = 'Server membership required.';
  end if;

  if p_voice_channel_id is not null and not exists (
    select 1
    from public.channels as channel
    where channel.id = p_voice_channel_id
      and channel.server_id = p_server_id
      and channel.kind = 'voice'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Voice channel is invalid.';
  end if;

  insert into public.presence_heartbeats (
    server_id,
    user_id,
    last_seen_at,
    voice_channel_id,
    voice_joined_at
  )
  values (
    p_server_id,
    (select auth.uid()),
    heartbeat_at,
    p_voice_channel_id,
    case when p_voice_channel_id is null then null else heartbeat_at end
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
    end;

  return heartbeat_at;
end;
$$;

revoke all privileges on function public.heartbeat_presence_v2(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.heartbeat_presence_v2(uuid, uuid)
to authenticated;

commit;

