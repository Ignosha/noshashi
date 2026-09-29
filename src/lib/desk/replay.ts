import { canonicalCheck, checkState, DOMAIN_REGISTRY, evaluatePolicy, receiptDigest, type CheckState, type PolicyCheck } from "@/lib/policy";
import type { AccountInfo, CredentialRecord } from "@/lib/xrpl/types";
import type { Status } from "@/lib/xrpl/types";
import { judge, toChecks, type PolicyParams } from "./institutional";
import type { LedgerEntry } from "./ledger";

/**
 * Replay — reconstruct how a recorded verdict was reached, from the ledger
 * it was read at, and show any difference from what was recorded.
 *
 *   DATA      the subject's account, credentials and the reserve in force,
 *             re-read at the receipt's own ledger index
 *   POLICY    the same rule profile, and the same institutional policy
 *             version when its parameters are held on this device
 *   RULES     every rule re-run on that data
 *   RESULT    the verdict and the SHA-256 recomputed
 *   EVIDENCE  a rule-by-rule comparison with the stored receipt
 *
 * The stored entry is never changed. A replay is a second reading placed
 * beside the first; where they differ the difference is the finding.
 *
 * Two things are carried over rather than re-derived, and marked so:
 * source agreement (a check about live nodes at the time) and, when the
 * policy parameters are not on this device, the institutional rule results.
 * Those rules' facts (measurements) are recorded on the entry, so with the
 * parameters in hand they are recomputed exactly.
 */

export type ReplayData = {
  account: AccountInfo | null;
  credentials: CredentialRecord[];
  reserve: { baseXrp: number; incXrp: number } | null;
  /** Sources that could not be read at the recorded ledger. */
  unavailable: string[];
};

export type RuleDiff = {
  id: string;
  label: string;
  recorded: CheckState | "absent";
  replayed: CheckState | "absent";
  /** Carried from the record rather than re-derived; see `carried`. */
  carried: boolean;
};

export type ReplayResult =
  | { state: "not-replayable"; reason: string }
  | {
      state: "matches" | "differs";
      ledgerIndex: number;
      recordedVerdict: Status;
      replayedVerdict: Status;
      recordedDigest: string;
      replayedDigest: string;
      rules: RuleDiff[];
      /** Rules whose state changed. */
      changed: RuleDiff[];
      /** What was carried over and why. */
      carried: string[];
      /** Sources that could not be read at that ledger. */
      unavailable: string[];
    };

/** Why an entry cannot be replayed, or null when it can. */
export function replayable(entry: LedgerEntry): string | null {
  if (!entry.ledgerIndex) return "This verdict was recorded before NOSHASHI kept the ledger index beside each receipt, so there is no ledger to re-read.";
  if (entry.offline) return "This verdict was adjudicated against a captured snapshot; the snapshot, not the ledger, is its evidence.";
  if (!entry.domainId || !entry.checks) return "This verdict was recorded before its rules were kept, so there is nothing to re-run.";
  if (!DOMAIN_REGISTRY.some((d) => d.id === entry.domainId)) return `Rule profile ${entry.domainId} is not in this version of NOSHASHI.`;
  return null;
}

/**
 * Re-run a recorded verdict on data re-read at its ledger. Pure: the data
 * and (optionally) the policy parameters are passed in.
 */
export async function replayVerdict(entry: LedgerEntry, data: ReplayData, params?: PolicyParams): Promise<ReplayResult> {
  const why = replayable(entry);
  if (why) return { state: "not-replayable", reason: why };
  if (!data.account && data.unavailable.some((u) => u.startsWith("account state"))) {
    return {
      state: "not-replayable",
      reason: `The subject's account could not be read at ledger ${entry.ledgerIndex!.toLocaleString("en-US")}. Public servers keep a limited history; a full-history server is needed for older ledgers. Nothing was compared.`,
    };
  }
  const domain = DOMAIN_REGISTRY.find((d) => d.id === entry.domainId)!;
  const recorded = entry.checks!;
  const carried: string[] = [];
  if (!data.reserve) carried.push("Reserve: the reserve in force at that ledger could not be read, so the protocol values in force today were used.");

  const agreement = recorded.find((c) => c.id === "SOURCE_AGREEMENT");
  if (agreement) carried.push("Source agreement: a check on which live nodes agreed at the time; kept as recorded.");

  let policyChecks: PolicyCheck[] | undefined;
  if (entry.policy) {
    if (params && entry.measurements) {
      policyChecks = toChecks(judge(entry.measurements, params), params);
    } else {
      policyChecks = recorded.filter((c) => c.id.startsWith("POLICY_"));
      carried.push(
        `Institutional policy ${entry.policy.name} v${entry.policy.version}: its parameters are not on this device, so its rule results are kept as recorded.`
      );
    }
  }

  const body = evaluatePolicy({
    account: data.account,
    credentials: data.credentials,
    domain,
    amountXrp: entry.amountXrp,
    // Only the sources a live verdict can itself mark unavailable, named as it names them.
    evidenceUnavailable: data.unavailable.filter((u) => u === "credential registry"),
    reserve: data.reserve ?? undefined,
    ...(agreement ? { agreement } : {}),
    ...(entry.policy && policyChecks ? { policy: entry.policy, policyChecks } : {}),
  });
  // The digest covers the evaluation time; a replay is evaluated "as of" the
  // recorded one, so identical inputs give the identical digest.
  const replayedDigest = await receiptDigest({ ...body, evaluatedAt: entry.at });

  const ids = [...new Set([...recorded.map((c) => c.id), ...body.checks.map((c) => c.id)])];
  const rules: RuleDiff[] = ids.map((id) => {
    const a = recorded.find((c) => c.id === id);
    const b = body.checks.find((c) => c.id === id);
    return {
      id,
      label: (b ?? a)!.label,
      recorded: a ? checkState(a) : "absent",
      replayed: b ? checkState(b) : "absent",
      carried: id === "SOURCE_AGREEMENT" || (id.startsWith("POLICY_") && !params),
    };
  });
  const changed = rules.filter((r) => r.recorded !== r.replayed);
  const same =
    changed.length === 0 &&
    body.verdict === entry.verdict &&
    replayedDigest === entry.digest &&
    JSON.stringify(recorded.map(canonicalCheck)) === JSON.stringify(body.checks.map(canonicalCheck));

  return {
    state: same ? "matches" : "differs",
    ledgerIndex: entry.ledgerIndex!,
    recordedVerdict: entry.verdict,
    replayedVerdict: body.verdict,
    recordedDigest: entry.digest,
    replayedDigest,
    rules,
    changed,
    carried,
    unavailable: data.unavailable,
  };
}
