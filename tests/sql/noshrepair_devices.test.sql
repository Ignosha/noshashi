-- needs: 20260927130000_support_tickets.sql 20261021120000_noshrepair.sql 20261023120000_noshrepair_devices.sql
-- NOSHREPAIR part 2: one computer at a time, the live look, fixes that run
-- by themselves only when the customer allowed it.
--
-- A customer with two computers (D1, D2). Support asks for a snapshot of D1
-- and sends a fix to D1. Checks: D2 cannot answer D1's requests; nothing
-- runs by itself without a grant; the snapshot runs by itself under a plain
-- grant but a fix does not; a fix runs by itself once the customer allows
-- fixes; support cannot target a computer the customer never reported, or
-- send anything off the list; another customer sees none of it. Rolled back.
begin;

insert into auth.users (id, email, email_confirmed_at, aud, role, instance_id) values
 ('00000000-0000-4000-8000-0000000000c2','nr2-cust@test.invalid',now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
 ('00000000-0000-4000-8000-0000000000a2','nr2-staff@test.invalid',now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
 ('00000000-0000-4000-8000-0000000000b2','nr2-other@test.invalid',now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into noshashi.accounts (id, email) values
 ('00000000-0000-4000-8000-0000000000c2','nr2-cust@test.invalid'),
 ('00000000-0000-4000-8000-0000000000a2','nr2-staff@test.invalid'),
 ('00000000-0000-4000-8000-0000000000b2','nr2-other@test.invalid') on conflict (id) do nothing;
insert into noshashi.support_staff (account_id) values ('00000000-0000-4000-8000-0000000000a2');

do $t$
declare
  r jsonb; tk uuid; snap uuid; fix uuid; fix2 uuid; out text := '';
  d1 uuid := '11111111-1111-4111-8111-111111111111';
  d2 uuid := '22222222-2222-4222-8222-222222222222';
  cust text := '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated","aal":"aal1"}';
  staff text := '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated","aal":"aal2"}';
  other text := '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","aal":"aal1"}';
begin
  -- Customer opens a ticket from D1 and shares diagnostics, so D1 is known.
  perform set_config('request.jwt.claims', cust, true);
  execute 'set local role authenticated';
  r := noshashi.open_support_ticket('Ledger stuck reconnecting','bug','normal','The ledger keeps reconnecting.','1.0.21','test');
  tk := (r->>'id')::uuid;
  r := noshashi.attach_support_diagnostics(tk, 'errors', '{"errors":[]}'::jsonb, d1); out := out || 'diagD1:' || (r->>'ok') || ' ';
  r := noshashi.attach_support_diagnostics(tk, 'snapshot', '{"device":{"label":"macOS"}}'::jsonb, d1); out := out || 'snapKind:' || (r->>'ok') || ' ';
  execute 'reset role';

  -- Staff: nothing without a grant.
  perform set_config('request.jwt.claims', staff, true);
  execute 'set local role authenticated';
  r := noshashi.request_support_repair(tk, 'collect_snapshot', null, d1); out := out || 'snapNoGrant:' || (r->>'code') || ' ';
  execute 'reset role';

  -- Customer grants read-only access from D1, without fixes.
  perform set_config('request.jwt.claims', cust, true);
  execute 'set local role authenticated';
  r := noshashi.grant_support_access(tk, 24, false, d1, 'macOS desktop · 1.0.21'); out := out || 'grant:' || (r->>'ok') || ' auto:' || (r->>'auto_repair') || ' ';
  execute 'reset role';

  -- Staff asks D1 for a snapshot and sends D1 a fix; tries an unknown computer and an unknown action.
  perform set_config('request.jwt.claims', staff, true);
  execute 'set local role authenticated';
  r := noshashi.request_support_repair(tk, 'collect_snapshot', null, d1); snap := (r->>'id')::uuid; out := out || 'askSnap:' || (r->>'ok') || ' ';
  r := noshashi.request_support_repair(tk, 'switch_ledger_server', 'Try another server', d1); fix := (r->>'id')::uuid; out := out || 'sendFix:' || (r->>'ok') || ' ';
  r := noshashi.request_support_repair(tk, 'refresh_session', null, '99999999-9999-4999-8999-999999999999'); out := out || 'unknownDevice:' || (r->>'code') || ' ';
  r := noshashi.request_support_repair(tk, 'run_shell', null, d1); out := out || 'offList:' || (r->>'code') || ' ';
  execute 'reset role';

  -- Another customer sees none of it.
  perform set_config('request.jwt.claims', other, true);
  execute 'set local role authenticated';
  out := out || 'otherSees:' || (select count(*) from noshashi.support_repair_actions where ticket_id = tk) || ' ';
  r := noshashi.respond_support_repair(snap, 'applied', 'x', d1, true); out := out || 'otherAnswers:' || (r->>'code') || ' ';
  execute 'reset role';

  -- The customer's computers answer.
  perform set_config('request.jwt.claims', cust, true);
  execute 'set local role authenticated';
  r := noshashi.respond_support_repair(snap, 'applied', 'Snapshot sent', d2, true); out := out || 'snapFromD2:' || (r->>'code') || ' ';
  r := noshashi.respond_support_repair(snap, 'applied', 'Snapshot sent', d1, true); out := out || 'snapAutoD1:' || (r->>'ok') || ' ';
  r := noshashi.respond_support_repair(fix, 'applied', 'Switched', d1, true); out := out || 'fixAutoNoPermission:' || (r->>'code') || ' ';
  -- Now the customer allows fixes; the same fix may run by itself.
  r := noshashi.grant_support_access(tk, 4, true, d1, 'macOS desktop · 1.0.21'); out := out || 'grantFixes:' || (r->>'auto_repair') || ' ';
  r := noshashi.respond_support_repair(fix, 'applied', 'Switched', d1, true); out := out || 'fixAutoD1:' || (r->>'ok') || ' ';
  out := out || 'markedAuto:' || (select automatic::text from noshashi.support_repair_actions where id = fix) || ' ';
  execute 'reset role';

  -- After revoking, nothing runs by itself.
  perform set_config('request.jwt.claims', staff, true);
  execute 'set local role authenticated';
  r := noshashi.request_support_repair(tk, 'clear_error_log', null, null); fix2 := (r->>'id')::uuid; out := out || 'anyDevice:' || (r->>'ok') || ' ';
  execute 'reset role';
  perform set_config('request.jwt.claims', cust, true);
  execute 'set local role authenticated';
  r := noshashi.revoke_support_access(tk);
  r := noshashi.respond_support_repair(fix2, 'applied', 'x', d2, true); out := out || 'autoAfterRevoke:' || (r->>'code') || ' ';
  r := noshashi.respond_support_repair(fix2, 'applied', 'Cleared', d2, false); out := out || 'applyByHandD2:' || (r->>'ok');
  execute 'reset role';

  if out <> 'diagD1:true snapKind:true snapNoGrant:NO_ACCESS grant:true auto:false askSnap:true sendFix:true unknownDevice:MALFORMED offList:MALFORMED otherSees:0 otherAnswers:NOT_FOUND snapFromD2:OTHER_DEVICE snapAutoD1:true fixAutoNoPermission:NO_ACCESS grantFixes:true fixAutoD1:true markedAuto:true anyDevice:true autoAfterRevoke:NO_ACCESS applyByHandD2:true' then
    raise exception E'NOSHREPAIR DEVICES SQL TEST FAILED\n  got: %', out;
  end if;
  raise notice 'NOSHREPAIR DEVICES SQL TEST PASSED';
end
$t$;

rollback;
