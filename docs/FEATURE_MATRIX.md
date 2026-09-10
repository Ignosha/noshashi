# Feature matrix — entitlements by tier

Source of truth for what each tier grants. The machine-readable version is
`src/lib/billing/catalog.ts`; this document is the human-readable one and
the two must agree. When they disagree, the catalogue is right and this
file is stale.

| | Free | Pro | Institutional |
|---|---|---|---|
| **Price** | $0 | **$749** / seat / month | **$4,000** / month |
| **Annual prepay** | — | **$7,490** / seat / year | **$40,000** / year |
| **Internal plan id** | `operator` | `desk` | `institution` |
| **Purchase route** | Download | Stripe Checkout | Contact sales |
| **Seats** | 1 | Per seat | **Unlimited** |

Annual is 10 × monthly on both paid tiers — two months free, stated as the
arithmetic so it is checkable rather than a percentage.

**A note on the plan identifiers.** The customer-facing names are Free,
Pro and Institutional. The identifiers stay `operator`, `desk` and
`institution` because those strings are the `tier` check constraint on
`noshashi.entitlements`, the value the Stripe webhook writes on checkout,
and the value the Compliance API reads to select a rate limit. Renaming
the display name is a copy change; renaming the identifier is a migration
plus a webhook deploy plus a function deploy that have to land together,
or every paying account loses its entitlements in the gap.

---

## 1. Free — a lead-generation instrument, not a tier

Free is not the bottom of a ladder and it is not sold as one. Its job is
to let a sophisticated user check our arithmetic against an address they
already understand, before any money or contract is involved. That is the
only credible sales motion for a risk tool: nobody buys a second opinion
from a vendor whose first opinion they have not tested.

Which is why it is **not** capability-crippled in the usual way. The
policy engine is the same engine. The gate verdicts are the same verdicts.
What Free does not have is anything to do with a *book*: no persistent
state, no multi-wallet reads, no liquidity engine, no API. It answers
questions about one address, well, forever.

**Free stays exactly as it is.** Nothing is being moved out of it to make
Pro look better, and nothing is being added to it.

| Capability | Detail |
|---|---|
| Console and menu bar HUD | Full desktop application, all scenes not otherwise gated |
| Local gate checks | Unlimited. GO / HOLD / NO-GO against the full rule set |
| Ledger sync | Four public nodes read and compared side by side |
| Inbox | Detects impersonated tokens and dusting sent to an address |
| Token rights | Reads what an NFT actually grants before purchase |
| On-device compliance agent | Runs locally; no prompt or address leaves the machine |
| CSV audit export | Unsigned, complete for the session |
| Binary integrity verification | SHA-256 of the shipped binary against the published digest |
| Support | Community |
| Server-side state | **None.** No account needed, no telemetry, no analytics |

---

## 2. Pro — $749 / seat / month

For a desk or a fund carrying a book of issued assets across more than one
wallet. Everything in Free, plus:

### 2.1 The liquidity join

| Capability | Grant | Detail |
|---|---|---|
| **Redemption stress testing** | `redemption_stress` | Liquidity-adjusted recoverable value for the whole book. Routes a full exit across the DEX book **and** the AMM pool together, applies a stated depth shock, charges for contention between your own lines on one issuer, and discounts balances an issuer could freeze. Three scenarios (Orderly / Stressed / Crisis), operator-set participation cap and slippage budget, and a waterfall from mark to recoverable that reconciles to the total |
| Issuer freeze-rights analysis | `issuer_risk` | Reads `lsfNoFreeze`, `lsfGlobalFreeze`, `lsfRequireAuth`, transfer rate. An issued balance is only an asset if the issuer cannot immobilise it |
| Order book integrity | included | Quoted depth against depth that can actually fill. On some mainnet books the phantom share is over 90% |
| Exit liquidity per position | included | Freeze rights × fundable depth × position size, as one verdict: CLEAR / CONSTRAINED / TRAPPED |
| Counterparty concentration | `concentration` | HHI across the settlement book |
| AMM pool governance | included | Who votes the fee, who holds the auction slot |

### 2.2 Book-scale operation

| Capability | Grant | Detail |
|---|---|---|
| Multi-wallet portfolios | `portfolios` | A book of accounts with a live gate verdict on each |
| Persistent adjudication ledger | `adjudication_ledger` | 10,000 verdicts, written to disk, survives restart |
| Wallet explorer | included | Every address ever scanned, sortable by risk |
| Settlement forensics | included | What a transaction delivered, not what it requested |
| Counterparty provenance | included | Account age and who funded it |
| Treasury control surface | included | How few signers can actually move a balance |

### 2.3 Policy and alerting

| Capability | Grant | Detail |
|---|---|---|
| Editable policy rule set | `policy_editor` | Your thresholds for concentration, reserve headroom, Travel Rule scope. A compliance officer must be able to change the number that produced a HOLD |
| Drift and expiry alerts | `alerts` | Domain tightening, credential lapse |
| Issuer drift monitor | `drift_monitor` | Re-reads every issuer you hold on a timer; native alert when flags change |
| Receipt vault | `receipt_anchoring` | Every verdict stored, searchable, exportable |

### 2.4 Commercial terms

| | |
|---|---|
| Payment | Card, via Stripe Checkout |
| Billing | Monthly or annual prepay, auto-renewing |
| Cancellation | Self-serve in the Stripe portal, any time. Access runs to the end of the paid period. No notice, no fee, no pro-rata refund of a partial period |
| Refund | Full refund within 14 days of a first charge if no paid capability was used |
| API verifications | 5,000 / month included, no rollover |
| API key issuance | **No** — Institutional only |
| API rate limit | 50 req/sec burst, 1,500 req/min sustained |
| Support | Priority email, one business day first response |
| SLA | None published |
| Contract | Standard online terms |
| Seat definition | A seat is a person. Shared logins are a terms breach, not a saving |

---

## 3. Institutional — $4,000 / month

For regulated venues, custodians and issuers — anyone whose adjudications
an examiner will eventually read. Everything in Pro, with **unlimited
seats**, plus:

### 3.1 Identity and access governance

| Capability | Grant | Detail |
|---|---|---|
| **SSO** | `sso` | SAML 2.0 or OIDC against your IdP. Okta, Entra ID, Google Workspace, Ping |
| SCIM provisioning | `sso` | Automatic provisioning and de-provisioning, so a leaver loses access when HR says so rather than when someone remembers |
| Unlimited seats | — | No per-seat accounting. Add a compliance analyst without a purchase order |
| Regulator read-only seats | `regulator_seats` | Scoped, time-boxed, read-only access for an examiner. Expires on its own |
| Enforced session policy | `sso` | Maximum session lifetime and re-auth interval set by you, not by us |

### 3.2 Audit and evidence

| Capability | Grant | Detail |
|---|---|---|
| **Immutable audit log** | `audit_log` | Append-only record of every adjudication, export, key issuance, policy change and settings change, with actor and timestamp. The question an examiner asks is not what the policy is, it is who changed it and when |
| Signed audit export | `signed_export` | SHA-256 chain-of-custody over the exact bytes, so a recipient can prove the file is the one that left the workstation |
| Unlimited adjudication history | `audit_log` | No 10,000-verdict ceiling |
| Receipt digests | included | Every API verdict carries a digest computed identically on both sides |
| Travel Rule scoping | `travel_rule` | Identifies transfers crossing the FATF R.16 threshold that lack counterparty data |
| Offline adjudication | `offline_mode` | Capture validated state while connected, adjudicate from a segregated network. Every offline verdict carries the ledger index and age of the state it rests on, so a snapshot result cannot be passed off as live |

### 3.3 Scale and integration

| Capability | Grant | Detail |
|---|---|---|
| **Bulk portfolio monitoring** | `bulk_monitoring` | Unlimited wallets under watch. Stress runs on a schedule, not on a click — a position that became unexitable overnight is an alert, not a discovery |
| **Custom alert logic** | `custom_alert_logic` | Your own thresholds and expressions over the same measured facts, routed to your own destinations (webhook, email, Slack). A compliance function that cannot state its own trigger is using someone else's risk appetite |
| Compliance API | `compliance_api` | Key issuance, scopes, expiry, terminal revocation. See `docs/API.md` |
| Webhooks | `webhooks` | HMAC-SHA256 signed, at-least-once, retried with dead-letter. Freeze-risk, credential, domain-policy, depth-breach, slippage-breach, recovery-breach |
| Issuance surveillance | included | Who holds your paper, and how concentrated |
| White-labelled wallet | `white_label` | Your brand on a distributable build |
| API verifications | — | 100,000 / month included |
| API rate limit | — | 200 req/sec default; negotiated per contract via `entitlements.rate_limit_per_second` |

### 3.4 Commercial terms

| | |
|---|---|
| Payment | **Invoice, ACH, wire, NET-30.** Not card |
| Why not card | The tier carries an SLA, a DPA and regulator access, none of which exist until a contract is signed. A card payment completing first would provision an account whose obligations nobody had agreed to |
| Contract | **MSA required.** DPA and SLA as schedules |
| Default term | 12 months, 30 days' notice before renewal — a proposal, not a policy |
| Longer terms | Negotiable as part of the MSA |
| **SLA** | **99.9% monthly uptime with service credits.** Response targets per severity. See the SLA schedule |
| Onboarding | **Dedicated.** Named engineer, scoped implementation plan, key issuance and first successful API call walked through live |
| Support | **Named contact**, not a shared queue |
| Procurement pack | Security questionnaire, DPA, sub-processor list, insurance certificates, W-9 — available before commitment |
| Pilot | Paid, scoped, normally one month, with a stated success criterion agreed up front |

---

## 4. Entitlement grants — reference

The `grants` array written to `noshashi.entitlements.features` by the
Stripe webhook. The Compliance API and every in-app gate read these, not
the tier name.

| Grant | Free | Pro | Institutional |
|---|:-:|:-:|:-:|
| `console` | ✅ | ✅ | ✅ |
| `gate` | ✅ | ✅ | ✅ |
| `agent` | ✅ | ✅ | ✅ |
| `export` | ✅ | ✅ | ✅ |
| `portfolios` | — | ✅ | ✅ |
| `alerts` | — | ✅ | ✅ |
| `receipt_anchoring` | — | ✅ | ✅ |
| `redemption_stress` | — | ✅ | ✅ |
| `issuer_risk` | — | ✅ | ✅ |
| `concentration` | — | ✅ | ✅ |
| `adjudication_ledger` | — | ✅ | ✅ |
| `policy_editor` | — | ✅ | ✅ |
| `drift_monitor` | — | ✅ | ✅ |
| `priority_support` | — | ✅ | ✅ |
| `compliance_api` | — | — | ✅ |
| `webhooks` | — | — | ✅ |
| `regulator_seats` | — | — | ✅ |
| `white_label` | — | — | ✅ |
| `travel_rule` | — | — | ✅ |
| `signed_export` | — | — | ✅ |
| `offline_mode` | — | — | ✅ |
| `sla` | — | — | ✅ |
| `sso` | — | — | ✅ |
| `audit_log` | — | — | ✅ |
| `bulk_monitoring` | — | — | ✅ |
| `custom_alert_logic` | — | — | ✅ |

---

## 5. Prepaid API verification credits

Sold on top of any paid plan, for accounts that exceed their included
allowance. Console checks made by a human are **never** billed — only API
calls draw a credit.

| Pack | Verifications | Price | Unit |
|---|---|---|---|
| `credits-10k` | 10,000 | $450 | $0.045 |
| `credits-50k` | 50,000 | $2,000 | $0.040 |
| `credits-250k` | 250,000 | $8,750 | $0.035 |

Credits do not expire while the subscription is current. A `502` or `503`
from the API refunds the credit automatically; an idempotent replay never
charges one.

---

## 6. Deliberate omissions

Recorded so the reasoning survives the next pricing conversation.

**No tier between Free and Pro.** There is no capability that honestly
belongs there. The gap is a jump in kind, not in volume: Free answers
questions about an address, Pro answers questions about a book, and there
is no half-book. A middle tier would have to be Pro with an invented cap,
which means charging to remove a limit we created and inviting customers
to size their desk around our pricing page instead of their positions.

**No usage-based pricing on console checks.** A compliance officer who
hesitates before running a check because it costs money is a worse
compliance officer. Metering applies to machine calls only.

**No free trial of Pro.** A 14-day clock is the wrong shape for a risk
tool. What a buyer needs to establish is whether our reading of an issuer
matches theirs, and Free establishes that with no clock and nothing to
cancel.

**No self-serve Institutional.** See 3.4.

**No enterprise tier above Institutional.** Negotiated rate limits, terms
and onboarding already flex inside Institutional. A fourth tier would be a
price increase with a new name on it.
