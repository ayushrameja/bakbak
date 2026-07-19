begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

select has_table(
  'public',
  'direct_conversations',
  'direct conversations table exists'
);
select has_table('public', 'direct_messages', 'direct messages table exists');
select has_table(
  'public',
  'direct_read_states',
  'private direct read states table exists'
);
select has_column(
  'public',
  'presence_heartbeats',
  'is_streaming',
  'presence records LIVE state'
);
select has_function(
  'public',
  'get_or_create_direct_conversation',
  array['uuid'],
  'canonical conversation RPC exists'
);
select has_function(
  'public',
  'send_direct_message',
  array['uuid', 'jsonb'],
  'direct message RPC exists'
);
select has_function(
  'public',
  'mark_direct_conversation_read',
  array['uuid', 'uuid'],
  'direct read RPC exists'
);
select has_function(
  'public',
  'get_direct_conversations',
  array[]::text[],
  'RLS-filtered conversation activity RPC exists'
);
select has_function(
  'public',
  'heartbeat_presence_v3',
  array['uuid', 'uuid', 'boolean'],
  'stream-aware heartbeat RPC exists'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.direct_conversations'::regclass),
  'direct conversations have RLS'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.direct_messages'::regclass),
  'direct messages have RLS'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.direct_read_states'::regclass),
  'direct read states have RLS'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '91000000-0000-4000-8000-000000000001',
    'signature-a@example.invalid',
    '{"display_name":"Signature A"}'::jsonb
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'signature-b@example.invalid',
    '{"display_name":"Signature B"}'::jsonb
  ),
  (
    '91000000-0000-4000-8000-000000000003',
    'signature-outsider@example.invalid',
    '{"display_name":"Signature Outsider"}'::jsonb
  );

insert into public.memberships (server_id, user_id, role)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'admin'
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000002',
    'member'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.get_or_create_direct_conversation(
    '91000000-0000-4000-8000-000000000002'
  )$$,
  'shared-server members can start a direct conversation'
);

reset role;
select ok(
  exists (
    select 1
    from public.direct_conversations
    where user_a_id = '91000000-0000-4000-8000-000000000001'
      and user_b_id = '91000000-0000-4000-8000-000000000002'
  ),
  'conversation pairs are stored canonically'
);
select is(
  (select count(*) from public.direct_read_states),
  2::bigint,
  'conversation creation initializes one private read state per participant'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$select public.get_or_create_direct_conversation(
    '91000000-0000-4000-8000-000000000001'
  )$$,
  'reverse creation resolves to the existing canonical pair'
);
reset role;
select is(
  (select count(*) from public.direct_conversations),
  1::bigint,
  'canonical uniqueness prevents duplicate conversations'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.get_or_create_direct_conversation(
    '91000000-0000-4000-8000-000000000001'
  )$$,
  '22023',
  'Choose another Bakbak member.',
  'self conversations are rejected'
);
select lives_ok(
  $$select public.send_direct_message(
    (select conversation_id from public.get_direct_conversations() limit 1),
    '[{"type":"text","text":"Private hello"}]'::jsonb
  )$$,
  'a participant can send a structured direct message'
);

reset role;
select is(
  (select author_id from public.direct_messages limit 1),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'direct message authors are derived from auth.uid()'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.send_direct_message(
    (select conversation_id from public.get_direct_conversations() limit 1),
    '[{"type":"mention","user_id":"91000000-0000-4000-8000-000000000003","fallback":"Outsider"}]'::jsonb
  )$$,
  '42501',
  'Mentions must name a conversation participant.',
  'direct messages cannot mention an outsider'
);

set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok(
  (select has_unread from public.get_direct_conversations() limit 1),
  'the recipient sees a new direct message as unread'
);
select lives_ok(
  $$select public.mark_direct_conversation_read(
    (select conversation_id from public.get_direct_conversations() limit 1),
    (select latest_message_id from public.get_direct_conversations() limit 1)
  )$$,
  'the recipient can advance only their direct read state'
);
select is(
  (select has_unread from public.get_direct_conversations() limit 1),
  false,
  'marking the direct conversation read clears unread activity'
);

set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*) from public.direct_conversations),
  0::bigint,
  'an outsider cannot discover direct conversations'
);
select is(
  (select count(*) from public.direct_messages),
  0::bigint,
  'an outsider cannot discover direct messages'
);
select throws_ok(
  $$select public.get_or_create_direct_conversation(
    '91000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'A shared Bakbak server is required.',
  'an outsider cannot start a conversation without a shared server'
);

set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select public.heartbeat_presence_v3(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000201',
    true
  )$$,
  'heartbeat v3 accepts LIVE in a valid voice room'
);
reset role;
select ok(
  (select is_streaming from public.presence_heartbeats
   where user_id = '91000000-0000-4000-8000-000000000001'),
  'heartbeat v3 records LIVE immediately'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select public.heartbeat_presence_v2(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000201'
  )$$,
  'legacy heartbeat v2 remains compatible'
);
reset role;
select is(
  (select is_streaming from public.presence_heartbeats
   where user_id = '91000000-0000-4000-8000-000000000001'),
  false,
  'legacy heartbeat v2 clears stale LIVE state'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.heartbeat_presence_v3(
    '00000000-0000-4000-8000-000000000001',
    null,
    true
  )$$,
  '22023',
  'Streaming requires an active voice channel.',
  'LIVE cannot be asserted without voice occupancy'
);
select throws_ok(
  $$select public.heartbeat_presence_v3(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    true
  )$$,
  '22023',
  'Voice channel is invalid.',
  'LIVE rejects a text channel'
);
select lives_ok(
  $$select public.heartbeat_presence(
    '00000000-0000-4000-8000-000000000001'
  )$$,
  'legacy online-only heartbeat remains compatible'
);
reset role;
select ok(
  (select not is_streaming and voice_channel_id is null
   from public.presence_heartbeats
   where user_id = '91000000-0000-4000-8000-000000000001'),
  'legacy online-only heartbeat clears voice and LIVE state'
);

delete from public.memberships
where user_id in (
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*) from public.get_direct_conversations()),
  1::bigint,
  'former members retain their established direct conversation'
);
select lives_ok(
  $$select public.send_direct_message(
    (select conversation_id from public.get_direct_conversations() limit 1),
    '[{"type":"text","text":"Still here"}]'::jsonb
  )$$,
  'former members can continue an established direct conversation'
);
select is(
  (select count(*) from public.profiles),
  2::bigint,
  'established DM participants retain profile visibility'
);
select throws_ok(
  $$select public.get_or_create_direct_conversation(
    '91000000-0000-4000-8000-000000000003'
  )$$,
  '42501',
  'A shared Bakbak server is required.',
  'a former member cannot start a new conversation without a shared server'
);

set local role anon;
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok(
  $$select count(*) from public.direct_messages$$,
  '42501',
  'permission denied for table direct_messages',
  'anonymous users cannot inspect direct messages'
);

select * from finish();
rollback;
