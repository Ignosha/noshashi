-- Admit the two contract tiers the catalogue sells.
--
-- Enterprise and Strategic Infrastructure were added to the pricing page,
-- the console catalogue and the gating (Asset Passport requires
-- Enterprise), but not here. Both tier checks still allowed only
-- operator/desk/institution, so the webhook's write for a signed contract
-- failed and no account could ever hold either tier — which left every
-- enterprise-gated feature unreachable by anyone.
--
-- Widening a CHECK is strictly permissive: every existing row satisfies
-- the new constraint, so nothing is rewritten. Idempotent by drop-first.

alter table noshashi.entitlements drop constraint if exists entitlements_tier_check;
alter table noshashi.entitlements add constraint entitlements_tier_check
  check (tier in ('operator', 'desk', 'institution', 'enterprise', 'strategic'));

alter table noshashi.subscriptions drop constraint if exists subscriptions_tier_check;
alter table noshashi.subscriptions add constraint subscriptions_tier_check
  check (tier in ('operator', 'desk', 'institution', 'enterprise', 'strategic'));
