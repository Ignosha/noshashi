# Institutional Case Review — Ledger Desk static preview

Path: `site/case-review/index.html` and `site/case-review/case-review.js`.

This page is a **synthetic, static, read-only UX concept**. It deliberately does not invoke the live XRPL Autopsy gateway, read customer policies, or handle API secrets. It presents three simulated investigation scenarios:
1. Unchanged control conditions, but external approval still required.
2. Issuer global freeze introduced after approval, resulting in HOLD.
3. Missing ledger evidence, resulting in UNKNOWN/HOLD with no receipt.

Every scenario exports JSON with `synthetic: true`, `authorizationGranted: false`, `controlEvidenceAuthenticated: false`, and `receipt: null`. The preview does not claim to calculate a digest, corroborate RPC responses, or grant payment approval.

The separate Node research evaluator in `scripts/institutional-case-review.mjs` composes dual-provider Autopsy, Approval Drift, and an unsigned receipt, with a fail-closed HOLD decision. The browser is not yet connected to it.

## Demo route
After the normal static site build or in a branch preview, navigate to `/case-review/`. The institutional landing page links to the demo. The script uses no inline event handlers, no remote calls, and no private keys.

## Next engineering gate
1. Build a read-only validated-ledger adapter for control snapshots at pinned ledger indices; do not trust caller assertions.
2. Add authenticated institutional intent and approval policy versioning, with role boundaries.
3. Add a review service with explicit permission model, audit logs, and safe data retention.
4. Produce signed receipts that include review context and ledger evidence, independently verifiable by a third party.
5. Run end-to-end tests and customer pilot with measured time savings; do not market this page as a live enterprise feature.

No production deployment, API exposure, signing, billing, or outreach is authorized by this preview.
