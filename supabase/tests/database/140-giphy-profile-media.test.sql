begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

select has_column(
  'public',
  'profiles',
  'avatar_giphy_id',
  'profiles include a GIPHY avatar identifier'
);
select has_column(
  'public',
  'profiles',
  'cover_giphy_id',
  'profiles include a GIPHY cover identifier'
);
select ok(
  has_column_privilege(
    'authenticated',
    'public.profiles',
    'avatar_giphy_id',
    'UPDATE'
  ),
  'authenticated owners can update their RLS-filtered avatar identifier'
);
select ok(
  has_column_privilege(
    'authenticated',
    'public.profiles',
    'cover_giphy_id',
    'UPDATE'
  ),
  'authenticated owners can update their RLS-filtered cover identifier'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '94000000-0000-4000-8000-000000000001',
    'giphy-profile-owner@example.invalid',
    '{"display_name":"GIPHY Owner"}'::jsonb
  ),
  (
    '94000000-0000-4000-8000-000000000002',
    'giphy-profile-friend@example.invalid',
    '{"display_name":"GIPHY Friend"}'::jsonb
  ),
  (
    '94000000-0000-4000-8000-000000000003',
    'giphy-profile-outsider@example.invalid',
    '{"display_name":"GIPHY Outsider"}'::jsonb
  );

insert into public.servers (id, name)
values
  ('94000000-0000-4000-8000-000000000100', 'GIPHY Friends'),
  ('94000000-0000-4000-8000-000000000200', 'GIPHY Outsiders');

insert into public.memberships (server_id, user_id, role)
values
  (
    '94000000-0000-4000-8000-000000000100',
    '94000000-0000-4000-8000-000000000001',
    'admin'
  ),
  (
    '94000000-0000-4000-8000-000000000100',
    '94000000-0000-4000-8000-000000000002',
    'member'
  ),
  (
    '94000000-0000-4000-8000-000000000200',
    '94000000-0000-4000-8000-000000000003',
    'admin'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '94000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"94000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$update public.profiles
    set avatar_giphy_id = 'avatar-GIF_123',
        cover_giphy_id = 'cover-GIF_456'
    where id = '94000000-0000-4000-8000-000000000001'$$,
  'an owner can select GIPHY media for both profile fields'
);
select is(
  (
    select avatar_giphy_id
    from public.profiles
    where id = '94000000-0000-4000-8000-000000000001'
  ),
  'avatar-GIF_123',
  'the provider identifier is stored without a provider URL'
);
select throws_ok(
  $$update public.profiles
    set avatar_giphy_id = 'not a provider id'
    where id = '94000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'invalid provider identifiers are rejected'
);
select throws_ok(
  $$update public.profiles
    set avatar_path = '94000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-00000000a001'
    where id = '94000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'GIPHY and uploaded avatar sources cannot coexist'
);
select throws_ok(
  $$update public.profiles
    set cover_path = '94000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-00000000c001'
    where id = '94000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'GIPHY and uploaded cover sources cannot coexist'
);

set local "request.jwt.claim.sub" = '94000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"94000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (
    select avatar_giphy_id
    from public.profiles
    where id = '94000000-0000-4000-8000-000000000001'
  ),
  'avatar-GIF_123',
  'a shared-server friend can read the selected avatar identifier'
);
select lives_ok(
  $$select public.get_or_create_direct_conversation(
    '94000000-0000-4000-8000-000000000001'
  )$$,
  'the friend can establish a direct conversation with the profile owner'
);
select is(
  (
    select avatar_giphy_id
    from public.get_direct_conversations()
    where other_user_id = '94000000-0000-4000-8000-000000000001'
  ),
  'avatar-GIF_123',
  'direct conversation rows expose the provider-linked avatar'
);
select is(
  (
    select cover_giphy_id
    from public.get_direct_conversations()
    where other_user_id = '94000000-0000-4000-8000-000000000001'
  ),
  'cover-GIF_456',
  'direct conversation rows expose the provider-linked cover'
);
select lives_ok(
  $$update public.profiles
    set avatar_giphy_id = 'friend-should-not-change-this'
    where id = '94000000-0000-4000-8000-000000000001'$$,
  'updating another visible profile is safely RLS-filtered'
);

reset role;
select is(
  (
    select avatar_giphy_id
    from public.profiles
    where id = '94000000-0000-4000-8000-000000000001'
  ),
  'avatar-GIF_123',
  'a friend did not modify the owner profile'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '94000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"94000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (
    select count(*)
    from public.profiles
    where id = '94000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'a cross-server outsider cannot read provider-linked profile data'
);
select is(
  (
    select count(*)
    from public.get_direct_conversations()
  ),
  0::bigint,
  'a non-participant cannot discover provider-linked profiles through DMs'
);

set local role anon;
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok(
  $$select public.get_direct_conversations()$$,
  '42501',
  'permission denied for function get_direct_conversations',
  'anonymous callers cannot execute the conversation RPC'
);

select * from finish();
rollback;
