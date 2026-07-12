begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

select has_table('public', 'soundboard_categories', 'soundboard categories table exists');
select has_table('public', 'soundboard_sounds', 'soundboard sounds table exists');
select is(
  (select count(*) from public.soundboard_categories where server_id = '00000000-0000-4000-8000-000000000001'),
  4::bigint,
  'default server has four soundboard categories'
);
select is(
  (select count(*) from public.soundboard_sounds where server_id = '00000000-0000-4000-8000-000000000001'),
  23::bigint,
  'default server has all hosted sounds'
);
select ok(
  has_column_privilege('authenticated', 'public.soundboard_sounds', 'label', 'UPDATE')
    and has_column_privilege('authenticated', 'public.soundboard_sounds', 'emoji', 'UPDATE')
    and has_column_privilege('authenticated', 'public.soundboard_sounds', 'category_id', 'UPDATE'),
  'members receive update access only for editable sound metadata'
);
select ok(
  not has_column_privilege('authenticated', 'public.soundboard_sounds', 'object_path', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.soundboard_sounds', 'duration_ms', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.soundboard_sounds', 'audio_revision', 'UPDATE'),
  'members cannot mutate operator-owned audio metadata'
);
select ok(
  not has_table_privilege('authenticated', 'public.soundboard_sounds', 'INSERT')
    and not has_table_privilege('authenticated', 'public.soundboard_sounds', 'DELETE'),
  'members cannot insert or delete sound catalog rows'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('soundboard_categories', 'soundboard_sounds')
  ),
  2::bigint,
  'soundboard catalog tables are published through Realtime'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('40000000-0000-4000-8000-000000000001', 'catalog-member@example.invalid', '{"display_name":"Catalog Member"}'::jsonb),
  ('40000000-0000-4000-8000-000000000002', 'catalog-outsider@example.invalid', '{"display_name":"Catalog Outsider"}'::jsonb);

insert into public.servers (id, name)
values ('40000000-0000-4000-8000-000000000100', 'Other catalog server');

insert into public.memberships (server_id, user_id, role)
values
  ('00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'member'),
  ('40000000-0000-4000-8000-000000000100', '40000000-0000-4000-8000-000000000002', 'member');

insert into public.soundboard_categories (id, server_id, name, position)
values ('40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000100', 'Other category', 10);

insert into public.soundboard_sounds (
  id,
  server_id,
  category_id,
  label,
  emoji,
  object_path,
  duration_ms
)
values (
  '40000000-0000-4000-8000-000000000102',
  '40000000-0000-4000-8000-000000000100',
  '40000000-0000-4000-8000-000000000101',
  'Other sound',
  '🔒',
  '40000000-0000-4000-8000-000000000100/other.mp3',
  1000
);

set local role authenticated;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select count(*) from public.soundboard_categories), 4::bigint, 'member sees only its categories');
select is((select count(*) from public.soundboard_sounds), 23::bigint, 'member sees only its sounds');
select lives_ok(
  $$update public.soundboard_sounds set label = 'Edited sound', emoji = '🎉' where id = '00000000-0000-4000-8000-000000002001'$$,
  'member can edit label and emoji'
);

reset role;
select is(
  (select label || emoji from public.soundboard_sounds where id = '00000000-0000-4000-8000-000000002001'),
  'Edited sound🎉',
  'metadata edit is stored'
);
select is(
  (select updated_by from public.soundboard_sounds where id = '00000000-0000-4000-8000-000000002001'),
  '40000000-0000-4000-8000-000000000001'::uuid,
  'metadata edit records the authenticated editor'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$update public.soundboard_sounds set object_path = '00000000-0000-4000-8000-000000000001/replaced.mp3' where id = '00000000-0000-4000-8000-000000002001'$$,
  '42501',
  'permission denied for table soundboard_sounds',
  'member cannot replace an object path'
);
select throws_ok(
  $$update public.soundboard_sounds set category_id = '40000000-0000-4000-8000-000000000101' where id = '00000000-0000-4000-8000-000000002001'$$,
  '23503',
  null,
  'member cannot assign a category from another server'
);
select throws_ok(
  $$insert into public.soundboard_sounds (server_id, category_id, label, emoji, object_path, duration_ms) values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001001', 'Injected', '💉', '00000000-0000-4000-8000-000000000001/injected.mp3', 1000)$$,
  '42501',
  'permission denied for table soundboard_sounds',
  'member cannot insert a sound'
);

set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*) from public.soundboard_sounds), 1::bigint, 'outsider sees only its server sound');

set local role anon;
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok(
  $$select count(*) from public.soundboard_sounds$$,
  '42501',
  'permission denied for table soundboard_sounds',
  'anonymous users cannot read the catalog'
);

select * from finish();
rollback;
