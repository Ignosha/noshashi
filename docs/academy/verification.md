# Academy upgrade verification

Date: November 14, 2026. Base `1235081`. OS/browser actually exercised: **Linux / Chromium**. No public deployment, GitHub release creation or native installation was performed.

## Executed checks

| Check | Actual result |
| --- | --- |
| `npx tsc -p academy --noEmit` | Pass |
| `npm test` | 131 files passed, one skipped; **1,670 tests passed, four skipped** |
| Targeted Academy/release/CSP tests | **57 passed** across five files |
| `npm run build` | Pass (product frontend) |
| `npm run academy:build` | Pass (Academy frontend + training workstation); 36 existing video/poster files copied for 18 videos |
| `npm run site:build` | Pass; public Academy scripts externalized under existing CSP |
| `npm run site:academy` | Pass; complete web/workstation bundles and content-hashed precache generated |
| `npm run site:noshx` | Pass; published-page index regenerated for the corrected written course |
| `npm run academy:smoke -- <local-preview>` | Pass; scenarios below, with production CSP |
| `node scripts/academy/cache-smoke.mjs` | Pass; four isolated offline/update/rollback scenarios |
| `npm run check:academy-web` | Pass; committed Academy/workstation/worker bundle reproduces cleanly |
| `npm run check:noshx-web` | Pass; committed page index reproduces cleanly |
| `git diff --check` | Pass |
| Native `cargo test --lib ... --offline` | **Blocked: Cargo is not installed in this environment** |

The first full-suite/browser attempt exposed executable inline scripts after rendering the Academy pages directly. This was corrected using the repository's existing script-externalization build step, without loosening CSP. Subsequent CSP and full-suite checks passed. Typecheck also caught an overly broad Web Crypto function guard; it was corrected and typecheck passed. No failing check is represented as a pass.

Existing Vite module-format/future-loader warnings, Rollup PURE-annotation warnings, dynamic/static import chunk warnings and product chunk-size warnings remain visible in logs. A successful build is not a performance benchmark or security certification.

## Browser scenarios

1. Public Academy Start opens lesson one immediately with a reading default; section/card survive refresh. Reading/contrast/focus settings remain accessible inside the lesson.
2. Existing video controls, caption track loading under production CSP and transcript disclosure remain functional. Audio voice quality and complete video playback were not evaluated.
3. Lesson checks require Check answer before correctness, preserve their exact question/attempt across refresh and schedule missed concepts.
4. The public payment-case CTA opens a prefilled simulated training example. Evidence plus a supported decision is required; model teach-back is hidden until a written attempt. Completion survives refresh and appears separately from the 18-workstation-lab counter.
5. Injected public WebSocket/node failure leaves the recorded exercise unchanged and completable. The existing embedded NOSHASHI training workstation loads through the case entry.
6. A miss on a review at least eight days after introduction resets its interval, records first-attempt evidence and returns a different variant later. Selection alone never reveals correctness.
7. Practice mode submits feedback explicitly and resumes its exact question. Exam mode hides correctness until final submission, retains flags and optional timer across refresh, scores a deliberately constructed 20/25 attempt at 80%, breaks results down by topic and offers weak-topic retry.
8. A seeded, correctly fingerprinted earned course record retains its certificate and final-check result while practicing; the existing certificate view still opens it. Pure tests also verify unchanged eligibility and course record preservation.
9. At 390px width the invoice case has no horizontal overflow and evidence/decision can be submitted by keyboard. Desktop is checked at 1440px. Phone task/evidence/decision navigation remains reachable.
10. Refused local storage is disclosed; in-tab session memory survives view changes. It cannot persist across reload/closed tabs. Malformed case/practice records fall back without crashing or resetting earned course records.

## Release and cache fixtures

Unit fixtures cover stable product and Academy releases, prereleases/drafts/unrelated tags, duplicate IDs, a late older release, delayed installer uploads, malformed source metadata, invalid mappings, failed candidate validation, failed released-source checks, hostile release-note text and full pagination with a later-page failure. Only valid newer channel versions replace the selected release. No source notes become teaching/grading instructions.

The cache browser fixture runs the production worker template on an isolated localhost origin. It verifies offline navigation, a rejected installation when a new chunk is missing, explicit healthy activation with preserved local keys, and an explicit operator rollback with preserved keys. This is preview/fixture verification, not a production publication test. Source-release mappings assist editor review; no unmapped workflow is described as fully reviewed.

The generated core/workstation precache currently contains 77 assets, approximately 3.7 MB before transport compression. It excludes course video downloads. No Lighthouse/Core Web Vitals or full WCAG conformance claim is made.

## Review screenshots and local paths

- [Public Academy](screenshots/public-academy.png)
- [Invoice case — desktop](screenshots/invoice-desktop.png)
- [Invoice case — phone](screenshots/invoice-mobile.png)
- [Recall feedback](screenshots/review-feedback.png)
- [Preparation-test results](screenshots/practice-results.png)

Local preview entry points: `/academy/`, `/academy/app/?lesson=a1`, `/academy/app/?case=invoice`, `/academy/app/?review=due`, `/academy/app/?practice=1`. Screenshots contain simulated exercise/test learner data, not customer records.

## Remaining release gates

- Owner review/merge and normal main deployment checks; this branch disables automatic Vercel Git deployment.
- Optional `ACADEMY_RELEASE_REVIEW_PRS=true` repository variable and Actions PR permission. Without them, the sync validates and uploads candidates without publishing.
- Editorial mapping/validation against future released workflows; new content is version-controlled, never generated from release notes.
- Choose/bump the next native Academy version before creating installers. Existing published Academy 0.2.1 downloads are not this content upgrade.
- Native Rust/toolchain checks and actual installers on Windows/macOS/Linux. Physical Intel Mac and Monterey behavior, signing and notarization remain **unverified**. Browser Safari/Firefox and assistive-technology testing remain unperformed.
- Cloud Terminal remains separate in PR #170; the Academy does not claim that unmerged CMD workspace is a released product workflow.
