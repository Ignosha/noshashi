import { isValidAddress, rpc } from "@/lib/xrpl/client";
import { canonical } from "@/lib/compliance/registry";

const MAX_DROPS = 100_000_000_000_000_000n;
const HASH = /^[A-F0-9]{64}$/;
type Json = Record<string, any>;
export type TreasuryPolicy = {
  schema: "noshashi-treasury-v1";
  singleXrp: string;
  windowXrp: string;
  windowMinutes: number;
  distinctDestinations: number;
  balancePercent: number;
  flagUnlisted: boolean;
  allowlist: string[];
};
export const DEFAULT_TREASURY_POLICY: TreasuryPolicy = {
  schema: "noshashi-treasury-v1",
  singleXrp: "10000",
  windowXrp: "25000",
  windowMinutes: 60,
  distinctDestinations: 3,
  balancePercent: 20,
  flagUnlisted: true,
  allowlist: [],
};
export function xrpDrops(value: string): bigint {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(value)
  )
    throw Error(
      "Use an exact XRP amount, up to six decimals; no dollar estimate or exponent.",
    );
  const [whole, part = ""] = value.split(".");
  const drops = BigInt(whole) * 1_000_000n + BigInt(part.padEnd(6, "0"));
  if (drops > MAX_DROPS) throw Error("XRP amount exceeds the supply bound.");
  return drops;
}
export function formatDrops(drops: string | bigint): string {
  const n = BigInt(drops);
  return (
    `${n / 1_000_000n}.${String(n % 1_000_000n).padStart(6, "0")}`.replace(
      /\.?0+$/,
      "",
    ) || "0"
  );
}
export function treasuryPolicy(value: any): TreasuryPolicy {
  if (
    !value ||
    value.schema !== "noshashi-treasury-v1" ||
    xrpDrops(value.singleXrp) <= 0n ||
    xrpDrops(value.windowXrp) <= 0n ||
    !Number.isInteger(value.windowMinutes) ||
    value.windowMinutes < 1 ||
    value.windowMinutes > 1440 ||
    !Number.isInteger(value.distinctDestinations) ||
    value.distinctDestinations < 2 ||
    value.distinctDestinations > 50 ||
    !Number.isInteger(value.balancePercent) ||
    value.balancePercent < 1 ||
    value.balancePercent > 100 ||
    typeof value.flagUnlisted !== "boolean" ||
    !Array.isArray(value.allowlist) ||
    value.allowlist.length > 200 ||
    value.allowlist.some(
      (a: unknown) => typeof a !== "string" || !isValidAddress(a),
    )
  )
    throw Error(
      "Invalid treasury policy. Set positive XRP limits, a 1–1,440 minute window, 2–50 destinations, 1–100 percent and public allowlisted addresses.",
    );
  return {
    schema: value.schema,
    singleXrp: value.singleXrp,
    windowXrp: value.windowXrp,
    windowMinutes: value.windowMinutes,
    distinctDestinations: value.distinctDestinations,
    balancePercent: value.balancePercent,
    flagUnlisted: value.flagUnlisted,
    allowlist: [
      ...new Set<string>(value.allowlist.map((a: string) => a.trim())),
    ].sort(),
  };
}
export type TreasuryFlow = {
  hash: string;
  ledger: number;
  at: number;
  destination: string;
  drops: string;
  beforeDrops: string;
  type: "Payment";
  feeDrops: string;
  afterDrops: string;
  transactionIndex: number;
};
export type TreasuryFinding = {
  id: string;
  kind:
    | "large_payment"
    | "balance_share"
    | "unlisted_destination"
    | "window_volume"
    | "split_transfers";
  title: string;
  hashes: string[];
  destinations: string[];
  drops: string;
  ledger: number;
  at: number;
};
const dropsValue = (v: unknown): bigint | null =>
  typeof v === "string" && /^\d{1,18}$/.test(v) && BigInt(v) <= MAX_DROPS
    ? BigInt(v)
    : null;
/** Sender debit is derived from AccountRoot changes minus fee, never requested Amount. */
export function treasuryFlow(
  address: string,
  row: Json,
): { flow: TreasuryFlow | null; issue: string | null } {
  const tx = row.tx_json ?? row.tx;
  const meta = row.meta;
  if (row.validated !== true || !tx || !meta || typeof meta !== "object")
    return {
      flow: null,
      issue: "Unvalidated or incomplete transaction evidence.",
    };
  if (typeof meta.TransactionResult !== "string")
    return { flow: null, issue: "Missing transaction outcome." };
  if (
    meta.TransactionResult !== "tesSUCCESS" ||
    tx.Account !== address ||
    !["Payment", "AccountDelete"].includes(tx.TransactionType) ||
    tx.Destination === address
  )
    return { flow: null, issue: null };
  const hash = String(row.hash ?? tx.hash ?? "").toUpperCase(),
    ledger = Number(row.ledger_index ?? tx.ledger_index),
    at = (Number(tx.date ?? row.date) + 946684800) * 1000;
  if (
    !HASH.test(hash) ||
    !Number.isSafeInteger(ledger) ||
    ledger < 1 ||
    !Number.isFinite(at) ||
    !Number.isInteger(Number(tx.date ?? row.date)) ||
    Number(tx.date ?? row.date) < 0 ||
    !Number.isSafeInteger(meta.TransactionIndex) ||
    meta.TransactionIndex < 0 ||
    !isValidAddress(tx.Destination)
  )
    return {
      flow: null,
      issue: "Missing payment hash, destination, ledger or time.",
    };
  if (tx.TransactionType === "AccountDelete")
    return {
      flow: null,
      issue:
        "Account deletion observed: investigate immediately. This payment monitor does not infer the deleted account’s transfer amount.",
    };
  if (
    typeof (tx.Amount ?? tx.DeliverMax) !== "string" ||
    tx.Paths !== undefined ||
    tx.SendMax !== undefined ||
    dropsValue(meta.delivered_amount ?? meta.DeliveredAmount) === null
  )
    return {
      flow: null,
      issue:
        "Non-direct-XRP payment or missing delivered amount: use payment verification and incident review.",
    };
  const fee = dropsValue(tx.Fee);
  if (fee === null)
    return {
      flow: null,
      issue: "Sender fee is unavailable; debit cannot be established.",
    };
  const roots = (
    Array.isArray(meta.AffectedNodes) ? meta.AffectedNodes : []
  ).flatMap((n: Json) => {
    const v = n.ModifiedNode ?? n.DeletedNode;
    return v?.LedgerEntryType === "AccountRoot" &&
      v.FinalFields?.Account === address
      ? [v]
      : [];
  });
  if (roots.length !== 1)
    return {
      flow: null,
      issue: "Sender AccountRoot balance evidence is unavailable.",
    };
  const root = roots[0],
    before = dropsValue(root.PreviousFields?.Balance),
    after =
      root.FinalFields?.Balance === undefined
        ? null
        : dropsValue(root.FinalFields.Balance);
  const original = before;
  const remainder = after;
  if (original === null || remainder === null || original < remainder + fee)
    return {
      flow: null,
      issue: "Sender balance delta is unavailable or inconsistent.",
    };
  const debit = original - remainder - fee;
  if (debit !== dropsValue(meta.delivered_amount ?? meta.DeliveredAmount))
    return {
      flow: null,
      issue:
        "Delivered XRP and sender debit differ; review the complete transaction.",
    };
  if (debit === 0n) return { flow: null, issue: null };
  return {
    flow: {
      hash,
      ledger,
      at,
      destination: tx.Destination,
      drops: debit.toString(),
      beforeDrops: original.toString(),
      type: "Payment",
      feeDrops: fee.toString(),
      afterDrops: remainder.toString(),
      transactionIndex: Number.isSafeInteger(meta.TransactionIndex)
        ? meta.TransactionIndex
        : 0,
    },
    issue: null,
  };
}
export function evaluateTreasury(
  policyValue: TreasuryPolicy,
  flows: TreasuryFlow[],
  observedAt: number,
): TreasuryFinding[] {
  const p = treasuryPolicy(policyValue);
  const unique = [...new Map(flows.map((f) => [f.hash, f])).values()]
    .filter((f) => f.at <= observedAt)
    .sort(
      (a, b) =>
        a.at - b.at ||
        a.ledger - b.ledger ||
        a.transactionIndex - b.transactionIndex ||
        a.hash.localeCompare(b.hash),
    );
  const out: TreasuryFinding[] = [];
  const add = (
    kind: TreasuryFinding["kind"],
    title: string,
    items: TreasuryFlow[],
  ) => {
    const last = items[items.length - 1];
    out.push({
      id: `${last.hash}:${kind}`,
      kind,
      title,
      hashes: items.map((f) => f.hash),
      destinations: [...new Set(items.map((f) => f.destination))],
      drops: items.reduce((s, f) => s + BigInt(f.drops), 0n).toString(),
      ledger: last.ledger,
      at: last.at,
    });
  };
  let window: TreasuryFlow[] = [];
  for (const f of unique) {
    window = window.filter((item) => item.at >= f.at - p.windowMinutes * 60000);
    const prior = window.reduce((s, item) => s + BigInt(item.drops), 0n),
      priorSplit =
        prior >= xrpDrops(p.windowXrp) &&
        new Set(window.map((item) => item.destination)).size >=
          p.distinctDestinations;
    if (BigInt(f.drops) >= xrpDrops(p.singleXrp))
      add("large_payment", "Single-transfer limit reached", [f]);
    if (
      BigInt(f.drops) * 100n >=
      BigInt(f.beforeDrops) * BigInt(p.balancePercent)
    )
      add("balance_share", "Large share of pre-transfer XRP balance moved", [
        f,
      ]);
    if (p.flagUnlisted && !p.allowlist.includes(f.destination))
      add(
        "unlisted_destination",
        "Destination is outside your configured allowlist",
        [f],
      );
    window.push(f);
    const total = prior + BigInt(f.drops);
    if (total >= xrpDrops(p.windowXrp) && prior < xrpDrops(p.windowXrp))
      add("window_volume", "Rolling-window XRP limit reached", window);
    if (
      total >= xrpDrops(p.windowXrp) &&
      !priorSplit &&
      new Set(window.map((item) => item.destination)).size >=
        p.distinctDestinations
    )
      add(
        "split_transfers",
        "Window limit reached across multiple destinations",
        window,
      );
  }
  return out;
}
export function reviewTreasuryProposal(
  address: string,
  policyValue: TreasuryPolicy,
  tx: Json,
) {
  const policy = treasuryPolicy(policyValue);
  if (
    !tx ||
    tx.TransactionType !== "Payment" ||
    tx.Account !== address ||
    !isValidAddress(tx.Destination) ||
    tx.Destination === address ||
    dropsValue(tx.Amount) === null ||
    BigInt(tx.Amount) <= 0n ||
    tx.SendMax !== undefined ||
    tx.Paths !== undefined ||
    tx.DeliverMin !== undefined ||
    (tx.Flags !== undefined && tx.Flags !== 0 && tx.Flags !== 2147483648) ||
    tx.TxnSignature !== undefined ||
    tx.Signers !== undefined ||
    tx.SigningPubKey
  )
    throw Error(
      "Review an unsigned, direct XRP Payment for this watched source. Path payments, partial payments, issued assets and signed payloads need the existing Pre-sign/Withdrawal tools; no clearance is issued here.",
    );
  const reasons: string[] = [];
  if (BigInt(tx.Amount) >= xrpDrops(policy.singleXrp))
    reasons.push("Single-transfer XRP limit reached.");
  if (policy.flagUnlisted && !policy.allowlist.includes(tx.Destination))
    reasons.push("Destination is not allowlisted.");
  return {
    status: reasons.length ? "review_required" : "no_static_rule_triggered",
    reasons,
    proposal: tx,
    policy,
    scope: "unsigned-direct-xrp-payment-v1",
    unchecked: [
      "Current balance and percentage threshold",
      "Rolling-window activity",
      "Signer identity and independent approvals",
      "Destination risk and current ledger state",
    ],
    limitation:
      "Advisory review only. No signing, submission, approval credential, enforced hold or ledger reversal. Your signing system must independently enforce its policy before authorization.",
  };
}
export type TreasuryCursor = {
  ledger: number;
  pending?: { to: number; marker: unknown; seen: string[] };
};
export type TreasuryRead = {
  rows: Json[];
  cursor: TreasuryCursor;
  complete: boolean;
  anchor: { ledger: number; hash: string; closeTime: number };
};
export async function readTreasuryActivity(
  address: string,
  cursor: TreasuryCursor | null,
  request = rpc,
  now = Date.now(),
): Promise<TreasuryRead> {
  if (!isValidAddress(address))
    throw Error("Enter a public XRPL classic address.");
  const deadline = Date.now() + 20000;
  const boundedRequest = (
    command: string,
    params: Record<string, unknown>,
  ): Promise<Json> =>
    new Promise((resolve, reject) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        reject(
          Error(
            "The 20-second account-read deadline was reached. Coverage is unknown; retry.",
          ),
        );
        return;
      }
      let settled = false;
      const timer = setTimeout(
        () => {
          settled = true;
          reject(
            Error(
              "Treasury ledger read timed out. Coverage is unknown; retry.",
            ),
          );
        },
        Math.min(12000, remaining),
      );
      Promise.resolve()
        .then(() => request(command, params))
        .then(
          (value) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve(value);
            }
          },
          (error) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              reject(error);
            }
          },
        );
    });
  const r = await boundedRequest("ledger", {
    ledger_index: "validated",
    transactions: false,
  });
  const ledger = Number(r.ledger_index ?? r.ledger?.ledger_index),
    hash = String(r.ledger_hash ?? r.ledger?.ledger_hash ?? "").toUpperCase(),
    closeTime = (Number(r.ledger?.close_time) + 946684800) * 1000;
  if (
    r.validated !== true ||
    !Number.isSafeInteger(ledger) ||
    ledger < 1 ||
    !HASH.test(hash) ||
    !Number.isFinite(closeTime) ||
    now - closeTime > 180000 ||
    closeTime > now + 30000
  )
    throw Error(
      "No fresh validated-ledger anchor. Monitoring coverage is unknown.",
    );
  const anchor = { ledger, hash, closeTime };
  if (!cursor) {
    const info = await boundedRequest("account_info", {
      account: address,
      ledger_hash: hash,
    });
    if (
      info.validated !== true ||
      Number(info.ledger_index) !== ledger ||
      info.account_data?.Account !== address ||
      dropsValue(info.account_data?.Balance) === null
    )
      throw Error(
        "The watched account could not be established at the validated baseline. Monitoring is not armed.",
      );
    return { rows: [], cursor: { ledger }, complete: true, anchor };
  }
  if (cursor.ledger > ledger)
    throw Error(
      "Node ledger is behind the saved cursor; no monitoring progress was assumed.",
    );
  if (cursor.ledger === ledger && !cursor.pending)
    return { rows: [], cursor, complete: true, anchor };
  const target = cursor.pending?.to ?? ledger;
  if (target > ledger || target <= cursor.ledger)
    throw Error("Invalid saved monitoring scope.");
  let marker = cursor.pending?.marker;
  const seen = new Set(cursor.pending?.seen ?? []);
  const rows: Json[] = [];
  for (let page = 0; page < 4; page++) {
    const result = await boundedRequest("account_tx", {
      account: address,
      ledger_index_min: cursor.ledger + 1,
      ledger_index_max: target,
      forward: true,
      binary: false,
      limit: 200,
      ...(marker !== undefined ? { marker } : {}),
    });
    if (
      !Array.isArray(result.transactions) ||
      result.transactions.length > 200 ||
      result.validated !== true ||
      !Number.isSafeInteger(Number(result.ledger_index_min)) ||
      !Number.isSafeInteger(Number(result.ledger_index_max)) ||
      Number(result.ledger_index_min) > cursor.ledger + 1 ||
      Number(result.ledger_index_max) < target
    )
      throw Error("Account history coverage could not be established.");
    for (const row of result.transactions) {
      const n = Number(
        row.ledger_index ?? row.tx?.ledger_index ?? row.tx_json?.ledger_index,
      );
      if (
        row.validated !== true ||
        !Number.isSafeInteger(n) ||
        n <= cursor.ledger ||
        n > target
      )
        throw Error("History contained unvalidated or out-of-scope evidence.");
      rows.push(row);
    }
    if (result.marker === undefined || result.marker === null)
      return { rows, cursor: { ledger: target }, complete: true, anchor };
    const key = canonical(result.marker);
    if (
      !result.transactions.length ||
      key.length > 2048 ||
      seen.has(key) ||
      seen.size >= 200
    )
      throw Error(
        "History pagination stalled or exceeded its scope. Monitoring requires review.",
      );
    seen.add(key);
    marker = result.marker;
  }
  return {
    rows,
    cursor: {
      ledger: cursor.ledger,
      pending: { to: target, marker, seen: [...seen] },
    },
    complete: false,
    anchor,
  };
}
