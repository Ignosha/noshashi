# Paid onboarding — payment to first successful call

The whole job of this flow is to get a paying account from a completed
checkout to a verdict returned by their own code, and to make the number
of places they can get stuck as small as possible.

**The metric that matters is time-to-first-verdict**, not time-to-signup.
A subscription with no successful API call is a churn event that has not
happened yet.

---

## 1. The path

```
Checkout ──▶ Webhook writes entitlement ──▶ Account provisioned
                                                   │
                                                   ▼
                                       Welcome email #1 (immediate)
                                                   │
                                                   ▼
                              Console: onboarding checklist appears
                                                   │
                        ┌──────────────────────────┴──────────────────────┐
                        ▼                                                 ▼
              Pro: portfolio + stress run                  Institutional: issue API key
                        │                                                 │
                        ▼                                                 ▼
                First stress report                              First 200 from own code
                        └──────────────────────────┬──────────────────────┘
                                                   ▼
                                            Activated
```

### 1.1 Stripe checkout → entitlement

On `checkout.session.completed` the webhook writes
`noshashi.entitlements` for the account: `tier`, `seats`, `features` (the
plan's `grants` array from `src/lib/billing/catalog.ts`),
`verification_quota` and `valid_until`.

**The `grants` array is the contract.** Every in-app gate and the
Compliance API read `features`, never the tier name. A plan added to the
catalogue without its grants added to the webhook produces an account that
has paid and cannot use what it paid for — and it fails silently, because
a gate that finds no grant behaves exactly like a free account.

Institutional does not go through Checkout at all. It is provisioned by
hand after the MSA is countersigned, using the same entitlement write.

### 1.2 Entitlement → API key (Institutional)

Keys are generated **in the browser**, from the platform CSPRNG, and only
a SHA-256 digest is sent to the server. The plaintext key never touches
our infrastructure. This is what makes "we cannot recover your key"
literally true rather than a policy.

Console → **Account** → **Compliance API** → **New key**:

1. Name it after the system that will use it (`settlement-engine-prod`),
   not after a person. Keys outlive employees.
2. The key is displayed once, with a copy button and an explicit warning.
3. Optionally set an expiry. Recommended for anything handed to a
   counterparty or an examiner.
4. Revocation is terminal — a database trigger refuses to un-revoke.
   Say so on the screen, because it changes how carefully people click.

### 1.3 API key → first successful call

The console shows a pre-filled `curl` with the account's own endpoint and
a known-good sample address, ready to paste. The only thing the user
substitutes is their key.

Getting this to work in the console *before* they wire it into their own
code is deliberate: it separates "is my key right" from "is my
integration right", which are the two failure modes and are otherwise
indistinguishable.

---

## 2. Welcome email sequence

Three emails. Plain text, from a person, reply-to a monitored mailbox.
No images, no tracking pixels, no marketing footer — the audience is
technical and any of those reads as a mailing list rather than a message.

The sequence **stops as soon as its goal is met.** Email 2 does not send
to an account that has already run a stress report or made a successful
API call. Nothing is more corrosive to credibility than being told how to
get started by a system that has not noticed you already did.

---

### Email 1 — immediately on provisioning

**Subject:** `Your NOSHASHI {{plan}} account is active`

> {{first_name}},
>
> Your {{plan}} subscription is active. Everything below is already
> enabled on your account.
>
> **The first thing worth doing** — {{first_action}}
>
> {{first_action_detail}}
>
> **What changed on your account**
> {{grants_list}}
>
> **If something is not working**
> Reply to this email. It reaches me, not a queue. If it is an API
> problem, include the `request_id` from the response — every response
> carries one, and it is all I need to find your exact call.
>
> One thing worth knowing early: console checks made by a human are never
> billed. Only API calls draw a verification credit. Run as many checks as
> you like.
>
> — {{sender_name}}
> {{sender_title}}, NOSHASHI

**Substitutions.**

| Slot | Pro | Institutional |
|---|---|---|
| `{{plan}}` | Pro | Institutional |
| `{{first_action}}` | Add your book as a portfolio and run a redemption stress test on it. | Issue an API key and make one verification call. |
| `{{first_action_detail}}` | Console → Portfolios → Add wallets, then Risk → Stress. Start with Orderly to see the shape, then Stressed. The waterfall shows where the gap between mark and recoverable actually goes — depth, contention between your own lines, and issuer discretion, separated. | Console → Account → Compliance API → New key. The screen has a pre-filled curl with your endpoint; the only thing to substitute is the key. Full reference: noshashi.app/docs/api |
| `{{grants_list}}` | Multi-wallet portfolios · Redemption stress testing · Issuer freeze-rights analysis · Order book integrity · Editable policy thresholds · Drift and expiry alerts · Persistent adjudication ledger (10,000 verdicts) · 5,000 API verifications/month · Priority support | Everything in Pro with unlimited seats · SSO and SCIM · Immutable audit log · Bulk portfolio monitoring with scheduled runs · Custom alert logic · Compliance API and signed webhooks · Signed chain-of-custody export · Offline adjudication · Regulator read-only seats · Travel Rule scoping · 100,000 API verifications/month · 99.9% SLA · Named support contact |

---

### Email 2 — 48 hours later, **only if the first action has not happened**

**Subject:** `Stuck on anything?` *(no re-pitch in the subject line)*

> {{first_name}},
>
> Your account has been active for two days and I can see
> {{missing_action}} has not happened yet. Usually that means one of three
> things, and all three are quick:
>
> {{blockers}}
>
> If it is none of those, reply and tell me what you are seeing. I would
> rather spend ten minutes on it than have you decide it does not work.
>
> — {{sender_name}}

**`{{blockers}}` for Pro:**

> 1. **You have not got the wallet list to hand.** You can add one address
>    and stress-test it — the contention line will read zero, and
>    everything else works. Add the rest later.
> 2. **The stress numbers looked wrong.** Entirely possible, and I want to
>    know. The most common cause is a position whose book has no fundable
>    depth, which shows as a large leak and is usually correct but always
>    surprising. Send me the address and I will walk through the reading.
> 3. **You could not find it.** Risk → Stress. It is gated behind Pro, so
>    if it looks locked, you are signed in on a different account.

**`{{blockers}}` for Institutional:**

> 1. **The key returned a 401.** Nearly always a copy-paste artefact — a
>    trailing newline, or the `nsh_live_` prefix lost. Confirm the endpoint
>    and your JSON with the unauthenticated descriptor first:
>    `curl https://api.noshashi.app/v1/compliance`
> 2. **It is waiting on a security review.** Send them the free tier: it
>    runs entirely locally with no account and no server-side state, which
>    is usually the fastest way through. I can send the DPA,
>    sub-processor list and security questionnaire today if that helps.
> 3. **You are waiting on us for SSO or webhook setup.** If so that is on
>    me — reply and I will book it in this week.

---

### Email 3 — day 7, to every paid account

**Subject:** `The three things people miss in week one`

> {{first_name}},
>
> A week in. Three things that are easy to miss and change how the tool
> behaves.
>
> **1. The policy thresholds are yours to change.**
> Settings → Policy. Concentration limits, reserve headroom, Travel Rule
> scope. Our defaults are defensible starting points, not a house view. If
> a HOLD does not match your risk appetite, change the number that
> produced it — a compliance function that cannot state its own trigger is
> using somebody else's.
>
> **2. The issuer drift monitor is the one that wakes you up.**
> Settings → Monitoring. It re-reads every issuer you hold on a timer and
> raises a native alert when the flags change. This matters because
> `lsfGlobalFreeze` immobilises your balance the moment the transaction
> validates, and nothing on the ledger notifies the holder. Without the
> monitor you find out when you try to sell.
>
> **3. Stress scenarios are parameters, not presets.**
> The freeze haircut, the depth retention and the participation cap are
> all editable. Orderly, Stressed and Crisis are three saved points, not
> the only three. If your committee has agreed a haircut, use theirs —
> the point of the number is that you can defend it.
>
> {{tier_extra}}
>
> Anything you want that is not there, reply and tell me. Roadmap
> decisions here are made mostly from these replies.
>
> — {{sender_name}}

**`{{tier_extra}}` for Institutional:**

> **And one for your auditors:** signed exports carry a SHA-256 digest
> over the exact bytes, so a recipient can prove the file is the one that
> left the workstation. Worth showing your audit lead before they ask for
> a screenshot of a screen.

---

## 3. In-app onboarding checklist

Appears in the console after the first sign-in on a paid account.
Dismissible, and it does not come back.

**Design rules.** Each item is one action, links straight to the screen
that performs it, and ticks itself from real state — never from "user
clicked the link". A checklist that congratulates you for visiting a page
teaches people to ignore checklists. Items already satisfied at
provisioning start ticked. The whole thing disappears when complete rather
than sitting there as a permanent trophy.

### Pro

| # | Item | Done when | Links to |
|---|---|---|---|
| 1 | Add your first wallet | ≥1 wallet in a portfolio | Portfolios |
| 2 | Run a gate check | ≥1 verdict in the adjudication ledger | Verification |
| 3 | Run a redemption stress test | ≥1 stress report generated | Risk → Stress |
| 4 | Set your policy thresholds | Policy rule set differs from default | Settings → Policy |
| 5 | Turn on the issuer drift monitor | Monitor enabled with ≥1 issuer | Settings → Monitoring |
| 6 | Export an audit trail | ≥1 export written | Workstation → Audit |

### Institutional — the above, plus

| # | Item | Done when | Links to |
|---|---|---|---|
| 7 | Issue an API key | ≥1 unrevoked key | Account → Compliance API |
| 8 | Make your first API call | ≥1 row in `verification_events` | Account → Compliance API |
| 9 | Register a webhook endpoint | ≥1 endpoint verified | Account → Webhooks |
| 10 | Configure SSO | IdP metadata accepted | Account → SSO |
| 11 | Invite your team | ≥2 members | Account → Members |
| 12 | Schedule a stress run | ≥1 schedule saved | Risk → Stress → Schedule |

---

## 4. Quickstart documentation structure

Published at `noshashi.app/docs/`. Source of record is
`docs/API.md` for everything under `/api/`.

```
/docs
├── index                          What this is, and which path to take
│
├── /console                       For the person clicking
│   ├── first-run                  Install, verify the binary, first check
│   ├── portfolios                 Building a book
│   ├── stress-testing             Reading a redemption stress report
│   ├── policy                     Setting your own thresholds
│   ├── monitoring                 Drift, expiry and alerting
│   └── exports                    Audit trails, signed and unsigned
│
├── /api                           For the person integrating
│   ├── quickstart                 Key → first call, in under five minutes
│   ├── authentication             Keys, scopes, expiry, rotation
│   ├── rate-limits                Published limits and how to back off
│   ├── idempotency                Why retries are free, and how
│   ├── errors                     Every code, and whether to retry it
│   ├── /reference
│   │   ├── compliance             POST /v1/compliance
│   │   ├── market                 GET /v1/market/:pair
│   │   └── combined               GET /v1/combined/:address
│   ├── /webhooks
│   │   ├── setup                  Registering and verifying an endpoint
│   │   ├── signatures             HMAC verification, with code
│   │   ├── events                 Every event type and its payload
│   │   └── delivery               Retries, ordering, dead-letter
│   └── /guides
│       ├── pre-settlement-gate    The most common integration
│       ├── nightly-book-review    Scheduled sweeps
│       └── reconciling-usage      Matching your counts to the invoice
│
├── /concepts                      For the person deciding
│   ├── verdicts                   GO / HOLD / NO-GO, and why HOLD exists
│   ├── receipts-and-digests       Reproducing an adjudication later
│   ├── fundable-vs-advertised     The phantom depth problem
│   ├── freeze-rights              What lsfNoFreeze actually guarantees
│   ├── recoverable-value          The stress model, stated in full
│   └── permissioned-domains       What a credential check checks
│
└── /trust                         For the person approving
    ├── security                   Posture, data handling, key storage
    ├── sub-processors             Current list
    ├── sla                        Institutional uptime and response targets
    └── status                     Live
```

**Three rules for the docs.**

Every code sample is copy-pasteable and complete — no `...`, no
`YOUR_KEY_HERE` buried mid-line, and it runs if you export one env var.

Every concept page states what the thing does **not** tell you. The
freeze-rights page is more useful for explaining what `lsfNoFreeze` does
not guarantee than for explaining what it does, and that is the page
people link to.

`/concepts` is written to be readable by someone evaluating whether to
buy, not only by someone who already has. Those pages double as the
research cluster's landing pages, which is why they justify the effort.
