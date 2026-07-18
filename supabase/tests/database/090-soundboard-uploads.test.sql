begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('90000000-0000-4000-8000-000000000001', 'upload-one@example.invalid', '{"display_name":"Uploader One"}'::jsonb),
  ('90000000-0000-4000-8000-000000000002', 'upload-two@example.invalid', '{"display_name":"Uploader Two"}'::jsonb),
  ('90000000-0000-4000-8000-000000000003', 'upload-three@example.invalid', '{"display_name":"Uploader Three"}'::jsonb),
  ('90000000-0000-4000-8000-000000000004', 'upload-outsider@example.invalid', '{"display_name":"Upload Outsider"}'::jsonb);

insert into public.memberships (server_id, user_id, role)
values
  ('00000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'member'),
  ('00000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', 'member'),
  ('00000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000003', 'member');

select ok(
  has_function_privilege(
    'service_role',
    'public.create_soundboard_upload(uuid,uuid,uuid,text,text,text,integer)',
    'EXECUTE'
  ),
  'service role can invoke transactional upload publication'
);

set local role service_role;

select is(
  (
    public.create_soundboard_upload(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000001005',
      '90000000-0000-4000-8000-000000000001',
      'First upload',
      '🎯',
      '00000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001/first.wav',
      1000
    )
  ).created_by,
  '90000000-0000-4000-8000-000000000001'::uuid,
  'transactional publication derives a member-owned catalog row'
);

select throws_ok(
  $$select public.create_soundboard_upload(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001005',
    '90000000-0000-4000-8000-000000000004',
    'Outsider upload',
    '🔒',
    '00000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000004/nope.wav',
    1000
  )$$,
  '42501',
  'membership_required',
  'transactional publication rejects a non-member creator'
);

select throws_ok(
  $$select public.create_soundboard_upload(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001001',
    '90000000-0000-4000-8000-000000000001',
    'Wrong category',
    '🧱',
    '00000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001/wrong.wav',
    1000
  )$$,
  '23514',
  'upload_category_required',
  'transactional publication rejects System as an upload target'
);

reset role;

insert into public.soundboard_sounds (
  server_id,
  category_id,
  label,
  emoji,
  object_path,
  duration_ms,
  position,
  created_by
)
select
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000001005',
  'Uploader one ' || sequence,
  '🔊',
  '00000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001/' || sequence || '.wav',
  1000,
  220 + sequence,
  '90000000-0000-4000-8000-000000000001'
from generate_series(2, 25) as sequence;

set local role service_role;
select throws_ok(
  $$select public.create_soundboard_upload(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001005',
    '90000000-0000-4000-8000-000000000001',
    'Twenty sixth',
    '🛑',
    '00000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001/26.wav',
    1000
  )$$,
  'P0001',
  'member_upload_limit',
  'transactional publication enforces 25 active uploads per member'
);

reset role;
insert into public.soundboard_sounds (
  server_id,
  category_id,
  label,
  emoji,
  object_path,
  duration_ms,
  position,
  created_by
)
select
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000001005',
  'Server capacity ' || sequence,
  '🔊',
  '00000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000002/' || sequence || '.wav',
  1000,
  300 + sequence,
  '90000000-0000-4000-8000-000000000002'
from generate_series(1, 175) as sequence;

set local role service_role;
select throws_ok(
  $$select public.create_soundboard_upload(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001005',
    '90000000-0000-4000-8000-000000000003',
    'Two hundred and one',
    '🛑',
    '00000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000003/201.wav',
    1000
  )$$,
  'P0001',
  'server_upload_limit',
  'transactional publication enforces 200 member uploads per server'
);

reset role;
select throws_ok(
  $$insert into public.soundboard_sounds (
    server_id,
    category_id,
    label,
    emoji,
    object_path,
    duration_ms,
    created_by
  ) values (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001005',
    'Too long',
    '⌛',
    '00000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000003/long.wav',
    5001,
    '90000000-0000-4000-8000-000000000003'
  )$$,
  '23514',
  null,
  'database constraint rejects a forged over-five-second member duration'
);

select * from finish();
rollback;
