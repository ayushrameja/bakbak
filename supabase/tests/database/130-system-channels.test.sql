begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'd1000000-0000-4000-8000-000000000001',
    'channels-admin@example.invalid',
    '{"display_name":"Channels Admin"}'::jsonb
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'channels-member@example.invalid',
    '{"display_name":"Channels Member"}'::jsonb
  ),
  (
    'd1000000-0000-4000-8000-000000000003',
    'channels-outsider@example.invalid',
    '{"display_name":"Channels Outsider"}'::jsonb
  );

insert into public.memberships (server_id, user_id, role, joined_at)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'admin',
    '2026-08-01 10:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'member',
    '2026-08-01 11:00:00+00'
  );

select is(
  (
    select count(*)
    from public.messages
    where channel_id = '00000000-0000-4000-8000-000000000121'
      and automation_key like 'member-joined:%'
  ),
  2::bigint,
  'future memberships create exactly one event each in active Welcome'
);
select is(
  (
    select count(*)
    from public.messages
    where channel_id <> '00000000-0000-4000-8000-000000000121'
      and automation_key like 'member-joined:%'
  ),
  0::bigint,
  'membership automation never backfills an archived welcome room'
);
select is(
  (
    select count(*)
    from public.channel_read_states
    where user_id = 'd1000000-0000-4000-8000-000000000002'
      and channel_id = '00000000-0000-4000-8000-000000000121'
  ),
  1::bigint,
  'the joining member is baselined through their active Welcome event'
);
select ok(
  to_regprocedure(
    'public.publish_system_release(bigint,text,text,text,text,timestamp with time zone,boolean)'
  ) is null,
  'release announcement publication is retired'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'd1000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.create_channel(
    '00000000-0000-4000-8000-000000000001', 'text', 'Planning'
  )$$,
  'an admin can append an ordinary text room'
);
select is(
  (
    select category_id
    from public.channels
    where name = 'Planning' and archived_at is null
  ),
  '00000000-0000-4000-8000-000000000401'::uuid,
  'new text rooms use the sole active Channels category'
);
select is(
  (select position from public.channels where name = 'Planning' and archived_at is null),
  500,
  'new text rooms append after Random Things'
);
select lives_ok(
  $$select public.create_channel(
    '00000000-0000-4000-8000-000000000001', 'voice', 'Game #4'
  )$$,
  'an admin can append an ordinary voice room'
);
select is(
  (select position from public.channels where name = 'Game #4' and archived_at is null),
  1400,
  'new voice rooms append after Game #3'
);
select lives_ok(
  $$select public.rename_channel(
    (select id from public.channels where name = 'Planning' and archived_at is null),
    'Plans'
  )$$,
  'an admin can rename an ordinary active room'
);
select set_config(
  'test.archived_message_id',
  (
    select id::text
    from public.send_message_v2(
      (select id from public.channels where name = 'Plans' and archived_at is null),
      '[{"type":"text","text":"Keep this history"}]'::jsonb
    )
  ),
  true
);
select throws_ok(
  $$select public.rename_channel(
    '00000000-0000-4000-8000-000000000121', 'Not Welcome'
  )$$,
  '42501',
  'Channel unavailable or admin permission required.',
  'Welcome cannot be renamed'
);

set local "request.jwt.claim.sub" = 'd1000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.create_channel(
    '00000000-0000-4000-8000-000000000001', 'text', 'Nope'
  )$$,
  '42501',
  'Server admin permission required.',
  'ordinary members cannot create rooms'
);
select throws_ok(
  $$select public.rename_channel(
    (select id from public.channels where name = 'Plans'), 'Nope'
  )$$,
  '42501',
  'Channel unavailable or admin permission required.',
  'ordinary members cannot rename rooms'
);

reset role;
set local role service_role;
select set_config(
  'test.archived_channel_id',
  (select id::text from public.channels where name = 'Plans' and archived_at is null),
  true
);
update public.channels set archived_at = now() where name = 'Plans' and archived_at is null;
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'd1000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*) from public.channels where name = 'Plans'),
  0::bigint,
  'an archived room disappears from normal reads'
);
select throws_ok(
  $$select public.send_message_v2(
    current_setting('test.archived_channel_id')::uuid,
    '[{"type":"text","text":"No zombies"}]'::jsonb
  )$$,
  '42501',
  'channel_unavailable_or_read_only',
  'archived rooms reject messages even when a stale client retains the ID'
);

set local "request.jwt.claim.sub" = 'd1000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select * from public.delete_own_message(
    'channel', current_setting('test.archived_message_id')::uuid
  )$$,
  '42501',
  'channel_unavailable_or_read_only',
  'archived history cannot be edited through stale message actions'
);
select lives_ok(
  $$select public.create_channel(
    '00000000-0000-4000-8000-000000000001', 'text', 'Plans'
  )$$,
  'active-only uniqueness permits reusing an archived room name'
);
select is(
  (
    select count(*)
    from public.get_channel_activity('00000000-0000-4000-8000-000000000001')
  ),
  9::bigint,
  'unread activity returns active rows only'
);

reset role;
set local role service_role;
select is(
  (select count(*) from public.channels where name = 'Plans'),
  2::bigint,
  'operators can still recover both archived and active room generations'
);

select * from finish();
rollback;
