-- needs: 20260927130000_support_tickets.sql 20261021120000_noshrepair.sql
-- NOSHREPAIR's security boundary, tested against the real migration.
--
-- Plays a customer, a support employee with and without two-factor, and an
-- unrelated user through every NOSHREPAIR function, and checks each answer:
-- no account view without the customer's grant or without aal2, no key
-- hashes, no direct writes, no repairs outside the allowlist, staff cannot
-- answer a repair for the customer, nobody can delete the access log, and
-- revoking ends access at once. Everything runs in a transaction that is
-- rolled back. Run with scripts/test-sql.sh.
begin;


insert into auth.users (id, email, email_confirmed_at, aud, role, instance_id) values
 ('00000000-0000-4000-8000-0000000000c1','nr-cust@test.invalid',now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
 ('00000000-0000-4000-8000-0000000000a1','nr-staff@test.invalid',now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
 ('00000000-0000-4000-8000-0000000000b1','nr-other@test.invalid',now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into noshashi.accounts (id, email) values ('00000000-0000-4000-8000-0000000000c1','nr-cust@test.invalid'),('00000000-0000-4000-8000-0000000000a1','nr-staff@test.invalid'),('00000000-0000-4000-8000-0000000000b1','nr-other@test.invalid') on conflict (id) do nothing;
insert into noshashi.support_staff (account_id) values ('00000000-0000-4000-8000-0000000000a1');

do $t$
declare
  r jsonb; tk uuid; act uuid; out text := '';
  procedure_note text;
begin
  -- as the customer
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated","aal":"aal1"}', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);
  execute 'set local role authenticated';
  r := noshashi.open_support_ticket('NOSHREPAIR test ticket','bug','normal','Something is broken in the app.','1.0.21','test');
  tk := (r->>'id')::uuid; out := out || 'open:' || (r->>'ok') || ' ';
  r := noshashi.attach_support_diagnostics(tk,'errors','{"errors":[{"message":"TypeError: x is undefined","version":"1.0.21"}]}'::jsonb); out := out || 'attach:' || (r->>'ok') || ' ';
  r := noshashi.attach_support_diagnostics(tk,'bogus','{}'::jsonb); out := out || 'attachBadKind:' || (r->>'code') || ' ';
  r := noshashi.grant_support_access(tk, 100); out := out || 'grant100:' || (r->>'code') || ' ';
  execute 'reset role';

  -- staff WITHOUT two-factor
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal1"}', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
  execute 'set local role authenticated';
  r := noshashi.support_account_view(tk); out := out || 'viewAal1:' || (r->>'code') || ' ';
  out := out || 'diagVisibleAal1:' || (select count(*) from noshashi.support_diagnostics where ticket_id = tk) || ' ';
  execute 'reset role';

  -- staff WITH two-factor, before the customer grants access
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
  execute 'set local role authenticated';
  r := noshashi.support_account_view(tk); out := out || 'viewNoGrant:' || (r->>'code') || ' ';
  r := noshashi.request_support_repair(tk,'refresh_plan',null); out := out || 'repairNoGrant:' || (r->>'code') || ' ';
  r := noshashi.request_support_access(tk,'To check your plan state'); out := out || 'askAccess:' || (r->>'ok') || ' ';
  out := out || 'diagVisibleAal2:' || (select count(*) from noshashi.support_diagnostics where ticket_id = tk) || ' ';
  r := noshashi.support_error_signatures(30); out := out || 'sigs:' || jsonb_array_length(r->'signatures') || ' ';
  -- staff cannot grant themselves access or write tables directly
  r := noshashi.grant_support_access(tk, 24); out := out || 'staffSelfGrant:' || (r->>'code') || ' ';
  begin insert into noshashi.support_access_grants(ticket_id, account_id, expires_at) values (tk, '00000000-0000-4000-8000-0000000000c1', now()+interval '1 hour'); out := out || 'directInsert:ALLOWED '; exception when others then out := out || 'directInsert:denied '; end;
  execute 'reset role';

  -- customer grants 24h
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated","aal":"aal1"}', true);
  execute 'set local role authenticated';
  r := noshashi.grant_support_access(tk, 24); out := out || 'grant24:' || (r->>'ok') || ' ';
  execute 'reset role';

  -- staff now views and proposes
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
  execute 'set local role authenticated';
  r := noshashi.support_account_view(tk); out := out || 'view:' || (r->>'ok') || ' hasHash:' || (position('key_hash' in r::text) > 0)::text || ' ';
  r := noshashi.request_support_repair(tk,'drop_table',null); out := out || 'repairBad:' || (r->>'code') || ' ';
  r := noshashi.request_support_repair(tk,'refresh_plan','Your plan looks stale.'); act := (r->>'id')::uuid; out := out || 'repair:' || (r->>'ok') || ' ';
  r := noshashi.respond_support_repair(act,'applied','ok'); out := out || 'staffRespond:' || (r->>'code') || ' ';
  execute 'reset role';

  -- an unrelated user sees nothing
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated","aal":"aal2"}', true);
  execute 'set local role authenticated';
  out := out || 'otherSeesActions:' || (select count(*) from noshashi.support_repair_actions where ticket_id = tk) || ' ';
  out := out || 'otherSeesLog:' || (select count(*) from noshashi.support_access_log where ticket_id = tk) || ' ';
  r := noshashi.revoke_support_access(tk); out := out || 'otherRevoke:' || (r->>'code') || ' ';
  execute 'reset role';

  -- customer applies, reads log, revokes; staff then loses access
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated","aal":"aal1"}', true);
  execute 'set local role authenticated';
  out := out || 'custSeesAction:' || (select count(*) from noshashi.support_repair_actions where ticket_id = tk) || ' ';
  r := noshashi.respond_support_repair(act,'applied','Plan re-read: pro'); out := out || 'apply:' || (r->>'ok') || ' ';
  r := noshashi.respond_support_repair(act,'declined',null); out := out || 'applyAgain:' || (r->>'code') || ' ';
  out := out || 'custLog:' || (select string_agg(event, ',' order by id) from noshashi.support_access_log where ticket_id = tk) || ' ';
  begin delete from noshashi.support_access_log where ticket_id = tk; out := out || 'logDelete:ALLOWED '; exception when others then out := out || 'logDelete:denied '; end;
  r := noshashi.revoke_support_access(tk); out := out || 'revoke:' || (r->>'revoked') || ' ';
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
  execute 'set local role authenticated';
  r := noshashi.support_account_view(tk); out := out || 'viewAfterRevoke:' || (r->>'code');
  execute 'reset role';
  if out <> 'open:true attach:true attachBadKind:MALFORMED grant100:MALFORMED viewAal1:INSUFFICIENT_PERMISSIONS diagVisibleAal1:0 viewNoGrant:NO_ACCESS repairNoGrant:NO_ACCESS askAccess:true diagVisibleAal2:1 sigs:1 staffSelfGrant:NOT_FOUND directInsert:denied grant24:true view:true hasHash:false repairBad:MALFORMED repair:true staffRespond:NOT_FOUND otherSeesActions:0 otherSeesLog:0 otherRevoke:NOT_FOUND custSeesAction:1 apply:true applyAgain:ALREADY_DECIDED custLog:diagnostics_attached,access_requested,access_granted,account_viewed,repair_proposed,repair_applied logDelete:denied revoke:1 viewAfterRevoke:NO_ACCESS' then
    raise exception E'NOSHREPAIR SQL TEST FAILED\n  got:      %\n  expected: open:true attach:true attachBadKind:MALFORMED grant100:MALFORMED viewAal1:INSUFFICIENT_PERMISSIONS diagVisibleAal1:0 viewNoGrant:NO_ACCESS repairNoGrant:NO_ACCESS askAccess:true diagVisibleAal2:1 sigs:1 staffSelfGrant:NOT_FOUND directInsert:denied grant24:true view:true hasHash:false repairBad:MALFORMED repair:true staffRespond:NOT_FOUND otherSeesActions:0 otherSeesLog:0 otherRevoke:NOT_FOUND custSeesAction:1 apply:true applyAgain:ALREADY_DECIDED custLog:diagnostics_attached,access_requested,access_granted,account_viewed,repair_proposed,repair_applied logDelete:denied revoke:1 viewAfterRevoke:NO_ACCESS', out;
  end if;
  raise notice 'NOSHREPAIR SQL TEST PASSED';
end
$t$;

rollback;
