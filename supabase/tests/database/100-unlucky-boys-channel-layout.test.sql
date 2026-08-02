begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

select has_column('public', 'channels', 'archived_at', 'channels are archivable');
select has_column(
  'public',
  'channel_categories',
  'archived_at',
  'channel categories are archivable'
);
select is(
  (
    select count(*)
    from public.channel_categories
    where server_id = '00000000-0000-4000-8000-000000000001'
      and archived_at is null
  ),
  1::bigint,
  'the Bakbak server has exactly one active category'
);
select is(
  (
    select array_agg(name order by position, id)
    from public.channel_categories
    where server_id = '00000000-0000-4000-8000-000000000001'
      and archived_at is null
  ),
  array['Channels']::text[],
  'the sole active category is Channels'
);
select is(
  (
    select count(*)
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and archived_at is null
  ),
  7::bigint,
  'the Bakbak server has exactly seven active rooms'
);
select is(
  (
    select array_agg(kind::text || ':' || name order by position, id)
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and archived_at is null
  ),
  array[
    'text:Welcome',
    'text:Chat',
    'text:Volt',
    'text:Random Things',
    'voice:Game #1',
    'voice:Game #2',
    'voice:Game #3'
  ]::text[],
  'the active rooms use the accepted exact order and spelling'
);
select is(
  (
    select count(*)
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and archived_at is null
      and kind = 'text'
  ),
  4::bigint,
  'four active rooms are text rooms'
);
select is(
  (
    select count(*)
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and archived_at is null
      and kind = 'voice'
  ),
  3::bigint,
  'three active rooms are voice rooms'
);
select is(
  (
    select purpose::text
    from public.channels
    where id = '00000000-0000-4000-8000-000000000121'
  ),
  'system-general',
  'Welcome retains its automation compatibility purpose'
);
select is(
  (
    select count(*)
    from public.messages as message
    join public.channels as channel on channel.id = message.channel_id
    where channel.archived_at is null
  ),
  0::bigint,
  'fresh active rooms begin without mock or historical messages'
);
select is(
  (
    select count(*)
    from public.channel_categories
    where server_id = '00000000-0000-4000-8000-000000000001'
      and archived_at is not null
  ),
  8::bigint,
  'all eight former categories remain archived'
);
select is(
  (
    select count(*)
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and archived_at is not null
  ),
  26::bigint,
  'all twenty-six former rooms remain archived'
);
select ok(
  (
    select bool_and(archived_at is not null)
    from public.channels
    where id in (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
      '00000000-0000-4000-8000-000000000119',
      '00000000-0000-4000-8000-000000000120'
    )
  ),
  'stable former room identities were archived rather than deleted'
);
select ok(
  exists (
    select 1
    from public.channels
    where purpose = 'system-releases'
      and archived_at is not null
  ),
  'the releases room remains stored but archived'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'channel_categories'
  ),
  'channel categories remain published for Realtime reconciliation'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '91000000-0000-4000-8000-000000000001',
    'layout-member@example.invalid',
    '{"display_name":"Layout Member"}'::jsonb
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'layout-outsider@example.invalid',
    '{"display_name":"Layout Outsider"}'::jsonb
  );

insert into public.servers (id, name)
values ('91000000-0000-4000-8000-000000000100', 'Other layout server');
insert into public.channel_categories (id, server_id, name, position)
values (
  '91000000-0000-4000-8000-000000000301',
  '91000000-0000-4000-8000-000000000100',
  'Channels',
  10
);
insert into public.memberships (server_id, user_id, role)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'member'
  ),
  (
    '91000000-0000-4000-8000-000000000100',
    '91000000-0000-4000-8000-000000000002',
    'member'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.channel_categories), 1::bigint, 'a member sees one active category');
select is((select count(*) from public.channels), 7::bigint, 'a member sees seven active rooms');
select is(
  (select count(*) from public.channels where archived_at is not null),
  0::bigint,
  'a member cannot read archived room metadata'
);

set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*) from public.channel_categories), 1::bigint, 'an outsider sees only its own category');
select is((select count(*) from public.channels), 0::bigint, 'an outsider sees no Bakbak rooms');

select * from finish();
rollback;
