# NOSHASHI Labs security policies

| | |
|---|---|
| Version | 1.0 (draft) |
| Prepared | 2026-09-30 |
| Approved by | ________________ (owner) on ____-__-__ |
| Next review | Twelve months after approval, or sooner after a significant change or incident |

These policies describe how NOSHASHI Labs protects its systems and its
customers' data. They describe what is actually done. Where something
is not done yet, the section says so and names the gap in
[README.md](README.md). "The security owner" means the person the owner
of NOSHASHI Labs names to be accountable for security; until someone is
named, it is the owner.

## 1. Information security

1.1 **Purpose.** Protect the confidentiality, integrity and availability
of the NOSHASHI service and of customer data.

1.2 **Scope.** This covers:
- the Supabase project and its data
- the website and its functions
- the source repository and CI
- the release pipeline and signing keys
- every account that administers them

1.3 **Principles.**
- Least privilege.
- Security enforced in the database, not only in the app.
- Every claim NOSHASHI makes about itself is checked by a test.
- Nothing NOSHASHI builds holds, signs or moves a customer's assets, or
  asks for a key.

1.4 **Exceptions** to these policies are written down with a reason and
an end date, and approved by the security owner.

## 2. Access control

2.1 **Administrative accounts** (GitHub, Supabase, Vercel, Stripe,
domain registrar, email) are personal, never shared, and protected by
two-factor authentication.

2.2 **Access is granted** only to people who need it for their role,
and removed the same day they no longer do.

2.3 **Access review.** The security owner reviews who has access to
each administrative account every quarter and records the review.

2.4 **Customer access** inside the product follows the organization
roles enforced by row-level security ([ENTERPRISE.md](../ENTERPRISE.md)).
Examiner seats expire on their own.

2.5 **Production data.** Staff do not read customer data except to
answer a support request the customer made, or to respond to an
incident. Either is recorded.

2.6 **Secrets:**
- Kept only in GitHub, Vercel and Supabase secret stores.
- Never committed to the repository.
- Never printed in public CI logs.
- Rotated when someone with access leaves, or on suspected exposure.

## 3. Change management

3.1 Every change to code, database schema, server functions or the
website is made through a pull request.

3.2 CI must pass before merging. The release workflow re-runs the same
checks before building installers.

3.3 Database changes are migrations committed to
`supabase/migrations/`. After a schema change, the Supabase security and
performance advisors are run and their findings addressed.

3.4 Emergency changes may be applied first. The pull request follows
within one business day.

3.5 **Gap:** `main` is not yet protected against direct pushes
(README, gap 2).

## 4. Vendor management

4.1 NOSHASHI's subprocessors are listed in the privacy policy's
data-processing section and in [PROCUREMENT.md](../PROCUREMENT.md).

4.2 Before a new vendor processes customer data, the security owner:
- records what data it receives and why
- checks its security attestations (SOC 2 or ISO 27001)
- updates the subprocessor list

4.3 The current SOC 2 report of each subprocessor is collected once a
year and kept privately.

## 5. Risk management

5.1 The risk register ([RISK_REGISTER.md](RISK_REGISTER.md)) is
reviewed every year and after any significant incident or change. Each
risk has a likelihood, an impact, a treatment and an owner.

5.2 The threat model ([SECURITY_THREAT_MODEL.md](../SECURITY_THREAT_MODEL.md))
is updated when a new feature crosses a trust boundary.

## 6. Vulnerability management

6.1 **Dependencies:** audited with `npm audit` and `cargo audit` before
every release. Fix windows by severity:

| Severity | Fix within |
|---|---|
| Critical | 7 days |
| High | 30 days |
| Medium | 90 days |

6.2 An internal security assessment runs every year
([SECURITY_ASSESSMENT_2026-09.md](../SECURITY_ASSESSMENT_2026-09.md)).
An external penetration test runs before the first SOC 2 audit and
yearly after that.

6.3 Reports from outside researchers are handled under `SECURITY.md`.

## 7. Data classification, retention and disposal

| Class | Examples | Handling |
|---|---|---|
| Secret | Service-role key, Stripe keys, updater signing key, backup passphrase | Secret stores only, never logged |
| Confidential | Customer organizations, policies, exceptions, cases, audit logs, API key digests, support conversations | Row-level security; encrypted at rest by the provider; encrypted before backup |
| Internal | Operational logs | Provider retention |
| Public | Website, public ledger data, published lists | No restriction |

Retention follows [DATA_MODEL.md](../DATA_MODEL.md). Backups are kept
for 90 days. An account is deleted on request, as described in the
privacy policy.

## 8. Incident response

Incidents are handled under [INCIDENT_RESPONSE.md](../INCIDENT_RESPONSE.md):
- detection
- severity
- containment
- customer notification
- a written post-incident review

A tabletop exercise is run every year and recorded.

## 9. Business continuity and backups

Continuity and recovery are covered by
[DISASTER_RECOVERY.md](../DISASTER_RECOVERY.md):
- nightly encrypted backups
- a monthly automated restore test
- recovery objectives

## 10. Acceptable use and conduct

10.1 People with access to NOSHASHI systems:
- use them only for NOSHASHI's business
- keep their devices updated, with disk encryption and a screen lock
- report suspected security problems at once

10.2 Company systems must never hold customer secrets that NOSHASHI
does not need, such as wallet keys or seeds.

## 11. People

11.1 Anyone given production access:
- agrees to these policies in writing
- completes security awareness training when they join and every year
  after
- has their access removed on the day they leave

11.2 A background check is done where the law allows, before
production access.
