-- Institutional features that the plan sells, made real.
--
--   1. Regulator read-only seats: a time-boxed examiner membership that can
--      read the organization's policies, exceptions, investigations and
--      audit log and write nothing. Expired seats stop working at once,
--      because membership itself now honours the expiry.
--   2. org_has_feature(): the server's own check that an organization's
--      plan includes a feature, so a paid capability is not gated only in
--      the client.
--   3. White-label: the organization's own name and accent colour, shown
--      in the console and on the reports it exports.
--   4. append_org_audit(): workstation actions the server cannot see for
--      itself (exports, settings changes, recorded adjudications, custom
--      alerts, scheduled stress runs) appended to the append-only audit
--      log under the member's own identity.
--   5. Custom alerts delivered to the organization's webhooks as the new
--      event "custom_alert".

-- ── 1. Expiring membership ───────────────────────────────────────────

alter table noshashi.organization_members add column if not exists expires_at timestamptz;

comment on column noshashi.organization_members.expires_at is
  'Set for regulator seats only. After it passes the member is treated as not a member.';

alter table noshashi.organization_members drop constraint if exists organization_members_regulator_expiry;
alter table noshashi.organization_members add constraint organization_members_regulator_expiry
  check ((role = 'regulator') = (expires_at is not null));

create or replace function noshashi.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from noshashi.organization_members m
    where m.organization_id = org and m.account_id = (select auth.uid())
      and (m.expires_at is null or m.expires_at > now())
  );
$$;

create or replace function noshashi.has_org_role(org uuid, roles noshashi.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from noshashi.organization_members m
    where m.organization_id = org
      and m.account_id = (select auth.uid())
      and m.role = any(roles)
      and (m.expires_at is null or m.expires_at > now())
  );
$$;

-- ── 2. What the organization's plan includes ────────────────────────

-- An entitlement counts for an organization when it names the
-- organization, or belongs to one of its owners (a plan bought before the
-- organization existed). Expired entitlements do not count.
create or replace function noshashi.org_has_feature(p_org uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from noshashi.entitlements e
    where (e.organization_id = p_org
           or e.account_id in (select m.account_id from noshashi.organization_members m
                               where m.organization_id = p_org and m.role = 'owner'))
      and p_feature = any(e.features)
      and (e.valid_until is null or e.valid_until > now())
  );
$$;

revoke execute on function noshashi.org_has_feature(uuid, text) from public, anon;
grant execute on function noshashi.org_has_feature(uuid, text) to authenticated, service_role;

-- ── 3. Regulator seats ───────────────────────────────────────────────

create or replace function noshashi.grant_regulator_seat(p_org uuid, p_email text, p_days integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target uuid;
  existing noshashi.member_role;
  until timestamptz;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.has_org_role(p_org, array['owner','admin','compliance']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if not noshashi.org_has_feature(p_org, 'regulator_seats') then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_NOT_IN_PLAN');
  end if;
  if p_days is null or p_days < 1 or p_days > 180 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TERM');
  end if;
  select a.id into target from noshashi.accounts a where lower(a.email) = lower(trim(p_email));
  if target is null then return jsonb_build_object('ok', false, 'code', 'NO_SUCH_ACCOUNT'); end if;
  if target = me then return jsonb_build_object('ok', false, 'code', 'SELF'); end if;
  select m.role into existing from noshashi.organization_members m
    where m.organization_id = p_org and m.account_id = target;
  -- A seat never demotes a working member: an examiner is someone from outside.
  if existing is not null and existing <> 'regulator' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_MEMBER');
  end if;
  until := now() + make_interval(days => p_days);
  insert into noshashi.organization_members (organization_id, account_id, role, invited_by, expires_at)
    values (p_org, target, 'regulator', me, until)
    on conflict (organization_id, account_id) do update set expires_at = excluded.expires_at, invited_by = excluded.invited_by;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values (p_org, me, case when existing is null then 'regulator.seat_granted' else 'regulator.seat_extended' end,
            'member', target::text, jsonb_build_object('expires_at', until, 'days', p_days));
  return jsonb_build_object('ok', true, 'account_id', target, 'expires_at', until);
end;
$$;

create or replace function noshashi.revoke_regulator_seat(p_org uuid, p_account uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.has_org_role(p_org, array['owner','admin','compliance']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  delete from noshashi.organization_members
    where organization_id = p_org and account_id = p_account and role = 'regulator';
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id)
    values (p_org, me, 'regulator.seat_revoked', 'member', p_account::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- Each time an examiner opens the organization, the visit is recorded
-- (at most once every 30 minutes), so the organization can show exactly
-- when its records were looked at.
create or replace function noshashi.record_regulator_session(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or not noshashi.has_org_role(p_org, array['regulator']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'NOT_A_REGULATOR');
  end if;
  if not exists (select 1 from noshashi.audit_log
                 where organization_id = p_org and actor_account_id = me
                   and action = 'regulator.session_opened' and occurred_at > now() - interval '30 minutes') then
    insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id)
      values (p_org, me, 'regulator.session_opened', 'member', me::text);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function noshashi.grant_regulator_seat(uuid, text, integer) from public, anon;
revoke execute on function noshashi.revoke_regulator_seat(uuid, uuid) from public, anon;
revoke execute on function noshashi.record_regulator_session(uuid) from public, anon;
grant execute on function noshashi.grant_regulator_seat(uuid, text, integer) to authenticated;
grant execute on function noshashi.revoke_regulator_seat(uuid, uuid) to authenticated;
grant execute on function noshashi.record_regulator_session(uuid) to authenticated;

-- The ordinary member form cannot create an examiner (a seat must carry
-- an expiry), and turning an examiner into a member clears the expiry.
create or replace function noshashi.add_org_member_by_email(p_org uuid, p_email text, p_role noshashi.member_role)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target uuid;
  current_role_of_target noshashi.member_role;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not noshashi.has_org_role(p_org, array['owner', 'admin']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if p_role = 'regulator' then
    return jsonb_build_object('ok', false, 'code', 'USE_REGULATOR_SEAT');
  end if;
  if p_role = 'owner' and not noshashi.has_org_role(p_org, array['owner']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  select a.id into target from noshashi.accounts a where lower(a.email) = lower(trim(p_email));
  if target is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SUCH_ACCOUNT');
  end if;
  select m.role into current_role_of_target from noshashi.organization_members m
    where m.organization_id = p_org and m.account_id = target;
  if current_role_of_target = 'owner' and p_role <> 'owner' then
    if not noshashi.has_org_role(p_org, array['owner']::noshashi.member_role[]) then
      return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
    end if;
    if (select count(*) from noshashi.organization_members m where m.organization_id = p_org and m.role = 'owner') <= 1 then
      return jsonb_build_object('ok', false, 'code', 'LAST_OWNER');
    end if;
  end if;
  insert into noshashi.organization_members (organization_id, account_id, role, invited_by)
    values (p_org, target, p_role, me)
    on conflict (organization_id, account_id) do update set role = excluded.role, expires_at = null;
  return jsonb_build_object('ok', true, 'account_id', target, 'role', p_role);
end;
$$;

-- The directory shows when each seat ends.
drop function if exists noshashi.org_member_directory(uuid);
create function noshashi.org_member_directory(p_org uuid)
returns table (account_id uuid, email text, display_name text, role noshashi.member_role, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.account_id, a.email, a.display_name, m.role, m.expires_at
  from noshashi.organization_members m
  join noshashi.accounts a on a.id = m.account_id
  where m.organization_id = p_org and noshashi.is_org_member(p_org)
    and (m.expires_at is null or m.expires_at > now());
$$;

revoke execute on function noshashi.org_member_directory(uuid) from public, anon;
grant execute on function noshashi.org_member_directory(uuid) to authenticated;

-- An examiner reads the audit log; that is most of what they came for.
drop policy if exists audit_log_select_reviewer on noshashi.audit_log;
create policy audit_log_select_reviewer on noshashi.audit_log
  for select to authenticated
  using (noshashi.has_org_role(
    organization_id,
    array['owner', 'admin', 'compliance', 'risk', 'regulator']::noshashi.member_role[]
  ));

-- ── 4. White-label ───────────────────────────────────────────────────

alter table noshashi.organizations add column if not exists brand_name text;
alter table noshashi.organizations add column if not exists brand_accent text;
alter table noshashi.organizations drop constraint if exists organizations_brand_name_check;
alter table noshashi.organizations add constraint organizations_brand_name_check
  check (brand_name is null or length(trim(brand_name)) between 1 and 80);
alter table noshashi.organizations drop constraint if exists organizations_brand_accent_check;
alter table noshashi.organizations add constraint organizations_brand_accent_check
  check (brand_accent is null or brand_accent ~ '^#[0-9A-Fa-f]{6}$');

create or replace function noshashi.set_org_brand(p_org uuid, p_name text, p_accent text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  before_row noshashi.organizations;
  name_value text := nullif(trim(coalesce(p_name, '')), '');
  accent_value text := nullif(trim(coalesce(p_accent, '')), '');
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not noshashi.has_org_role(p_org, array['owner','admin']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  if not noshashi.org_has_feature(p_org, 'white_label') then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_NOT_IN_PLAN');
  end if;
  if name_value is not null and length(name_value) > 80 then
    return jsonb_build_object('ok', false, 'code', 'NAME_INVALID');
  end if;
  if accent_value is not null and accent_value !~ '^#[0-9A-Fa-f]{6}$' then
    return jsonb_build_object('ok', false, 'code', 'ACCENT_INVALID');
  end if;
  select * into before_row from noshashi.organizations where id = p_org;
  update noshashi.organizations set brand_name = name_value, brand_accent = accent_value where id = p_org;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, previous_state, new_state)
    values (p_org, me, 'organization.brand_changed', 'organization', p_org::text,
            jsonb_build_object('brand_name', before_row.brand_name, 'brand_accent', before_row.brand_accent),
            jsonb_build_object('brand_name', name_value, 'brand_accent', accent_value));
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function noshashi.set_org_brand(uuid, text, text) from public, anon;
grant execute on function noshashi.set_org_brand(uuid, text, text) to authenticated;

-- ── 5. Workstation actions in the audit log ──────────────────────────

create or replace function noshashi.append_org_audit(
  p_org uuid, p_action text, p_entity_type text, p_entity_id text, p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  feature text;
  aid bigint;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  -- Examiners and viewers read; they do not write the record.
  if not noshashi.has_org_role(p_org, array['owner','admin','compliance','risk','analyst']::noshashi.member_role[]) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
  end if;
  feature := case p_action
    when 'export.created' then 'audit_log'
    when 'settings.changed' then 'audit_log'
    when 'adjudication.recorded' then 'audit_log'
    when 'alert.triggered' then 'custom_alert_logic'
    when 'stress.scheduled_run' then 'bulk_monitoring'
    else null end;
  if feature is null then return jsonb_build_object('ok', false, 'code', 'ACTION_NOT_ALLOWED'); end if;
  if not noshashi.org_has_feature(p_org, feature) then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_NOT_IN_PLAN');
  end if;
  if p_state is not null and octet_length(p_state::text) > 8000 then
    return jsonb_build_object('ok', false, 'code', 'STATE_TOO_LARGE');
  end if;
  if p_entity_type is not null and length(p_entity_type) > 40 or p_entity_id is not null and length(p_entity_id) > 200 then
    return jsonb_build_object('ok', false, 'code', 'MALFORMED');
  end if;
  if (select count(*) from noshashi.audit_log
      where actor_account_id = me and occurred_at > now() - interval '1 minute') >= 120 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;
  insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values (p_org, me, p_action, p_entity_type, p_entity_id, jsonb_build_object('origin', 'workstation') || coalesce(p_state, '{}'::jsonb))
    returning id into aid;
  return jsonb_build_object('ok', true, 'audit_id', aid);
end;
$$;

revoke execute on function noshashi.append_org_audit(uuid, text, text, text, jsonb) from public, anon;
grant execute on function noshashi.append_org_audit(uuid, text, text, text, jsonb) to authenticated;

-- ── 6. Custom alerts on the organization's webhooks ─────────────────

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
    'custom_alert'
  ]::text[];
$$;

alter table noshashi.org_webhooks drop constraint if exists org_webhooks_events_allowed;
alter table noshashi.org_webhooks add constraint org_webhooks_events_allowed
  check (cardinality(events) > 0 and events <@ noshashi.webhook_event_names());

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
  if p_events is null or cardinality(p_events) = 0 or not (p_events <@ noshashi.webhook_event_names()) then
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
    when 'exception.evidence_requested' then 'exception_evidence_requested'
    when 'exception.evidence_added' then 'exception_evidence_added'
    when 'case.opened' then 'investigation_created'
    when 'case.closed' then 'investigation_resolved'
    when 'alert.triggered' then 'custom_alert'
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
