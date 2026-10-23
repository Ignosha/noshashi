-- NOSHREPAIR, part 2: one computer at a time, a live look, real fixes.
--
-- Builds on 20261021120000_noshrepair.sql. Three changes:
--
--   · Devices. Every NOSHASHI install has a random device id, created on
--     first run and kept in its own settings. Grants, diagnostics and
--     repairs carry it, so a repair can be addressed to one computer and
--     only that computer runs it. A repair with no device stays open to
--     any of the customer's own computers, as before. Nothing ever reaches
--     another customer: every row is still tied to one account.
--   · A live look. "collect_snapshot" asks the customer's app for a
--     read-only picture of itself (version, ledger link, clock, sign-in,
--     plan, settings health, recent errors). While the customer's grant is
--     active the app answers it by itself, because looking is exactly what
--     the grant allows.
--   · Fixes support can run. The customer can tick "let support apply
--     fixes" when granting access. While that grant lasts, their app runs
--     fixes from the fixed list without asking each time; without it, each
--     fix still waits for Apply. The list grows by six real fixes; it is
--     still the only thing support can send.

-- ── 1. Columns ───────────────────────────────────────────────────────

alter table noshashi.support_access_grants
  add column if not exists auto_repair  boolean not null default false,
  add column if not exists device_id    uuid,
  add column if not exists device_label text check (device_label is null or length(device_label) <= 120);

alter table noshashi.support_diagnostics
  add column if not exists device_id uuid;

alter table noshashi.support_repair_actions
  add column if not exists device_id uuid,
  add column if not exists automatic boolean not null default false;

create index if not exists support_diagnostics_device_idx on noshashi.support_diagnostics (account_id, device_id, id desc);

-- Snapshots are a diagnostics kind of their own.
alter table noshashi.support_diagnostics drop constraint if exists support_diagnostics_kind_check;
alter table noshashi.support_diagnostics add constraint support_diagnostics_kind_check
  check (kind in ('self-repair', 'errors', 'environment', 'repair-result', 'snapshot'));

-- The fixed list of what support can ask a customer's app to do.
alter table noshashi.support_repair_actions drop constraint if exists support_repair_actions_action_check;
alter table noshashi.support_repair_actions add constraint support_repair_actions_action_check
  check (action in (
    'collect_snapshot', 'run_self_repair', 'refresh_plan', 'reconnect_ledger', 'switch_ledger_server',
    'refresh_session', 'repair_settings', 'clear_error_log', 'check_for_update', 'install_update',
    'send_diagnostics', 'reset_onboarding', 'reload_app'));

-- ── 2. Customer functions ────────────────────────────────────────────

-- Grant, now naming the computer that granted it and whether support may
-- apply fixes without asking each time.
drop function if exists noshashi.grant_support_access(uuid, integer);
create or replace function noshashi.grant_support_access(
  p_ticket uuid, p_hours integer, p_auto_repair boolean default false,
  p_device uuid default null, p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t noshashi.support_tickets;
  hours integer := coalesce(p_hours, 24);
  g noshashi.support_access_grants;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  select * into t from noshashi.support_tickets s where s.id = p_ticket;
  if not found or t.account_id <> me then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if hours < 1 or hours > 72 then return jsonb_build_object('ok', false, 'code', 'MALFORMED'); end if;

  update noshashi.support_access_grants
     set revoked_at = now()
   where ticket_id = t.id and revoked_at is null and expires_at > now();

  insert into noshashi.support_access_grants (ticket_id, account_id, expires_at, auto_repair, device_id, device_label)
  values (t.id, me, now() + make_interval(hours => hours), coalesce(p_auto_repair, false), p_device, left(p_device_label, 120))
  returning * into g;

  perform noshashi.noshrepair_log(t.id, me, 'customer', 'access_granted',
    hours || ' hours, read-only' || case when g.auto_repair then ', fixes may run without asking' else '' end
    || coalesce(' · ' || g.device_label, ''));
  return jsonb_build_object('ok', true, 'id', g.id, 'expires_at', g.expires_at, 'auto_repair', g.auto_repair);
end;
$$;

-- Diagnostics, now naming the computer they came from.
drop function if exists noshashi.attach_support_diagnostics(uuid, text, jsonb);
create or replace function noshashi.attach_support_diagnostics(
  p_ticket uuid, p_kind text, p_payload jsonb, p_device uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  d bigint;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not exists (select 1 from noshashi.support_tickets s where s.id = p_ticket and s.account_id = me) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p_kind is null or p_kind not in ('self-repair', 'errors', 'environment', 'repair-result', 'snapshot')
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 65536 then
    return jsonb_build_object('ok', false, 'code', 'MALFORMED');
  end if;
  if (select count(*) from noshashi.support_diagnostics x
      where x.ticket_id = p_ticket and x.created_at > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;
  insert into noshashi.support_diagnostics (ticket_id, account_id, kind, payload, device_id)
  values (p_ticket, me, p_kind, p_payload, p_device)
  returning id into d;
  perform noshashi.noshrepair_log(p_ticket, me, 'customer', 'diagnostics_attached', p_kind);
  return jsonb_build_object('ok', true, 'id', d);
end;
$$;

-- The customer's app answers a repair. p_auto marks one the app ran by
-- itself: allowed only for the read-only snapshot while any grant is live,
-- or for a fix while a grant that allows fixes is live. A repair addressed
-- to one computer can only be answered from that computer.
drop function if exists noshashi.respond_support_repair(uuid, text, text);
create or replace function noshashi.respond_support_repair(
  p_action uuid, p_status text, p_result text, p_device uuid default null, p_auto boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  a noshashi.support_repair_actions;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  select * into a from noshashi.support_repair_actions r where r.id = p_action for update;
  if not found or a.account_id <> me then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_status is null or p_status not in ('applied', 'declined', 'failed') then
    return jsonb_build_object('ok', false, 'code', 'MALFORMED');
  end if;
  if a.device_id is not null and a.device_id is distinct from p_device then
    return jsonb_build_object('ok', false, 'code', 'OTHER_DEVICE');
  end if;
  if a.status <> 'pending' then return jsonb_build_object('ok', false, 'code', 'ALREADY_DECIDED'); end if;
  if a.requested_at < now() - interval '7 days' then
    update noshashi.support_repair_actions set status = 'expired', decided_at = now() where id = a.id;
    return jsonb_build_object('ok', false, 'code', 'EXPIRED');
  end if;
  if coalesce(p_auto, false) and not exists (
       select 1 from noshashi.support_access_grants g
        where g.ticket_id = a.ticket_id and g.revoked_at is null and g.expires_at > now()
          and (a.action = 'collect_snapshot' or g.auto_repair)) then
    return jsonb_build_object('ok', false, 'code', 'NO_ACCESS');
  end if;
  update noshashi.support_repair_actions
     set status = p_status, result = left(p_result, 4000), decided_at = now(), automatic = coalesce(p_auto, false)
   where id = a.id;
  perform noshashi.noshrepair_log(a.ticket_id, me, 'customer', 'repair_' || p_status,
    a.action || case when coalesce(p_auto, false) then ' (ran automatically, allowed by the grant)' else '' end);
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 3. Staff functions ───────────────────────────────────────────────

-- Propose a repair or ask for a snapshot, for the whole account or one of
-- its computers. A device must be one this account's app has reported.
drop function if exists noshashi.request_support_repair(uuid, text, text);
create or replace function noshashi.request_support_repair(
  p_ticket uuid, p_action text, p_note text, p_device uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t noshashi.support_tickets;
  r noshashi.support_repair_actions;
begin
  if not noshashi.is_repair_staff() then return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS'); end if;
  select * into t from noshashi.support_tickets s where s.id = p_ticket;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not exists (select 1 from noshashi.support_access_grants x
                 where x.ticket_id = t.id and x.revoked_at is null and x.expires_at > now()) then
    return jsonb_build_object('ok', false, 'code', 'NO_ACCESS');
  end if;
  if p_action is null or p_action not in (
       'collect_snapshot', 'run_self_repair', 'refresh_plan', 'reconnect_ledger', 'switch_ledger_server',
       'refresh_session', 'repair_settings', 'clear_error_log', 'check_for_update', 'install_update',
       'send_diagnostics', 'reset_onboarding', 'reload_app') then
    return jsonb_build_object('ok', false, 'code', 'MALFORMED');
  end if;
  if p_note is not null and length(p_note) > 500 then return jsonb_build_object('ok', false, 'code', 'MALFORMED'); end if;
  if p_device is not null and not exists (
       select 1 from noshashi.support_diagnostics d where d.account_id = t.account_id and d.device_id = p_device
       union all
       select 1 from noshashi.support_access_grants g where g.account_id = t.account_id and g.device_id = p_device) then
    return jsonb_build_object('ok', false, 'code', 'MALFORMED');
  end if;
  if (select count(*) from noshashi.support_repair_actions a
      where a.ticket_id = t.id and a.status = 'pending' and a.requested_at > now() - interval '7 days') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;
  insert into noshashi.support_repair_actions (ticket_id, account_id, action, note, requested_by, device_id)
  values (t.id, t.account_id, p_action, nullif(trim(coalesce(p_note, '')), ''), me, p_device)
  returning * into r;
  perform noshashi.noshrepair_log(t.id, t.account_id, 'staff', 'repair_proposed', p_action);
  return jsonb_build_object('ok', true, 'id', r.id);
end;
$$;

-- ── 4. Who may call what ─────────────────────────────────────────────

revoke execute on function noshashi.grant_support_access(uuid, integer, boolean, uuid, text) from public, anon;
revoke execute on function noshashi.attach_support_diagnostics(uuid, text, jsonb, uuid) from public, anon;
revoke execute on function noshashi.respond_support_repair(uuid, text, text, uuid, boolean) from public, anon;
revoke execute on function noshashi.request_support_repair(uuid, text, text, uuid) from public, anon;

grant execute on function noshashi.grant_support_access(uuid, integer, boolean, uuid, text) to authenticated;
grant execute on function noshashi.attach_support_diagnostics(uuid, text, jsonb, uuid) to authenticated;
grant execute on function noshashi.respond_support_repair(uuid, text, text, uuid, boolean) to authenticated;
grant execute on function noshashi.request_support_repair(uuid, text, text, uuid) to authenticated;
