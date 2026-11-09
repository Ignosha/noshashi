# Intelligence foundation — validation and delivery

9 November 2026. Local worktree `feat/intelligence-editorial-foundation-20261109`, based on main e19d3a7. No merge, deployment, live migration, purchase, publication, prospect contact or advertising distribution performed.

## Executed checks

| Check | Result / limits |
| --- | --- |
| Full Vitest suite, final code | **1,578 passed;4 skipped**,121 test files passed and1 skipped. Includes31 new editorial regressions. |
| Focused editorial/CSP |38 passed before the final standalone-build regression was added; the final full suite includes that additional test. |
| Main `npm run build` | Passed: TypeScript build and Vite production bundle. Existing large-chunk and Vite configuration warnings remain. |
| Academy `tsc -p academy --noEmit` | Passed, no diagnostics. |
| Support `tsc -p noshrepair --noEmit` | Passed, no diagnostics. |
| Public `node scripts/build-site.mjs` | Passed after final changes;124 generated pages inspected by the existing script externalizer. External build-time reads in this sandbox were unavailable; honest fallbacks, not fabricated readings. |
| Existing bundle/brand checks | `check:intelligence` and `check:brand` passed. |
| Browser | **28 checks passed** in system Chromium through Playwright: desktop1440, mobile390, tablet768; keyboard focus, mobile menu/Escape, reduced motion, search/reset, reading modes with/withoutJS, HTML injection handling, unavailable feeds and successful retry, source-date labels, native video metadata and captions/transcript. |
| Preserved routes | Local HTTP200 for institutional demo, certificate, delivered, book health, workspace, contact, external news and progress. This checks routes, not successful mainnet analyses or billing. |
| Media | ffprobe: H.264,1920×1080,16seconds,277,188bytes; browser reads duration/dimensions. Silent film, four editorial scenes, no fabricated data; no4K claim. |
| Live collector | Three verified official feeds read successfully with environment-proxy support;30 discovery records saved privately, all unverified research metadata. Five separately prepared original candidate drafts validate but remain NEEDS REVIEW. |
| Private export | Export from the unapproved five-draft queue produced `[]`; no public content released. Immediate repeat collection refused by six-hour budget. |
| Production route audit | Homepage, institutional demo and progress returned200; `/intelligence/` returned404. The new newsroom is **not deployed**. |
| Whitespace | `git diff --check` passed. |

The first sandboxed full-suite run failed because existing tests could not open loopback sockets or spawn Git under the sandbox. The permitted external-sandbox rerun passed. A later standalone newsroom rebuild exposed executable inline theme scripts; the existing CSP test caught it. The builder now externalizes scripts itself, with a dedicated regression, and the final full suite passes. No failure was hidden or waived.

Screenshots and browser results are local review artifacts under `/tmp/noshashi-intelligence-validation/`: desktop, mobile, tablet, light palette and `results.json`. Feed interactions use explicit outage/synthetic fixtures. Those test headlines never enter the repository manifest, actual reporting or screenshots as real news. No native macOS, complete Supabase/RLS deployment, security assessment, automated WCAG certification, load benchmark or production risk-tool/billing end-to-end certification was executed. There is no lint script in this repository; no lint success is claimed. SQL/Edge migrations were unchanged and their full suites were not run.

## Permissions and security review

- Public build imports a fixed empty approved manifest; private queue is outside Git and `site/`. Public projections and build exports whitelist fields, excluding private notes and reviewer identities.
- Approval validates exact canonical public content and becomes stale after edits. It is a hash-based owner workflow, not a digital signature, verified identity or immutable audit system.
- Private review is owner-local0700/0600 with no network/form/script capabilities in its HTML. It is not hosted authentication or multi-user RBAC. Do not expose it through a public web server.
- Discovery URLs are fixed, bounded and redirect-denying; incoming headlines/links are untrusted metadata, never code, approvals, policy configuration or outreach commands. Collection cannot sign, send, book, negotiate, approve or publish.
- Public feed rendering uses text nodes, HTTPS link validation, ten-second deadlines, explicit partial/cache/date/error states and a user-operated retry. No continuous polling.
- No production Travel Rule thresholds, entitlements, prices, billing identifiers, wallet authority, send guards or suppression records changed. Private operational content remains separate from public GitHub/app files.

## Activation and remaining work

Founder review is required before pushing/opening the prepared PR under this task’s external-publication restriction, before deploying the public pages, and before approving any article. The cron example is documentation only; no new job was installed. Full hosted editorial authentication, revision database, persistent scheduler/notifications, daily issue archive, source expansion, multi-chain adapters, founder sales dashboard integration and release blockers are tracked in `intelligence-foundation-audit.md`.

Current API adapters refresh attributed external headlines and existing release notices when a visitor opens the new page **after deployment**. Original NOSHASHI analysis remains manual-review-only. The film and website copy are prepared marketing materials, not a sent advertising campaign.
