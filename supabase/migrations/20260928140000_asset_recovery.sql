-- Asset recovery suite (Pro and above).
--
-- The free recovery tools (pre-sign explainer, stuck funds and reserve
-- recovery, exposure audit, wrong-deposit helper, domain check, asset
-- inventory, Personal Guardian on 3 addresses) run in the app and need no
-- flag. asset_recovery adds valuation of forgotten assets, scans across a
-- book of addresses, Personal Guardian on 50 addresses and the scam
-- cluster mapper; forensic_trace (Enterprise) deepens the cluster map and
-- security_guardian (Strategic) watches a whole cluster server-side.
--
-- Existing paid entitlements receive the flag their tier now carries, the
-- same set the Stripe webhook writes (noshashi-stripe-webhook TIER_FEATURES).

update noshashi.entitlements
   set features = array_append(features, 'asset_recovery')
 where tier in ('desk', 'institution', 'enterprise', 'strategic') and not ('asset_recovery' = any(features));
