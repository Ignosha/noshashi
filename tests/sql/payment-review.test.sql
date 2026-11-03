-- needs: 20261103193000_payment_review_portal.sql
begin;
do $$
declare acct uuid := 'a0000000-0000-0000-0000-000000009901';
  r jsonb; rid uuid; used integer;
begin
  -- The local runner supplies this account; the full baseline uses auth.users.
  insert into auth.users(id,email) values(acct,'review-test@example.invalid') on conflict do nothing;
  insert into noshashi.accounts(id,email) values(acct,'review-test@example.invalid') on conflict do nothing;
  if has_function_privilege('authenticated','noshashi.payment_review_begin(uuid,text,text,integer)','execute') then raise exception 'FAILED: authenticated may reserve quota directly'; end if;
  if has_table_privilege('authenticated','noshashi.payment_review_runs','select') then raise exception 'FAILED: raw private runs exposed'; end if;
  if noshashi.payment_review_tier(acct)<>'operator' then raise exception 'FAILED: free tier'; end if;
  r:=noshashi.payment_review_begin(acct,'test-batch-001','hash-1',5);rid:=(r->>'id')::uuid;
  if r->>'tier'<>'operator' or (r->>'used')::integer<>5 then raise exception 'FAILED: initial reservation'; end if;
  r:=noshashi.payment_review_begin(acct,'test-batch-001','hash-1',5);
  if not (r->>'replay')::boolean then raise exception 'FAILED: not replay'; end if;
  r:=noshashi.payment_review_begin(acct,'test-batch-001','hash-2',5);
  if r->>'error'<>'idempotency_conflict' then raise exception 'FAILED: changed scope accepted'; end if;
  perform noshashi.payment_review_finish(acct,rid,'{"test":true}',2);
  perform noshashi.payment_review_finish(acct,rid,'{"test":true}',2);
  select records into used from noshashi.payment_review_usage where account_id=acct;
  if used<>2 then raise exception 'FAILED: refund or duplicate finalization'; end if;
  r:=noshashi.payment_review_begin(acct,'test-batch-002','hash-2',6);
  if r->>'error'<>'batch_limit' then raise exception 'FAILED: free batch cap'; end if;
  for i in 1..4 loop perform noshashi.payment_review_begin(acct,'fill-batch-'||i,'fill-'||i,5);end loop;
  r:=noshashi.payment_review_begin(acct,'test-batch-over','over',5);
  if r->>'error'<>'monthly_limit' then raise exception 'FAILED: quota exceeded'; end if;
  insert into noshashi.entitlements(account_id,tier,valid_until) values(acct,'desk',now()+interval '1 month') on conflict(account_id) do update set tier='desk',valid_until=excluded.valid_until;
  insert into noshashi.subscriptions(account_id,stripe_subscription_id,stripe_customer_id,tier,status,current_period_end)
    values(acct,'sub_review_test','cus_review_test','desk','active',now()+interval '1 month');
  if noshashi.payment_review_tier(acct)<>'desk' then raise exception 'FAILED: paid tier'; end if;
  insert into noshashi.payment_review_billing_holds(event_id,stripe_customer_id,reason) values('evt_review_test','cus_review_test','charge.refunded');
  if noshashi.payment_review_tier(acct)<>'operator' then raise exception 'FAILED: refund did not hold capacity'; end if;
  update noshashi.payment_review_billing_holds set resolved_at=now() where event_id='evt_review_test';
  update noshashi.subscriptions set status='past_due' where stripe_subscription_id='sub_review_test';
  if noshashi.payment_review_tier(acct)<>'operator' then raise exception 'FAILED: past due grants capacity'; end if;
  update noshashi.subscriptions set status='active' where stripe_subscription_id='sub_review_test';
  update noshashi.entitlements set valid_until=now()-interval '1 second' where account_id=acct;
  if noshashi.payment_review_tier(acct)<>'operator' then raise exception 'FAILED: expired entitlement grants capacity'; end if;
  r:=noshashi.payment_review_checkout_claim(acct,'price_monthly');rid:=(r->>'id')::uuid;
  r:=noshashi.payment_review_checkout_claim(acct,'price_annual');
  if (r->>'id')::uuid<>rid or r->>'price_id'<>'price_monthly' then raise exception 'FAILED: overlapping checkout reservations'; end if;
  for i in 1..10 loop
    r:=noshashi.payment_review_create_key(acct,'Test','nsh_review_test',lpad(i::text,64,'0'));
    if r->>'id' is null then raise exception 'FAILED: scoped key creation'; end if;
  end loop;
  r:=noshashi.payment_review_create_key(acct,'Extra','nsh_review_extra',repeat('A',64));
  if r->>'error' is null then raise exception 'FAILED: key cap'; end if;
  raise notice 'PAYMENT REVIEW SQL TEST PASSED';
end;
$$;
rollback;
