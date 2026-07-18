begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

select has_table('public', 'soundboard_categories', 'soundboard categories table exists');
select has_table('public', 'soundboard_sounds', 'soundboard sounds table exists');
select has_table('public', 'soundboard_favorites', 'soundboard favorites table exists');
select is(
  (select count(*) from public.soundboard_categories where server_id = '00000000-0000-4000-8000-000000000001'),
  2::bigint,
  'default server has System and Bakbak categories'
);
select is(
  (select count(*) from public.soundboard_categories where server_id = '00000000-0000-4000-8000-000000000001' and accepts_uploads),
  1::bigint,
  'default server has one upload target'
);
select is(
  (select count(*) from public.soundboard_sounds where server_id = '00000000-0000-4000-8000-000000000001'),
  44::bigint,
  'default server preserves all hosted sounds'
);
select ok(
  has_column_privilege('authenticated', 'public.soundboard_sounds', 'label', 'UPDATE')
    and has_column_privilege('authenticated', 'public.soundboard_sounds', 'emoji', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.soundboard_sounds', 'category_id', 'UPDATE'),
  'members receive update access only for editable label and emoji'
);
select ok(
  not has_table_privilege('authenticated', 'public.soundboard_sounds', 'INSERT')
    and not has_table_privilege('authenticated', 'public.soundboard_sounds', 'DELETE'),
  'members cannot insert or delete sound rows directly'
);
select ok(
  has_table_privilege('authenticated', 'public.soundboard_favorites', 'SELECT')
    and has_table_privilege('authenticated', 'public.soundboard_favorites', 'INSERT')
    and has_table_privilege('authenticated', 'public.soundboard_favorites', 'DELETE')
    and not has_table_privilege('authenticated', 'public.soundboard_favorites', 'UPDATE'),
  'members can manage favorite rows without shared mutation access'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_soundboard_upload(uuid,uuid,uuid,text,text,text,integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the privileged upload insertion function'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in (
        'soundboard_categories',
        'soundboard_sounds',
        'soundboard_favorites'
      )
  ),
  3::bigint,
  'catalog and favorite tables are published through Realtime'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('40000000-0000-4000-8000-000000000001', 'catalog-admin@example.invalid', '{"display_name":"Catalog Admin"}'::jsonb),
  ('40000000-0000-4000-8000-000000000002', 'catalog-member@example.invalid', '{"display_name":"Catalog Member"}'::jsonb),
  ('40000000-0000-4000-8000-000000000003', 'catalog-outsider@example.invalid', '{"display_name":"Catalog Outsider"}'::jsonb);

insert into public.servers (id, name)
values ('40000000-0000-4000-8000-000000000100', 'Other catalog server');

insert into public.memberships (server_id, user_id, role)
values
  ('00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'admin'),
  ('00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'member'),
  ('40000000-0000-4000-8000-000000000100', '40000000-0000-4000-8000-000000000003', 'member');

insert into public.soundboard_categories (
  id,
  server_id,
  name,
  position,
  accepts_uploads
)
values (
  '40000000-0000-4000-8000-000000000101',
  '40000000-0000-4000-8000-000000000100',
  'Other category',
  10,
  true
);

insert into public.soundboard_sounds (
  id,
  server_id,
  category_id,
  label,
  emoji,
  object_path,
  duration_ms,
  position,
  created_by
)
values
  (
    '40000000-0000-4000-8000-000000000102',
    '40000000-0000-4000-8000-000000000100',
    '40000000-0000-4000-8000-000000000101',
    'Other sound',
    '🔒',
    '40000000-0000-4000-8000-000000000100/other.wav',
    1000,
    10,
    '40000000-0000-4000-8000-000000000003'
  ),
  (
    '40000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001005',
    'Member upload',
    '🎯',
    '00000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002/member.wav',
    1000,
    220,
    '40000000-0000-4000-8000-000000000002'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select count(*) from public.soundboard_categories), 2::bigint, 'member sees only its categories');
select is((select count(*) from public.soundboard_sounds), 45::bigint, 'member sees its operator and uploaded sounds');
with changed as (
  update public.soundboard_sounds
  set label = 'Member tried system edit'
  where id = '00000000-0000-4000-8000-000000002001'
  returning 1
)
select is((select count(*) from changed), 0::bigint, 'member cannot edit operator-managed sounds');
select lives_ok(
  $$update public.soundboard_sounds set label = 'Owned edit', emoji = '🎉' where id = '40000000-0000-4000-8000-000000000103'$$,
  'member can edit its own uploaded sound'
);
select throws_ok(
  $$update public.soundboard_sounds set category_id = '00000000-0000-4000-8000-000000001001' where id = '40000000-0000-4000-8000-000000000103'$$,
  '42501',
  'permission denied for table soundboard_sounds',
  'member cannot move an upload into System'
);
select lives_ok(
  $$insert into public.soundboard_favorites (user_id, server_id, sound_id) values ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000002001')$$,
  'member can favorite a sound in its server'
);
select is((select count(*) from public.soundboard_favorites), 1::bigint, 'member sees its own favorite');
select throws_ok(
  $$insert into public.soundboard_favorites (user_id, server_id, sound_id) values ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000002001')$$,
  '42501',
  'new row violates row-level security policy for table "soundboard_favorites"',
  'member cannot create a favorite for another user'
);
select throws_ok(
  $$delete from public.soundboard_sounds where id = '40000000-0000-4000-8000-000000000103'$$,
  '42501',
  'permission denied for table soundboard_sounds',
  'member cannot bypass managed sound deletion'
);

reset role;
select is(
  (select label || emoji from public.soundboard_sounds where id = '40000000-0000-4000-8000-000000000103'),
  'Owned edit🎉',
  'owner metadata edit is stored'
);
select is(
  (select updated_by from public.soundboard_sounds where id = '40000000-0000-4000-8000-000000000103'),
  '40000000-0000-4000-8000-000000000002'::uuid,
  'owner metadata edit records the authenticated editor'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$update public.soundboard_sounds set label = 'Admin system edit' where id = '00000000-0000-4000-8000-000000002001'$$,
  'admin can edit operator-managed sound metadata'
);
select lives_ok(
  $$update public.soundboard_sounds set label = 'Admin upload edit' where id = '40000000-0000-4000-8000-000000000103'$$,
  'admin can moderate member-uploaded metadata'
);
select is((select count(*) from public.soundboard_favorites), 0::bigint, 'admin cannot read another member favorite');

set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"40000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is((select count(*) from public.soundboard_sounds), 1::bigint, 'outsider sees only its server sound');
select throws_ok(
  $$insert into public.soundboard_favorites (user_id, server_id, sound_id) values ('40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000002001')$$,
  '42501',
  'new row violates row-level security policy for table "soundboard_favorites"',
  'outsider cannot favorite a sound from another server'
);

set local role anon;
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok(
  $$select count(*) from public.soundboard_sounds$$,
  '42501',
  'permission denied for table soundboard_sounds',
  'anonymous users cannot read the catalog'
);
select throws_ok(
  $$select count(*) from public.soundboard_favorites$$,
  '42501',
  'permission denied for table soundboard_favorites',
  'anonymous users cannot read favorites'
);

reset role;
delete from public.soundboard_sounds
where id = '00000000-0000-4000-8000-000000002001';
select is(
  (select count(*) from public.soundboard_favorites),
  0::bigint,
  'deleting a sound cascades its private favorites'
);

select * from finish();
rollback;
