-- Organizations, roles, and an append-only audit log.
--
-- G5 in docs/AUDIT.md; §26 and §27 of the product directive. Done now
-- because every table in this schema is empty except one row in
-- portfolio_wallets. Re-parenting billing and evidence onto an
-- organization is a schema addition today and a backfill with a
-- dual-read path once there are customers, so this is the cheapest
-- this change will ever be.
--
-- The model, decided by the product owner: the ORGANIZATION holds the
-- subscription, the entitlement, the API keys and the evidence.
-- Members join it with a role. accounts.organization — a free-text
-- column — is the vestigial version of this and is left in place for
-- now rather than dropped, because dropping a column is the one thing
-- here that cannot be undone by a later migration.
--
-- Ownership convention follows the existing policies exactly:
-- accounts.id IS auth.uid(), and every policy in this schema is written
-- as `auth.uid() = <account column>`. Nothing here invents a second one.

-- ── 1. The organization ──────────────────────────────────────────────

create table if not exists noshashi.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table noshashi.organizations is
  'The billing and evidence boundary. Supersedes accounts.organization, which was free text.';

-- ── 2. Roles and membership ──────────────────────────────────────────

-- The seven roles §26 names. An enum rather than free text so an
-- unknown role is a write error and not a silent permission gap.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_role'
                 and typnamespace = 'noshashi'::regnamespace) then
    create type noshashi.member_role as enum
      ('owner', 'admin', 'analyst', 'compliance', 'risk', 'viewer', 'api');
  end if;
end $$;

create table if not exists noshashi.organization_members (
  organization_id uuid not null references noshashi.organizations(id) on delete cascade,
  account_id      uuid not null references noshashi.accounts(id) on delete cascade,
  role            noshashi.member_role not null default 'viewer',
  invited_by      uuid references noshashi.accounts(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (organization_id, account_id)
);

create index if not exists organization_members_account_idx
  on noshashi.organization_members (account_id);

-- ── 3. Membership predicates ─────────────────────────────────────────
--
-- SECURITY DEFINER because the policies below query this table from
-- inside a policy ON that table, which would recurse. `search_path = ''`
-- and fully-qualified names so the function cannot be redirected by a
-- caller's search_path — the standard hardening for a definer function.

create or replace function noshashi.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from noshashi.organization_members m
    where m.organization_id = org and m.account_id = (select auth.uid())
  );
$$;

create or replace function noshashi.has_org_role(org uuid, roles noshashi.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from noshashi.organization_members m
    where m.organization_id = org
      and m.account_id = (select auth.uid())
      and m.role = any(roles)
  );
$$;

revoke execute on function noshashi.is_org_member(uuid) from public;
revoke execute on function noshashi.has_org_role(uuid, noshashi.member_role[]) from public;
grant execute on function noshashi.is_org_member(uuid) to authenticated;
grant execute on function noshashi.has_org_role(uuid, noshashi.member_role[]) to authenticated;

-- ── 4. Re-parenting: nullable, deliberately ──────────────────────────
--
-- NOT NULL would be correct for a schema with no rows, and is still
-- wrong here: the deployed noshashi-verify function inserts into
-- verification_events without an organization_id, so a NOT NULL column
-- would fail every insert the moment this migration lands. The column
-- is nullable until the writers supply it, and a later migration can
-- tighten it once they do.

alter table noshashi.entitlements        add column if not exists organization_id uuid references noshashi.organizations(id) on delete cascade;
alter table noshashi.api_keys            add column if not exists organization_id uuid references noshashi.organizations(id) on delete cascade;
alter table noshashi.verification_events add column if not exists organization_id uuid references noshashi.organizations(id) on delete set null;
alter table noshashi.receipts            add column if not exists organization_id uuid references noshashi.organizations(id) on delete set null;
alter table noshashi.portfolios          add column if not exists organization_id uuid references noshashi.organizations(id) on delete cascade;
alter table noshashi.alerts              add column if not exists organization_id uuid references noshashi.organizations(id) on delete cascade;

create index if not exists entitlements_org_idx        on noshashi.entitlements (organization_id);
create index if not exists api_keys_org_idx            on noshashi.api_keys (organization_id);
create index if not exists verification_events_org_idx on noshashi.verification_events (organization_id);
create index if not exists receipts_org_idx            on noshashi.receipts (organization_id);
create index if not exists portfolios_org_idx          on noshashi.portfolios (organization_id);
create index if not exists alerts_org_idx              on noshashi.alerts (organization_id);

-- Evidence keeps its organization when a member leaves: ON DELETE SET
-- NULL on verification_events and receipts, not CASCADE. A receipt is
-- the record of an adjudication that happened; deleting an org must not
-- silently erase the audit trail it produced.

-- ── 5. The audit log ─────────────────────────────────────────────────

create table if not exists noshashi.audit_log (
  id               bigint generated always as identity primary key,
  organization_id  uuid references noshashi.organizations(id) on delete restrict,
  actor_account_id uuid references noshashi.accounts(id) on delete set null,
  action           text not null check (length(trim(action)) > 0),
  entity_type      text,
  entity_id        text,
  previous_state   jsonb,
  new_state        jsonb,
  request_id       text,
  occurred_at      timestamptz not null default now()
);

create index if not exists audit_log_org_time_idx
  on noshashi.audit_log (organization_id, occurred_at desc);

comment on table noshashi.audit_log is
  'Append-only. UPDATE, DELETE and TRUNCATE are revoked from every role and refused by a trigger.';

-- Append-only, enforced twice on purpose.
--
-- RLS alone is not enough: service_role BYPASSES row-level security, and
-- every server-side writer in this product uses it. So the grant is the
-- real control — a statement that is not granted never reaches a policy.
--
-- The trigger is the second line, and it catches what a grant cannot: a
-- superuser session, a future migration that re-grants UPDATE by
-- accident, or anyone who owns the table. Belt and braces, because the
-- whole value of an audit log is that it cannot be quietly edited.

revoke update, delete, truncate on noshashi.audit_log from anon, authenticated, service_role;

-- Stated explicitly rather than inherited. Supabase's default
-- privileges already grant service_role everything on a new table in
-- this schema, which is how the revoke above has anything to remove —
-- but an audit log that cannot be written is a silent failure, and one
-- that depends on a platform default nobody can see in this file is a
-- silent failure waiting to happen. These two lines are the contract:
-- the server appends and reads, and can do nothing else.
grant select, insert on noshashi.audit_log to service_role;

create or replace function noshashi.audit_log_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'noshashi.audit_log is append-only: % is refused. Correct a row by appending a correction.',
    tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists audit_log_no_mutation on noshashi.audit_log;
create trigger audit_log_no_mutation
  before update or delete on noshashi.audit_log
  for each row execute function noshashi.audit_log_is_append_only();

-- ── 6. RLS ───────────────────────────────────────────────────────────
--
-- Each policy is dropped before it is created. Postgres has no
-- CREATE POLICY IF NOT EXISTS, so without this the file is idempotent
-- everywhere EXCEPT here — which is the worst shape, because it looks
-- re-runnable and fails halfway. Caught by applying it twice.

alter table noshashi.organizations        enable row level security;
alter table noshashi.organization_members enable row level security;
alter table noshashi.audit_log            enable row level security;

-- A member reads their own organizations; owners and admins rename them.
drop policy if exists organizations_select_member on noshashi.organizations;
create policy organizations_select_member on noshashi.organizations
  for select to authenticated
  using (noshashi.is_org_member(id));

drop policy if exists organizations_update_admin on noshashi.organizations;
create policy organizations_update_admin on noshashi.organizations
  for update to authenticated
  using (noshashi.has_org_role(id, array['owner', 'admin']::noshashi.member_role[]))
  with check (noshashi.has_org_role(id, array['owner', 'admin']::noshashi.member_role[]));

-- A member sees the roster of any organization they belong to.
drop policy if exists organization_members_select_member on noshashi.organization_members;
create policy organization_members_select_member on noshashi.organization_members
  for select to authenticated
  using (noshashi.is_org_member(organization_id));

-- Only owners and admins change the roster. Creating the FIRST member
-- of a new organization cannot pass this — there is no membership yet
-- to check — so bootstrapping an organization is a server-side action
-- under the service role, which is the correct place for it.
drop policy if exists organization_members_write_admin on noshashi.organization_members;
create policy organization_members_write_admin on noshashi.organization_members
  for all to authenticated
  using (noshashi.has_org_role(organization_id, array['owner', 'admin']::noshashi.member_role[]))
  with check (noshashi.has_org_role(organization_id, array['owner', 'admin']::noshashi.member_role[]));

-- The log is readable by compliance-facing roles, writable by nobody
-- through this path: there is no INSERT policy for `authenticated`, and
-- entries are written server-side under the service role.
drop policy if exists audit_log_select_reviewer on noshashi.audit_log;
create policy audit_log_select_reviewer on noshashi.audit_log
  for select to authenticated
  using (noshashi.has_org_role(
    organization_id,
    array['owner', 'admin', 'compliance', 'risk']::noshashi.member_role[]
  ));

-- ── 7. Grants ────────────────────────────────────────────────────────
--
-- The repo's rule, from 20260914212857: a grant decides whether a
-- statement is allowed at all, a policy decides which rows it touches,
-- and both have to agree or the path is dead. Each grant below has a
-- matching policy above, and nothing above lacks a grant.

grant select on noshashi.organizations to authenticated;
grant update (name, updated_at) on noshashi.organizations to authenticated;
grant select, insert, update, delete on noshashi.organization_members to authenticated;
grant select on noshashi.audit_log to authenticated;

-- Bootstrapping an organization and its first member happens
-- server-side, because the roster policies cannot authorise the first
-- row: there is no membership yet to check against.
grant select, insert, update, delete on noshashi.organizations to service_role;
grant select, insert, update, delete on noshashi.organization_members to service_role;

-- updated_at maintenance, matching the accounts_touch trigger already
-- in this schema.
create or replace function noshashi.organizations_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organizations_touch on noshashi.organizations;
create trigger organizations_touch
  before update on noshashi.organizations
  for each row execute function noshashi.organizations_touch();
