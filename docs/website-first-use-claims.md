# Website availability and evidence review

Reviewed against repository main `4a15dc9` on 1 November 2026. This is a source review, not a security assessment or a claim about a deployed customer integration.

| Subject | Implemented or published basis | Website wording |
| --- | --- | --- |
| Free versus paid | `src/lib/billing/catalog.ts` lists free console/gate/CSV export; Pro is $749 per seat/month and $7,490/year with portfolios, alerts, history and 5,000 API verifications. Institutional is $4,000/month and $40,000/year with 100,000 API verifications and `purchase: contact_sales`. Enterprise and Strategic are contracted at $120,000 and $250,000/year. | Prices and billing identifiers are unchanged. Public tools remain free separately from paid Compliance API capacity; Institutional and higher require scope and a contract. |
| SSO | `FEATURE_CATALOG.sso` explicitly says not built; its entitlement flag remains for webhook parity. | Planned, not an available feature implied by the flag or a contract. |
| Dedicated environment | `FEATURE_CATALOG.dedicated_environment` explicitly says coming soon, not offered. | Planned. |
| SLA | `/pricing/` comparison and support KB mark uptime SLA/service credits coming soon. There is no currently offered uptime figure. | Planned; no present guarantee. |
| OS signing | `docs/RELEASE_SIGNING.md` and `.github/workflows/release.yml` document unsigned/unnotarised installers. macOS signing is conditional on configured credentials; Windows signing is not wired. | Beta installers remain unsigned at the OS publisher level. Version 1.x is not described as pre-1.0. |
| Updater signatures | Release workflow produces `.sig` files and `latest.json`; Tauri config contains a public key. `docs/RELEASE_SIGNING.md` documents minisign checks. | Updater signatures are distinguished from OS code signing and ordinary SHA-256 checksums. |
| Authority receipts | `api/_lib/authority.js` and `src/lib/desk/authority.ts` compute SHA-256 over a canonical receipt; no signing key participates. | Hash verification detects a changed body against the recorded digest. It does not authenticate a producer. |
| Audit exports | `src/lib/desk/ledger.ts:signContent` calls SHA-256, despite its historical function name and some UI labels saying signed. | SHA-256 audit export, not a digital signature. No billing feature identifiers were renamed. |
| Ledger evidence | `src/lib/trust/boundary.json` limits explicitly state public servers are trusted; ordinary reads do not verify ledger proofs or validator signatures. Network comparison is separate. | Named ledger evidence and a re-checkable receipt are not presented as independent consensus verification. |
| Independent assessment | `SECURITY.md` states no independent penetration test or certification; progress lists independent security review as not started. | No completed independent assessment, SOC 2 or ISO 27001 claim. Automated tests are not an assessment. |
| Shared records | The trust model describes organizational hosted data and append-only audit records. | Append-only audit trail instead of tamper-proof or absolute immutability claims. |

The public web tools and browser workspace require no account; the desktop app has optional account, billing and organization features. The old KB answer claiming there were no accounts or server-side state was inconsistent with the implemented account and organization paths. Privacy text now also distinguishes local AI from a user-configured hosted provider.

Pilot proposals ask for one workflow, a case list, named reviewers, evidence deliverables, a discrepancy log and agreed baseline measures. Review time, evidence completeness and discrepancies identified are proposed measures; no achieved savings or customer outcome is asserted.

Timed and scroll-triggered subscription dialogs were removed from `site/assets/subscribe.js` on every route. Explicit inline signup remains. No contact, signup, checkout or pilot form was submitted during this review.
