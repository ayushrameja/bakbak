begin;

create extension if not exists pgtap with schema extensions;
select plan(47);

select has_table('public', 'message_attachments', 'message attachments exist');
select has_table('public', 'stickers', 'server stickers exist');
select has_table(
  'public',
  'message_sticker_reactions',
  'sticker reactions exist'
);
select has_column('public', 'messages', 'reply_to_id', 'channel replies exist');
select has_column(
  'public',
  'direct_messages',
  'reply_to_id',
  'direct replies exist'
);
select has_column('public', 'messages', 'deleted_at', 'soft deletion exists');
select has_function(
  'public',
  'send_message_v2',
  array['uuid', 'jsonb', 'uuid', 'boolean', 'uuid[]', 'jsonb'],
  'channel v2 send RPC exists'
);
select has_function(
  'public',
  'send_direct_message_v2',
  array['uuid', 'jsonb', 'uuid', 'boolean', 'uuid[]', 'jsonb'],
  'direct v2 send RPC exists'
);
select has_function(
  'public',
  'toggle_message_sticker_reaction',
  array['text', 'uuid', 'uuid'],
  'trusted reaction toggle exists'
);
select has_function(
  'public',
  'delete_own_message',
  array['text', 'uuid'],
  'trusted deletion RPC exists'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.message_attachments'::regclass),
  'attachments use RLS'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.stickers'::regclass),
  'stickers use RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.stickers', 'INSERT'),
  'renderer cannot mutate the sticker catalog'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'stickers'
  ),
  'stickers publish through Realtime'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_sticker_reactions'
  ),
  'reactions publish through Realtime'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '92000000-0000-4000-8000-000000000001',
    'rich-admin@example.invalid',
    '{"display_name":"Rich Admin"}'::jsonb
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    'rich-member@example.invalid',
    '{"display_name":"Rich Member"}'::jsonb
  ),
  (
    '92000000-0000-4000-8000-000000000003',
    'rich-outsider@example.invalid',
    '{"display_name":"Rich Outsider"}'::jsonb
  );

insert into public.memberships (server_id, user_id, role)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'admin'
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002',
    'member'
  );

select lives_ok(
  $$select public.publish_message_sticker(
    '00000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002',
    'Wave',
    'server/wave.webp',
    null,
    128,
    128,
    512
  )$$,
  'trusted publication accepts a member sticker'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '92000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" =
  '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok(
  $$select public.send_message_v2(
    '00000000-0000-4000-8000-000000000101',
    '[{"type":"text","text":"Parent"}]'::jsonb
  )$$,
  'a member can send v2 channel text'
);
select lives_ok(
  $$select public.send_message_v2(
    '00000000-0000-4000-8000-000000000101',
    '[]'::jsonb,
    null,
    true,
    '{}'::uuid[],
    jsonb_build_object(
      'kind', 'sticker',
      'sticker_id', (
        select id::text from public.stickers where label = 'Wave'
      )
    )
  )$$,
  'a Bakbak sticker can be sent standalone'
);
select lives_ok(
  $$select public.send_message_v2(
    '00000000-0000-4000-8000-000000000101',
    '[{"type":"text","text":"Channel GIF caption"}]'::jsonb,
    null,
    true,
    '{}'::uuid[],
    '{
      "kind":"giphy",
      "asset_id":"channel-gif",
      "asset_kind":"gif",
      "title":"Celebration",
      "alt_text":"Friends celebrating",
      "width":480,
      "height":270
    }'::jsonb
  )$$,
  'a GIPHY asset may accompany channel text'
);
select is(
  (
    select body from public.messages
    where presentation ->> 'asset_id' = 'channel-gif'
  ),
  'Channel GIF caption',
  'channel GIPHY captions remain the compatibility body'
);
select throws_ok(
  $$select public.send_message_v2(
    '00000000-0000-4000-8000-000000000101',
    '[]'::jsonb
  )$$,
  '22023',
  'message_content_required',
  'empty rich messages are rejected'
);
select throws_ok(
  $$select public.send_message_v2(
    '00000000-0000-4000-8000-000000000103',
    '[{"type":"text","text":"reply"}]'::jsonb,
    (
      select id from public.messages
      where channel_id = '00000000-0000-4000-8000-000000000101'
        and body = 'Parent'
    )
  )$$,
  '22023',
  'reply_target_unavailable',
  'cross-channel replies are rejected'
);
select lives_ok(
  $$select public.send_message_v2(
    '00000000-0000-4000-8000-000000000101',
    '[{"type":"text","text":"Self reply"}]'::jsonb,
    (
      select id from public.messages
      where channel_id = '00000000-0000-4000-8000-000000000101'
        and body = 'Parent'
    ),
    true
  )$$,
  'same-channel replies are accepted'
);
select is(
  (
    select reply_notifies_author from public.messages
    where body = 'Self reply'
  ),
  false,
  'self replies force notification off'
);

reset role;
select lives_ok(
  $$select public.reserve_message_attachment(
    '92000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000101',
    null,
    'image',
    'image/png',
    1024,
    256,
    800,
    600,
    null,
    'rich/original.png',
    'rich/poster.webp'
  )$$,
  'trusted media reservation enforces target ownership'
);
insert into storage.objects (bucket_id, name)
values
  ('message-media', 'rich/original.png'),
  ('message-media', 'rich/poster.webp');

set local role authenticated;
set local "request.jwt.claim.sub" = '92000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" =
  '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$select public.send_message_v2(
    '00000000-0000-4000-8000-000000000101',
    '[]'::jsonb,
    null,
    true,
    array[(
      select id from public.message_attachments
      where object_path = 'rich/original.png'
    )],
    null
  )$$,
  'uploaded attachments finalize atomically'
);
select is(
  (
    select count(*) from public.message_attachments
    where object_path = 'rich/original.png'
      and message_id is not null
      and published_at is not null
  ),
  1::bigint,
  'finalization links the reservation to one message'
);

select lives_ok(
  $$select public.toggle_message_sticker_reaction(
    'channel',
    (
      select id from public.messages
      where channel_id = '00000000-0000-4000-8000-000000000101'
        and body = 'Parent'
    ),
    (select id from public.stickers where label = 'Wave')
  )$$,
  'a member can add a server-sticker reaction'
);
select is(
  (
    select count(*) from public.message_sticker_reactions
    where user_id = '92000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'reaction uniqueness stores one toggle row'
);
select lives_ok(
  $$select public.toggle_message_sticker_reaction(
    'channel',
    (
      select id from public.messages
      where channel_id = '00000000-0000-4000-8000-000000000101'
        and body = 'Parent'
    ),
    (select id from public.stickers where label = 'Wave')
  )$$,
  'toggling the same sticker removes the reaction'
);
select is(
  (
    select count(*) from public.message_sticker_reactions
    where user_id = '92000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'the second reaction toggle deletes its row'
);

reset role;
insert into public.stickers (
  server_id,
  created_by,
  label,
  poster_path,
  width,
  height,
  byte_size
)
select
  '00000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000002',
  'Cap ' || value,
  'server/cap-' || value || '.webp',
  64,
  64,
  64
from generate_series(1, 6) as value;

set local role authenticated;
set local "request.jwt.claim.sub" = '92000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" =
  '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$select public.toggle_message_sticker_reaction(
    'channel',
    (
      select id from public.messages
      where channel_id = '00000000-0000-4000-8000-000000000101'
        and body = 'Parent'
    ),
    id
  )
  from public.stickers
  where label like 'Cap %'
  order by label
  limit 5$$,
  'one reactor may use five distinct stickers on a message'
);
select throws_ok(
  $$select public.toggle_message_sticker_reaction(
    'channel',
    (
      select id from public.messages
      where channel_id = '00000000-0000-4000-8000-000000000101'
        and body = 'Parent'
    ),
    (select id from public.stickers where label = 'Cap 6')
  )$$,
  '23514',
  'user_reaction_limit',
  'a sixth distinct sticker reaction is rejected'
);
select is(
  (
    select count(*) from public.message_sticker_reactions
    where user_id = '92000000-0000-4000-8000-000000000002'
  ),
  5::bigint,
  'the user reaction cap remains intact after rejection'
);

select lives_ok(
  $$select public.get_or_create_direct_conversation(
    '92000000-0000-4000-8000-000000000001'
  )$$,
  'members can establish a rich DM target'
);
select lives_ok(
  $$select public.send_direct_message_v2(
    (select conversation_id from public.get_direct_conversations() limit 1),
    '[{"type":"text","text":"Direct parent"}]'::jsonb
  )$$,
  'v2 direct messages preserve the DM retention contract'
);
select lives_ok(
  $$select public.send_direct_message_v2(
    (select conversation_id from public.get_direct_conversations() limit 1),
    '[{"type":"text","text":"Direct GIF caption"}]'::jsonb,
    null,
    true,
    '{}'::uuid[],
    '{
      "kind":"giphy",
      "asset_id":"direct-gif",
      "asset_kind":"gif",
      "title":"Hello",
      "alt_text":"A friendly wave",
      "width":320,
      "height":240
    }'::jsonb
  )$$,
  'a GIPHY asset may accompany direct-message text'
);
select is(
  (
    select body from public.direct_messages
    where presentation ->> 'asset_id' = 'direct-gif'
  ),
  'Direct GIF caption',
  'direct GIPHY captions remain the compatibility body'
);
select throws_ok(
  $$select public.send_direct_message_v2(
    (select conversation_id from public.get_direct_conversations() limit 1),
    '[{"type":"text","text":"Wrong parent"}]'::jsonb,
    (
      select id from public.messages
      where channel_id = '00000000-0000-4000-8000-000000000101'
      limit 1
    )
  )$$,
  '22023',
  'reply_target_unavailable',
  'cross-scope reply IDs cannot target channel messages'
);

select lives_ok(
  $$select public.delete_own_message(
    'channel',
    (
      select id from public.messages
      where channel_id = '00000000-0000-4000-8000-000000000101'
        and body = '[Image]'
      limit 1
    )
  )$$,
  'authors can soft-delete their own uploaded message'
);
select ok(
  exists (
    select 1 from public.messages
    where body = '[Message deleted]' and deleted_at is not null
  ),
  'deletion preserves a scrubbed tombstone row'
);
select is(
  (
    select latest_message_id
    from public.get_channel_activity(
      '00000000-0000-4000-8000-000000000001'
    )
    where channel_id = '00000000-0000-4000-8000-000000000101'
  ),
  (
    select id from public.messages
    where channel_id = '00000000-0000-4000-8000-000000000101'
      and deleted_at is null
    order by created_at desc, id desc
    limit 1
  ),
  'deleted messages are excluded from channel latest activity'
);

reset role;
select is(
  (
    select count(*) from public.archive_message_sticker(
      (select id from public.stickers where label = 'Wave'),
      '92000000-0000-4000-8000-000000000003'
    )
  ),
  0::bigint,
  'a non-owner non-admin cannot archive a sticker'
);
select lives_ok(
  $$select public.archive_message_sticker(
    (select id from public.stickers where label = 'Wave'),
    '92000000-0000-4000-8000-000000000001'
  )$$,
  'a server admin can archive a member sticker'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '92000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" =
  '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*) from public.stickers where label = 'Wave'),
  1::bigint,
  'a referenced archived sticker remains readable to history'
);

set local "request.jwt.claim.sub" = '92000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" =
  '{"sub":"92000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*) from public.stickers),
  0::bigint,
  'an outsider cannot enumerate server stickers'
);
select is(
  (select count(*) from public.message_attachments),
  0::bigint,
  'an outsider cannot enumerate message attachments'
);

select * from finish();
rollback;
