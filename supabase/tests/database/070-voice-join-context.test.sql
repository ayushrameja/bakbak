begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

select has_function(
  'public',
  'get_voice_join_context',
  array['uuid'],
  'voice join context RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_voice_join_context(uuid)',
    'EXECUTE'
  ),
  'authenticated users can request voice join context'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_voice_join_context(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot request voice join context'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '70000000-0000-4000-8000-000000000001',
    'voice-context-member@example.invalid',
    '{"display_name":"Context Member"}'::jsonb
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    'voice-context-outsider@example.invalid',
    '{"display_name":"Context Outsider"}'::jsonb
  );

insert into public.servers (id, name)
values ('70000000-0000-4000-8000-000000000100', 'Context other server');

insert into public.channels (id, server_id, kind, name, position)
values (
  '70000000-0000-4000-8000-000000000101',
  '70000000-0000-4000-8000-000000000100',
  'voice',
  'outsider-voice',
  10
);

insert into public.memberships (server_id, user_id, role)
values
  (
    '00000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    'member'
  ),
  (
    '70000000-0000-4000-8000-000000000100',
    '70000000-0000-4000-8000-000000000002',
    'member'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '70000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (
    select count(*)
    from public.get_voice_join_context(
      '00000000-0000-4000-8000-000000000201'
    )
  ),
  1::bigint,
  'a member receives one context row for an accessible voice channel'
);
select is(
  (
    select display_name
    from public.get_voice_join_context(
      '00000000-0000-4000-8000-000000000201'
    )
  ),
  'Context Member'::text,
  'voice context derives the current profile display name'
);
select is(
  (
    select count(*)
    from public.get_voice_join_context(
      '00000000-0000-4000-8000-000000000101'
    )
  ),
  0::bigint,
  'text channels return no voice join context'
);
select is(
  (
    select count(*)
    from public.get_voice_join_context(
      '70000000-0000-4000-8000-000000000101'
    )
  ),
  0::bigint,
  'cross-server voice channels return no context'
);
select is(
  (
    select count(*)
    from public.get_voice_join_context(
      '70000000-0000-4000-8000-000000000999'
    )
  ),
  0::bigint,
  'missing channels return no voice join context'
);

set local "request.jwt.claim.sub" = '70000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (
    select channel_id
    from public.get_voice_join_context(
      '70000000-0000-4000-8000-000000000101'
    )
  ),
  '70000000-0000-4000-8000-000000000101'::uuid,
  'a member can receive context for its own server voice channel'
);
select is(
  (
    select count(*)
    from public.get_voice_join_context(
      '00000000-0000-4000-8000-000000000201'
    )
  ),
  0::bigint,
  'an outsider cannot enumerate the Bakbak voice channel'
);

select * from finish();
rollback;
