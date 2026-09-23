-- Organisation policies, four-eyes activation and policy exceptions.
--
-- Builds on 20260920190000_organizations_roles_audit (organizations,
-- organization_members, member_role, is_org_member, has_org_role,
-- audit_log). Additive: no table is dropped, no row is rewritten. The two
-- verdict CHECK constraints are re-created wider, which every existing
-- row already satisfies.
--
-- Authorization lives here, in the database, not in the app:
--
--   * Only owner / admin / compliance can activate a policy or decide an
--     exception, and only through SECURITY DEFINER functions that are
--     executable by service_role alone — i.e. by the Edge Functions
--     noshashi-policy-activate and noshashi-exception-decide, which
--     verify the caller's JWT first and pass the verified account id.
--   * Four-eyes: a policy's author can never be its activator, and an
--     exception's requester can never be its approver. Enforced in the
--     activation/decision functions AND in a trigger on the tables, so no
--     path — including a service-role write that skips the function —
--     can activate a policy its author alone approved.
--   * A policy that is no longer a draft cannot change. A new version is
--     a new row. Verdicts reference (policy_id, version, hash) and those
--     never change once activated.

-- ── 0. Verdicts may be INSUFFICIENT DATA ─────────────────────────────
-- The engine issues it (src/lib/policy.ts verdictForChecks); the checks
-- predate it and would refuse such a receipt.

alter table noshashi.receipts drop constraint if exists receipts_verdict_check;
alter table noshashi.receipts add constraint receipts_verdict_check
  check (verdict in ('go', 'hold', 'no-go', 'insufficient-data'));
alter table noshashi.verification_events drop constraint if exists verification_events_verdict_check;
alter table noshashi.verification_events add constraint verification_events_verdict_check
  check (verdict in ('go', 'hold', 'no-go', 'insufficient-data'));

-- Receipts name the policy that decided them (null before policies existed).
alter table noshashi.receipts
  add column if not exists policy_id text,
  add column if not exists policy_version integer,
  add column if not exists policy_hash text;
alter table noshashi.verification_events
  add column if not exists policy_id text,
  add column if not exists policy_version integer,
  add column if not exists policy_hash text;

-- ── 1. Policy versions ───────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'policy_status' and typnamespace = 'noshashi'::regnamespace) then
    create type noshashi.policy_status as enum ('draft', 'pending', 'active', 'archived');
  end if;
end $$;

create table if not exists noshashi.org_policies (
  organization_id uuid not null references noshashi.organizations(id) on delete restrict,
  policy_id       text not null check (policy_id ~ '^[a-z0-9_]{3,64}$'),
  version         integer not null check (version > 0),
  name            text not null check (length(trim(name)) between 1 and 60),
  status          noshashi.policy_status not null default 'draft',
  params          jsonb not null check (jsonb_typeof(params) = 'object'),
  hash            text not null check (hash ~ '^[0-9A-F]{64}$'),
  engine          text not null default '1',
  created_by      uuid not null references noshashi.accounts(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  submitted_by    uuid references noshashi.accounts(id) on delete restrict,
  submitted_at    timestamptz,
  activated_by    uuid references noshashi.accounts(id) on delete restrict,
  effective_at    timestamptz,
  archived_at     timestamptz,
  primary key (organization_id, policy_id, version),
  -- Four-eyes, as a row invariant: an active or archived-after-active
  -- version always names an activator who is not its author.
  constraint org_policies_four_eyes check (activated_by is null or activated_by <> created_by),
  constraint org_policies_activation_recorded check (
    (status in ('active', 'archived') and effective_at is not null and activated_by is not null)
    or (status in ('draft', 'pending') and effective_at is null and activated_by is null)
  )
);

comment on table noshashi.org_policies is
  'Versioned institutional policies. draft → pending → active → archived. Only drafts change; activation is four-eyes and server-side only (activate_org_policy).';

create unique index if not exists org_policies_one_active
  on noshashi.org_policies (organization_id) where status = 'active';
create index if not exists org_policies_org_status_idx
  on noshashi.org_policies (organization_id, status);

create or replace function noshashi.org_policies_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.policy_id is distinct from old.policy_id
     or new.version is distinct from old.version
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'A policy version''s identity and author never change.' using errcode = 'check_violation';
  end if;
  if old.status <> 'draft' and (
       new.params is distinct from old.params or new.name is distinct from old.name
       or new.hash is distinct from old.hash or new.engine is distinct from old.engine) then
    raise exception 'Only a draft policy can be changed. Create a new version instead.' using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'draft'   and new.status = 'pending') or
       (old.status = 'pending' and new.status = 'draft') or
       (old.status = 'pending' and new.status = 'active') or
       (old.status = 'active'  and new.status = 'archived')) then
    raise exception 'Policy status cannot move from % to %.', old.status, new.status using errcode = 'check_violation';
  end if;
  if new.status = 'active' and old.status <> 'active' then
    if new.activated_by is null or new.activated_by = new.created_by then
      raise exception 'Four-eyes approval is required: the policy author cannot activate it.' using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from noshashi.organization_members m
      where m.organization_id = new.organization_id and m.account_id = new.activated_by
        and m.role in ('owner', 'admin', 'compliance')
    ) then
      raise exception 'The activator is not an owner, admin or compliance member of this organization.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists org_policies_guard on noshashi.org_policies;
create trigger org_policies_guard before update on noshashi.org_policies
  for each row execute function noshashi.org_policies_guard();

-- Authorship is recorded on creation, in the audit log as well as the row.
create or replace function noshashi.audit_org_policy_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
  values (new.organization_id, new.created_by, 'policy.draft_created', 'policy',
          new.policy_id || '@' || new.version,
          jsonb_build_object('name', new.name, 'version', new.version, 'hash', new.hash, 'params', new.params));
  return new;
end;
$$;

drop trigger if exists org_policies_audit_insert on noshashi.org_policies;
create trigger org_policies_audit_insert after insert on noshashi.org_policies
  for each row execute function noshashi.audit_org_policy_insert();

alter table noshashi.org_policies enable row level security;

drop policy if exists org_policies_select_member on noshashi.org_policies;
create policy org_policies_select_member on noshashi.org_policies
  for select to authenticated
  using (noshashi.is_org_member(organization_id));

-- Drafts: owner, admin, compliance, risk and analyst may author and edit.
drop policy if exists org_policies_insert_draft on noshashi.org_policies;
create policy org_policies_insert_draft on noshashi.org_policies
  for insert to authenticated
  with check (
    status = 'draft'
    and created_by = (select auth.uid())
    and submitted_by is null and activated_by is null
    and noshashi.has_org_role(organization_id, array['owner','admin','compliance','risk','analyst']::noshashi.member_role[])
  );

drop policy if exists org_policies_update_draft on noshashi.org_policies;
create policy org_policies_update_draft on noshashi.org_policies
  for update to authenticated
  using (status = 'draft' and noshashi.has_org_role(organization_id, array['owner','admin','compliance','risk','analyst']::noshashi.member_role[]))
  with check (status = 'draft');

drop policy if exists org_policies_delete_draft on noshashi.org_policies;
create policy org_policies_delete_draft on noshashi.org_policies
  for delete to authenticated
  using (status = 'draft' and noshashi.has_org_role(organization_id, array['owner','admin','compliance','risk','analyst']::noshashi.member_role[]));

-- Column-level: a client can edit a draft's name, parameters and hash,
-- and nothing else. Status is never client-writable.
grant select, insert, delete on noshashi.org_policies to authenticated;
grant update (name, params, hash) on noshashi.org_policies to authenticated;
grant select, insert, update on noshashi.org_policies to service_role;

-- Submit a draft for activation (freezes it), or withdraw it back to draft.
create or replace function noshashi.submit_org_policy(p_org uuid, p_policy text, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  pol noshashi.org_policies;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not noshashi.has_org_role(p_org, array['owner','admin','compliance','risk','analyst']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  select * into pol from noshashi.org_policies
    where organization_id = p_org and policy_id = p_policy and version = p_version for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if pol.status <> 'draft' then
    return jsonb_build_object('ok', false, 'code', 'NOT_A_DRAFT', 'status', pol.status);
  end if;
  update noshashi.org_policies set status = 'pending', submitted_by = me, submitted_at = now()
    where organization_id = p_org and policy_id = p_policy and version = p_version;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values (p_org, me, 'policy.submitted', 'policy', p_policy || '@' || p_version,
            jsonb_build_object('hash', pol.hash, 'author', pol.created_by));
  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

create or replace function noshashi.withdraw_org_policy(p_org uuid, p_policy text, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  pol noshashi.org_policies;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  select * into pol from noshashi.org_policies
    where organization_id = p_org and policy_id = p_policy and version = p_version for update;
  if not found or not noshashi.is_org_member(p_org) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if pol.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'NOT_PENDING', 'status', pol.status);
  end if;
  if me <> pol.submitted_by and me <> pol.created_by
     and not noshashi.has_org_role(p_org, array['owner','admin','compliance']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  update noshashi.org_policies set status = 'draft', submitted_by = null, submitted_at = null
    where organization_id = p_org and policy_id = p_policy and version = p_version;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id)
    values (p_org, me, 'policy.withdrawn', 'policy', p_policy || '@' || p_version);
  return jsonb_build_object('ok', true, 'status', 'draft');
end;
$$;

revoke execute on function noshashi.submit_org_policy(uuid, text, integer) from public, anon;
revoke execute on function noshashi.withdraw_org_policy(uuid, text, integer) from public, anon;
grant execute on function noshashi.submit_org_policy(uuid, text, integer) to authenticated;
grant execute on function noshashi.withdraw_org_policy(uuid, text, integer) to authenticated;

-- Activation. One transaction; every check before any write; service_role
-- only, so it is reachable solely through noshashi-policy-activate, which
-- verifies the JWT, validates the parameters and recomputes the canonical
-- hash (p_verified_hash) before calling it.
create or replace function noshashi.activate_org_policy(
  p_org uuid, p_policy text, p_version integer, p_actor uuid, p_verified_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pol noshashi.org_policies;
  previous noshashi.org_policies;
begin
  if p_actor is null or not exists (select 1 from noshashi.accounts a where a.id = p_actor) then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not exists (select 1 from noshashi.organization_members m where m.organization_id = p_org and m.account_id = p_actor) then
    return jsonb_build_object('ok', false, 'code', 'NOT_A_MEMBER');
  end if;
  if not exists (
    select 1 from noshashi.organization_members m
    where m.organization_id = p_org and m.account_id = p_actor and m.role in ('owner', 'admin', 'compliance')
  ) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;

  select * into pol from noshashi.org_policies
    where organization_id = p_org and policy_id = p_policy and version = p_version for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if pol.status in ('active', 'archived') then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ACTIVE', 'status', pol.status);
  end if;
  if pol.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'NOT_SUBMITTED', 'status', pol.status);
  end if;
  if pol.created_by is null or not exists (select 1 from noshashi.accounts a where a.id = pol.created_by) then
    return jsonb_build_object('ok', false, 'code', 'AUTHOR_UNKNOWN');
  end if;
  if pol.created_by = p_actor then
    return jsonb_build_object('ok', false, 'code', 'FOUR_EYES_REQUIRED');
  end if;
  if p_verified_hash is null or p_verified_hash <> pol.hash then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'hash_mismatch');
  end if;

  select * into previous from noshashi.org_policies
    where organization_id = p_org and status = 'active' for update;
  if found then
    update noshashi.org_policies set status = 'archived', archived_at = now()
      where organization_id = previous.organization_id and policy_id = previous.policy_id and version = previous.version;
    insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state)
      values (p_org, p_actor, 'policy.archived', 'policy', previous.policy_id || '@' || previous.version,
              jsonb_build_object('hash', previous.hash, 'effective_at', previous.effective_at));
  end if;

  update noshashi.org_policies
    set status = 'active', activated_by = p_actor, effective_at = now()
    where organization_id = p_org and policy_id = p_policy and version = p_version;

  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state, new_state)
    values (p_org, p_actor, 'policy.activated', 'policy', p_policy || '@' || p_version,
            case when previous.policy_id is null then null
                 else jsonb_build_object('policy_id', previous.policy_id, 'version', previous.version, 'hash', previous.hash, 'params', previous.params) end,
            jsonb_build_object('version', p_version, 'hash', pol.hash, 'params', pol.params,
                               'author', pol.created_by, 'activated_by', p_actor));

  return jsonb_build_object('ok', true, 'status', 'active', 'policy_id', p_policy, 'version', p_version,
                            'hash', pol.hash, 'author', pol.created_by, 'activated_by', p_actor,
                            'archived_version', previous.version);
end;
$$;

revoke execute on function noshashi.activate_org_policy(uuid, text, integer, uuid, text) from public, anon, authenticated;
grant execute on function noshashi.activate_org_policy(uuid, text, integer, uuid, text) to service_role;

-- ── 2. Policy exceptions ─────────────────────────────────────────────
-- A person asks for a verdict's policy result to be excepted; a second,
-- authorized person decides. The verdict and its receipt never change:
-- the exception is a record beside them.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'exception_status' and typnamespace = 'noshashi'::regnamespace) then
    create type noshashi.exception_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

create table if not exists noshashi.policy_exceptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references noshashi.organizations(id) on delete restrict,
  subject         text not null check (length(subject) between 25 and 64),
  receipt_digest  text not null check (receipt_digest ~ '^[0-9A-F]{64}$'),
  verdict         text not null check (verdict in ('go', 'hold', 'no-go', 'insufficient-data')),
  policy_id       text,
  policy_version  integer,
  policy_hash     text check (policy_hash is null or policy_hash ~ '^[0-9A-F]{64}$'),
  case_id         text,
  reason          text not null check (length(trim(reason)) >= 10),
  evidence        jsonb not null check (jsonb_typeof(evidence) = 'object' and evidence <> '{}'::jsonb),
  status          noshashi.exception_status not null default 'pending',
  requested_by    uuid not null references noshashi.accounts(id) on delete restrict,
  requested_at    timestamptz not null default now(),
  decided_by      uuid references noshashi.accounts(id) on delete restrict,
  decided_at      timestamptz,
  decision_note   text,
  constraint policy_exceptions_four_eyes check (decided_by is null or decided_by <> requested_by),
  constraint policy_exceptions_decision_recorded check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status <> 'pending' and decided_by is not null and decided_at is not null)
  )
);

create index if not exists policy_exceptions_org_status_idx on noshashi.policy_exceptions (organization_id, status, requested_at desc);
create index if not exists policy_exceptions_receipt_idx on noshashi.policy_exceptions (receipt_digest);

create or replace function noshashi.policy_exceptions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'pending' then
    raise exception 'A decided exception is final.' using errcode = 'check_violation';
  end if;
  if (new.organization_id, new.subject, new.receipt_digest, new.verdict, new.policy_id, new.policy_version,
      new.policy_hash, new.case_id, new.reason, new.evidence, new.requested_by, new.requested_at)
     is distinct from
     (old.organization_id, old.subject, old.receipt_digest, old.verdict, old.policy_id, old.policy_version,
      old.policy_hash, old.case_id, old.reason, old.evidence, old.requested_by, old.requested_at) then
    raise exception 'An exception request never changes after it is made.' using errcode = 'check_violation';
  end if;
  if new.status = 'approved' and not exists (
    select 1 from noshashi.organization_members m
    where m.organization_id = new.organization_id and m.account_id = new.decided_by
      and m.role in ('owner', 'admin', 'compliance')
  ) then
    raise exception 'The approver is not an owner, admin or compliance member of this organization.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists policy_exceptions_guard on noshashi.policy_exceptions;
create trigger policy_exceptions_guard before update on noshashi.policy_exceptions
  for each row execute function noshashi.policy_exceptions_guard();

create or replace function noshashi.audit_policy_exception_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
  values (new.organization_id, new.requested_by, 'exception.requested', 'policy_exception', new.id::text,
          jsonb_build_object('receipt_digest', new.receipt_digest, 'verdict', new.verdict,
                             'policy_id', new.policy_id, 'policy_version', new.policy_version,
                             'policy_hash', new.policy_hash, 'reason', new.reason));
  return new;
end;
$$;

drop trigger if exists policy_exceptions_audit_insert on noshashi.policy_exceptions;
create trigger policy_exceptions_audit_insert after insert on noshashi.policy_exceptions
  for each row execute function noshashi.audit_policy_exception_insert();

alter table noshashi.policy_exceptions enable row level security;

drop policy if exists policy_exceptions_select_member on noshashi.policy_exceptions;
create policy policy_exceptions_select_member on noshashi.policy_exceptions
  for select to authenticated
  using (noshashi.is_org_member(organization_id));

drop policy if exists policy_exceptions_insert_request on noshashi.policy_exceptions;
create policy policy_exceptions_insert_request on noshashi.policy_exceptions
  for insert to authenticated
  with check (
    status = 'pending'
    and requested_by = (select auth.uid())
    and decided_by is null
    and noshashi.has_org_role(organization_id, array['owner','admin','compliance','risk','analyst']::noshashi.member_role[])
  );

-- Requests are inserted by members; decisions are made only by the
-- service role through decide_policy_exception. No client UPDATE/DELETE.
grant select, insert on noshashi.policy_exceptions to authenticated;
grant select, update on noshashi.policy_exceptions to service_role;

create or replace function noshashi.decide_policy_exception(
  p_exception uuid, p_actor uuid, p_approve boolean, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  exc noshashi.policy_exceptions;
  outcome noshashi.exception_status := case when p_approve then 'approved' else 'rejected' end;
begin
  if p_actor is null or not exists (select 1 from noshashi.accounts a where a.id = p_actor) then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  select * into exc from noshashi.policy_exceptions where id = p_exception for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if not exists (select 1 from noshashi.organization_members m where m.organization_id = exc.organization_id and m.account_id = p_actor) then
    -- Not found, not "forbidden": a non-member learns nothing about another organization's exceptions.
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if not exists (
    select 1 from noshashi.organization_members m
    where m.organization_id = exc.organization_id and m.account_id = p_actor and m.role in ('owner', 'admin', 'compliance')
  ) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if exc.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_DECIDED', 'status', exc.status);
  end if;
  if exc.evidence is null or exc.evidence = '{}'::jsonb or exc.receipt_digest is null then
    return jsonb_build_object('ok', false, 'code', 'EVIDENCE_REQUIRED');
  end if;
  if exc.requested_by = p_actor then
    return jsonb_build_object('ok', false, 'code', 'FOUR_EYES_REQUIRED');
  end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 10 then
    return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED');
  end if;

  update noshashi.policy_exceptions
    set status = outcome, decided_by = p_actor, decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_exception;

  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state, new_state)
    values (exc.organization_id, p_actor, 'exception.' || outcome::text, 'policy_exception', p_exception::text,
            jsonb_build_object('status', 'pending'),
            jsonb_build_object('status', outcome, 'requested_by', exc.requested_by, 'decided_by', p_actor,
                               'receipt_digest', exc.receipt_digest, 'policy_id', exc.policy_id,
                               'policy_version', exc.policy_version, 'policy_hash', exc.policy_hash,
                               'note', nullif(trim(coalesce(p_note, '')), '')));

  return jsonb_build_object('ok', true, 'status', outcome, 'requested_by', exc.requested_by, 'decided_by', p_actor);
end;
$$;

revoke execute on function noshashi.decide_policy_exception(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function noshashi.decide_policy_exception(uuid, uuid, boolean, text) to service_role;

-- ── 3. Creating an organization, adding members ──────────────────────
-- The roster policies cannot authorise an organization's first member
-- (there is no membership yet to check), so the first owner is created
-- here, as the caller. Membership changes are already audited by the
-- existing audit_membership_change trigger.

create or replace function noshashi.create_organization(p_name text, p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  org uuid;
begin
  if me is null or not exists (select 1 from noshashi.accounts a where a.id = me) then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 or coalesce(p_slug, '') !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  end if;
  if exists (select 1 from noshashi.organizations o where o.slug = p_slug) then
    return jsonb_build_object('ok', false, 'code', 'SLUG_TAKEN');
  end if;
  insert into noshashi.organizations (name, slug) values (trim(p_name), p_slug) returning id into org;
  insert into noshashi.organization_members (organization_id, account_id, role, invited_by)
    values (org, me, 'owner', me);
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values (org, me, 'organization.created', 'organization', org::text, jsonb_build_object('name', trim(p_name), 'slug', p_slug));
  return jsonb_build_object('ok', true, 'organization_id', org);
end;
$$;

create or replace function noshashi.add_org_member_by_email(p_org uuid, p_email text, p_role noshashi.member_role)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target uuid;
  current_role_of_target noshashi.member_role;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not noshashi.has_org_role(p_org, array['owner', 'admin']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if p_role = 'owner' and not noshashi.has_org_role(p_org, array['owner']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  select a.id into target from noshashi.accounts a where lower(a.email) = lower(trim(p_email));
  if target is null then
    -- The account must exist: the person signs up first.
    return jsonb_build_object('ok', false, 'code', 'NO_SUCH_ACCOUNT');
  end if;
  select m.role into current_role_of_target from noshashi.organization_members m
    where m.organization_id = p_org and m.account_id = target;
  -- Only an owner changes an owner's role, and the last owner cannot be demoted.
  if current_role_of_target = 'owner' and p_role <> 'owner' then
    if not noshashi.has_org_role(p_org, array['owner']::noshashi.member_role[]) then
      return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
    end if;
    if (select count(*) from noshashi.organization_members m where m.organization_id = p_org and m.role = 'owner') <= 1 then
      return jsonb_build_object('ok', false, 'code', 'LAST_OWNER');
    end if;
  end if;
  insert into noshashi.organization_members (organization_id, account_id, role, invited_by)
    values (p_org, target, p_role, me)
    on conflict (organization_id, account_id) do update set role = excluded.role;
  return jsonb_build_object('ok', true, 'account_id', target, 'role', p_role);
end;
$$;

revoke execute on function noshashi.create_organization(text, text) from public, anon;
revoke execute on function noshashi.add_org_member_by_email(uuid, text, noshashi.member_role) from public, anon;
grant execute on function noshashi.create_organization(text, text) to authenticated;
grant execute on function noshashi.add_org_member_by_email(uuid, text, noshashi.member_role) to authenticated;

-- Members may read the email and display name of people in their own
-- organizations (needed to show AUTHOR / ACTIVATED BY). Nothing else.
create or replace function noshashi.org_member_directory(p_org uuid)
returns table (account_id uuid, email text, display_name text, role noshashi.member_role)
language sql
stable
security definer
set search_path = ''
as $$
  select m.account_id, a.email, a.display_name, m.role
  from noshashi.organization_members m
  join noshashi.accounts a on a.id = m.account_id
  where m.organization_id = p_org and noshashi.is_org_member(p_org);
$$;

revoke execute on function noshashi.org_member_directory(uuid) from public, anon;
grant execute on function noshashi.org_member_directory(uuid) to authenticated;
