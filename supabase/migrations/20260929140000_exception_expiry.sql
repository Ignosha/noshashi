-- Exceptions expire.
--
-- An approved exception is a person's decision about one verdict at one
-- point in time. Left open-ended it becomes a standing waiver nobody
-- re-reads. From now on every approval carries an expiry, chosen by the
-- approver (1 to 365 days, 30 by default), recorded in the same
-- transaction as the decision and in its audit event.
--
-- Additive only. Exceptions approved before this migration keep a null
-- expiry and are shown as "approved before expiry was recorded"; no
-- existing row is changed. Once decided, the expiry is final like the
-- rest of the decision (policy_exceptions_guard refuses any update to a
-- decided row).

alter table noshashi.policy_exceptions add column if not exists expires_at timestamptz;

alter table noshashi.policy_exceptions drop constraint if exists policy_exceptions_expiry_shape;
alter table noshashi.policy_exceptions add constraint policy_exceptions_expiry_shape check (
  expires_at is null or (status::text = 'approved' and decided_at is not null and expires_at > decided_at)
) not valid;
alter table noshashi.policy_exceptions validate constraint policy_exceptions_expiry_shape;

-- The four-argument decision function is replaced by one that also takes
-- the expiry. p_expires_in_days has a default, so the deployed Edge
-- Function's named call resolves to this one before it is redeployed, and
-- an approval can never again be recorded without an expiry.
drop function if exists noshashi.decide_policy_exception(uuid, uuid, boolean, text);

create or replace function noshashi.decide_policy_exception(
  p_exception uuid, p_actor uuid, p_approve boolean, p_note text, p_expires_in_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  exc noshashi.policy_exceptions;
  outcome noshashi.exception_status := case when p_approve then 'approved' else 'rejected' end;
  decided timestamptz := now();
  expiry timestamptz;
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
  if p_approve then
    if p_expires_in_days is null or p_expires_in_days < 1 or p_expires_in_days > 365 then
      return jsonb_build_object('ok', false, 'code', 'EXPIRY_INVALID');
    end if;
    expiry := decided + make_interval(days => p_expires_in_days);
  end if;

  update noshashi.policy_exceptions
    set status = outcome, decided_by = p_actor, decided_at = decided, expires_at = expiry,
        decision_note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_exception;

  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state, new_state)
    values (exc.organization_id, p_actor, 'exception.' || outcome::text, 'policy_exception', p_exception::text,
            jsonb_build_object('status', 'pending'),
            jsonb_build_object('status', outcome, 'requested_by', exc.requested_by, 'decided_by', p_actor,
                               'receipt_digest', exc.receipt_digest, 'policy_id', exc.policy_id,
                               'policy_version', exc.policy_version, 'policy_hash', exc.policy_hash,
                               'expires_at', expiry,
                               'note', nullif(trim(coalesce(p_note, '')), '')));

  return jsonb_build_object('ok', true, 'status', outcome, 'requested_by', exc.requested_by, 'decided_by', p_actor, 'expires_at', expiry);
end;
$$;

revoke execute on function noshashi.decide_policy_exception(uuid, uuid, boolean, text, integer) from public, anon, authenticated;
grant execute on function noshashi.decide_policy_exception(uuid, uuid, boolean, text, integer) to service_role;
