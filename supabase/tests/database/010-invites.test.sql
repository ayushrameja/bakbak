begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'admin-invite-test@example.invalid',
    '{"display_name":"Admin"}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'member-invite-test@example.invalid',
    '{"display_name":"Member"}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'other-invite-test@example.invalid',
    '{"display_name":"Other"}'::jsonb
  );

insert into public.memberships (server_id, user_id, role)
values (
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'admin'
);

create temporary table issued_invite as
select *
from private.issue_invite_code(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  now() + interval '1 day'
);
grant select on issued_invite to authenticated;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok(
  $$select public.redeem_invite_code((select plaintext_code from issued_invite))$$,
  'a signed-in user can redeem a valid invite'
);

reset role;

select is(
  (
    select count(*)
    from public.memberships
    where server_id = '00000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000002'
      and role = 'member'
  ),
  1::bigint,
  'redemption creates one member row'
);
select ok(
  (
    select used_at is not null
      and used_by = '10000000-0000-4000-8000-000000000002'
    from public.invite_codes
    where id = (select invite_id from issued_invite)
  ),
  'redemption marks the invite used by that member'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$select public.redeem_invite_code((select plaintext_code from issued_invite))$$,
  'a same-user retry is idempotent after a lost response'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select public.redeem_invite_code((select plaintext_code from issued_invite))$$,
  'P0001',
  'invalid_or_unavailable_invite',
  'a used invite is unavailable to another user'
);

reset role;

insert into public.invite_codes (
  server_id,
  code_hash,
  created_by,
  created_at,
  expires_at
)
values (
  '00000000-0000-4000-8000-000000000001',
  private.hash_invite_code('BK-11111111-11111111-11111111-11111111'),
  '10000000-0000-4000-8000-000000000001',
  now() - interval '2 days',
  now() - interval '1 day'
);

create temporary table revoked_invite as
select *
from private.issue_invite_code(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  now() + interval '1 day'
);
update public.invite_codes
set revoked_at = now()
where id = (select invite_id from revoked_invite);
grant select on revoked_invite to authenticated;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select public.redeem_invite_code('BK-11111111-11111111-11111111-11111111')$$,
  'P0001',
  'invalid_or_unavailable_invite',
  'an expired invite is rejected'
);
select throws_ok(
  $$select public.redeem_invite_code((select plaintext_code from revoked_invite))$$,
  'P0001',
  'invalid_or_unavailable_invite',
  'a revoked invite is rejected'
);

reset role;

create temporary table admin_invite as
select *
from private.issue_invite_code(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  now() + interval '1 day'
);
grant select on admin_invite to authenticated;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select public.redeem_invite_code((select plaintext_code from admin_invite))$$,
  'an existing member receives an idempotent success'
);

reset role;
select ok(
  (
    select used_at is null and used_by is null
    from public.invite_codes
    where id = (select invite_id from admin_invite)
  ),
  'an existing member does not consume another friend invite'
);

create temporary table unauthenticated_invite as
select *
from private.issue_invite_code(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  now() + interval '1 day'
);
grant select on unauthenticated_invite to authenticated;

set local role authenticated;
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{}';
select throws_ok(
  $$select public.redeem_invite_code((select plaintext_code from unauthenticated_invite))$$,
  '28000',
  'Authentication required.',
  'invite redemption requires an authenticated user'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select public.redeem_invite_code('BK-FFFFFFFF-FFFFFFFF-FFFFFFFF-FFFFFFFF')$$,
  'P0001',
  'invalid_or_unavailable_invite',
  'an unknown invite uses the same generic error'
);

reset role;
select is(
  (
    select count(*)
    from public.memberships
    where server_id = '00000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'failed invite attempts do not add another member'
);

select * from finish();
rollback;
