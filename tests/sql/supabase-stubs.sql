-- The parts of Supabase the noshashi schema leans on, for a plain Postgres.
-- Used only by scripts/test-sql.sh against a throwaway database.
do $$ begin
  create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticator noinherit login; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;

create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema auth, extensions to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  aud text,
  role text,
  instance_id uuid,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  encrypted_password text,
  phone text,
  last_sign_in_at timestamptz,
  is_anonymous boolean default false
);

create or replace function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
$$ select auth.jwt() ->> 'role' $$;
