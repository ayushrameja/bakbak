begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'soundboard',
  'soundboard',
  false,
  1048576,
  array['audio/mpeg']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "server members can read soundboard objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'soundboard'
  and exists (
    select 1
    from public.memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.server_id::text = (storage.foldername(name))[1]
  )
);

commit;
