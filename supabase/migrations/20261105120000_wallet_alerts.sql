-- Treasury Guard, hosted: alert a Discord channel or Telegram chat when a
-- watched treasury wallet transacts, even while the desktop app is closed.
--
-- Same shape and rules as the issuer alerts (20261011160000_issuer_alerts.sql):
-- the subscription table holds Discord webhook URLs, which are credentials,
-- so it is service-role only (RLS on, no policies). The existing five-minute
-- pg_cron tick now also runs while any wallet subscription is active.

create table if not exists noshashi.wallet_alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  wallet text not null check (wallet ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
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
  unique (wallet, channel, target)
);

create index if not exists wallet_alert_subscriptions_active_wallet
  on noshashi.wallet_alert_subscriptions (wallet) where active;
create index if not exists wallet_alert_subscriptions_target
  on noshashi.wallet_alert_subscriptions (channel, target) where active;

-- The last validated ledger read in full for each wallet. Alerts cover
-- only what validates after it.
create table if not exists noshashi.wallet_alert_state (
  wallet text primary key check (wallet ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  last_ledger bigint not null check (last_ledger > 0),
  checked_at timestamptz not null default now()
);

alter table noshashi.wallet_alert_subscriptions enable row level security;
alter table noshashi.wallet_alert_state enable row level security;
revoke all on noshashi.wallet_alert_subscriptions from anon, authenticated;
revoke all on noshashi.wallet_alert_state from anon, authenticated;
grant select, insert, update on noshashi.wallet_alert_subscriptions to service_role;
grant select, insert, update on noshashi.wallet_alert_state to service_role;

-- Does nothing, and costs nothing, while no one is subscribed to either.
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
  if not exists (select 1 from noshashi.issuer_alert_subscriptions where active)
     and not exists (select 1 from noshashi.wallet_alert_subscriptions where active) then
    return null;
  end if;
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
