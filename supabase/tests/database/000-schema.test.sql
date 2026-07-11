begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'servers', 'servers table exists');
select has_table('public', 'memberships', 'memberships table exists');
select has_table('public', 'channels', 'channels table exists');
select has_table('public', 'messages', 'messages table exists');
select has_table('public', 'invite_codes', 'invite_codes table exists');
select has_table('public', 'presence_heartbeats', 'presence heartbeats table exists');

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.servers'::regclass),
  'servers has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.memberships'::regclass),
  'memberships has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.channels'::regclass),
  'channels has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.messages'::regclass),
  'messages has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.invite_codes'::regclass),
  'invite_codes has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.presence_heartbeats'::regclass),
  'presence heartbeats has RLS enabled'
);

select has_function(
  'public',
  'redeem_invite_code',
  array['text'],
  'authenticated invite redemption RPC exists'
);
select has_function(
  'private',
  'issue_invite_code',
  array['uuid', 'uuid', 'timestamp with time zone'],
  'operator-only invite issuer exists'
);
select has_function(
  'public',
  'heartbeat_presence',
  array['uuid'],
  'authenticated presence heartbeat RPC exists'
);

select ok(
  has_table_privilege('authenticated', 'public.messages', 'SELECT'),
  'authenticated users can select RLS-filtered messages'
);
select ok(
  has_column_privilege('authenticated', 'public.messages', 'channel_id', 'INSERT')
    and has_column_privilege('authenticated', 'public.messages', 'body', 'INSERT'),
  'authenticated users can insert only message input columns'
);
select ok(
  not has_table_privilege('authenticated', 'public.memberships', 'INSERT'),
  'authenticated users cannot insert memberships directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.invite_codes', 'SELECT'),
  'authenticated users cannot inspect invite hashes'
);
select ok(
  has_table_privilege('authenticated', 'public.presence_heartbeats', 'SELECT'),
  'authenticated users can select RLS-filtered presence heartbeats'
);
select ok(
  not has_table_privilege('authenticated', 'public.presence_heartbeats', 'INSERT'),
  'authenticated users cannot forge presence heartbeats directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.issue_invite_code(uuid, uuid, timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated users cannot issue invite codes'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.redeem_invite_code(text)',
    'EXECUTE'
  ),
  'authenticated users can execute only the invite redemption RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.heartbeat_presence(uuid)',
    'EXECUTE'
  ),
  'authenticated users can execute the presence heartbeat RPC'
);

select * from finish();
rollback;
