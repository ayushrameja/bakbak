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
  select
    channel.id as channel_id,
    channel.server_id,
    profile.display_name
  from public.channels as channel
  join public.memberships as membership
    on membership.server_id = channel.server_id
    and membership.user_id = auth.uid()
  join public.profiles as profile
    on profile.id = auth.uid()
  where channel.id = p_channel_id
    and channel.kind = 'voice'
  limit 1
$$;

revoke all privileges on function public.get_voice_join_context(uuid)
from public, anon, authenticated;

grant execute on function public.get_voice_join_context(uuid)
to authenticated;
