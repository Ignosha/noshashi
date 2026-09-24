-- Human review: "request more evidence".
--
-- A reviewer who can decide an exception (owner, admin, compliance, and
-- never its requester) may, instead of approving or rejecting it, ask for
-- more evidence. The exception moves to `needs_evidence`; its original
-- request and evidence stay sealed exactly as the guard already requires.
-- The requester answers with a supplement, an append-only record beside
-- the exception, and the exception returns to `pending` for a decision.
--
-- Nothing is ever edited: the original evidence, every request and every
-- supplement are separate rows, each written once, and each step is an
-- audit event (and so a webhook event).

alter type noshashi.exception_status add value if not exists 'needs_evidence';

-- A request for evidence is not a decision: decided_by stays empty until
-- someone approves or rejects. Compared as text so this migration does not
-- use the new enum value in the same transaction that adds it.
alter table noshashi.policy_exceptions drop constraint if exists policy_exceptions_decision_recorded;
alter table noshashi.policy_exceptions add constraint policy_exceptions_decision_recorded check (
  (status::text in ('pending', 'needs_evidence') and decided_by is null and decided_at is null)
  or (status::text in ('approved', 'rejected') and decided_by is not null and decided_at is not null)
);

create or replace function noshashi.policy_exceptions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status::text not in ('pending', 'needs_evidence') then
    raise exception 'A decided exception is final.' using errcode = 'check_violation';
  end if;
  if (new.organization_id, new.subject, new.receipt_digest, new.verdict, new.policy_id, new.policy_version,
      new.policy_hash, new.case_id, new.reason, new.evidence, new.requested_by, new.requested_at)
     is distinct from
     (old.organization_id, old.subject, old.receipt_digest, old.verdict, old.policy_id, old.policy_version,
      old.policy_hash, old.case_id, old.reason, old.evidence, old.requested_by, old.requested_at) then
    raise exception 'An exception request never changes after it is made.' using errcode = 'check_violation';
  end if;
  -- Decisions are made only from pending: an exception waiting on evidence
  -- has to receive it first.
  if new.status::text in ('approved', 'rejected') and old.status::text <> 'pending' then
    raise exception 'An exception awaiting evidence cannot be decided until the evidence is added.' using errcode = 'check_violation';
  end if;
  if new.status::text = 'approved' and not exists (
    select 1 from noshashi.organization_members m
    where m.organization_id = new.organization_id and m.account_id = new.decided_by
      and m.role in ('owner', 'admin', 'compliance')
  ) then
    raise exception 'The approver is not an owner, admin or compliance member of this organization.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- The review thread: evidence requests and the supplements that answer them.
create table if not exists noshashi.policy_exception_notes (
  id           uuid primary key default gen_random_uuid(),
  exception_id uuid not null references noshashi.policy_exceptions(id) on delete restrict,
  kind         text not null check (kind in ('evidence_requested', 'evidence_added')),
  author       uuid not null references noshashi.accounts(id) on delete restrict,
  note         text not null check (length(trim(note)) >= 10 and length(note) <= 4000),
  -- A supplement's evidence: what was added, as structured data (links,
  -- ledger references, document digests). Absent on a request.
  evidence     jsonb check (evidence is null or (jsonb_typeof(evidence) = 'object' and evidence <> '{}'::jsonb)),
  created_at   timestamptz not null default now(),
  constraint policy_exception_notes_shape check (
    (kind = 'evidence_requested' and evidence is null) or (kind = 'evidence_added' and evidence is not null)
  )
);

create index if not exists policy_exception_notes_exception_idx on noshashi.policy_exception_notes (exception_id, created_at);

create or replace function noshashi.policy_exception_notes_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The review thread is append-only.' using errcode = 'check_violation';
end;
$$;

drop trigger if exists policy_exception_notes_immutable on noshashi.policy_exception_notes;
create trigger policy_exception_notes_immutable before update or delete on noshashi.policy_exception_notes
  for each row execute function noshashi.policy_exception_notes_immutable();

alter table noshashi.policy_exception_notes enable row level security;

drop policy if exists policy_exception_notes_select_member on noshashi.policy_exception_notes;
create policy policy_exception_notes_select_member on noshashi.policy_exception_notes
  for select to authenticated
  using (exists (
    select 1 from noshashi.policy_exceptions x
    where x.id = exception_id and noshashi.is_org_member(x.organization_id)
  ));

-- Rows are written only by the two functions below.
grant select on noshashi.policy_exception_notes to authenticated;
grant select, insert on noshashi.policy_exception_notes to service_role;

-- A reviewer asks for more evidence. Service role only, through
-- noshashi-exception-decide, which identifies the caller from their JWT.
create or replace function noshashi.request_exception_evidence(
  p_exception uuid, p_actor uuid, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  exc noshashi.policy_exceptions;
begin
  if p_actor is null or not exists (select 1 from noshashi.accounts a where a.id = p_actor) then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  select * into exc from noshashi.policy_exceptions where id = p_exception for update;
  if not found or not exists (
    select 1 from noshashi.organization_members m where m.organization_id = exc.organization_id and m.account_id = p_actor
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if not exists (
    select 1 from noshashi.organization_members m
    where m.organization_id = exc.organization_id and m.account_id = p_actor and m.role in ('owner', 'admin', 'compliance')
  ) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if exc.status::text = 'needs_evidence' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_REQUESTED');
  end if;
  if exc.status::text <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_DECIDED', 'status', exc.status);
  end if;
  if exc.requested_by = p_actor then
    return jsonb_build_object('ok', false, 'code', 'FOUR_EYES_REQUIRED');
  end if;
  if length(trim(coalesce(p_note, ''))) < 10 then
    return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED');
  end if;

  update noshashi.policy_exceptions set status = 'needs_evidence' where id = p_exception;
  insert into noshashi.policy_exception_notes (exception_id, kind, author, note)
    values (p_exception, 'evidence_requested', p_actor, trim(p_note));
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state, new_state)
    values (exc.organization_id, p_actor, 'exception.evidence_requested', 'policy_exception', p_exception::text,
            jsonb_build_object('status', 'pending'),
            jsonb_build_object('status', 'needs_evidence', 'requested_by', exc.requested_by, 'reviewer', p_actor,
                               'receipt_digest', exc.receipt_digest, 'note', trim(p_note)));

  return jsonb_build_object('ok', true, 'status', 'needs_evidence', 'requested_by', exc.requested_by, 'reviewer', p_actor);
end;
$$;

revoke execute on function noshashi.request_exception_evidence(uuid, uuid, text) from public, anon, authenticated;
grant execute on function noshashi.request_exception_evidence(uuid, uuid, text) to service_role;

-- The requester answers with a supplement; the exception returns to pending.
-- Called by the signed-in requester directly: the caller is auth.uid().
create or replace function noshashi.add_exception_evidence(
  p_exception uuid, p_note text, p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  exc noshashi.policy_exceptions;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  select * into exc from noshashi.policy_exceptions where id = p_exception for update;
  if not found or not noshashi.is_org_member(exc.organization_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if exc.requested_by <> me then
    return jsonb_build_object('ok', false, 'code', 'NOT_REQUESTER');
  end if;
  if exc.status::text <> 'needs_evidence' then
    return jsonb_build_object('ok', false, 'code', 'NOT_AWAITING_EVIDENCE');
  end if;
  if length(trim(coalesce(p_note, ''))) < 10 then
    return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED');
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or p_evidence = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'code', 'EVIDENCE_REQUIRED');
  end if;

  insert into noshashi.policy_exception_notes (exception_id, kind, author, note, evidence)
    values (p_exception, 'evidence_added', me, trim(p_note), p_evidence);
  update noshashi.policy_exceptions set status = 'pending' where id = p_exception;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state, new_state)
    values (exc.organization_id, me, 'exception.evidence_added', 'policy_exception', p_exception::text,
            jsonb_build_object('status', 'needs_evidence'),
            jsonb_build_object('status', 'pending', 'receipt_digest', exc.receipt_digest, 'note', trim(p_note),
                               'evidence_keys', (select jsonb_agg(k) from jsonb_object_keys(p_evidence) k)));

  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

revoke execute on function noshashi.add_exception_evidence(uuid, text, jsonb) from public, anon;
grant execute on function noshashi.add_exception_evidence(uuid, text, jsonb) to authenticated, service_role;

-- Both steps reach webhooks as events of their own.
create or replace function noshashi.webhook_from_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev text;
begin
  if new.organization_id is null then return new; end if;
  ev := case new.action
    when 'policy.activated' then 'policy_activated'
    when 'exception.requested' then 'policy_exception'
    when 'exception.approved' then 'exception_decided'
    when 'exception.rejected' then 'exception_decided'
    when 'exception.evidence_requested' then 'exception_evidence_requested'
    when 'exception.evidence_added' then 'exception_evidence_added'
    when 'case.opened' then 'investigation_created'
    when 'case.closed' then 'investigation_resolved'
    else null end;
  if ev is not null then
    perform noshashi.webhook_emit(new.organization_id, ev, jsonb_build_object(
      'action', new.action, 'entity_type', new.entity_type, 'entity_id', new.entity_id,
      'actor_account_id', new.actor_account_id, 'occurred_at', new.occurred_at,
      'state', new.new_state, 'audit_id', new.id));
  end if;
  return new;
end;
$$;

-- The events check was declared inline, so its name is Postgres's choice:
-- find it by what it checks rather than by a guessed name.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'noshashi.org_webhooks'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%receipt_created%'
  loop
    execute format('alter table noshashi.org_webhooks drop constraint %I', c.conname);
  end loop;
end $$;

alter table noshashi.org_webhooks add constraint org_webhooks_events_allowed check (
  cardinality(events) > 0 and events <@ array[
    'policy_activated', 'policy_exception', 'exception_decided',
    'exception_evidence_requested', 'exception_evidence_added',
    'investigation_created', 'investigation_resolved', 'receipt_created'
  ]::text[]
);

create or replace function noshashi.create_org_webhook(p_org uuid, p_url text, p_events text[], p_description text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  wid uuid;
  sec text := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.has_org_role(p_org, array['owner','admin']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if not noshashi.webhook_url_allowed(p_url) then
    return jsonb_build_object('ok', false, 'code', 'URL_NOT_ALLOWED');
  end if;
  if p_events is null or cardinality(p_events) = 0 or not (p_events <@ array[
      'policy_activated', 'policy_exception', 'exception_decided',
      'exception_evidence_requested', 'exception_evidence_added',
      'investigation_created', 'investigation_resolved', 'receipt_created']::text[]) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVENTS');
  end if;
  insert into noshashi.org_webhooks (organization_id, url, description, events, secret, created_by)
    values (p_org, p_url, nullif(trim(coalesce(p_description, '')), ''), p_events, sec, me)
    returning id into wid;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values (p_org, me, 'webhook.created', 'webhook', wid::text, jsonb_build_object('url', p_url, 'events', p_events));
  -- The only time the secret leaves the database.
  return jsonb_build_object('ok', true, 'id', wid, 'secret', sec);
end;
$$;
