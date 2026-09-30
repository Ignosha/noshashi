# SOC 2 readiness

Prepared 2026-09-30 by the NOSHASHI team.

## What a SOC 2 is, and what this is

A SOC 2 report is written by an independent CPA firm licensed by the
AICPA. It states whether a company's controls meet the Trust Services
Criteria:

- **Type I:** the controls are designed properly at one date.
- **Type II:** the controls worked over a period, usually 3 to 12 months.

NOSHASHI can't produce the report itself. What it can do is get ready:

- write the policies
- map every criterion to a real control and its evidence
- close the gaps
- start keeping the records an auditor samples

This folder does that. Nothing here should be described to a customer
as a SOC 2 report or as SOC 2 compliance. The accurate statement is
"preparing for SOC 2; no report yet" ([PROCUREMENT.md](../PROCUREMENT.md)).

## Scope proposed for the first audit

- **Criteria:** Security (the Common Criteria, required), Availability
  and Confidentiality.
- **Systems:** the Supabase project (database, Auth, Edge Functions,
  scheduled jobs), the website and its functions on Vercel, the GitHub
  repository and its CI, and the desktop app's build and release
  pipeline.
- **Subservice organizations:** Supabase, Vercel, GitHub, Stripe and
  Resend. The carve-out method is proposed: their own SOC 2 reports
  cover their controls.
- **Out of scope:** customers' own machines, and customers' use of the
  desktop app.

## Documents in this folder

| File | What |
|---|---|
| [POLICIES.md](POLICIES.md) | The policy set: information security, access, change, vendor, risk, data, incident, continuity, acceptable use. Owner-approved versions are what an auditor reads first |
| [RISK_REGISTER.md](RISK_REGISTER.md) | The risk assessment (CC3): risks, likelihood, impact, treatment, owner |
| [EVIDENCE.md](EVIDENCE.md) | Where the evidence for each control lives, and what to export for the audit period |

## Criteria mapped to controls

**Status:** ✅ in place with evidence · 🟡 partly in place · ❌ missing.

| Criteria | Control at NOSHASHI | Evidence | Status |
|---|---|---|---|
| CC1 Control environment | Owner accountable for security; written policies; code of conduct in the Acceptable Use section | [POLICIES.md](POLICIES.md), owner approval date | 🟡 policies written; owner approval pending |
| CC2 Communication | Public security page and policy; customer-facing Trust page; incident contact | `SECURITY.md`, `/trust/`, [INCIDENT_RESPONSE.md](../INCIDENT_RESPONSE.md) | ✅ |
| CC3 Risk assessment | Annual risk register and threat model | [RISK_REGISTER.md](RISK_REGISTER.md), [SECURITY_THREAT_MODEL.md](../SECURITY_THREAT_MODEL.md) | ✅ first done 2026-09-30 |
| CC4 Monitoring | Supabase security and performance advisors after every schema change; `cargo audit` and `npm audit` each release; annual assessment | [SECURITY_ASSESSMENT_2026-09.md](../SECURITY_ASSESSMENT_2026-09.md) | 🟡 `npm audit` runs in CI but only reports; `cargo audit` is manual |
| CC5 Control activities | Four-eyes on policy and exceptions in the product; tests guard every stated claim | Migrations, `src/**/__tests__` | ✅ |
| CC6.1 Logical access | Row-level security on every table; roles enforced in the database; API keys hashed | Assessment §3 | ✅ |
| CC6.2–6.3 Access provisioning and removal | Organization membership via owner or admin functions; examiner seats expire on their own; every change audited | `audit_log` rows `membership.*`, `regulator.*` | ✅ |
| CC6.1 Admin access to infrastructure | Owner accounts on GitHub, Supabase, Vercel and Stripe with two-factor authentication | Screenshots of each account's 2FA status | ❌ not yet evidenced |
| CC6.6 Boundary protection | Strict website CSP, HSTS, no framing; desktop CSP and capability allowlist | Assessment §5 and §6 | ✅ |
| CC6.7 Data in transit | TLS everywhere | Assessment | ✅ |
| CC6.8 Malicious software | Signed updater; dependency audits; SHA-256 checksums published | `release.yml`, releases | 🟡 installers not code-signed (on hold) |
| CC7.1 Vulnerability management | `npm audit`, `cargo audit`, Supabase advisors, annual internal penetration test | Assessment | 🟡 no external penetration test |
| CC7.2–7.3 Security events | Append-only organization audit log, including sign-ins; Supabase Auth logs; function logs | `audit_log`, Supabase logs | 🟡 no alerting on suspicious events |
| CC7.4–7.5 Incident response | Written plan with roles, severities and customer notification | [INCIDENT_RESPONSE.md](../INCIDENT_RESPONSE.md) | 🟡 no tabletop exercise recorded |
| CC8.1 Change management | Every change through a pull request with CI; release gate re-runs CI; migrations in the repository | GitHub PR history, Actions runs | 🟡 `main` is not protected: a direct push is possible |
| CC9.1 Business continuity | Nightly encrypted backups; monthly restore test | [DISASTER_RECOVERY.md](../DISASTER_RECOVERY.md), Actions runs | ✅ |
| CC9.2 Vendor management | Subprocessor list; vendors' SOC 2 reports on file | [PROCUREMENT.md](../PROCUREMENT.md) | ❌ reports not yet collected |
| A1 Availability | Status page; keep-alive; backups | `/status/`, workflows | 🟡 no uptime monitoring or SLA ([FUNDING_NEEDS.md](../FUNDING_NEEDS.md)) |
| C1 Confidentiality | Data classification; retention; deletion on request | [DATA_MODEL.md](../DATA_MODEL.md), privacy policy | ✅ |

## Gaps, in order

The first six are free.

1. **Approve the policies.** Read [POLICIES.md](POLICIES.md), change what
   is wrong, and record the approval date in its header.
2. **Protect `main` on GitHub.** Settings → Branches → add a rule for
   `main`: require a pull request, require the `verify` check to pass,
   and block force pushes.
3. **Two-factor authentication on every admin account** (GitHub,
   Supabase, Vercel, Stripe, the domain registrar, the email provider).
   Screenshot each one for the evidence folder.
4. **Collect subprocessors' SOC 2 reports.** Supabase, Vercel, GitHub
   and Stripe each publish a SOC 2 report, usually from their trust
   centers under NDA. Store them privately and not in this public
   repository. Note each report's period.
5. **Make dependency audits a CI gate.** `npm audit --omit=dev` runs on
   every push but only reports. Make high-severity advisories fail the
   build, and add `cargo audit`.
6. **Run and record one incident tabletop exercise.** Use a scenario
   from the threat model; one page of notes is enough.
7. **Uptime monitoring with alerting** (free tiers exist), then the
   Supabase Pro items in [FUNDING_NEEDS.md](../FUNDING_NEEDS.md).
8. **An external penetration test** before the Type I.
9. **Choose an auditor.** Readiness assessment, then Type I, then a
   Type II observation window.

## Honest limits

SOC 2 does not require a large team, but at a small company some
controls change shape, and the auditor will look for compensating
controls:

- **Segregation of duties.** In the product, four-eyes is enforced
  between customers' own staff. For NOSHASHI's own code changes, the
  compensating control is CI plus the audit trail of every PR.
- **Background checks and security training.** Required for everyone
  with production access, however few people that is.
