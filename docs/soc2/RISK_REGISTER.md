# Risk register

**Reviewed:** 2026-09-30. **Next review:** 2027-09-30, or after a
significant change or incident.

**Scale:**
- Likelihood (L) and Impact (I) run from 1 (low) to 5 (high).
- Score = L × I.
- **Treat** means reduce, **Accept** means live with it, **Transfer**
  means insurance or a contract.

| # | Risk | L | I | Score | Current controls | Treatment | Owner |
|---|---|---|---|---|---|---|---|
| R1 | One organization reads or changes another's data | 1 | 5 | 5 | Row-level security on every table; roles checked in security-definer functions; tested 2026-09-30 | Accept; re-test yearly and in the external penetration test | Security owner |
| R2 | A policy or exception is approved by the person who wrote it | 1 | 4 | 4 | Constraints and triggers enforce author ≠ activator and requester ≠ decider; tested | Accept | Security owner |
| R3 | Database loss or corruption | 2 | 5 | 10 | Nightly encrypted backups; monthly restore test | Treat: Supabase Pro backups and point-in-time recovery when funded | Owner |
| R4 | An administrator account is taken over (GitHub, Supabase, Vercel, Stripe) | 2 | 5 | 10 | Personal accounts | Treat: two-factor authentication on every account, with evidence; protect `main` | Owner |
| R5 | A malicious or vulnerable dependency | 3 | 4 | 12 | Lockfiles; `npm audit` on every push (reporting only); `cargo audit` at release | Treat: make the audits a CI gate | Security owner |
| R6 | The updater signing key leaks, allowing a forged update | 1 | 5 | 5 | Key only in GitHub Actions secrets; an offline backup is required (RELEASE_SIGNING.md) but not yet evidenced | Accept; rotate on any suspicion | Owner |
| R7 | Cross-site scripting on the website | 2 | 3 | 6 | `script-src 'self'` since 2026-09-30; output escaping | Accept | Security owner |
| R8 | The service is down (Supabase paused or outage, Vercel outage) | 3 | 3 | 9 | Keep-alive job; desktop app works without the server | Treat: uptime monitoring; no SLA offered until funded | Owner |
| R9 | Public XRPL servers are wrong or disagree | 2 | 4 | 8 | Source-agreement rule withholds GO; validated ledgers only | Accept | Security owner |
| R10 | A secret is printed in public CI logs | 2 | 4 | 8 | Backup and restore jobs print counts only; secrets masked | Accept; review each new workflow | Security owner |
| R11 | A customer relies on a verdict as legal advice | 3 | 3 | 9 | Terms and in-app "people decide" wording | Transfer: contract terms; insurance when funded | Owner |
| R12 | Personal data in sign-in records (IP, client) kept longer than needed | 2 | 2 | 4 | Stated in the privacy policy; organization-scoped | Accept; revisit retention with the first data processing agreement | Owner |
| R13 | A subprocessor breach (Supabase, Vercel, Stripe, GitHub, Resend) | 2 | 4 | 8 | Few subprocessors; minimal data sent to each | Treat: collect their SOC 2 reports every year | Owner |
