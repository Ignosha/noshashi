-- Draft only. Serialize account billing reconciliation; receipt and access
-- changes commit together. No live products, prices, keys or grants are seeded.
begin;
create table noshashi.billing_event_receipts (
 event_id text primary key,
 account_id uuid not null references noshashi.accounts(id),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 applied_at timestamptz,
 received_at timestamptz not null default now()
);
create table noshashi.billing_account_leases (
 account_id uuid primary key references noshashi.accounts(id),
 token uuid not null,
 expires_at timestamptz not null
);
create table noshashi.billing_credit_purchases (
 session_id text primary key,
 account_id uuid not null references noshashi.accounts(id),
 credits integer not null check(credits in (10000,50000,250000)),
 amount_cents integer not null check(amount_cents>0),
 currency text not null check(currency='usd'),
 recorded_at timestamptz not null default now()
);
alter table noshashi.billing_event_receipts enable row level security;
alter table noshashi.billing_account_leases enable row level security;
alter table noshashi.billing_credit_purchases enable row level security;
revoke all on noshashi.billing_event_receipts,noshashi.billing_account_leases,noshashi.billing_credit_purchases from public,anon,authenticated,service_role;

create function noshashi.billing_claim(p_event text,p_account uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt noshashi.billing_event_receipts; lease noshashi.billing_account_leases; next_token uuid:=gen_random_uuid();
begin
 if p_event is null or p_event !~ '^evt_[A-Za-z0-9]+$' or p_account is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then
  raise exception 'invalid_billing_event' using errcode='22023';
 end if;
 insert into noshashi.billing_account_leases values(p_account,next_token,now()) on conflict do nothing;
 select * into lease from noshashi.billing_account_leases where account_id=p_account for update;
 select * into receipt from noshashi.billing_event_receipts where event_id=p_event;
 if found then
  if receipt.account_id<>p_account or receipt.payload_hash<>p_hash then raise exception 'billing_event_conflict' using errcode='23505'; end if;
  if receipt.applied_at is not null then return jsonb_build_object('applied',true); end if;
 end if;
 if lease.expires_at>clock_timestamp() then return jsonb_build_object('busy',true); end if;
 insert into noshashi.billing_event_receipts(event_id,account_id,payload_hash) values(p_event,p_account,p_hash) on conflict do nothing;
 update noshashi.billing_account_leases set token=next_token,expires_at=clock_timestamp()+interval '60 seconds' where account_id=p_account;
 return jsonb_build_object('token',next_token);
end $$;

create function noshashi.billing_assert_lease(p_event text,p_account uuid,p_token uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from noshashi.billing_account_leases where account_id=p_account and token=p_token and expires_at>clock_timestamp() for update;
 if not found then raise exception 'billing_lease_lost' using errcode='40001'; end if;
 perform 1 from noshashi.billing_event_receipts where event_id=p_event and account_id=p_account and applied_at is null for update;
 if not found then raise exception 'billing_event_not_pending' using errcode='40001'; end if;
end $$;
create function noshashi.billing_release(p_account uuid,p_token uuid)
returns void language sql security definer set search_path='' as $$
 update noshashi.billing_account_leases set expires_at=clock_timestamp() where account_id=p_account and token=p_token;
$$;

create function noshashi.billing_apply_credits(p_event text,p_account uuid,p_token uuid,p_session text,p_credits integer,p_amount integer,p_currency text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior noshashi.billing_credit_purchases;
begin
 perform noshashi.billing_assert_lease(p_event,p_account,p_token);
 if p_session is null or p_session !~ '^cs_(test_|live_)?[A-Za-z0-9]+$' or p_credits is null or p_credits not in (10000,50000,250000) or p_amount is null or p_amount<=0 or p_currency is distinct from 'usd' then
  raise exception 'invalid_paid_credit_purchase' using errcode='22023';
 end if;
 select * into prior from noshashi.billing_credit_purchases where session_id=p_session;
 if found then
  if prior.account_id<>p_account or prior.credits<>p_credits or prior.amount_cents<>p_amount or prior.currency<>p_currency then
   raise exception 'billing_credit_conflict' using errcode='23505';
  end if;
 else
  insert into noshashi.billing_credit_purchases values(p_session,p_account,p_credits,p_amount,p_currency,now());
  update noshashi.entitlements set verification_quota=verification_quota+p_credits,updated_at=now() where account_id=p_account;
  if not found then raise exception 'billing_account_unavailable' using errcode='P0002'; end if;
 end if;
 update noshashi.billing_event_receipts set applied_at=now() where event_id=p_event;
 perform noshashi.billing_release(p_account,p_token);
 return jsonb_build_object('applied',true);
end $$;

create function noshashi.billing_apply_subscription(p_event text,p_account uuid,p_token uuid,p_subscription jsonb,p_catalog jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_sub noshashi.subscriptions; old_entitlement noshashi.entitlements;
 effective noshashi.subscriptions; grant_row jsonb; granting text; reset_quota boolean;
 sub_id text:=p_subscription->>'stripe_subscription_id';
 active_now boolean:=(p_subscription->>'status') in ('active','trialing');
begin
 perform noshashi.billing_assert_lease(p_event,p_account,p_token);
 if sub_id is null or sub_id !~ '^sub_[A-Za-z0-9]+$' or p_subscription->>'stripe_customer_id' is null
 or p_subscription->>'tier' not in ('operator','desk','institution','enterprise','strategic')

 or (active_now and nullif(p_subscription->>'current_period_end','') is null) then
  raise exception 'invalid_billing_subscription' using errcode='22023';
 end if;
 select * into old_sub from noshashi.subscriptions where stripe_subscription_id=sub_id for update;
 if found and old_sub.account_id<>p_account then raise exception 'billing_account_conflict' using errcode='23505'; end if;
 insert into noshashi.subscriptions(account_id,stripe_customer_id,stripe_subscription_id,price_id,tier,status,seats,current_period_end,cancel_at_period_end)
 values(p_account,p_subscription->>'stripe_customer_id',sub_id,p_subscription->>'price_id',p_subscription->>'tier',p_subscription->>'status',(p_subscription->>'seats')::integer,(p_subscription->>'current_period_end')::timestamptz,coalesce((p_subscription->>'cancel_at_period_end')::boolean,false))
 on conflict(stripe_subscription_id) do update set price_id=excluded.price_id,tier=excluded.tier,status=excluded.status,seats=excluded.seats,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=now();
 -- Recompute from all current account subscriptions. A delayed cancellation
 -- for an older purchase cannot remove a newer valid subscription's access.
 select * into effective from noshashi.subscriptions
 where account_id=p_account and status in ('active','trialing') and current_period_end>now()
 order by array_position(array['operator','desk','institution','enterprise','strategic'],tier) desc,
 current_period_end desc,stripe_subscription_id limit 1;
 granting:=coalesce(effective.tier,'operator');
 grant_row:=p_catalog->granting;
 if grant_row is null or jsonb_typeof(grant_row->'features') is distinct from 'array' or (grant_row->>'verification_quota')::integer<0 then
  raise exception 'billing_catalog_unavailable' using errcode='22023';
 end if;
 select * into old_entitlement from noshashi.entitlements where account_id=p_account for update;
 reset_quota:=old_entitlement.account_id is null or old_entitlement.tier is distinct from granting
   or old_entitlement.valid_until is distinct from effective.current_period_end;
 insert into noshashi.entitlements(account_id,tier,seats,features,verification_quota,valid_until)
 values(p_account,granting,coalesce(effective.seats,1),array(select jsonb_array_elements_text(grant_row->'features')),(grant_row->>'verification_quota')::integer,effective.current_period_end)
 on conflict(account_id) do update set tier=excluded.tier,seats=excluded.seats,features=excluded.features,
 verification_quota=case when reset_quota then excluded.verification_quota else noshashi.entitlements.verification_quota end,
 valid_until=excluded.valid_until,updated_at=now();
 update noshashi.billing_event_receipts set applied_at=now() where event_id=p_event;
 perform noshashi.billing_release(p_account,p_token);
 return jsonb_build_object('applied',true);
end $$;
revoke all on function noshashi.billing_claim(text,uuid,text),noshashi.billing_assert_lease(text,uuid,uuid),noshashi.billing_release(uuid,uuid),noshashi.billing_apply_credits(text,uuid,uuid,text,integer,integer,text),noshashi.billing_apply_subscription(text,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function noshashi.billing_claim(text,uuid,text),noshashi.billing_release(uuid,uuid),noshashi.billing_apply_credits(text,uuid,uuid,text,integer,integer,text),noshashi.billing_apply_subscription(text,uuid,uuid,jsonb,jsonb) to service_role;
commit;
