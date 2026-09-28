-- Sanctioned XRP Ledger addresses, and the embeddable screening widget.
--
-- 1. Sanctions. The US Treasury's Specially Designated Nationals list
--    (OFAC SDN) names digital currency addresses in each entry's remarks
--    as "Digital Currency Address - XRP r…". Long remarks do not fit in
--    sdn.csv and continue in sdn_comments.csv, which is where the XRP
--    addresses are, so both files are read. They are fetched every day by
--    pg_net from treasury.gov (free, public, no key), parsed here, and kept
--    with the entry number, name and program they came from. An address
--    that leaves the list is kept with removed_at set, never deleted, so a
--    past screening can still be explained. Nothing is added by hand.
--
-- 2. Embeds. An organization's screening widget for its own website: a
--    <div> and one script tag. The widget calls noshashi-xrpl-watch/embed
--    with only the embed's id; the server checks the page's Origin against
--    the embed's allowed origins and the organization's plan, and never
--    exposes an API key, a deposit configuration or a finding a customer
--    should not see.

-- ── 1. Sanctions ─────────────────────────────────────────────────────

create table if not exists noshashi.sanctioned_addresses (
  address        text primary key check (address ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  list           text not null default 'OFAC SDN',
  entity_number  integer,
  entity_name    text not null,
  program        text,
  source_url     text not null,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  removed_at     timestamptz
);

create table if not exists noshashi.sanctions_refreshes (
  id               bigserial primary key,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  sdn_request      bigint,
  comments_request bigint,
  status           text not null default 'fetching' check (status in ('fetching', 'ok', 'failed')),
  listed           integer,
  added            integer,
  removed          integer,
  error            text
);

alter table noshashi.sanctioned_addresses enable row level security;
alter table noshashi.sanctions_refreshes enable row level security;

-- A public list, so any signed-in person may read it; nobody writes it but the refresh.
drop policy if exists sanctioned_addresses_read on noshashi.sanctioned_addresses;
create policy sanctioned_addresses_read on noshashi.sanctioned_addresses for select to authenticated using (true);
drop policy if exists sanctions_refreshes_read on noshashi.sanctions_refreshes;
create policy sanctions_refreshes_read on noshashi.sanctions_refreshes for select to authenticated using (true);

revoke all on noshashi.sanctioned_addresses, noshashi.sanctions_refreshes from anon, authenticated;
grant select on noshashi.sanctioned_addresses, noshashi.sanctions_refreshes to authenticated, service_role;

/**
 * Every XRP address in the two files, with the SDN entry it belongs to.
 * sdn.csv rows are  ent_num,"NAME",type,"PROGRAM",…,"remarks";
 * sdn_comments.csv rows are  ent_num,"remarks continued".
 */
create or replace function noshashi.sanctions_parse(p_sdn text, p_comments text)
returns table (address text, entity_number integer, entity_name text, program text)
language sql
immutable
set search_path = ''
as $$
  with lines as (
    select l from regexp_split_to_table(coalesce(p_sdn, '') || E'\n' || coalesce(p_comments, ''), E'\r?\n') l
     where l ~ 'Digital Currency Address - XRP '
  ),
  hits as (
    select distinct (regexp_match(l, '^"?(\d+)"?,'))[1]::integer as ent, m[1] as addr
      from lines, regexp_matches(l, 'Digital Currency Address - XRP (r[1-9A-HJ-NP-Za-km-z]{24,34})', 'g') m
  ),
  entries as (
    select (regexp_match(l, '^(\d+),'))[1]::integer as ent,
           regexp_match(l, '^\d+,"((?:[^"]|"")*)",[^,]*,"([^"]*)"') as f
      from regexp_split_to_table(coalesce(p_sdn, ''), E'\r?\n') l
     where l ~ ('^(' || coalesce((select string_agg(distinct ent::text, '|') from hits where ent is not null), '0') || '),')
  )
  select h.addr, h.ent,
         coalesce(replace(e.f[1], '""', '"'), 'SDN entry ' || coalesce(h.ent::text, 'unknown')),
         nullif(e.f[2], '')
    from hits h
    left join entries e on e.ent = h.ent;
$$;

revoke execute on function noshashi.sanctions_parse(text, text) from public, anon, authenticated;

create or replace function noshashi.sanctions_refresh_start()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid bigint;
begin
  insert into noshashi.sanctions_refreshes (sdn_request, comments_request)
  values (
    net.http_get('https://www.treasury.gov/ofac/downloads/sdn.csv', timeout_milliseconds := 120000),
    net.http_get('https://www.treasury.gov/ofac/downloads/sdn_comments.csv', timeout_milliseconds := 60000)
  )
  returning id into rid;
  return rid;
end;
$$;

create or replace function noshashi.sanctions_refresh_finish()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r noshashi.sanctions_refreshes;
  sdn record;
  com record;
  n_listed integer;
  n_added integer;
  n_removed integer;
begin
  select * into r from noshashi.sanctions_refreshes where status = 'fetching' order by id desc limit 1 for update;
  if r.id is null then return jsonb_build_object('ok', false, 'code', 'NOTHING_FETCHING'); end if;

  select status_code, content, error_msg, timed_out into sdn from net._http_response where id = r.sdn_request;
  select status_code, content, error_msg, timed_out into com from net._http_response where id = r.comments_request;

  if sdn.status_code is distinct from 200 or com.status_code is distinct from 200
     or length(coalesce(sdn.content, '')) < 1000000 or length(coalesce(com.content, '')) < 1000 then
    update noshashi.sanctions_refreshes
       set status = 'failed', finished_at = now(),
           error = left(format('sdn.csv %s %s; sdn_comments.csv %s %s',
                               coalesce(sdn.status_code::text, 'no reply'), coalesce(sdn.error_msg, ''),
                               coalesce(com.status_code::text, 'no reply'), coalesce(com.error_msg, '')), 500)
     where id = r.id;
    return jsonb_build_object('ok', false, 'code', 'DOWNLOAD_FAILED');
  end if;

  create temporary table if not exists pg_temp.sanctions_now (address text primary key, entity_number integer, entity_name text, program text) on commit drop;
  truncate pg_temp.sanctions_now;
  insert into pg_temp.sanctions_now
    select distinct on (p.address) p.address, p.entity_number, p.entity_name, p.program
      from noshashi.sanctions_parse(sdn.content, com.content) p;
  select count(*) into n_listed from pg_temp.sanctions_now;

  -- A list that parses to nothing is a format change, not a mass delisting.
  if n_listed = 0 and exists (select 1 from noshashi.sanctioned_addresses where removed_at is null) then
    update noshashi.sanctions_refreshes set status = 'failed', finished_at = now(), listed = 0,
           error = 'The files parsed to no XRP addresses; the list was left as it was.' where id = r.id;
    return jsonb_build_object('ok', false, 'code', 'EMPTY_PARSE');
  end if;

  select count(*) into n_added from pg_temp.sanctions_now s
   where not exists (select 1 from noshashi.sanctioned_addresses a where a.address = s.address and a.removed_at is null);

  insert into noshashi.sanctioned_addresses (address, entity_number, entity_name, program, source_url)
  select s.address, s.entity_number, s.entity_name, s.program,
         'https://www.treasury.gov/ofac/downloads/sdn_comments.csv'
    from pg_temp.sanctions_now s
  on conflict (address) do update
     set entity_number = excluded.entity_number, entity_name = excluded.entity_name,
         program = excluded.program, last_seen = now(), removed_at = null;

  with gone as (
    update noshashi.sanctioned_addresses a set removed_at = now()
     where a.removed_at is null and not exists (select 1 from pg_temp.sanctions_now s where s.address = a.address)
    returning 1
  )
  select count(*) into n_removed from gone;

  update noshashi.sanctions_refreshes
     set status = 'ok', finished_at = now(), listed = n_listed, added = n_added, removed = n_removed
   where id = r.id;
  return jsonb_build_object('ok', true, 'listed', n_listed, 'added', n_added, 'removed', n_removed);
end;
$$;

revoke execute on function noshashi.sanctions_refresh_start() from public, anon, authenticated;
revoke execute on function noshashi.sanctions_refresh_finish() from public, anon, authenticated;

/** The addresses among p_addresses that are listed now. For the screener and the widget. */
create or replace function noshashi.sanctions_lookup(p_addresses text[])
returns table (address text, list text, entity_number integer, entity_name text, program text, source_url text, first_seen timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.address, a.list, a.entity_number, a.entity_name, a.program, a.source_url, a.first_seen
    from noshashi.sanctioned_addresses a
   where a.removed_at is null and a.address = any(p_addresses[1:200]);
$$;

revoke execute on function noshashi.sanctions_lookup(text[]) from public, anon;
grant execute on function noshashi.sanctions_lookup(text[]) to authenticated, service_role;

select cron.unschedule(jobid) from cron.job where jobname in ('noshashi-sanctions-fetch', 'noshashi-sanctions-load');
select cron.schedule('noshashi-sanctions-fetch', '7 5 * * *', 'select noshashi.sanctions_refresh_start()');
select cron.schedule('noshashi-sanctions-load', '22 5 * * *', 'select noshashi.sanctions_refresh_finish()');

-- ── 2. Embeds ────────────────────────────────────────────────────────

create table if not exists noshashi.org_embeds (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references noshashi.organizations(id) on delete cascade,
  label            text not null check (length(trim(label)) between 1 and 80),
  widgets          text[] not null check (cardinality(widgets) between 1 and 3 and widgets <@ array['verify', 'check', 'deposit']),
  allowed_origins  text[] not null default '{}' check (cardinality(allowed_origins) <= 20),
  deposit_address  text check (deposit_address is null or deposit_address ~ '^r[1-9A-HJ-NP-Za-km-z]{24,34}$'),
  theme            text not null default 'auto' check (theme in ('auto', 'light', 'dark')),
  active           boolean not null default true,
  created_by       uuid not null references noshashi.accounts(id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists org_embeds_org_idx on noshashi.org_embeds (organization_id);

-- Requests per embed per minute, for the rate limit.
create table if not exists noshashi.org_embed_usage (
  embed_id  uuid not null references noshashi.org_embeds(id) on delete cascade,
  minute    timestamptz not null,
  requests  integer not null default 0,
  primary key (embed_id, minute)
);

alter table noshashi.org_embeds enable row level security;
alter table noshashi.org_embed_usage enable row level security;

drop policy if exists org_embeds_select_member on noshashi.org_embeds;
create policy org_embeds_select_member on noshashi.org_embeds
  for select to authenticated using (noshashi.is_org_member(organization_id));

revoke all on noshashi.org_embeds, noshashi.org_embed_usage from anon, authenticated;
grant select on noshashi.org_embeds to authenticated;
grant select, insert, update, delete on noshashi.org_embeds, noshashi.org_embed_usage to service_role;

create or replace function noshashi.save_org_embed(
  p_org uuid, p_id uuid, p_label text, p_widgets text[], p_origins text[], p_deposit_address text, p_theme text, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  eid uuid := p_id;
  origins text[];
  prior noshashi.org_embeds;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.has_org_role(p_org, array['owner','admin','compliance']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if not noshashi.org_has_feature(p_org, 'embedded_delivery') then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_NOT_IN_PLAN');
  end if;
  if length(trim(coalesce(p_label, ''))) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LABEL');
  end if;
  if p_widgets is null or cardinality(p_widgets) not between 1 and 3 or not (p_widgets <@ array['verify', 'check', 'deposit']) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_WIDGETS');
  end if;
  -- Exact origins only: scheme, host and optional port; http only for localhost.
  select coalesce(array_agg(distinct lower(trim(o))), '{}') into origins
    from unnest(coalesce(p_origins, '{}')) o where trim(o) <> '';
  if cardinality(origins) > 20 or exists (
       select 1 from unnest(origins) o
        where o !~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$'
          and o !~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ORIGIN');
  end if;
  if ('verify' = any(p_widgets) or 'deposit' = any(p_widgets)) and not exists (
       select 1 from noshashi.xrpl_watches w
        where w.organization_id = p_org and w.address = p_deposit_address and w.purpose = 'deposit') then
    return jsonb_build_object('ok', false, 'code', 'DEPOSIT_ADDRESS_NOT_WATCHED');
  end if;
  if coalesce(p_theme, 'auto') not in ('auto', 'light', 'dark') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_THEME');
  end if;

  if eid is null then
    if (select count(*) from noshashi.org_embeds where organization_id = p_org) >= 20 then
      return jsonb_build_object('ok', false, 'code', 'EMBED_LIMIT');
    end if;
    insert into noshashi.org_embeds (organization_id, label, widgets, allowed_origins, deposit_address, theme, active, created_by)
    values (p_org, trim(p_label), p_widgets, origins, p_deposit_address, coalesce(p_theme, 'auto'), coalesce(p_active, true), me)
    returning id into eid;
    insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values (p_org, me, 'embed.created', 'embed', eid::text,
            jsonb_build_object('label', trim(p_label), 'widgets', p_widgets, 'allowed_origins', origins, 'deposit_address', p_deposit_address));
  else
    select * into prior from noshashi.org_embeds where id = eid and organization_id = p_org for update;
    if prior.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
    update noshashi.org_embeds
       set label = trim(p_label), widgets = p_widgets, allowed_origins = origins, deposit_address = p_deposit_address,
           theme = coalesce(p_theme, 'auto'), active = coalesce(p_active, active), updated_at = now()
     where id = eid;
    insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state, new_state)
    values (p_org, me, 'embed.updated', 'embed', eid::text,
            jsonb_build_object('label', prior.label, 'widgets', prior.widgets, 'allowed_origins', prior.allowed_origins, 'deposit_address', prior.deposit_address, 'active', prior.active),
            jsonb_build_object('label', trim(p_label), 'widgets', p_widgets, 'allowed_origins', origins, 'deposit_address', p_deposit_address, 'active', coalesce(p_active, prior.active)));
  end if;
  return jsonb_build_object('ok', true, 'id', eid);
end;
$$;

create or replace function noshashi.delete_org_embed(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  e noshashi.org_embeds;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  select * into e from noshashi.org_embeds where id = p_id;
  if e.id is null or not noshashi.is_org_member(e.organization_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if not noshashi.has_org_role(e.organization_id, array['owner','admin','compliance']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  delete from noshashi.org_embeds where id = p_id;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state)
  values (e.organization_id, me, 'embed.deleted', 'embed', p_id::text,
          jsonb_build_object('label', e.label, 'widgets', e.widgets, 'allowed_origins', e.allowed_origins));
  return jsonb_build_object('ok', true);
end;
$$;

/**
 * The widget's side (service role only): the embed if it may answer this
 * origin now, counting the request; null otherwise. 120 requests a minute
 * per embed.
 */
create or replace function noshashi.embed_admit(p_id uuid, p_origin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e noshashi.org_embeds;
  used integer;
begin
  select * into e from noshashi.org_embeds where id = p_id;
  if e.id is null or not e.active then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not (lower(coalesce(p_origin, '')) = any(e.allowed_origins)) then
    return jsonb_build_object('ok', false, 'code', 'ORIGIN_NOT_ALLOWED');
  end if;
  if not noshashi.org_has_feature(e.organization_id, 'embedded_delivery') then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_NOT_IN_PLAN');
  end if;
  insert into noshashi.org_embed_usage (embed_id, minute, requests) values (e.id, date_trunc('minute', now()), 1)
  on conflict (embed_id, minute) do update set requests = noshashi.org_embed_usage.requests + 1
  returning requests into used;
  if used > 120 then return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED'); end if;
  delete from noshashi.org_embed_usage where embed_id = e.id and minute < now() - interval '10 minutes';
  return jsonb_build_object('ok', true, 'organization_id', e.organization_id, 'label', e.label, 'widgets', e.widgets,
                            'deposit_address', e.deposit_address, 'theme', e.theme);
end;
$$;

revoke execute on function noshashi.save_org_embed(uuid, uuid, text, text[], text[], text, text, boolean) from public, anon;
revoke execute on function noshashi.delete_org_embed(uuid) from public, anon;
revoke execute on function noshashi.embed_admit(uuid, text) from public, anon, authenticated;
grant execute on function noshashi.save_org_embed(uuid, uuid, text, text[], text[], text, text, boolean) to authenticated;
grant execute on function noshashi.delete_org_embed(uuid) to authenticated;
grant execute on function noshashi.embed_admit(uuid, text) to service_role;
