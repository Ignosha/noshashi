-- needs: 20260920190000_organizations_roles_audit.sql 20260923210000_governance_policies_exceptions.sql 20260929140000_exception_expiry.sql
begin;

do $$
declare
  requester constant uuid := '00000000-0000-4000-8000-000000000301';
  approver constant uuid := '00000000-0000-4000-8000-000000000302';
  viewer constant uuid := '00000000-0000-4000-8000-000000000303';
  outsider constant uuid := '00000000-0000-4000-8000-000000000304';
  tenant constant uuid := '00000000-0000-4000-8000-000000000305';
  other_tenant constant uuid := '00000000-0000-4000-8000-000000000306';
  exception_id uuid;
  pending_id uuid;
  result jsonb;
  digest constant text := repeat('A', 64);
begin
  insert into auth.users (id, email)
    select actor, actor::text || '@example.invalid' from unnest(array[requester, approver, viewer, outsider]) actor;
  insert into noshashi.accounts (id, email)
    select id, email from auth.users where id in (requester, approver, viewer, outsider)
    on conflict (id) do nothing;
  insert into noshashi.organizations (id, name, slug) values
    (tenant, 'Approval tenant', 'approval-tenant'),
    (other_tenant, 'Other tenant', 'approval-other');
  insert into noshashi.organization_members (organization_id, account_id, role) values
    (tenant, requester, 'owner'), (tenant, approver, 'compliance'),
    (tenant, viewer, 'viewer'), (other_tenant, outsider, 'owner');

  if has_function_privilege('authenticated', 'noshashi.decide_policy_exception(uuid,uuid,boolean,text,integer)', 'execute')
     or has_function_privilege('anon', 'noshashi.decide_policy_exception(uuid,uuid,boolean,text,integer)', 'execute')
  then raise exception 'FAILED: decision RPC exposed to clients'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', requester)::text, true);
  set local role authenticated;
  insert into noshashi.policy_exceptions
    (organization_id, subject, receipt_digest, verdict, reason, evidence, requested_by)
  values (tenant, repeat('r', 26), digest, 'hold', 'Local governance fixture', '{"fixture":true}', requester)
  returning id into exception_id;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', outsider)::text, true);
  if exists (select 1 from noshashi.policy_exceptions where id = exception_id)
     or exists (select 1 from noshashi.audit_log where entity_id = exception_id::text)
  then raise exception 'FAILED: another tenant can read the request or its audit'; end if;

  set local role service_role;
  result := noshashi.decide_policy_exception(exception_id, outsider, true, null, 10);
  if result->>'code' is distinct from 'NOT_FOUND' then raise exception 'FAILED: cross-tenant decision'; end if;
  result := noshashi.decide_policy_exception(exception_id, viewer, true, null, 10);
  if result->>'code' is distinct from 'INSUFFICIENT_PERMISSIONS' then raise exception 'FAILED: viewer decision'; end if;
  result := noshashi.decide_policy_exception(exception_id, requester, true, null, 10);
  if result->>'code' is distinct from 'FOUR_EYES_REQUIRED' then raise exception 'FAILED: self approval'; end if;
  result := noshashi.decide_policy_exception(exception_id, approver, true, null, 0);
  if result->>'code' is distinct from 'EXPIRY_INVALID' then raise exception 'FAILED: invalid expiry'; end if;
  result := noshashi.decide_policy_exception(exception_id, approver, true, null, 10);
  if result->>'status' is distinct from 'approved'
     or (result->>'decided_by')::uuid is distinct from approver
     or (result->>'expires_at')::timestamptz is distinct from now() + interval '10 days'
  then raise exception 'FAILED: independent approval missing identity or expiry'; end if;
  result := noshashi.decide_policy_exception(exception_id, approver, true, null, 10);
  if result->>'code' is distinct from 'ALREADY_DECIDED' then raise exception 'FAILED: repeat decision accepted'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', approver)::text, true);
  set local role authenticated;
  if (select count(*) from noshashi.audit_log where entity_id = exception_id::text and action = 'exception.approved') <> 1
     or not exists (
       select 1 from noshashi.audit_log
       where entity_id = exception_id::text and action = 'exception.approved' and organization_id = tenant
         and actor_account_id = approver and new_state->>'receipt_digest' = digest
         and (new_state->>'requested_by')::uuid = requester
     )
  then raise exception 'FAILED: approval audit missing actor, tenant, or evidence digest'; end if;
  if has_table_privilege('authenticated', 'noshashi.audit_log', 'INSERT, UPDATE, DELETE, TRUNCATE')
     or has_table_privilege('service_role', 'noshashi.audit_log', 'UPDATE, DELETE, TRUNCATE')
  then raise exception 'FAILED: audit log grants permit mutation'; end if;
  reset role;
  insert into noshashi.policy_exceptions
    (organization_id, subject, receipt_digest, verdict, reason, evidence, requested_by)
  values (tenant, repeat('r', 26), digest, 'hold', 'Role revocation fixture', '{"fixture":true}', requester)
  returning id into pending_id;

  update noshashi.organization_members set role = 'viewer'
    where organization_id = tenant and account_id = approver;
  set local role service_role;
  result := noshashi.decide_policy_exception(pending_id, approver, true, null, 10);
  if result->>'code' is distinct from 'INSUFFICIENT_PERMISSIONS'
  then raise exception 'FAILED: a downgraded approver could decide'; end if;

  delete from noshashi.organization_members
    where organization_id = tenant and account_id = approver;
  result := noshashi.decide_policy_exception(pending_id, approver, true, null, 10);
  if result->>'code' is distinct from 'NOT_FOUND'
  then raise exception 'FAILED: a removed approver could decide'; end if;
  -- Retain the same authenticated identity throughout the role changes.
  set local role authenticated;
  if exists (select 1 from noshashi.policy_exceptions where id in (exception_id, pending_id))
     or exists (select 1 from noshashi.audit_log where entity_id = exception_id::text)
  then raise exception 'FAILED: a removed approver retained read access'; end if;
  reset role;
  if not exists (select 1 from noshashi.policy_exceptions where id = pending_id and status = 'pending')
     or not exists (select 1 from noshashi.audit_log
       where entity_id = exception_id::text and action = 'exception.approved' and actor_account_id = approver)
  then raise exception 'FAILED: role revocation changed decision history'; end if;
  raise notice 'ORGANIZATION APPROVALS SQL TEST PASSED';
end;
$$;

rollback;
