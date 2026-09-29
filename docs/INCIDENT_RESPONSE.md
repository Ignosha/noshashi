# Incident response

Last reviewed 2026-09-29. This is the runbook for security and
availability incidents affecting NOSHASHI's software, server or website. It
does not cover incidents on a customer's own XRPL accounts; for those, the
app's Security Center (INCIDENT RESPONSE, EMERGENCY KIT) helps the customer.

NOSHASHI is small. One person may hold several roles below; the roles still
matter, because each step has an owner.

## Roles

| Role | Does |
|---|---|
| **Incident lead** | Declares the incident, sets severity, owns decisions and the timeline |
| **Fixer** | Investigates and changes code, configuration or credentials |
| **Communicator** | Status page, customer email, regulator or partner notices |

## Reporting

- Security reports: **security@noshashi.app** (see `SECURITY.md`).
- Customers: in-app support ticket, or the contact form.
- Automated: failing CI or release runs, failing scheduled jobs (backup,
  keepalive, site refresh), Supabase advisors and function logs.

## Severity

| Level | Examples | First response |
|---|---|---|
| **SEV-1** | Wrong verdicts issued (a GO that should not be), receipts that no longer verify, exposed customer data, compromised signing key or credentials, tampered release | Immediately |
| **SEV-2** | Server down (sign-in, organizations, Compliance API), webhooks not delivered, a paid feature unavailable, backups failing | Same day |
| **SEV-3** | Degraded performance, one public XRPL server throttling, a cosmetic error | Next working day |

Anything touching verdict correctness, evidence integrity or customer data
starts at SEV-1 until shown otherwise.

## Steps

1. **Declare.** Open a private GitHub issue (or a support ticket if GitHub
   is affected) titled `INCIDENT <date> <one line>`. Record severity, lead
   and start time. Keep the timeline in it.
2. **Contain.** Pick what applies:

   | Situation | Action |
   |---|---|
   | Faulty rule or verdict logic | Stop the release channel: do not publish `latest.json` for a new version; ship a fix release. Tell customers which verdicts, in what time window, to re-verify or replay |
   | Leaked API key (customer) | The organization revokes it in the app (audited); service role can revoke in `noshashi.api_keys` |
   | Leaked service credential (Supabase service role, Stripe, webhook secret) | Rotate in the provider's dashboard, update the secret in Supabase / Vercel / GitHub, redeploy the affected functions |
   | Leaked updater signing key | Generate a new key pair, publish a release signed with the old key that ships the new public key, then retire the old one. Installed copies cannot update until they have the new key |
   | Compromised account | Suspend the account's membership; review `audit_log` for its actions |
   | Abusive traffic | Rate limits apply per key; block at Vercel's firewall; revoke keys |
   | Server outage | Check Supabase status and whether the project was paused (see `supabase-keepalive.yml`); the desktop app keeps working read-only against XRPL |

3. **Preserve evidence.** Export the relevant `audit_log` rows, Edge
   Function logs and Postgres logs before they age out. The audit log cannot
   be edited or deleted, so it remains a reliable record.
4. **Fix and verify.** Every fix lands through a pull request with CI green.
   For verdict logic, add a regression test with real recorded mainnet data.
5. **Communicate.** Status page (<https://www.noshashi.app/status/>) for
   anything customer-visible. Email affected organizations directly for
   SEV-1 and SEV-2. Customers are told what happened, which data or verdicts
   were affected, what we did, and what they need to do.
6. **Personal data breach.** If personal data may have been exposed, the
   lead assesses notification duties under the published Privacy Policy and
   applicable law (for example GDPR's 72-hour notification to the
   supervisory authority) and notifies affected customers without undue
   delay.
7. **Close and review.** Within five working days: a written review of the
   timeline, root cause, what worked, what did not, and follow-up items with
   owners. Update this runbook, `SECURITY.md` and
   `docs/SECURITY_THREAT_MODEL.md` if a boundary or control changed.

## Tools and where to look

| Need | Where |
|---|---|
| Who did what, in the organization | `noshashi.audit_log` |
| Edge Function errors | Supabase → Edge Functions → Logs |
| Database errors, slow queries | Supabase → Logs; `get_advisors` |
| Sign-in events | Supabase Auth audit log |
| Website and API function errors | Vercel → project → Logs |
| Build or release problems | GitHub Actions |
| Receipt integrity for a customer | Evidence panel: re-verify, replay, export report |

## What NOSHASHI cannot do in an incident

NOSHASHI holds no customer keys or funds and never signs transactions, so it
cannot move, freeze or recover assets on the XRP Ledger. Validated
transactions are final.
