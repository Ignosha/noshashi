# Ledger Desk Research V2 — readiness audit

Baseline: main `17938b9` (PR #167), 13 November 2026. The deployed site returned HTTP 200 with last-modified 16:23:50 UTC. Review scope preserves typography, graphite/paper themes, existing instruments, navigation, routes and restrained motion. Unrelated open PRs #152, #156 and #160–164 are excluded. No authentication, authorization, billing, production credentials, publishing or deployment changes are authorized.

## Before implementation

| Classification | Evidence / finding |
| --- | --- |
| VERIFIED | Previous Ledger Desk refinement deployed: clear hero, three task pillars, simulated case, source-linked readiness, pricing guide, timestamp annotations. The case explicitly simulates findings and does not test production policy evaluation. |
| VERIFIED | GitHub publishes v1.0.27 dated 4 November 2026, including desktop installers and updater signature artifacts. v1.0.22 is an older release dated 23 October. GitHub marks both non-prerelease; the product still labels desktop builds beta. |
| INCOMPLETE | Release selection uses the first non-Academy entry, without distinguishing asset-bearing desktop releases, prereleases, runtime validation or historical release notes. Documentation and product notices can look like a conflicting current version. |
| INCOMPLETE | Status derives OPERATIONAL / READ LIVE / UNAFFECTED from absence of incident notices, not actual health checks. It cannot prove service availability. Progress also hardcodes a passing-test count. |
| IMPLEMENTED BUT UNTESTED | Supabase password/OTP/TOTP clients and organization authorization/migrations exist; a signed-in end-to-end exercise and provider runtime settings are not established by code presence. No test account or paid entitlement will be created in this audit. |
| PLANNED | Existing SSO/SCIM, contractual SLA and dedicated-environment promises retain planned/scoped status, not verified delivery. |
| UNKNOWN | Latest independently verified macOS installation, signing/notarization, physical Monterey execution and completed independent security assessment. Artifact availability and updater signatures do not establish these. |
| INCOMPLETE | Live newsroom panels bound loading and safely render external titles, but cached/stale timestamps are not explicitly evaluated. Public article manifest is empty; retain the editorial empty state. |

Implementation priorities: (1) remove unsupported health claims and diagnose broken links; (2) centralize release classification and render one source-backed snapshot across relevant pages; (3) document account surface boundaries without changing auth; (4) make source age/error/empty states explicit; (5) adopt Verify → Investigate → Decide → Prove within the existing layout; (6) validate real public reads separately from recorded/simulated tests and capture responsive screenshots.

Release evidence: https://github.com/Ignosha/noshashi/releases/tag/v1.0.27 and https://github.com/Ignosha/noshashi/releases/tag/v1.0.22. Repository authorities: `api/_lib/project-feed.js`, `src/lib/auth/useAuth.tsx`, `src/lib/supabase/`, `src/lib/billing/catalog.ts`, `src/lib/trust/boundary.json`, `docs/RELEASE_SIGNING.md`, and public tool handlers under `api/_lib/routes/`.

## After implementation and functional evidence

| Surface | Classification after this change | Evidence / limit |
| --- | --- | --- |
| Public issuer controls | VERIFIED live read | Production `/api/authority` returned HTTP 200, issuer flag checks and ledger 108,306,964. The result explicitly lacked a supply walk (`source: none`, `walk: null`); concentration/trust-line coverage is not verified by that read. A rule-set no-go is not a legal judgment or proof of wrongdoing. |
| Shared public tools function | INCOMPLETE in production; VERIFIED local repair | Production `/api/book` and `/api/delivered`, including invalid input, returned 500. Vercel logs identify `ERR_REQUIRE_ESM` from the codec's CommonJS dependency chain. Node with `--no-experimental-require-module` reproduced the crash. A public-address-only Node-built-in checksum validator removes that boot dependency; differential tests against the original codec cover 100 random valid AccountIDs, checksum mutations, special accounts and invalid input. No signing, seed generation, auth or policy rule is added. Production is not repaired until an approved deployment. |
| Liquidity | VERIFIED local → real public ledger | Repaired `/api/book` returned 200 at ledger 108,307,060, reading 100 offers per side. Quoted ask depth 359,151.6127433736 USD versus funded 116,065.63076704305 USD in this particular snapshot. This is an audit observation, not a permanent site value, complete market coverage or execution guarantee. |
| Payment lookup / delivered amount | VERIFIED local → real public ledger | Re-read archived real transaction `33C313E12DD8B2CFDB98ABC6298D4EFD0F3BC8EF283C057A026DA6170E7939AD` through the repaired settlement endpoint: validated at ledger 107,585,451, EXACT_LEDGER_MATCH, with node source and raw evidence. Expectation was derived from the recorded transaction for this read-only test, not an independent invoice. Recomputed SHA-256 matched the response receipt. |
| Payment history | VERIFIED partial/error behavior; INCOMPLETE coverage | JSON query returned 200 with `complete:false`, `stopped_because:page_cap`, zero rows within the requested old date range. This does not show absence of payments. Invalid address returned 400 after repair. Recorded transaction vectors separately cover failed, unvalidated, mismatched, partial and unavailable amounts. |
| Policy engine | VERIFIED automated logic; IMPLEMENTED BUT UNTESTED hosted workflow | Existing tests exercise GO/HOLD/NO-GO and evidence integrity. Server-side organization approval restrictions/migrations remain unchanged. No real organization activation, two-person approval or authenticated customer onboarding was performed. The simulated homepage walkthrough is separate and proves none of those runtime capabilities. |
| Accounts | IMPLEMENTED BUT UNTESTED signed-in runtime | `/docs/accounts/` distinguishes public tools, desktop Supabase accounts, the separate Payment Review browser portal, OTP versus TOTP, roles/RLS and planned enterprise SSO/SCIM. Confirmation-page wording no longer treats reaching a page as account-readiness proof. No provider, migration, account, MFA or authorization setting was changed. |
| Intelligence | VERIFIED source reads and browser states | Production market and headline endpoints returned 200. External headlines remain discovery leads, not approved articles. The public article manifest remains empty. Browser checks cover empty, stale, unknown-timestamp, partial and failed feeds; retry is available without inventing content. Existing ledger globe freshness/reduced-motion behavior is preserved. |
| Release information | VERIFIED publication/download metadata; UNKNOWN execution assurance | One classifier feeds `site/data/releases.json`, homepage downloads/readiness, docs/release-notes, progress/status and Trust. Academy releases, asset-free publications and development prereleases are distinguished. Source failure gives unavailable, not an old fallback. v1.0.27 was published 2026-11-04; macOS Apple Silicon DMG responded HTTP 200 with 4,558,487 bytes to HEAD. Neither this nor GitHub's non-prerelease flag establishes stable runtime, signed/notarized binaries or physical macOS testing. |
| Status | VERIFIED notice semantics, UNKNOWN runtime health | Absence of notices now says NO RECENT NOTICE, with NOT PROBED for dependencies. Removed unmeasured OPERATIONAL/READ LIVE/UNAFFECTED claims and the hardcoded passing-test count. Historical notes remain historical. |

The cold-start dependency failure is visible in function logs classified `info/function` on stderr, not only error-level entries. Error-only filtering previously missed it. Future operational checks must inspect request status and stderr as well as severity labels.

## Pricing and enterprise consistency

| Plan | Monthly catalog | Annual catalog | Scope |
| --- | --- | --- | --- |
| Free | $0 | — | Public investigations and free desktop functionality; paid Compliance API capacity is separate. |
| Pro | $749 / seat | $7,490 / seat | Annual = ten monthly payments; 5,000 API verifications/month in existing catalog; priority support. |
| Institutional | $4,000 | $40,000 | Unlimited seats; annual = ten monthly payments; existing 100,000 API verifications/month; contract required. |
| Enterprise | $10,000 equivalent | $120,000 | Annual contracted scope. No two-month discount is inferred. |
| Strategic Infrastructure | $20,833 rounded equivalent | $250,000 | Annual contracted source amount; the monthly number is rounded. Capacity and burst limits are contracted. |

No prices, Stripe identifiers, checkout, grants or API limits changed. Corrected the public next-business-day support promise to catalog-backed priority support with scope agreed separately. Documentation now translates internal Desk/Institution identifiers to Pro/Institutional. SSO/SCIM, uptime guarantees and dedicated environments remain planned/scoped. Hash-bearing certificate/export descriptions were corrected without changing export format or signing behavior; HMAC webhook descriptions remain distinct.

## Preserved design and implementation scope

The same Instrument Serif / Inter / IBM Plex Mono typography, graphite/warm-paper colors, panels, borders, tables, navigation, existing illustration, issuer instrument, receipt downloads and responsive layouts remain. The existing workflow components now say VERIFY → INVESTIGATE → DECIDE → PROVE; the four-stage platform list and research notes use the same language. No image generation, new visual identity, marketing overlay, authentication infrastructure or external outreach was added.

## Follow-up checklist

1. **P0:** Review/approve this PR, then separately authorize deployment. Re-run the actual production payment/liquidity/invalid-input checks after deployment; the currently deployed shared tools function remains broken.
2. **P1:** Exercise dedicated test-user and test-organization sign-up, recovery, TOTP enrollment/challenge, RLS, entitlements and two-person activation with authorized test credentials. No customer/production account was used here.
3. **P1:** Verify macOS Intel/Apple Silicon installations and physical Monterey behavior. Obtain independent artifact OS-signing/notarization evidence; never infer it from updater `.sig` files.
4. **P1:** Review pinning a supported production Node LTS rather than the current open-ended engine range. This audit observed Node 26 in production and tests the API boot regression with the CJS-to-ESM bridge disabled; no runtime project setting was changed.
5. **P2:** Add separately scoped authenticated health checks if actual uptime reporting is desired. Until then the notice board correctly remains NOT PROBED.
6. **P2:** Complete full trust-line/distribution coverage checks, broader live payment outcomes, signed-in desktop workflows, independent accessibility/security review and real-device performance testing. Source snapshots and automated checks are bounded evidence, not certifications.

No publication, merge, deployment, purchase, prospect contact or production secret change was performed. The review branch disables its own automatic Vercel Git deployment before push.

## Executed validation

- Final full Vitest run: **129 files passed, one skipped; 1,651 tests passed, four skipped**. Initial failures were the intentionally expanded documentation navigation and the stale generated documentation snapshot after source wording changed; updated the navigation expectation and regenerated with the repository's `UPDATE_DOCS=1` workflow, then reran successfully. No failing check was hidden.
- Targeted cold-start, checksum parity, release selection/source failure, status semantics, exact settlement outcomes and freshness tests passed. Existing policy, permission, receipt and billing tests remain in the full suite.
- TypeScript/Vite application build and static site build passed. Existing large-chunk, mixed module-format and static/dynamic import warnings remain; they are not represented as performance improvements or clean build output.
- New browser checks passed across eight pages on desktop/mobile: metadata, one release record per relevant page, four homepage stages, horizontally scrollable tables without page overflow, stale/unknown/partial/error feeds, stale ledger time, annual/monthly pricing switching and native required demo-form validation. No contact email was submitted.
- Existing newsroom smoke: **28 checks passed**, including reading modes, captions, source failure/retry, inert untrusted text and route preservation. Existing issuer/receipt regression passed dark, paper, mobile, reduced-motion and no-JavaScript modes, exact receipt downloads and failed/tampered/unavailable/late-response handling.
- Internal-anchor destination scan found **zero missing local destinations** before implementation; final scan is repeated with the new account documentation route. Existing routes/authentication integrations are retained.
- Release verification used the GitHub API and a HEAD request to the existing macOS DMG; no installer was executed or purchased. Public ledger reads and response evidence are preserved in task artifacts, separately from explicitly synthetic browser failure fixtures and recorded regression vectors.
- No new third-party dependency, analytics, hosted job or polling loop was introduced. Source freshness logic is a small local module. This is targeted accessibility/responsive verification; full WCAG certification, Lighthouse/field performance, independent security testing and physical desktop validation remain unperformed.
- Local SQL/server-auth tests were not run against a database: no configured local test Postgres was used, and production credentials were not accessed. The existing PR SQL job supplies a separate database gate; its results must be checked independently of JS test success.

[Before status](screenshots/ledger-readiness-v2/review-before-status.png) · [After status](screenshots/ledger-readiness-v2/review-after-status.png) · [Homepage](screenshots/ledger-readiness-v2/review-after-home.png) · [Accounts](screenshots/ledger-readiness-v2/review-after-accounts.png). Full desktop/mobile page captures and real-read JSON evidence are retained under the task's `ledger-readiness-v2` artifacts.
