import { rpc } from "@/lib/xrpl/client";
import { sanctionsFor, type SanctionEntry } from "@/lib/xrpl/sanctions";
import { decodeCurrency } from "../../../supabase/functions/_shared/xrplEvents.ts";
import type { SecurityEvent } from "./hardening";

/**
 * Incident response for a drained or hacked XRP Ledger account.
 *
 * What it does: follows the value out of an account from the ledger an
 * incident began at, hop by hop, through payments and AccountDelete
 * sweeps, ignoring the dust thieves spray to hide the real transfers;
 * reads what became of every account the value reached (still holding it,
 * deleted, a custodial service that tags its deposits, on the OFAC list);
 * and lists the recovery paths that exist on this ledger, with the
 * evidence each one needs.
 *
 * What no one can do: reverse a validated transaction. The XRP Ledger has
 * no chargeback, and no validator, company or tool can move funds out of
 * an account without its keys. Recovery, where it happens, happens
 * off-ledger: a custodial service freezing a deposit, or a token issuer
 * freezing or clawing back its own token. This module says which of
 * those apply and gives the facts each request needs. It never promises a
 * reversal, and it never signs anything.
 */

const RIPPLE_EPOCH = 946_684_800;
const LSF_REQUIRE_DEST_TAG = 0x00020000;

type Json = Record<string, any>;

export type Amount = { currency: string; issuer: string | null; value: number };

export type Flow = {
  from: string;
  to: string;
  kind: "payment" | "account_delete" | "check_cash" | "escrow";
  amount: Amount;
  ledger: number;
  at: string | null;
  hash: string;
  destinationTag: number | null;
};

export type NodeStatus = "source" | "holding" | "deleted" | "custodial" | "not_followed" | "unread";

export type TraceNode = {
  address: string;
  depth: number;
  status: NodeStatus;
  /** XRP value that reached this account through the traced flows. */
  receivedXrp: number;
  /** Current balance, when the account exists. */
  balanceXrp: number | null;
  domain: string | null;
  sanction: SanctionEntry | null;
  /** Transactions read from this account's history. */
  read: number;
  /** True when that read stopped at its limit. */
  truncated: boolean;
  /** Some value reached it with a destination tag: a deposit to a service that pools customers' funds. */
  tagged?: boolean;
};

export type Trace = {
  root: string;
  sinceLedger: number;
  depthLimit: number;
  minXrp: number;
  nodes: TraceNode[];
  flows: Flow[];
  /** Payments below `minXrp` sent by traced accounts: the spray that hides the real transfers. */
  dust: { count: number; xrp: number };
  /** Vanity endings shared by several accounts in the trail (a generated series). */
  vanity: Array<{ ending: string; accounts: string[] }>;
  /** Accounts sanctions could not be checked for, when the lookup failed. */
  sanctionsChecked: boolean;
};

export type TraceReader = {
  accountTx(account: string, fromLedger: number, limit: number, marker?: unknown): Promise<Json>;
  accountInfo(account: string): Promise<Json | null>;
  sanctions(addresses: string[]): Promise<Record<string, SanctionEntry> | null>;
};

export const liveReader: TraceReader = {
  accountTx: (account, fromLedger, limit, marker) =>
    rpc("account_tx", { account, ledger_index_min: fromLedger, ledger_index_max: -1, forward: true, limit, ...(marker ? { marker } : {}) }) as Promise<Json>,
  accountInfo: (account) =>
    (rpc("account_info", { account, ledger_index: "validated" }) as Promise<Json>).catch((error: unknown) => {
      if (/actNotFound|not found/i.test(error instanceof Error ? error.message : String(error))) return null;
      throw error;
    }),
  sanctions: async (addresses) => (await sanctionsFor(addresses))?.hits ?? null,
};

/** How far each plan follows the value. */
export const TRACE_LIMITS = {
  standard: { depth: 2, perAccount: 400 },
  deep: { depth: 5, perAccount: 1000 },
} as const;

const iso = (t: unknown) => (typeof t === "number" ? new Date((t + RIPPLE_EPOCH) * 1000).toISOString() : null);

function amountOf(raw: unknown): Amount | null {
  if (typeof raw === "string" && /^\d+$/.test(raw)) return { currency: "XRP", issuer: null, value: Number(raw) / 1_000_000 };
  if (raw && typeof raw === "object") {
    const a = raw as Json;
    const value = Number(a.value);
    if (typeof a.currency === "string" && Number.isFinite(value)) return { currency: decodeCurrency(a.currency), issuer: a.issuer ?? null, value };
  }
  return null;
}

/** Value leaving `account` in one transaction row, or null. */
export function outflowOf(account: string, row: Json): Flow | null {
  const tx = (row.tx_json ?? row.tx ?? row) as Json;
  const meta = (row.meta ?? {}) as Json;
  if (row.validated === false || meta.TransactionResult !== "tesSUCCESS" || tx.Account !== account) return null;
  const base = {
    from: account,
    ledger: Number(row.ledger_index ?? tx.ledger_index ?? 0),
    at: iso(tx.date ?? row.date),
    hash: String(tx.hash ?? row.hash ?? ""),
    destinationTag: typeof tx.DestinationTag === "number" ? tx.DestinationTag : null,
  };
  const delivered = amountOf(meta.delivered_amount ?? meta.DeliveredAmount);
  if (tx.TransactionType === "Payment" && typeof tx.Destination === "string" && tx.Destination !== account && delivered) {
    return { ...base, to: tx.Destination, kind: "payment", amount: delivered };
  }
  if (tx.TransactionType === "AccountDelete" && typeof tx.Destination === "string" && delivered) {
    return { ...base, to: tx.Destination, kind: "account_delete", amount: delivered };
  }
  if (tx.TransactionType === "EscrowCreate" && typeof tx.Destination === "string") {
    const amount = amountOf(tx.Amount);
    if (amount) return { ...base, to: tx.Destination, kind: "escrow", amount };
  }
  return null;
}

/**
 * Follow the value out of `root` from `sinceLedger`, breadth first, up to
 * `depth` hops. Payments of XRP below `minXrp` are counted as dust, not
 * followed. A custodial account (one that requires destination tags) ends
 * its branch: past it the funds are pooled with other customers', and the
 * service's own records are what can say more.
 */
export async function traceFunds(
  root: string,
  opts: { sinceLedger: number; depth?: number; perAccount?: number; minXrp?: number; reader?: TraceReader }
): Promise<Trace> {
  const reader = opts.reader ?? liveReader;
  const depthLimit = opts.depth ?? TRACE_LIMITS.standard.depth;
  const perAccount = opts.perAccount ?? TRACE_LIMITS.standard.perAccount;
  const minXrp = opts.minXrp ?? 1;

  const nodes = new Map<string, TraceNode>();
  const flows: Flow[] = [];
  const dust = { count: 0, xrp: 0 };
  const queue: Array<{ address: string; from: number; depth: number }> = [{ address: root, from: opts.sinceLedger, depth: 0 }];
  nodes.set(root, { address: root, depth: 0, status: "source", receivedXrp: 0, balanceXrp: null, domain: null, sanction: null, read: 0, truncated: false });

  while (queue.length) {
    const { address, from, depth } = queue.shift()!;
    const node = nodes.get(address)!;
    const info = await reader.accountInfo(address).catch(() => undefined);
    if (info === undefined) node.status = node.status === "source" ? "source" : "unread";
    const data = info?.account_data as Json | undefined;
    if (data) {
      node.balanceXrp = Number(data.Balance ?? 0) / 1_000_000;
      if (typeof data.Domain === "string" && data.Domain) {
        node.domain = new TextDecoder().decode(new Uint8Array((data.Domain.match(/../g) ?? []).map((h: string) => parseInt(h, 16))));
      }
      if (node.status !== "source") node.status = node.tagged || (Number(data.Flags ?? 0) & LSF_REQUIRE_DEST_TAG) !== 0 ? "custodial" : "holding";
    } else if (info === null && node.status !== "source") {
      node.status = "deleted";
    }
    if (node.tagged && node.status !== "source") node.status = "custodial";
    // Past a custodial account the value is pooled; its branch ends here.
    if (node.status === "custodial") continue;

    let marker: unknown;
    do {
      const page: Json = await reader.accountTx(address, from, Math.min(400, perAccount - node.read), marker).catch(() => ({ transactions: [] }));
      const rows = (page.transactions ?? []) as Json[];
      node.read += rows.length;
      for (const row of rows) {
        const flow = outflowOf(address, row);
        if (!flow) continue;
        if (flow.amount.currency === "XRP" && flow.amount.value < minXrp && flow.kind === "payment") {
          dust.count += 1;
          dust.xrp += flow.amount.value;
          continue;
        }
        flows.push(flow);
        const xrp = flow.amount.currency === "XRP" ? flow.amount.value : 0;
        const next = nodes.get(flow.to);
        if (next) {
          next.receivedXrp += xrp;
          if (flow.destinationTag !== null && next.status !== "source") {
            next.tagged = true;
            next.status = "custodial";
          }
          continue;
        }
        const tagged = flow.destinationTag !== null;
        nodes.set(flow.to, { address: flow.to, depth: depth + 1, status: tagged ? "custodial" : "holding", receivedXrp: xrp, balanceXrp: null, domain: null, sanction: null, read: 0, truncated: false, tagged });
        if (!tagged && depth + 1 <= depthLimit) {
          queue.push({ address: flow.to, from: flow.ledger, depth: depth + 1 });
          continue;
        }
        // Not followed further (a tagged deposit, or past the depth limit): still read what the account is now.
        const n = nodes.get(flow.to)!;
        const now = await reader.accountInfo(flow.to).catch(() => undefined);
        if (now === null) n.status = "deleted";
        else if (now?.account_data) {
          const d = now.account_data as Json;
          n.balanceXrp = Number(d.Balance ?? 0) / 1_000_000;
          if (typeof d.Domain === "string" && d.Domain) n.domain = new TextDecoder().decode(new Uint8Array((d.Domain.match(/../g) ?? []).map((h: string) => parseInt(h, 16))));
          n.status = tagged || (Number(d.Flags ?? 0) & LSF_REQUIRE_DEST_TAG) !== 0 ? "custodial" : "not_followed";
        } else if (!tagged) n.status = "not_followed";
      }
      marker = page.marker;
      if (node.read >= perAccount && marker) node.truncated = true;
    } while (marker && node.read < perAccount);
  }

  const all = [...nodes.values()];
  const listed = await reader.sanctions(all.map((n) => n.address)).catch(() => null);
  for (const n of all) n.sanction = listed?.[n.address] ?? null;

  const byEnding = new Map<string, string[]>();
  for (const n of all) {
    const ending = n.address.slice(-4).toLowerCase();
    byEnding.set(ending, [...(byEnding.get(ending) ?? []), n.address]);
  }
  const vanity = [...byEnding].filter(([, a]) => a.length >= 2).map(([ending, accounts]) => ({ ending, accounts }));

  return { root, sinceLedger: opts.sinceLedger, depthLimit, minXrp, nodes: all, flows, dust, vanity, sanctionsChecked: listed !== null };
}

// ————— What can be done —————

export type RecoveryOption = {
  id: string;
  title: string;
  detail: string;
  /** How likely this path is to return anything, said plainly. */
  outlook: "possible" | "unlikely" | "not_possible" | "protective";
  /** The facts a request needs: hashes, tags, amounts, times. */
  evidence?: string[];
};

const fmt = (a: Amount) => `${a.value.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${a.currency}${a.issuer ? ` (issuer ${a.issuer})` : ""}`;

/** Every recovery path that exists for this trace, honestly rated. */
export function recoveryOptions(trace: Trace, compromised?: { stillHoldsXrp: number; keyEvents: SecurityEvent[] }): RecoveryOption[] {
  const out: RecoveryOption[] = [
    {
      id: "finality",
      title: "No one can reverse a validated XRP Ledger transaction",
      detail:
        "There is no chargeback on the XRP Ledger. Validators, Ripple, wallet makers and NOSHASHI cannot move funds out of an account without its keys, and anyone offering to 'recover' or 'reverse' stolen XRP for a fee is running the second half of the scam. What follows are the paths that do exist.",
      outlook: "not_possible",
    },
  ];

  const custodial = trace.nodes.filter((n) => n.status === "custodial");
  for (const n of custodial) {
    const into = trace.flows.filter((f) => f.to === n.address);
    out.push({
      id: `freeze-${n.address}`,
      title: `Ask the service behind ${n.address}${n.domain ? ` (${n.domain})` : ""} to freeze the deposit`,
      detail: `This account requires destination tags, the mark of an exchange or custodial service that credits deposits to customer accounts. The service can identify and freeze the customer who received ${into.map((f) => fmt(f.amount)).join(" and ") || "the funds"} if you reach it before the funds are withdrawn, usually with a police or court reference. Send it the evidence below.`,
      outlook: "possible",
      evidence: into.map((f) => `${f.at ?? `ledger ${f.ledger}`}: ${fmt(f.amount)} to ${f.to}${f.destinationTag !== null ? ` tag ${f.destinationTag}` : ""}, transaction ${f.hash}`),
    });
  }

  const tokens = trace.flows.filter((f) => f.amount.issuer);
  const issuers = [...new Set(tokens.map((f) => f.amount.issuer!))];
  for (const issuer of issuers) {
    const moved = tokens.filter((f) => f.amount.issuer === issuer);
    out.push({
      id: `issuer-${issuer}`,
      title: `Ask the issuer ${issuer} to freeze, or claw back, its ${moved[0].amount.currency}`,
      detail: `Issued tokens are the issuer's obligations. Unless it has given up the right (No Freeze), the issuer can freeze the trust lines now holding its token, and if it enabled clawback it can take the balance back and reissue it. Check the issuer's posture on the Authority screen, then contact it through its published domain with the evidence below.`,
      outlook: "possible",
      evidence: moved.map((f) => `${f.at ?? `ledger ${f.ledger}`}: ${fmt(f.amount)} from ${f.from} to ${f.to}, transaction ${f.hash}`),
    });
  }

  const holding = trace.nodes.filter((n) => n.status === "holding" && n.depth > 0 && (n.balanceXrp ?? 0) > 0);
  if (holding.length) {
    out.push({
      id: "still-held",
      title: `${holding.length} account${holding.length === 1 ? " still holds" : "s still hold"} XRP from the trail`,
      detail: `${holding.map((n) => `${n.address}: ${n.balanceXrp!.toLocaleString("en-US")} XRP`).join("; ")}. Nothing on the ledger can move it without that account's key, but law enforcement can act on an identified owner, and Ledger Watch can alert you the moment it moves (and where to).`,
      outlook: "unlikely",
    });
  }

  const deleted = trace.nodes.filter((n) => n.status === "deleted" && n.depth > 0);
  if (deleted.length) {
    out.push({
      id: "deleted",
      title: `${deleted.length} account${deleted.length === 1 ? " in the trail was" : "s in the trail were"} deleted after use`,
      detail: "Throwaway accounts that sweep their balance onward with AccountDelete: the value is not in them any more. It is followed to where it went.",
      outlook: "not_possible",
    });
  }

  const sanctioned = trace.nodes.filter((n) => n.sanction);
  if (sanctioned.length) {
    out.push({
      id: "sanctioned",
      title: "The trail reaches an address on the OFAC SDN list",
      detail: `${sanctioned.map((n) => `${n.address} (${n.sanction!.entityName})`).join("; ")}. Report it with this dossier; US and allied authorities act on listed parties.`,
      outlook: "possible",
    });
  }

  if (compromised && compromised.stillHoldsXrp > 0) {
    const attackerKey = compromised.keyEvents.find((e) => e.kind === "regular_key_set" || e.kind === "signer_list_set");
    out.push({
      id: "secure-remaining",
      title: `Move the remaining ${compromised.stillHoldsXrp.toLocaleString("en-US")} XRP to a new account now`,
      detail: `${attackerKey ? `The account's keys were changed (${attackerKey.detail}) If that was not you, the thief may still sign. ` : ""}Create a new account on a device that never held the old seed, and move what is left while you still can: whoever has the key can empty it at any time. Then never reuse the old seed.`,
      outlook: "protective",
    });
  }

  out.push({
    id: "report",
    title: "Report it, with this dossier",
    detail: "File a report with the police where you live (in the US, the FBI's IC3 at ic3.gov; in the UK, Action Fraud) and give them the dossier: exchanges act on law-enforcement requests far faster than on individuals'. Keep the transaction hashes: they are the evidence.",
    outlook: "possible",
  });
  return out;
}

// ————— The dossier —————

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const STATUS_LABEL: Record<NodeStatus, string> = {
  source: "the compromised account",
  holding: "exists and holds XRP",
  deleted: "deleted (swept onward)",
  custodial: "custodial service (requires destination tags)",
  not_followed: "beyond the trace depth",
  unread: "could not be read",
};

/** The incident as plain text, and its SHA-256, so anyone can check it was not altered. */
export async function incidentDossier(
  trace: Trace,
  options: RecoveryOption[],
  context: { reportedBy?: string; keyEvents?: SecurityEvent[]; generatedAt?: string } = {}
): Promise<{ text: string; sha256: string }> {
  const lines = [
    "NOSHASHI INCIDENT DOSSIER",
    `Account: ${trace.root}`,
    `Traced from ledger ${trace.sinceLedger.toLocaleString("en-US")}, up to ${trace.depthLimit} hops, ignoring payments under ${trace.minXrp} XRP`,
    `Generated: ${context.generatedAt ?? new Date().toISOString()}${context.reportedBy ? ` by ${context.reportedBy}` : ""}`,
    "Source: XRP Ledger mainnet, validated ledgers, read live from public servers.",
    "",
  ];
  if (context.keyEvents?.length) {
    lines.push("KEY AND SETTINGS CHANGES ON THE ACCOUNT");
    for (const e of context.keyEvents) lines.push(`- ${e.at ?? `ledger ${e.ledger}`}: ${e.detail} (${e.hash})`);
    lines.push("");
  }
  lines.push("VALUE MOVEMENTS");
  for (const f of trace.flows) {
    lines.push(`- ${f.at ?? `ledger ${f.ledger}`} ${f.kind === "account_delete" ? "ACCOUNT DELETE" : f.kind.toUpperCase()} ${f.from} -> ${f.to}${f.destinationTag !== null ? ` tag ${f.destinationTag}` : ""}: ${fmt(f.amount)} (${f.hash})`);
  }
  if (trace.dust.count) lines.push(`- plus ${trace.dust.count} payments under ${trace.minXrp} XRP (${trace.dust.xrp.toFixed(6)} XRP in total), not followed`);
  lines.push("", "ACCOUNTS IN THE TRAIL");
  for (const n of trace.nodes) {
    lines.push(`- ${n.address} (hop ${n.depth}): ${STATUS_LABEL[n.status]}${n.balanceXrp !== null ? `, balance ${n.balanceXrp} XRP` : ""}${n.domain ? `, claims ${n.domain}` : ""}${n.sanction ? `, OFAC SDN: ${n.sanction.entityName}` : ""}`);
  }
  for (const v of trace.vanity) lines.push(`- ${v.accounts.length} accounts share the ending "${v.ending}": ${v.accounts.join(", ")}`);
  lines.push("", "RECOVERY PATHS");
  for (const o of options) {
    lines.push(`- [${o.outlook.replace("_", " ").toUpperCase()}] ${o.title}`);
    for (const e of o.evidence ?? []) lines.push(`    ${e}`);
  }
  const text = lines.join("\n");
  return { text, sha256: await sha256Hex(text) };
}

// ————— How it happened —————

export type TakeoverSignal = { id: string; severity: "critical" | "warn" | "info"; title: string; detail: string };

/**
 * What the account's own history says about how it was taken: a key
 * added shortly before value left is the signature of a takeover; value
 * leaving with no key change points to a stolen seed.
 */
export function takeoverSignals(root: string, keyEvents: SecurityEvent[], flows: Flow[]): TakeoverSignal[] {
  const out: TakeoverSignal[] = [];
  const outflows = flows.filter((f) => f.from === root).sort((a, b) => a.ledger - b.ledger);
  const firstOut = outflows[0];
  const keyAdds = keyEvents.filter((e) => e.kind === "regular_key_set" || e.kind === "signer_list_set" || e.kind === "master_disabled");
  const before = firstOut ? keyAdds.filter((e) => e.ledger <= firstOut.ledger && firstOut.ledger - e.ledger < 100_000) : [];
  if (before.length) {
    out.push({
      id: "key-then-drain",
      severity: "critical",
      title: "Signing keys changed, then value left",
      detail: `${before.map((e) => `${e.at?.slice(0, 16).replace("T", " ") ?? `ledger ${e.ledger}`}: ${e.detail}`).join(" ")} Value started leaving at ${firstOut.at?.slice(0, 16).replace("T", " ") ?? `ledger ${firstOut.ledger}`}. An attacker who adds their own key can keep signing after the owner notices.`,
    });
  } else if (firstOut) {
    out.push({
      id: "seed-used",
      severity: "warn",
      title: "Value left with no change of keys",
      detail: "The account's existing key signed the transfers, which usually means the secret seed itself was exposed (a phishing site, a fake wallet, a cloud backup or a screenshot). Anything else secured by that seed is exposed too.",
    });
  }
  const total = outflows.filter((f) => f.amount.currency === "XRP").reduce((n, f) => n + f.amount.value, 0);
  if (outflows.length) {
    const destinations = new Set(outflows.map((f) => f.to));
    out.push({
      id: "outflow",
      severity: "info",
      title: `${total.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP left in ${outflows.length} transfer${outflows.length === 1 ? "" : "s"} to ${destinations.size} account${destinations.size === 1 ? "" : "s"}`,
      detail: outflows.slice(0, 5).map((f) => `${f.amount.value.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${f.amount.currency} to ${f.to}${f.kind === "account_delete" ? " (account deleted)" : ""}`).join("; ") + (outflows.length > 5 ? "; …" : ""),
    });
  }
  if (outflows.some((f) => f.kind === "account_delete")) {
    out.push({ id: "deleted", severity: "info", title: "The account was deleted", detail: "Its remaining XRP was swept to the destination of its AccountDelete. The address can be funded again, but its history stays on the ledger." });
  }
  return out;
}
