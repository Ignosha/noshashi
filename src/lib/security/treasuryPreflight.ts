import { rpc, isValidAddress } from "@/lib/xrpl/client";
import {
  treasuryPolicy,
  treasuryFlow,
  evaluateTreasury,
  xrpDrops,
  reviewTreasuryProposal,
  type TreasuryPolicy,
  type TreasuryFlow,
} from "./treasury";
import { evidenceRecord } from "./workflowEvidence";
type Json = Record<string, any>;
export type TreasuryPreflight = {
  schema: "noshashi-treasury-preflight-v1";
  status: "review_required" | "incomplete" | "eligible_for_independent_review";
  observedAt: string;
  source: string;
  proposal: Json;
  policy: TreasuryPolicy;
  anchor: { hash: string; index: number; closeTime: number };
  balanceDrops: string;
  windowFrom: number;
  windowPayments: number;
  windowDrops: string;
  windowEvidence: TreasuryFlow[];
  coverageComplete: boolean;
  reasons: string[];
  unchecked: string[];
  limitation: string;
  sha256: string;
};
export async function liveTreasuryPreflight(
  source: string,
  policyValue: TreasuryPolicy,
  proposal: Json,
  request = rpc,
  now = Date.now(),
): Promise<TreasuryPreflight> {
  if (!isValidAddress(source)) throw Error("Select a valid source.");
  const policy = treasuryPolicy(policyValue);
  reviewTreasuryProposal(source, policy, proposal);
  if (
    Object.keys(proposal).some(
      (k) =>
        ![
          "TransactionType",
          "Account",
          "Destination",
          "DestinationTag",
          "Amount",
          "Fee",
          "Sequence",
          "LastLedgerSequence",
          "Flags",
        ].includes(k),
    )
  )
    throw Error(
      "This review accepts only direct unsigned XRP payment fields, without memos or signing data.",
    );
  const validUint = (v: unknown) =>
    typeof v === "number" &&
    Number.isSafeInteger(v) &&
    v >= 0 &&
    v <= 4294967295;
  if (
    !validUint(proposal.Sequence) ||
    proposal.Sequence === 0 ||
    !validUint(proposal.LastLedgerSequence) ||
    typeof proposal.Fee !== "string" ||
    !/^\d{1,18}$/.test(proposal.Fee) ||
    BigInt(proposal.Fee) <= 0n ||
    BigInt(proposal.Fee) > xrpDrops("100000000000") ||
    (proposal.DestinationTag !== undefined &&
      !validUint(proposal.DestinationTag))
  )
    throw Error(
      "Include a positive Sequence, LastLedgerSequence and fee in drops; destination tags must be uint32 integers.",
    );
  const deadline = Date.now() + 25000;
  const call = (command: string, params: Json): Promise<Json> =>
    new Promise((resolve, reject) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        reject(
          Error(
            "Preflight reached its 25-second deadline; no clearance was issued.",
          ),
        );
        return;
      }
      let settled = false;
      const timer = setTimeout(
        () => {
          settled = true;
          reject(
            Error("Preflight data unavailable within its deadline. Retry."),
          );
        },
        Math.min(remaining, 12000),
      );
      Promise.resolve()
        .then(() => request(command, params))
        .then(
          (r) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve(r);
            }
          },
          (e) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              reject(e);
            }
          },
        );
    });
  const ledger = await call("ledger", {
    ledger_index: "validated",
    transactions: false,
  });
  const hash = String(
      ledger.ledger_hash ?? ledger.ledger?.ledger_hash ?? "",
    ).toUpperCase(),
    index = Number(ledger.ledger_index ?? ledger.ledger?.ledger_index),
    closeTime = (Number(ledger.ledger?.close_time) + 946684800) * 1000;
  if (
    ledger.validated !== true ||
    !/^[A-F0-9]{64}$/.test(hash) ||
    !Number.isSafeInteger(index) ||
    index <= 0 ||
    !Number.isFinite(closeTime) ||
    now - closeTime > 180000 ||
    closeTime > now + 30000
  )
    throw Error("A fresh validated-ledger anchor is required.");
  const account = await call("account_info", {
    account: source,
    ledger_hash: hash,
  });
  if (
    account.validated !== true ||
    Number(account.ledger_index) !== index ||
    account.account_data?.Account !== source ||
    typeof account.account_data.Balance !== "string" ||
    !/^\d{1,18}$/.test(account.account_data.Balance)
  )
    throw Error("Source balance could not be read at the same ledger.");
  const balance = BigInt(account.account_data.Balance),
    amount = BigInt(proposal.Amount),
    fee = BigInt(proposal.Fee);
  if (balance > xrpDrops("100000000000"))
    throw Error("Invalid source balance.");
  const reasons = [...reviewTreasuryProposal(source, policy, proposal).reasons],
    issues: string[] = [];
  if (amount + fee > balance)
    reasons.push("Amount plus fee exceeds the validated XRP balance.");
  if (amount * 100n >= balance * BigInt(policy.balancePercent))
    reasons.push("Proposed payment reaches the configured balance percentage.");
  if (Number(account.account_data.Sequence) !== proposal.Sequence)
    reasons.push(
      "Proposal Sequence differs from the source’s current sequence.",
    );
  if (proposal.LastLedgerSequence <= index)
    reasons.push("The proposal’s last ledger has already expired.");
  if (proposal.LastLedgerSequence > index + 100)
    reasons.push(
      "Proposal has a broad ledger-validity window; review before signing.",
    );
  const windowFrom = closeTime - policy.windowMinutes * 60000;
  const flows: TreasuryFlow[] = [];
  const seen = new Set<string>();
  let marker: unknown;
  let complete = false;
  let previousLedger = Number.POSITIVE_INFINITY,
    previousTime = Number.POSITIVE_INFINITY;
  for (let page = 0; page < 8; page++) {
    const history = await call("account_tx", {
      account: source,
      ledger_index_min: -1,
      ledger_index_max: index,
      forward: false,
      binary: false,
      limit: 200,
      ...(marker !== undefined ? { marker } : {}),
    });
    if (
      history.validated !== true ||
      !Array.isArray(history.transactions) ||
      history.transactions.length > 200 ||
      !Number.isSafeInteger(Number(history.ledger_index_min)) ||
      Number(history.ledger_index_min) < 0 ||
      Number(history.ledger_index_max) !== index
    )
      throw Error(
        "History scope is incomplete or differs from the anchored ledger.",
      );
    let crossed = false;
    for (const row of history.transactions) {
      const tx = row.tx_json ?? row.tx;
      const ripple = tx?.date ?? row.date;
      const at = Number.isInteger(ripple)
        ? (ripple + 946684800) * 1000
        : Date.parse(row.close_time_iso);
      const n = Number(row.ledger_index ?? tx?.ledger_index);
      if (
        row.validated !== true ||
        !Number.isSafeInteger(n) ||
        n < 1 ||
        n > index ||
        !Number.isFinite(at) ||
        at > closeTime
      )
        throw Error(
          "History contains missing, unvalidated or out-of-scope records.",
        );
      if (n > previousLedger || at > previousTime)
        throw Error(
          "History ordering could not establish the requested time window.",
        );
      previousLedger = n;
      previousTime = at;
      if (at < windowFrom) {
        crossed = true;
        continue;
      }
      const read = treasuryFlow(source, row);
      if (read.flow) flows.push(read.flow);
      if (read.issue) issues.push(read.issue);
    }
    if (crossed) {
      complete = true;
      break;
    }
    if (history.marker === undefined || history.marker === null) {
      complete = Number(history.ledger_index_min) <= 1;
      if (!complete)
        issues.push(
          "The node’s history begins after ledger 1 and did not establish the full time window.",
        );
      break;
    }
    const key = JSON.stringify(history.marker);
    if (!history.transactions.length || key.length > 2048 || seen.has(key))
      throw Error("History pagination stalled. No clearance was issued.");
    seen.add(key);
    marker = history.marker;
  }
  if (!complete)
    issues.push(
      "Rolling-window coverage is incomplete or the eight-page capacity was reached.",
    );
  const unique = [...new Map(flows.map((f) => [f.hash, f])).values()];
  const total = unique.reduce((s, f) => s + BigInt(f.drops), 0n);
  if (total + amount >= xrpDrops(policy.windowXrp))
    reasons.push(
      "Recent XRP outflows plus this proposal reach the rolling-window limit.",
    );
  const simulated: TreasuryFlow = {
    hash: "0".repeat(64),
    ledger: index,
    at: closeTime,
    destination: proposal.Destination,
    drops: proposal.Amount,
    beforeDrops: balance.toString(),
    afterDrops:
      balance >= amount + fee ? (balance - amount - fee).toString() : "0",
    feeDrops: proposal.Fee,
    transactionIndex: 2147483647,
    type: "Payment",
  };
  if (
    evaluateTreasury(policy, [...unique, simulated], closeTime).some(
      (f) => f.kind === "split_transfers" && f.hashes.includes(simulated.hash),
    )
  )
    reasons.push(
      "The proposal contributes to a qualifying split across destinations.",
    );
  const report: Omit<TreasuryPreflight, "sha256"> = {
    schema: "noshashi-treasury-preflight-v1",
    status: issues.length
      ? "incomplete"
      : reasons.length
        ? "review_required"
        : "eligible_for_independent_review",
    observedAt: new Date(now).toISOString(),
    source,
    proposal,
    policy,
    anchor: { hash, index, closeTime },
    balanceDrops: balance.toString(),
    windowFrom,
    windowPayments: unique.length,
    windowDrops: total.toString(),
    windowEvidence: unique,
    coverageComplete: complete && !issues.length,
    reasons: [...new Set([...reasons, ...issues])],
    unchecked: [
      "Destination identity, sanctions and current threat intelligence (use Enterprise Withdrawal screening)",
      "Owner/signing authority and key possession",
      "Account reserves, queued transactions, tickets and concurrent spending",
      "Enforced hold and signing-system integration",
    ],
    limitation:
      "A read-only public-node snapshot, not independent consensus verification, permission to spend or a reservation of funds. Recheck expiry, state and independent approvals at the signing system. No transaction is signed or submitted.",
  };
  return {
    ...report,
    sha256: (await evidenceRecord("treasury-preflight-v1", report)).sha256,
  };
}
