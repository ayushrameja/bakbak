begin;

alter table public.profiles
add column description text not null default '',
add column avatar_animation_path text,
add column cover_path text,
add column cover_animation_path text,
add column cover_position_x smallint not null default 50,
add column cover_position_y smallint not null default 50,
add constraint profiles_description_length check (
  char_length(description) <= 190
),
add constraint profiles_avatar_animation_path_owner_check check (
  avatar_animation_path is null
  or avatar_animation_path ~ (
    '^'
    || id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
),
add constraint profiles_cover_path_owner_check check (
  cover_path is null
  or cover_path ~ (
    '^'
    || id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
),
add constraint profiles_cover_animation_path_owner_check check (
  cover_animation_path is null
  or cover_animation_path ~ (
    '^'
    || id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
),
add constraint profiles_cover_position_x_range check (
  cover_position_x between 0 and 100
),
add constraint profiles_cover_position_y_range check (
  cover_position_y between 0 and 100
);

grant update (
  description,
  avatar_animation_path,
  cover_path,
  cover_animation_path,
  cover_position_x,
  cover_position_y
) on table public.profiles to authenticated;

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
where id = 'avatars';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-covers',
  'profile-covers',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "profile cover owners can read objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-covers'
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

create policy "shared server members can read profile covers"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-covers'
  and name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  and exists (
    select 1
    from public.memberships as mine
    inner join public.memberships as theirs
      on theirs.server_id = mine.server_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id::text = (storage.foldername(name))[1]
  )
);

create policy "profile cover owners can insert objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-covers'
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

create policy "profile cover owners can update objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-covers'
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
)
with check (
  bucket_id = 'profile-covers'
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

create policy "profile cover owners can delete objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-covers'
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

commit;
