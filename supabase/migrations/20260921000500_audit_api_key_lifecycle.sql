-- Write the audit log from the database, not from the application.
--
-- §27 wants API key creation and revocation in the audit trail. The
-- obvious implementation — call an audit helper from the code that
-- creates a key — cannot work here and should not be reached for even
-- where it can:
--
--   1. API keys are created CLIENT-SIDE, by src/lib/desk/apiKeys.ts
--      through the Supabase JS client as `authenticated`. That role has
--      SELECT on audit_log and nothing else, deliberately: a client
--      that can write its own audit trail does not have an audit trail.
--      So there is no application path that is both able to write the
--      row and trustworthy enough to be allowed to.
--
--   2. An audit entry the application has to remember to write is an
--      audit entry some future code path forgets. A trigger cannot be
--      forgotten, cannot be skipped by a caller in a hurry, and covers
--      writes that arrive by routes nobody has thought of yet.
--
-- SECURITY DEFINER so the insert runs with the owner's rights rather
-- than the caller's, which is the whole point: the actor may not write
-- to audit_log, and the trigger writes on their behalf without lending
-- them the privilege. search_path pinned, per the correction in
-- 20260920233800.
--
-- WHAT IS DELIBERATELY NOT LOGGED: key_hash, and the raw key, which
-- never reaches the database at all. An audit trail that records the
-- credential is a second copy of the credential.

create or replace function noshashi.audit_api_key_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into noshashi.audit_log
      (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values
      (new.organization_id, new.account_id, 'api_key.created', 'api_key', new.id::text,
       jsonb_build_object('name', new.name, 'prefix', new.prefix));
    return new;
  end if;

  -- Revocation only. api_keys.last_used_at is stamped on every
  -- authenticated API call, and logging that would bury real events
  -- under traffic while telling nobody anything the usage tables do
  -- not already say.
  if tg_op = 'UPDATE'
     and new.revoked_at is not null
     and old.revoked_at is null then
    insert into noshashi.audit_log
      (organization_id, actor_account_id, action, entity_type, entity_id,
       previous_state, new_state)
    values
      (new.organization_id, new.account_id, 'api_key.revoked', 'api_key', new.id::text,
       jsonb_build_object('revoked_at', old.revoked_at),
       jsonb_build_object('revoked_at', new.revoked_at));
  end if;

  return new;
end;
$$;

drop trigger if exists api_keys_audit on noshashi.api_keys;
create trigger api_keys_audit
  after insert or update on noshashi.api_keys
  for each row execute function noshashi.audit_api_key_change();

-- Membership is the other thing §27 names explicitly, and the same
-- argument applies: the roster is written by owners and admins through
-- the client, who must not be able to choose whether their change is
-- recorded.
create or replace function noshashi.audit_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into noshashi.audit_log
      (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    values
      (new.organization_id, (select auth.uid()), 'member.added', 'account',
       new.account_id::text, jsonb_build_object('role', new.role));
    return new;
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    insert into noshashi.audit_log
      (organization_id, actor_account_id, action, entity_type, entity_id,
       previous_state, new_state)
    values
      (new.organization_id, (select auth.uid()), 'member.role_changed', 'account',
       new.account_id::text, jsonb_build_object('role', old.role),
       jsonb_build_object('role', new.role));
    return new;
  elsif tg_op = 'DELETE' then
    insert into noshashi.audit_log
      (organization_id, actor_account_id, action, entity_type, entity_id, previous_state)
    values
      (old.organization_id, (select auth.uid()), 'member.removed', 'account',
       old.account_id::text, jsonb_build_object('role', old.role));
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists organization_members_audit on noshashi.organization_members;
create trigger organization_members_audit
  after insert or update or delete on noshashi.organization_members
  for each row execute function noshashi.audit_membership_change();
