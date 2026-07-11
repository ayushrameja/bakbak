begin;

create or replace function private.can_access_presence_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    pg_catalog.split_part(p_topic, ':', 1) = 'server'
    and pg_catalog.split_part(p_topic, ':', 3) = 'presence'
    and exists (
      select 1
      from public.memberships as membership
      where membership.user_id = (select auth.uid())
        and membership.server_id::text = pg_catalog.split_part(p_topic, ':', 2)
    );
$$;

revoke all privileges
on function private.can_access_presence_topic(text)
from public;

alter table realtime.messages enable row level security;

drop policy if exists bakbak_members_receive_presence
on realtime.messages;
create policy bakbak_members_receive_presence
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'presence'
  and (select private.can_access_presence_topic((select realtime.topic())))
);

drop policy if exists bakbak_members_track_presence
on realtime.messages;
create policy bakbak_members_track_presence
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and (select private.can_access_presence_topic((select realtime.topic())))
);

commit;
