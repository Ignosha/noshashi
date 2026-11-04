-- Payment Review is private account data. Public XRPL tools remain unchanged.
create table noshashi.payment_review_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references noshashi.accounts(id) on delete cascade,
  request_key text not null check (length(request_key) between 8 and 128),
  payload_hash text not null,
  records integer not null check (records between 1 and 25),
  charged_records integer,
  period_start date not null,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  unique(account_id,request_key)
);
create table noshashi.payment_review_usage (
  account_id uuid not null references noshashi.accounts(id) on delete cascade,
  period_start date not null,
  records integer not null default 0 check(records >= 0),
  primary key(account_id,period_start)
);
create table noshashi.payment_review_billing_holds (
  event_id text primary key,
  stripe_customer_id text not null,
  reason text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create table noshashi.payment_review_customers (
  account_id uuid primary key references noshashi.accounts(id) on delete cascade,
  stripe_customer_id text not null unique
);
create table noshashi.payment_review_checkouts (
  account_id uuid primary key references noshashi.accounts(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  price_id text not null,
  url text,
  expires_at timestamptz not null default now()+interval '25 hours'
);
alter table noshashi.payment_review_runs enable row level security;
alter table noshashi.payment_review_usage enable row level security;
alter table noshashi.payment_review_billing_holds enable row level security;
alter table noshashi.payment_review_customers enable row level security;
alter table noshashi.payment_review_checkouts enable row level security;
revoke all on noshashi.payment_review_runs,noshashi.payment_review_usage,noshashi.payment_review_billing_holds from public,anon,authenticated;
grant all on noshashi.payment_review_runs,noshashi.payment_review_usage,noshashi.payment_review_billing_holds to service_role;
revoke all on noshashi.payment_review_customers,noshashi.payment_review_checkouts from public,anon,authenticated;
grant all on noshashi.payment_review_customers,noshashi.payment_review_checkouts to service_role;

create function noshashi.payment_review_checkout_claim(p_account uuid,p_price text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,noshashi as $$
declare r noshashi.payment_review_checkouts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account::text,0));
  select * into r from noshashi.payment_review_checkouts where account_id=p_account for update;
  if not found or r.expires_at<=now() then
    insert into noshashi.payment_review_checkouts(account_id,price_id) values(p_account,p_price)
      on conflict(account_id) do update set id=gen_random_uuid(),price_id=excluded.price_id,url=null,expires_at=now()+interval '25 hours'
      returning * into r;
  end if;
  return to_jsonb(r);
end;
$$;
revoke all on function noshashi.payment_review_checkout_claim(uuid,text) from public,anon,authenticated;
grant execute on function noshashi.payment_review_checkout_claim(uuid,text) to service_role;

create function noshashi.payment_review_create_key(p_account uuid,p_name text,p_prefix text,p_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,noshashi as $$
declare r noshashi.api_keys;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account::text,0));
  if (select count(*) from noshashi.api_keys where account_id=p_account and 'payment_review'=any(scopes)
    and revoked_at is null and (expires_at is null or expires_at>now()))>=10 then
    return jsonb_build_object('error','Revoke an existing key before creating another. Maximum 10 active keys.');
  end if;
  insert into noshashi.api_keys(account_id,name,prefix,key_hash,scopes,expires_at)
    values(p_account,left(p_name,80),p_prefix,p_hash,array['payment_review'],now()+interval '90 days') returning * into r;
  return jsonb_build_object('id',r.id,'name',r.name,'prefix',r.prefix,'expires_at',r.expires_at);
end;
$$;
revoke all on function noshashi.payment_review_create_key(uuid,text,text,text) from public,anon,authenticated;
grant execute on function noshashi.payment_review_create_key(uuid,text,text,text) to service_role;

-- Server-derived tier. Expired, failed, refunded or disputed billing cannot
-- grant extra capacity. Holds need an explicit operator review to resolve.
create function noshashi.payment_review_tier(p_account uuid)
returns text language sql stable security definer set search_path=pg_catalog,noshashi as $$
  select coalesce((select e.tier from noshashi.entitlements e
    where e.account_id=p_account and e.tier<>'operator' and e.valid_until>now()
    and exists(select 1 from noshashi.subscriptions s where s.account_id=e.account_id
      and s.tier=e.tier and s.status in ('active','trialing') and s.current_period_end>now()
      and not exists(select 1 from noshashi.payment_review_billing_holds h
        where h.stripe_customer_id=s.stripe_customer_id and h.resolved_at is null))
  ),'operator');
$$;

-- Reserve capacity and the idempotency key together, under an account lock.
-- The client cannot choose a tier, allowance, account or usage count.
create function noshashi.payment_review_begin(p_account uuid,p_key text,p_hash text,p_records integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,noshashi as $$
declare r noshashi.payment_review_runs; tier text; cap integer; per_batch integer;
  used integer; period date := date_trunc('month',now() at time zone 'UTC')::date;
begin
  if p_records not between 1 and 25 or length(p_key) not between 8 and 128 then
    raise exception 'Invalid batch';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_account::text,0));
  select * into r from noshashi.payment_review_runs where account_id=p_account and request_key=p_key;
  if found then
    if r.payload_hash<>p_hash then return jsonb_build_object('error','idempotency_conflict'); end if;
    return jsonb_build_object('replay',true,'id',r.id,'status',r.status,'result',r.result);
  end if;
  tier := noshashi.payment_review_tier(p_account);
  cap := case when tier='operator' then 25 when tier='desk' then 5000 else 100000 end;
  per_batch := case when tier='operator' then 5 else 25 end;
  if p_records>per_batch then return jsonb_build_object('error','batch_limit','limit',per_batch); end if;
  if (select count(*) from noshashi.payment_review_runs where account_id=p_account and created_at>now()-interval '1 minute')>=10
    then return jsonb_build_object('error','rate_limit'); end if;
  insert into noshashi.payment_review_usage(account_id,period_start) values(p_account,period) on conflict do nothing;
  update noshashi.payment_review_usage set records=records+p_records
    where account_id=p_account and period_start=period and records+p_records<=cap returning records into used;
  if not found then return jsonb_build_object('error','monthly_limit','limit',cap); end if;
  insert into noshashi.payment_review_runs(account_id,request_key,payload_hash,records,period_start)
    values(p_account,p_key,p_hash,p_records,period) returning * into r;
  return jsonb_build_object('id',r.id,'status',r.status,'replay',false,'tier',tier,'used',used,'limit',cap);
end;
$$;

create function noshashi.payment_review_finish(p_account uuid,p_id uuid,p_result jsonb,p_charge integer,p_failed boolean default false)
returns void language plpgsql security definer set search_path=pg_catalog,noshashi as $$
declare r noshashi.payment_review_runs;
begin
  select * into r from noshashi.payment_review_runs where id=p_id and account_id=p_account for update;
  if not found then raise exception 'Unknown run'; end if;
  if r.status<>'processing' then return; end if;
  if p_charge<0 or p_charge>r.records or p_result is null then raise exception 'Invalid completion'; end if;
  update noshashi.payment_review_usage set records=records-(r.records-p_charge)
    where account_id=p_account and period_start=r.period_start;
  update noshashi.payment_review_runs set status=case when p_failed then 'failed' else 'completed' end,
    result=p_result,charged_records=p_charge where id=r.id;
end;
$$;
revoke all on function noshashi.payment_review_tier(uuid),noshashi.payment_review_begin(uuid,text,text,integer),noshashi.payment_review_finish(uuid,uuid,jsonb,integer,boolean) from public,anon,authenticated;
grant execute on function noshashi.payment_review_tier(uuid),noshashi.payment_review_begin(uuid,text,text,integer),noshashi.payment_review_finish(uuid,uuid,jsonb,integer,boolean) to service_role;
