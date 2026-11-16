-- needs: 20260923210000_governance_policies_exceptions.sql 20260923230000_org_investigations.sql 20260929140000_exception_expiry.sql 20260930120100_reviewer_auditor_signin_audit.sql 20261115170000_case_exception_binding.sql
-- Disposable synthetic data only. RLS runs as authenticated, not as postgres.
begin;
insert into auth.users(id,email) values
 ('b1000000-0000-4000-8000-000000000001','author@example.invalid'),
 ('b1000000-0000-4000-8000-000000000002','reviewer@example.invalid'),
 ('b1000000-0000-4000-8000-000000000003','viewer@example.invalid'),
 ('b1000000-0000-4000-8000-000000000004','outsider@example.invalid');
insert into noshashi.organizations(id,name,slug) values
 ('b2000000-0000-4000-8000-000000000001','Fixture A','fixture-a'),
 ('b2000000-0000-4000-8000-000000000002','Fixture B','fixture-b');
insert into noshashi.organization_members(organization_id,account_id,role) values
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','owner'),
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','reviewer'),
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','viewer'),
 ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000004','owner');
insert into noshashi.org_policies(organization_id,policy_id,version,name,params,hash,created_by)
 values ('b2000000-0000-4000-8000-000000000001','security_fixture',1,'Fixture','{}',repeat('A',64),'b1000000-0000-4000-8000-000000000001');
insert into noshashi.policy_exceptions(id,organization_id,subject,receipt_digest,verdict,reason,evidence,requested_by)
 values ('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',repeat('r',30),repeat('B',64),'hold','A sufficient fixture reason','{"source":"fixture"}','b1000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare b text; h text; r jsonb;
begin
 b:=jsonb_build_object('seq',0,'prev','GENESIS','actor',auth.uid(),'kind','opened','at',now(), 'linked',jsonb_build_object('digest',repeat('B',64)))::text;
 h:=upper(encode(sha256(convert_to(b,'UTF8')),'hex'));
 r:=noshashi.open_org_case('b2000000-0000-4000-8000-000000000001','case-security-fixture','Fixture case',repeat('r',30),b,h);
 if r->>'ok'<>'true' then raise exception 'FAILED: open valid case %',r; end if;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
do $$
begin
 if exists(select 1 from noshashi.org_policies where organization_id='b2000000-0000-4000-8000-000000000001') then raise exception 'FAILED: cross-tenant policy read'; end if;
 if exists(select 1 from noshashi.policy_exceptions where id='b3000000-0000-4000-8000-000000000001') then raise exception 'FAILED: cross-tenant exception read'; end if;
 if exists(select 1 from noshashi.org_cases where id='case-security-fixture') or exists(select 1 from noshashi.org_case_events where case_id='case-security-fixture') then raise exception 'FAILED: cross-tenant evidence read'; end if;
 if (noshashi.append_org_case_event('case-security-fixture','{}',repeat('F',64))->>'code')<>'NOT_FOUND' then raise exception 'FAILED: cross-tenant evidence append'; end if;
 if exists(select 1 from noshashi.audit_log where organization_id='b2000000-0000-4000-8000-000000000001') then raise exception 'FAILED: cross-tenant audit read'; end if;
 update noshashi.org_policies set name='Foreign edit' where policy_id='security_fixture';
 if found then raise exception 'FAILED: cross-tenant policy write'; end if;
 if has_function_privilege(current_user,'noshashi.activate_org_policy(uuid,text,integer,uuid,text)','execute') then raise exception 'FAILED: direct activation RPC allowed'; end if;
 if has_function_privilege(current_user,'noshashi.decide_policy_exception(uuid,uuid,boolean,text,integer)','execute') then raise exception 'FAILED: direct exception RPC allowed'; end if;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select noshashi.submit_org_policy('b2000000-0000-4000-8000-000000000001','security_fixture',1);
reset role;
do $$
declare a uuid:='b1000000-0000-4000-8000-000000000001';
 reviewer uuid:='b1000000-0000-4000-8000-000000000002';
 viewer uuid:='b1000000-0000-4000-8000-000000000003';
 outsider uuid:='b1000000-0000-4000-8000-000000000004';
 org uuid:='b2000000-0000-4000-8000-000000000001';
 exc uuid:='b3000000-0000-4000-8000-000000000001'; r jsonb; n bigint;
begin
 r:=noshashi.activate_org_policy(org,'security_fixture',1,a,repeat('A',64));
 if r->>'code'<>'FOUR_EYES_REQUIRED' then raise exception 'FAILED: self activation %',r; end if;
 r:=noshashi.activate_org_policy(org,'security_fixture',1,outsider,repeat('A',64));
 if r->>'code'<>'NOT_A_MEMBER' then raise exception 'FAILED: outsider activation'; end if;
 r:=noshashi.activate_org_policy(org,'security_fixture',1,viewer,repeat('A',64));
 if r->>'code'<>'INSUFFICIENT_PERMISSIONS' then raise exception 'FAILED: viewer activation'; end if;
 r:=noshashi.activate_org_policy(org,'security_fixture',1,reviewer,repeat('F',64));
 if r->>'code'<>'VALIDATION_FAILED' then raise exception 'FAILED: altered activation hash'; end if;
 r:=noshashi.activate_org_policy(org,'security_fixture',1,reviewer,repeat('A',64));
 if r->>'ok'<>'true' then raise exception 'FAILED: second reviewer activation %',r; end if;
 select count(*) into n from noshashi.audit_log where organization_id=org and action='policy.activated';
 r:=noshashi.activate_org_policy(org,'security_fixture',1,reviewer,repeat('A',64));
 if r->>'code'<>'ALREADY_ACTIVE' or (select count(*) from noshashi.audit_log where organization_id=org and action='policy.activated')<>n then raise exception 'FAILED: activation replay'; end if;
 begin
  update noshashi.org_policies set params='{"altered":true}' where organization_id=org and policy_id='security_fixture';
  raise exception 'FAILED: activated parameters mutable';
 exception when check_violation then null; end;
 r:=noshashi.decide_policy_exception(exc,a,true,null,30);
 if r->>'code'<>'FOUR_EYES_REQUIRED' then raise exception 'FAILED: self exception approval'; end if;
 r:=noshashi.decide_policy_exception(exc,outsider,true,null,30);
 if r->>'code'<>'NOT_FOUND' then raise exception 'FAILED: outsider exception'; end if;
 r:=noshashi.decide_policy_exception(exc,viewer,true,null,30);
 if r->>'code'<>'INSUFFICIENT_PERMISSIONS' then raise exception 'FAILED: viewer exception'; end if;
 r:=noshashi.decide_policy_exception(exc,reviewer,true,null,0);
 if r->>'code'<>'EXPIRY_INVALID' then raise exception 'FAILED: invalid exception expiry'; end if;
 r:=noshashi.decide_policy_exception(exc,reviewer,true,null,30);
 if r->>'ok'<>'true' or (r->>'expires_at')::timestamptz<=now() then raise exception 'FAILED: reviewer exception approval'; end if;
 r:=noshashi.decide_policy_exception(exc,reviewer,false,'Attempt a conflicting decision',30);
 if r->>'code'<>'ALREADY_DECIDED' then raise exception 'FAILED: conflicting replay'; end if;
 begin
  update noshashi.policy_exceptions set evidence='{"altered":true}' where id=exc;
  raise exception 'FAILED: decided evidence mutable';
 exception when check_violation then null; end;
 begin
  delete from noshashi.audit_log where organization_id=org;
  raise exception 'FAILED: audit mutation';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from noshashi.audit_log where organization_id=org and action in ('policy.activated','exception.approved') and (occurred_at is null or actor_account_id is null)) then raise exception 'FAILED: missing audit attribution'; end if;
 raise notice 'GOVERNANCE SECURITY TEST PASSED';
end $$;

-- An audit-storage failure must roll back both activation and archival.
insert into noshashi.org_policies(organization_id,policy_id,version,name,status,params,hash,created_by,submitted_by,submitted_at)
 values ('b2000000-0000-4000-8000-000000000001','security_fixture',2,'Fixture second version','pending','{}',repeat('C',64),'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',now());
create function public.fixture_audit_failure() returns trigger language plpgsql as $$ begin
 if new.action='policy.activated' then raise exception 'synthetic_audit_unavailable'; end if;
 return new;
end $$;
create trigger fixture_audit_failure before insert on noshashi.audit_log for each row execute function public.fixture_audit_failure();
do $$
begin
 begin
  perform noshashi.activate_org_policy('b2000000-0000-4000-8000-000000000001','security_fixture',2,'b1000000-0000-4000-8000-000000000002',repeat('C',64));
  raise exception 'FAILED: audit failure was ignored';
 exception when raise_exception then
  if sqlerrm<>'synthetic_audit_unavailable' then raise; end if;
 end;
 if (select status from noshashi.org_policies where policy_id='security_fixture' and version=1)<>'active' then raise exception 'FAILED: previous policy not restored after failure'; end if;
 if (select status from noshashi.org_policies where policy_id='security_fixture' and version=2)<>'pending' then raise exception 'FAILED: failed activation persisted'; end if;
end $$;
drop trigger fixture_audit_failure on noshashi.audit_log;
drop function public.fixture_audit_failure();

-- The fixture below is an expired approval, not an authorization granted to a
-- real account. It must never authorize a new closure.
insert into noshashi.policy_exceptions(id,organization_id,subject,receipt_digest,verdict,reason,evidence,requested_by,status,decided_by,decided_at,expires_at)
 values ('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001',repeat('r',30),repeat('B',64),'hold','Expired fixture approval','{"source":"fixture"}','b1000000-0000-4000-8000-000000000001','approved','b1000000-0000-4000-8000-000000000002',now()-interval '2 days',now()-interval '1 day'),
 ('b3000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000001',repeat('r',30),repeat('C',64),'hold','Other receipt fixture approval','{"source":"fixture"}','b1000000-0000-4000-8000-000000000001','approved','b1000000-0000-4000-8000-000000000002',now(),now()+interval '30 days'),
 ('b3000000-0000-4000-8000-000000000004','b2000000-0000-4000-8000-000000000001',repeat('r',30),repeat('B',64),'hold','Legacy fixture approval','{"source":"fixture"}','b1000000-0000-4000-8000-000000000001','approved','b1000000-0000-4000-8000-000000000002',now()-interval '2 days',null);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare b text; h text; previous_hash text; r jsonb; eid text;
begin
 select hash into previous_hash from noshashi.org_case_events where case_id='case-security-fixture' and seq=0;
 foreach eid in array array['b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000004'] loop
  b:=jsonb_build_object('seq',1,'prev',previous_hash,'actor',auth.uid(),'kind','closed','at',now(),'outcome','exception-approved','text','A sufficiently detailed handoff','exceptionId',eid)::text;
  h:=upper(encode(sha256(convert_to(b,'UTF8')),'hex'));
  r:=noshashi.append_org_case_event('case-security-fixture',b,h);
  if r->>'code'<>'EXCEPTION_NOT_APPROVED' then raise exception 'FAILED: unsupported approval %',r; end if;
 end loop;
 b:=jsonb_build_object('seq',1,'prev',previous_hash,'actor',auth.uid(),'kind','closed','at',now(),'outcome','exception-approved','text','A sufficiently detailed handoff','exceptionId','b3000000-0000-4000-8000-000000000001')::text;
 if (noshashi.append_org_case_event('case-security-fixture',b,repeat('F',64))->>'code')<>'HASH_MISMATCH' then raise exception 'FAILED: altered event accepted'; end if;
 h:=upper(encode(sha256(convert_to(b,'UTF8')),'hex'));
 r:=noshashi.append_org_case_event('case-security-fixture',b,h);
 if r->>'ok'<>'true' then raise exception 'FAILED: valid bound exception closure %',r; end if;
 if (noshashi.append_org_case_event('case-security-fixture',b,h)->>'code')<>'CONFLICT' then raise exception 'FAILED: duplicate case event'; end if;
 if (select count(*) from noshashi.org_case_events where case_id='case-security-fixture')<>2 then raise exception 'FAILED: duplicate evidence persisted'; end if;
 begin
  update noshashi.org_case_events set body='{}' where case_id='case-security-fixture';
  raise exception 'FAILED: case evidence mutable';
 exception when insufficient_privilege then null; end;
 raise notice 'CASE EVIDENCE SECURITY TEST PASSED';
end $$;
reset role;
rollback;
