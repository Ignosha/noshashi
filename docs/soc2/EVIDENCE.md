# Evidence for the auditor

For a Type II, the auditor samples records from across the audit
period. This table lists where each record lives, and what to export or
screenshot when the period ends. Anything confidential is shared with
the auditor directly and never committed to this public repository.

| Control | Record | Where | Export |
|---|---|---|---|
| Change management | Pull requests, reviews, CI runs | GitHub: Pull requests, Actions | PR list for the period; CI results for a sample |
| Branch protection | Rule on `main` | GitHub: Settings → Branches | Screenshot (after gap 2 is closed) |
| Releases | Release runs, assets, checksums, updater signatures | GitHub: Releases; `release.yml` runs | Release list with dates |
| Schema changes | Migrations | `supabase/migrations/`; Supabase migration history | `list_migrations` output |
| Advisors after changes | Supabase security and performance advisors | Supabase dashboard | Screenshot per schema change |
| Backups | Nightly backup runs, 90-day artifacts | Actions: Database backup | Run list for the period |
| Restore tests | Monthly restore test runs | Actions: Database restore test | Run list and a sample log |
| Customer access changes | Membership, role and examiner seat events | `noshashi.audit_log` | Query export for the period |
| Sign-ins | `member.signed_in` rows; Supabase Auth logs | `noshashi.audit_log`; Supabase logs | Sample export |
| Admin access review | Quarterly review record | Owner's record | The four quarterly reviews |
| Two-factor authentication | Admin account settings | Each provider | Screenshots |
| Vulnerability management | `npm audit`, `cargo audit`, assessment | CI logs; `docs/SECURITY_ASSESSMENT_*.md` | Reports for the period |
| Incident response | Incidents, post-incident reviews, tabletop | Owner's record; [INCIDENT_RESPONSE.md](../INCIDENT_RESPONSE.md) | Records for the period |
| Vendor management | Subprocessors' SOC 2 reports | Kept privately | Report list with periods |
| Policies | Approved policy set | [POLICIES.md](POLICIES.md) | Signed or approved copy |
| Risk assessment | Risk register | [RISK_REGISTER.md](RISK_REGISTER.md) | Current version with review date |
