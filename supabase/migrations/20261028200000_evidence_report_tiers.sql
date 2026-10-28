-- The Ledger Evidence Report's tiers, as the checkout sells them
-- (api/_lib/evidence-tiers.js): the $750 Issuer check is new, and the
-- owner-only test tier was missing, so a real test purchase would have
-- been charged and then refused here by the webhook's insert.
alter table noshashi.evidence_report_orders drop constraint if exists evidence_report_orders_tier_check;
alter table noshashi.evidence_report_orders
  add constraint evidence_report_orders_tier_check
  check (tier in ('issuer', 'standard', 'quarterly', 'audit', 'test'));
