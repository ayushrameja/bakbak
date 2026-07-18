begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

select is(
  (
    select public
    from storage.buckets
    where id = 'soundboard'
  ),
  false,
  'soundboard bucket is private'
);
select is(
  (
    select file_size_limit
    from storage.buckets
    where id = 'soundboard'
  ),
  1048576::bigint,
  'soundboard objects are limited to one MiB'
);
select is(
  (
    select allowed_mime_types
    from storage.buckets
    where id = 'soundboard'
  ),
  array['audio/mpeg', 'audio/wav', 'audio/x-wav']::text[],
  'soundboard bucket accepts hosted MPEG and normalized member WAV audio'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '30000000-0000-4000-8000-000000000001',
    'soundboard-member@example.invalid',
    '{"display_name":"Soundboard Member"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'soundboard-outsider@example.invalid',
    '{"display_name":"Soundboard Outsider"}'::jsonb
  );

insert into public.servers (id, name)
values ('30000000-0000-4000-8000-000000000100', 'Other soundboard server');

insert into public.memberships (server_id, user_id, role)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'member'
  ),
  (
    '30000000-0000-4000-8000-000000000100',
    '30000000-0000-4000-8000-000000000002',
    'member'
  );

insert into storage.objects (bucket_id, name)
values
  (
    'soundboard',
    '00000000-0000-4000-8000-000000000001/member-sound.mp3'
  ),
  (
    'soundboard',
    '30000000-0000-4000-8000-000000000100/outsider-sound.mp3'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from storage.objects where bucket_id = 'soundboard'),
  1::bigint,
  'member sees only soundboard objects for their server'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('soundboard', '00000000-0000-4000-8000-000000000001/nope.mp3')$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'members cannot upload soundboard objects'
);

set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from storage.objects where bucket_id = 'soundboard'),
  1::bigint,
  'member of another server cannot see Bakbak soundboard objects'
);

set local role anon;
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{"role":"anon"}';

select is(
  (select count(*) from storage.objects where bucket_id = 'soundboard'),
  0::bigint,
  'anonymous users cannot see soundboard objects'
);

select * from finish();
rollback;
