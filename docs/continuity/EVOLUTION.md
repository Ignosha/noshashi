# NOSHASHI Continuity change rehearsal

Continuity connects XRPL observations to an institution's planned activities. An operations reviewer can ask which planned work needs attention under the current credential expiry schedule and under a proposed removal of domain rules.

The desktop now connects the existing access forecast and rule scenario to a deadline queue. An activity has an identifier, activity type, planned time and explicit account/domain dependencies. It can be labeled as a trade, payment, bridge transfer, loan activity or offboarding review. These labels describe the operator's process. A domain requirement must be declared by the operator for each activity.

## The working sample

| Activity | Scheduled work | Finding under removal of issuer A's rule |
| --- | --- | --- |
| Payment-01 | Desk B, 22 November | Its credential is valid at the planned time under current rules. The proposed removal changes access eligibility. |
| Bridge-01 | Desk C, 22 November | Its declared access prerequisite remains met through issuer B. Bridge execution and settlement still require separate evidence. |
| Closure-01 | Unmapped customer, 25 November | The account is outside the portfolio read, so more ledger evidence is needed. |
| Trade-01 | Desk A, 27 November | An alternative credential from issuer B preserves access at the deadline. |
| Loan-01 | Desk A, 11 December | The final qualifying credential expires before the planned time under current and proposed rules. The baseline expiry deserves attention independently of the proposed change. |

The sample is fictional and anchored to 20 November 2026. A live portfolio uses observations pinned to one validated Mainnet ledger. Imported work is evaluated at each activity's scheduled time, independently of the portfolio forecast horizon. Planned times must fall between the snapshot and 365 days ahead.

## What the institution receives

The queue separates findings caused by proposed rules from baseline access problems. It retains missing evidence even when another dependency fails. Every declared dependency must be met for an activity to receive the finding that its access prerequisite is met. Work is ordered by deadline. A reviewer can record an owner and next action, then export the rehearsal with source records, assumptions and a SHA-256 digest. Review notes persist while the workspace is open and in the exported file.

The current rehearsal checks domain access only. Amounts, issuer balances, liquidity, bridge completion, accounting credits, loan terms and actual settlement need additional data and checks. A bridge or loan label establishes no protocol-level dependency by itself. Renewal, revocation and domain updates can alter the forecast. The digest is an integrity check for the report.

## How to explain the evolution to Cyrille

“NOSHASHI Continuity helps an operations team connect ledger changes to its scheduled work. If we remove a credential rule today, the desk can see which planned activities lose a required access condition, which remain eligible through an alternative credential and which need more evidence. The reviewer can assign the follow-up and keep the evidence behind it. We are testing whether that reduces the work involved in approving a change.”

The differentiation hypothesis is the full review from a declared business activity to its observed prerequisite and follow-up. Existing monitoring, eligibility and reconciliation providers remain alternatives. The next commercial proof is a domain operator supplying real activities, verifying the declared dependencies and comparing the queue with its current review.

## API direction

The reusable rehearseWork function in src/lib/continuity/rehearsal.ts accepts an observed snapshot, proposed rules and an activity list. It is the calculation engine for a future change rehearsal API. A hosted interface would additionally need validated input schemas, authentication, organization isolation, capacity limits and agreed handling of private activity records. The current delivery exposes the engine through the desktop.

## Buyer and tier fit

A Pro analyst could rehearse its own work. An Institutional team would need durable assignments, review governance and agreed portfolio capacity. Enterprise would require multiple entities and integrations. The existing proposed $5,000 pilot can test a single domain and up to 20 accounts against one real change review. Measure reviewer time, incorrect alerts, missing dependencies and whether the team requests another cycle.

The research site can teach the underlying XRPL behavior and show a fictional case. Continuity is the desktop workspace for a customer's own review. Preflight remains the separate destination compatibility API prototype.
