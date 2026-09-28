-- Covering indexes for foreign keys the performance advisor found
-- unindexed. Without one, deleting or re-keying the referenced row scans
-- the whole referencing table (xrpl_events and webhook_deliveries grow
-- without bound), and joins from the referenced side cannot use an index.

create index if not exists audit_log_actor_idx on noshashi.audit_log (actor_account_id);
create index if not exists org_case_events_actor_idx on noshashi.org_case_events (actor);
create index if not exists org_cases_created_by_idx on noshashi.org_cases (created_by);
create index if not exists org_embeds_created_by_idx on noshashi.org_embeds (created_by);
create index if not exists org_export_schemas_created_by_idx on noshashi.org_export_schemas (created_by);
create index if not exists org_policies_activated_by_idx on noshashi.org_policies (activated_by);
create index if not exists org_policies_created_by_idx on noshashi.org_policies (created_by);
create index if not exists org_policies_submitted_by_idx on noshashi.org_policies (submitted_by);
create index if not exists org_webhooks_created_by_idx on noshashi.org_webhooks (created_by);
create index if not exists organization_members_invited_by_idx on noshashi.organization_members (invited_by);
create index if not exists policy_exception_notes_author_idx on noshashi.policy_exception_notes (author);
create index if not exists policy_exceptions_decided_by_idx on noshashi.policy_exceptions (decided_by);
create index if not exists policy_exceptions_requested_by_idx on noshashi.policy_exceptions (requested_by);
create index if not exists support_messages_author_idx on noshashi.support_messages (author_id);
create index if not exists verification_events_api_key_idx on noshashi.verification_events (api_key_id);
create index if not exists webhook_deliveries_webhook_idx on noshashi.webhook_deliveries (webhook_id);
create index if not exists xrpl_events_watch_idx on noshashi.xrpl_events (watch_id);
create index if not exists xrpl_watches_created_by_idx on noshashi.xrpl_watches (created_by);
