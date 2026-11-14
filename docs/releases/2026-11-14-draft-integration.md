# Approved draft integration — 2026-11-14

Owner instruction: merge and deploy outstanding drafts.

This integration preserves the original commit ancestry of:

- #160–#164: five Ledger Desk desktop design batches (through `03306f9`).
- #170: cloud terminal (`6a77c2a`).
- #171: focus-friendly Academy retention (`d390a55`).
- #172: paid terminal account access (`d17673d`).

Non-draft macOS/operator and security work (#152 and #156) is excluded. Existing native release tags/installers are unchanged; source integration and browser deployment do not update an installed desktop application.

Generated Academy/workstation and NOSHX assets were rebuilt from the combined sources, preserving Academy progress/certificates and the new retention course. The Academy smoke selectors now recognize the sentence-case buttons provided by the Ledger Desk shared button component; underlying evidence, scoring and completion assertions remain intact.

Local validation: 1,708 Vitest tests passed, four skipped; root, Academy and operator typechecks passed; public site, account, Academy/workstation, NOSHX and desktop frontend builds passed. Public terminal and paid-account fixture browser tests passed. Academy browser smoke passed direct entry/resume, settings, captions/transcript, analyst case and teach-back, recorded fallback during a node outage, embedded workstation, spaced review, practice/exam, certificates, phone keyboard flow and storage fallbacks. Linux Chromium only. Existing large-chunk warnings remain.

Production backend blocker: Supabase CLI reports no access token. The current GitHub integration cannot inspect repository secret configuration (403). Credential-free preflight requests to both `noshashi-terminal` and its existing billing-portal dependency `noshashi-payment-review` returned 404 / requested function not found. No credentials were retrieved, printed or changed. Website/Academy deployment is supported by the connected Vercel project; private paid access must remain locked until authorized Supabase migration/function deployment and staging verification are completed. No account is granted a tier by this integration. See `docs/terminal-access/operations.md` for setup and authorization boundaries.

Production publishing is performed only after the integration PR's CI passes, followed by verification of the deployed commit and the normal Academy/terminal entry points. Release notes and research remain evidence-backed; this integration does not publish new editorial articles, send outreach, change pricing, or create a native GitHub release.
