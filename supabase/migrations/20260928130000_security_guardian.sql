-- Security: account-takeover alerts on watched accounts (Strategic), and
-- the security features each plan carries.
--
-- The watcher now classifies SetRegularKey and SignerListSet as
-- keys_changed and AccountDelete as account_deleted. When one of those,
-- or the master key being disabled or re-enabled, happens on an account
-- an organization with the security_guardian feature watches, the
-- organization's webhooks also receive security_alert: the first move in
-- almost every XRPL account takeover is a new key of the thief's own.

create or replace function noshashi.xrpl_event_type_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'payment_in', 'payment_out', 'payment_self', 'trustline_changed', 'trustline_frozen', 'trustline_unfrozen',
    'account_settings_changed', 'offer_created', 'offer_cancelled', 'check_created', 'check_cashed', 'check_cancelled',
    'escrow', 'clawback', 'nft', 'amm', 'keys_changed', 'account_deleted', 'rippled_through', 'other'
  ]::text[];
$$;

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
    'custom_alert', 'xrpl_event', 'deposit_screened', 'security_alert'
  ]::text[];
$$;

create or replace function noshashi.webhook_from_xrpl_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
begin
  payload := jsonb_build_object(
    'event_id', new.id, 'watch_id', new.watch_id, 'address', new.address, 'type', new.event_type,
    'tx_hash', new.tx_hash, 'ledger_index', new.ledger_index, 'ledger_time', new.ledger_time,
    'tx_type', new.tx_type, 'tx_result', new.tx_result, 'counterparty', new.counterparty, 'data', new.data);
  perform noshashi.webhook_emit(new.organization_id, 'xrpl_event', payload);
  if new.screening is not null then
    perform noshashi.webhook_emit(new.organization_id, 'deposit_screened',
      payload || jsonb_build_object('verdict', new.verdict, 'screening', new.screening));
  end if;
  if new.tx_result = 'tesSUCCESS'
     and (new.event_type in ('keys_changed', 'account_deleted')
          or (new.event_type = 'account_settings_changed'
              and (new.data->>'set' = 'disableMasterKey' or new.data->>'clear' = 'disableMasterKey')))
     and noshashi.org_has_feature(new.organization_id, 'security_guardian') then
    perform noshashi.webhook_emit(new.organization_id, 'security_alert',
      payload || jsonb_build_object('reason', case new.event_type
        when 'keys_changed' then 'The account''s signing keys changed. If your organization did not make this change, treat the account as compromised.'
        when 'account_deleted' then 'The account was deleted and its XRP sent to the counterparty.'
        else 'The master key was disabled or re-enabled.' end));
  end if;
  return new;
end;
$$;

revoke execute on function noshashi.webhook_from_xrpl_event() from public, anon, authenticated;

-- Existing contract entitlements receive the security features of their tier.
update noshashi.entitlements
   set features = array_append(features, 'incident_response')
 where tier in ('desk', 'institution', 'enterprise', 'strategic') and not ('incident_response' = any(features));
update noshashi.entitlements
   set features = array_append(features, 'forensic_trace')
 where tier in ('enterprise', 'strategic') and not ('forensic_trace' = any(features));
update noshashi.entitlements
   set features = array_append(features, 'security_guardian')
 where tier = 'strategic' and not ('security_guardian' = any(features));
