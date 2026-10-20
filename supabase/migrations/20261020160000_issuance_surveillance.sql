-- Issuance surveillance, now its own flag.
--
-- The Issuance screen was gated on compliance_api, a Pro flag, while the
-- pricing page sold it with Institutional. It now gates on
-- issuance_surveillance, which the Stripe webhook (TIER_FEATURES) writes
-- for Institutional, Enterprise and Strategic. Accounts already on those
-- plans get it here, so nobody loses the screen before their next
-- billing event rewrites their entitlement.

update noshashi.entitlements set features = array_append(features, 'issuance_surveillance')
 where tier in ('institution', 'enterprise', 'strategic') and not ('issuance_surveillance' = any(features));
