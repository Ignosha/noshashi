# NOSHASHI Academy — the simple guide

## What NOSHASHI does

Think of NOSHASHI as an evidence desk for decisions on the XRP Ledger:

1. **Verify:** did a payment become validated, and what actually arrived?
2. **Investigate:** what can the issuer control, and how much market depth is funded?
3. **Decide:** what does the stated policy say to do with that evidence?
4. **Prove:** keep the source, ledger, rules, unknowns and receipt with the decision.

A ledger flag is not proof of reserves. A quote is not a guaranteed fill. A hash is not a signature. A policy outcome is not a legal certification. The course teaches how to explain those boundaries in plain language.

## The quickest way to use the Academy

Once the owner publishes the reviewed update:

- `/academy/` → **Start the 5-minute lesson** opens lesson one immediately. Reading is the default. Change reading/video/audio/access preferences from inside the lesson.
- `/academy/app/` restores the last section; the course map also offers **Continue where you left off**.
- `/academy/app/?case=invoice` opens the free browser payment case with an example already supplied. No install, account, keys or funds.
- `/academy/app/?review=due` opens a short recall session.
- `/academy/app/?practice=1` opens preparation-test setup.

These paths exist in the review branch/local preview now. They are not a claim that this upgrade is already public.

## Two sensible paths

**Beginner:** work through the 21 lessons in five levels. Learn one idea, answer a check, apply it, then return later. The original 18 workstation labs and 18 videos remain available.

**Institutional evaluator:** do the invoice case, issuer-controls case and funded-liquidity case, then “Explain the verdict.” These four new guided cases use versioned simulated training data. Optional product screens and fresh public-node reads are separate; an outage cannot change the recorded expected answer.

For example, the invoice requests 100 USD and the metadata delivers 40 USD to the matching destination/tag. The learner must select validation, amounts, destination/tag and result evidence, then explain the 60 USD shortfall under the stated training policy. Merely opening the payment screen does not complete the case.

## How retention works

- The Academy schedules introduced concepts locally. Initial review is one day later; successful reviews move through intervals of 3, 7 and 21 days. A miss returns the concept the next day.
- Review sessions have at most five questions. Nothing is timed and nothing is lost for being overdue.
- Choose an answer, then press **Check answer**. Only then does feedback appear. The explanation includes why the plausible wrong choice fails.
- Important questions vary amounts, missing evidence or context. Payment, issuer and liquidity concepts mix only after introduction.
- **Needs review** and the recent review history show what needs attention. Week-later first-attempt counts are observations of exercise responses, not a guarantee of long-term expertise.
- The teach-back asks for a short explanation in the learner’s own words before showing a model. Evidence/decision selections are scored; the written explanation is self-reviewed, not AI-graded.

## For people who find focusing or restarting difficult

One question at a time; a clear next action; no forced preference setup; saved lesson card/check, review and test position; staged hints; optional focus/contrast/read-aloud/text settings; optional break reminders; no streak penalties. You can stop after one question. On phones, Task brief/Evidence/Decision links keep the current case reachable.

Practice and exam-preparation modes have an optional guide timer, disabled by default and removable. It never auto-submits. Exam mode hides all correctness until final submission, supports previous/next, flags and unanswered navigation. Full tests contain 25 questions across six topics, with an 80% starting target and unlimited retakes. Weak-topic drills may be shorter.

## What is preserved

Existing `academy.progress` v1, passed lessons, final-check results, certificates and lab records keep their original requirements. The new practice test cannot award or revoke a certificate. Review schedules/history, analyst cases and practice attempts have separate local keys. Clearing browser storage still removes local records; a refused-storage notice explains when progress lasts only for the current tab.

## Releases and owner actions

The release-sync workflow prepares validated metadata candidates from stable GitHub releases and recovers missed events daily. New release notes can appear as display data; they never rewrite lessons or grade answers. Unmapped teaching impacts need an editor. Automatic review PRs are optional via `ACADEMY_RELEASE_REVIEW_PRS=true`.

The owner still reviews/merges and publishes. Native installers are not silently installed. See [release-sync.md](release-sync.md) for setup, released-source mapping checks, reruns and cache recovery. Intel Mac/Monterey execution and OS signing must be verified separately before making compatibility claims.
