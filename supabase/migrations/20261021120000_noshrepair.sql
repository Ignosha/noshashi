-- NOSHREPAIR: how NOSHASHI staff diagnose and repair a customer's app from
-- a support ticket, without being able to reach into it.
--
-- The ticket system (20260927130000_support_tickets.sql) already carries
-- the conversation. This adds four things, all additive:
--
--   · support_access_grants   the customer's consent for staff to read their
--                             account for one ticket. Only the customer can
--                             create one; it is read-only, lasts 1 to 72
--                             hours, and the customer can revoke it at any
--                             time. Staff can ask for it, never take it.
--   · support_diagnostics     what the customer chose to send with a ticket:
--                             the in-app self-repair report and the app's
--                             recent errors, scrubbed of anything secret on
--                             the device before it leaves. Append-only.
--   · support_repair_actions  repairs staff propose. Each is one of a fixed
--                             list of actions the app already knows how to
--                             run (see REPAIR_ACTIONS in
--                             src/lib/support/repair.ts). Nothing runs until
--                             the customer presses Apply in their own app,
--                             which then reports what happened. There is no
--                             way to send code, SQL, a file or a command.
--   · support_access_log      every staff look at an account and every
--                             proposal, grant, revoke and repair outcome.
--                             Append-only, and the customer can read every
--                             row about their own account.
--
-- Staff functions require support staff (owner-managed in SQL only) signed
-- in with two-factor authentication (aal2). The service-role key is not
-- involved anywhere: NOSHREPAIR runs on the staff member's own session, and
-- every write goes through the SECURITY DEFINER functions below.

-- ── 0. Who counts as NOSHREPAIR staff ────────────────────────────────

create or replace function noshashi.is_repair_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select noshashi.is_support_staff()
     and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

comment on function noshashi.is_repair_staff() is
  'Support staff signed in with two-factor authentication. Required by every NOSHREPAIR staff function.';

-- ── 1. Tables ────────────────────────────────────────────────────────

create table if not exists noshashi.support_access_grants (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references noshashi.support_tickets(id) on delete restrict,
  account_id  uuid not null references noshashi.accounts(id) on delete cascade,
  scope       text not null default 'read' check (scope = 'read'),
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  check (expires_at > granted_at and expires_at <= granted_at + interval '72 hours')
);

create index if not exists support_access_grants_ticket_idx on noshashi.support_access_grants (ticket_id, expires_at desc);

create table if not exists noshashi.support_diagnostics (
  id          bigint generated always as identity primary key,
  ticket_id   uuid not null references noshashi.support_tickets(id) on delete restrict,
  account_id  uuid not null references noshashi.accounts(id) on delete cascade,
  kind        text not null check (kind in ('self-repair', 'errors', 'environment', 'repair-result')),
  payload     jsonb not null check (octet_length(payload::text) <= 65536),
  created_at  timestamptz not null default now()
);

create index if not exists support_diagnostics_ticket_idx on noshashi.support_diagnostics (ticket_id, id desc);

create table if not exists noshashi.support_repair_actions (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references noshashi.support_tickets(id) on delete restrict,
  account_id    uuid not null references noshashi.accounts(id) on delete cascade,
  action        text not null check (action in (
                  'run_self_repair', 'refresh_plan', 'reconnect_ledger',
                  'check_for_update', 'send_diagnostics', 'reset_onboarding')),
  note          text check (note is null or length(note) <= 500),
  requested_by  uuid not null references noshashi.accounts(id) on delete restrict,
  requested_at  timestamptz not null default now(),
  status        text not null default 'pending' check (status in ('pending', 'applied', 'declined', 'failed', 'expired')),
  result        text check (result is null or length(result) <= 4000),
  decided_at    timestamptz
);

create index if not exists support_repair_actions_account_idx on noshashi.support_repair_actions (account_id, status, requested_at desc);
create index if not exists support_repair_actions_ticket_idx on noshashi.support_repair_actions (ticket_id, requested_at desc);

create table if not exists noshashi.support_access_log (
  id          bigint generated always as identity primary key,
  ticket_id   uuid not null references noshashi.support_tickets(id) on delete restrict,
  account_id  uuid not null references noshashi.accounts(id) on delete cascade,
  actor_id    uuid references noshashi.accounts(id) on delete set null,
  actor_role  text not null check (actor_role in ('customer', 'staff')),
  event       text not null check (event in (
                'access_requested', 'access_granted', 'access_revoked', 'account_viewed',
                'repair_proposed', 'repair_applied', 'repair_declined', 'repair_failed',
                'diagnostics_attached')),
  detail      text check (detail is null or length(detail) <= 500),
  at          timestamptz not null default now()
);

create index if not exists support_access_log_account_idx on noshashi.support_access_log (account_id, id desc);
create index if not exists support_access_log_ticket_idx on noshashi.support_access_log (ticket_id, id desc);

-- Diagnostics and the access log are append-only for every role.
create or replace function noshashi.noshrepair_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'This NOSHREPAIR record is append-only.' using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists support_diagnostics_append_only on noshashi.support_diagnostics;
create trigger support_diagnostics_append_only
  before update or delete on noshashi.support_diagnostics
  for each row execute function noshashi.noshrepair_append_only();

drop trigger if exists support_access_log_append_only on noshashi.support_access_log;
create trigger support_access_log_append_only
  before update or delete on noshashi.support_access_log
  for each row execute function noshashi.noshrepair_append_only();

-- ── 2. Reads ─────────────────────────────────────────────────────────

alter table noshashi.support_access_grants enable row level security;
alter table noshashi.support_diagnostics enable row level security;
alter table noshashi.support_repair_actions enable row level security;
alter table noshashi.support_access_log enable row level security;

-- The customer sees everything about their own account; NOSHREPAIR staff
-- see grants, proposals and the log. Diagnostics are what the customer
-- chose to attach to the ticket, so staff may read them with the ticket.
drop policy if exists support_access_grants_select on noshashi.support_access_grants;
create policy support_access_grants_select on noshashi.support_access_grants
  for select to authenticated
  using (account_id = (select auth.uid()) or noshashi.is_repair_staff());

drop policy if exists support_diagnostics_select on noshashi.support_diagnostics;
create policy support_diagnostics_select on noshashi.support_diagnostics
  for select to authenticated
  using (account_id = (select auth.uid()) or noshashi.is_repair_staff());

drop policy if exists support_repair_actions_select on noshashi.support_repair_actions;
create policy support_repair_actions_select on noshashi.support_repair_actions
  for select to authenticated
  using (account_id = (select auth.uid()) or noshashi.is_repair_staff());

drop policy if exists support_access_log_select on noshashi.support_access_log;
create policy support_access_log_select on noshashi.support_access_log
  for select to authenticated
  using (account_id = (select auth.uid()) or noshashi.is_repair_staff());

revoke all on noshashi.support_access_grants, noshashi.support_diagnostics,
              noshashi.support_repair_actions, noshashi.support_access_log from anon, authenticated;
grant select on noshashi.support_access_grants, noshashi.support_diagnostics,
                noshashi.support_repair_actions, noshashi.support_access_log to authenticated;
grant select on noshashi.support_access_grants, noshashi.support_diagnostics,
                noshashi.support_repair_actions, noshashi.support_access_log to service_role;

-- ── 3. Customer functions ────────────────────────────────────────────

create or replace function noshashi.noshrepair_log(
  p_ticket uuid, p_account uuid, p_role text, p_event text, p_detail text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into noshashi.support_access_log (ticket_id, account_id, actor_id, actor_role, event, detail)
  values (p_ticket, p_account, (select auth.uid()), p_role, p_event, left(p_detail, 500));
$$;

revoke execute on function noshashi.noshrepair_log(uuid, uuid, text, text, text) from public, anon, authenticated;

-- Let support read this account for one ticket, for 1 to 72 hours.
create or replace function noshashi.grant_support_access(p_ticket uuid, p_hours integer)
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

  -- One live grant per ticket: a new grant replaces the old one.
  update noshashi.support_access_grants
     set revoked_at = now()
   where ticket_id = t.id and revoked_at is null and expires_at > now();

  insert into noshashi.support_access_grants (ticket_id, account_id, expires_at)
  values (t.id, me, now() + make_interval(hours => hours))
  returning * into g;

  perform noshashi.noshrepair_log(t.id, me, 'customer', 'access_granted', hours || ' hours, read-only');
  return jsonb_build_object('ok', true, 'id', g.id, 'expires_at', g.expires_at);
end;
$$;

create or replace function noshashi.revoke_support_access(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  n integer;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not exists (select 1 from noshashi.support_tickets s where s.id = p_ticket and s.account_id = me) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  update noshashi.support_access_grants
     set revoked_at = now()
   where ticket_id = p_ticket and account_id = me and revoked_at is null and expires_at > now();
  get diagnostics n = row_count;
  if n > 0 then
    perform noshashi.noshrepair_log(p_ticket, me, 'customer', 'access_revoked', null);
  end if;
  return jsonb_build_object('ok', true, 'revoked', n);
end;
$$;

-- Attach what the app collected: the self-repair report, recent errors,
-- the environment, or the outcome of a repair. At most 30 a day a ticket.
create or replace function noshashi.attach_support_diagnostics(p_ticket uuid, p_kind text, p_payload jsonb)
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
  if p_kind is null or p_kind not in ('self-repair', 'errors', 'environment', 'repair-result')
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 65536 then
    return jsonb_build_object('ok', false, 'code', 'MALFORMED');
  end if;
  if (select count(*) from noshashi.support_diagnostics x
      where x.ticket_id = p_ticket and x.created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;
  insert into noshashi.support_diagnostics (ticket_id, account_id, kind, payload)
  values (p_ticket, me, p_kind, p_payload)
  returning id into d;
  perform noshashi.noshrepair_log(p_ticket, me, 'customer', 'diagnostics_attached', p_kind);
  return jsonb_build_object('ok', true, 'id', d);
end;
$$;

-- The customer's answer to a proposed repair, after their app ran it (or
-- they declined it). A proposal not answered in 7 days expires.
create or replace function noshashi.respond_support_repair(p_action uuid, p_status text, p_result text)
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
  if a.status <> 'pending' then return jsonb_build_object('ok', false, 'code', 'ALREADY_DECIDED'); end if;
  if a.requested_at < now() - interval '7 days' then
    update noshashi.support_repair_actions set status = 'expired', decided_at = now() where id = a.id;
    return jsonb_build_object('ok', false, 'code', 'EXPIRED');
  end if;
  update noshashi.support_repair_actions
     set status = p_status, result = left(p_result, 4000), decided_at = now()
   where id = a.id;
  perform noshashi.noshrepair_log(a.ticket_id, me, 'customer', 'repair_' || p_status, a.action);
  return jsonb_build_object('ok', true);
end;
$$;

-- ── 4. Staff functions (NOSHREPAIR) ──────────────────────────────────

-- Ask the customer for access. Posts a message on the ticket, which the
-- customer answers with one tap in the app; nothing is granted here.
create or replace function noshashi.request_support_access(p_ticket uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t noshashi.support_tickets;
begin
  if not noshashi.is_repair_staff() then return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS'); end if;
  select * into t from noshashi.support_tickets s where s.id = p_ticket for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if length(trim(coalesce(p_reason, ''))) not between 4 and 500 then
    return jsonb_build_object('ok', false, 'code', 'MALFORMED');
  end if;
  insert into noshashi.support_messages (ticket_id, author_id, author_role, body)
  values (t.id, me, 'staff',
          'NOSHASHI support is asking to view your account for this ticket (read-only, for as long as you choose, up to 72 hours). Reason: '
          || trim(p_reason) || E'\nYou can allow or ignore this in the ticket, and revoke it at any time.');
  update noshashi.support_tickets set status = 'answered', last_message_at = now(), updated_at = now() where id = t.id;
  perform noshashi.noshrepair_log(t.id, t.account_id, 'staff', 'access_requested', trim(p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- The account as support may see it: plan, subscription state, keys by
-- name and prefix, memberships and recent diagnostics. Never a key hash,
-- a Stripe identifier or anything the customer has not chosen to send.
-- Requires the customer's live grant for this ticket; every call is logged.
create or replace function noshashi.support_account_view(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t noshashi.support_tickets;
  g noshashi.support_access_grants;
  acct uuid;
begin
  if not noshashi.is_repair_staff() then return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS'); end if;
  select * into t from noshashi.support_tickets s where s.id = p_ticket;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into g from noshashi.support_access_grants x
   where x.ticket_id = t.id and x.revoked_at is null and x.expires_at > now()
   order by x.expires_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'code', 'NO_ACCESS'); end if;
  acct := t.account_id;

  perform noshashi.noshrepair_log(t.id, acct, 'staff', 'account_viewed', null);

  return jsonb_build_object(
    'ok', true,
    'grant', jsonb_build_object('granted_at', g.granted_at, 'expires_at', g.expires_at),
    'account', (select jsonb_build_object('email', a.email, 'display_name', a.display_name, 'created_at', a.created_at)
                from noshashi.accounts a where a.id = acct),
    'entitlement', (select jsonb_build_object('tier', e.tier, 'seats', e.seats, 'valid_until', e.valid_until,
                                              'features', coalesce(array_length(e.features, 1), 0), 'updated_at', e.updated_at)
                    from noshashi.entitlements e where e.account_id = acct),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('tier', s.tier, 'status', s.status, 'seats', s.seats,
                                    'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end)
                                    order by s.created_at desc)
                               from noshashi.subscriptions s where s.account_id = acct), '[]'::jsonb),
    'api_keys', coalesce((select jsonb_agg(jsonb_build_object('name', k.name, 'prefix', k.prefix, 'scopes', k.scopes,
                               'created_at', k.created_at, 'last_used_at', k.last_used_at,
                               'revoked', k.revoked_at is not null, 'expires_at', k.expires_at)
                               order by k.created_at desc)
                          from noshashi.api_keys k where k.account_id = acct), '[]'::jsonb),
    'organizations', (select count(*) from noshashi.organization_members m where m.account_id = acct),
    'portfolio_wallets', (select count(*) from noshashi.portfolio_wallets w
                          join noshashi.portfolios p on p.id = w.portfolio_id where p.account_id = acct),
    'open_tickets', (select count(*) from noshashi.support_tickets x where x.account_id = acct and x.status <> 'resolved')
  );
end;
$$;

-- Propose a repair. Needs the customer's live grant; at most five waiting
-- on one ticket. The customer's app shows it in plain words and runs it
-- only if they press Apply.
create or replace function noshashi.request_support_repair(p_ticket uuid, p_action text, p_note text)
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
  if p_action is null or p_action not in ('run_self_repair', 'refresh_plan', 'reconnect_ledger',
                                          'check_for_update', 'send_diagnostics', 'reset_onboarding') then
    return jsonb_build_object('ok', false, 'code', 'MALFORMED');
  end if;
  if p_note is not null and length(p_note) > 500 then return jsonb_build_object('ok', false, 'code', 'MALFORMED'); end if;
  if (select count(*) from noshashi.support_repair_actions a
      where a.ticket_id = t.id and a.status = 'pending' and a.requested_at > now() - interval '7 days') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;
  insert into noshashi.support_repair_actions (ticket_id, account_id, action, note, requested_by)
  values (t.id, t.account_id, p_action, nullif(trim(coalesce(p_note, '')), ''), me)
  returning * into r;
  perform noshashi.noshrepair_log(t.id, t.account_id, 'staff', 'repair_proposed', p_action);
  return jsonb_build_object('ok', true, 'id', r.id);
end;
$$;

-- The errors customers have sent, grouped, so one bug seen by many is
-- fixed once. Messages only: nothing that identifies the customer.
create or replace function noshashi.support_error_signatures(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not noshashi.is_repair_staff() then return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS'); end if;
  return jsonb_build_object('ok', true, 'signatures', coalesce((
    select jsonb_agg(row_to_json(x) order by x.reports desc)
    from (
      select left(e ->> 'message', 300) as message,
             count(*) as reports,
             count(distinct d.ticket_id) as tickets,
             max(d.created_at) as last_seen,
             array_agg(distinct e ->> 'version') filter (where e ->> 'version' is not null) as versions,
             (array_agg(d.ticket_id order by d.created_at desc))[1] as latest_ticket
      from noshashi.support_diagnostics d
      cross join lateral jsonb_array_elements(coalesce(d.payload -> 'errors', '[]'::jsonb)) e
      where d.kind = 'errors'
        and d.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365))
        and e ->> 'message' is not null
      group by 1
      order by 2 desc
      limit 100
    ) x
  ), '[]'::jsonb));
end;
$$;

-- ── 5. Who may call what ─────────────────────────────────────────────

revoke execute on function noshashi.is_repair_staff() from public, anon;
grant execute on function noshashi.is_repair_staff() to authenticated;

revoke execute on function noshashi.grant_support_access(uuid, integer) from public, anon;
revoke execute on function noshashi.revoke_support_access(uuid) from public, anon;
revoke execute on function noshashi.attach_support_diagnostics(uuid, text, jsonb) from public, anon;
revoke execute on function noshashi.respond_support_repair(uuid, text, text) from public, anon;
revoke execute on function noshashi.request_support_access(uuid, text) from public, anon;
revoke execute on function noshashi.support_account_view(uuid) from public, anon;
revoke execute on function noshashi.request_support_repair(uuid, text, text) from public, anon;
revoke execute on function noshashi.support_error_signatures(integer) from public, anon;

grant execute on function noshashi.grant_support_access(uuid, integer) to authenticated;
grant execute on function noshashi.revoke_support_access(uuid) to authenticated;
grant execute on function noshashi.attach_support_diagnostics(uuid, text, jsonb) to authenticated;
grant execute on function noshashi.respond_support_repair(uuid, text, text) to authenticated;
grant execute on function noshashi.request_support_access(uuid, text) to authenticated;
grant execute on function noshashi.support_account_view(uuid) to authenticated;
grant execute on function noshashi.request_support_repair(uuid, text, text) to authenticated;
grant execute on function noshashi.support_error_signatures(integer) to authenticated;
