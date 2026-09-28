-- XRPL event feeds, deposit screening, custom export schemas.
--
-- 1. xrpl_watches: accounts an organization watches on the live ledger,
--    either to monitor (Strategic: event_feeds) or as deposit addresses
--    whose incoming payments are screened before they are credited
--    (Enterprise: deposit_screening).
-- 2. xrpl_events: what the watcher (edge function noshashi-xrpl-watch) read
--    from validated ledgers, one row per event, with the screening verdict
--    for deposits. Delivered to the organization's webhooks as the signed
--    events "xrpl_event" and "deposit_screened", and pulled through the
--    feed API as JSON or NDJSON.
-- 3. The watcher runs every minute from pg_cron, only while a watch is
--    active. It authenticates with a random token kept in Vault; the
--    database never holds the service-role key.
-- 4. Event history is kept per organization for event_retention_days.
-- 5. org_export_schemas: an organization's own record shapes for bulk
--    export of events and its audit log (Strategic: custom_schemas).

-- ── Plan grants ──────────────────────────────────────────────────────

update noshashi.entitlements
   set features = array_append(features, 'deposit_screening')
 where tier in ('enterprise', 'strategic')
   and not ('deposit_screening' = any(features));

-- ── Names ────────────────────────────────────────────────────────────

create or replace function noshashi.xrpl_event_type_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'payment_in', 'payment_out', 'payment_self', 'trustline_changed', 'trustline_frozen', 'trustline_unfrozen',
    'account_settings_changed', 'offer_created', 'offer_cancelled', 'check_created', 'check_cashed', 'check_cancelled',
    'escrow', 'clawback', 'nft', 'amm', 'rippled_through', 'other'
  ]::text[];
$$;

create or replace function noshashi.webhook_event_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'policy_activated', 'policy_exception', 'exception_decided',
    'exception_evidence_requested', 'exception_evidence_added',
    'investigation_created', 'investigation_resolved', 'receipt_created',
    'custom_alert', 'xrpl_event', 'deposit_screened'
  ]::text[];
$$;

-- ── Tables ───────────────────────────────────────────────────────────

alter table noshashi.organizations add column if not exists event_retention_days integer not null default 90;
alter table noshashi.organizations drop constraint if exists organizations_event_retention_days;
alter table noshashi.organizations add constraint organizations_event_retention_days
  check (event_retention_days between 7 and 3650);

create table if not exists noshashi.xrpl_watches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references noshashi.organizations(id) on delete cascade,
  address         text not null check (address ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  label           text check (label is null or char_length(label) <= 80),
  purpose         text not null default 'monitor' check (purpose in ('monitor', 'deposit')),
  event_types     text[] not null check (cardinality(event_types) > 0 and event_types <@ noshashi.xrpl_event_type_names()),
  deposit_config  jsonb not null default '{}'::jsonb check (jsonb_typeof(deposit_config) = 'object' and pg_column_size(deposit_config) <= 262144),
  active          boolean not null default true,
  -- The last validated ledger fully read. Null until the first read, which starts at the current ledger.
  last_ledger     bigint,
  last_polled_at  timestamptz,
  last_error      text,
  created_by      uuid not null references noshashi.accounts(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, address)
);

create index if not exists xrpl_watches_due_idx on noshashi.xrpl_watches (last_polled_at nulls first) where active;

create table if not exists noshashi.xrpl_events (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references noshashi.organizations(id) on delete cascade,
  -- Kept when the watch is removed: the events were read from the ledger and stay part of the record.
  watch_id        uuid references noshashi.xrpl_watches(id) on delete set null,
  address         text not null,
  event_type      text not null check (event_type = any(noshashi.xrpl_event_type_names())),
  tx_hash         text not null check (tx_hash ~ '^[0-9A-F]{64}$'),
  ledger_index    bigint not null,
  ledger_time     timestamptz,
  tx_type         text not null,
  tx_result       text not null,
  counterparty    text,
  data            jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 16384),
  screening       jsonb,
  verdict         text check (verdict in ('clear', 'review', 'hold')),
  created_at      timestamptz not null default now()
);

create unique index if not exists xrpl_events_once on noshashi.xrpl_events
  (organization_id, address, tx_hash, event_type, (coalesce(counterparty, '')));
create index if not exists xrpl_events_feed_idx on noshashi.xrpl_events (organization_id, id);
create index if not exists xrpl_events_age_idx on noshashi.xrpl_events (created_at);

create table if not exists noshashi.org_export_schemas (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references noshashi.organizations(id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 1 and 80),
  dataset         text not null check (dataset in ('events', 'audit')),
  format          text not null default 'csv' check (format in ('csv', 'ndjson', 'json')),
  -- [{ "path": "data.delivered.value", "as": "amount" }, …]
  fields          jsonb not null check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) between 1 and 100),
  created_by      uuid not null references noshashi.accounts(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

alter table noshashi.xrpl_watches enable row level security;
alter table noshashi.xrpl_events enable row level security;
alter table noshashi.org_export_schemas enable row level security;

drop policy if exists xrpl_watches_select_member on noshashi.xrpl_watches;
create policy xrpl_watches_select_member on noshashi.xrpl_watches
  for select to authenticated using (noshashi.is_org_member(organization_id));

drop policy if exists xrpl_events_select_member on noshashi.xrpl_events;
create policy xrpl_events_select_member on noshashi.xrpl_events
  for select to authenticated using (noshashi.is_org_member(organization_id));

drop policy if exists org_export_schemas_select_member on noshashi.org_export_schemas;
create policy org_export_schemas_select_member on noshashi.org_export_schemas
  for select to authenticated using (noshashi.is_org_member(organization_id));

-- Every write goes through the functions below.
revoke all on noshashi.xrpl_watches, noshashi.xrpl_events, noshashi.org_export_schemas from anon, authenticated;
grant select on noshashi.xrpl_watches, noshashi.xrpl_events, noshashi.org_export_schemas to authenticated;
-- The watcher and the feed API read with the service role.
grant select, insert, update, delete on noshashi.xrpl_watches, noshashi.xrpl_events, noshashi.org_export_schemas to service_role;

-- ── Managing watches ─────────────────────────────────────────────────

create or replace function noshashi.xrpl_watch_feature(p_purpose text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_purpose when 'deposit' then 'deposit_screening' else 'event_feeds' end;
$$;

create or replace function noshashi.add_xrpl_watch(
  p_org uuid, p_address text, p_label text, p_purpose text, p_event_types text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  wid uuid;
  types text[];
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.has_org_role(p_org, array['owner','admin','compliance','risk']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if p_purpose is null or p_purpose not in ('monitor', 'deposit') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PURPOSE');
  end if;
  if not noshashi.org_has_feature(p_org, noshashi.xrpl_watch_feature(p_purpose)) then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_NOT_IN_PLAN');
  end if;
  if p_address is null or p_address !~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ADDRESS');
  end if;
  -- Deposit addresses record what comes in and what the account itself does.
  types := coalesce(p_event_types, case when p_purpose = 'deposit'
    then array['payment_in','payment_out','trustline_changed','trustline_frozen','trustline_unfrozen','account_settings_changed','clawback']
    else array_remove(array_remove(noshashi.xrpl_event_type_names(), 'rippled_through'), 'other') end);
  if cardinality(types) = 0 or not (types <@ noshashi.xrpl_event_type_names()) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVENTS');
  end if;
  if (select count(*) from noshashi.xrpl_watches where organization_id = p_org) >= 100 then
    return jsonb_build_object('ok', false, 'code', 'WATCH_LIMIT');
  end if;
  if exists (select 1 from noshashi.xrpl_watches where organization_id = p_org and address = p_address) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_WATCHED');
  end if;
  insert into noshashi.xrpl_watches (organization_id, address, label, purpose, event_types, created_by)
    values (p_org, p_address, nullif(left(trim(coalesce(p_label, '')), 80), ''), p_purpose, types, me)
    returning id into wid;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values (p_org, me, 'xrpl_watch.created', 'xrpl_watch', wid::text,
            jsonb_build_object('address', p_address, 'purpose', p_purpose, 'event_types', types));
  return jsonb_build_object('ok', true, 'id', wid);
end;
$$;

create or replace function noshashi.update_xrpl_watch(
  p_watch uuid, p_label text default null, p_event_types text[] default null,
  p_active boolean default null, p_deposit_config jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  w noshashi.xrpl_watches;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  select * into w from noshashi.xrpl_watches where id = p_watch;
  if w.id is null or not noshashi.has_org_role(w.organization_id, array['owner','admin','compliance','risk']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p_event_types is not null and (cardinality(p_event_types) = 0 or not (p_event_types <@ noshashi.xrpl_event_type_names())) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVENTS');
  end if;
  if p_deposit_config is not null and (jsonb_typeof(p_deposit_config) <> 'object' or pg_column_size(p_deposit_config) > 262144) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CONFIG');
  end if;
  if p_active is true and not noshashi.org_has_feature(w.organization_id, noshashi.xrpl_watch_feature(w.purpose)) then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_NOT_IN_PLAN');
  end if;
  update noshashi.xrpl_watches set
    label = case when p_label is null then label else nullif(left(trim(p_label), 80), '') end,
    event_types = coalesce(p_event_types, event_types),
    active = coalesce(p_active, active),
    deposit_config = coalesce(p_deposit_config, deposit_config),
    updated_at = now()
  where id = p_watch;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state, new_state)
    values (w.organization_id, me, 'xrpl_watch.updated', 'xrpl_watch', w.id::text,
            jsonb_build_object('label', w.label, 'event_types', w.event_types, 'active', w.active,
                               'deny_list_entries', jsonb_array_length(coalesce(w.deposit_config->'denylist', '[]'::jsonb))),
            jsonb_strip_nulls(jsonb_build_object('label', p_label, 'event_types', p_event_types, 'active', p_active,
                               'deposit_config', case when p_deposit_config is null then null else
                                 p_deposit_config - 'denylist' || jsonb_build_object('deny_list_entries',
                                   jsonb_array_length(coalesce(p_deposit_config->'denylist', '[]'::jsonb))) end)));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function noshashi.remove_xrpl_watch(p_watch uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  w noshashi.xrpl_watches;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  select * into w from noshashi.xrpl_watches where id = p_watch;
  if w.id is null or not noshashi.has_org_role(w.organization_id, array['owner','admin','compliance','risk']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  delete from noshashi.xrpl_watches where id = p_watch;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state)
    values (w.organization_id, me, 'xrpl_watch.removed', 'xrpl_watch', w.id::text,
            jsonb_build_object('address', w.address, 'purpose', w.purpose, 'label', w.label));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function noshashi.set_event_retention(p_org uuid, p_days integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  before integer;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.has_org_role(p_org, array['owner','admin']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if not noshashi.org_has_feature(p_org, 'custom_schemas') then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_NOT_IN_PLAN');
  end if;
  if p_days is null or p_days < 7 or p_days > 3650 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TERM');
  end if;
  select event_retention_days into before from noshashi.organizations where id = p_org;
  update noshashi.organizations set event_retention_days = p_days where id = p_org;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state, new_state)
    values (p_org, me, 'settings.changed', 'organization', p_org::text,
            jsonb_build_object('event_retention_days', before), jsonb_build_object('event_retention_days', p_days));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Export schemas ───────────────────────────────────────────────────

create or replace function noshashi.save_export_schema(
  p_org uuid, p_id uuid, p_name text, p_dataset text, p_format text, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  sid uuid;
  f jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.has_org_role(p_org, array['owner','admin','compliance']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if not noshashi.org_has_feature(p_org, 'custom_schemas') then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_NOT_IN_PLAN');
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 80
     or p_dataset not in ('events', 'audit') or p_format not in ('csv', 'ndjson', 'json')
     or p_fields is null or jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) not between 1 and 100 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SCHEMA');
  end if;
  for f in select * from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(f) <> 'object'
       or coalesce(f->>'path', '') !~ '^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+){0,7}$'
       or coalesce(f->>'as', '') !~ '^[A-Za-z_][A-Za-z0-9_ .-]{0,62}$' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_SCHEMA');
    end if;
  end loop;
  if p_id is null then
    if (select count(*) from noshashi.org_export_schemas where organization_id = p_org) >= 50 then
      return jsonb_build_object('ok', false, 'code', 'SCHEMA_LIMIT');
    end if;
    insert into noshashi.org_export_schemas (organization_id, name, dataset, format, fields, created_by)
      values (p_org, trim(p_name), p_dataset, p_format, p_fields, me)
      on conflict (organization_id, name) do nothing
      returning id into sid;
    if sid is null then return jsonb_build_object('ok', false, 'code', 'NAME_TAKEN'); end if;
  else
    update noshashi.org_export_schemas
       set name = trim(p_name), dataset = p_dataset, format = p_format, fields = p_fields, updated_at = now()
     where id = p_id and organization_id = p_org
     returning id into sid;
    if sid is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  end if;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values (p_org, me, case when p_id is null then 'export_schema.created' else 'export_schema.updated' end,
            'export_schema', sid::text,
            jsonb_build_object('name', trim(p_name), 'dataset', p_dataset, 'format', p_format, 'fields', p_fields));
  return jsonb_build_object('ok', true, 'id', sid);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'NAME_TAKEN');
end;
$$;

create or replace function noshashi.delete_export_schema(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  s noshashi.org_export_schemas;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  select * into s from noshashi.org_export_schemas where id = p_id;
  if s.id is null or not noshashi.has_org_role(s.organization_id, array['owner','admin','compliance']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  delete from noshashi.org_export_schemas where id = p_id;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state)
    values (s.organization_id, me, 'export_schema.deleted', 'export_schema', s.id::text, jsonb_build_object('name', s.name));
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function noshashi.add_xrpl_watch(uuid, text, text, text, text[]) from public, anon;
revoke execute on function noshashi.update_xrpl_watch(uuid, text, text[], boolean, jsonb) from public, anon;
revoke execute on function noshashi.remove_xrpl_watch(uuid) from public, anon;
revoke execute on function noshashi.set_event_retention(uuid, integer) from public, anon;
revoke execute on function noshashi.save_export_schema(uuid, uuid, text, text, text, jsonb) from public, anon;
revoke execute on function noshashi.delete_export_schema(uuid) from public, anon;
grant execute on function noshashi.add_xrpl_watch(uuid, text, text, text, text[]) to authenticated;
grant execute on function noshashi.update_xrpl_watch(uuid, text, text[], boolean, jsonb) to authenticated;
grant execute on function noshashi.remove_xrpl_watch(uuid) to authenticated;
grant execute on function noshashi.set_event_retention(uuid, integer) to authenticated;
grant execute on function noshashi.save_export_schema(uuid, uuid, text, text, text, jsonb) to authenticated;
grant execute on function noshashi.delete_export_schema(uuid) to authenticated;

-- ── The watcher's side (service role only) ───────────────────────────

-- Watches to read now: least recently read first, only while the plan still includes them.
create or replace function noshashi.xrpl_watches_due(p_limit integer)
returns setof noshashi.xrpl_watches
language sql
stable
security definer
set search_path = ''
as $$
  select w.* from noshashi.xrpl_watches w
   where w.active
     and noshashi.org_has_feature(w.organization_id, noshashi.xrpl_watch_feature(w.purpose))
   order by w.last_polled_at nulls first
   limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

-- Record what one read found and where it got to, in one transaction.
create or replace function noshashi.xrpl_record_events(p_watch uuid, p_events jsonb, p_last_ledger bigint, p_error text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  w noshashi.xrpl_watches;
  n integer := 0;
begin
  select * into w from noshashi.xrpl_watches where id = p_watch for update;
  if w.id is null then return 0; end if;
  if p_events is not null and jsonb_typeof(p_events) = 'array' then
    with ins as (
      insert into noshashi.xrpl_events (organization_id, watch_id, address, event_type, tx_hash, ledger_index, ledger_time,
                                        tx_type, tx_result, counterparty, data, screening, verdict)
      select w.organization_id, w.id, w.address, e->>'type', upper(e->>'hash'), (e->>'ledgerIndex')::bigint,
             case when e->>'rippleTime' is null then null
                  else timestamptz '2000-01-01 00:00:00+00' + make_interval(secs => (e->>'rippleTime')::double precision) end,
             coalesce(e->>'txType', ''), coalesce(e->>'result', ''), e->>'counterparty',
             coalesce(e->'data', '{}'::jsonb), e->'screening', e->'screening'->>'verdict'
        from jsonb_array_elements(p_events) e
       where e->>'type' = any(w.event_types)
       order by (e->>'ledgerIndex')::bigint
      on conflict (organization_id, address, tx_hash, event_type, (coalesce(counterparty, ''))) do nothing
      returning 1
    )
    select count(*) into n from ins;
  end if;
  update noshashi.xrpl_watches
     set last_ledger = coalesce(greatest(p_last_ledger, last_ledger), last_ledger),
         last_polled_at = now(),
         last_error = p_error
   where id = w.id;
  return n;
end;
$$;

-- The watcher's credential: a random token in Vault, compared here so it never leaves the database.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'noshashi_xrpl_watch_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'noshashi_xrpl_watch_token',
                                'Bearer token pg_cron uses to call the noshashi-xrpl-watch edge function.');
  end if;
  if not exists (select 1 from vault.secrets where name = 'noshashi_functions_url') then
    perform vault.create_secret('https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1', 'noshashi_functions_url',
                                'Base URL of this project''s edge functions.');
  end if;
end;
$$;

create or replace function noshashi.xrpl_watch_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_token) = 64 and p_token = (
    select decrypted_secret from vault.decrypted_secrets where name = 'noshashi_xrpl_watch_token'), false);
$$;

-- Called every minute. Does nothing, and costs nothing, while no watch is active.
create or replace function noshashi.xrpl_watch_kick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  token text;
begin
  if not exists (select 1 from noshashi.xrpl_watches where active) then return null; end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'noshashi_functions_url';
  select decrypted_secret into token from vault.decrypted_secrets where name = 'noshashi_xrpl_watch_token';
  if base is null or token is null then return null; end if;
  return net.http_post(
    url := base || '/noshashi-xrpl-watch/tick',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    timeout_milliseconds := 60000);
end;
$$;

-- Event history older than the organization's retention is removed daily.
create or replace function noshashi.xrpl_events_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from noshashi.xrpl_events e
   using noshashi.organizations o
   where e.organization_id = o.id
     and e.created_at < now() - make_interval(days => o.event_retention_days);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function noshashi.xrpl_watches_due(integer) from public, anon, authenticated;
revoke execute on function noshashi.xrpl_record_events(uuid, jsonb, bigint, text) from public, anon, authenticated;
revoke execute on function noshashi.xrpl_watch_token_ok(text) from public, anon, authenticated;
revoke execute on function noshashi.xrpl_watch_kick() from public, anon, authenticated;
revoke execute on function noshashi.xrpl_events_retention() from public, anon, authenticated;
grant execute on function noshashi.xrpl_watches_due(integer) to service_role;
grant execute on function noshashi.xrpl_record_events(uuid, jsonb, bigint, text) to service_role;
grant execute on function noshashi.xrpl_watch_token_ok(text) to service_role;

select cron.unschedule(jobid) from cron.job where jobname in ('noshashi-xrpl-watch', 'noshashi-xrpl-retention');
select cron.schedule('noshashi-xrpl-watch', '* * * * *', 'select noshashi.xrpl_watch_kick()');
select cron.schedule('noshashi-xrpl-retention', '17 3 * * *', 'select noshashi.xrpl_events_retention()');

-- ── Events → webhooks ────────────────────────────────────────────────

create or replace function noshashi.webhook_from_xrpl_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
begin
  payload := jsonb_build_object(
    'event_id', new.id, 'watch_id', new.watch_id, 'address', new.address, 'type', new.event_type,
    'tx_hash', new.tx_hash, 'ledger_index', new.ledger_index, 'ledger_time', new.ledger_time,
    'tx_type', new.tx_type, 'tx_result', new.tx_result, 'counterparty', new.counterparty, 'data', new.data);
  perform noshashi.webhook_emit(new.organization_id, 'xrpl_event', payload);
  if new.screening is not null then
    perform noshashi.webhook_emit(new.organization_id, 'deposit_screened',
      payload || jsonb_build_object('verdict', new.verdict, 'screening', new.screening));
  end if;
  return new;
end;
$$;

drop trigger if exists xrpl_events_webhook on noshashi.xrpl_events;
create trigger xrpl_events_webhook after insert on noshashi.xrpl_events
  for each row execute function noshashi.webhook_from_xrpl_event();

revoke execute on function noshashi.webhook_from_xrpl_event() from public, anon, authenticated;
