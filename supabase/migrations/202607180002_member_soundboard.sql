begin;

alter table public.soundboard_categories
add column accepts_uploads boolean not null default false;

alter table public.soundboard_sounds
add column created_by uuid references public.profiles(id) on delete set null,
add column created_at timestamptz not null default now();

alter table public.soundboard_sounds
add constraint soundboard_sounds_server_id_id_key unique (server_id, id),
add constraint soundboard_member_duration_check check (
  created_by is null or duration_ms between 100 and 5000
);

update public.soundboard_categories
set name = 'System',
    position = 10,
    accepts_uploads = false
where id = '00000000-0000-4000-8000-000000001001'
  and server_id = '00000000-0000-4000-8000-000000000001';

update public.soundboard_sounds
set category_id = '00000000-0000-4000-8000-000000001001'
where server_id = '00000000-0000-4000-8000-000000000001'
  and category_id in (
    '00000000-0000-4000-8000-000000001002',
    '00000000-0000-4000-8000-000000001003',
    '00000000-0000-4000-8000-000000001004'
  );

update public.soundboard_categories
set name = 'Bakbak',
    position = 20,
    accepts_uploads = true
where id = '00000000-0000-4000-8000-000000001005'
  and server_id = '00000000-0000-4000-8000-000000000001';

delete from public.soundboard_categories
where server_id = '00000000-0000-4000-8000-000000000001'
  and id in (
    '00000000-0000-4000-8000-000000001002',
    '00000000-0000-4000-8000-000000001003',
    '00000000-0000-4000-8000-000000001004'
  );

create unique index soundboard_categories_one_upload_target_idx
on public.soundboard_categories (server_id)
where accepts_uploads;

create table public.soundboard_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  server_id uuid not null references public.servers(id) on delete cascade,
  sound_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, sound_id),
  constraint soundboard_favorites_sound_fk
    foreign key (server_id, sound_id)
    references public.soundboard_sounds(server_id, id)
    on delete cascade
);

create index soundboard_favorites_server_user_idx
on public.soundboard_favorites (server_id, user_id, created_at);

create or replace function private.is_server_admin(p_server_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships as membership
    where membership.server_id = p_server_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'admin'
  );
$$;

drop policy soundboard_sounds_update_server_members
on public.soundboard_sounds;

revoke update (label, emoji, category_id)
on public.soundboard_sounds
from authenticated;

grant update (label, emoji)
on public.soundboard_sounds
to authenticated;

create policy soundboard_sounds_update_owner_or_admin
on public.soundboard_sounds
for update
to authenticated
using (
  (select private.is_server_member(soundboard_sounds.server_id))
  and (
    soundboard_sounds.created_by = (select auth.uid())
    or (select private.is_server_admin(soundboard_sounds.server_id))
  )
)
with check (
  (select private.is_server_member(soundboard_sounds.server_id))
  and (
    soundboard_sounds.created_by = (select auth.uid())
    or (select private.is_server_admin(soundboard_sounds.server_id))
  )
);

alter table public.soundboard_favorites enable row level security;

revoke all privileges on table public.soundboard_favorites
from public, anon, authenticated;

grant select, insert, delete on table public.soundboard_favorites
to authenticated;

create policy soundboard_favorites_select_own
on public.soundboard_favorites
for select
to authenticated
using (
  soundboard_favorites.user_id = (select auth.uid())
  and (select private.is_server_member(soundboard_favorites.server_id))
);

create policy soundboard_favorites_insert_own
on public.soundboard_favorites
for insert
to authenticated
with check (
  soundboard_favorites.user_id = (select auth.uid())
  and (select private.is_server_member(soundboard_favorites.server_id))
);

create policy soundboard_favorites_delete_own
on public.soundboard_favorites
for delete
to authenticated
using (
  soundboard_favorites.user_id = (select auth.uid())
  and (select private.is_server_member(soundboard_favorites.server_id))
);

create or replace function public.create_soundboard_upload(
  p_server_id uuid,
  p_category_id uuid,
  p_created_by uuid,
  p_label text,
  p_emoji text,
  p_object_path text,
  p_duration_ms integer
)
returns public.soundboard_sounds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position integer;
  v_sound public.soundboard_sounds;
begin
  perform 1
  from public.servers
  where id = p_server_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'server_not_found';
  end if;

  if not exists (
    select 1
    from public.memberships
    where server_id = p_server_id
      and user_id = p_created_by
  ) then
    raise exception using errcode = '42501', message = 'membership_required';
  end if;

  if not exists (
    select 1
    from public.soundboard_categories
    where id = p_category_id
      and server_id = p_server_id
      and accepts_uploads
  ) then
    raise exception using errcode = '23514', message = 'upload_category_required';
  end if;

  if (
    select count(*)
    from public.soundboard_sounds
    where server_id = p_server_id
      and created_by = p_created_by
      and enabled
  ) >= 25 then
    raise exception using errcode = 'P0001', message = 'member_upload_limit';
  end if;

  if (
    select count(*)
    from public.soundboard_sounds
    where server_id = p_server_id
      and created_by is not null
      and enabled
  ) >= 200 then
    raise exception using errcode = 'P0001', message = 'server_upload_limit';
  end if;

  select coalesce(max(position), 0) + 10
  into v_position
  from public.soundboard_sounds
  where server_id = p_server_id
    and category_id = p_category_id;

  insert into public.soundboard_sounds (
    server_id,
    category_id,
    label,
    emoji,
    object_path,
    duration_ms,
    position,
    created_by
  )
  values (
    p_server_id,
    p_category_id,
    p_label,
    p_emoji,
    p_object_path,
    p_duration_ms,
    v_position,
    p_created_by
  )
  returning * into v_sound;

  return v_sound;
end;
$$;

revoke all privileges on function private.is_server_admin(uuid)
from public, anon, authenticated;
grant execute on function private.is_server_admin(uuid) to authenticated;

revoke all privileges on function public.create_soundboard_upload(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  integer
) from public, anon, authenticated;
grant execute on function public.create_soundboard_upload(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  integer
) to service_role;

update storage.buckets
set allowed_mime_types = array['audio/mpeg', 'audio/wav', 'audio/x-wav']
where id = 'soundboard';

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'soundboard_favorites'
  ) then
    execute 'alter publication supabase_realtime add table public.soundboard_favorites';
  end if;
end;
$$;

commit;
