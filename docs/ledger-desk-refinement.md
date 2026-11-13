# Ledger Desk Research refinement

## Audit and preservation plan — before implementation

Baseline: `11dc620`, merged PR #166. Production returned HTTP 200 on 13 November 2026; its last-modified response was 15:29:50 UTC. Work takes place in an isolated worktree; existing BIMI changes and macOS PRs #152, #156 and #160–164 are untouched.

Design authority: `templates/home.html`, `site/assets/accent.css`, `desk-editorial.css` and `desk-experience.css`. Preserve Instrument Serif headlines, Inter body copy, IBM Plex Mono labels, graphite and warm-paper theme tokens, fine rules, restrained buttons and current navigation. Preserve the live issuer form/output, comparison table, existing illustrations/charts, recorded desktop tour, public tool routes, authentication, APIs and pricing/billing identifiers. No new illustration, globe, 3D layer, gradient or global token change.

Observed gaps: the poetic homepage headline delays product identification; tools are grouped by implementation rather than visitor task; no compact end-to-end investigation explains how evidence leads to a decision; release, security and signing limits are distributed across paragraphs; pricing's full entitlement matrix is difficult to scan; article dates omit time/UTC and evidence context could distinguish source facts from editorial interpretation more clearly.

Priority order:

1. Clarify the hero within its existing type/grid system and add a compact Verify / Investigate / Govern task index.
2. Add a six-step, explicitly simulated case file with useful exceptions and local evidence export; preserve the live investigation separately.
3. Connect institutional use cases through Problem → Analysis → Evidence → Decision, and add a source-linked operational status table.
4. Add a concise plan-selection table alongside the existing verified prices and detailed comparison; preserve checkout and contracts.
5. Refine newsroom source/timestamp/context presentation without publishing articles, changing approvals or replacing its layout.
6. Verify desktop, mobile, paper theme, keyboard navigation, reduced motion, failure states and regressions. Capture the unchanged baseline and refined result with the same source-outage setup.

## Evidence boundaries

Public tools currently demonstrate issuer controls, delivered-payment evidence and funded-depth snapshots. Public RPC reports are trusted node evidence, not independent consensus proofs. Hash receipts are not signatures. Policy settings do not establish legal compliance or block on-chain payments. The new walkthrough must label every example number/status simulated; sample thresholds are not law and must not modify real policies.

GitHub's latest published desktop release was `v1.0.27`, 4 November 2026, with macOS Intel/Apple Silicon, Windows and Linux assets. Artifact availability is not physical compatibility, OS code-signing or notarization verification. `docs/RELEASE_SIGNING.md` documents unsigned beta installers and conditional signing setup. No completed independent security assessment is established by the reviewed repository; production credential status is unknown and will not be inspected or modified.

No merge, deployment, article publication, outreach, purchase or credential change is authorized by this refinement task. The review branch will disable its own Vercel Git deployment before it is pushed.

## Implemented refinement

- Direct product headline and restrained research/documentation/demo links in the existing hero grid.
- Verify / Investigate / Govern index without removing any tools or technical information.
- Six native disclosure steps, three simulated scenarios, explicit unknowns, example-policy HOLD/NO-GO results and browser-local JSON export. No network, account persistence, regulatory threshold or production policy engine is involved.
- Existing institutional use-case panels now follow Problem → Analysis → Evidence → Decision.
- Readiness table links public tools, release records and signing documentation. Missing release data renders unavailable rather than substituting a version.
- Pricing selection guide sits above the unchanged price/allowance comparison. Billing catalog, checkout and contract gates are untouched.
- Article/source timestamps now include UTC time, with readable unknown states; research notes distinguish attributed reporting from analysis/inference and policy decisions. Article approval and public manifest are unchanged; no articles were published.

## Claims review

| Class | Current evidence / treatment |
| --- | --- |
| VERIFIED in repository | Public issuer-control, delivered-payment and funded-depth demonstrations; configurable policy code; existing price catalog; published v1.0.27 release metadata. These are bounded capabilities, not independent effectiveness certifications. |
| SIMULATED | Entire XRPL-001 case, including amounts, ledger references, liquidity, findings and sample decisions. No real wallet/transaction is represented. |
| INFERRED | Institutional use cases describe possible workflows, not confirmed buyer needs or financial outcomes. |
| UNVERIFIED | Independent security assessment, OS signing/notarization of the current artifacts and physical Monterey testing are not established by this review. |
| UNKNOWN | Production credentials/configuration, real customer outcomes, legal compliance and future execution. No credential inspection or production changes. |
| PLANNED / scoped | SSO, uptime SLAs and dedicated environments retain existing planned status. RLUSD session checks do not imply persistent supply history or hosted alerts. |

Authority: [product claims review](website-first-use-claims.md), [signing documentation](RELEASE_SIGNING.md), [published release](https://github.com/Ignosha/noshashi/releases/tag/v1.0.27), `src/lib/policy.ts`, and `src/lib/billing/catalog.ts`. Review date: 13 November 2026. The new sample is a teaching aid, not a new compliance or ledger-verification product.

## Verification and limits

- Full existing Vitest suite: **127 files passed, one skipped; 1,640 tests passed, four skipped**. New decision/source tests separately: **six passed**.
- Static website build and TypeScript/Vite application build succeeded. Existing module-format warnings and application chunks over 700 KB remain; no new dependencies were added.
- New browser workflow checks cover scenario changes, all six steps, keyboard tab order/visible focus, actual downloaded JSON, reset, no-JavaScript disclosures, uncaught errors, desktop/tablet/mobile overflow, and unchanged fonts/background/rules against the baseline.
- Newsroom browser smoke: **28 checks passed**. Its hardcoded preview URLs were corrected to honor `APP_URL`; the initial run failed against the wrong preview origin and passed after correction.
- Existing recorded issuer/receipt and homepage experience regressions passed in dark, paper, mobile, reduced-motion and no-JavaScript modes, including unavailable, malformed and tampered source states, cache labels, exact receipt exports, navigation and reduced motion.
- New browser assets total **11,238 bytes uncompressed**. The sample adds no polling, remote data collection, animation or third-party script. No paid service or operational infrastructure is introduced.
- Screenshots use explicit API unavailable fixtures and reduced motion for a consistent comparison. They do not certify live provider availability. Recorded issuer regression fixtures remain labeled with their original ledger provenance.
- This is targeted browser/accessibility validation, not a complete WCAG certification, real-device audit, Lighthouse benchmark, independent penetration test or physical desktop compatibility test.

## Screenshots and review

[Before desktop](screenshots/ledger-desk-refinement/before-hero.png) · [After desktop](screenshots/ledger-desk-refinement/after-hero.png) · [Simulated case file](screenshots/ledger-desk-refinement/after-case.png).

Full-page dark/paper/mobile/tablet, pricing and Intelligence comparisons are retained in the task artifacts. The review branch disables its own automatic Vercel Git deployment. Production routes, authorization, private founder data, editorial approval, APIs and unrelated release work are unchanged.
