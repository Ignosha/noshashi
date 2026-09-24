-- Organization webhooks: signed event delivery to an institution's own systems.
--
--   NOSHASHI event (already recorded by the server) → matching webhooks →
--   signed HTTPS POST → delivery record with the response.
--
-- Events come only from records the server already writes — the audit log
-- (policy activation, exception request and decision, investigation opened
-- and closed) and API verifications recorded against an organization — so
-- no client can make one up. Each delivery is signed with HMAC-SHA256 over
-- "<timestamp>.<body>" using a secret shown to the creator once:
--
--   X-Noshashi-Signature: t=<unix seconds>,v1=<hex hmac>
--
-- Delivery is by pg_net (asynchronous, after commit: a rolled-back action
-- sends nothing). A pg_cron job records each response and retries a failed
-- delivery with backoff, up to three attempts in all. Owners and admins manage
-- webhooks; the secret is never readable afterwards.
--
-- XRPL-side events a workstation detects (issuer changes, credential
-- expiry, liquidity) are not server records yet and are not sent.

create extension if not exists pg_net with schema extensions;

create or replace function noshashi.webhook_url_allowed(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- HTTPS to a public DNS name only: no IP literals, no local or internal
  -- names, no Supabase hosts — the delivery originates inside the platform.
  select coalesce(
    p_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?(/[^\s]*)?$'
    and length(p_url) <= 2048
    and not (substring(p_url from '^https://([^/:]+)') ~ '^[0-9.]+$')
    and lower(substring(p_url from '^https://([^/:]+)')) !~ '(^localhost$|\.localhost$|\.local$|\.internal$|\.arpa$|supabase\.(co|in|net|com)$)'
    and position('.' in substring(p_url from '^https://([^/:]+)')) > 0,
    false);
$$;

create table if not exists noshashi.org_webhooks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references noshashi.organizations(id) on delete restrict,
  url             text not null check (noshashi.webhook_url_allowed(url)),
  description     text check (description is null or length(description) <= 200),
  events          text[] not null check (
                    cardinality(events) > 0 and events <@ array[
                      'policy_activated', 'policy_exception', 'exception_decided',
                      'investigation_created', 'investigation_resolved', 'receipt_created'
                    ]::text[]),
  secret          text not null,
  active          boolean not null default true,
  created_by      uuid not null references noshashi.accounts(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists org_webhooks_org_idx on noshashi.org_webhooks (organization_id) where active;

create table if not exists noshashi.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  webhook_id      uuid not null references noshashi.org_webhooks(id) on delete restrict,
  organization_id uuid not null references noshashi.organizations(id) on delete restrict,
  event           text not null,
  payload         jsonb not null,
  attempt         integer not null default 0,
  status          text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  request_id      bigint,
  response_status integer,
  error           text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  completed_at    timestamptz
);

create index if not exists webhook_deliveries_org_idx on noshashi.webhook_deliveries (organization_id, created_at desc);
create index if not exists webhook_deliveries_pending_idx on noshashi.webhook_deliveries (status) where status in ('sent', 'failed');

alter table noshashi.org_webhooks enable row level security;
alter table noshashi.webhook_deliveries enable row level security;

drop policy if exists org_webhooks_select_admin on noshashi.org_webhooks;
create policy org_webhooks_select_admin on noshashi.org_webhooks
  for select to authenticated
  using (noshashi.has_org_role(organization_id, array['owner','admin']::noshashi.member_role[]));

drop policy if exists webhook_deliveries_select_admin on noshashi.webhook_deliveries;
create policy webhook_deliveries_select_admin on noshashi.webhook_deliveries
  for select to authenticated
  using (noshashi.has_org_role(organization_id, array['owner','admin']::noshashi.member_role[]));

-- The secret is never readable by a client; every write goes through the functions below.
revoke all on noshashi.org_webhooks, noshashi.webhook_deliveries from anon, authenticated;
grant select (id, organization_id, url, description, events, active, created_by, created_at, updated_at)
  on noshashi.org_webhooks to authenticated;
grant select on noshashi.webhook_deliveries to authenticated;

-- Sign and send one delivery.
create or replace function noshashi.webhook_send(p_delivery uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d noshashi.webhook_deliveries;
  w noshashi.org_webhooks;
  ts text := extract(epoch from now())::bigint::text;
  sig text;
  rid bigint;
begin
  select * into d from noshashi.webhook_deliveries where id = p_delivery for update;
  select * into w from noshashi.org_webhooks where id = d.webhook_id;
  if d.id is null or w.id is null or not w.active or not noshashi.webhook_url_allowed(w.url) then
    update noshashi.webhook_deliveries set status = 'failed', error = 'webhook inactive or URL not allowed', completed_at = now()
      where id = p_delivery;
    return;
  end if;
  -- pg_net sends body::text; the signature is over exactly that text.
  sig := encode(extensions.hmac(convert_to(ts || '.' || d.payload::text, 'UTF8'), convert_to(w.secret, 'UTF8'), 'sha256'), 'hex');
  rid := net.http_post(
    url := w.url,
    body := d.payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'NOSHASHI-Webhooks/1',
      'X-Noshashi-Event', d.event,
      'X-Noshashi-Delivery', d.id::text,
      'X-Noshashi-Signature', 't=' || ts || ',v1=' || sig),
    timeout_milliseconds := 10000);
  update noshashi.webhook_deliveries
    set status = 'sent', request_id = rid, attempt = d.attempt + 1, sent_at = now(),
        response_status = null, error = null, completed_at = null
    where id = p_delivery;
end;
$$;

revoke execute on function noshashi.webhook_send(uuid) from public, anon, authenticated;

-- Queue an event for every active webhook of the organization that subscribes to it.
create or replace function noshashi.webhook_emit(p_org uuid, p_event text, p_data jsonb, p_only uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
  did uuid;
  n integer := 0;
begin
  for w in
    select id from noshashi.org_webhooks
    where organization_id = p_org and active
      and (case when p_only is not null then id = p_only else p_event = any(events) end)
  loop
    did := gen_random_uuid();
    insert into noshashi.webhook_deliveries (id, webhook_id, organization_id, event, payload)
      values (did, w.id, p_org, p_event, jsonb_build_object(
        'id', did, 'event', p_event, 'created_at', now(), 'organization_id', p_org, 'data', coalesce(p_data, '{}'::jsonb)));
    perform noshashi.webhook_send(did);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function noshashi.webhook_emit(uuid, text, jsonb, uuid) from public, anon, authenticated;

-- Server records → events.
create or replace function noshashi.webhook_from_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev text;
begin
  if new.organization_id is null then return new; end if;
  ev := case new.action
    when 'policy.activated' then 'policy_activated'
    when 'exception.requested' then 'policy_exception'
    when 'exception.approved' then 'exception_decided'
    when 'exception.rejected' then 'exception_decided'
    when 'case.opened' then 'investigation_created'
    when 'case.closed' then 'investigation_resolved'
    else null end;
  if ev is not null then
    perform noshashi.webhook_emit(new.organization_id, ev, jsonb_build_object(
      'action', new.action, 'entity_type', new.entity_type, 'entity_id', new.entity_id,
      'actor_account_id', new.actor_account_id, 'occurred_at', new.occurred_at,
      'state', new.new_state, 'audit_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists audit_log_webhooks on noshashi.audit_log;
create trigger audit_log_webhooks after insert on noshashi.audit_log
  for each row execute function noshashi.webhook_from_audit();

create or replace function noshashi.webhook_from_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is null then return new; end if;
  perform noshashi.webhook_emit(new.organization_id, 'receipt_created', jsonb_build_object(
    'receipt_digest', new.receipt_digest, 'verdict', new.verdict, 'domain_code', new.domain_code,
    'subject', coalesce(new.subject_address, new.subject), 'amount_xrp', new.amount_xrp,
    'policy_id', new.policy_id, 'policy_version', new.policy_version, 'policy_hash', new.policy_hash,
    'created_at', new.created_at));
  return new;
end;
$$;

drop trigger if exists verification_events_webhooks on noshashi.verification_events;
create trigger verification_events_webhooks after insert on noshashi.verification_events
  for each row execute function noshashi.webhook_from_verification();

-- Record responses; retry failures (three attempts in all; waits of 1 and 4 minutes).
create or replace function noshashi.webhook_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
begin
  update noshashi.webhook_deliveries x
    set status = case when r.status_code between 200 and 299 then 'delivered' else 'failed' end,
        response_status = r.status_code,
        error = case when r.status_code between 200 and 299 then null
                     else coalesce(r.error_msg, 'HTTP ' || r.status_code) end,
        completed_at = now()
    from net._http_response r
    where x.status = 'sent' and x.request_id = r.id;

  update noshashi.webhook_deliveries
    set status = 'failed', error = 'no response recorded', completed_at = now()
    where status = 'sent' and sent_at < now() - interval '15 minutes';

  for d in
    select id from noshashi.webhook_deliveries
    where status = 'failed' and attempt < 3
      and completed_at < now() - make_interval(mins => attempt * attempt)
    order by created_at
    limit 100
  loop
    perform noshashi.webhook_send(d.id);
  end loop;
end;
$$;

revoke execute on function noshashi.webhook_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'noshashi-webhook-tick';
select cron.schedule('noshashi-webhook-tick', '* * * * *', 'select noshashi.webhook_tick()');

-- Management (owner / admin).
create or replace function noshashi.create_org_webhook(p_org uuid, p_url text, p_events text[], p_description text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  wid uuid;
  sec text := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.has_org_role(p_org, array['owner','admin']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if not noshashi.webhook_url_allowed(p_url) then
    return jsonb_build_object('ok', false, 'code', 'URL_NOT_ALLOWED');
  end if;
  if p_events is null or cardinality(p_events) = 0 or not (p_events <@ array[
      'policy_activated', 'policy_exception', 'exception_decided',
      'investigation_created', 'investigation_resolved', 'receipt_created']::text[]) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVENTS');
  end if;
  insert into noshashi.org_webhooks (organization_id, url, description, events, secret, created_by)
    values (p_org, p_url, nullif(trim(coalesce(p_description, '')), ''), p_events, sec, me)
    returning id into wid;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values (p_org, me, 'webhook.created', 'webhook', wid::text, jsonb_build_object('url', p_url, 'events', p_events));
  -- The only time the secret leaves the database.
  return jsonb_build_object('ok', true, 'id', wid, 'secret', sec);
end;
$$;

create or replace function noshashi.set_org_webhook_active(p_webhook uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  org uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  select organization_id into org from noshashi.org_webhooks where id = p_webhook;
  if org is null or not noshashi.has_org_role(org, array['owner','admin']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  update noshashi.org_webhooks set active = p_active, updated_at = now() where id = p_webhook;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id)
    values (org, me, case when p_active then 'webhook.enabled' else 'webhook.disabled' end, 'webhook', p_webhook::text);
  return jsonb_build_object('ok', true, 'active', p_active);
end;
$$;

create or replace function noshashi.send_test_webhook(p_webhook uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  org uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  select organization_id into org from noshashi.org_webhooks where id = p_webhook and active;
  if org is null or not noshashi.has_org_role(org, array['owner','admin']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  perform noshashi.webhook_emit(org, 'ping', jsonb_build_object('message', 'Test delivery from NOSHASHI.', 'requested_by', me), p_webhook);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function noshashi.create_org_webhook(uuid, text, text[], text) from public, anon;
revoke execute on function noshashi.set_org_webhook_active(uuid, boolean) from public, anon;
revoke execute on function noshashi.send_test_webhook(uuid) from public, anon;
grant execute on function noshashi.create_org_webhook(uuid, text, text[], text) to authenticated;
grant execute on function noshashi.set_org_webhook_active(uuid, boolean) to authenticated;
grant execute on function noshashi.send_test_webhook(uuid) to authenticated;
