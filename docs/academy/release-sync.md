# Release-linked Academy maintenance

## What runs automatically after this branch is approved

`Academy release sync` checks GitHub on published/edited release events, after successful Product/Academy release workflows (covers events created by GITHUB_TOKEN), once daily at 07:30 UTC, and on manual dispatch. It checks all pages; draft, prerelease and unrelated tags are excluded. Product `vX.Y.Z` and Academy `academy-vX.Y.Z` are separate channels. A late lower version never replaces a newer selected version. Repeated release IDs do not duplicate entries. Delayed Academy assets are reconsidered; the last downloadable Academy stays selected until an installer is available.

Changed candidates undergo Academy typecheck, tests and web/workstation builds, public-page script externalization, NOSHX regeneration and CSP/site tests. Validation failure fails the job and leaves the deployed course untouched. Successful candidates are uploaded as `academy-release-candidate` artifacts. No deploy hook, release creation or desktop installer is invoked.

### Owner setup (not performed here)

1. Review and merge this implementation through normal checks. No production publication is performed from the development branch.
2. In repository Actions settings, allow GitHub Actions to create pull requests if desired. Set repository variable **ACADEMY_RELEASE_REVIEW_PRS=true** to opt into automated metadata review PRs. Without it, discovery/validation/artifacts still run; publication remains manual. The fixed bot branch `academy-release-sync` and this implementation branch disable Vercel Git deployment.
3. Review metadata PRs and unmapped changes, then approve/merge through the existing main/Vercel deployment process. Keep existing deployment secrets unchanged. No new paid service or production credential is required.
4. For a new native Academy build, choose/bump the Academy version and use the existing **Academy** workflow manually with publication enabled after platform checks. This change does not silently install updates or add a native updater.

Production publishing is intentionally still owner-controlled. This is automated discovery and validated review preparation, not permissionless teaching-content publication.

## Editorial work after a changed workflow

Edit `academy/release-map.json` to list affected lesson IDs and lab IDs. An unreviewed mapping identifies candidate impacts only. Release notes are bounded plain display strings; they never become claims, questions, answers, policy changes or executable code.

Before marking a map `reviewed: true`, add at least one `checks` entry `{ "path": "src/...", "needle": "expected label or fixture value" }`. The sync checks those strings in the actual tagged release via `git show <tag>:<path>` without a shell, against an allowlisted repository path. Add checks for changed screen labels, versioned examples and expected grading data wherever practical. Unknown lesson/lab IDs or failed released-source checks reject the candidate. These checks assist editorial review; they do not independently prove every UI or platform behavior. Signing/compatibility descriptions are UNKNOWN unless explicitly documented in a reviewed mapping, and artifact presence alone is never described as verified execution.

Change teaching material in version-controlled course/bank/case files, run validation, and review the course changes normally. Bump `academy-retention/*` or `analyst-cases/*` content versions when changing question/graded-case meanings. Keep stable concept IDs. Preserve `academy.progress` v1 and certificate schema; new practice tests do not call the certificate scorer.

## Recovery / rerun

- Actions → Academy release sync → Run workflow on main recovers a missed event. The daily check is independent recovery for missed webhook events.
- Locally: `GH_TOKEN=... node scripts/academy-release-sync.mjs` (supply token through environment, never committed). Authenticated GitHub CLI credentials can be used to set GH_TOKEN outside logs. The script also supports `--fixture <json-array>` for isolated tests; do not point fixture runs at the production branch.
- On failure, inspect the failing step. Correct the mapping, source check, build or unavailable API, then rerun. No checkpoint advances on a failed GitHub page read; no catalog is written before parsing/source checks complete. Candidate metadata writes use a temporary file and rename. Production remains the previous validated commit until owner promotion.

## Cache consistency and rollbacks

`site:academy` ends with `academy-finalize-web.mjs`. It hashes the actual Academy and workstation HTML/JS/CSS/font bundle, then generates the SW precache list. Installation must fetch the complete core list before activation; a missing chunk rejects the candidate worker. Existing clients see **Update & resume** and choose a consistent reload. No learner localStorage is deleted. One previous bundle cache is retained for open clients and operator rollbacks. Browser fixtures test offline navigation, failed updates, healthy activation and explicit rollback.

Course, review, assessment and certificate data remain local. Unknown valid concept records/history are retained across older content versions and ignored until recognized. An incompatible saved practice-test version is not silently rescored; starting a new attempt replaces that preparation attempt, never earned course/certificate records. Clearing browser storage still deletes local records. Refused storage is called out and falls back to tab-session memory; it cannot survive reload or closing the tab.

## Budgets

No new hosted API or AI generation is introduced. Idle course use sends no assessment/progress traffic. Release discovery uses GitHub's authenticated API; unchanged metadata skips dependency installation/builds. Actual costs depend on existing GitHub/Vercel plans and usage. Optional live lab reads use existing public XRPL readers; they are not required for grading. No promise of continuous public-node availability or globally enforced request quotas is made.
