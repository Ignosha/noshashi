/**
 * The homepage's live ledger read: what the "Network" and "Intelligence
 * with evidence" sections show, computed in the visitor's browser from
 * validated XRP Ledger state and nothing else.
 *
 * Input is the public `ledger` command with transactions expanded, from
 * the same three servers the site's CSP allows (src/lib/garden/
 * ledgerStream.ts). Output is the graph that is drawn, the signals that
 * are measured, an assessment produced by fixed, published thresholds,
 * and whether a second server agrees on the ledger's hash.
 *
 * Nothing here is a model or a guess. Every number on the page traces to
 * a count over the transactions of named ledgers, and the page names
 * them. The assessment is a rule, stated next to its result, so a reader
 * can redo it by hand. The AI assistant in the desktop app explains
 * results like these; it does not produce them, and this file does not
 * pretend otherwise.
 */

/** Seconds between the Unix epoch and the Ripple epoch (2000-01-01). */
export const RIPPLE_EPOCH = 946_684_800;

export type LedgerTx = {
  type: string;
  account: string;
  destination: string | null;
  /** The engine result, e.g. tesSUCCESS or tecPATH_DRY. */
  result: string;
};

export type ReadLedger = {
  index: number;
  hash: string;
  /** Unix seconds. */
  closeTime: number;
  /** Unix seconds, or null when the reply did not carry it. */
  parentCloseTime: number | null;
  txs: LedgerTx[];
};

const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HASH = /^[0-9A-F]{64}$/i;

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** One expanded transaction from a `ledger` reply, API v1 or v2 shape. */
export function parseTx(raw: unknown): LedgerTx | null {
  const outer = record(raw);
  if (!outer) return null;
  // API v2 nests the transaction in tx_json and the metadata in meta;
  // v1 puts the fields at the top level with metaData.
  const tx = record(outer.tx_json) ?? outer;
  const meta = record(outer.meta) ?? record(outer.metaData) ?? record(tx.metaData) ?? record(tx.meta);
  const type = typeof tx.TransactionType === "string" ? tx.TransactionType : null;
  const account = typeof tx.Account === "string" && ADDRESS.test(tx.Account) ? tx.Account : null;
  if (!type || !account) return null;
  const destination = typeof tx.Destination === "string" && ADDRESS.test(tx.Destination) ? tx.Destination : null;
  const result = typeof meta?.TransactionResult === "string" ? meta.TransactionResult : "unknown";
  return { type, account, destination, result };
}

/**
 * A `ledger` reply with transactions expanded, or null. Only a ledger the
 * server marks validated is accepted: a closed but unvalidated ledger can
 * still be replaced, and nothing on the page is read from one.
 */
export function parseLedgerReply(raw: unknown): ReadLedger | null {
  const reply = record(raw);
  const result = record(reply?.result) ?? reply;
  if (!result || result.validated !== true) return null;
  const ledger = record(result.ledger);
  if (!ledger) return null;
  const index = Number(result.ledger_index ?? ledger.ledger_index);
  const hash = String(result.ledger_hash ?? ledger.ledger_hash ?? "");
  const close = Number(ledger.close_time);
  const parent = Number(ledger.parent_close_time);
  if (!Number.isInteger(index) || index <= 0 || !HASH.test(hash) || !Number.isFinite(close)) return null;
  const list = Array.isArray(ledger.transactions) ? ledger.transactions : [];
  // Hashes only (an unexpanded reply) carry nothing to read.
  if (list.some((t) => typeof t === "string")) return null;
  const txs = list.map(parseTx).filter((t): t is LedgerTx => t !== null);
  return {
    index,
    hash: hash.toUpperCase(),
    closeTime: close + RIPPLE_EPOCH,
    parentCloseTime: Number.isFinite(parent) ? parent + RIPPLE_EPOCH : null,
    txs,
  };
}

/** Keep the newest `size` ledgers, one per index, oldest first. */
export function pushWindow(window: ReadLedger[], next: ReadLedger, size = 5): ReadLedger[] {
  const byIndex = new Map(window.map((l) => [l.index, l]));
  byIndex.set(next.index, next);
  return Array.from(byIndex.values())
    .sort((a, b) => a.index - b.index)
    .slice(-size);
}

/* ── Graph ──────────────────────────────────────────────────────────── */

/** Order-book activity has no counterparty field; it meets at one hub. */
export const DEX_HUB = "DEX";
/** AMM transactions meet at another. */
export const AMM_HUB = "AMM";

const DEX_TYPES = new Set(["OfferCreate", "OfferCancel"]);

export type GraphNode = {
  id: string;
  kind: "account" | "hub";
  /** Transactions the node took part in. */
  weight: number;
  /** Index into Graph.clusters, or -1 when the node is in no cluster. */
  cluster: number;
};

export type GraphEdge = { a: string; b: string; weight: number; types: string[] };

export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Connected groups of three or more nodes, largest first; node ids. */
  clusters: string[][];
};

function hubFor(type: string): string | null {
  if (DEX_TYPES.has(type)) return DEX_HUB;
  if (type.startsWith("AMM")) return AMM_HUB;
  return null;
}

/**
 * Entities and relationships in a window of ledgers. An account is a
 * node; a transaction with a destination joins its sender and receiver;
 * order-book and AMM transactions join their account to the matching
 * hub. A transaction with neither (AccountSet, TrustSet without a
 * destination, and so on) still makes its account a node.
 */
export function buildGraph(ledgers: ReadLedger[]): Graph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const touch = (id: string, kind: GraphNode["kind"]) => {
    const n = nodes.get(id) ?? { id, kind, weight: 0, cluster: -1 };
    n.weight += 1;
    nodes.set(id, n);
  };
  const link = (a: string, b: string, type: string) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const e = edges.get(key) ?? { a: a < b ? a : b, b: a < b ? b : a, weight: 0, types: [] };
    e.weight += 1;
    if (!e.types.includes(type)) e.types.push(type);
    edges.set(key, e);
  };

  for (const ledger of ledgers) {
    for (const tx of ledger.txs) {
      touch(tx.account, "account");
      const other = tx.destination ?? hubFor(tx.type);
      if (!other) continue;
      touch(other, other === DEX_HUB || other === AMM_HUB ? "hub" : "account");
      link(tx.account, other, tx.type);
    }
  }

  // Connected components by union-find.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const id of nodes.keys()) parent.set(id, id);
  for (const e of edges.values()) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<string, string[]>();
  for (const id of nodes.keys()) {
    const r = find(id);
    const g = groups.get(r) ?? [];
    g.push(id);
    groups.set(r, g);
  }
  const clusters = Array.from(groups.values())
    .filter((g) => g.length >= 3)
    .sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));
  clusters.forEach((g, i) => g.forEach((id) => (nodes.get(id)!.cluster = i)));

  return {
    nodes: Array.from(nodes.values()).sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1)),
    edges: Array.from(edges.values()),
    clusters,
  };
}

/* ── Signals and assessment ─────────────────────────────────────────── */

export type SignalId = "counterparty" | "sender" | "failed" | "orderbook" | "velocity";

export type Signal = {
  id: SignalId;
  label: string;
  /** The measured value: a share 0..1, or transactions per second for velocity. */
  value: number | null;
  /** Shown as text next to the value. */
  display: string;
  /** The threshold the rule uses, or null for a signal that is only reported. */
  threshold: number | null;
  /** Value above threshold, as a share of the threshold; 0 when not above. */
  excess: number;
  /** What the value counts, in words, for the evidence line. */
  basis: string;
  /** The account the signal is about, when there is one. */
  subject: string | null;
};

/**
 * The published rules. These are fixed demonstration thresholds for the
 * public homepage, stated next to every result; the desktop app's policy
 * engine uses each institution's own versioned policy instead.
 */
export const RULES = {
  /** Smallest number of transactions in the window before any rule runs. */
  minTransactions: 40,
  /** Smallest number of payments before the counterparty rule runs. */
  minPayments: 10,
  counterparty: 0.25,
  sender: 0.25,
  failed: 0.1,
} as const;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function top(counts: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  for (const [k, v] of counts) if (!best || v > best[1] || (v === best[1] && k < best[0])) best = [k, v];
  return best;
}

export function measureSignals(ledgers: ReadLedger[]): Signal[] {
  const txs = ledgers.flatMap((l) => l.txs);
  const total = txs.length;
  const payments = txs.filter((t) => t.type === "Payment" && t.destination);
  const destCounts = new Map<string, number>();
  for (const p of payments) destCounts.set(p.destination!, (destCounts.get(p.destination!) ?? 0) + 1);
  const senderCounts = new Map<string, number>();
  for (const t of txs) senderCounts.set(t.account, (senderCounts.get(t.account) ?? 0) + 1);
  const failed = txs.filter((t) => t.result !== "tesSUCCESS").length;
  const book = txs.filter((t) => DEX_TYPES.has(t.type)).length;

  const signals: Signal[] = [];
  const share = (n: number, d: number) => (d > 0 ? n / d : null);
  const excess = (v: number | null, t: number) => (v !== null && v >= t ? (v - t) / t : 0);

  const dest = top(destCounts);
  const cp = payments.length >= RULES.minPayments && dest ? share(dest[1], payments.length) : null;
  signals.push({
    id: "counterparty",
    label: "Counterparty concentration",
    value: cp,
    display: cp === null ? "too few payments" : pct(cp),
    threshold: RULES.counterparty,
    excess: excess(cp, RULES.counterparty),
    basis: dest ? `${dest[1]} of ${payments.length} payments went to one destination` : `${payments.length} payments`,
    subject: cp === null ? null : dest![0],
  });

  const sender = top(senderCounts);
  const sv = total > 0 && sender ? share(sender[1], total) : null;
  signals.push({
    id: "sender",
    label: "Sender concentration",
    value: sv,
    display: sv === null ? "no transactions" : pct(sv),
    threshold: RULES.sender,
    excess: excess(sv, RULES.sender),
    basis: sender ? `${sender[1]} of ${total} transactions were sent by one account` : "0 transactions",
    subject: sender ? sender[0] : null,
  });

  const fv = share(failed, total);
  signals.push({
    id: "failed",
    label: "Failed transactions",
    value: fv,
    display: fv === null ? "no transactions" : pct(fv),
    threshold: RULES.failed,
    excess: excess(fv, RULES.failed),
    basis: `${failed} of ${total} transactions did not succeed (result other than tesSUCCESS)`,
    subject: null,
  });

  const bv = share(book, total);
  signals.push({
    id: "orderbook",
    label: "Order-book share",
    value: bv,
    display: bv === null ? "no transactions" : pct(bv),
    threshold: null,
    excess: 0,
    basis: `${book} of ${total} transactions created or cancelled DEX offers`,
    subject: null,
  });

  const first = ledgers[0];
  const last = ledgers[ledgers.length - 1];
  const start = first?.parentCloseTime ?? null;
  const span = first && last && start !== null ? last.closeTime - start : 0;
  const vel = span > 0 ? total / span : null;
  signals.push({
    id: "velocity",
    label: "Transaction velocity",
    value: vel,
    display: vel === null ? "not measurable" : `${vel.toFixed(1)} tx/s`,
    threshold: null,
    excess: 0,
    basis: span > 0 ? `${total} transactions over ${span} s of ledger close time` : "close times unavailable",
    subject: null,
  });

  return signals;
}

export type AssessmentState = "elevated" | "normal" | "insufficient";

export type Assessment = {
  state: AssessmentState;
  headline: string;
  /** Signals above their threshold, largest excess first. */
  contributing: Signal[];
  rule: string;
};

export function assess(ledgers: ReadLedger[], signals: Signal[]): Assessment {
  const total = ledgers.reduce((n, l) => n + l.txs.length, 0);
  const rule =
    `A signal is elevated when it reaches its threshold: counterparty ${pct(RULES.counterparty)} of payments ` +
    `(at least ${RULES.minPayments}), sender ${pct(RULES.sender)} of transactions, failed ${pct(RULES.failed)}. ` +
    `Rules run on ${RULES.minTransactions} or more transactions.`;
  if (total < RULES.minTransactions) {
    return {
      state: "insufficient",
      headline: `Not enough activity yet: ${total} of ${RULES.minTransactions} transactions needed`,
      contributing: [],
      rule,
    };
  }
  const contributing = signals.filter((s) => s.excess > 0).sort((a, b) => b.excess - a.excess);
  if (!contributing.length) {
    return { state: "normal", headline: "No signal at or above its threshold", contributing, rule };
  }
  const names = contributing.map((s) => s.label.toLowerCase());
  const headline =
    names.length === 1
      ? `Elevated ${names[0]}`
      : `Elevated ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return { state: "elevated", headline, contributing, rule };
}

/* ── Source agreement ───────────────────────────────────────────────── */

export type Agreement =
  | { state: "agree"; index: number; hash: string }
  | { state: "disagree"; index: number; hash: string; other: string }
  | { state: "pending"; index: number; reason: string };

/**
 * Compare a ledger read from the primary server with the same index read
 * from a second, independent one. A second server that has not caught up
 * (lgrNotFound) or did not answer is "pending", never "agree": agreement
 * is only claimed when two hashes were actually compared.
 */
export function compareSources(primary: ReadLedger, secondReply: unknown): Agreement {
  const reply = record(secondReply);
  const result = record(reply?.result) ?? null;
  if (!result) {
    const err = typeof reply?.error === "string" ? reply.error : "no reply";
    return { state: "pending", index: primary.index, reason: err };
  }
  if (result.validated !== true) return { state: "pending", index: primary.index, reason: "not validated there yet" };
  const ledger = record(result.ledger);
  const other = String(result.ledger_hash ?? ledger?.ledger_hash ?? "").toUpperCase();
  if (!HASH.test(other)) return { state: "pending", index: primary.index, reason: "no hash in reply" };
  return other === primary.hash
    ? { state: "agree", index: primary.index, hash: primary.hash }
    : { state: "disagree", index: primary.index, hash: primary.hash, other };
}

/* ── Read-out ───────────────────────────────────────────────────────── */

export type Reading = {
  ledgers: { first: number; last: number; count: number };
  closeTime: number;
  counts: { transactions: number; entities: number; relationships: number; clusters: number; signals: number };
  graph: Graph;
  signals: Signal[];
  assessment: Assessment;
};

export function read(ledgers: ReadLedger[]): Reading | null {
  if (!ledgers.length) return null;
  const graph = buildGraph(ledgers);
  const signals = measureSignals(ledgers);
  const assessment = assess(ledgers, signals);
  return {
    ledgers: { first: ledgers[0].index, last: ledgers[ledgers.length - 1].index, count: ledgers.length },
    closeTime: ledgers[ledgers.length - 1].closeTime,
    counts: {
      transactions: ledgers.reduce((n, l) => n + l.txs.length, 0),
      entities: graph.nodes.filter((n) => n.kind === "account").length,
      relationships: graph.edges.length,
      clusters: graph.clusters.length,
      signals: signals.filter((s) => s.value !== null).length,
    },
    graph,
    signals,
    assessment,
  };
}

/** rAbc…wxyz, for display only; the full address is always in the title. */
export function shortAddress(id: string): string {
  return ADDRESS.test(id) ? `${id.slice(0, 5)}…${id.slice(-4)}` : id;
}

/** HH:MM:SS UTC from Unix seconds. */
export function utcClock(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(11, 19) + " UTC";
}
