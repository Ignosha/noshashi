-- Issuer Watch: the paid, emailed form of the issuer alerts.
--
-- A subscription can now be delivered by email. Email subscriptions are
-- only ever written by noshashi-stripe-webhook, for a paid Stripe
-- subscription (metadata.product = issuer_watch), and are switched off
-- when that subscription stops being active. The public /subscribe route
-- still only accepts Discord and Telegram, so nobody can sign an address
-- up for mail it did not ask for.

alter table noshashi.issuer_alert_subscriptions
  drop constraint if exists issuer_alert_subscriptions_channel_check;
alter table noshashi.issuer_alert_subscriptions
  add constraint issuer_alert_subscriptions_channel_check
  check (channel in ('discord', 'telegram', 'email'));

alter table noshashi.issuer_alert_subscriptions
  drop constraint if exists issuer_alert_subscriptions_check;
alter table noshashi.issuer_alert_subscriptions
  add constraint issuer_alert_subscriptions_check check (
    (channel = 'discord' and target ~ '^https://(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)/api/webhooks/[0-9]{15,22}/[A-Za-z0-9_-]{30,100}$')
    or (channel = 'telegram' and target ~ '^-?[0-9]{1,20}$')
    or (channel = 'email' and target ~ '^[^@\s]{1,64}@[^@\s]{1,255}$')
  );

alter table noshashi.issuer_alert_subscriptions
  add column if not exists stripe_subscription_id text,
  add column if not exists label text;

-- One row per paid subscription: Stripe retries and repeated events
-- update it rather than adding another.
create unique index if not exists issuer_alert_subscriptions_stripe
  on noshashi.issuer_alert_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;
