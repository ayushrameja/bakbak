begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create type public.membership_role as enum ('admin', 'member');
create type public.channel_kind as enum ('text', 'voice');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    char_length(btrim(display_name)) between 1 and 50
  ),
  constraint profiles_avatar_url_length check (
    avatar_url is null or char_length(avatar_url) <= 2048
  )
);

create table public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint servers_name_length check (
    char_length(btrim(name)) between 1 and 80
  )
);

create table public.memberships (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.membership_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create index memberships_user_server_idx
  on public.memberships (user_id, server_id);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  kind public.channel_kind not null,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint channels_name_length check (
    char_length(btrim(name)) between 1 and 80
  ),
  constraint channels_position_nonnegative check (position >= 0)
);

create unique index channels_server_kind_name_key
  on public.channels (server_id, kind, lower(name));

create index channels_server_position_idx
  on public.channels (server_id, position, id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid default auth.uid()
    references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_length check (
    char_length(btrim(body)) between 1 and 4000
  )
);

create index messages_channel_created_idx
  on public.messages (channel_id, created_at desc, id desc);

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  code_hash text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  constraint invite_codes_hash_format check (
    code_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint invite_codes_expiration_after_creation check (
    expires_at > created_at
  ),
  constraint invite_codes_usage_consistent check (
    used_at is not null or used_by is null
  )
);

create index invite_codes_server_unused_idx
  on public.invite_codes (server_id, expires_at)
  where used_at is null and revoked_at is null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_display_name text;
begin
  new_display_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Friend'
    ),
    50
  );

  insert into public.profiles (id, display_name)
  values (new.id, new_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

revoke all privileges on function private.set_updated_at() from public;
revoke all privileges on function private.handle_new_auth_user() from public;

commit;

