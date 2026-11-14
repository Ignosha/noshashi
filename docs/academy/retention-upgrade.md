# Academy retention upgrade — audit and implementation plan

Baseline main `1235081`, November 14, 2026. Production and GitHub releases remain owner-controlled. This branch is separate from Cloud Terminal PR #170 and unrelated macOS work.

## Verified repository inventory

- 21 lessons in five levels (`course.json`), 18 existing labs including the testnet invoice lab, 18 video records and 74 shared final-check questions. Final check: 25 questions, 80% pass; lesson pass: two of three. These remain certificate requirements.
- `AcademyPanel` already supports video/captions/transcripts, read-aloud, text size/spacing, contrast, focus, motion and break reminders. First run currently opens settings; location is only partly remembered in module memory.
- Local `academy.progress` v1 and `academy.labs` preserve course/certificate and lab records. New retention, practice and analyst-case schemas will use separate keys. No account or server progress sync is added.
- Training workstation embeds a separately built NOSHASHI bundle with existing origin/source checks and read-only training guards. Screen-open objectives count navigation, not analysis. Existing cases include recorded mainnet/testnet readings, but need a clearer stable assessment path independent of live-node success.
- Ledger-index-as-timestamp takeaway is incorrect. Ledger sequence identifies a ledger; close time is a separate field. Node reporting of validation is not independent consensus verification.
- Native Academy config is 0.2.1; release workflow uses `academy-v*` and manual owner publication. Product uses `v*`; Academy publication deliberately does not take the product's `latest` release. Physical Intel/Monterey execution and signing cannot be inferred from a workflow/config.
- Website commits Academy/workstation bundles. Existing refresh deployment uses `VERCEL_DEPLOY_HOOK_URL`. Current SW is a single network-first cache and needs bundle-consistency handling.

## Reviewable implementation

1. Direct lesson / recorded payment-case links, persistent resume, settings within lessons and clear beginner/institutional paths.
2. Separate concept-based spaced recall (1/3/7/21 days), explicit answer submission, varied cases, first-attempt and week-later evidence; no streak penalties, forced timer, sound or mandatory break.
3. Four versioned, clearly labeled training analyst cases with evidence selection, supported decisions, staged hints, teach-back and optional product-screen/live exploration. Retain all existing labs.
4. Dedicated 25-question preparation test with balanced topics, practice/exam feedback boundaries, local resume, optional timer, flags, explanations and weak-topic retry. Do not award certificates from preparation scores.
5. Release-ID/semantic-version sync, reviewed mappings, download provenance, candidate validation, missed-event recovery and owner-reviewed promotion through the existing deployment path. Release notes are display data only, never teaching/grading instructions. No release creation or silent desktop update.
6. Typecheck/build/unit/browser verification and screenshots via normal Academy entry points. Document actual browser/OS scope and manual release setup.

## Focus-friendly learning design

Default reading path; one card or question at a time; explicit Check answer; short sessions (up to five due questions); one primary next action; easy pause/resume; no deadline for due work; staged hints and calm feedback. Review intervals are initial product defaults, not a clinical claim or guarantee. Optional reminders and timers can be disabled. No claim to treat ADHD/ADD.

## Implemented behavior

Direct lesson and case routes replace the setup gate. A readable default opens immediately; learning/media/access controls remain inside lessons. The course map preserves the full sequence and adds beginner/institutional paths, review/lab/test entry points and a plain-language project map. Resume records include route, lesson section/card/check attempt, old workstation step, analyst case selections/handoff, review session and preparation attempt.

The new retention bank has **21 stable concept IDs and 45 questions** across ledger basics, authority/security, issuer controls, payments, liquidity and policy/evidence. Reviews cap at five questions, use 1/3/7/21-day intervals, rotate variants, mix introduced concepts and preserve bounded first-attempt history. Unknown valid future concept records/history survive rollback and remain inactive until recognized. Lesson/practice misses schedule recall without claiming to be later-review observations.

Four simulated analyst cases require relevant evidence plus a supported decision; a typed teach-back precedes the model answer. Opening a screen only proves navigation. The original workstation and all 18 labs remain. New and old checkpoints require explicit submission before correctness. Optional live readings have a bounded UI wait, explicit retrieval labeling and retry; they never replace the simulated grading data. Phone task links and desktop side instructions remain visible/reachable while working.

Preparation is separate from the existing final check: 25 balanced questions, 80% target, practice/exam modes, optional non-enforcing timer, flags, unanswered navigation, score/topics/explanations, lesson/case links and weak-topic drills. Existing certificates and eligibility logic are untouched.

Published product `v1.0.27` and Academy `academy-v0.2.1` metadata/assets were read from GitHub for the branch catalog. Those published downloads are not this unreleased content update. Signing and physical compatibility remain UNKNOWN unless separately verified. See [release-sync.md](release-sync.md) for ID/version deduplication, delayed-asset handling, source checks, owner promotion and recovery.

## Delivery

See [founder-guide.md](founder-guide.md) for the plain-language project/course map, [verification.md](verification.md) for actual checks/screenshots/limitations, and [release-sync.md](release-sync.md) for owner setup and recovery. Detailed browser/cache reports and logs are retained in `/workspace/artifacts/academy-retention/`. No private business-development pipeline, prospect, inbox or approval state is included.
