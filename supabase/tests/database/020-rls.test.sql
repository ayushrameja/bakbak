begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

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
select is(
  (select count(*) from public.channels),
  26::bigint,
  'member sees the mirrored and System channels'
);
select is(
  (select count(*) from public.messages),
  3::bigint,
  'member sees member and automated messages only from its server'
);
select is((select count(*) from public.profiles), 2::bigint, 'member sees only co-member profiles');

select lives_ok(
  $$insert into public.messages (channel_id, body) values ('00000000-0000-4000-8000-000000000101', 'Allowed member message')$$,
  'member can insert into an accessible text channel'
);
select lives_ok(
  $$insert into public.messages (channel_id, body) values ('00000000-0000-4000-8000-000000000201', 'Not a voice message')$$,
  'member can insert a message into an accessible voice channel'
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
select lives_ok(
  $$select public.heartbeat_presence('00000000-0000-4000-8000-000000000001')$$,
  'member can publish a heartbeat for its server'
);
select lives_ok(
  $$select public.heartbeat_presence_v2('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201')$$,
  'member can publish voice occupancy for an accessible voice channel'
);
select throws_ok(
  $$select public.heartbeat_presence_v2('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101')$$,
  '22023',
  'Voice channel is invalid.',
  'member cannot publish a text channel as voice occupancy'
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
select is(
  (
    select user_id
    from public.presence_heartbeats
    where server_id = '00000000-0000-4000-8000-000000000001'
  ),
  '20000000-0000-4000-8000-000000000002'::uuid,
  'presence heartbeat user is derived from auth.uid()'
);
select is(
  (
    select voice_channel_id
    from public.presence_heartbeats
    where server_id = '00000000-0000-4000-8000-000000000001'
  ),
  '00000000-0000-4000-8000-000000000201'::uuid,
  'voice occupancy records the validated voice channel'
);
select ok(
  (
    select voice_joined_at is not null
    from public.presence_heartbeats
    where server_id = '00000000-0000-4000-8000-000000000001'
  ),
  'voice occupancy uses a server-assigned join timestamp'
);

update public.presence_heartbeats
set voice_joined_at = '2026-07-11 12:00:00+00'
where server_id = '00000000-0000-4000-8000-000000000001';

set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$select public.heartbeat_presence_v2('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201')$$,
  'repeated heartbeat for the same voice channel succeeds'
);

reset role;
select is(
  (
    select voice_joined_at
    from public.presence_heartbeats
    where server_id = '00000000-0000-4000-8000-000000000001'
  ),
  '2026-07-11 12:00:00+00'::timestamptz,
  'same-channel heartbeats preserve the original join timestamp'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$select public.heartbeat_presence_v2('00000000-0000-4000-8000-000000000001', null)$$,
  'member can clear voice occupancy while remaining online'
);

reset role;
select ok(
  (
    select voice_channel_id is null and voice_joined_at is null
    from public.presence_heartbeats
    where server_id = '00000000-0000-4000-8000-000000000001'
  ),
  'clearing voice occupancy clears both voice fields'
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
select is(
  (select count(*) from public.presence_heartbeats),
  0::bigint,
  'outsider cannot see another server presence heartbeat'
);
select throws_ok(
  $$select public.heartbeat_presence('00000000-0000-4000-8000-000000000001')$$,
  '42501',
  'Server membership required.',
  'outsider cannot publish a heartbeat for the Bakbak server'
);
select throws_ok(
  $$select public.heartbeat_presence_v2('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201')$$,
  '42501',
  'Server membership required.',
  'outsider cannot publish voice occupancy for the Bakbak server'
);
select lives_ok(
  $$select public.heartbeat_presence('20000000-0000-4000-8000-000000000100')$$,
  'outsider can publish a heartbeat for its own server'
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
