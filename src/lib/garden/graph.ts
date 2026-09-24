import { decodeCurrency } from "@/lib/format";
import { formatAmount, type SettlementFinding, type SettlementReport } from "@/lib/desk/settlement";
import type { IssuerObligations, TrustLine, WalletTransaction } from "@/lib/xrpl/types";

/**
 * THE GARDEN AS NAVIGATION.
 *
 * The ledger is a graph: an issuer issues assets, accounts hold them on
 * trust lines, accounts send transactions, and a transaction leaves
 * evidence of what it actually did. The garden lets an operator walk that
 * graph one click at a time — issuer → asset → holder → transaction →
 * evidence → a question for the agent — and every node it draws comes from
 * a read of validated mainnet state, never from a placeholder.
 *
 * This module is the part with no network and no DOM: it turns replies the
 * app already reads (gateway_balances, account_lines, account_tx, tx) into
 * nodes, and lays the branches out. The scene only fetches and draws.
 */

export type GardenKind = "issuer" | "account" | "asset" | "tx" | "evidence";
export type GardenTone = "go" | "hold" | "no-go" | "neutral";

export type GardenNode = {
  /** Unique within its column. */
  id: string;
  kind: GardenKind;
  label: string;
  detail: string;
  /** Sub-heading inside a column: ISSUES, HOLDS, TRANSACTIONS… */
  group?: string;
  tone: GardenTone;
  ref: { address?: string; issuer?: string; currency?: string; hash?: string };
  /** False for leaves — evidence is where the walk ends and a question begins. */
  expandable: boolean;
};

export type GardenColumn = {
  /** The node in the previous column this one grew from; null for the root. */
  parentId: string | null;
  title: string;
  nodes: GardenNode[];
  /** Where these facts came from and how final they are. */
  state: string;
  /** Coverage, truncation or an empty result, said plainly. */
  note?: string;
};

/** Most nodes a column draws. The note says when there were more. */
export const COLUMN_CAP = 12;

const n = (v: number, max = 6) => v.toLocaleString("en-US", { maximumFractionDigits: max });
const short = (a: string) => (a.length <= 13 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`);
const ledger = (index: number) => (index > 0 ? `VALIDATED · LEDGER ${n(index)}` : "VALIDATED");

/** What a pasted value is: an address, a transaction hash, or neither. */
export function subjectKind(value: string): "address" | "tx" | null {
  const v = value.trim();
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(v)) return "address";
  if (/^[0-9A-Fa-f]{64}$/.test(v)) return "tx";
  return null;
}

export function accountNode(address: string, issues: boolean, detail = ""): GardenNode {
  return {
    // Keyed by address alone: the same node turns out to be an issuer
    // once its column has been read, and must keep its place in the path.
    id: `addr:${address}`,
    kind: issues ? "issuer" : "account",
    label: short(address),
    detail: detail || (issues ? "issues assets on XRPL" : "XRPL account"),
    tone: "neutral",
    ref: { address },
    expandable: true,
  };
}

export function txNode(hash: string, label = "Transaction", detail = ""): GardenNode {
  const h = hash.toUpperCase();
  return {
    id: `tx:${h}`,
    kind: "tx",
    label,
    detail: detail || `${h.slice(0, 10)}…`,
    tone: "neutral",
    ref: { hash: h },
    expandable: true,
  };
}

/** Assets an issuer has outstanding, largest first. */
export function assetsOf(obligations: IssuerObligations): GardenNode[] {
  return Object.entries(obligations.obligations)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([currency, amount]) => ({
      id: `asset:${obligations.issuer}.${currency}`,
      kind: "asset" as const,
      label: decodeCurrency(currency),
      detail: `${n(amount, 2)} outstanding`,
      group: "ISSUES",
      tone: "neutral" as const,
      ref: { issuer: obligations.issuer, currency },
      expandable: true,
    }));
}

/**
 * What an account holds on its trust lines, largest balance first.
 *
 * A negative balance is the other side of a line — the account owes it,
 * as an issuer owes its holders — so it is not a holding and is left out.
 * An empty line counts only when this account set a limit on it: from an
 * issuer's side, a holder's empty line also reads 0, with the limit on the
 * holder's end.
 */
export function holdingsOf(lines: TrustLine[]): GardenNode[] {
  return lines
    .filter((l) => l.balance > 0 || (l.balance === 0 && l.limit > 0))
    .sort((a, b) => b.balance - a.balance)
    .map((l) => {
      const frozen = l.frozenByIssuer || l.deepFrozenByIssuer;
      return {
        id: `asset:${l.issuer}.${l.currency}`,
        kind: "asset" as const,
        label: `${decodeCurrency(l.currency)} · ${short(l.issuer)}`,
        detail: `${n(l.balance)} held${frozen ? " · FROZEN BY ISSUER" : l.balance === 0 ? " · empty line" : ""}`,
        group: "HOLDS",
        tone: frozen ? ("no-go" as const) : ("neutral" as const),
        ref: { issuer: l.issuer, currency: l.currency },
        expandable: true,
      };
    });
}

/**
 * Holders of one asset, from the issuer's own trust lines.
 *
 * From the issuer's side a holder's line has a negative balance: the
 * issuer owes it. Sorted by what each holds — but only among the lines
 * that were read, which is the ledger's order, not a ranking. The column
 * note says so, and names where the full census is.
 */
export function holdersOf(issuerLines: TrustLine[], currency: string): GardenNode[] {
  return issuerLines
    .filter((l) => l.currency === currency && l.balance < 0)
    .sort((a, b) => a.balance - b.balance)
    .map((l) => {
      // Read from the issuer's side, `freeze` is the issuer's own flag on the line.
      const frozen = l.frozen || Boolean(l.deepFrozen);
      return {
        id: `addr:${l.issuer}`,
        kind: "account" as const,
        label: short(l.issuer),
        detail: `holds ${n(-l.balance)} ${decodeCurrency(currency)}${frozen ? " · FROZEN BY ISSUER" : ""}`,
        group: "HOLDERS",
        tone: frozen ? ("no-go" as const) : ("neutral" as const),
        ref: { address: l.issuer },
        expandable: true,
      };
    });
}

/** Recent transactions, newest first, as the ledger returned them. */
export function transactionsOf(txs: WalletTransaction[]): GardenNode[] {
  return txs
    .filter((t) => /^[0-9A-F]{64}$/i.test(t.hash))
    .map((t) => {
      const role = t.direction === "out" ? `to ${short(t.counterparty)}` : t.direction === "in" ? `from ${short(t.counterparty)}` : "affected";
      const failed = t.result !== "tesSUCCESS";
      return {
        ...txNode(t.hash, t.transactionType, `${role} · ledger ${n(t.ledgerIndex)}${failed ? ` · ${t.result}` : ""}`),
        group: "TRANSACTIONS",
        tone: failed ? ("hold" as const) : ("neutral" as const),
      };
    });
}

const SEVERITY_TONE: Record<SettlementFinding["severity"], GardenTone> = {
  critical: "no-go",
  warn: "hold",
  info: "neutral",
  ok: "go",
};

/**
 * What one transaction proves: NOSHASHI's settlement findings for it, and
 * the parties it touched so the walk can continue from either of them.
 */
export function evidenceOf(report: SettlementReport, findings: SettlementFinding[]): GardenNode[] {
  const found = findings.map((f) => ({
    id: `evidence:${report.hash}:${f.id}`,
    kind: "evidence" as const,
    label: f.title,
    detail: f.detail,
    group: "FINDINGS",
    tone: SEVERITY_TONE[f.severity],
    ref: { hash: report.hash },
    expandable: false,
  }));
  if (report.transactionType === "Payment" && report.delivered) {
    found.unshift({
      id: `evidence:${report.hash}:delivered`,
      kind: "evidence",
      label: `Delivered ${formatAmount(report.delivered)}`,
      detail: report.requested
        ? `Requested ${formatAmount(report.requested)}. delivered_amount is what arrived; the Amount field is only what was asked for.`
        : "delivered_amount is what arrived.",
      group: "FINDINGS",
      tone: report.deliveredFraction !== undefined && report.deliveredFraction < 0.999999 ? "no-go" : "go",
      ref: { hash: report.hash },
      expandable: false,
    });
  }
  const parties = [report.account, report.destination]
    .filter((a): a is string => Boolean(a))
    .filter((a, i, all) => all.indexOf(a) === i)
    .map((a) => ({ ...accountNode(a, false, a === report.account ? "sent it" : "destination"), group: "PARTIES" }));
  return [...found, ...parties];
}

/** Cap a column, saying how many were left out. */
export function capped(nodes: GardenNode[], cap = COLUMN_CAP): { nodes: GardenNode[]; hidden: number } {
  return { nodes: nodes.slice(0, cap), hidden: Math.max(0, nodes.length - cap) };
}

/** An account's column: what it issues, what it holds, what it has done. */
export function accountColumn(
  parentId: string,
  obligations: IssuerObligations,
  lines: TrustLine[],
  txs: WalletTransaction[]
): GardenColumn {
  const issues = capped(assetsOf(obligations), 6);
  const holds = capped(holdingsOf(lines), 6);
  const recent = capped(transactionsOf(txs), 8);
  const notes: string[] = [];
  if (obligations.unreadable) notes.push(`Issued assets could not be read: ${obligations.unreadable}.`);
  if (issues.hidden) notes.push(`${issues.hidden} more issued assets not drawn.`);
  if (holds.hidden) notes.push(`${holds.hidden} more holdings not drawn.`);
  if (!issues.nodes.length && !holds.nodes.length && !recent.nodes.length) {
    notes.push("The ledger reports nothing issued, held or sent by this account.");
  }
  return {
    parentId,
    title: issues.nodes.length ? "ISSUER" : "ACCOUNT",
    nodes: [...issues.nodes, ...holds.nodes, ...recent.nodes],
    state: ledger(obligations.ledgerIndex),
    note: notes.join(" ") || undefined,
  };
}

/** The same column with one address node shown as the issuer it turned out to be. */
export function markIssuer(column: GardenColumn, nodeId: string): GardenColumn {
  return {
    ...column,
    nodes: column.nodes.map((node) =>
      node.id === nodeId && node.kind === "account" ? { ...node, kind: "issuer" as const } : node
    ),
  };
}

/** One asset's holders, read from the issuer's trust lines. */
export function holdersColumn(parentId: string, issuer: string, currency: string, issuerLines: TrustLine[], linesRead: number): GardenColumn {
  const all = holdersOf(issuerLines, currency);
  const { nodes, hidden } = capped(all);
  const partial = linesRead >= 200;
  const note = [
    all.length === 0 ? `No holder of ${decodeCurrency(currency)} among the ${n(linesRead)} lines read.` : "",
    hidden ? `${hidden} more holders not drawn.` : "",
    partial
      ? `Only the first ${n(linesRead)} of ${short(issuer)}'s trust lines were read, in ledger order — the largest holders here are the largest of those, not of the asset. Issuance walks every line.`
      : "",
  ].filter(Boolean);
  return {
    parentId,
    title: `${decodeCurrency(currency)} HOLDERS`,
    nodes,
    state: "VALIDATED",
    note: note.join(" ") || undefined,
  };
}

/** A transaction's evidence. Not validated means nothing in it is final. */
export function evidenceColumn(parentId: string, report: SettlementReport, findings: SettlementFinding[]): GardenColumn {
  return {
    parentId,
    title: "EVIDENCE",
    nodes: evidenceOf(report, findings),
    state: report.validated ? ledger(report.ledgerIndex ?? 0) : "NOT VALIDATED — NOT FINAL",
  };
}

/**
 * The question handed to the agent: the path walked and the evidence at
 * its end, with full addresses and hashes, so the answer is grounded in
 * what was read rather than in the model's memory of the ledger.
 */
export function askAiPrompt(path: GardenNode[]): string {
  const steps = path.map((node) => {
    switch (node.kind) {
      case "issuer":
        return `issuer ${node.ref.address}`;
      case "account":
        return `account ${node.ref.address} (${node.detail})`;
      case "asset":
        return `asset ${decodeCurrency(node.ref.currency ?? "")} issued by ${node.ref.issuer} (${node.detail})`;
      case "tx":
        return `transaction ${node.ref.hash} (${node.label}, ${node.detail})`;
      case "evidence":
        return `NOSHASHI's reading: "${node.label}" — ${node.detail}`;
    }
  });
  return [
    "I walked this path on XRPL mainnet in NOSHASHI's Ledger Garden, reading validated ledger state:",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "What does this evidence mean, and what should I check next? Use only the facts above, and say so if they are not enough to answer.",
  ].join("\n");
}

/* ---------------------------------------------------------------- layout */

export const GEOMETRY = {
  colWidth: 224,
  colGap: 56,
  nodeHeight: 46,
  nodeGap: 6,
  /** Space for the column title and data-state line. */
  header: 44,
  /** Space for a group sub-heading. */
  groupGap: 20,
} as const;

export type PlacedNode = { node: GardenNode; column: number; x: number; y: number; w: number; h: number; selected: boolean };
export type Stem = { from: string; to: string; column: number; d: string; selected: boolean };
export type GroupLabel = { text: string; column: number; x: number; y: number };
export type GardenLayout = { width: number; height: number; nodes: PlacedNode[]; stems: Stem[]; groups: GroupLabel[] };

/**
 * Place every node and grow a stem from each column's parent to each of
 * its children. Stems are cubic curves that leave the parent horizontally
 * and arrive horizontally, so a branch reads as growth, not as wiring.
 * `path` is the selected node id per column.
 */
export function layoutGarden(columns: GardenColumn[], path: (string | undefined)[]): GardenLayout {
  const { colWidth, colGap, nodeHeight, nodeGap, header, groupGap } = GEOMETRY;
  const nodes: PlacedNode[] = [];
  const groups: GroupLabel[] = [];
  let height: number = header;

  columns.forEach((column, c) => {
    const x = c * (colWidth + colGap);
    let y = header;
    let group: string | undefined;
    for (const node of column.nodes) {
      if (node.group && node.group !== group) {
        groups.push({ text: node.group, column: c, x, y: y + 12 });
        y += groupGap;
      }
      group = node.group;
      nodes.push({ node, column: c, x, y, w: colWidth, h: nodeHeight, selected: path[c] === node.id });
      y += nodeHeight + nodeGap;
    }
    height = Math.max(height, y);
  });

  const stems: Stem[] = [];
  columns.forEach((column, c) => {
    if (c === 0 || !column.parentId) return;
    const parent = nodes.find((p) => p.column === c - 1 && p.node.id === column.parentId);
    if (!parent) return;
    const x1 = parent.x + parent.w;
    const y1 = parent.y + parent.h / 2;
    for (const child of nodes.filter((p) => p.column === c)) {
      const x2 = child.x;
      const y2 = child.y + child.h / 2;
      const bend = colGap / 2;
      stems.push({
        from: parent.node.id,
        to: child.node.id,
        column: c,
        d: `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`,
        selected: child.selected,
      });
    }
  });

  const width = columns.length ? columns.length * colWidth + (columns.length - 1) * colGap : 0;
  return { width, height, nodes, stems, groups };
}
