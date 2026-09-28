import { rpc } from "@/lib/xrpl/client";
import { sanctionsFor, type SanctionEntry } from "@/lib/xrpl/sanctions";

/**
 * Scam cluster mapper — the other accounts run by the same operation.
 *
 * A scam on the XRP Ledger is rarely one account. The operator funds
 * fresh accounts from one wallet, sprays dust and memos from them, sweeps
 * them onward with AccountDelete when they are reported, and often
 * generates vanity addresses that share an ending. Starting from one known
 * account, this follows those links on the ledger, breadth first:
 *
 *   funded_by   who sent the payment that created the account
 *   funded      accounts it created by paying them their first XRP
 *   swept_to    where its balance went when it deleted itself
 *   swept_from  accounts that deleted themselves into it
 *
 * and then groups what it found by shared vanity ending and shared memo
 * text. Exchanges and other services (accounts that require destination
 * tags, or that created more accounts than any individual would) end a
 * branch, so one withdrawal from an exchange does not pull in its
 * customers. Every link names the transaction that proves it.
 */

type Json = Record<string, any>;

export type ClusterLink = {
  from: string;
  to: string;
  kind: "funded" | "swept";
  hash: string;
  ledger: number;
  xrp: number;
};

export type ClusterNode = {
  address: string;
  depth: number;
  exists: boolean;
  balanceXrp: number | null;
  /** A service (destination tags required) or a hub (created many accounts): not expanded. */
  stop: "service" | "hub" | null;
  sanction: SanctionEntry | null;
  /** Distinct memo texts it sent, normalised. */
  memos: string[];
};

export type Cluster = {
  seed: string;
  nodes: ClusterNode[];
  links: ClusterLink[];
  vanity: Array<{ ending: string; accounts: string[] }>;
  sharedMemos: Array<{ text: string; accounts: string[] }>;
  /** True when the account cap stopped the search. */
  capped: boolean;
  sanctionsChecked: boolean;
};

export type ClusterReader = {
  accountTx(account: string, forward: boolean, limit: number): Promise<Json>;
  accountInfo(account: string): Promise<Json | null>;
  sanctions(addresses: string[]): Promise<Record<string, SanctionEntry> | null>;
};

export const liveClusterReader: ClusterReader = {
  accountTx: (account, forward, limit) => rpc("account_tx", { account, ledger_index_min: -1, ledger_index_max: -1, forward, limit }) as Promise<Json>,
  accountInfo: (account) =>
    (rpc("account_info", { account, ledger_index: "validated" }) as Promise<Json>).catch((e: unknown) => {
      if (/actNotFound|not found/i.test(e instanceof Error ? e.message : String(e))) return null;
      throw e;
    }),
  sanctions: async (addresses) => (await sanctionsFor(addresses))?.hits ?? null,
};

/** How far each plan maps a cluster. */
export const CLUSTER_LIMITS = {
  standard: { depth: 2, maxAccounts: 40, perAccount: 200 },
  deep: { depth: 4, maxAccounts: 200, perAccount: 400 },
} as const;

const LSF_REQUIRE_DEST_TAG = 0x00020000;
/** An account that created more accounts than this is a service or a faucet, not a scam wallet. */
const HUB_FUNDED = 60;

function createdAccount(meta: Json, address: string): boolean {
  return ((meta.AffectedNodes ?? []) as Json[]).some((n) => n.CreatedNode?.LedgerEntryType === "AccountRoot" && n.CreatedNode?.NewFields?.Account === address);
}

function xrpDelivered(meta: Json): number {
  const d = meta.delivered_amount ?? meta.DeliveredAmount;
  return typeof d === "string" && /^\d+$/.test(d) ? Number(d) / 1_000_000 : 0;
}

function memoTexts(tx: Json): string[] {
  const out: string[] = [];
  for (const m of (tx.Memos ?? []) as Json[]) {
    const hex = (m.Memo ?? m).MemoData;
    if (typeof hex !== "string" || !/^([0-9A-Fa-f]{2})+$/.test(hex)) continue;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array((hex.match(/../g) ?? []).map((b: string) => parseInt(b, 16))));
    const norm = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (norm.length >= 8 && /[a-z]/.test(norm)) out.push(norm.slice(0, 200));
  }
  return out;
}

/** The links one account's history shows. Pure. */
export function linksOf(address: string, rows: Json[]): { links: ClusterLink[]; memos: string[]; funded: number } {
  const links: ClusterLink[] = [];
  const memos = new Set<string>();
  let funded = 0;
  for (const row of rows) {
    const tx = (row.tx_json ?? row.tx ?? row) as Json;
    const meta = (row.meta ?? {}) as Json;
    if (meta.TransactionResult !== "tesSUCCESS") continue;
    const hash = String(tx.hash ?? row.hash ?? "");
    const ledger = Number(row.ledger_index ?? tx.ledger_index ?? 0);
    if (tx.Account === address) for (const m of memoTexts(tx)) memos.add(m);
    if (tx.TransactionType === "Payment" && typeof tx.Destination === "string") {
      if (tx.Destination === address && tx.Account !== address && createdAccount(meta, address)) {
        links.push({ from: tx.Account, to: address, kind: "funded", hash, ledger, xrp: xrpDelivered(meta) });
      } else if (tx.Account === address && createdAccount(meta, tx.Destination)) {
        funded += 1;
        links.push({ from: address, to: tx.Destination, kind: "funded", hash, ledger, xrp: xrpDelivered(meta) });
      }
    }
    if (tx.TransactionType === "AccountDelete" && typeof tx.Destination === "string") {
      if (tx.Account === address || tx.Destination === address) links.push({ from: tx.Account, to: tx.Destination, kind: "swept", hash, ledger, xrp: xrpDelivered(meta) });
    }
  }
  return { links, memos: [...memos], funded };
}

/** Map the cluster around `seed`. */
export async function mapCluster(
  seed: string,
  opts: { depth?: number; maxAccounts?: number; perAccount?: number; reader?: ClusterReader } = {}
): Promise<Cluster> {
  const reader = opts.reader ?? liveClusterReader;
  const depthLimit = opts.depth ?? CLUSTER_LIMITS.standard.depth;
  const maxAccounts = opts.maxAccounts ?? CLUSTER_LIMITS.standard.maxAccounts;
  const perAccount = opts.perAccount ?? CLUSTER_LIMITS.standard.perAccount;

  const nodes = new Map<string, ClusterNode>();
  const links = new Map<string, ClusterLink>();
  const queue: Array<{ address: string; depth: number }> = [{ address: seed, depth: 0 }];
  nodes.set(seed, { address: seed, depth: 0, exists: true, balanceXrp: null, stop: null, sanction: null, memos: [] });
  let capped = false;

  while (queue.length) {
    const { address, depth } = queue.shift()!;
    const node = nodes.get(address)!;
    const info = await reader.accountInfo(address).catch(() => undefined);
    const data = info?.account_data as Json | undefined;
    node.exists = info !== null;
    if (data) {
      node.balanceXrp = Number(data.Balance ?? 0) / 1_000_000;
      if (address !== seed && (Number(data.Flags ?? 0) & LSF_REQUIRE_DEST_TAG) !== 0) {
        node.stop = "service";
        continue;
      }
    }
    // The oldest page says who created the account; the newest says what it did lately and where it went.
    const [first, last] = await Promise.all([
      reader.accountTx(address, true, 20).catch(() => ({ transactions: [] })),
      reader.accountTx(address, false, perAccount).catch(() => ({ transactions: [] })),
    ]);
    const rows = [...((first.transactions ?? []) as Json[]), ...((last.transactions ?? []) as Json[])];
    const found = linksOf(address, rows);
    node.memos = found.memos;
    if (found.funded > HUB_FUNDED && address !== seed) {
      node.stop = "hub";
      continue;
    }
    for (const link of found.links) {
      links.set(`${link.hash}:${link.from}:${link.to}`, link);
      const other = link.from === address ? link.to : link.from;
      if (nodes.has(other)) continue;
      if (nodes.size >= maxAccounts) {
        capped = true;
        continue;
      }
      nodes.set(other, { address: other, depth: depth + 1, exists: true, balanceXrp: null, stop: null, sanction: null, memos: [] });
      if (depth + 1 <= depthLimit) queue.push({ address: other, depth: depth + 1 });
    }
  }

  const all = [...nodes.values()];
  const listed = await reader.sanctions(all.map((n) => n.address)).catch(() => null);
  for (const n of all) n.sanction = listed?.[n.address] ?? null;

  const byEnding = new Map<string, string[]>();
  for (const n of all) byEnding.set(n.address.slice(-4).toLowerCase(), [...(byEnding.get(n.address.slice(-4).toLowerCase()) ?? []), n.address]);
  const byMemo = new Map<string, Set<string>>();
  for (const n of all) for (const m of n.memos) byMemo.set(m, (byMemo.get(m) ?? new Set()).add(n.address));

  return {
    seed,
    nodes: all,
    links: [...links.values()].sort((a, b) => a.ledger - b.ledger),
    vanity: [...byEnding].filter(([, a]) => a.length >= 2).map(([ending, accounts]) => ({ ending, accounts })),
    sharedMemos: [...byMemo].filter(([, a]) => a.size >= 2).map(([text, a]) => ({ text, accounts: [...a] })),
    capped,
    sanctionsChecked: listed !== null,
  };
}
