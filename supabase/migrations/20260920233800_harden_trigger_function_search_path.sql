-- Pin search_path on the two trigger functions added by
-- 20260920190000_organizations_roles_audit.sql.
--
-- That migration hardened is_org_member and has_org_role with
-- `set search_path = ''` because they are SECURITY DEFINER, and left
-- the two trigger functions alone. Supabase's database linter flagged
-- both as `function_search_path_mutable` immediately after the
-- migration was applied, and it is right: a function whose search_path
-- resolves from the caller's session can have an unqualified name
-- shadowed by a schema the caller controls.
--
-- It is a smaller exposure on a SECURITY INVOKER trigger than on a
-- definer function, which is presumably why it slipped — the hardening
-- was applied to the two functions where it was obviously required and
-- not to the two where it merely should be. That is the wrong split:
-- the hardening is free, and "these two are safe enough" is a claim
-- that has to be re-checked every time either body changes.
--
-- Neither body needs anything outside pg_catalog, which stays
-- implicitly searchable under an empty search_path: one raises an
-- exception from tg_op, the other calls now().
--
-- Applied to production alongside the migration it corrects. Verified
-- by reading pg_proc.proconfig: all four functions in this schema now
-- carry search_path="".

create or replace function noshashi.audit_log_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'noshashi.audit_log is append-only: % is refused. Correct a row by appending a correction.',
    tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create or replace function noshashi.organizations_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
