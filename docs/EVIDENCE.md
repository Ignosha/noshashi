# Evidence

Last reviewed 2026-09-29 against `src/lib/policy.ts` and `src/lib/desk/`
(`ledger.ts`, `evidence.ts`, `replay.ts`, `report.ts`). This page explains
what NOSHASHI records for each decision and how anyone, including someone
who does not trust NOSHASHI, can check it.

## What a recorded verdict contains

| Field | Meaning |
|---|---|
| `verdict` | GO, HOLD, NO-GO or INSUFFICIENT DATA |
| `subject`, `amountXrp` | The account and the amount judged |
| `domainId` | The rule profile |
| `checks` | Every rule's id, severity, pass/fail, state and reason |
| `policy` | Institutional policy id, version, SHA-256 and engine version, when one was active |
| `measurements` | The facts the policy rules were measured from (for simulation and replay) |
| `ledgerIndex` | The validated ledger the reading came from |
| `at` | When it was evaluated |
| `digest` | The receipt: SHA-256 over the canonical body |

## The receipt

The digest is SHA-256 over these exact bytes (`receiptCanonical()`):

```json
{"verdict":…,"domainId":…,"subject":…,"amountXrp":…,"evaluatedAt":…,
 "checks":[[id, passed] or [id, passed, state], …],
 "policy":[id, version, hash, engine]}
```

- `policy` is present only when an institutional policy was applied.
- A check's `state` is included only for INSUFFICIENT_DATA and
  NOT_APPLICABLE, which `passed` alone cannot express. So no receipt issued
  before those states existed changes, and "no answer" cannot be rewritten
  as a failure later.
- The digest is written in upper-case hex.
- This body is **frozen**: changing its shape would stop every stored
  receipt from verifying. New receipt kinds use `digestOf()`, which puts a
  `kind` inside the hashed body.

Any change to the verdict, a rule result, the subject, the amount, the time
or the policy changes the digest.

## Four ways to check a decision

| Check | What it proves | Where |
|---|---|---|
| **Re-verify** | The stored record has not changed since it was issued: the digest is recomputed from the record and compared | Evidence panel; `verifyEntry()` |
| **Consistency** | The recorded verdict is the one the engine's own rule gives for the recorded checks | `verdictConsistent()` |
| **Replay** | The ledger at the recorded index still produces the same rule results: the account, credentials and reserve are re-read at that ledger and the rules re-run, then compared rule by rule | Evidence panel → REPLAY; `replayVerdict()` |
| **Independent recomputation** | The digest can be recomputed without NOSHASHI | The institutional report prints the canonical bytes and the `shasum` / `certutil` commands |

Re-verification has three results: **verified**, **mismatch** (both digests
shown), or **unverifiable** (the entry predates storing the full rule list;
the original digest is still shown). Unverifiable is never displayed as
verified.

### What replay can and cannot do

- It needs the ledger index, so entries recorded before indexes were kept
  cannot be replayed; the app says so.
- Offline verdicts were judged against a captured snapshot; the snapshot is
  their evidence, so they are not replayed.
- Public servers keep limited history. If the account cannot be read at that
  ledger, replay reports that nothing was compared, rather than guessing.
- Source agreement, and institutional policy results when the policy's
  parameters are not on this device, are carried as recorded and listed as
  such.
- A replay digest is computed as of the original time, so a matching replay
  reproduces the same digest.

## Source agreement

Before a verdict is recorded, every public node is asked for the ledger hash
and the account state at the same validated index
(`src/lib/net/agreement.ts`). The result is the `SOURCE_AGREEMENT` check,
inside the receipt. If nodes disagree, only one answers, or the state moved,
the check is REVIEW and the verdict cannot be GO.

## The institutional report

One self-contained HTML document per decision (EXPORT REPORT in the
Evidence panel; prints to PDF from any browser). Sections: executive
summary, subject, policy, key findings, every rule evaluated, ledger and
sources, evidence (receipt and re-verification), replay, exceptions, a blank
reviewer block, and verification instructions with the canonical bytes.
Every recorded value is HTML-escaped. Nothing in it is estimated or written
by the AI assistant.

## Other evidence

| Evidence | Where |
|---|---|
| Audit-trail CSV with a SHA-256 manifest | Ledger & Policy → export |
| Signed verdict export | Ledger & Policy |
| Hash-chained case log | Investigations (`org_case_events`: each event hashes its body, which includes the previous hash) |
| Append-only organization audit log | `noshashi.audit_log` |
| Exceptions | Recorded beside the verdict, never changing it; each approval has an expiry |

## Limits

- The device store is not encrypted separately from the OS account. A local
  attacker can edit it; re-verification detects the edit but cannot
  prevent it.
- The receipt proves what NOSHASHI decided and on which reading. It does not
  prove the reading was true beyond what source agreement shows.
