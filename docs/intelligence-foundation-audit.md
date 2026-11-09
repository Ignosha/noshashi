# Intelligence foundation — audit and staged delivery

Inspected 9 November 2026 against `origin/main` e19d3a7. No AGENTS.md was present in the repository or applicable parent directories. Work is isolated from other worktrees and local BIMI edits.

## Architecture and evidence inventory

| Area | Observed implementation | Boundary / gap |
| --- | --- | --- |
| Public website | Generated static `site/`; `scripts/build-site.mjs`, shared shell and committed browser bundles; Vercel APIs | Not a Next.js CMS. Preserve existing routes and CSP. |
| Desktop | React 18 / TypeScript / Vite / Tauri 2; separate Academy and support apps | Website assets do not update installed apps. Native release work is separate. |
| Headlines | `api/_lib/news.js`, `/api/xrp-news`; Google News, Cointelegraph and CoinDesk metadata | Attributed external headlines, not original reporting or source verification. |
| Market/ledger | `api/_lib/market.js`; CoinGecko and XRPL public node reads | Source-specific availability; connection health is not analysis success. No extra synthetic ticker added. |
| Project updates | `api/_lib/project-feed.js`; reviewed repository notices and GitHub releases | Already supports automatic release coverage; not a product/security certification. |
| Risk | Existing issuer, delivered-payment, funded-depth modules and receipt flows | Node reads are not independent consensus validation; hashes are not signatures. No news-to-risk scoring side effects added. |
| Auth / data | Supabase functions and `noshashi` schema migrations: organizations, memberships, RLS, audit, policy, payments and billing | Source code reviewed; deployed Supabase schema/policies were not attested. No live migration or auth rewrite. |
| Private operations | Separate Cloudflare D1 tables for BD history, suppressions, approvals, send claims, inbox checkpoints, operator articles/tasks/runs/revenue | Schema names read through connected tools only. No private rows copied into this repository or exposed to the public app. No editorial publication tables observed. |
| Lead capture | Existing `/contact/`, tester/demo routes and server/Edge validation paths | Reused links; no new notification sender or unreviewed business process enabled. |
| Existing scheduling | `refresh-site.yml` calls a configured deploy hook; private operator has separate collection/report jobs | A deploy refresh is not an editorial approval. This change does not enable or change either schedule. |

## Open work reviewed

- [#152](https://github.com/Ignosha/noshashi/pull/152): separate macOS Operator, Keychain bridge, ad hoc signed evaluation build. Still open when inspected. Its description reports build/metadata checks, not physical Monterey operation. Runtime Stripe restricted-key setup, Apple Developer ID signing, notarization and physical macOS12.7.6 checks remain unresolved until current independent evidence says otherwise. No credentials were inspected or changed.
- [#156](https://github.com/Ignosha/noshashi/pull/156): security/Treasury Guard and organization review work, still open. Local polling, review records and prototypes must not be marketed as hosted interception, reversal or guaranteed recovery.
- [#160](https://github.com/Ignosha/noshashi/pull/160) → [#164](https://github.com/Ignosha/noshashi/pull/164): stacked desktop redesign. Left untouched; not merged into this work.

PR descriptions are source evidence about those PRs, not tests executed in this phase.

## First functional phase implemented

1. `/intelligence/` and `/intelligence/archive/`: responsive Ledger Desk editorial surface, a clearly illustrative globe, source-first empty states, accessible search/categories, risk-tool links, demo/testing CTA and product-update links. Homepage teaser and shared navigation make it discoverable. Existing routes remain.
2. Real16-second1920×1080 silent product film, locally produced with browser-rendered type/illustration and ffmpeg. No paid media, fabricated chart, live-transaction animation claim or documentary imagery. Captions, text transcript, native controls and no autoplay.
3. Automatic external headline and NOSHASHI release panels reuse existing APIs. One bounded10-second request each per visit, explicit unavailable states and retry, source timestamps and cache/partial labels. External coverage is separate from original analysis.
4. Article renderer: original reporting/event/publication/update dates, primary citations, per-claim evidence labels, Simple/Professional reading modes, explicit limits, related reading, corrections and retraction notices. Public manifest is intentionally empty: no unapproved article was published.
5. Owner-local editorial queue: bounded fixed-feed collection, duplicate detection, changed-source flags, source health, six-hour collection budget, provider Retry-After, private review document, exact-content approval digest and explicit publication/export commands. No model provider or article-writing service is provisioned.
6. Publication build gate: rejects non-public states, stale approvals, unsupported workflows/claims, missing source evidence, future dates, duplicate slugs and premature scheduling. Both the public build input and rendered public projection whitelist fields; private notes/identities are excluded.

This is a functional foundation, not completion of the nine-phase master scope. The private review document is an owner-local HTML file under OS permissions, not a hosted authenticated CMS. Its local activity history is editable and is not an immutable audit trail. SHA-256 pins exact content; it is not a digital signature, independent fact checker or proof of founder identity.

## Subsequent reviewable phases

| Next phase | Work | Acceptance boundary |
| --- | --- | --- |
| Hosted editorial control | Separate private database/service; reuse reviewed owner authentication, MFA and server-side authorization, revisioned edits and reviewer actions | No private BD store reachable through public APIs. Staff assignment never inferred from email address. |
| Persistent automation | Deploy collector under an approved private owner process, persist checkpoints/leases and health alerts; add verified regulator/company adapters | Approved source registry, budgets, manual publication and secrets configured before activation. |
| Editorial publication | Review five prepared candidate drafts, resolve dates/legal-status gaps, owner approve exact revisions; promote sanitized artifact in a separate change | No news quota; no automatic production policy changes. |
| Risk integration | Typed XRPL evidence references attached to an article, with ledger/scope/freshness and explicit match provenance | No identity inference, news-driven score inflation or speculative Avalanche integration. |
| Founder workspace | Top3 actions, authenticated editorial review and release-readiness status beside existing private operations | Do not duplicate outreach history or change old send approvals/holds. Current master instruction requires exact founder first-contact approval; no outreach performed here. |
| Enterprise and release | Verify actual runtime credentials, installer signatures, notarization, physicalMac tests and billing definitions | No enterprise readiness guarantee from a UI, a catalog price or a successful build. |

## Verification and legal research methodology

Primary-source discovery is not verification. A reviewer checks original document, event date versus report date, precise legal status, the supporting claim span, important figures and unresolved gaps. VERIFIED means the cited statement was checked, INFERRED identifies analysis, UNVERIFIED marks an unsupported claim, UNKNOWN marks unavailable information. Source statements of opinion remain attributed opinions. Metadata collection creates RESEARCHING records with UNVERIFIED status and no article body.

The five November9 leads were researched and original draft notes prepared outside Git in the private review store. Important findings:

- A: [OCC decision1370](https://www.occ.gov/topics/charters-and-licensing/interpretations-and-decisions/2026/cd1370.pdf) is dated April2 and grants **preliminary conditional** approval; final authorization depends on preopening requirements. Later final status was not established. No Coinbase demand/customer claim.
- B: [ICE’s platform announcement](https://ir.theice.com/press/news-details/2026/The-New-York-Stock-Exchange-Develops-Tokenized-Securities-Platform/default.aspx) describes development subject to approvals and multichain design. It does not establish a production Avalanche integration. Date/current approval gaps remain.
- C: [Joint withdrawal notice2026-22809](https://www.govinfo.gov/content/pkg/FR-2026-11-09/html/2026-22809.htm) withdraws the2020 NPRM as of November9. It discusses the proposed$3,000→$250 international threshold reduction and references existing duties. It does not justify removing all Travel Rule controls. Applicability/exemptions and other jurisdictions need expert review.
- D: [BPI’s August4 statement](https://bpi.com/same-risks-same-safeguards-modernizing-illicit-finance-controls-for-digital-assets/) argues for stronger secondary-market coverage. This is a policy position, not new law, wrongdoing evidence or a wallet identity. Underlying detailed letters need additional review.
- E: [CFTC’s May29 advisory announcement](https://www.cftc.gov/PressRoom/PressReleases/9239-26) concerns24/7 trading/clearing/settlement and asset-class differences. A separateJune document was bot-blocked; no bypass. No derivatives monitoring or measured liquidation event is claimed.

## Costs and setup

No new vendor, subscription, model API, database or deployment purchased. Added media is about277KB plus poster/captions. Public panels use existing cache policies (headlines300seconds, project feed120seconds); no polling loop. These are request limits, not a guaranteed bill: hosting/provider usage still depends on traffic and account plans.

Proposed owner-local research cadence is twice per weekday, three feeds per run (six requests/day; at most512KiB/source, eight seconds/source,30items/source). No LLM tokens or generated-image costs in routine collection. Hosting/storage and maintenance are not guaranteed free. The example cron is not installed. Remote editorial auth, persistent hosted queues and notification delivery need a later approved setup.

See `editorial-operations.md` and the validation report for commands, limitations and executed checks.
