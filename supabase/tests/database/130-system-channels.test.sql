begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

select is(
  (
    select array_agg(
      category.name || ':' || category.position::text
      order by category.position, category.id
    )
    from public.channel_categories as category
    where category.id = '00000000-0000-4000-8000-000000000300'
  ),
  array['System:0']::text[],
  'System is a stable topmost category'
);
select is(
  (
    select array_agg(
      channel.purpose || ':' || channel.name || ':' || channel.kind
      order by channel.position, channel.id
    )
    from public.channels as channel
    where channel.category_id = '00000000-0000-4000-8000-000000000300'
  ),
  array[
    'system-releases:releases:text',
    'system-general:general:text'
  ]::text[],
  'System contains the stable releases and general text channels'
);
select throws_ok(
  $$insert into public.channels (
      server_id,
      category_id,
      name,
      kind,
      purpose,
      position
    ) values (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000300',
      'duplicate-releases',
      'text',
      'system-releases',
      30
    )$$,
  '23505',
  null,
  'each server can have only one channel for a System purpose'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'd1000000-0000-4000-8000-000000000001',
    'system-admin@example.invalid',
    '{"display_name":"System Admin"}'::jsonb
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'system-member@example.invalid',
    '{"display_name":"System Member"}'::jsonb
  ),
  (
    'd1000000-0000-4000-8000-000000000003',
    'system-outsider@example.invalid',
    '{"display_name":"System Outsider"}'::jsonb
  );

insert into public.servers (id, name)
values ('d1000000-0000-4000-8000-000000000100', 'System outsider server');

insert into public.channels (id, server_id, name, kind, position)
values (
  'd1000000-0000-4000-8000-000000000101',
  'd1000000-0000-4000-8000-000000000100',
  'outsider-chat',
  'text',
  10
);

insert into public.memberships (server_id, user_id, role, joined_at)
values (
  '00000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'admin',
  '2026-07-20 10:00:00+00'
);

select is(
  (
    select count(*)
    from public.messages
    where automation_key like 'member-joined:%'
  ),
  1::bigint,
  'the first membership creates one idempotent welcome'
);
select is(
  (
    select created_at
    from public.messages
    where automation_key like '%d1000000-0000-4000-8000-000000000001:%'
  ),
  '2026-07-20 10:00:00+00'::timestamptz,
  'a welcome preserves the membership join timestamp'
);
select is(
  (
    select system_event ->> 'member_name'
    from public.messages
    where automation_key like '%d1000000-0000-4000-8000-000000000001:%'
  ),
  'System Admin',
  'a welcome stores its typed member fallback'
);
select ok(
  (
    select message.message_kind = 'system' and message.author_id is null
    from public.messages as message
    where message.automation_key like
      '%d1000000-0000-4000-8000-000000000001:%'
  ),
  'automation messages have no member author'
);
select is(
  (
    select state.last_read_message_id
    from public.channel_read_states as state
    where state.user_id = 'd1000000-0000-4000-8000-000000000001'
      and state.channel_id = '00000000-0000-4000-8000-000000000120'
  ),
  (
    select message.id
    from public.messages as message
    where message.automation_key like
      '%d1000000-0000-4000-8000-000000000001:%'
  ),
  'the joining member is baselined through their own welcome'
);

insert into public.memberships (server_id, user_id, role, joined_at)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'member',
    '2026-07-21 11:00:00+00'
  ),
  (
    'd1000000-0000-4000-8000-000000000100',
    'd1000000-0000-4000-8000-000000000003',
    'member',
    '2026-07-21 12:00:00+00'
  );

select is(
  (
    select count(*)
    from public.messages
    where automation_key like 'member-joined:%'
  ),
  2::bigint,
  'a later Bakbak membership creates one additional welcome'
);
select is(
  (
    select state.last_read_message_id
    from public.channel_read_states as state
    where state.user_id = 'd1000000-0000-4000-8000-000000000001'
      and state.channel_id = '00000000-0000-4000-8000-000000000120'
  ),
  (
    select message.id
    from public.messages as message
    where message.automation_key like
      '%d1000000-0000-4000-8000-000000000001:%'
  ),
  'existing members are not baselined over a future join'
);
select is(
  (
    select state.last_read_message_id
    from public.channel_read_states as state
    where state.user_id = 'd1000000-0000-4000-8000-000000000002'
      and state.channel_id = '00000000-0000-4000-8000-000000000120'
  ),
  (
    select message.id
    from public.messages as message
    where message.automation_key like
      '%d1000000-0000-4000-8000-000000000002:%'
  ),
  'the later joining member starts with their own welcome read'
  );

insert into public.stickers (
  id,
  server_id,
  created_by,
  label,
  poster_path,
  width,
  height,
  byte_size
)
values (
  'd1000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'System test sticker',
  'system-tests/sticker.webp',
  64,
  64,
  512
);

set local role authenticated;
set local "request.jwt.claim.sub" =
  'd1000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" =
  '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';

select ok(
  (
    select activity.has_unread
    from public.get_channel_activity(
      '00000000-0000-4000-8000-000000000001'
    ) as activity
    where activity.channel_id =
      '00000000-0000-4000-8000-000000000120'
  ),
  'existing members see future joins as unread'
);
select throws_ok(
  $$insert into public.messages (channel_id, body) values (
      '00000000-0000-4000-8000-000000000120',
      'Nope'
    )$$,
  '42501',
  'system_channel_read_only',
  'members cannot insert directly into System channels'
);
select throws_ok(
  $$select public.send_message(
      '00000000-0000-4000-8000-000000000120',
      '[{"type":"text","text":"Still nope"}]'::jsonb
    )$$,
  '42501',
  'system_channel_read_only',
  'the compatibility send RPC rejects System channels'
);

set local "request.jwt.claim.sub" =
  'd1000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" =
  '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select public.send_message_v2(
      '00000000-0000-4000-8000-000000000119',
      '[{"type":"text","text":"Definitely nope"}]'::jsonb
    )$$,
  '42501',
  'system_channel_read_only',
  'the rich send RPC rejects System channels'
);

set local "request.jwt.claim.sub" =
  'd1000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" =
  '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.toggle_message_sticker_reaction(
      'channel',
      (
        select message.id
        from public.messages as message
        where message.automation_key like
          '%d1000000-0000-4000-8000-000000000002:%'
      ),
      'd1000000-0000-4000-8000-000000000501'
    )$$,
  '42501',
  'system_message_reactions_disabled',
  'the reaction RPC rejects System messages'
);
select throws_ok(
  $$select public.delete_own_message(
      'channel',
      (
        select message.id
        from public.messages as message
        where message.automation_key like
          '%d1000000-0000-4000-8000-000000000002:%'
      )
    )$$,
  '42501',
  'message_delete_forbidden',
  'admins cannot delete an automation message'
);
select throws_ok(
  $$select public.rename_channel(
      '00000000-0000-4000-8000-000000000119',
      'release-chat'
    )$$,
  '42501',
  'system_channel_managed_by_automation',
  'even admins cannot rename a System channel'
);
select throws_ok(
  $$select public.publish_system_release(
      2701,
      'v0.27.1',
      'Unauthorized release',
      'No',
      'https://github.com/ayushrameja/bakbak/releases/tag/v0.27.1',
      '2026-07-22 10:00:00+00',
      false
    )$$,
  '42501',
  'permission denied for function publish_system_release',
  'members cannot invoke release automation directly'
);

set local "request.jwt.claim.sub" =
  'd1000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" =
  '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (
    select count(*)
    from public.channels
    where purpose <> 'chat'
  ),
  0::bigint,
  'an outsider cannot see another server System channels'
);
select is(
  (
    select count(*)
    from public.messages
    where message_kind = 'system'
  ),
  0::bigint,
  'an outsider cannot see another server automation history'
);

reset role;
set local role service_role;

select throws_ok(
  $$select public.reserve_message_attachment(
      'd1000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000120',
      null,
      'image',
      'image/png',
      512,
      128,
      64,
      64,
      null,
      'system-tests/original.png',
      'system-tests/poster.webp'
    )$$,
  '42501',
  'system_channel_read_only',
  'even trusted media reservation cannot target a System channel'
);
select lives_ok(
  $$select public.publish_system_release(
      2701,
      'v0.27.1',
      'System channels',
      'The first announcement.',
      'https://github.com/ayushrameja/bakbak/releases/tag/v0.27.1',
      '2026-07-22 10:00:00+00',
      true
    )$$,
  'trusted automation can publish historical stable releases'
);
select lives_ok(
  $$select public.publish_system_release(
      2701,
      'v0.27.1',
      'System channels',
      'The first announcement.',
      'https://github.com/ayushrameja/bakbak/releases/tag/v0.27.1',
      '2026-07-22 10:00:00+00',
      true
    )$$,
  'retrying a historical release is idempotent'
);

reset role;

select is(
  (
    select count(*)
    from public.messages
    where automation_key = 'github-release:2701'
  ),
  1::bigint,
  'release retries keep a single automation message'
);
select is(
  (
    select created_at
    from public.messages
    where automation_key = 'github-release:2701'
  ),
  '2026-07-22 10:00:00+00'::timestamptz,
  'release history preserves the publication timestamp'
);
select is(
  (
    select count(*)
    from public.channel_read_states as state
    where state.channel_id = '00000000-0000-4000-8000-000000000119'
      and state.last_read_message_id = (
        select message.id
        from public.messages as message
        where message.automation_key = 'github-release:2701'
      )
  ),
  2::bigint,
  'historical releases baseline every existing Bakbak member'
);

set local role service_role;

select lives_ok(
  $$select public.publish_system_release(
      2702,
      'v0.27.2',
      'Fresh release',
      'A future announcement.',
      'https://github.com/ayushrameja/bakbak/releases/tag/v0.27.2',
      '2026-07-23 10:00:00+00',
      false
    )$$,
  'trusted automation can publish a future release'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" =
  'd1000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" =
  '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';

select ok(
  (
    select activity.has_unread
    from public.get_channel_activity(
      '00000000-0000-4000-8000-000000000001'
    ) as activity
    where activity.channel_id =
      '00000000-0000-4000-8000-000000000119'
  ),
  'future releases arrive through normal unread activity'
);
select is(
  (
    select system_event ->> 'type'
    from public.messages
    where automation_key = 'github-release:2702'
  ),
  'release_published',
  'release announcements store a typed System event'
);

select * from finish();
rollback;
