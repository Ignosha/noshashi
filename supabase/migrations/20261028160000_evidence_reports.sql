-- The Ledger Evidence Report, delivered automatically.
--
-- noshashi-stripe-webhook writes an order and its schedule when Stripe
-- confirms the payment; noshashi-evidence-report builds each delivery when
-- it falls due and emails it. pg_cron wakes it hourly, and only while a
-- delivery is due. The schedule each tier buys is in
-- supabase/functions/_shared/evidenceReport.ts.

create table if not exists noshashi.evidence_report_orders (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  stripe_session_id text not null unique,
  tier              text not null check (tier in ('standard', 'quarterly', 'audit')),
  email             text not null,
  organization      text,
  issuers           text[] not null default '{}',
  wallets           text[] not null default '{}',
  books             text[] not null default '{}',
  period_end        date,
  amount_cents      integer not null,
  currency          text not null default 'usd',
  created_at        timestamptz not null default now()
);

create table if not exists noshashi.evidence_report_deliveries (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references noshashi.evidence_report_orders(id) on delete cascade,
  seq            integer not null,
  period_end     date,
  due_on         date not null,
  status         text not null default 'due' check (status in ('due', 'running', 'retry', 'sent', 'needs_attention')),
  attempts       integer not null default 0,
  last_error     text,
  report_sha256  text unique,
  ledger_indexes jsonb,
  started_at     timestamptz,
  generated_at   timestamptz,
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  unique (order_id, seq)
);

create index if not exists evidence_report_deliveries_due on noshashi.evidence_report_deliveries (due_on) where status in ('due', 'retry', 'running');

alter table noshashi.evidence_report_orders enable row level security;
alter table noshashi.evidence_report_deliveries enable row level security;
revoke all on noshashi.evidence_report_orders from anon, authenticated;
revoke all on noshashi.evidence_report_deliveries from anon, authenticated;
grant select, insert, update on noshashi.evidence_report_orders to service_role;
grant select, insert, update on noshashi.evidence_report_deliveries to service_role;

-- ── Claiming due work ────────────────────────────────────────────────

-- Marks up to p_limit due deliveries as running and returns them, so two
-- ticks never build the same report. A delivery left running for half an
-- hour (the function died mid-build) is due again.
create or replace function noshashi.evidence_reports_claim(p_limit integer)
returns setof noshashi.evidence_report_deliveries
language sql
security definer
set search_path = ''
as $$
  update noshashi.evidence_report_deliveries d
     set status = 'running', attempts = d.attempts + 1, started_at = now()
   where d.id in (
     select id from noshashi.evidence_report_deliveries
      where due_on <= (now() at time zone 'utc')::date
        and (status in ('due', 'retry') or (status = 'running' and started_at < now() - interval '30 minutes'))
      order by due_on, created_at
      limit greatest(1, least(p_limit, 10))
      for update skip locked)
  returning d.*;
$$;

-- ── The tick ─────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'noshashi_evidence_reports_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'noshashi_evidence_reports_token',
                                'Bearer token pg_cron uses to call the noshashi-evidence-report edge function.');
  end if;
  if not exists (select 1 from vault.secrets where name = 'noshashi_functions_url') then
    perform vault.create_secret('https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1', 'noshashi_functions_url',
                                'Base URL of this project''s edge functions.');
  end if;
end;
$$;

create or replace function noshashi.evidence_reports_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_token) = 64 and p_token = (
    select decrypted_secret from vault.decrypted_secrets where name = 'noshashi_evidence_reports_token'), false);
$$;

-- Does nothing, and costs nothing, while no delivery is due.
create or replace function noshashi.evidence_reports_kick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  token text;
begin
  if not exists (
    select 1 from noshashi.evidence_report_deliveries
     where due_on <= (now() at time zone 'utc')::date
       and (status in ('due', 'retry') or (status = 'running' and started_at < now() - interval '30 minutes'))
  ) then return null; end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'noshashi_functions_url';
  select decrypted_secret into token from vault.decrypted_secrets where name = 'noshashi_evidence_reports_token';
  if base is null or token is null then return null; end if;
  return net.http_post(
    url := base || '/noshashi-evidence-report/tick',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    timeout_milliseconds := 150000);
end;
$$;

revoke execute on function noshashi.evidence_reports_claim(integer) from public, anon, authenticated;
revoke execute on function noshashi.evidence_reports_token_ok(text) from public, anon, authenticated;
revoke execute on function noshashi.evidence_reports_kick() from public, anon, authenticated;
grant execute on function noshashi.evidence_reports_claim(integer) to service_role;
grant execute on function noshashi.evidence_reports_token_ok(text) to service_role;
grant execute on function noshashi.evidence_reports_kick() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'noshashi-evidence-reports';
select cron.schedule('noshashi-evidence-reports', '23 * * * *', 'select noshashi.evidence_reports_kick()');
