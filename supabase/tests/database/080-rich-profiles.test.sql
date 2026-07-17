begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

select has_column('public', 'profiles', 'description');
select has_column('public', 'profiles', 'avatar_animation_path');
select has_column('public', 'profiles', 'cover_path');
select has_column('public', 'profiles', 'cover_animation_path');
select has_column('public', 'profiles', 'cover_position_x');
select has_column('public', 'profiles', 'cover_position_y');

select ok(
  has_column_privilege(
    'authenticated',
    'public.profiles',
    'description',
    'UPDATE'
  ),
  'authenticated users can update their RLS-filtered description'
);
select ok(
  has_column_privilege(
    'authenticated',
    'public.profiles',
    'cover_path',
    'UPDATE'
  ),
  'authenticated users can update their RLS-filtered cover path'
);
select is(
  (select public from storage.buckets where id = 'profile-covers'),
  false,
  'profile covers stay private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'profile-covers'),
  10485760::bigint,
  'profile covers are limited to ten MiB'
);
select is(
  (
    select allowed_mime_types
    from storage.buckets
    where id = 'profile-covers'
  ),
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[],
  'profile covers accept the approved image formats'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '80000000-0000-4000-8000-000000000001',
    'rich-profile-owner@example.invalid',
    '{"display_name":"Rich Profile Owner"}'::jsonb
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    'rich-profile-friend@example.invalid',
    '{"display_name":"Rich Profile Friend"}'::jsonb
  ),
  (
    '80000000-0000-4000-8000-000000000003',
    'rich-profile-outsider@example.invalid',
    '{"display_name":"Rich Profile Outsider"}'::jsonb
  );

insert into public.servers (id, name)
values
  ('80000000-0000-4000-8000-000000000100', 'Rich Profile Friends'),
  ('80000000-0000-4000-8000-000000000200', 'Rich Profile Outsiders');

insert into public.memberships (server_id, user_id, role)
values
  (
    '80000000-0000-4000-8000-000000000100',
    '80000000-0000-4000-8000-000000000001',
    'admin'
  ),
  (
    '80000000-0000-4000-8000-000000000100',
    '80000000-0000-4000-8000-000000000002',
    'member'
  ),
  (
    '80000000-0000-4000-8000-000000000200',
    '80000000-0000-4000-8000-000000000003',
    'admin'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '80000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$update public.profiles
    set description = 'Tea and tiny experiments.',
        avatar_animation_path = '80000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-00000000a001',
        cover_path = '80000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-00000000c001',
        cover_animation_path = '80000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-00000000c002',
        cover_position_x = 72,
        cover_position_y = 34
    where id = '80000000-0000-4000-8000-000000000001'$$,
  'an owner can update every rich-profile field'
);
select throws_ok(
  $$update public.profiles
    set description = repeat('x', 191)
    where id = '80000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'descriptions longer than 190 characters are rejected'
);
select throws_ok(
  $$update public.profiles
    set cover_position_x = 101
    where id = '80000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'cover focal points stay inside their normalized range'
);
select throws_ok(
  $$update public.profiles
    set cover_path = '80000000-0000-4000-8000-000000000002/80000000-0000-4000-8000-00000000c001'
    where id = '80000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'a profile cannot reference another owner cover'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values (
      'profile-covers',
      '80000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-00000000c001'
    )$$,
  'a profile owner can upload a generated cover path'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values (
      'profile-covers',
      '80000000-0000-4000-8000-000000000002/80000000-0000-4000-8000-00000000c002'
    )$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'an owner cannot upload into another profile folder'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-covers'),
  1::bigint,
  'the owner can read their private cover'
);

set local "request.jwt.claim.sub" = '80000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from storage.objects where bucket_id = 'profile-covers'),
  1::bigint,
  'a shared-server friend can read the private cover'
);
select is(
  (
    select description
    from public.profiles
    where id = '80000000-0000-4000-8000-000000000001'
  ),
  'Tea and tiny experiments.',
  'a shared-server friend can read the profile description'
);
select lives_ok(
  $$update public.profiles
    set description = 'not allowed'
    where id = '80000000-0000-4000-8000-000000000001'$$,
  'updating another visible profile is safely RLS-filtered'
);

reset role;
select is(
  (
    select description
    from public.profiles
    where id = '80000000-0000-4000-8000-000000000001'
  ),
  'Tea and tiny experiments.',
  'a friend did not modify the owner profile'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '80000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"80000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*) from storage.objects where bucket_id = 'profile-covers'),
  0::bigint,
  'a cross-server outsider cannot read the cover'
);
select is(
  (
    select count(*)
    from public.profiles
    where id = '80000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'a cross-server outsider cannot read the rich profile'
);
select lives_ok(
  $$delete from storage.objects
    where bucket_id = 'profile-covers'$$,
  'an outsider cover delete is safely RLS-filtered'
);

reset role;
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-covers'),
  1::bigint,
  'the outsider did not delete the cover'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'profile cover owners can % objects'
  ),
  4::bigint,
  'owner cover read, insert, update, and delete policies are installed'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'shared server members can read profile covers'
  ),
  1::bigint,
  'the shared-member cover read policy is installed'
);

select * from finish();
rollback;
