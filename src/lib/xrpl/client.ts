import { dropsToXrp, rippleTimeToDate } from "@/lib/format";
import { XrplError, xrplLink } from "./link";
import type {
  AmmPool,
  BookLevel,
  IssuerObligations,
  OrderBook,
  AccountInfo,
  CredentialRecord,
  IssuerPosture,
  LedgerInfo,
  LedgerStreamMessage,
  ServerInfo,
  TrustLine,
  WalletTransaction,
} from "./types";

/**
 * XRPL mainnet reads.
 *
 * Every command goes over the shared WebSocket link (see ./link) rather
 * than HTTP: the public rippled endpoints send no CORS headers, so a
 * webview cannot POST to them at all. There is no testnet path here by
 * design.
 */

export { XrplError };

/** Round-trip latency of the most recent successful command. */
export function getLastLatencyMs(): number {
  return xrplLink.getLatencyMs();
}

/**
 * Send one command to mainnet.
 *
 * IMPORTANT: a ledger-level error REJECTS — it does not come back on the
 * result. There is no `res.error` to test, so this is wrong and silently
 * dead:
 *
 *     const res = await rpc("tx", { transaction: hash });
 *     if (res.error) { ... }        // never runs
 *
 * Catch instead, and read the rippled error code off the XrplError:
 *
 *     try { res = await rpc(...) }
 *     catch (e) { if (e instanceof XrplError && e.code === "txnNotFound") ... }
 *
 * This matters most inside a pagination walk, where letting the rejection
 * escape discards every page already gathered. Catch per page and return the
 * partial result flagged as partial.
 */
export async function rpc(
  command: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, any>> {
  return xrplLink.request(command, params);
}

export async function fetchLedger(): Promise<LedgerInfo> {
  // The ledger object carries no fee; the `fee` command is authoritative
  // and also reports what the open ledger is currently charging.
  const [result, fee] = await Promise.all([
    rpc("ledger", { ledger_index: "validated", transactions: false, expand: false }),
    rpc("fee").catch(() => ({}) as Record<string, any>),
  ]);
  const ledger = result.ledger ?? {};
  return {
    ledgerIndex: Number(ledger.ledger_index ?? result.ledger_index ?? 0),
    ledgerHash: String(ledger.ledger_hash ?? ""),
    closeTime: rippleTimeToDate(Number(ledger.close_time ?? 0)).toLocaleString(),
    validated: Boolean(result.validated ?? false),
    baseFeeXrp: dropsToXrp(Number(fee.drops?.base_fee ?? 10)),
    openLedgerFeeXrp: dropsToXrp(Number(fee.drops?.open_ledger_fee ?? 10)),
    queueSize: Number(fee.current_queue_size ?? 0),
    txnCount: Number(ledger.transactions?.length ?? 0),
  };
}

function decodeHexDomain(hex: string): string | undefined {
  try {
    if (!hex) return undefined;
    const bytes = Uint8Array.from(
      hex.match(/.{2}/g)?.map((pair) => parseInt(pair, 16)) ?? []
    );
    const text = new TextDecoder().decode(bytes).trim();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchAccount(address: string): Promise<AccountInfo> {
  try {
    const result = await rpc("account_info", {
      account: address,
      ledger_index: "validated",
    });
    const data = result.account_data ?? {};
    return {
      address,
      balanceXrp: (Number(data.Balance ?? 0) / 1_000_000).toFixed(2),
      sequence: Number(data.Sequence ?? 0),
      ownerCount: Number(data.OwnerCount ?? 0),
      domain: decodeHexDomain(String(data.Domain ?? "")),
    };
  } catch (error) {
    // actNotFound is a legitimate state: a well-formed address that has
    // never been funded. The console shows it rather than erroring out.
    if (error instanceof XrplError && error.code === "actNotFound") {
      return {
        address,
        balanceXrp: "0.00",
        sequence: 0,
        ownerCount: 0,
        unfunded: true,
      };
    }
    // The base58 checksum is only verifiable by the ledger, so this is
    // where a typo'd address is actually caught.
    if (error instanceof XrplError && error.code === "actMalformed") {
      throw new XrplError(
        "Address failed its base58 checksum — check for a mistyped character.",
        "actMalformed"
      );
    }
    throw error;
  }
}

export async function fetchWalletCredentials(
  address: string
): Promise<CredentialRecord[]> {
  try {
    const result = await rpc("account_objects", {
      account: address,
      ledger_index: "validated",
      type: "credential",
      limit: 100,
    });
    const records = (result.account_objects ?? []) as Array<Record<string, any>>;
    return records.map((record) => ({
      subject: String(record.Subject ?? ""),
      issuer: String(record.Issuer ?? ""),
      credentialType:
        decodeHexDomain(String(record.CredentialType ?? "")) ??
        String(record.CredentialType ?? "UNKNOWN"),
      // XLS-70 marks acceptance with the lsfAccepted flag (0x00010000).
      accepted: (Number(record.Flags ?? 0) & 0x00010000) !== 0,
      revoked: Boolean(record.Revoked ?? false),
      uri: record.URI ? decodeHexDomain(String(record.URI)) : undefined,
      expiration: record.Expiration ? Number(record.Expiration) : undefined,
    }));
  } catch (error) {
    // Nodes that have not enabled the Credentials amendment reject the
    // object type outright; an empty registry is the honest answer.
    if (error instanceof XrplError) return [];
    throw error;
  }
}

/** Recent wallet activity, shaped for the audit trail. */
export async function fetchWalletTransactions(
  address: string,
  limit = 40
): Promise<WalletTransaction[]> {
  try {
    const result = await rpc("account_tx", {
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: false,
      forward: false,
      limit,
    });

    const rows = (result.transactions ?? []) as Array<Record<string, any>>;
    return rows.map((row) => {
      const tx = row.tx ?? row.tx_json ?? {};
      const meta = row.meta ?? {};
      const delivered = meta.delivered_amount ?? meta.DeliveredAmount;
      const amountXrp =
        typeof delivered === "string" ? Number(dropsToXrp(delivered)) : undefined;
      const sender = String(tx.Account ?? "");
      const destination = String(tx.Destination ?? "");
      const direction: WalletTransaction["direction"] =
        sender === address
          ? "out"
          : destination === address
            ? "in"
            : "cross";
      const date = rippleTimeToDate(Number(tx.date ?? 0));

      return {
        hash: String(tx.hash ?? row.hash ?? ""),
        transactionType: String(tx.TransactionType ?? "UNKNOWN"),
        result: String(meta.TransactionResult ?? "—"),
        ledgerIndex: Number(row.ledger_index ?? tx.ledger_index ?? 0),
        date: date.toLocaleString(),
        timestamp: date.getTime(),
        direction,
        counterparty:
          direction === "out" ? destination || "—" : sender || "—",
        amountXrp,
        feeXrp: dropsToXrp(String(tx.Fee ?? "0")),
      };
    });
  } catch (error) {
    if (error instanceof XrplError && error.code === "actNotFound") return [];
    throw error;
  }
}

export async function fetchServerInfo(): Promise<ServerInfo> {
  const result = await rpc("server_info");
  const info = result.info ?? {};
  const amendments = (info.amendment_blocked ? [] : info.amendments ?? []) as Array<
    Record<string, any> | string
  >;
  return {
    pubkeyNode: String(info.pubkey_node ?? ""),
    serverState: String(info.server_state ?? "unknown"),
    completeLedgers: String(info.complete_ledgers ?? ""),
    uptimeSeconds: Number(info.uptime ?? 0),
    version: String(info.build_version ?? info.version ?? ""),
    networkId: Number(info.network_id ?? 0),
    amendedFeatures: amendments.map((entry) =>
      typeof entry === "string" ? entry : String(entry.Name ?? entry.Amendment ?? "")
    ),
    loadFactor: Number(info.load_factor ?? 1),
    peers: Number(info.peers ?? 0),
  };
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

export function shortAddress(address: string): string {
  if (!address) return "—";
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Classic base58 address shape. Cheap client-side guard before an RPC. */
export function isValidAddress(address: string): boolean {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address.trim());
}

/**
 * Live mainnet subscription. The socket itself is owned by the link,
 * which handles reconnection and endpoint rotation; this only maps raw
 * frames onto the console's message types.
 */
export function subscribeLedger(
  onMessage: (message: LedgerStreamMessage) => void,
  onStatus: (connected: boolean) => void
): () => void {
  const offStream = xrplLink.onStream((frame) => {
    if (frame.type === "ledgerClosed") {
      onMessage({
        type: "ledgerClosed",
        ledgerIndex: Number(frame.ledger_index ?? 0),
        ledgerHash: String(frame.ledger_hash ?? ""),
        txnCount: Number(frame.txn_count ?? 0),
        baseFeeXrp: dropsToXrp(Number(frame.fee_base ?? 10)),
        reserveBaseXrp: dropsToXrp(Number(frame.reserve_base ?? 0)),
        closeTime: rippleTimeToDate(Number(frame.ledger_time ?? 0)).toLocaleTimeString(
          "en-US",
          { hour12: false }
        ),
      });
      return;
    }

    if (frame.type === "transaction") {
      const tx = frame.tx_json ?? frame.transaction ?? frame.tx ?? {};
      const delivered = frame.meta?.delivered_amount;
      onMessage({
        type: "transaction",
        ledgerIndex: Number(frame.ledger_index ?? 0),
        account: String(tx.Account ?? ""),
        transactionType: String(tx.TransactionType ?? ""),
        result: String(frame.meta?.TransactionResult ?? frame.engine_result ?? ""),
        hash: String(frame.hash ?? tx.hash ?? ""),
        amountXrp:
          typeof delivered === "string" ? Number(dropsToXrp(delivered)) : undefined,
      });
    }
  });

  const offStatus = xrplLink.onStatus(onStatus);

  return () => {
    offStream();
    offStatus();
  };
}

/* ------------------------------------------------------------------ */
/* Issued-currency risk: trust lines and issuer posture               */
/* ------------------------------------------------------------------ */

/**
 * XRPL account flags. These decide whether an issued balance is an asset
 * or a liability, and no wallet surfaces them.
 */
const LSF_REQUIRE_AUTH = 0x00040000;
const LSF_GLOBAL_FREEZE = 0x00400000;
const LSF_NO_FREEZE = 0x00200000;
const LSF_DISABLE_MASTER = 0x00100000;
/*
 * XLS-77 deep freeze lives on the trust line, not the account, and which
 * of lsfHighDeepFreeze / lsfLowDeepFreeze applies depends on how your
 * address sorts against the issuer's. account_lines resolves that for us
 * and reports `deep_freeze` / `deep_freeze_peer` directly, so there is no
 * flag arithmetic to do here.
 */

/** Every issued-currency position the account holds. */
export async function fetchTrustLines(address: string): Promise<TrustLine[]> {
  try {
    const result = await rpc("account_lines", {
      account: address,
      ledger_index: "validated",
      limit: 200,
    });
    const lines = (result.lines ?? []) as Array<Record<string, any>>;
    return lines.map((line) => ({
      issuer: String(line.account ?? ""),
      currency: String(line.currency ?? ""),
      balance: Number(line.balance ?? 0),
      limit: Number(line.limit ?? 0),
      frozen: Boolean(line.freeze),
      frozenByIssuer: Boolean(line.freeze_peer),
      // XLS-77. account_lines reports these directly once DeepFreeze is
      // enabled; on a network without it they are simply absent.
      deepFrozen: Boolean(line.deep_freeze),
      deepFrozenByIssuer: Boolean(line.deep_freeze_peer),
      noRipple: Boolean(line.no_ripple),
      authorized: Boolean(line.peer_authorized ?? line.authorized ?? false),
      requiresAuth: false, // resolved from the issuer's own flags below
    }));
  } catch (error) {
    if (error instanceof XrplError && error.code === "actNotFound") return [];
    throw error;
  }
}

/** Read one issuer's flags — what it is permitted to do to your balance. */
export async function fetchIssuerPosture(issuer: string): Promise<IssuerPosture> {
  try {
    const result = await rpc("account_info", {
      account: issuer,
      ledger_index: "validated",
    });
    const data = result.account_data ?? {};
    const flags = Number(data.Flags ?? 0);
    // TransferRate is billionths; 1_000_000_000 means no fee.
    const rate = Number(data.TransferRate ?? 0);
    const transferRateBps =
      rate > 1_000_000_000 ? Math.round(((rate - 1_000_000_000) / 1_000_000_000) * 10_000) : 0;

    return {
      address: issuer,
      domain: decodeHexDomain(String(data.Domain ?? "")),
      noFreeze: (flags & LSF_NO_FREEZE) !== 0,
      globalFreeze: (flags & LSF_GLOBAL_FREEZE) !== 0,
      requireAuth: (flags & LSF_REQUIRE_AUTH) !== 0,
      masterDisabled: (flags & LSF_DISABLE_MASTER) !== 0,
      transferRateBps,
    };
  } catch (error) {
    return {
      address: issuer,
      noFreeze: false,
      globalFreeze: false,
      requireAuth: false,
      masterDisabled: false,
      transferRateBps: 0,
      unreadable: error instanceof Error ? error.message : "Unreadable",
    };
  }
}

/* ── Market intelligence ─────────────────────────────────────────── */

/**
 * XRPL exposes amounts two ways: XRP as a drops string, issued currencies
 * as an object. Every market read has to normalise both before any
 * arithmetic, or the numbers silently differ by 10^6.
 */
function amountToNumber(value: unknown): number {
  if (typeof value === "string") return Number(dropsToXrp(value));
  if (value && typeof value === "object") {
    return Number((value as { value?: string }).value ?? 0);
  }
  return 0;
}

/**
 * Establish a reference price the book can actually be measured against.
 *
 * Neither the touch nor a depth percentile survives contact with the real
 * XRPL DEX:
 *
 *  - The touch is routinely poisoned. GateHub USD/XRP was observed with a
 *    best bid of 19.90 against a real market of 0.68 — one stale offer at
 *    29x, defining the mid for everything downstream.
 *  - A depth percentile is worse. Bid sides carry enormous quantity at
 *    absurd lowball prices (12.7M USD of "depth" bid at 0.001), so the
 *    tenth percentile of depth lands in the junk rather than the market.
 *
 * What works is the tightest *uncrossed* pair: the lowest ask, and the
 * highest bid strictly below it. An outlier above the ask is excluded by
 * construction, and a healthy book is unaffected because its touch is
 * already uncrossed.
 */
function uncrossedTouch(
  bids: BookLevel[],
  asks: BookLevel[]
): { bid?: number; ask?: number } {
  const ask = asks[0]?.price;
  if (ask === undefined) return { bid: bids[0]?.price, ask: undefined };
  // bids are sorted best-first, so the first one below the ask is the
  // highest credible bid.
  for (const level of bids) {
    if (level.price < ask) return { bid: level.price, ask };
  }
  return { bid: undefined, ask };
}

/**
 * Depth reachable without moving the price more than `band` from mid.
 *
 * This is the number that answers the exit question. Total book depth does
 * not: summing every resting offer counts bids at a thousandth of the
 * market as though they were an exit, which is how a position gets marked
 * liquid when nobody would pay for it.
 */
function bandedDepth(
  levels: BookLevel[],
  mid: number | undefined,
  band: number,
  side: "bid" | "ask"
): number {
  if (mid === undefined || mid <= 0) return 0;
  const floor = side === "bid" ? mid * (1 - band) : 0;
  const ceiling = side === "ask" ? mid * (1 + band) : Infinity;
  let total = 0;
  for (const level of levels) {
    if (side === "bid" && level.price < floor) break; // sorted descending
    if (side === "ask" && level.price > ceiling) break; // sorted ascending
    total += level.quantity;
  }
  return total;
}

/** How far from mid an offer can sit and still count as an exit. */
export const DEPTH_BAND = 0.1;

/** Fold raw offers into price levels with a running cumulative depth. */
function toLevels(
  offers: Array<Record<string, any>>,
  invert: boolean
): BookLevel[] {
  const levels = new Map<number, number>();

  for (const offer of offers) {
    const gets = amountToNumber(offer.TakerGets);
    const pays = amountToNumber(offer.TakerPays);
    if (gets <= 0 || pays <= 0) continue;

    // `quality` is pays/gets. Which of those is "price" depends on which
    // side of the pair we asked for, hence `invert`.
    const price = invert ? gets / pays : pays / gets;
    const quantity = invert ? pays : gets;
    if (!Number.isFinite(price) || price <= 0) continue;

    levels.set(price, (levels.get(price) ?? 0) + quantity);
  }

  const sorted = [...levels.entries()].sort((a, b) =>
    invert ? b[0] - a[0] : a[0] - b[0]
  );

  let running = 0;
  return sorted.map(([price, quantity]) => {
    running += quantity;
    return { price, quantity, cumulative: running };
  });
}

/**
 * Read both sides of a DEX order book for XRP against one issued currency.
 *
 * This is the market half of the product. A position's freeze rights say
 * whether an issuer *may* immobilise it; the book says whether anyone
 * would buy it if they didn't. Both questions are answered from the same
 * validated ledger, which is the whole reason they can be shown together.
 */
export async function fetchOrderBook(
  currency: string,
  issuer: string,
  limit = 60
): Promise<OrderBook> {
  const issued = { currency, issuer };

  // Bids: offers paying XRP to get the issued asset.
  // Asks: offers paying the issued asset to get XRP.
  const [bidRes, askRes] = await Promise.all([
    rpc("book_offers", {
      taker_gets: { currency: "XRP" },
      taker_pays: issued,
      ledger_index: "validated",
      limit,
    }),
    rpc("book_offers", {
      taker_gets: issued,
      taker_pays: { currency: "XRP" },
      ledger_index: "validated",
      limit,
    }),
  ]);

  const bids = toLevels((bidRes.offers ?? []) as Array<Record<string, any>>, true);
  const asks = toLevels((askRes.offers ?? []) as Array<Record<string, any>>, false);

  const touchBid = bids[0]?.price;
  const touchAsk = asks[0]?.price;

  // Reference: the tightest uncrossed pair, immune to a stale offer.
  const { bid: refBid, ask: refAsk } = uncrossedTouch(bids, asks);
  const mid =
    refBid !== undefined && refAsk !== undefined ? (refBid + refAsk) / 2 : undefined;
  const spread =
    refBid !== undefined && refAsk !== undefined ? refAsk - refBid : undefined;

  // A book whose touch is crossed is reporting something the operator
  // should be told about rather than have smoothed away.
  const crossed =
    touchBid !== undefined && touchAsk !== undefined && touchBid > touchAsk;

  return {
    base: "XRP",
    quote: currency,
    issuer,
    bids,
    asks,
    bestBid: touchBid,
    bestAsk: touchAsk,
    referenceBid: refBid,
    referenceAsk: refAsk,
    crossed,
    mid,
    spread,
    spreadPct: spread !== undefined && mid ? spread / mid : undefined,
    depthBidBanded: bandedDepth(bids, mid, DEPTH_BAND, "bid"),
    depthAskBanded: bandedDepth(asks, mid, DEPTH_BAND, "ask"),
    ledgerIndex: Number(bidRes.ledger_index ?? askRes.ledger_index ?? 0),
    empty: bids.length === 0 && asks.length === 0,
  };
}

/**
 * Read the XLS-30 AMM pool for XRP against one issued currency.
 *
 * `asset2_frozen` arrives in the same response as the pool depth, which is
 * the single most useful fact this product surfaces: liquidity and the
 * right to immobilise it, from one read. A pool that is deep but frozen is
 * not an exit.
 */
export async function fetchAmmPool(
  currency: string,
  issuer: string
): Promise<AmmPool> {
  try {
    const result = await rpc("amm_info", {
      asset: { currency: "XRP" },
      asset2: { currency, issuer },
      ledger_index: "validated",
    });
    const amm = result.amm ?? {};
    const amountXrp = amountToNumber(amm.amount);
    const amount2 = amountToNumber(amm.amount2);

    return {
      exists: true,
      account: String(amm.account ?? ""),
      amountXrp,
      amount2,
      currency2: currency,
      issuer2: issuer,
      // TradingFee is in units of 1/100,000 — 1,000 is 1%, i.e. 100 bps.
      tradingFeeBps: Math.round(Number(amm.trading_fee ?? 0) / 10),
      asset2Frozen: Boolean(amm.asset2_frozen),
      impliedPrice: amountXrp > 0 ? amount2 / amountXrp : undefined,
    };
  } catch (error) {
    // No pool for this pair is an ordinary answer, not a failure.
    if (error instanceof XrplError) return { exists: false, unreadable: error.message };
    throw error;
  }
}

/**
 * What an issuer actually has outstanding.
 *
 * Concentration is meaningless without a denominator: holding 40,000 of
 * something is a different fact when 50,000 exist than when 8,000,000 do.
 */
export async function fetchIssuerObligations(
  issuer: string
): Promise<IssuerObligations> {
  try {
    const result = await rpc("gateway_balances", {
      account: issuer,
      ledger_index: "validated",
    });
    const raw = (result.obligations ?? {}) as Record<string, string>;
    const obligations: Record<string, number> = {};
    for (const [currency, value] of Object.entries(raw)) {
      const n = Number(value);
      if (Number.isFinite(n)) obligations[currency] = n;
    }
    return {
      issuer,
      obligations,
      ledgerIndex: Number(result.ledger_index ?? 0),
    };
  } catch (error) {
    return {
      issuer,
      obligations: {},
      ledgerIndex: 0,
      unreadable: error instanceof Error ? error.message : "unreadable",
    };
  }
}
