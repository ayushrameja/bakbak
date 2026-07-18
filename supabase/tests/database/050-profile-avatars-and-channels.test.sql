begin;

create extension if not exists pgtap with schema extensions;
select plan(45);

select has_column(
  'public',
  'profiles',
  'avatar_path',
  'profiles retain a private avatar object path'
);
select has_column(
  'public',
  'profiles',
  'avatar_url',
  'the legacy avatar URL remains available during migration'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'avatar_path', 'UPDATE'),
  'authenticated users can update an RLS-filtered avatar path'
);
select is(
  (select public from storage.buckets where id = 'avatars'),
  false,
  'avatars bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  5242880::bigint,
  'avatar objects are limited to five MiB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'avatars'),
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[],
  'avatars accept PNG, JPEG, WebP, and GIF images'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ),
  'profiles are published to Realtime'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'channels'
  ),
  'channels are published to Realtime'
);

select has_function(
  'public',
  'create_channel',
  array['uuid', 'public.channel_kind', 'text'],
  'admin channel creation RPC exists'
);
select has_function(
  'public',
  'rename_channel',
  array['uuid', 'text'],
  'admin channel rename RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_channel(uuid, public.channel_kind, text)',
    'EXECUTE'
  ),
  'authenticated users can invoke the guarded channel creation RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.rename_channel(uuid, text)',
    'EXECUTE'
  ),
  'authenticated users can invoke the guarded channel rename RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_channel(uuid, public.channel_kind, text)',
    'EXECUTE'
  ),
  'anonymous users cannot invoke channel creation'
);
select ok(
  not has_table_privilege('authenticated', 'public.channels', 'INSERT')
    and not has_table_privilege('authenticated', 'public.channels', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.channels', 'DELETE'),
  'authenticated users retain no direct channel mutation privileges'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '50000000-0000-4000-8000-000000000001',
    'avatar-channel-admin@example.invalid',
    '{"display_name":"Avatar Channel Admin"}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    'avatar-owner@example.invalid',
    '{"display_name":"Avatar Owner"}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000003',
    'shared-member@example.invalid',
    '{"display_name":"Shared Member"}'::jsonb
  ),
  (
    '50000000-0000-4000-8000-000000000004',
    'other-server-admin@example.invalid',
    '{"display_name":"Other Server Admin"}'::jsonb
  );

insert into public.servers (id, name)
values ('50000000-0000-4000-8000-000000000100', 'Other channel server');

insert into public.memberships (server_id, user_id, role)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'admin'
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    'member'
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000003',
    'member'
  ),
  (
    '50000000-0000-4000-8000-000000000100',
    '50000000-0000-4000-8000-000000000004',
    'admin'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok(
  $$update public.profiles set avatar_path = '50000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-00000000a001' where id = '50000000-0000-4000-8000-000000000002'$$,
  'a user can point their profile at their generated avatar path'
);
select throws_ok(
  $$update public.profiles set avatar_path = '50000000-0000-4000-8000-000000000003/50000000-0000-4000-8000-00000000a001' where id = '50000000-0000-4000-8000-000000000002'$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_avatar_path_owner_check"',
  'a profile cannot point at another user folder'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('avatars', '50000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-00000000a001')$$,
  'an owner can upload a generated avatar object path'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('avatars', '50000000-0000-4000-8000-000000000003/50000000-0000-4000-8000-00000000a002')$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'an owner cannot upload into another user folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('avatars', '50000000-0000-4000-8000-000000000002/not-a-generated-id.png')$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'avatar uploads require the exact owner/generated-id path shape'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'avatars'),
  1::bigint,
  'an owner can read their avatar object'
);

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from storage.objects where bucket_id = 'avatars'),
  1::bigint,
  'a shared server member can read another member avatar'
);
select lives_ok(
  $$update storage.objects set metadata = '{"attempted":true}'::jsonb where bucket_id = 'avatars' and name = '50000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-00000000a001'$$,
  'a shared member avatar update is RLS-filtered rather than escalated'
);

reset role;
select is(
  (
    select metadata ->> 'attempted'
    from storage.objects
    where bucket_id = 'avatars'
      and name = '50000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-00000000a001'
  ),
  null::text,
  'a shared member cannot modify another member avatar'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000004';
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000004","role":"authenticated"}';

select is(
  (select count(*) from storage.objects where bucket_id = 'avatars'),
  0::bigint,
  'a user from another server cannot read the avatar object'
);

reset role;
select is(
  (
    select cmd
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatar owners can delete objects'
  ),
  'DELETE',
  'avatar owners receive an explicit Storage delete policy'
);
select ok(
  (
    select
      'authenticated' = any (roles)
      and qual like '%avatars%'
      and qual like '%auth.uid()%'
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatar owners can delete objects'
  ),
  'the avatar delete policy is scoped to authenticated owners'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.create_channel('00000000-0000-4000-8000-000000000001', 'text', '  planning  ')$$,
  'a server admin can create a text channel'
);
select lives_ok(
  $$select public.create_channel('00000000-0000-4000-8000-000000000001', 'voice', 'Studio')$$,
  'a server admin can create a voice channel'
);

reset role;
select is(
  (
    select name
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and lower(name) = 'planning'
  ),
  'planning',
  'channel creation trims the stored name'
);
select is(
  (
    select position
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and name = 'planning'
  ),
  10,
  'new uncategorized text channels start their own ordered shelf'
);
select is(
  (
    select position
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and name = 'Studio'
  ),
  10,
  'new uncategorized voice channels start their own ordered shelf'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.create_channel('00000000-0000-4000-8000-000000000001', 'text', 'PLANNING')$$,
  '23505',
  'channel_name_unavailable',
  'case-insensitive duplicate channel names are rejected'
);
select throws_ok(
  $$select public.create_channel('00000000-0000-4000-8000-000000000001', 'text', '   ')$$,
  '22023',
  'Channel name must be between 1 and 80 characters.',
  'blank channel names are rejected'
);
select lives_ok(
  $$select public.rename_channel((select id from public.channels where server_id = '00000000-0000-4000-8000-000000000001' and name = 'planning'), '  road-map  ')$$,
  'a server admin can rename a channel'
);

reset role;
select ok(
  (
    select name = 'road-map'
      and kind = 'text'
      and category_id is null
      and position = 10
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and lower(name) = 'road-map'
  ),
  'rename preserves the channel identity fields and trims its name'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.rename_channel((select id from public.channels where server_id = '00000000-0000-4000-8000-000000000001' and name = 'road-map'), 'SPAWN')$$,
  '23505',
  'channel_name_unavailable',
  'rename rejects a case-insensitive duplicate'
);

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.create_channel('00000000-0000-4000-8000-000000000001', 'text', 'member-made')$$,
  '42501',
  'Server admin permission required.',
  'a regular member cannot create channels'
);
select throws_ok(
  $$select public.rename_channel((select id from public.channels where server_id = '00000000-0000-4000-8000-000000000001' and name = 'road-map'), 'member-renamed')$$,
  '42501',
  'Channel unavailable or admin permission required.',
  'a regular member cannot rename channels'
);
select is(
  (
    select count(*)
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and name = 'road-map'
  ),
  1::bigint,
  'a member can still read the admin-created channel'
);

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000004';
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok(
  $$select public.create_channel('00000000-0000-4000-8000-000000000001', 'text', 'cross-server')$$,
  '42501',
  'Server admin permission required.',
  'an admin cannot create channels in another server'
);
select throws_ok(
  $$select public.rename_channel('00000000-0000-4000-8000-000000000101', 'cross-server')$$,
  '42501',
  'Channel unavailable or admin permission required.',
  'an admin cannot rename channels in another server'
);
select lives_ok(
  $$select public.create_channel('50000000-0000-4000-8000-000000000100', 'text', 'own-server')$$,
  'an admin can create a channel in their own server'
);

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$insert into public.channels (server_id, kind, name, position) values ('00000000-0000-4000-8000-000000000001', 'text', 'direct-write', 90)$$,
  '42501',
  'permission denied for table channels',
  'admins cannot bypass the guarded creation RPC'
);
select throws_ok(
  $$update public.channels set name = 'direct-update' where id = '00000000-0000-4000-8000-000000000101'$$,
  '42501',
  'permission denied for table channels',
  'admins cannot bypass the guarded rename RPC'
);
select throws_ok(
  $$delete from public.channels where id = '00000000-0000-4000-8000-000000000101'$$,
  '42501',
  'permission denied for table channels',
  'channel deletion remains unavailable'
);

select * from finish();
rollback;
