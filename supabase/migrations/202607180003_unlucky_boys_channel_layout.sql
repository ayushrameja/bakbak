begin;

create table public.channel_categories (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  constraint channel_categories_name_length check (
    char_length(name) between 1 and 80
  ),
  constraint channel_categories_name_trimmed check (name = btrim(name)),
  constraint channel_categories_position_nonnegative check (position >= 0)
);

create unique index channel_categories_server_name_key
  on public.channel_categories (server_id, lower(name));

create unique index channel_categories_server_position_key
  on public.channel_categories (server_id, position);

alter table public.channel_categories enable row level security;

revoke all privileges on table public.channel_categories
from public, anon, authenticated;
grant select on table public.channel_categories to authenticated;

create policy channel_categories_select_server_members
on public.channel_categories
for select
to authenticated
using ((select private.is_server_member(channel_categories.server_id)));

alter table public.channels
add column category_id uuid references public.channel_categories (id);

create unique index channels_category_position_key
  on public.channels (category_id, position)
  where category_id is not null;

create index channels_server_category_position_idx
  on public.channels (server_id, category_id, position, id);

insert into public.channel_categories (id, server_id, name, position)
values
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000001',
    'Welcome',
    10
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000001',
    'Gamez',
    20
  ),
  (
    '00000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000001',
    'Only Study',
    30
  ),
  (
    '00000000-0000-4000-8000-000000000304',
    '00000000-0000-4000-8000-000000000001',
    'Content Creators',
    40
  ),
  (
    '00000000-0000-4000-8000-000000000305',
    '00000000-0000-4000-8000-000000000001',
    'Photos',
    50
  ),
  (
    '00000000-0000-4000-8000-000000000306',
    '00000000-0000-4000-8000-000000000001',
    'Software',
    60
  ),
  (
    '00000000-0000-4000-8000-000000000307',
    '00000000-0000-4000-8000-000000000001',
    'AFK',
    70
  );

-- Reuse the four original channel IDs so existing messages, read markers,
-- presence rows, and voice-room identities stay attached.
update public.channels as channel
set
  name = desired.name,
  category_id = desired.category_id,
  position = desired.position
from (
  values
    (
      '00000000-0000-4000-8000-000000000101'::uuid,
      'spawn'::text,
      '00000000-0000-4000-8000-000000000301'::uuid,
      10
    ),
    (
      '00000000-0000-4000-8000-000000000102'::uuid,
      'law'::text,
      '00000000-0000-4000-8000-000000000301'::uuid,
      20
    ),
    (
      '00000000-0000-4000-8000-000000000201'::uuid,
      'Queue'::text,
      '00000000-0000-4000-8000-000000000302'::uuid,
      40
    ),
    (
      '00000000-0000-4000-8000-000000000202'::uuid,
      'Crash'::text,
      '00000000-0000-4000-8000-000000000302'::uuid,
      50
    )
) as desired (id, name, category_id, position)
where channel.id = desired.id
  and channel.server_id = '00000000-0000-4000-8000-000000000001';

insert into public.channels (
  id,
  server_id,
  category_id,
  kind,
  name,
  position
)
values
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000301',
    'text',
    'ladder',
    30
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000301',
    'text',
    'rant',
    40
  ),
  (
    '00000000-0000-4000-8000-000000000105',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000301',
    'text',
    'gaane',
    50
  ),
  (
    '00000000-0000-4000-8000-000000000106',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000302',
    'text',
    'clips',
    10
  ),
  (
    '00000000-0000-4000-8000-000000000107',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000302',
    'text',
    'portals',
    20
  ),
  (
    '00000000-0000-4000-8000-000000000108',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000302',
    'text',
    'vault',
    30
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000302',
    'voice',
    'Songs Only',
    60
  ),
  (
    '00000000-0000-4000-8000-000000000109',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000303',
    'text',
    'why',
    10
  ),
  (
    '00000000-0000-4000-8000-000000000110',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000303',
    'text',
    'how',
    20
  ),
  (
    '00000000-0000-4000-8000-000000000111',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000303',
    'text',
    'notes',
    30
  ),
  (
    '00000000-0000-4000-8000-000000000112',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000303',
    'text',
    'deadline',
    40
  ),
  (
    '00000000-0000-4000-8000-000000000204',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000303',
    'voice',
    'Focus',
    50
  ),
  (
    '00000000-0000-4000-8000-000000000205',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000303',
    'voice',
    'Loop',
    60
  ),
  (
    '00000000-0000-4000-8000-000000000113',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000304',
    'text',
    'old-edits',
    10
  ),
  (
    '00000000-0000-4000-8000-000000000114',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000304',
    'text',
    'ink',
    20
  ),
  (
    '00000000-0000-4000-8000-000000000115',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000304',
    'text',
    'preparation',
    30
  ),
  (
    '00000000-0000-4000-8000-000000000116',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000305',
    'text',
    'meme',
    10
  ),
  (
    '00000000-0000-4000-8000-000000000117',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000305',
    'text',
    'wallpapers',
    20
  ),
  (
    '00000000-0000-4000-8000-000000000118',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000306',
    'text',
    'links',
    10
  ),
  (
    '00000000-0000-4000-8000-000000000206',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000307',
    'voice',
    'AFK',
    10
  )
on conflict do nothing;

-- A hosted server may already contain an admin-created room with one of the
-- mirrored names. Reuse that row so its messages and other references remain
-- attached instead of failing or creating a duplicate.
update public.channels as channel
set
  category_id = desired.category_id,
  position = desired.position
from (
  values
    (
      'text'::public.channel_kind,
      'ladder'::text,
      '00000000-0000-4000-8000-000000000301'::uuid,
      30
    ),
    (
      'text'::public.channel_kind,
      'rant'::text,
      '00000000-0000-4000-8000-000000000301'::uuid,
      40
    ),
    (
      'text'::public.channel_kind,
      'gaane'::text,
      '00000000-0000-4000-8000-000000000301'::uuid,
      50
    ),
    (
      'text'::public.channel_kind,
      'clips'::text,
      '00000000-0000-4000-8000-000000000302'::uuid,
      10
    ),
    (
      'text'::public.channel_kind,
      'portals'::text,
      '00000000-0000-4000-8000-000000000302'::uuid,
      20
    ),
    (
      'text'::public.channel_kind,
      'vault'::text,
      '00000000-0000-4000-8000-000000000302'::uuid,
      30
    ),
    (
      'voice'::public.channel_kind,
      'Songs Only'::text,
      '00000000-0000-4000-8000-000000000302'::uuid,
      60
    ),
    (
      'text'::public.channel_kind,
      'why'::text,
      '00000000-0000-4000-8000-000000000303'::uuid,
      10
    ),
    (
      'text'::public.channel_kind,
      'how'::text,
      '00000000-0000-4000-8000-000000000303'::uuid,
      20
    ),
    (
      'text'::public.channel_kind,
      'notes'::text,
      '00000000-0000-4000-8000-000000000303'::uuid,
      30
    ),
    (
      'text'::public.channel_kind,
      'deadline'::text,
      '00000000-0000-4000-8000-000000000303'::uuid,
      40
    ),
    (
      'voice'::public.channel_kind,
      'Focus'::text,
      '00000000-0000-4000-8000-000000000303'::uuid,
      50
    ),
    (
      'voice'::public.channel_kind,
      'Loop'::text,
      '00000000-0000-4000-8000-000000000303'::uuid,
      60
    ),
    (
      'text'::public.channel_kind,
      'old-edits'::text,
      '00000000-0000-4000-8000-000000000304'::uuid,
      10
    ),
    (
      'text'::public.channel_kind,
      'ink'::text,
      '00000000-0000-4000-8000-000000000304'::uuid,
      20
    ),
    (
      'text'::public.channel_kind,
      'preparation'::text,
      '00000000-0000-4000-8000-000000000304'::uuid,
      30
    ),
    (
      'text'::public.channel_kind,
      'meme'::text,
      '00000000-0000-4000-8000-000000000305'::uuid,
      10
    ),
    (
      'text'::public.channel_kind,
      'wallpapers'::text,
      '00000000-0000-4000-8000-000000000305'::uuid,
      20
    ),
    (
      'text'::public.channel_kind,
      'links'::text,
      '00000000-0000-4000-8000-000000000306'::uuid,
      10
    ),
    (
      'voice'::public.channel_kind,
      'AFK'::text,
      '00000000-0000-4000-8000-000000000307'::uuid,
      10
    )
) as desired (kind, name, category_id, position)
where channel.server_id = '00000000-0000-4000-8000-000000000001'
  and channel.kind = desired.kind
  and lower(channel.name) = lower(desired.name);

create or replace function public.create_channel(
  p_server_id uuid,
  p_kind public.channel_kind,
  p_name text
)
returns setof public.channels
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  normalized_name text;
  next_position integer;
  created_channel public.channels%rowtype;
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required.';
  end if;

  perform 1
  from public.memberships as membership
  where membership.server_id = p_server_id
    and membership.user_id = requesting_user_id
    and membership.role = 'admin'
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Server admin permission required.';
  end if;

  if p_kind is null then
    raise exception using
      errcode = '22023',
      message = 'Channel kind is required.';
  end if;

  normalized_name := pg_catalog.btrim(p_name);
  if normalized_name is null
    or pg_catalog.char_length(normalized_name) not between 1 and 80
  then
    raise exception using
      errcode = '22023',
      message = 'Channel name must be between 1 and 80 characters.';
  end if;

  perform 1
  from public.servers as server
  where server.id = p_server_id
  for update;

  select coalesce(max(channel.position), 0) + 10
  into next_position
  from public.channels as channel
  where channel.server_id = p_server_id
    and channel.category_id is null
    and channel.kind = p_kind;

  begin
    insert into public.channels (server_id, kind, name, position)
    values (p_server_id, p_kind, normalized_name, next_position)
    returning * into created_channel;
  exception
    when unique_violation then
      raise exception using
        errcode = '23505',
        message = 'channel_name_unavailable';
  end;

  return next created_channel;
  return;
end;
$$;

commit;
