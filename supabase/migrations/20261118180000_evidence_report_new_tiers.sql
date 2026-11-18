-- Three new report tiers (api/_lib/evidence-tiers.js):
--   verified  the $49/month Verified Issuer subscription, one order per paid invoice
--   listing   the $750 Listing review: issuer controls and their history
--   history   the $250 Issuer history report
alter table noshashi.evidence_report_orders drop constraint if exists evidence_report_orders_tier_check;
alter table noshashi.evidence_report_orders
  add constraint evidence_report_orders_tier_check
  check (tier in ('issuer', 'standard', 'quarterly', 'audit', 'verified', 'listing', 'history', 'test'));
