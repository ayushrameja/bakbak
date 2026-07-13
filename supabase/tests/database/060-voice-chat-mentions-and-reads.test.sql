begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

select has_column(
  'public',
  'messages',
  'content',
  'messages expose structured content'
);
select has_table(
  'public',
  'channel_read_states',
  'channel read states table exists'
);
select has_function(
  'public',
  'send_message',
  array['uuid', 'jsonb'],
  'structured message RPC exists'
);
select has_function(
  'public',
  'mark_channel_read',
  array['uuid', 'uuid'],
  'read marker RPC exists'
);
select has_function(
  'public',
  'get_channel_activity',
  array['uuid'],
  'channel activity RPC exists'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '60000000-0000-4000-8000-000000000001',
    'voice-chat-admin@example.invalid',
    '{"display_name":"Mira Admin"}'::jsonb
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    'voice-chat-member@example.invalid',
    '{"display_name":"Ayu Member"}'::jsonb
  ),
  (
    '60000000-0000-4000-8000-000000000003',
    'voice-chat-outsider@example.invalid',
    '{"display_name":"Outsider"}'::jsonb
  );

insert into public.servers (id, name)
values ('60000000-0000-4000-8000-000000000100', 'Other server');
insert into public.channels (id, server_id, kind, name, position)
values (
  '60000000-0000-4000-8000-000000000101',
  '60000000-0000-4000-8000-000000000100',
  'text',
  'outsider-room',
  10
);

insert into public.memberships (server_id, user_id, role)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    'admin'
  ),
  (
    '60000000-0000-4000-8000-000000000100',
    '60000000-0000-4000-8000-000000000003',
    'member'
  );

insert into public.messages (id, channel_id, author_id, body, created_at)
values (
  '60000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000201',
  '60000000-0000-4000-8000-000000000001',
  'Historical voice message',
  '2026-07-13 10:00:00+00'
);

insert into public.memberships (server_id, user_id, role)
values (
  '00000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000002',
  'member'
);

select is(
  (
    select last_read_message_id
    from public.channel_read_states
    where user_id = '60000000-0000-4000-8000-000000000002'
      and channel_id = '00000000-0000-4000-8000-000000000201'
  ),
  '60000000-0000-4000-8000-000000000201'::uuid,
  'new memberships baseline existing voice history as read'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok(
  $$insert into public.messages (channel_id, body) values ('00000000-0000-4000-8000-000000000201', 'Direct voice fallback')$$,
  'members can send legacy body-only messages to voice channels'
);

select lives_ok(
  $$select public.send_message(
    '00000000-0000-4000-8000-000000000201',
    '[{"type":"text","text":"Hello "},{"type":"mention","user_id":"60000000-0000-4000-8000-000000000001","fallback":"Old name"}]'::jsonb
  )$$,
  'members can send structured voice messages with a same-server mention'
);

reset role;
select is(
  (
    select body
    from public.messages
    where content is not null
      and author_id = '60000000-0000-4000-8000-000000000002'
    order by created_at desc, id desc
    limit 1
  ),
  'Hello @Mira Admin',
  'the server generates fallback body text from the current profile name'
);
select is(
  (
    select content #>> '{1,fallback}'
    from public.messages
    where content is not null
      and author_id = '60000000-0000-4000-8000-000000000002'
    order by created_at desc, id desc
    limit 1
  ),
  'Mira Admin',
  'the server normalizes mention fallback names'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.send_message('00000000-0000-4000-8000-000000000201', '{"type":"text"}'::jsonb)$$,
  '22023',
  'Message content must contain between 1 and 100 segments.',
  'structured content must be an array'
);
select throws_ok(
  $$select public.send_message(
    '00000000-0000-4000-8000-000000000201',
    '[{"type":"mention","user_id":"60000000-0000-4000-8000-000000000001"}]'::jsonb
  )$$,
  '22023',
  'Mention segments may contain only type, user_id, and fallback.',
  'mention segments require a string fallback'
);
select throws_ok(
  $$select public.send_message(
    '00000000-0000-4000-8000-000000000201',
    jsonb_build_array(jsonb_build_object('type', 'text', 'text', repeat('x', 4001)))
  )$$,
  '22023',
  'Message body must be between 1 and 4000 characters.',
  'structured messages reject oversized fallback bodies'
);
select throws_ok(
  $$select public.send_message(
    '00000000-0000-4000-8000-000000000201',
    (
      select jsonb_agg(
        jsonb_build_object(
          'type', 'mention',
          'user_id', '60000000-0000-4000-8000-000000000001',
          'fallback', 'Mira Admin'
        )
      )
      from generate_series(1, 26)
    )
  )$$,
  '22023',
  'A message may contain at most 25 mentions.',
  'structured messages reject excessive mentions'
);
select throws_ok(
  $$select public.send_message(
    '00000000-0000-4000-8000-000000000201',
    '[{"type":"mention","user_id":"60000000-0000-4000-8000-000000000003","fallback":"Outsider"}]'::jsonb
  )$$,
  '42501',
  'Mentioned users must belong to this server.',
  'members cannot mention users outside the server'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select public.send_message(
    '00000000-0000-4000-8000-000000000201',
    '[{"type":"text","text":"Fresh voice gossip"}]'::jsonb
  )$$,
  'another member can publish a fresh voice message'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok(
  (
    select has_unread
    from public.get_channel_activity('00000000-0000-4000-8000-000000000001')
    where channel_id = '00000000-0000-4000-8000-000000000201'
  ),
  'a newer voice message from another member is unread'
);
select lives_ok(
  $$select public.mark_channel_read(
    '00000000-0000-4000-8000-000000000201',
    (
      select latest_message_id
      from public.get_channel_activity('00000000-0000-4000-8000-000000000001')
      where channel_id = '00000000-0000-4000-8000-000000000201'
    )
  )$$,
  'members can advance their own read marker'
);
select is(
  (
    select has_unread
    from public.get_channel_activity('00000000-0000-4000-8000-000000000001')
    where channel_id = '00000000-0000-4000-8000-000000000201'
  ),
  false,
  'advancing the marker clears unread activity'
);
select lives_ok(
  $$select public.mark_channel_read(
    '00000000-0000-4000-8000-000000000201',
    '60000000-0000-4000-8000-000000000201'
  )$$,
  'an older read request is accepted idempotently'
);
select isnt(
  (
    select last_read_message_id
    from public.channel_read_states
    where channel_id = '00000000-0000-4000-8000-000000000201'
  ),
  '60000000-0000-4000-8000-000000000201'::uuid,
  'read markers never regress'
);
select is(
  (select count(*) from public.channel_read_states),
  1::bigint,
  'members can select only their own read states'
);
select throws_ok(
  $$insert into public.channel_read_states (channel_id, last_read_message_id)
    values ('00000000-0000-4000-8000-000000000201', '60000000-0000-4000-8000-000000000201')$$,
  '42501',
  'permission denied for table channel_read_states',
  'clients cannot forge read states directly'
);

set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select public.get_channel_activity('00000000-0000-4000-8000-000000000001')$$,
  '42501',
  'Server membership required.',
  'outsiders cannot inspect Bakbak channel activity'
);
select is(
  (select count(*) from public.messages),
  0::bigint,
  'outsiders cannot read Bakbak voice messages'
);
select throws_ok(
  $$select public.send_message(
    '00000000-0000-4000-8000-000000000201',
    '[{"type":"text","text":"Cross-server"}]'::jsonb
  )$$,
  '42501',
  'Channel membership required.',
  'outsiders cannot send cross-server voice messages'
);

select * from finish();
rollback;
