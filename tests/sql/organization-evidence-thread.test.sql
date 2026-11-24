-- needs: 20260920190000_organizations_roles_audit.sql 20260923210000_governance_policies_exceptions.sql 20260929140000_exception_expiry.sql 20260930120100_reviewer_auditor_signin_audit.sql
-- Plain Postgres installs the evidence-thread functions before the
-- evidence-request migration reaches its pg_net-dependent webhook section.
begin;

do $$
declare
  requester constant uuid := '00000000-0000-4000-8000-000000000401';
  reviewer constant uuid := '00000000-0000-4000-8000-000000000402';
  auditor constant uuid := '00000000-0000-4000-8000-000000000403';
  outsider constant uuid := '00000000-0000-4000-8000-000000000404';
  tenant constant uuid := '00000000-0000-4000-8000-000000000405';
  other_tenant constant uuid := '00000000-0000-4000-8000-000000000406';
  session_id constant uuid := '00000000-0000-4000-8000-000000000407';
  original_evidence constant jsonb := '{"source":"original"}';
  supplement constant jsonb := '{"source":"supplement"}';
  digest constant text := repeat('B', 64);
  exception_fixture uuid;
  result jsonb;
begin
  insert into auth.users (id, email)
    select actor, actor::text || '@example.invalid' from unnest(array[requester, reviewer, auditor, outsider]) actor;
  insert into noshashi.accounts (id, email)
    select id, email from auth.users where id in (requester, reviewer, auditor, outsider)
    on conflict (id) do nothing;
  insert into noshashi.organizations (id, name, slug) values
    (tenant, 'Evidence tenant', 'evidence-tenant'),
    (other_tenant, 'Other evidence tenant', 'other-evidence-tenant');
  insert into noshashi.organization_members (organization_id, account_id, role) values
    (tenant, requester, 'owner'), (tenant, reviewer, 'reviewer'),
    (tenant, auditor, 'auditor'), (other_tenant, outsider, 'owner');
  insert into auth.sessions (id, user_id, aal, ip, user_agent)
    values (session_id, reviewer, 'aal2', '192.0.2.250', 'Synthetic test client');

  if has_function_privilege('authenticated', 'noshashi.request_exception_evidence(uuid,uuid,text)', 'execute')
     or has_function_privilege('anon', 'noshashi.request_exception_evidence(uuid,uuid,text)', 'execute')
     or has_function_privilege('anon', 'noshashi.add_exception_evidence(uuid,text,jsonb)', 'execute')
  then raise exception 'FAILED: evidence RPC exposed to an unauthorized role'; end if;
  if has_table_privilege('authenticated', 'noshashi.policy_exception_notes', 'INSERT, UPDATE, DELETE, TRUNCATE')
     or has_table_privilege('service_role', 'noshashi.policy_exception_notes', 'UPDATE, DELETE, TRUNCATE')
  then raise exception 'FAILED: evidence thread grants allow mutation'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', requester)::text, true);
  set local role authenticated;
  insert into noshashi.policy_exceptions
    (organization_id, subject, receipt_digest, verdict, reason, evidence, requested_by)
  values (tenant, repeat('r', 26), digest, 'hold', 'Synthetic evidence request', original_evidence, requester)
  returning id into exception_fixture;

  set local role service_role;
  result := noshashi.request_exception_evidence(exception_fixture, outsider, 'Please provide a ledger reference');
  if result->>'code' is distinct from 'NOT_FOUND' then raise exception 'FAILED: cross-tenant evidence request'; end if;
  result := noshashi.request_exception_evidence(exception_fixture, requester, 'Please provide a ledger reference');
  if result->>'code' is distinct from 'FOUR_EYES_REQUIRED' then raise exception 'FAILED: self evidence request'; end if;
  result := noshashi.request_exception_evidence(exception_fixture, auditor, 'Please provide a ledger reference');
  if result->>'code' is distinct from 'INSUFFICIENT_PERMISSIONS' then raise exception 'FAILED: auditor requested evidence'; end if;
  result := noshashi.request_exception_evidence(exception_fixture, reviewer, 'Please provide a ledger reference');
  if result->>'status' is distinct from 'needs_evidence' then raise exception 'FAILED: reviewer could not request evidence'; end if;
  result := noshashi.request_exception_evidence(exception_fixture, reviewer, 'Please provide a ledger reference');
  if result->>'code' is distinct from 'ALREADY_REQUESTED' then raise exception 'FAILED: duplicate evidence request'; end if;
  result := noshashi.decide_policy_exception(exception_fixture, reviewer, true, null, 10);
  if result->>'code' is distinct from 'ALREADY_DECIDED' or result->>'status' is distinct from 'needs_evidence'
  then raise exception 'FAILED: incomplete evidence was approved'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', reviewer)::text, true);
  result := noshashi.add_exception_evidence(exception_fixture, 'Appended ledger reference', supplement);
  if result->>'code' is distinct from 'NOT_REQUESTER' then raise exception 'FAILED: another actor added evidence'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', outsider)::text, true);
  result := noshashi.add_exception_evidence(exception_fixture, 'Appended ledger reference', supplement);
  if result->>'code' is distinct from 'NOT_FOUND' then raise exception 'FAILED: another tenant added evidence'; end if;
  if exists (select 1 from noshashi.policy_exception_notes where policy_exception_notes.exception_id = exception_fixture)
  then raise exception 'FAILED: another tenant could read evidence thread'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', requester)::text, true);
  result := noshashi.add_exception_evidence(exception_fixture, 'Appended ledger reference', supplement);
  if result->>'status' is distinct from 'pending' then raise exception 'FAILED: supplement did not reopen decision'; end if;
  result := noshashi.add_exception_evidence(exception_fixture, 'Appended ledger reference', supplement);
  if result->>'code' is distinct from 'NOT_AWAITING_EVIDENCE' then raise exception 'FAILED: duplicate supplement'; end if;

  set local role service_role;
  result := noshashi.decide_policy_exception(exception_fixture, reviewer, true, null, 10);
  if result->>'status' is distinct from 'approved' or (result->>'decided_by')::uuid is distinct from reviewer
  then raise exception 'FAILED: reviewer could not approve supplemented exception'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', auditor)::text, true);
  set local role authenticated;
  if not exists (select 1 from noshashi.policy_exceptions where id = exception_fixture and evidence = original_evidence and receipt_digest = digest)
  then raise exception 'FAILED: original evidence changed or is unavailable'; end if;
  if (select count(*) from noshashi.policy_exception_notes n where n.exception_id = exception_fixture) <> 2
     or not exists (select 1 from noshashi.policy_exception_notes n where n.exception_id = exception_fixture
       and n.kind = 'evidence_requested' and n.author = reviewer and n.evidence is null)
     or not exists (select 1 from noshashi.policy_exception_notes n where n.exception_id = exception_fixture
       and n.kind = 'evidence_added' and n.author = requester and n.evidence = supplement)
  then raise exception 'FAILED: evidence thread lost an actor or changed the supplement'; end if;
  if (select count(*) from noshashi.audit_log where entity_id = exception_fixture::text and organization_id = tenant
    and ((action = 'exception.evidence_requested' and actor_account_id = reviewer)
      or (action = 'exception.evidence_added' and actor_account_id = requester)
      or (action = 'exception.approved' and actor_account_id = reviewer))) <> 3
  then raise exception 'FAILED: auditor cannot see the evidence transitions and decision'; end if;
  if not exists (select 1 from noshashi.audit_log where entity_id = session_id::text and organization_id = tenant
    and action = 'member.signed_in' and actor_account_id = reviewer and new_state->>'aal' = 'aal2')
  then raise exception 'FAILED: reviewer sign-in was not audited'; end if;
  reset role;
  raise notice 'ORGANIZATION EVIDENCE THREAD SQL TEST PASSED';
end;
$$;

rollback;
