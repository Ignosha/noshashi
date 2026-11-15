# Terminal membership expiry compatibility

The live organization schema already supports expiring regulator memberships. Terminal contract assignments must preserve that older restriction.

The follow-up migration `20261115090000_terminal_membership_expiry.sql` rejects expired memberships for shared cases and for inherited personal Institutional access. Returned access expiry is bounded by membership expiry, contract validity and paid-through time. The Edge organization selector filters expired memberships as well. This creates no seats, entitlements or paid access.

Validation: the isolated SQL suite passes (four SQL test files, including new future/expired licensed-seat cases); 72 targeted terminal and billing-parity tests pass; Edge runtime typecheck covers terminal, payment-review and billing webhook. A rollback-only transaction validates the selected pending migrations against the production schema. No production account or subscription was modified during these checks.

Deployment targets only the missing payment-review/terminal schema and these reviewed functions. Unrelated migration timestamp differences in historical records are preserved. Provider secrets and existing subscription prices are unchanged. The previous webhook source is retained privately for rollback; it is not committed here.
