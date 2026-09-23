# Plan: organisation-level policies, cases and roles

Status: **PROPOSAL — nothing here has been applied.** Review, then approve applying it.

## What already exists (read from the live project, `xiurbiwuwcfowqnpmwki`)

Migration `organizations_roles_audit` is applied. All of these tables are empty:

- `noshashi.organizations`: id, name, slug.
- `noshashi.organization_members`: org, account, role. The roles are an enum: `owner, admin, analyst, compliance, risk, viewer, api`.
- `noshashi.is_org_member(org)` and `noshashi.has_org_role(org, roles[])`: SECURITY DEFINER predicates with a pinned search_path.
- `noshashi.audit_log`: append-only. UPDATE, DELETE and TRUNCATE are revoked from every role, and a trigger refuses them as well.
- A nullable `organization_id` column on entitlements, api_keys, verification_events, receipts, portfolios and alerts.

The app does not read any of these yet. Policies (`engine.policies`) and cases (`desk.investigations`) live on the workstation.

**Gap found while planning.** `receipts.verdict` and `verification_events.verdict` only allow `go`, `hold` and `no-go`. The engine also issues `insufficient-data`, and storing such a verdict would be refused. Step 1 below widens both checks. Widening is permissive: no existing row changes.

## What this adds

### 1. Organisation policies: `noshashi.org_policies`

The same model as the app's policy store (`src/lib/desk/institutional.ts`), shared across an organisation.

| column | notes |
|---|---|
| `organization_id` | FK to organizations, `on delete restrict` (a policy that decided verdicts is evidence) |
| `policy_id`, `name`, `version` | unique `(organization_id, policy_id, version)` |
| `status` | `draft` / `active` / `archived` |
| `params` | jsonb, validated server-side |
| `hash` | SHA-256 of the canonical form, recomputed server-side on every write |
| `created_by`, `activated_by`, `effective_at`, `archived_at` | |

- **One active policy per organisation.** A partial unique index on `(organization_id) where status = 'active'` enforces it.
- **Only drafts change.** A trigger refuses any change to `params`, `name`, `version` or `hash` once a row is not a draft. It also refuses every status change except draft → active → archived.
- **Clients cannot activate.** `authenticated` gets column-level UPDATE on `(name, params, updated_at)` only. `status` is never client-writable.

### 2. Activation: edge function `noshashi-policy`

All activation goes through this function, under the service role.

- **Who:** checks the caller's role with `has_org_role(org, {owner, admin, compliance})`.
- **Validation:** re-runs `validateParams` and recomputes the canonical hash.
  - This logic is kept byte-identical to `src/lib/desk/institutional.ts` by a parity test, the same pattern as `authority-digest-runtimes.test.ts` does for authority digests.
- **Change:** archives the previous active version and activates the draft, in one transaction.
- **Audit:** writes an `audit_log` row with action `policy.activated`, the changes, the old and new version, and the hash.
- **Optional four-eyes rule** (a per-organisation flag, off by default): the person who activates must not be the draft's author.

### 3. Shared investigations

- `noshashi.investigations`: id, organization_id, subject, title, created_by, created_at.
- `noshashi.investigation_events`: `(case_id, seq)` primary key, plus actor, kind, payload jsonb, prev and hash. This is the same hash-chained log as `src/lib/desk/investigations.ts`.
  - **Append-only**, enforced two ways, as on `audit_log`: UPDATE and DELETE are revoked, and a trigger refuses them.
  - **Chain linkage in the database:** an insert trigger requires `seq = previous seq + 1` and `prev = the previous row's hash`, so two writers cannot fork a case.
  - **Hash recomputation** stays in the client and the export. Postgres's jsonb key order is not the canonical order.

### 4. Receipts name their policy

Add nullable `policy_id`, `policy_version` and `policy_hash` columns to `receipts` and `verification_events`. They are written when a verdict was decided under an organisation policy. Older rows stay null. Receipt digests already bind the policy (PR #19), so these columns only make it queryable.

### 5. Creating an organisation: edge function `noshashi-org`

Creating an organisation and its first owner must run under the service role, because the roster policies cannot authorise the first row: there is no membership yet to check against. This function also:

- invites a member by email (the account must exist);
- changes a member's role (owner or admin only; the last owner cannot be demoted);
- writes every change to `audit_log`.

## Who can do what

| action | owner | admin | compliance | risk | analyst | viewer | api |
|---|---|---|---|---|---|---|---|
| read policies, cases, verdicts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| edit a policy draft | ✓ | ✓ | ✓ | ✓ | — | — | — |
| **activate a policy** | ✓ | ✓ | ✓ | — | — | — | — |
| open a case, add notes, link verdicts | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| close a case as cleared / blocked / reported / no action | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| **close a case as an approved exception** | ✓ | ✓ | ✓ | — | — | — | — |
| manage members and roles | ✓ | ✓ | — | — | — | — | — |
| read the audit log | ✓ | ✓ | ✓ | ✓ | — | — | — |
| run verifications through the API | — | — | — | — | — | — | ✓ (key scope) |

These are proposals: change any cell before approving. The two rows in bold are the consequential ones.

## App changes that follow (after the SQL is applied)

- **Organisation switcher:** shown when the signed-in account belongs to one or more organisations.
- **Policy store:** reads and writes `org_policies` for the selected organisation, and activation calls `noshashi-policy`.
  - Signed out, or with no organisation, the store stays on this device, exactly as today.
- **Cases:** sync to `investigations` / `investigation_events` for the selected organisation. Local cases can be pushed up once.
- **Buttons follow the table above.** A disabled button always says which role it needs.
- **Isolation:** no organisation's policy is ever applied to another's verdicts, because every read is scoped by `organization_id` and enforced by RLS.

## Rollout

1. Apply the migration (tables, triggers, grants, RLS, and the two widened verdict checks). Every new table starts empty and nothing reads it yet, so the app is unaffected.
2. Deploy `noshashi-org` and `noshashi-policy`, with their tests.
3. Ship the app changes behind "belongs to an organisation", so single users see no change.
4. Check it: two test accounts in two organisations, confirming neither can read the other's policies or cases, and that the roles above hold in practice. This uses the Supabase advisors and SQL run as each role.

## Tested locally (not on your project)

The draft SQL was applied to a throwaway local Postgres 16. That database held stub tables mirroring the live columns, plus the repo's own `organizations_roles_audit` migration. The draft applied cleanly and re-applied with no changes. Each case below was run as a real role (`authenticated` with a set `auth.uid()`, or `service_role`):

| # | as | action | result |
|---|---|---|---|
| 1 | analyst | create a policy draft | refused (RLS) |
| 2 | compliance | create a policy draft | ok |
| 3 | compliance | set status to active directly | refused (no column grant) |
| 4 | compliance | edit draft params | ok |
| 5 | service | activate | ok |
| 6 | service | edit an active policy's params | refused ("Only a draft policy can be changed") |
| 7 | service | a second active policy in the same organisation | refused (unique index) |
| 8 | service | active → draft | refused (status guard) |
| 9 | owner of another org | read these policies | 0 rows |
| 10 | analyst | read own org's policies | 1 row |
| 11 | analyst | open a case plus its first event | ok |
| 12 | analyst | an event with the wrong `prev` | refused ("does not extend the chain") |
| 13 | analyst | an event posing as another actor | refused (RLS) |
| 14 | analyst | close as an approved exception | refused (RLS) |
| 15 | compliance | close as an approved exception | ok |
| 16 | service | edit a case event | refused (grant revoked) |
| 17 | compliance | delete a case event | refused (grant revoked) |
| 18 | owner of another org | read these cases and events | 0 / 0 |
| 19 | service | store an `insufficient-data` receipt | ok; an unknown verdict is still refused |
| 20 | superuser | edit a case event | refused by trigger |

## Draft SQL for step 1 (not applied)

```sql
-- Verdict checks: admit insufficient-data (permissive; no row rewritten).
alter table noshashi.receipts drop constraint if exists receipts_verdict_check;
alter table noshashi.receipts add constraint receipts_verdict_check
  check (verdict in ('go', 'hold', 'no-go', 'insufficient-data'));
alter table noshashi.verification_events drop constraint if exists verification_events_verdict_check;
alter table noshashi.verification_events add constraint verification_events_verdict_check
  check (verdict in ('go', 'hold', 'no-go', 'insufficient-data'));

-- Organisation policies.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'policy_status' and typnamespace = 'noshashi'::regnamespace) then
    create type noshashi.policy_status as enum ('draft', 'active', 'archived');
  end if;
end $$;

create table if not exists noshashi.org_policies (
  organization_id uuid not null references noshashi.organizations(id) on delete restrict,
  policy_id       text not null check (policy_id ~ '^[a-z0-9_]{3,64}$'),
  version         integer not null check (version > 0),
  name            text not null check (length(trim(name)) between 1 and 60),
  status          noshashi.policy_status not null default 'draft',
  params          jsonb not null,
  hash            text not null check (hash ~ '^[0-9A-F]{64}$'),
  created_by      uuid references noshashi.accounts(id) on delete set null,
  activated_by    uuid references noshashi.accounts(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  effective_at    timestamptz,
  archived_at     timestamptz,
  primary key (organization_id, policy_id, version)
);
create unique index if not exists org_policies_one_active
  on noshashi.org_policies (organization_id) where status = 'active';

create or replace function noshashi.org_policies_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and (new.params is distinct from old.params or new.name is distinct from old.name
      or new.version is distinct from old.version or new.hash is distinct from old.hash) then
    raise exception 'Only a draft policy can be changed.' using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status and not (
      (old.status = 'draft' and new.status = 'active') or (old.status = 'active' and new.status = 'archived')) then
    raise exception 'Policy status can only move draft → active → archived.' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists org_policies_guard on noshashi.org_policies;
create trigger org_policies_guard before update on noshashi.org_policies
  for each row execute function noshashi.org_policies_guard();

alter table noshashi.org_policies enable row level security;
drop policy if exists org_policies_select on noshashi.org_policies;
create policy org_policies_select on noshashi.org_policies for select to authenticated
  using (noshashi.has_org_role(organization_id, array['owner','admin','compliance','risk','analyst','viewer']::noshashi.member_role[]));
drop policy if exists org_policies_insert_draft on noshashi.org_policies;
create policy org_policies_insert_draft on noshashi.org_policies for insert to authenticated
  with check (status = 'draft' and noshashi.has_org_role(organization_id, array['owner','admin','compliance','risk']::noshashi.member_role[]));
drop policy if exists org_policies_update_draft on noshashi.org_policies;
create policy org_policies_update_draft on noshashi.org_policies for update to authenticated
  using (status = 'draft' and noshashi.has_org_role(organization_id, array['owner','admin','compliance','risk']::noshashi.member_role[]))
  with check (status = 'draft');
drop policy if exists org_policies_delete_draft on noshashi.org_policies;
create policy org_policies_delete_draft on noshashi.org_policies for delete to authenticated
  using (status = 'draft' and noshashi.has_org_role(organization_id, array['owner','admin','compliance','risk']::noshashi.member_role[]));

grant select, insert, delete on noshashi.org_policies to authenticated;
grant update (name, params, hash) on noshashi.org_policies to authenticated;  -- never status
grant select, insert, update on noshashi.org_policies to service_role;

-- Shared investigations (append-only, hash-chained).
create table if not exists noshashi.investigations (
  id              text primary key,
  organization_id uuid not null references noshashi.organizations(id) on delete restrict,
  subject         text not null,
  title           text not null check (length(trim(title)) between 1 and 120),
  created_by      uuid references noshashi.accounts(id) on delete set null,
  created_at      timestamptz not null default now()
);
create table if not exists noshashi.investigation_events (
  case_id    text not null references noshashi.investigations(id) on delete restrict,
  seq        integer not null check (seq >= 0),
  actor      uuid references noshashi.accounts(id) on delete set null,
  kind       text not null check (kind in ('opened','note','status','priority','linked','assigned','closed','reopened')),
  payload    jsonb not null,
  prev       text not null,
  hash       text not null check (hash ~ '^[0-9A-F]{64}$'),
  at         timestamptz not null default now(),
  primary key (case_id, seq)
);

create or replace function noshashi.investigation_events_chain()
returns trigger language plpgsql set search_path = '' as $$
declare last_seq integer; last_hash text;
begin
  select e.seq, e.hash into last_seq, last_hash from noshashi.investigation_events e
    where e.case_id = new.case_id order by e.seq desc limit 1;
  if (last_seq is null and (new.seq <> 0 or new.prev <> 'GENESIS'))
     or (last_seq is not null and (new.seq <> last_seq + 1 or new.prev <> last_hash)) then
    raise exception 'Case event does not extend the chain.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists investigation_events_chain on noshashi.investigation_events;
create trigger investigation_events_chain before insert on noshashi.investigation_events
  for each row execute function noshashi.investigation_events_chain();
create or replace function noshashi.investigation_events_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'noshashi.investigation_events is append-only: % is refused. Record a correction as a new event.', tg_op
    using errcode = 'insufficient_privilege';
end $$;
drop trigger if exists investigation_events_no_mutation on noshashi.investigation_events;
create trigger investigation_events_no_mutation before update or delete on noshashi.investigation_events
  for each row execute function noshashi.investigation_events_append_only();

alter table noshashi.investigations enable row level security;
alter table noshashi.investigation_events enable row level security;
drop policy if exists investigations_select on noshashi.investigations;
create policy investigations_select on noshashi.investigations for select to authenticated
  using (noshashi.is_org_member(organization_id));
drop policy if exists investigations_insert on noshashi.investigations;
create policy investigations_insert on noshashi.investigations for insert to authenticated
  with check (noshashi.has_org_role(organization_id, array['owner','admin','compliance','risk','analyst']::noshashi.member_role[]));
drop policy if exists investigation_events_select on noshashi.investigation_events;
create policy investigation_events_select on noshashi.investigation_events for select to authenticated
  using (exists (select 1 from noshashi.investigations i where i.id = case_id and noshashi.is_org_member(i.organization_id)));
drop policy if exists investigation_events_insert on noshashi.investigation_events;
create policy investigation_events_insert on noshashi.investigation_events for insert to authenticated
  with check (
    actor = (select auth.uid())
    and exists (select 1 from noshashi.investigations i where i.id = case_id and
      case when kind = 'closed' and payload->>'outcome' = 'exception-approved'
           then noshashi.has_org_role(i.organization_id, array['owner','admin','compliance']::noshashi.member_role[])
           else noshashi.has_org_role(i.organization_id, array['owner','admin','compliance','risk','analyst']::noshashi.member_role[]) end));

grant select, insert on noshashi.investigations to authenticated;
grant select, insert on noshashi.investigation_events to authenticated;
revoke update, delete, truncate on noshashi.investigation_events from anon, authenticated, service_role;

-- Receipts name their policy.
alter table noshashi.receipts            add column if not exists policy_id text, add column if not exists policy_version integer, add column if not exists policy_hash text;
alter table noshashi.verification_events add column if not exists policy_id text, add column if not exists policy_version integer, add column if not exists policy_hash text;
```
