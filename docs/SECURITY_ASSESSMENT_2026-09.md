# Security assessment, September 2026

**What this is.** An internal assessment and penetration test of
NOSHASHI's own systems, run on 2026-09-30 by the NOSHASHI team with free
tools. The owner authorized the testing, and only NOSHASHI's own
properties were tested:

- the Supabase project `xiurbiwuwcfowqnpmwki`
- the website on Vercel
- this repository
- the desktop app's configuration

Every database test ran inside a transaction that was rolled back. No
test data was left behind and no customer data was read.

**What this is not.** It is not an independent penetration test, and it
is not a SOC 2 report. Both need a third party (see
[FUNDING_NEEDS.md](FUNDING_NEEDS.md) and [soc2/README.md](soc2/README.md)).
Treat it as the self-assessment a customer's security team can check,
and as the scope for an external tester.

## Summary

| Severity | Found | Fixed in this round | Open |
|---|---|---|---|
| High | 0 | 0 | 0 |
| Medium | 3 | 3 | 0 |
| Low | 6 | 0 | 6 (accepted, owner action, or waiting on funding) |
| Info | 4 | | |

## Method and results

### 1. Dependencies

| Check | Tool | Result |
|---|---|---|
| JavaScript, production and development | `npm audit` | 0 vulnerabilities |
| Rust (desktop app) | `cargo audit` (RustSec database) | 0 vulnerabilities. 6 "unmaintained" and 1 "unsound" warning, all transitive through Tauri's Linux GTK stack (`glib`, `proc-macro-error`, `unic-*`); see L1 |

### 2. Secrets

`git grep` over the working tree and a history search for Stripe
(`sk_live_`, `rk_live_`, `whsec_`), NOSHASHI API keys (`nsh_live_`),
private keys, AWS, GitHub, Resend, Supabase secret keys and Slack tokens.
**None found.** The Supabase publishable key in the app is public by
design; the database is protected by row-level security, not by keeping
that key secret.

### 3. Database access control (live, rolled back)

| Attack | Result |
|---|---|
| Read every one of the 42 `noshashi` tables as an anonymous visitor | Refused on all 42 |
| Read every table as a signed-in account that belongs to no organization | 38 return nothing or are refused. 4 are readable by design: `sanctioned_addresses` and `sanctions_refreshes` (the US Treasury's public SDN list), `phishing_scans` and `phishing_sightings` (derived from the public ledger) |
| A stranger inserts themselves as owner of someone else's organization | Refused (42501) |
| A stranger reads another organization | 0 rows |
| A viewer promotes themselves to owner | 0 rows changed |
| A viewer edits, deletes or forges an audit-log row | All three refused (42501) |
| A viewer adds a member or grants an examiner seat through the functions | `INSUFFICIENT_PERMISSIONS` |
| A viewer reads the audit log | 0 rows |
| An analyst writes a draft and then activates or submits it directly, bypassing the four-eyes functions | Draft allowed; activation and submission refused (42501) |
| A member of one organization reads another | 0 rows |
| Sign-in is blocked when writing its audit record fails (tested 2026-09-30 with a forced failure) | Not blocked: the session is created and the record is skipped |
| Tables without row-level security | None |

### 4. Server functions

| Check | Result |
|---|---|
| Customer-supplied webhook URLs (SSRF) | `webhook_url_allowed` requires `https://` and a hostname; refuses raw IPs, localhost, `.local`, `.internal`, `.arpa` and Supabase's own domains |
| Public domain check (`noshashi-xrpl-watch/domain-verify`) fetching a caller-named domain (SSRF) | Hostnames only (no IP literals, no internal names); HTTPS only; fixed path `/.well-known/xrp-ledger.toml`; redirects only to the same host; 8-second timeout; size cap. See L3 |
| Compliance API authentication | Bearer `nsh_live_` keys stored as SHA-256 digests; per-key durable rate limits |
| Stripe webhook | Signature verified with a timing-safe comparison |
| Password screening endpoint | Reveals nothing about whether an account exists; the password never leaves the function except as a 5-character SHA-1 prefix (k-anonymity) |

### 5. Website

| Check | Result |
|---|---|
| Transport | HSTS `max-age=63072000` (Vercel) |
| Framing, MIME sniffing, referrer, permissions | `frame-ancestors 'none'`, `nosniff`, `strict-origin-when-cross-origin`, camera, microphone, geolocation and payment disabled |
| Content-Security-Policy | Allowed inline script; **fixed**, see M1 |
| Public forms (contact, newsletter, support chat) | Rate-limited per client and length-capped; contact form has a honeypot. See L4 |

### 6. Desktop app

| Check | Result |
|---|---|
| Content-Security-Policy | `script-src 'self'`, `object-src 'none'`, `frame-src 'none'`, `form-action 'none'`; connections only to named XRPL servers, Supabase and local model ports |
| Capabilities | Window, notification, store, autostart, global shortcut, positioner, updater and restart only. No shell, no file system, no HTTP from the web view |
| Prototype pollution | `freezePrototype: true` |
| Updates | Signed; the public key is pinned in `tauri.conf.json`, and the endpoint is the GitHub release |
| Hosted-model API keys | OS keychain, used only in Rust, never sent to the web view |

## Findings

### M1. The website allowed inline script (Medium): fixed

**What:** the site's CSP was `script-src 'self' 'unsafe-inline'`. An
injected `<script>` in any page would have run.

**Fix:** the build now moves each of the 17 inline scripts into
`/assets/inline/<sha256>.js` in the same position
(`scripts/inline-scripts.mjs`). The CSP is now `script-src 'self'`.

**Verified:**
- Served locally with the production header, all 38 pages loaded in
  Chromium with no script refused.
- The pricing switch and the theme toggle still work.
- A planted inline script was refused.

`tests/csp.test.js` fails if the policy or any committed page regresses.

### M2. The home page read unvalidated ledger state (Medium): fixed

**What:** the home page's "find a real partial payment" button asked for
`ledger_current` and walked back from it. That reads ledgers that are
not yet validated, which contradicts NOSHASHI's stated rule that every
reading comes from validated ledgers. It had been invisible to the
read-only boundary test, because that test does not read inline HTML
scripts; moving the scripts out (M1) exposed it.

**Fix:** the button starts from `ledger_index: "validated"`, walks back
only through older ledgers, and ignores any reply not marked
`validated`. The boundary test now covers the website's scripts.

### M3. The published subprocessor list was incomplete (Medium): fixed

**What:** the privacy policy said no processor other than Supabase and
Stripe was involved, and the data-processing page called its list
complete. But:

- Vercel hosts the website and runs the contact form.
- Resend delivers contact-form messages and support-ticket
  notifications.

A procurement reviewer comparing the list with the code, or a regulator
asking, would find the gap.

**Fix:** both pages now name Vercel and Resend and say what each
receives. The "no email marketing platform" line is replaced by "we
send no marketing email", which is true: no Resend audience is
configured. The Vercel project's settings show no AI provider key, so
"no AI vendor" still holds.

### L1. Unmaintained transitive Rust crates (Low): accepted

These come from Tauri's GTK stack on Linux:

- `glib` (unsound `VariantStrIter`, not used by NOSHASHI)
- `proc-macro-error`
- five `unic-*` crates

They go away when Tauri moves to newer GTK bindings. Re-check each
release with `cargo audit`.

### L2. Four leftover tables in the `public` schema (Low): owner decision

`applications`, `documents`, `profiles` and `projects` come from an
earlier product:

- They are empty.
- Row-level security limits each one to the owning user's rows.
- No code references them.
- They carry Supabase's default broad grants.

**Recommended:** drop them. That is irreversible, so it waits for the
owner's approval.

### L3. DNS rebinding on the domain check (Low): accepted

A hostname that resolves to a private address would pass the hostname
check. The function runs on Supabase's Edge runtime, which has no
private network to reach, and only fetches one fixed HTTPS path.
Revisit if the function ever moves to infrastructure with internal
services.

### L4. Rate limits on the website's forms live in memory (Low): accepted

Each Vercel instance counts on its own, so a determined sender spread
across instances gets more than the stated limit. The support chat
falls back to its free, built-in answers if the model provider refuses,
which bounds the cost. A shared store (for example the database) would
make the limits exact.

### L5. Leaked-password protection is off in Supabase Auth (Low): mitigated

Supabase's built-in check needs the Pro plan. NOSHASHI screens passwords
itself instead:

- `noshashi-password` checks each password against HaveIBeenPwned using
  k-anonymity.
- The Custom Access Token hook admits password sign-in only for a
  password screened clean.

The Supabase advisor still reports it as off.

### L6. An email API key is stored readable in Vercel (Low): owner action

Vercel flags `RESEND_API_KEY` as a readable secret: it was saved as
"encrypted" rather than "sensitive", so anyone on the Vercel team can
read it. **Fix (owner):** in Vercel → Project → Settings → Environment
Variables, re-add it as Sensitive. Resend's dashboard can issue a fresh
key to paste in; delete the old one there afterwards.

### Informational

1. Trigger functions carry `EXECUTE` for `authenticated`; PostgreSQL
   refuses to call a trigger function outside a trigger, so this is
   hygiene only.
2. HTML pages are served with `Access-Control-Allow-Origin: *` (Vercel's
   default for static files). They are public pages with no credentials.
3. `style-src` still allows inline styles. That is lower risk than
   inline script, and it is needed by the generated pages.
4. The database is on the Supabase Free plan: nightly backups only, and
   no point-in-time recovery ([DISASTER_RECOVERY.md](DISASTER_RECOVERY.md)).

## For an external penetration tester

**Scope:**
- `https://www.noshashi.app` and its `/api/*` functions
- `https://xiurbiwuwcfowqnpmwki.supabase.co` (REST, Auth and the 11
  Edge Functions listed in [DEPLOYMENT.md](DEPLOYMENT.md))
- the desktop app

**Test accounts:** create them for the engagement and delete them after
it. No permanent test accounts in production.

**Priorities:**
1. Organization isolation.
2. The four-eyes functions.
3. The Compliance API key and rate-limit paths.
4. Webhook delivery.
5. The embeddable widget's origin checks.
