begin;

drop policy if exists bakbak_members_receive_presence
on realtime.messages;
drop policy if exists bakbak_members_track_presence
on realtime.messages;
drop function if exists private.can_access_presence_topic(text);

create table public.presence_heartbeats (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null,
  primary key (server_id, user_id)
);

alter table public.presence_heartbeats enable row level security;

revoke all privileges on table public.presence_heartbeats
from public, anon, authenticated;
grant select on table public.presence_heartbeats to authenticated;

create policy presence_heartbeats_select_server_members
on public.presence_heartbeats
for select
to authenticated
using ((select private.is_server_member(presence_heartbeats.server_id)));

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

  insert into public.presence_heartbeats (server_id, user_id, last_seen_at)
  values (p_server_id, (select auth.uid()), heartbeat_at)
  on conflict (server_id, user_id)
  do update set last_seen_at = excluded.last_seen_at;

  return heartbeat_at;
end;
$$;

revoke all privileges on function public.heartbeat_presence(uuid)
from public, anon, authenticated;
grant execute on function public.heartbeat_presence(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'presence_heartbeats'
  ) then
    execute 'alter publication supabase_realtime add table public.presence_heartbeats';
  end if;
end;
$$;

commit;
