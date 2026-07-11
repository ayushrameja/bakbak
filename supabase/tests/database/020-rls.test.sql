begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'admin-rls-test@example.invalid',
    '{"display_name":"RLS Admin"}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'member-rls-test@example.invalid',
    '{"display_name":"RLS Member"}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'outsider-rls-test@example.invalid',
    '{"display_name":"RLS Outsider"}'::jsonb
  );

insert into public.servers (id, name)
values ('20000000-0000-4000-8000-000000000100', 'Other private server');

insert into public.channels (id, server_id, kind, name, position)
values (
  '20000000-0000-4000-8000-000000000101',
  '20000000-0000-4000-8000-000000000100',
  'text',
  'other-general',
  10
);

insert into public.memberships (server_id, user_id, role)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'admin'
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'member'
  ),
  (
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000000003',
    'member'
  );

insert into public.messages (channel_id, author_id, body)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000001',
    'Visible to Bakbak members'
  ),
  (
    '20000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000003',
    'Visible only on the other server'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select count(*) from public.servers), 1::bigint, 'member sees one server');
select is((select count(*) from public.channels), 4::bigint, 'member sees its four channels');
select is((select count(*) from public.messages), 1::bigint, 'member sees only its server messages');
select is((select count(*) from public.profiles), 2::bigint, 'member sees only co-member profiles');

select lives_ok(
  $$insert into public.messages (channel_id, body) values ('00000000-0000-4000-8000-000000000101', 'Allowed member message')$$,
  'member can insert into an accessible text channel'
);
select throws_ok(
  $$insert into public.messages (channel_id, body) values ('00000000-0000-4000-8000-000000000201', 'Not a voice message')$$,
  '42501',
  'new row violates row-level security policy for table "messages"',
  'member cannot insert a message into a voice channel'
);
select throws_ok(
  $$insert into public.memberships (server_id, user_id) values ('00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003')$$,
  '42501',
  'permission denied for table memberships',
  'member cannot add another membership directly'
);
select throws_ok(
  $$select count(*) from public.invite_codes$$,
  '42501',
  'permission denied for table invite_codes',
  'member cannot inspect invite hashes'
);

reset role;
select is(
  (
    select author_id
    from public.messages
    where body = 'Allowed member message'
  ),
  '20000000-0000-4000-8000-000000000002'::uuid,
  'message author is derived from auth.uid()'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is((select count(*) from public.servers), 1::bigint, 'outsider sees only its own server');
select is((select count(*) from public.channels), 1::bigint, 'outsider sees only its own channel');
select is((select count(*) from public.messages), 1::bigint, 'outsider sees only its own server message');
select is((select count(*) from public.profiles), 1::bigint, 'outsider cannot enumerate Bakbak profiles');
select throws_ok(
  $$insert into public.messages (channel_id, body) values ('00000000-0000-4000-8000-000000000101', 'Cross-server write')$$,
  '42501',
  'new row violates row-level security policy for table "messages"',
  'outsider cannot write into the Bakbak server'
);

set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$update public.profiles set display_name = 'Tampered' where id = '20000000-0000-4000-8000-000000000001'$$,
  'updating a hidden profile affects zero rows instead of bypassing RLS'
);

reset role;
select is(
  (
    select display_name
    from public.profiles
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  'RLS Admin',
  'another member profile was not modified'
);

select * from finish();
rollback;

