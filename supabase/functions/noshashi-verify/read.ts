/**
 * Read verbs of the Compliance API — pure summaries of live ledger replies.
 *
 * Every function here takes what rippled returned and states it in the
 * API's own shape. Nothing is estimated or filled in: a field the ledger
 * did not return is null, not zero. The module has no imports so the
 * Vite test suite executes it unmodified (src/lib/desk/__tests__/
 * verify-read.test.ts) against the same inputs as the console's reads.
 */

// Account root flags. Same values as src/lib/xrpl/client.ts.
export const LSF_REQUIRE_AUTH = 0x00040000;
export const LSF_DISABLE_MASTER = 0x00100000;
export const LSF_NO_FREEZE = 0x00200000;
export const LSF_GLOBAL_FREEZE = 0x00400000;
export const LSF_DEFAULT_RIPPLE = 0x00800000;
export const LSF_DEPOSIT_AUTH = 0x01000000;
export const LSF_ALLOW_TRUSTLINE_CLAWBACK = 0x80000000;

const TX_HASH_RE = /^[0-9A-F]{64}$/;
/** Receipt digests are upper-case hex, as the console and this function print them. */
const DIGEST_RE = /^[0-9A-F]{64}$/;

/** Read verbs addressed by path, after the function name. */
export type ReadVerb =
  | { kind: "receipt"; digest: string }
  | { kind: "issuer" }
  | { kind: "address" }
  | { kind: "transaction" };

/** Route a path to a read verb, or null when it is not one. */
export function readVerbOf(verb: string): ReadVerb | "bad_digest" | null {
  if (verb === "analyze/issuer") return { kind: "issuer" };
  if (verb === "analyze/address") return { kind: "address" };
  if (verb === "analyze/transaction") return { kind: "transaction" };
  const receipt = /^receipts\/([^/]+)$/.exec(verb);
  if (receipt) {
    const digest = receipt[1].toUpperCase();
    return DIGEST_RE.test(digest) ? { kind: "receipt", digest } : "bad_digest";
  }
  return null;
}

/** A transaction hash, normalised to upper case, or null when it is not one. */
export function normaliseTxHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hash = value.trim().toUpperCase();
  return TX_HASH_RE.test(hash) ? hash : null;
}

export function decodeHexText(hex: string): string | null {
  if (!hex || !/^([0-9A-Fa-f]{2})+$/.test(hex)) return null;
  try {
    const bytes = Uint8Array.from(hex.match(/.{2}/g)!.map((pair) => parseInt(pair, 16)));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Transfer fee in basis points. TransferRate is billionths, where
 * 1_000_000_000 (or absent, or 0) means no fee.
 */
export function transferRateBps(rate: unknown): number {
  const r = Number(rate ?? 0);
  return r > 1_000_000_000 ? Math.round(((r - 1_000_000_000) / 1_000_000_000) * 10_000) : 0;
}

/** Issuer controls, from an account_info reply's account_data. */
export function summariseIssuer(address: string, accountData: Record<string, unknown>, ledgerIndex: number | null) {
  const flags = Number(accountData.Flags ?? 0) >>> 0;
  const has = (flag: number) => (flags & flag) >>> 0 !== 0;
  return {
    address,
    ledger_index: ledgerIndex,
    domain: decodeHexText(String(accountData.Domain ?? "")),
    controls: {
      require_auth: has(LSF_REQUIRE_AUTH),
      global_freeze: has(LSF_GLOBAL_FREEZE),
      no_freeze: has(LSF_NO_FREEZE),
      clawback_enabled: has(LSF_ALLOW_TRUSTLINE_CLAWBACK),
      default_ripple: has(LSF_DEFAULT_RIPPLE),
      deposit_auth: has(LSF_DEPOSIT_AUTH),
      master_key_disabled: has(LSF_DISABLE_MASTER),
      transfer_fee_bps: transferRateBps(accountData.TransferRate),
    },
    flags_raw: flags,
  };
}

/** Live reserve figures from server_info, or null when it was not readable. */
export function reservesOf(serverInfo: Record<string, unknown> | null): { base_xrp: number; increment_xrp: number } | null {
  const ledger = (serverInfo?.info as Record<string, unknown> | undefined)?.validated_ledger as Record<string, unknown> | undefined;
  const base = Number(ledger?.reserve_base_xrp);
  const inc = Number(ledger?.reserve_inc_xrp);
  return Number.isFinite(base) && Number.isFinite(inc) ? { base_xrp: base, increment_xrp: inc } : null;
}

/**
 * Account state. `accountData` is null for an address the ledger has
 * never seen funded (actNotFound); that is a fact, stated as such.
 */
export function summariseAddress(input: {
  address: string;
  accountData: Record<string, unknown> | null;
  ledgerIndex: number | null;
  credentials: Array<Record<string, unknown>>;
  reserves: { base_xrp: number; increment_xrp: number } | null;
}) {
  const { accountData, reserves } = input;
  if (!accountData) {
    return { address: input.address, ledger_index: input.ledgerIndex, funded: false, account: null, credentials: [] };
  }
  const balanceXrp = Number(accountData.Balance ?? 0) / 1_000_000;
  const ownerCount = Number(accountData.OwnerCount ?? 0);
  // To whole drops: 1 + 378 × 0.2 is 76.60000000000001 in floating point,
  // and a reserve is a ledger amount, not an approximation of one.
  const toDrops = (xrp: number) => Math.round(xrp * 1_000_000) / 1_000_000;
  const reserveXrp = reserves ? toDrops(reserves.base_xrp + ownerCount * reserves.increment_xrp) : null;
  return {
    address: input.address,
    ledger_index: input.ledgerIndex,
    funded: true,
    account: {
      balance_xrp: balanceXrp,
      sequence: Number(accountData.Sequence ?? 0),
      owner_count: ownerCount,
      reserve_xrp: reserveXrp,
      spendable_xrp: reserveXrp === null ? null : Math.max(0, toDrops(balanceXrp - reserveXrp)),
      domain: decodeHexText(String(accountData.Domain ?? "")),
      flags_raw: Number(accountData.Flags ?? 0) >>> 0,
    },
    credentials: input.credentials.map((c) => ({
      issuer: String(c.Issuer ?? ""),
      credential_type: decodeHexText(String(c.CredentialType ?? "")) ?? String(c.CredentialType ?? ""),
      // lsfAccepted (XLS-70). An unaccepted credential proves nothing yet.
      accepted: ((Number(c.Flags ?? 0) >>> 0) & 0x00010000) !== 0,
      // Ripple epoch seconds → ISO. Absent means no expiry.
      expires_at: c.Expiration === undefined ? null : new Date((Number(c.Expiration) + 946_684_800) * 1000).toISOString(),
    })),
  };
}

/** XRP drops string or issued-currency object → the API's amount shape. */
export function amountOf(value: unknown): { currency: string; value: string; issuer?: string } | null {
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const drops = BigInt(value);
    const whole = drops / 1_000_000n;
    const frac = (drops % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
    return { currency: "XRP", value: frac ? `${whole}.${frac}` : `${whole}` };
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.value === "string" && typeof v.currency === "string") {
      return { currency: v.currency, value: v.value, ...(typeof v.issuer === "string" ? { issuer: v.issuer } : {}) };
    }
  }
  return null;
}

/**
 * A transaction from a `tx` reply. Only a validated transaction has a
 * final result; an unvalidated one is reported as such, with its result
 * marked provisional rather than presented as the outcome.
 */
export function summariseTransaction(result: Record<string, unknown>) {
  // API v2 nests the transaction under tx_json; v1 puts it at the top.
  const tx = ((result.tx_json as Record<string, unknown> | undefined) ?? result) as Record<string, unknown>;
  const meta = (result.meta ?? {}) as Record<string, unknown>;
  const validated = result.validated === true;
  const engineResult = typeof meta.TransactionResult === "string" ? meta.TransactionResult : null;
  const delivered = meta.delivered_amount ?? meta.DeliveredAmount;
  return {
    hash: String(result.hash ?? tx.hash ?? ""),
    validated,
    ledger_index: result.ledger_index === undefined ? null : Number(result.ledger_index),
    // rippled sends close_time_iso; Clio (which the public s1/s2 now are)
    // sends only `date`, in seconds since the Ripple epoch, 2000-01-01.
    closed_at:
      typeof result.close_time_iso === "string"
        ? result.close_time_iso
        : typeof (result.date ?? tx.date) === "number"
          ? new Date((Number(result.date ?? tx.date) + 946_684_800) * 1000).toISOString()
          : null,
    type: String(tx.TransactionType ?? ""),
    account: String(tx.Account ?? ""),
    destination: typeof tx.Destination === "string" ? tx.Destination : null,
    destination_tag: tx.DestinationTag === undefined ? null : Number(tx.DestinationTag),
    result: engineResult,
    result_final: validated && engineResult !== null,
    succeeded: validated ? engineResult === "tesSUCCESS" : null,
    // "unavailable" is rippled's own word for a partial payment before
    // 2014-01-20, when delivered_amount was not recorded.
    delivered_amount: delivered === "unavailable" ? "unavailable" : amountOf(delivered),
    fee_xrp: amountOf(tx.Fee)?.value ?? null,
    sequence: tx.Sequence === undefined ? null : Number(tx.Sequence),
  };
}
