begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

select has_table(
  'public',
  'channel_categories',
  'ordered channel categories exist'
);
select has_column(
  'public',
  'channels',
  'category_id',
  'channels can belong to a category'
);
select ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.channel_categories'::regclass
  ),
  'channel categories have RLS enabled'
);
select ok(
  has_table_privilege(
    'authenticated',
    'public.channel_categories',
    'SELECT'
  ),
  'authenticated users can select RLS-filtered channel categories'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.channel_categories',
    'INSERT'
  )
    and not has_table_privilege(
      'authenticated',
      'public.channel_categories',
      'UPDATE'
    )
    and not has_table_privilege(
      'authenticated',
      'public.channel_categories',
      'DELETE'
    ),
  'authenticated users cannot mutate channel categories directly'
);

select is(
  (
    select count(*)
    from public.channel_categories
    where server_id = '00000000-0000-4000-8000-000000000001'
  ),
  8::bigint,
  'the Bakbak server has System plus all seven mirrored categories'
);
select is(
  (
    select array_agg(name order by position, id)
    from public.channel_categories
    where server_id = '00000000-0000-4000-8000-000000000001'
  ),
  array[
    'System',
    'Welcome',
    'Gamez',
    'Only Study',
    'Content Creators',
    'Photos',
    'Software',
    'AFK'
  ]::text[],
  'category order matches the visible Discord sidebar'
);
select is(
  (
    select count(*)
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
  ),
  26::bigint,
  'the Bakbak server has System plus all 24 mirrored rooms'
);
select is(
  (
    select count(*)
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and kind = 'text'
  ),
  20::bigint,
  'the layout has 18 mirrored and two System text channels'
);
select is(
  (
    select count(*)
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and kind = 'voice'
  ),
  6::bigint,
  'the mirrored layout has six voice channels'
);
select is(
  (
    select count(*)
    from public.channels
    where server_id = '00000000-0000-4000-8000-000000000001'
      and category_id is null
  ),
  0::bigint,
  'every mirrored room belongs to its visible category'
);

select is(
  (
    select array_agg(channel.kind::text || ':' || channel.name order by channel.position, channel.id)
    from public.channels as channel
    inner join public.channel_categories as category
      on category.id = channel.category_id
    where category.name = 'Welcome'
  ),
  array[
    'text:spawn',
    'text:law',
    'text:ladder',
    'text:rant',
    'text:gaane'
  ]::text[],
  'Welcome room order matches Discord'
);
select is(
  (
    select array_agg(channel.kind::text || ':' || channel.name order by channel.position, channel.id)
    from public.channels as channel
    inner join public.channel_categories as category
      on category.id = channel.category_id
    where category.name = 'Gamez'
  ),
  array[
    'text:clips',
    'text:portals',
    'text:vault',
    'voice:Queue',
    'voice:Crash',
    'voice:Songs Only'
  ]::text[],
  'Gamez room order matches Discord'
);
select is(
  (
    select array_agg(channel.kind::text || ':' || channel.name order by channel.position, channel.id)
    from public.channels as channel
    inner join public.channel_categories as category
      on category.id = channel.category_id
    where category.name = 'Only Study'
  ),
  array[
    'text:why',
    'text:how',
    'text:notes',
    'text:deadline',
    'voice:Focus',
    'voice:Loop'
  ]::text[],
  'Only Study room order matches Discord'
);
select is(
  (
    select array_agg(channel.kind::text || ':' || channel.name order by channel.position, channel.id)
    from public.channels as channel
    inner join public.channel_categories as category
      on category.id = channel.category_id
    where category.name = 'Content Creators'
  ),
  array['text:old-edits', 'text:ink', 'text:preparation']::text[],
  'Content Creators room order matches Discord'
);
select is(
  (
    select array_agg(channel.kind::text || ':' || channel.name order by channel.position, channel.id)
    from public.channels as channel
    inner join public.channel_categories as category
      on category.id = channel.category_id
    where category.name = 'Photos'
  ),
  array['text:meme', 'text:wallpapers']::text[],
  'Photos room order matches Discord'
);
select is(
  (
    select array_agg(channel.kind::text || ':' || channel.name order by channel.position, channel.id)
    from public.channels as channel
    inner join public.channel_categories as category
      on category.id = channel.category_id
    where category.name = 'Software'
  ),
  array['text:links']::text[],
  'Software room order matches Discord'
);
select is(
  (
    select array_agg(channel.kind::text || ':' || channel.name order by channel.position, channel.id)
    from public.channels as channel
    inner join public.channel_categories as category
      on category.id = channel.category_id
    where category.name = 'AFK'
  ),
  array['voice:AFK']::text[],
  'AFK contains the final voice room'
);
select is(
  (
    select array_agg(id::text || ':' || name order by id)
    from public.channels
    where id in (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000202'
    )
  ),
  array[
    '00000000-0000-4000-8000-000000000101:spawn',
    '00000000-0000-4000-8000-000000000102:law',
    '00000000-0000-4000-8000-000000000201:Queue',
    '00000000-0000-4000-8000-000000000202:Crash'
  ]::text[],
  'the four original channel IDs are reused under their new names'
);
select is(
  (select count(*) from public.messages),
  0::bigint,
  'the channel-layout migration imports no messages'
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
  'Outsider category',
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

select is(
  (select count(*) from public.channel_categories),
  8::bigint,
  'a Bakbak member sees only the eight Bakbak categories'
);
select is(
  (select count(*) from public.channels),
  26::bigint,
  'a Bakbak member sees all mirrored and System rooms'
);

set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from public.channel_categories),
  1::bigint,
  'an outsider sees only its own server category'
);
select is(
  (select count(*) from public.channels),
  0::bigint,
  'an outsider cannot read any mirrored Bakbak room'
);

select * from finish();
rollback;
