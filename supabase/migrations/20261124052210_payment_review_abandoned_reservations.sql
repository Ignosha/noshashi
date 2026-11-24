-- Expire abandoned processing runs on batch submission, replay or run retrieval.
-- The ten-minute cutoff exceeds the expected maximum worker lifetime.
-- Claim and completion take the same account lock before editing quota.
create index if not exists payment_review_processing_age_idx
  on noshashi.payment_review_runs(account_id, created_at)
  where status='processing';

create function noshashi.payment_review_expire_runs(p_account uuid,p_id uuid,p_cutoff timestamptz)
returns void language plpgsql set search_path=pg_catalog,noshashi as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account::text,0));
  with expired as (
    update noshashi.payment_review_runs
    set status='failed', charged_records=0, result=jsonb_build_object(
      'code','reservation_expired',
      'error','Review expired before completion. Start a new request to retry.'
    )
    where account_id=p_account and status='processing'
      and (p_id is null or id=p_id)
      and created_at <= p_cutoff
    returning period_start, records
  ), refunds as (
    select period_start, sum(records)::integer as records
    from expired group by period_start
  )
  update noshashi.payment_review_usage as usage
  set records=usage.records-refunds.records
  from refunds
  where usage.account_id=p_account and usage.period_start=refunds.period_start;
end;
$$;

revoke all on function noshashi.payment_review_expire_runs(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function noshashi.payment_review_expire_runs(uuid,uuid,timestamptz) to service_role;

create function noshashi.payment_review_get_run(p_account uuid,p_id uuid)
returns jsonb language plpgsql set search_path=pg_catalog,noshashi as $$
declare
  run noshashi.payment_review_runs;
  cutoff constant timestamptz := clock_timestamp() - interval '10 minutes';
begin
  select * into run from noshashi.payment_review_runs where account_id=p_account and id=p_id;
  if not found then return null; end if;
  if run.status='processing' and run.created_at<=cutoff then
    perform noshashi.payment_review_expire_runs(p_account,p_id,cutoff);
    select * into run from noshashi.payment_review_runs where account_id=p_account and id=p_id;
    if not found then return null; end if;
  end if;
  return jsonb_build_object('id',run.id,'status',run.status,'result',run.result,'created_at',run.created_at);
end;
$$;

revoke all on function noshashi.payment_review_get_run(uuid,uuid) from public,anon,authenticated;
grant execute on function noshashi.payment_review_get_run(uuid,uuid) to service_role;

create or replace function noshashi.payment_review_begin(p_account uuid,p_key text,p_hash text,p_records integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,noshashi as $$
declare r noshashi.payment_review_runs; tier text; cap integer; per_batch integer;
  used integer; period date := date_trunc('month',now() at time zone 'UTC')::date;
begin
  if p_records not between 1 and 25 or length(p_key) not between 8 and 128 then
    raise exception 'Invalid batch';
  end if;
  -- Reclaim abandoned reservations before looking up the idempotency key
  -- or testing capacity. Preserve the terminal result for same-key replays.
  perform noshashi.payment_review_expire_runs(p_account, null, clock_timestamp() - interval '10 minutes');

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

create or replace function noshashi.payment_review_finish(p_account uuid,p_id uuid,p_result jsonb,p_charge integer,p_failed boolean default false)
returns void language plpgsql security definer set search_path=pg_catalog,noshashi as $$
declare r noshashi.payment_review_runs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account::text,0));
  select * into r from noshashi.payment_review_runs where id=p_id and account_id=p_account for update;
  if not found then raise exception 'Unknown run'; end if;
  if r.status='failed' and r.result->>'code'='reservation_expired' then
    raise exception 'Payment Review reservation expired' using errcode = 'PR001';
  end if;
  if r.status<>'processing' then return; end if;
  if p_charge<0 or p_charge>r.records or p_result is null then raise exception 'Invalid completion'; end if;
  update noshashi.payment_review_usage set records=records-(r.records-p_charge)
    where account_id=p_account and period_start=r.period_start;
  update noshashi.payment_review_runs set status=case when p_failed then 'failed' else 'completed' end,
    result=p_result,charged_records=p_charge where id=r.id;
end;
$$;
