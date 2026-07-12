begin;

create table public.soundboard_categories (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint soundboard_categories_name_length check (
    char_length(btrim(name)) between 1 and 40
  ),
  constraint soundboard_categories_position_nonnegative check (position >= 0),
  unique (server_id, id)
);

create unique index soundboard_categories_server_name_key
on public.soundboard_categories (server_id, lower(name));

create table public.soundboard_sounds (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  category_id uuid not null,
  label text not null,
  emoji text not null,
  object_path text not null,
  duration_ms integer not null,
  position integer not null default 0,
  audio_revision integer not null default 1,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint soundboard_sounds_category_fk
    foreign key (server_id, category_id)
    references public.soundboard_categories(server_id, id)
    on delete restrict,
  constraint soundboard_sounds_label_length check (
    char_length(btrim(label)) between 1 and 50
  ),
  constraint soundboard_sounds_emoji_length check (
    char_length(btrim(emoji)) between 1 and 16
  ),
  constraint soundboard_sounds_path_length check (
    char_length(object_path) between 1 and 512
  ),
  constraint soundboard_sounds_server_path check (
    split_part(object_path, '/', 1) = server_id::text
  ),
  constraint soundboard_sounds_duration_positive check (duration_ms > 0),
  constraint soundboard_sounds_position_nonnegative check (position >= 0),
  constraint soundboard_sounds_revision_positive check (audio_revision > 0),
  unique (server_id, object_path)
);

create index soundboard_sounds_server_category_position_idx
on public.soundboard_sounds (server_id, category_id, position, id);

create or replace function private.set_soundboard_sound_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger soundboard_sounds_set_audit
before update on public.soundboard_sounds
for each row execute function private.set_soundboard_sound_audit();

alter table public.soundboard_categories enable row level security;
alter table public.soundboard_sounds enable row level security;

revoke all privileges on table public.soundboard_categories from anon, authenticated;
revoke all privileges on table public.soundboard_sounds from anon, authenticated;

grant select on table public.soundboard_categories to authenticated;
grant select on table public.soundboard_sounds to authenticated;
grant update (label, emoji, category_id) on table public.soundboard_sounds
to authenticated;

create policy soundboard_categories_select_server_members
on public.soundboard_categories
for select
to authenticated
using ((select private.is_server_member(soundboard_categories.server_id)));

create policy soundboard_sounds_select_server_members
on public.soundboard_sounds
for select
to authenticated
using ((select private.is_server_member(soundboard_sounds.server_id)));

create policy soundboard_sounds_update_server_members
on public.soundboard_sounds
for update
to authenticated
using ((select private.is_server_member(soundboard_sounds.server_id)))
with check ((select private.is_server_member(soundboard_sounds.server_id)));

revoke all privileges on function private.set_soundboard_sound_audit()
from public, anon, authenticated;

insert into public.soundboard_categories (id, server_id, name, position)
values
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000001', 'Reactions', 10),
  ('00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000001', 'Dialogue', 20),
  ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000001', 'Effects', 30),
  ('00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000000001', 'Chaos', 40);

insert into public.soundboard_sounds (
  id,
  server_id,
  category_id,
  label,
  emoji,
  object_path,
  duration_ms,
  position
)
values
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001001', 'Aye', '😎', '00000000-0000-4000-8000-000000000001/Aye.mp3', 450, 10),
  ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001001', 'Faah', '😮', '00000000-0000-4000-8000-000000000001/Faah.mp3', 1771, 20),
  ('00000000-0000-4000-8000-000000002003', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001001', 'Suuuse', '🤨', '00000000-0000-4000-8000-000000000001/Suuuse.mp3', 1199, 30),
  ('00000000-0000-4000-8000-000000002004', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001001', 'Waah Modiji Waah', '👏', '00000000-0000-4000-8000-000000000001/Waah Modiji Waah.mp3', 1717, 40),
  ('00000000-0000-4000-8000-000000002005', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001002', 'Ab Tu Gya Beta', '☠️', '00000000-0000-4000-8000-000000000001/Ab Tu Gya Beta.mp3', 1428, 10),
  ('00000000-0000-4000-8000-000000002006', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001002', 'CID', '🕵️', '00000000-0000-4000-8000-000000000001/CID.mp3', 5709, 20),
  ('00000000-0000-4000-8000-000000002007', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001002', 'Chin Tapak Dam Dam', '✨', '00000000-0000-4000-8000-000000000001/Chin Tapak Dam Dam.mp3', 2342, 30),
  ('00000000-0000-4000-8000-000000002008', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001002', 'Ek Jhaat Bhar Ka Aadmi', '🤏', '00000000-0000-4000-8000-000000000001/Ek Jhaat Bhar Ka Aadmi.mp3', 6478, 40),
  ('00000000-0000-4000-8000-000000002009', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001002', 'Ki Haal A Theko Naa', '📞', '00000000-0000-4000-8000-000000000001/Ki Haal A Theko Naa.mp3', 49667, 50),
  ('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001002', 'Kyu Re Madarchod', '🤬', '00000000-0000-4000-8000-000000000001/Kyu Re Madarchod.mp3', 1813, 60),
  ('00000000-0000-4000-8000-000000002011', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001002', 'Makabhosda', '💀', '00000000-0000-4000-8000-000000000001/Makabhosda.mp3', 2160, 70),
  ('00000000-0000-4000-8000-000000002012', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001002', 'Modi Ji Wah Sound Effect', '🙌', '00000000-0000-4000-8000-000000000001/Modi Ji Wah Sound Effect.mp3', 6100, 80),
  ('00000000-0000-4000-8000-000000002013', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001002', 'Raja Gujjar', '👑', '00000000-0000-4000-8000-000000000001/Raja Gujjar.mp3', 14791, 90),
  ('00000000-0000-4000-8000-000000002014', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001003', 'Cartoon Walk', '🚶', '00000000-0000-4000-8000-000000000001/Cartoon Walk.mp3', 993, 10),
  ('00000000-0000-4000-8000-000000002015', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001003', 'Old Spice Whistle', '🎵', '00000000-0000-4000-8000-000000000001/Old Spice Whistle.mp3', 2181, 20),
  ('00000000-0000-4000-8000-000000002016', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001003', 'Payment Notification', '💸', '00000000-0000-4000-8000-000000000001/Payment Notification.mp3', 4200, 30),
  ('00000000-0000-4000-8000-000000002017', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001003', 'Running Sound Effect', '🏃', '00000000-0000-4000-8000-000000000001/Running Sound Effect.mp3', 2116, 40),
  ('00000000-0000-4000-8000-000000002018', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001003', 'Tum Dum', '🥁', '00000000-0000-4000-8000-000000000001/Tum Dum.mp3', 5878, 50),
  ('00000000-0000-4000-8000-000000002019', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001004', 'AUUGHH', '😩', '00000000-0000-4000-8000-000000000001/AUUGHH.mp3', 2770, 10),
  ('00000000-0000-4000-8000-000000002020', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001004', 'Anime Aah', '😳', '00000000-0000-4000-8000-000000000001/Anime Aah.mp3', 1857, 20),
  ('00000000-0000-4000-8000-000000002021', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001004', 'Evil 1', '😈', '00000000-0000-4000-8000-000000000001/Evil 1.mp3', 6783, 30),
  ('00000000-0000-4000-8000-000000002022', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001004', 'HolloWeene Aughhh', '👻', '00000000-0000-4000-8000-000000000001/HolloWeene Aughhh.mp3', 792, 40),
  ('00000000-0000-4000-8000-000000002023', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001004', 'Meow Ghop', '🐈', '00000000-0000-4000-8000-000000000001/Meow Ghop.mp3', 5691, 50);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) then
    execute 'create publication supabase_realtime';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'soundboard_categories'
  ) then
    execute 'alter publication supabase_realtime add table public.soundboard_categories';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'soundboard_sounds'
  ) then
    execute 'alter publication supabase_realtime add table public.soundboard_sounds';
  end if;
end;
$$;

commit;
