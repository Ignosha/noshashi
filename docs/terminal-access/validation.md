# Terminal account access — executed validation

Local Linux environment, Node 24.19, Chromium, Deno 2.9.6, isolated PostgreSQL 16 container. All email addresses, sessions, organizations and paid states in screenshots/browser tests are **synthetic fixtures**. No real sign-in, email, charge, paid contract assignment, migration or deployment was performed against production.

| Check | Result |
| --- | --- |
| Root TypeScript (`npx tsc --noEmit`) | PASS |
| Account bundle (`npm run site:terminal-account`) | PASS; ~382 KB / 110 KB gzip, reuses Supabase Auth |
| Public site build (`npm run site:build`) | PASS; unrelated release-catalog refresh output was discarded |
| Existing desktop frontend (`npm run build`) | PASS; existing large-chunk warning remains |
| New Edge function (`deno check .../noshashi-terminal/index.ts`) | PASS, including shared JS imports |
| Focused terminal/account/trust tests | 51 passed |
| Full Vitest suite | 1,686 passed; 4 skipped (132 test files passed, one skipped) |
| Scratch SQL migration + terminal authorization test | PASS |
| Existing payment-review SQL billing regression | PASS |
| Existing public terminal Playwright script | PASS: desktop, paper theme, phone, tablet, startup/reduced motion, safe CLI, evidence hashes, expiry, provider errors, no-JS fallback |
| New account Playwright script | PASS: guest/free/Pro/Institutional, personal save, Pro team lock, assigned team access, delayed-response scope switch, sign-out clearing, keyboard launcher and phone overflow |

The scratch DB applied the baseline and migrations. Three unrelated migrations depend on Supabase-only `auth.sessions`/Vault facilities and were skipped by the local harness; the terminal and payment-review prerequisite migrations applied and their tests passed. CI's existing SQL job runs the new test automatically with its required-migration declarations. Existing Edge CI glob checks the new function. A new CI step verifies the committed account bundle matches source.

Initial restricted-sandbox tests could not launch existing subprocess/local-server tests. An initial standalone page render also exposed an inline-script/CSP failure, corrected by using the normal externalization build. Runtime and browser checks found and fixed a startup interruption, workspace-label problem, membership-loading race, post-save busy state and missing explicit validated-ledger pinning. Final results below use the corrected code; failures were not suppressed.

## Reproduce

```sh
npm run site:terminal-account
npx tsc --noEmit
npm test
# From supabase/functions, with Deno installed:
deno check noshashi-terminal/index.ts
# A local throwaway database only:
scripts/test-sql.sh postgresql://postgres:local-test-only@localhost:5432/postgres
# In a second shell after starting `PORT=4355 node scripts/dev-site.mjs`:
APP_URL=http://127.0.0.1:4355 node scripts/verify-terminal-access.mjs
APP_URL=http://127.0.0.1:4355 node scripts/verify-terminal.mjs
```

Browser fixture scripts intercept provider traffic. They prove presentation/state handling; they do not prove live provider configuration or substitute for server SQL tests. Screenshots show the preserved Ledger Desk account window with synthetic data.

## Still required before launch

Owner-approved staging verification with real Supabase test accounts, password/email-code/TOTP delivery, actual PostgREST schema exposure and Edge bundling, Stripe test lifecycle events and operational contract provisioning/revocation. Confirm public-node connectivity and provider limits there. No production credential, authorization infrastructure, Stripe catalog or existing desktop authentication behavior was changed. Safari, Firefox, Windows and physical macOS/Monterey were not tested.
