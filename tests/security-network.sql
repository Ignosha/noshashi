-- needs: 20260928150000_protection_threats_phishing.sql 20261104123000_security_network.sql
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000000d1','security-owner@test.invalid'),
 ('00000000-0000-4000-8000-0000000000d2','security-staff@test.invalid'),
 ('00000000-0000-4000-8000-0000000000d3','security-other@test.invalid') on conflict do nothing;
insert into noshashi.accounts(id,email) select id,email from auth.users where id in ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000d3') on conflict do nothing;
insert into noshashi.organizations(id,name,slug) values('00000000-0000-4000-8000-0000000000d4','Security test','security-test');
insert into noshashi.organization_members(organization_id,account_id,role) values('00000000-0000-4000-8000-0000000000d4','00000000-0000-4000-8000-0000000000d1','owner');
insert into noshashi.support_staff(account_id) values('00000000-0000-4000-8000-0000000000d2');
insert into noshashi.entitlements(account_id,tier,features) values('00000000-0000-4000-8000-0000000000d1','institution',array['threat_registry']) on conflict(account_id) do update set tier='institution',features=array['threat_registry'];
do $t$
declare r jsonb;rid uuid; org uuid:='00000000-0000-4000-8000-0000000000d4';addr text:='rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX';begin
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated","aal":"aal1"}',true);execute 'set local role authenticated';
 r:=noshashi.security_share_threat(org,addr,'phishing',array[repeat('A',64)],'Publicly sourced evidence note',array['https://example.com/evidence']);
 if r->>'code'<>'PARTICIPANT_REVIEW_REQUIRED' then raise exception 'FAILED participant review guard: %',r;end if;
 begin insert into noshashi.security_network_participants values(org,auth.uid(),'https://example.com','Unauthorized direct verification',now(),now()+interval '1 day');raise exception 'FAILED direct write allowed';exception when insufficient_privilege then null;end;
 r:=noshashi.security_verify_participant(org,'https://example.com','Independent participant review note');if r->>'code'<>'STAFF_MFA_REQUIRED' then raise exception 'FAILED owner verification: %',r;end if;
 execute 'reset role';
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated","aal":"aal1"}',true);execute 'set local role authenticated';
 r:=noshashi.security_verify_participant(org,'https://example.com','Independent participant review note');if r->>'code'<>'STAFF_MFA_REQUIRED' then raise exception 'FAILED staff MFA';end if;
 execute 'reset role';perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated","aal":"aal2"}',true);execute 'set local role authenticated';
 r:=noshashi.security_verify_participant(org,'https://example.com','Independent participant review note');if r->>'ok'<>'true' then raise exception 'FAILED valid review: %',r;end if;execute 'reset role';
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated","aal":"aal1"}',true);execute 'set local role authenticated';
 r:=noshashi.security_share_threat(org,addr,'phishing',array[repeat('A',64)],'Publicly sourced evidence note',array['https://example.com/evidence']);if r->>'ok'<>'true' then raise exception 'FAILED valid report: %',r;end if;rid:=(r->>'id')::uuid;
 r:=noshashi.security_share_threat(org,addr,'phishing',array[repeat('A',64)],'Publicly sourced evidence note',array['https://example.com/evidence']);if r->>'code'<>'ALREADY_REPORTED' then raise exception 'FAILED duplicate';end if;execute 'reset role';
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated","aal":"aal2"}',true);execute 'set local role authenticated';
 if (select count(*) from noshashi.security_network_participants)<>0 or (select count(*) from noshashi.threat_reports)<>0 then raise exception 'FAILED cross-org RLS';end if;
 r:=noshashi.security_withdraw_threat(rid,'Unauthorized withdrawal attempt');if r->>'ok'='true' then raise exception 'FAILED outsider withdrawal';end if;execute 'reset role';
 execute 'set local role anon';r:=noshashi.security_network_lookup(array[addr]);if jsonb_array_length(r->'reports')<>0 then raise exception 'FAILED pending report public';end if;execute 'reset role';
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated","aal":"aal1"}',true);execute 'set local role authenticated';
 r:=noshashi.security_review_threat(rid,'confirmed','Reviewed public evidence');if r->>'code'<>'STAFF_MFA_REQUIRED' then raise exception 'FAILED report MFA';end if;
 -- Legacy review does not place an indicator in the new, MFA-reviewed dataset.
 r:=noshashi.review_threat_report(rid,'confirmed','Legacy review evidence');execute 'reset role';execute 'set local role anon';r:=noshashi.security_network_lookup(array[addr]);if jsonb_array_length(r->'reports')<>0 then raise exception 'FAILED legacy review bypass';end if;execute 'reset role';
 update noshashi.threat_reports set status='pending',reviewed_by=null,reviewed_at=null where id=rid;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated","aal":"aal2"}',true);execute 'set local role authenticated';
 r:=noshashi.security_review_threat(rid,'confirmed','Independently reviewed sources');if r->>'ok'<>'true' then raise exception 'FAILED valid report review: %',r;end if;execute 'reset role';
 execute 'set local role anon';r:=noshashi.security_network_lookup(array[addr]);if jsonb_array_length(r->'reports')<>1 then raise exception 'FAILED public reviewed report: %',r;end if;
 if r->'reports'->0 ?| array['organization_id','submitted_by','note','reviewed_by','review_note'] then raise exception 'FAILED private fields exposed';end if;execute 'reset role';
 update noshashi.security_network_participants set verified_at=now()-interval '91 days',expires_at=now()-interval '1 day' where organization_id=org;
 execute 'set local role anon';r:=noshashi.security_network_lookup(array[addr]);if jsonb_array_length(r->'reports')<>0 then raise exception 'FAILED expired verification';end if;execute 'reset role';
 update noshashi.security_network_participants set verified_at=now(),expires_at=now()+interval '1 day' where organization_id=org;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated","aal":"aal1"}',true);execute 'set local role authenticated';
 r:=noshashi.security_withdraw_threat(rid,'Correction: evidence withdrawn by reporting organization');if r->>'ok'<>'true' then raise exception 'FAILED owner withdrawal: %',r;end if;execute 'reset role';
 execute 'set local role anon';r:=noshashi.security_network_lookup(array[addr]);if jsonb_array_length(r->'reports')<>0 then raise exception 'FAILED withdrawn public';end if;execute 'reset role';if exists(select 1 from noshashi.threat_lookup(array[addr])) then raise exception 'FAILED withdrawn legacy lookup';end if;
 if (select count(*) from noshashi.security_report_actions where report_id=rid)<>1 then raise exception 'FAILED withdrawal audit';end if;
end $t$;
rollback;
