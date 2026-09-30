-- Put the reviewer and auditor roles to work, and record sign-ins in each
-- organization's audit log.

-- ── 1. Reviewers approve ──────────────────────────────────────────────
--
-- The approval checks name their roles inline. Rather than restate five
-- long function bodies, add 'reviewer' to exactly that role list in the
-- definitions that are live, and refuse to finish if any of them did not
-- change (a later edit to one of them would otherwise be silently skipped).
do $$
declare
  fn text;
  def text;
  changed text;
begin
  foreach fn in array array[
    'noshashi.activate_org_policy(uuid, text, integer, uuid, text)',
    'noshashi.decide_policy_exception(uuid, uuid, boolean, text, integer)',
    'noshashi.request_exception_evidence(uuid, uuid, text)',
    'noshashi.org_policies_guard()',
    'noshashi.policy_exceptions_guard()'
  ] loop
    def := pg_get_functiondef(fn::regprocedure);
    changed := replace(def, $q$m.role in ('owner', 'admin', 'compliance')$q$,
                            $q$m.role in ('owner', 'admin', 'compliance', 'reviewer')$q$);
    changed := replace(changed, 'is not an owner, admin or compliance member',
                                'is not an owner, admin, compliance or reviewer member');
    if changed = def and position($q$'reviewer'$q$ in def) = 0 then
      raise exception 'Role list not found in %; migration not applied.', fn;
    end if;
    execute changed;
  end loop;
end $$;

-- ── 2. Reviewers and auditors read the audit log ─────────────────────
drop policy if exists audit_log_select_reviewer on noshashi.audit_log;
create policy audit_log_select_reviewer on noshashi.audit_log
  for select to authenticated
  using (noshashi.has_org_role(organization_id,
    array['owner', 'admin', 'compliance', 'risk', 'regulator', 'reviewer', 'auditor']::noshashi.member_role[]));

-- ── 3. Sign-ins in the organization audit log ────────────────────────
--
-- Supabase Auth writes a session row on every sign-in (token refreshes
-- update it; they do not insert). Each new session is recorded once per
-- organization the person belongs to, as 'member.signed_in', with the
-- assurance level, address and client the session reports.
--
-- This runs inside Supabase Auth's own sign-in transaction, so it must
-- never be able to fail it: every error is swallowed and the sign-in goes
-- ahead unrecorded rather than being refused.
create or replace function noshashi.record_sign_in()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  begin
    insert into noshashi.audit_log (organization_id, actor_account_id, action, entity_type, entity_id, new_state)
    select m.organization_id, new.user_id, 'member.signed_in', 'session', new.id::text,
           jsonb_build_object(
             'aal', new.aal::text,
             'ip', host(new.ip),
             'user_agent', left(new.user_agent, 200))
    from noshashi.organization_members m
    where m.account_id = new.user_id
      and (m.expires_at is null or m.expires_at > now());
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke execute on function noshashi.record_sign_in() from public, anon, authenticated;

drop trigger if exists noshashi_record_sign_in on auth.sessions;
create trigger noshashi_record_sign_in
  after insert on auth.sessions
  for each row execute function noshashi.record_sign_in();

comment on function noshashi.record_sign_in() is
  'Records each new Supabase Auth session as member.signed_in in every organization the person belongs to. Never raises: a failure leaves the sign-in unrecorded, not refused.';
