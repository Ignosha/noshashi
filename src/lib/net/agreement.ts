import type { PolicyCheck } from "@/lib/policy";
import type { AccountInfo } from "@/lib/xrpl/types";
import { PUBLIC_NODES } from "./sync";

/**
 * Source agreement — whether independent public nodes return the same
 * ledger, and the same account state, for the reading a verdict is built on.
 *
 * A verdict read from one node is a statement about that node. Before a GO
 * is issued, every public node is asked for the ledger hash at one validated
 * ledger index and for the subject's AccountRoot at that same index. The
 * ledger hash commits to the entire state tree, so two nodes that return the
 * same hash agree on every account, not just this one.
 *
 * The rule this feeds (SOURCE_AGREEMENT) is advisory, so it can hold a
 * verdict but never turn it into NO-GO: a disagreement is a fact about the
 * data, not about the subject. It withholds a GO in three cases:
 *
 *   disagreed       two nodes returned different ledger hashes or different
 *                   account state at the same index
 *   uncorroborated  fewer than two nodes answered at that index
 *   moved           the nodes agree, but the account state they agree on is
 *                   not the one the verdict was computed from (the account
 *                   transacted after it was read)
 */

const TIMEOUT_MS = 8_000;
/** A node one ledger behind answers lgrNotFound; wait one close and ask again. */
const RETRY_AFTER_MS = 4_000;

export type SourceState = {
  /** Drops, as a string, exactly as the node returned it. */
  balanceDrops: string;
  sequence: number;
  ownerCount: number;
  flags: number;
  previousTxnId: string | null;
};

export type SourceReading = {
  url: string;
  /** Ledger hash at the requested index; absent when the node did not answer. */
  ledgerHash?: string;
  /** null means the node answered actNotFound: the account does not exist at that index. */
  account?: SourceState | null;
  error?: string;
};

export type AgreementReport = {
  ledgerIndex: number;
  sources: SourceReading[];
  readAt: string;
};

export type AgreementOutcome = "agreed" | "disagreed" | "uncorroborated" | "moved";

export type AgreementSummary = {
  outcome: AgreementOutcome;
  ledgerIndex: number;
  answered: number;
  total: number;
  /** Nodes in the largest group returning identical ledger and account state. */
  agreeing: number;
  ledgerHash?: string;
};

function fingerprint(r: SourceReading): string {
  const a = r.account;
  return `${r.ledgerHash}|${a === null ? "absent" : a ? `${a.balanceDrops}:${a.sequence}:${a.ownerCount}:${a.flags}:${a.previousTxnId}` : "?"}`;
}

export function summarize(report: AgreementReport, used: AccountInfo | null): AgreementSummary {
  const answered = report.sources.filter((s) => s.ledgerHash && s.account !== undefined);
  const groups = new Map<string, SourceReading[]>();
  for (const s of answered) groups.set(fingerprint(s), [...(groups.get(fingerprint(s)) ?? []), s]);
  const largest = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const base = {
    ledgerIndex: report.ledgerIndex,
    answered: answered.length,
    total: report.sources.length,
    agreeing: largest.length,
    ledgerHash: largest[0]?.ledgerHash,
  };
  if (groups.size > 1) return { ...base, outcome: "disagreed" };
  if (answered.length < 2) return { ...base, outcome: "uncorroborated" };
  if (used && !sameState(used, largest[0].account)) return { ...base, outcome: "moved" };
  return { ...base, outcome: "agreed" };
}

/** True when the state the nodes agree on is the state the verdict used. */
function sameState(used: AccountInfo, agreed: SourceState | null | undefined): boolean {
  if (agreed === undefined) return false;
  if (agreed === null) return !!used.unfunded;
  if (used.unfunded) return false;
  return (
    (Number(agreed.balanceDrops) / 1_000_000).toFixed(2) === used.balanceXrp &&
    agreed.sequence === used.sequence &&
    agreed.ownerCount === used.ownerCount
  );
}

const short = (url: string) => url.replace(/^wss:\/\//, "");

/** The SOURCE_AGREEMENT rule, from a summary and the readings behind it. */
export function agreementCheck(report: AgreementReport, used: AccountInfo | null): PolicyCheck {
  const s = summarize(report, used);
  const at = `ledger ${s.ledgerIndex.toLocaleString("en-US")}`;
  const base = { id: "SOURCE_AGREEMENT", label: "Independent sources agree on the reading", severity: "warn" as const };
  switch (s.outcome) {
    case "agreed":
      return {
        ...base,
        passed: true,
        detail: `${s.agreeing} of ${s.total} public nodes returned ledger hash ${s.ledgerHash!.slice(0, 16)}… and identical account state at ${at}.`,
      };
    case "disagreed": {
      const lines = report.sources
        .filter((r) => r.ledgerHash)
        .map((r) => `${short(r.url)}: ${r.ledgerHash!.slice(0, 12)}…${r.account === null ? " (account absent)" : r.account ? ` seq ${r.account.sequence}` : ""}`);
      return { ...base, passed: false, detail: `Public nodes returned different state at ${at}: ${lines.join("; ")}. No GO is issued while sources disagree.` };
    }
    case "uncorroborated": {
      const silent = report.sources.filter((r) => !r.ledgerHash || r.account === undefined).map((r) => `${short(r.url)} (${r.error ?? "no answer"})`);
      return {
        ...base,
        passed: false,
        detail: `Only ${s.answered} of ${s.total} public nodes answered at ${at}, so the reading could not be corroborated. Not answering: ${silent.join("; ")}.`,
      };
    }
    case "moved":
      return {
        ...base,
        passed: false,
        detail: `${s.agreeing} of ${s.total} public nodes agree at ${at}, but on account state different from the reading this verdict used: the account changed after it was read. Read again before acting.`,
      };
  }
}

/** Offline adjudication: nothing live to compare, and the check says so. */
export function offlineAgreementCheck(snapshotLedger: number): PolicyCheck {
  return {
    id: "SOURCE_AGREEMENT",
    label: "Independent sources agree on the reading",
    severity: "warn",
    passed: true,
    state: "NOT_APPLICABLE",
    detail: `Adjudicated against a captured snapshot of ledger ${snapshotLedger.toLocaleString("en-US")}; there is no live reading to compare across nodes.`,
  };
}

/** No validated ledger index was known, so there was nothing to ask the nodes about. */
export function unknownLedgerAgreementCheck(): PolicyCheck {
  return {
    id: "SOURCE_AGREEMENT",
    label: "Independent sources agree on the reading",
    severity: "warn",
    passed: false,
    detail: "No validated ledger index was known when the verdict was issued, so the reading could not be compared across nodes.",
  };
}

type Reply = Record<string, any>;

/**
 * One node's answer, from its `ledger` and `account_info` replies. Accepts
 * the WebSocket shape (status and error beside `result`) and the JSON-RPC
 * shape (inside it), so recorded HTTP replies test the same parser.
 */
export function readingFromReplies(url: string, ledger: Reply, info: Reply): SourceReading {
  const statusOf = (r: Reply) => r.status ?? r.result?.status;
  const errorOf = (r: Reply) => r.error ?? r.result?.error;
  if (statusOf(ledger) !== "success" || ledger.result?.validated !== true) {
    return { url, error: String(errorOf(ledger) ?? "ledger not validated on this node") };
  }
  const hash = String(ledger.result?.ledger_hash ?? "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hash)) return { url, error: "no ledger hash" };
  if (statusOf(info) !== "success") {
    const code = errorOf(info);
    if (code === "actNotFound") return { url, ledgerHash: hash, account: null };
    return { url, ledgerHash: hash, error: String(code ?? "account_info failed") };
  }
  const d = info.result?.account_data ?? {};
  return {
    url,
    ledgerHash: hash,
    account: {
      balanceDrops: String(d.Balance ?? ""),
      sequence: Number(d.Sequence ?? 0),
      ownerCount: Number(d.OwnerCount ?? 0),
      flags: Number(d.Flags ?? 0),
      previousTxnId: typeof d.PreviousTxnID === "string" ? d.PreviousTxnID : null,
    },
  };
}

function probe(url: string, subject: string, ledgerIndex: number): Promise<SourceReading> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    let settled = false;
    const replies = new Map<number, Reply>();
    const finish = (r: SourceReading) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        /* already closing */
      }
      resolve(r);
    };
    const timer = window.setTimeout(() => finish({ url, error: `no answer within ${TIMEOUT_MS / 1000}s` }), TIMEOUT_MS);
    try {
      socket = new WebSocket(url);
    } catch (e) {
      finish({ url, error: e instanceof Error ? e.message : "could not open socket" });
      return;
    }
    socket.onerror = () => finish({ url, error: "connection refused or blocked" });
    socket.onopen = () => {
      socket.send(JSON.stringify({ id: 1, command: "ledger", ledger_index: ledgerIndex }));
      socket.send(JSON.stringify({ id: 2, command: "account_info", account: subject, ledger_index: ledgerIndex }));
    };
    socket.onmessage = (event) => {
      let msg: Reply;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return finish({ url, error: "unreadable response" });
      }
      if (msg.id !== 1 && msg.id !== 2) return;
      replies.set(msg.id, msg);
      if (replies.size === 2) finish(readingFromReplies(url, replies.get(1)!, replies.get(2)!));
    };
  });
}

/**
 * Ask every public node for the ledger hash and the subject's AccountRoot at
 * `ledgerIndex`. A node that has not yet validated that ledger is asked once
 * more after one close.
 */
export async function readAgreement(subject: string, ledgerIndex: number, nodes: readonly string[] = PUBLIC_NODES): Promise<AgreementReport> {
  const first = await Promise.all(nodes.map((url) => probe(url, subject, ledgerIndex)));
  const behind = first.filter((r) => !r.ledgerHash && /lgrNotFound|not validated/i.test(r.error ?? ""));
  let sources = first;
  if (behind.length) {
    await new Promise((r) => setTimeout(r, RETRY_AFTER_MS));
    const retried = await Promise.all(behind.map((r) => probe(r.url, subject, ledgerIndex)));
    sources = first.map((r) => retried.find((x) => x.url === r.url) ?? r);
  }
  return { ledgerIndex, sources, readAt: new Date().toISOString() };
}
