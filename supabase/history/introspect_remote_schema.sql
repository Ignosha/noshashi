-- Read the live schema back, so the repo's reconstruction can be checked
-- against it.
--
-- WHY THIS EXISTS
--
-- `supabase db pull` and `supabase db dump` both run pg_dump inside a
-- container, so both need Docker or Podman:
--
--     docker: command not found (podman also not found)
--
-- Without one, the CLI cannot produce a schema dump at all. This is the
-- substitute: eight read-only queries over the catalogs that return the
-- same facts a dump would, as result sets. Paste it into the SQL editor,
-- run it, and hand the output back.
--
-- The point is not to replace a dump. It is to turn
-- 20260910_noshashi_schema_baseline.sql from a reconstruction somebody
-- wrote from memory into one that has been checked against the database
-- it claims to describe. Until that check happens, the baseline is a
-- plausible document, and a plausible document is exactly what you do not
-- want to rebuild a compliance database from.
--
-- Read-only throughout. No DDL, no writes, no locks beyond catalog reads.

-- 1. Tables and columns, in ordinal order.
select
  c.relname                                        as table_name,
  a.attnum                                         as ord,
  a.attname                                        as column_name,
  format_type(a.atttypid, a.atttypmod)             as data_type,
  a.attnotnull                                     as not_null,
  pg_get_expr(d.adbin, d.adrelid)                  as default_expr
from pg_attribute a
join pg_class c      on c.oid = a.attrelid
join pg_namespace n  on n.oid = c.relnamespace
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where n.nspname = 'noshashi'
  and c.relkind = 'r'
  and a.attnum > 0
  and not a.attisdropped
order by c.relname, a.attnum;

-- 2. Constraints, as the definitions that created them. Covers primary
--    keys, foreign keys, uniques and checks in one pass -- including the
--    entitlements.tier check, which is what pins the plan identifiers
--    that catalog.ts must not rename.
select
  c.relname            as table_name,
  con.conname          as constraint_name,
  con.contype          as kind,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c     on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'noshashi'
order by c.relname, con.contype, con.conname;

-- 3. Indexes.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'noshashi'
order by tablename, indexname;

-- 4. Row level security: which tables enforce it, and every policy in
--    full. The `rowsecurity` column is as important as the policies --
--    a table with policies and RLS switched off is wide open, and the
--    two facts live in different places.
select
  c.relname       as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'noshashi' and c.relkind = 'r'
order by c.relname;

select
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual        as using_expr,
  with_check  as with_check_expr
from pg_policies
where schemaname = 'noshashi'
order by tablename, policyname;

-- 5. Functions, with volatility, security mode and pinned search_path.
--    proconfig is the one to read closely: a SECURITY DEFINER function
--    with no search_path pinned resolves unqualified names through
--    whatever the caller brings.
select
  p.proname                              as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  t.typname                              as returns,
  case p.prosecdef when true then 'DEFINER' else 'INVOKER' end as security,
  p.provolatile                          as volatility,
  p.proconfig                            as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_type t      on t.oid = p.prorettype
where n.nspname in ('noshashi', 'public')
order by n.nspname, p.proname;

-- 6. Triggers. api_keys_guard is what makes key revocation terminal, so
--    its absence is a security finding rather than a missing convenience.
select
  c.relname   as table_name,
  t.tgname    as trigger_name,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'noshashi'
  and not t.tgisinternal
order by c.relname, t.tgname;

-- 7. Table-level privileges by role.
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.table_privileges
where table_schema = 'noshashi'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;

-- 8. Column-level privileges.
--
--    This is the one that is easy to get wrong and expensive to leave
--    wrong. `authenticated` must hold UPDATE on api_keys for exactly
--    `name` and `revoked_at`. Anything more -- key_hash, scopes,
--    expires_at -- and a customer's own session can edit the columns that
--    decide whether their key is trusted, which is the finding the
--    hardening migration exists to close.
select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'noshashi'
  and grantee in ('anon', 'authenticated')
order by table_name, column_name, grantee, privilege_type;
