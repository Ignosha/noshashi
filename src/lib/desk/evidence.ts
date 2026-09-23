import { receiptDigest, verdictForChecks, DOMAIN_REGISTRY, type PolicyCheck } from "@/lib/policy";
import type { Status } from "@/lib/xrpl/types";
import type { LedgerEntry } from "@/lib/desk/ledger";

/**
 * The evidence chain behind a stored verdict.
 *
 * A verdict on the adjudication ledger is only worth handing to an
 * examiner if it can be walked backwards: which state was read, which
 * policy applied, what each rule found, why those findings produce this
 * verdict, and a receipt that proves none of it was changed afterwards.
 * This module builds that walk from the stored entry alone — nothing is
 * re-read from the network, because the question is what was decided,
 * not what the ledger says now — and re-derives the receipt digest
 * with the same frozen canonicalisation that issued it.
 *
 * Two things it will not do:
 *   - Pass an entry it cannot check. Entries written before the check
 *     list was stored are UNVERIFIABLE, not verified.
 *   - Explain beyond the record. Every line below is a field of the
 *     entry or a rule of the engine; there is no model in this path.
 */

export type ReceiptCheck =
  | { state: "verified"; digest: string }
  | { state: "mismatch"; stored: string; recomputed: string }
  | { state: "unverifiable"; reason: string };

/** Recompute the receipt from the stored body and compare. */
export async function verifyEntry(entry: LedgerEntry): Promise<ReceiptCheck> {
  if (!entry.checks || !entry.domainId) {
    return {
      state: "unverifiable",
      reason:
        "Recorded before the full check list was stored with each verdict, so the receipt body cannot be rebuilt. The digest is still the one issued at the time.",
    };
  }
  const recomputed = await receiptDigest({
    verdict: entry.verdict,
    domainId: entry.domainId,
    subject: entry.subject,
    amountXrp: entry.amountXrp,
    evaluatedAt: entry.at,
    checks: entry.checks,
  });
  return recomputed === entry.digest
    ? { state: "verified", digest: recomputed }
    : { state: "mismatch", stored: entry.digest, recomputed };
}

/** The verdict the engine's own rule gives for these checks. */
export function verdictFromChecks(checks: PolicyCheck[]): Status {
  return verdictForChecks(checks);
}

export function verdictConsistent(entry: LedgerEntry): boolean | null {
  if (!entry.checks) return null;
  return verdictForChecks(entry.checks) === entry.verdict;
}

/** The rule that decided the verdict: the first blocking failure, else the first warning. */
export function decidingCheck(checks: PolicyCheck[]): PolicyCheck | null {
  return (
    checks.find((c) => c.severity === "block" && !c.passed) ??
    checks.find((c) => c.severity === "warn" && !c.passed) ??
    null
  );
}

export type ChainStep = {
  kind: "state" | "policy" | "rule" | "decision" | "receipt";
  title: string;
  value: string;
  detail?: string;
  tone?: "go" | "hold" | "no-go" | "default";
};

/** The walk, in order: state → policy → each rule → decision → receipt. */
export function buildChain(entry: LedgerEntry): ChainStep[] {
  const domain = DOMAIN_REGISTRY.find((d) => d.id === entry.domainId || d.code === entry.domainCode);
  const steps: ChainStep[] = [
    {
      kind: "state",
      title: entry.offline ? "CACHED LEDGER STATE" : "VALIDATED LEDGER STATE",
      value: entry.subject,
      detail: entry.offline
        ? `Adjudicated at ${entry.at} against a captured snapshot, not a live read.`
        : `Read live from XRPL mainnet at ${entry.at}.`,
    },
    {
      kind: "policy",
      title: "POLICY",
      value: domain ? `${domain.code} · ${domain.name}` : entry.domainCode,
      detail: `${entry.checksTotal} rules evaluated for a ${entry.amountXrp} XRP settlement.`,
    },
  ];

  if (entry.checks) {
    for (const c of entry.checks) {
      steps.push({
        kind: "rule",
        title: c.id,
        value: c.passed ? "PASS" : c.severity === "block" ? "FAIL · BLOCKING" : "FAIL · ADVISORY",
        detail: c.passed ? c.label : `${c.label} — ${c.detail}`,
        tone: c.passed ? "go" : c.severity === "block" ? "no-go" : "hold",
      });
    }
  } else if (entry.failedRules.length) {
    steps.push({
      kind: "rule",
      title: "FAILED RULES",
      value: entry.failedRules.join(", "),
      detail: `${entry.checksPassed} of ${entry.checksTotal} passed. The passing rules were not recorded with this entry.`,
      tone: "hold",
    });
  }

  const decider = entry.checks ? decidingCheck(entry.checks) : null;
  steps.push({
    kind: "decision",
    title: "DECISION",
    value: entry.verdict.toUpperCase(),
    detail:
      entry.verdict === "insufficient-data"
        ? "A source needed for a conclusion could not be read, and no blocking rule failed. This is a statement about the reading, not a clearance."
        : decider
          ? `Decided by ${decider.id}: ${decider.severity === "block" ? "a blocking rule failed" : "an advisory rule failed, so a person should look before continuing"}.`
          : "Every configured rule passed.",
    tone: entry.verdict === "go" ? "go" : entry.verdict === "no-go" ? "no-go" : "hold",
  });
  steps.push({
    kind: "receipt",
    title: "SHA-256 RECEIPT",
    value: entry.digest,
    detail: "Over the verdict, domain, subject, amount, time and every rule id with its result.",
  });
  return steps;
}

/**
 * WHY / HOW / EVIDENCE / POLICY / LIMITATIONS — the five questions every
 * material conclusion has to answer, filled from the record only.
 */
export function explain(entry: LedgerEntry) {
  const decider = entry.checks ? decidingCheck(entry.checks) : null;
  return {
    why:
      entry.verdict === "go"
        ? "Every configured rule passed."
        : decider
          ? `${decider.label}: ${decider.detail}`
          : entry.failedRules.length
            ? `Failed: ${entry.failedRules.join(", ")}.`
            : "A required source could not be read.",
    how: "Blocking failure → NO-GO; unavailable evidence → INSUFFICIENT DATA; advisory failure → HOLD; otherwise GO. Deterministic: the same state and rules return the same verdict.",
    evidence: `${entry.offline ? "Captured snapshot" : "Validated mainnet state"} for ${entry.subject}, ${entry.at}.`,
    policy: entry.domainCode,
    limitations:
      "The verdict describes the state at the time it was read and the rules configured then. It is not legal advice and does not say the settlement is lawful.",
  };
}
