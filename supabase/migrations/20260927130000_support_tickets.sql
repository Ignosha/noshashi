-- Support tickets.
--
-- A customer opens a ticket from the app; NOSHASHI's support staff answer
-- it from their own inbox in the same app. Additive only: five tables and
-- four functions.
--
--   · support_staff    who answers tickets, by account; support_staff_invites
--                      by verified email, for staff who have not signed up yet.
--                      Both are managed by the project owner in SQL (there is
--                      no client path to become staff).
--   · support_tickets  one row per ticket: subject, category, priority,
--                      status, and the app version and platform it came from.
--   · support_messages the thread. Append-only for every role, like the
--                      investigation log: nothing said can be edited away.
--
-- Reads go through row level security: a customer sees their own tickets
-- and their messages; staff see every ticket. Every write goes through the
-- SECURITY DEFINER functions below, which check the caller, validate the
-- input and move the status, so a client can never write a message under
-- another name, reply to someone else's ticket, or set a status it may not.
--
-- support_notifications records which messages have been emailed (see the
-- noshashi-support-notify edge function), so a notice goes out once.
--
-- Statuses:
--   open      waiting on support (new, or the customer replied)
--   answered  support replied; waiting on the customer
--   resolved  closed by either side; a customer reply reopens it
--
-- Ownership follows the schema's convention: accounts.id IS auth.uid().

-- ── 1. Staff ─────────────────────────────────────────────────────────

create table if not exists noshashi.support_staff (
  account_id  uuid primary key references noshashi.accounts(id) on delete cascade,
  added_at    timestamptz not null default now()
);

comment on table noshashi.support_staff is
  'Accounts that answer support tickets. Added by the project owner in SQL only.';

-- Staff can also be invited by email before they have an account. An
-- invite counts only once the address is verified (email_confirmed_at),
-- so nobody becomes staff by signing up with someone else's address.
create table if not exists noshashi.support_staff_invites (
  email       text primary key check (email = lower(trim(email)) and email like '%_@_%'),
  invited_at  timestamptz not null default now()
);

comment on table noshashi.support_staff_invites is
  'Email addresses that become support staff once verified. Owner-managed in SQL only.';

create or replace function noshashi.is_support_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from noshashi.support_staff s where s.account_id = (select auth.uid()))
      or exists (
        select 1
        from noshashi.support_staff_invites i
        join auth.users u on lower(u.email) = i.email
        where u.id = (select auth.uid()) and u.email_confirmed_at is not null
      );
$$;

-- ── 2. Tickets and messages ──────────────────────────────────────────

create table if not exists noshashi.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  number          bigint generated always as identity unique,
  account_id      uuid not null references noshashi.accounts(id) on delete restrict,
  subject         text not null check (length(trim(subject)) between 4 and 160),
  category        text not null check (category in
                    ('account', 'billing', 'ledger-data', 'verification', 'noshx', 'bug', 'security', 'feature', 'other')),
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status          text not null default 'open' check (status in ('open', 'answered', 'resolved')),
  app_version     text check (app_version is null or length(app_version) <= 40),
  platform        text check (platform is null or length(platform) <= 80),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists support_tickets_account_idx on noshashi.support_tickets (account_id, last_message_at desc);
create index if not exists support_tickets_status_idx on noshashi.support_tickets (status, last_message_at desc);

create table if not exists noshashi.support_messages (
  id          bigint generated always as identity primary key,
  ticket_id   uuid not null references noshashi.support_tickets(id) on delete restrict,
  author_id   uuid not null references noshashi.accounts(id) on delete restrict,
  author_role text not null check (author_role in ('customer', 'staff')),
  body        text not null check (length(trim(body)) between 1 and 8000),
  created_at  timestamptz not null default now()
);

create index if not exists support_messages_ticket_idx on noshashi.support_messages (ticket_id, id);

create or replace function noshashi.support_messages_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Support messages are append-only.' using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists support_messages_no_update on noshashi.support_messages;
create trigger support_messages_no_update
  before update or delete on noshashi.support_messages
  for each row execute function noshashi.support_messages_immutable();

-- Which messages have been emailed, so a notice is sent at most once.
-- Written only by the noshashi-support-notify function (service role).
create table if not exists noshashi.support_notifications (
  message_id  bigint primary key references noshashi.support_messages(id) on delete restrict,
  sent_to     text not null,
  sent_at     timestamptz not null default now()
);

-- ── 3. Reads ─────────────────────────────────────────────────────────

alter table noshashi.support_staff enable row level security;
alter table noshashi.support_staff_invites enable row level security;
alter table noshashi.support_tickets enable row level security;
alter table noshashi.support_messages enable row level security;
alter table noshashi.support_notifications enable row level security;

drop policy if exists support_staff_select_self on noshashi.support_staff;
create policy support_staff_select_self on noshashi.support_staff
  for select to authenticated using (account_id = (select auth.uid()));

drop policy if exists support_tickets_select on noshashi.support_tickets;
create policy support_tickets_select on noshashi.support_tickets
  for select to authenticated
  using (account_id = (select auth.uid()) or noshashi.is_support_staff());

drop policy if exists support_messages_select on noshashi.support_messages;
create policy support_messages_select on noshashi.support_messages
  for select to authenticated
  using (
    noshashi.is_support_staff()
    or exists (
      select 1 from noshashi.support_tickets t
      where t.id = ticket_id and t.account_id = (select auth.uid())
    )
  );

-- Reads only. Every write goes through the functions below.
revoke all on noshashi.support_staff, noshashi.support_tickets, noshashi.support_messages from anon, authenticated;
grant select on noshashi.support_staff, noshashi.support_tickets, noshashi.support_messages to authenticated;
grant select on noshashi.support_staff, noshashi.support_tickets, noshashi.support_messages to service_role;
revoke all on noshashi.support_staff_invites from anon, authenticated;
grant select on noshashi.support_staff_invites to service_role;
-- Notifications: no client access at all; the notify function records them.
revoke all on noshashi.support_notifications from anon, authenticated;
grant select, insert, delete on noshashi.support_notifications to service_role;

-- ── 4. Writes ────────────────────────────────────────────────────────

-- Open a ticket with its first message. At most 10 tickets a day per
-- account, so a stuck client or a script cannot flood the queue.
create or replace function noshashi.open_support_ticket(
  p_subject text, p_category text, p_priority text, p_body text, p_app_version text, p_platform text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t noshashi.support_tickets;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not exists (select 1 from noshashi.accounts a where a.id = me) then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if length(trim(coalesce(p_subject, ''))) not between 4 and 160 then
    return jsonb_build_object('ok', false, 'code', 'SUBJECT_INVALID');
  end if;
  if length(trim(coalesce(p_body, ''))) not between 10 and 8000 then
    return jsonb_build_object('ok', false, 'code', 'BODY_INVALID');
  end if;
  if p_category is null or p_category not in ('account', 'billing', 'ledger-data', 'verification', 'noshx', 'bug', 'security', 'feature', 'other') then
    return jsonb_build_object('ok', false, 'code', 'MALFORMED');
  end if;
  if coalesce(p_priority, 'normal') not in ('low', 'normal', 'high', 'urgent') then
    return jsonb_build_object('ok', false, 'code', 'MALFORMED');
  end if;
  if (select count(*) from noshashi.support_tickets s
      where s.account_id = me and s.created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;

  insert into noshashi.support_tickets (account_id, subject, category, priority, app_version, platform)
  values (me, trim(p_subject), p_category, coalesce(p_priority, 'normal'),
          left(nullif(trim(coalesce(p_app_version, '')), ''), 40),
          left(nullif(trim(coalesce(p_platform, '')), ''), 80))
  returning * into t;

  insert into noshashi.support_messages (ticket_id, author_id, author_role, body)
  values (t.id, me, 'customer', trim(p_body));

  return jsonb_build_object('ok', true, 'id', t.id, 'number', t.number);
end;
$$;

-- Reply on a ticket. The owner replies as the customer (and reopens a
-- resolved ticket); staff reply as staff. Anyone else gets NOT_FOUND, so
-- ticket ids cannot be probed.
create or replace function noshashi.reply_support_ticket(p_ticket uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t noshashi.support_tickets;
  role_ text;
  msg bigint;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  select * into t from noshashi.support_tickets s where s.id = p_ticket for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if t.account_id = me then
    role_ := 'customer';
  elsif noshashi.is_support_staff() then
    role_ := 'staff';
  else
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if length(trim(coalesce(p_body, ''))) not between 1 and 8000 then
    return jsonb_build_object('ok', false, 'code', 'BODY_INVALID');
  end if;
  -- One message a second per ticket and author is plenty for a person.
  if exists (select 1 from noshashi.support_messages m
             where m.ticket_id = t.id and m.author_id = me and m.created_at > now() - interval '1 second') then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;

  insert into noshashi.support_messages (ticket_id, author_id, author_role, body)
  values (t.id, me, role_, trim(p_body))
  returning id into msg;

  update noshashi.support_tickets
     set status = case when role_ = 'staff' then 'answered' else 'open' end,
         last_message_at = now(),
         updated_at = now()
   where id = t.id;

  return jsonb_build_object('ok', true, 'message_id', msg);
end;
$$;

-- Status and priority. The customer may resolve or reopen their own
-- ticket; staff may set any status and the priority.
create or replace function noshashi.update_support_ticket(p_ticket uuid, p_status text, p_priority text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t noshashi.support_tickets;
  staff boolean := noshashi.is_support_staff();
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  select * into t from noshashi.support_tickets s where s.id = p_ticket for update;
  if not found or (t.account_id <> me and not staff) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p_status is not null and p_status not in ('open', 'answered', 'resolved') then
    return jsonb_build_object('ok', false, 'code', 'MALFORMED');
  end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high', 'urgent') then
    return jsonb_build_object('ok', false, 'code', 'MALFORMED');
  end if;
  if not staff then
    -- A customer resolves or reopens; only staff mark a ticket answered
    -- or change its priority.
    if p_priority is not null or (p_status is not null and p_status not in ('open', 'resolved')) then
      return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_PERMISSIONS');
    end if;
  end if;

  update noshashi.support_tickets
     set status = coalesce(p_status, status),
         priority = coalesce(p_priority, priority),
         updated_at = now()
   where id = t.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function noshashi.is_support_staff() from public, anon;
grant execute on function noshashi.is_support_staff() to authenticated;
revoke execute on function noshashi.open_support_ticket(text, text, text, text, text, text) from public, anon;
revoke execute on function noshashi.reply_support_ticket(uuid, text) from public, anon;
revoke execute on function noshashi.update_support_ticket(uuid, text, text) from public, anon;
grant execute on function noshashi.open_support_ticket(text, text, text, text, text, text) to authenticated;
grant execute on function noshashi.reply_support_ticket(uuid, text) to authenticated;
grant execute on function noshashi.update_support_ticket(uuid, text, text) to authenticated;
