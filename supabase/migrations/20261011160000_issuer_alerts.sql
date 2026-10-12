-- Issuer alerts: tell a holder the moment an XRPL issuer's powers change.
--
-- 1. issuer_alert_subscriptions: who to tell, where (a Discord channel
--    webhook or a Telegram chat), about which issuer. A Discord webhook URL
--    is a credential — anyone holding it can post to the channel — so the
--    table is service-role only: RLS on, no policies.
-- 2. issuer_alert_state: the last reading of each watched issuer, the
--    baseline the next reading is compared with.
-- 3. Every five minutes pg_cron calls the noshashi-issuer-alerts edge
--    function, only while a subscription is active, authenticating with a
--    random token kept in Vault (the pattern noshashi-xrpl-watch uses; the
--    database never holds the service-role key).

create table if not exists noshashi.issuer_alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  issuer text not null check (issuer ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  channel text not null check (channel in ('discord', 'telegram')),
  target text not null check (
    (channel = 'discord' and target ~ '^https://(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)/api/webhooks/[0-9]{15,22}/[A-Za-z0-9_-]{30,100}$')
    or (channel = 'telegram' and target ~ '^-?[0-9]{1,20}$')
  ),
  unsubscribe_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  active boolean not null default true,
  failures integer not null default 0,
  created_at timestamptz not null default now(),
  last_notified_at timestamptz,
  unique (issuer, channel, target)
);

create index if not exists issuer_alert_subscriptions_active_issuer
  on noshashi.issuer_alert_subscriptions (issuer) where active;
create index if not exists issuer_alert_subscriptions_target
  on noshashi.issuer_alert_subscriptions (channel, target) where active;

create table if not exists noshashi.issuer_alert_state (
  issuer text primary key check (issuer ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  powers jsonb not null,
  ledger_index bigint,
  checked_at timestamptz not null default now()
);

alter table noshashi.issuer_alert_subscriptions enable row level security;
alter table noshashi.issuer_alert_state enable row level security;
revoke all on noshashi.issuer_alert_subscriptions from anon, authenticated;
revoke all on noshashi.issuer_alert_state from anon, authenticated;
grant select, insert, update on noshashi.issuer_alert_subscriptions to service_role;
grant select, insert, update on noshashi.issuer_alert_state to service_role;

-- ── The tick ─────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'noshashi_issuer_alerts_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'noshashi_issuer_alerts_token',
                                'Bearer token pg_cron uses to call the noshashi-issuer-alerts edge function.');
  end if;
  if not exists (select 1 from vault.secrets where name = 'noshashi_functions_url') then
    perform vault.create_secret('https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1', 'noshashi_functions_url',
                                'Base URL of this project''s edge functions.');
  end if;
end;
$$;

create or replace function noshashi.issuer_alerts_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_token) = 64 and p_token = (
    select decrypted_secret from vault.decrypted_secrets where name = 'noshashi_issuer_alerts_token'), false);
$$;

-- Does nothing, and costs nothing, while no one is subscribed.
create or replace function noshashi.issuer_alerts_kick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  token text;
begin
  if not exists (select 1 from noshashi.issuer_alert_subscriptions where active) then return null; end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'noshashi_functions_url';
  select decrypted_secret into token from vault.decrypted_secrets where name = 'noshashi_issuer_alerts_token';
  if base is null or token is null then return null; end if;
  return net.http_post(
    url := base || '/noshashi-issuer-alerts/tick',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    timeout_milliseconds := 120000);
end;
$$;

revoke execute on function noshashi.issuer_alerts_kick() from public, anon, authenticated;
revoke execute on function noshashi.issuer_alerts_token_ok(text) from public, anon, authenticated;
grant execute on function noshashi.issuer_alerts_token_ok(text) to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'noshashi-issuer-alerts';
select cron.schedule('noshashi-issuer-alerts', '*/5 * * * *', 'select noshashi.issuer_alerts_kick()');
