-- Shared investigations for an organization.
--
-- The same append-only, hash-chained case log the workstation keeps
-- (src/lib/desk/investigations.ts), held by the server so every member
-- sees one record. Additive only: two new tables and two functions.
--
-- Each event is stored as the exact canonical JSON the client hashed
-- (`body`) together with its SHA-256 (`hash`). On every append the server:
--   · recomputes SHA-256 over `body` and refuses a mismatch;
--   · requires `seq` to be the next number and `prev` to be the previous
--     event's hash ("GENESIS" for the first), so the chain has no gaps;
--   · requires `actor` to be the caller's own account id — nobody writes
--     under another person's name;
--   · requires `at` to be within five minutes of the server clock;
--   · enforces the case rules: a closed case takes only a reopen, closing
--     needs a written rationale, and closing as "exception approved"
--     needs an exception that a second authorized person has APPROVED
--     (noshashi.policy_exceptions, four-eyes).
-- Nothing can update or delete an event, not even the service role. Any
-- client can re-verify the whole chain from `body` and `hash` alone.

create table if not exists noshashi.org_cases (
  id              text primary key check (id ~ '^case-[a-z0-9-]{4,80}$'),
  organization_id uuid not null references noshashi.organizations(id) on delete restrict,
  title           text not null check (length(trim(title)) between 1 and 160),
  subject         text not null check (length(subject) between 25 and 64),
  created_by      uuid not null references noshashi.accounts(id) on delete restrict,
  created_at      timestamptz not null default now()
);

create index if not exists org_cases_org_idx on noshashi.org_cases (organization_id, created_at desc);

create table if not exists noshashi.org_case_events (
  case_id         text not null references noshashi.org_cases(id) on delete restrict,
  seq             integer not null check (seq >= 0),
  organization_id uuid not null references noshashi.organizations(id) on delete restrict,
  kind            text not null check (kind in ('opened', 'note', 'status', 'priority', 'linked', 'assigned', 'closed', 'reopened')),
  actor           uuid not null references noshashi.accounts(id) on delete restrict,
  at              timestamptz not null,
  prev            text not null check (prev = 'GENESIS' or prev ~ '^[0-9A-F]{64}$'),
  hash            text not null check (hash ~ '^[0-9A-F]{64}$'),
  body            text not null,
  recorded_at     timestamptz not null default now(),
  primary key (case_id, seq)
);

create index if not exists org_case_events_org_idx on noshashi.org_case_events (organization_id, recorded_at desc);

comment on table noshashi.org_case_events is
  'Append-only, hash-chained case log. hash = SHA-256(body); body is the canonical JSON of the event including seq and prev.';

-- Append-only, for every role.
create or replace function noshashi.org_case_events_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Case events are append-only.' using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists org_case_events_no_update on noshashi.org_case_events;
create trigger org_case_events_no_update before update or delete on noshashi.org_case_events
  for each row execute function noshashi.org_case_events_immutable();
drop trigger if exists org_case_events_no_truncate on noshashi.org_case_events;
create trigger org_case_events_no_truncate before truncate on noshashi.org_case_events
  for each statement execute function noshashi.org_case_events_immutable();

create or replace function noshashi.org_cases_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A case record never changes; its history is its event log.' using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists org_cases_no_update on noshashi.org_cases;
create trigger org_cases_no_update before update or delete on noshashi.org_cases
  for each row execute function noshashi.org_cases_immutable();

alter table noshashi.org_cases enable row level security;
alter table noshashi.org_case_events enable row level security;

drop policy if exists org_cases_select_member on noshashi.org_cases;
create policy org_cases_select_member on noshashi.org_cases
  for select to authenticated using (noshashi.is_org_member(organization_id));

drop policy if exists org_case_events_select_member on noshashi.org_case_events;
create policy org_case_events_select_member on noshashi.org_case_events
  for select to authenticated using (noshashi.is_org_member(organization_id));

-- Reads only. Every write goes through the two functions below.
revoke all on noshashi.org_cases, noshashi.org_case_events from anon, authenticated;
grant select on noshashi.org_cases, noshashi.org_case_events to authenticated;
grant select on noshashi.org_cases, noshashi.org_case_events to service_role;

-- The checks shared by opening and appending. Returns null when the event
-- may be written, otherwise the refusal code.
create or replace function noshashi.org_case_event_refusal(
  p_org uuid, p_case text, p_body text, p_hash text, p_expect_seq integer, p_expect_prev text, p_closed boolean
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  b jsonb;
  k text;
  at_ts timestamptz;
begin
  begin
    b := p_body::jsonb;
  exception when others then
    return 'MALFORMED';
  end;
  if jsonb_typeof(b) <> 'object' then return 'MALFORMED'; end if;
  if upper(encode(sha256(convert_to(p_body, 'UTF8')), 'hex')) <> coalesce(p_hash, '') then
    return 'HASH_MISMATCH';
  end if;
  if (b->>'seq') is distinct from p_expect_seq::text or (b->>'prev') is distinct from p_expect_prev then
    return 'CONFLICT';
  end if;
  if (b->>'actor') is distinct from (select auth.uid())::text then
    return 'ACTOR_MISMATCH';
  end if;
  begin
    at_ts := (b->>'at')::timestamptz;
  exception when others then
    return 'MALFORMED';
  end;
  if at_ts is null or abs(extract(epoch from (at_ts - now()))) > 300 then
    return 'CLOCK_SKEW';
  end if;

  k := b->>'kind';
  if k is null or k not in ('opened', 'note', 'status', 'priority', 'linked', 'assigned', 'closed', 'reopened') then
    return 'MALFORMED';
  end if;
  if (k = 'opened') <> (p_expect_seq = 0) then return 'MALFORMED'; end if;
  if p_closed and k <> 'reopened' then return 'CASE_CLOSED'; end if;
  if k = 'reopened' and not p_closed then return 'NOT_CLOSED'; end if;
  if k in ('closed', 'reopened') and length(trim(coalesce(b->>'text', ''))) < 10 then
    return 'RATIONALE_REQUIRED';
  end if;
  if k = 'note' and length(trim(coalesce(b->>'text', ''))) = 0 then return 'MALFORMED'; end if;
  if k = 'closed' then
    if coalesce(b->>'outcome', '') not in ('cleared', 'exception-approved', 'blocked', 'reported', 'no-action') then
      return 'MALFORMED';
    end if;
    if b->>'outcome' = 'exception-approved' and not exists (
      select 1 from noshashi.policy_exceptions x
      where x.id::text = b->>'exceptionId' and x.organization_id = p_org and x.status = 'approved'
    ) then
      return 'EXCEPTION_NOT_APPROVED';
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function noshashi.org_case_event_refusal(uuid, text, text, text, integer, text, boolean) from public, anon, authenticated;

create or replace function noshashi.open_org_case(
  p_org uuid, p_case text, p_title text, p_subject text, p_body text, p_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  refusal text;
  b jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.has_org_role(p_org, array['owner','admin','compliance','risk','analyst']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if exists (select 1 from noshashi.org_cases c where c.id = p_case) then
    return jsonb_build_object('ok', false, 'code', 'CONFLICT');
  end if;
  refusal := noshashi.org_case_event_refusal(p_org, p_case, p_body, p_hash, 0, 'GENESIS', false);
  if refusal is not null then return jsonb_build_object('ok', false, 'code', refusal); end if;
  b := p_body::jsonb;

  insert into noshashi.org_cases (id, organization_id, title, subject, created_by)
    values (p_case, p_org, trim(p_title), p_subject, me);
  insert into noshashi.org_case_events (case_id, seq, organization_id, kind, actor, at, prev, hash, body)
    values (p_case, 0, p_org, 'opened', me, (b->>'at')::timestamptz, 'GENESIS', p_hash, p_body);
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values (p_org, me, 'case.opened', 'case', p_case, jsonb_build_object('title', trim(p_title), 'subject', p_subject, 'hash', p_hash));
  return jsonb_build_object('ok', true, 'case_id', p_case, 'hash', p_hash);
end;
$$;

create or replace function noshashi.append_org_case_event(p_case text, p_body text, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  org uuid;
  last_seq integer;
  last_hash text;
  closed boolean;
  refusal text;
  b jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  select c.organization_id into org from noshashi.org_cases c where c.id = p_case for update;
  if org is null or not noshashi.is_org_member(org) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if not noshashi.has_org_role(org, array['owner','admin','compliance','risk','analyst']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  select e.seq, e.hash into last_seq, last_hash from noshashi.org_case_events e
    where e.case_id = p_case order by e.seq desc limit 1;
  select coalesce((select e.kind = 'closed' from noshashi.org_case_events e
                   where e.case_id = p_case and e.kind in ('closed', 'reopened')
                   order by e.seq desc limit 1), false) into closed;

  refusal := noshashi.org_case_event_refusal(org, p_case, p_body, p_hash, last_seq + 1, last_hash, closed);
  if refusal is not null then return jsonb_build_object('ok', false, 'code', refusal); end if;
  b := p_body::jsonb;

  insert into noshashi.org_case_events (case_id, seq, organization_id, kind, actor, at, prev, hash, body)
    values (p_case, last_seq + 1, org, b->>'kind', me, (b->>'at')::timestamptz, last_hash, p_hash, p_body);
  if b->>'kind' in ('closed', 'reopened') then
    insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
      values (org, me, 'case.' || (b->>'kind'), 'case', p_case,
              jsonb_build_object('outcome', b->>'outcome', 'exception_id', b->>'exceptionId', 'hash', p_hash));
  end if;
  return jsonb_build_object('ok', true, 'seq', last_seq + 1, 'hash', p_hash);
end;
$$;

revoke execute on function noshashi.open_org_case(uuid, text, text, text, text, text) from public, anon;
revoke execute on function noshashi.append_org_case_event(text, text, text) from public, anon;
grant execute on function noshashi.open_org_case(uuid, text, text, text, text, text) to authenticated;
grant execute on function noshashi.append_org_case_event(text, text, text) to authenticated;
