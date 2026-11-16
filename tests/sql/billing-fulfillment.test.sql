-- needs: 20261115173000_billing_fulfillment.sql
begin;
insert into auth.users(id,email) values('e1000000-0000-4000-8000-000000000001','billing-fixture@example.invalid');
do $$
declare acct uuid:='e1000000-0000-4000-8000-000000000001'; r jsonb; token uuid; n integer;
 catalog jsonb:='{"operator":{"features":["console"],"verification_quota":0},"desk":{"features":["console","compliance_api"],"verification_quota":5000}}';
 sub jsonb; quota integer;
begin
 if has_function_privilege('authenticated','noshashi.billing_claim(text,uuid,text)','execute') then raise exception 'FAILED: public billing claim'; end if;
 if has_table_privilege('authenticated','noshashi.billing_credit_purchases','select') then raise exception 'FAILED: receipt exposure'; end if;
 r:=noshashi.billing_claim('evt_credit1',acct,repeat('a',64));token:=(r->>'token')::uuid;
 if token is null then raise exception 'FAILED: no initial lease'; end if;
 if (noshashi.billing_claim('evt_parallel',acct,repeat('b',64))->>'busy')<>'true' then raise exception 'FAILED: simultaneous account lease'; end if;
 perform noshashi.billing_apply_credits('evt_credit1',acct,token,'cs_test_credits',10000,100,'usd');
 if (noshashi.billing_claim('evt_credit1',acct,repeat('a',64))->>'applied')<>'true' then raise exception 'FAILED: processed event not deduplicated'; end if;
 r:=noshashi.billing_claim('evt_async1',acct,repeat('c',64));token:=(r->>'token')::uuid;
 perform noshashi.billing_apply_credits('evt_async1',acct,token,'cs_test_credits',10000,100,'usd');
 select verification_quota into quota from noshashi.entitlements where account_id=acct;
 if quota<>10000 then raise exception 'FAILED: checkout double credit %',quota; end if;
 begin
  perform noshashi.billing_claim('evt_credit1',acct,repeat('d',64));raise exception 'FAILED: changed replay hash';
 exception when unique_violation then null; end;
 r:=noshashi.billing_claim('evt_stale',acct,repeat('e',64));token:=(r->>'token')::uuid;
 update noshashi.billing_account_leases set expires_at=clock_timestamp()-interval '1 second' where account_id=acct;
 r:=noshashi.billing_claim('evt_newlease',acct,repeat('f',64));
 begin
  perform noshashi.billing_apply_credits('evt_stale',acct,token,'cs_test_stale',10000,100,'usd');raise exception 'FAILED: lost lease committed';
 exception when serialization_failure then null; end;
 perform noshashi.billing_release(acct,(r->>'token')::uuid);
 -- A failed arithmetic/storage operation cannot consume its event receipt.
 update noshashi.entitlements set verification_quota=2147483640 where account_id=acct;
 r:=noshashi.billing_claim('evt_overflow',acct,repeat('a',64));token:=(r->>'token')::uuid;
 begin
  perform noshashi.billing_apply_credits('evt_overflow',acct,token,'cs_test_overflow',10000,100,'usd');raise exception 'FAILED: quota overflow';
 exception when numeric_value_out_of_range then null; end;
 if exists(select 1 from noshashi.billing_credit_purchases where session_id='cs_test_overflow') or exists(select 1 from noshashi.billing_event_receipts where event_id='evt_overflow' and applied_at is not null) then raise exception 'FAILED: partial credit commit'; end if;
 perform noshashi.billing_release(acct,token);
 update noshashi.entitlements set verification_quota=0 where account_id=acct;
 sub:=jsonb_build_object('stripe_subscription_id','sub_old','stripe_customer_id','cus_fixture','price_id','price_fixture','tier','desk','status','active','seats',1,'current_period_end',now()+interval '30 days','cancel_at_period_end',false);
 r:=noshashi.billing_claim('evt_sub1',acct,repeat('b',64));token:=(r->>'token')::uuid;
 perform noshashi.billing_apply_subscription('evt_sub1',acct,token,sub,catalog);
 update noshashi.entitlements set verification_quota=4000 where account_id=acct;
 r:=noshashi.billing_claim('evt_metadata',acct,repeat('c',64));token:=(r->>'token')::uuid;
 perform noshashi.billing_apply_subscription('evt_metadata',acct,token,sub,catalog);
 if (select verification_quota from noshashi.entitlements where account_id=acct)<>4000 then raise exception 'FAILED: same-period event refilled quota'; end if;
 -- A new purchase remains active when the old subscription cancels late.
 sub:=sub||'{"stripe_subscription_id":"sub_new"}'::jsonb;
 r:=noshashi.billing_claim('evt_newsub',acct,repeat('d',64));token:=(r->>'token')::uuid;
 perform noshashi.billing_apply_subscription('evt_newsub',acct,token,sub,catalog);
 sub:=sub||'{"stripe_subscription_id":"sub_old","status":"canceled"}'::jsonb;
 r:=noshashi.billing_claim('evt_oldcancel',acct,repeat('e',64));token:=(r->>'token')::uuid;
 perform noshashi.billing_apply_subscription('evt_oldcancel',acct,token,sub,catalog);
 if (select tier from noshashi.entitlements where account_id=acct)<>'desk' then raise exception 'FAILED: older cancellation removed current access'; end if;
 sub:=sub||'{"stripe_subscription_id":"sub_new"}'::jsonb;
 r:=noshashi.billing_claim('evt_cancel',acct,repeat('f',64));token:=(r->>'token')::uuid;
 perform noshashi.billing_apply_subscription('evt_cancel',acct,token,sub,catalog);
 if (select tier from noshashi.entitlements where account_id=acct)<>'operator' then raise exception 'FAILED: cancellation not revoked'; end if;
 -- A subscription write and its entitlement update must roll back together.
 sub:=sub||'{"status":"active"}'::jsonb;
 r:=noshashi.billing_claim('evt_badgrant',acct,repeat('a',64));token:=(r->>'token')::uuid;
 begin
  perform noshashi.billing_apply_subscription('evt_badgrant',acct,token,sub,'{}');raise exception 'FAILED: missing grant catalog';
 exception when invalid_parameter_value then null; end;
 if (select status from noshashi.subscriptions where stripe_subscription_id='sub_new')<>'canceled' or exists(select 1 from noshashi.billing_event_receipts where event_id='evt_badgrant' and applied_at is not null) then raise exception 'FAILED: partial subscription commit'; end if;
 perform noshashi.billing_release(acct,token);
 raise notice 'BILLING FULFILLMENT TEST PASSED';
end $$;
rollback;
