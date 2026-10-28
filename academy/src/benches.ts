import type { SceneId } from "@/App";
import { certifyAuthority } from "@/lib/desk/authority";
import { bookFindings, readBook } from "@/lib/desk/book";
import { ammFindings, readAmm } from "@/lib/desk/amm";
import { readSettlement, settlementFindings } from "@/lib/desk/settlement";
import { provenanceFindings, readProvenance } from "@/lib/desk/provenance";
import { controlFindings, readControlSurface } from "@/lib/desk/control";
import { nftFindings, readNft } from "@/lib/desk/nft";
import { readSync } from "@/lib/net/sync";
import * as pay from "../../supabase/functions/noshashi-verify/payment.ts";

/**
 * Practice benches: the reading a NOSHASHI screen makes, made here.
 *
 * Each bench calls the same reader the NOSHASHI screen calls (the `@` alias
 * is NOSHASHI's own src/), against the live XRP Ledger, so a trainee sees
 * real, current results without NOSHASHI installed. A bench reads only the
 * value its lab step names: it is practice for a feature, not a free copy
 * of it.
 */

export type Severity = "critical" | "warn" | "info" | "ok";
export type BenchFinding = { id: string; severity: Severity; title: string; detail: string };
export type BenchResult = {
  headline: string;
  rows: Array<[string, string]>;
  findings: BenchFinding[];
};

export type Bench = { label: string; run: (value: string) => Promise<BenchResult> };

const fromChecks = (checks: Array<{ id: string; label: string; severity: "block" | "warn"; passed: boolean; detail: string }>): BenchFinding[] =>
  checks.map((c) => ({
    id: c.id,
    title: `${c.passed ? "PASS" : "FAIL"} · ${c.label}`,
    detail: c.detail,
    severity: c.passed ? "ok" : c.severity === "block" ? "critical" : "warn",
  }));

/** Benches for the NOSHASHI screens whose reading needs only the public ledger. */
export const BENCHES: Partial<Record<SceneId, Bench>> = {
  authority: {
    label: "CERTIFY AUTHORITY",
    run: async (issuer) => {
      const c = await certifyAuthority(issuer, { walkSupply: false });
      return {
        headline: `Verdict: ${c.verdict}`,
        rows: [
          ["Issuer", c.issuer],
          ["Ledger", c.ledgerIndex.toLocaleString("en-US")],
          ["Digest", c.digest],
        ],
        findings: fromChecks(c.checks),
      };
    },
  },
  book: {
    label: "READ THIS BOOK (USD)",
    run: async (issuer) => {
      const r = await readBook("USD", issuer);
      return { headline: "USD order book read", rows: [], findings: bookFindings(r) };
    },
  },
  amm: {
    label: "READ POOL GOVERNANCE",
    run: async (account) => {
      const r = await readAmm({ ammAccount: account });
      return { headline: "Pool governance read", rows: [], findings: ammFindings(r) };
    },
  },
  settlement: {
    label: "READ SETTLEMENT",
    run: async (hash) => {
      const r = await readSettlement(hash);
      return { headline: "Settlement read", rows: [], findings: settlementFindings(r) };
    },
  },
  provenance: {
    label: "TRACE PROVENANCE",
    run: async (address) => {
      const r = await readProvenance(address);
      return { headline: "Provenance traced", rows: [], findings: provenanceFindings(r) };
    },
  },
  treasury: {
    label: "READ CONTROL SURFACE",
    run: async (address) => {
      const r = await readControlSurface(address);
      return { headline: "Control surface read", rows: [], findings: controlFindings(r) };
    },
  },
  nft: {
    label: "READ TOKEN RIGHTS",
    run: async (tokenId) => {
      const r = await readNft(tokenId);
      return { headline: "Token rights read", rows: [], findings: nftFindings(r) };
    },
  },
  network: {
    label: "QUERY THE NODES",
    run: async () => {
      const r = await readSync();
      return {
        headline: `${r.reachableCount} of ${r.nodes.length} public nodes answered`,
        rows: r.nodes.map((n) => [n.url.replace("wss://", ""), n.reachable ? `ledger ${n.ledgerSeq?.toLocaleString("en-US") ?? "?"}` : `no answer (${n.error ?? "unreachable"})`]),
        findings: [],
      };
    },
  },
};

/* ------------------------------------------------------------------ */
/* Invoice check, decided by the same rules as the app                 */
/* ------------------------------------------------------------------ */

/** Two independent operators per network, read over WebSocket. */
const OPERATORS: Record<pay.Network, Array<{ name: string; url: string }>> = {
  mainnet: [
    { name: "xrplcluster.com", url: "wss://xrplcluster.com" },
    { name: "s2.ripple.com", url: "wss://s2.ripple.com" },
  ],
  testnet: [
    { name: "s.altnet.rippletest.net", url: "wss://s.altnet.rippletest.net:51233" },
    { name: "testnet.xrpl-labs.com", url: "wss://testnet.xrpl-labs.com" },
  ],
};

function readTx(op: { name: string; url: string }, hash: string): Promise<pay.SourceRead> {
  return new Promise((resolve) => {
    const observedAt = () => new Date().toISOString();
    let done = false;
    const finish = (r: pay.SourceRead, ws?: WebSocket) => {
      if (done) return;
      done = true;
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
      resolve(r);
    };
    let ws: WebSocket;
    try {
      ws = new WebSocket(op.url);
    } catch {
      finish({ status: "failed", source: op.name, observed_at: observedAt(), error: "could not connect" });
      return;
    }
    const timer = window.setTimeout(() => finish({ status: "failed", source: op.name, observed_at: observedAt(), error: "timed out" }, ws), 12_000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, command: "tx", transaction: hash, binary: false, api_version: 2 }));
    ws.onerror = () => {
      window.clearTimeout(timer);
      finish({ status: "failed", source: op.name, observed_at: observedAt(), error: "could not connect" }, ws);
    };
    ws.onmessage = (e) => {
      window.clearTimeout(timer);
      try {
        const msg = JSON.parse(String(e.data));
        // A WebSocket reply carries errors at the top level and results under `result`.
        finish(pay.observe(op.name, observedAt(), msg.result ?? msg), ws);
      } catch {
        finish({ status: "failed", source: op.name, observed_at: observedAt(), error: "unreadable reply" }, ws);
      }
    };
  });
}

export type InvoiceRun = { network: pay.Network; hash: string; invoice: Record<string, unknown> };

export async function runInvoice({ network, hash, invoice }: InvoiceRun): Promise<BenchResult> {
  const policy = pay.parseInvoice(invoice);
  if (typeof policy === "string") throw new Error(policy);
  const reads = await Promise.all(OPERATORS[network].map((op) => readTx(op, hash)));
  const report = await pay.verify({ requestedHash: hash, network, reads, invoice: policy, priorInvoice: null, evaluatedAt: new Date().toISOString() });
  const amount = (a: typeof report.delivered_amount) =>
    a ? `${a.value} ${a.asset.kind === "xrp" ? "XRP" : a.asset.currency}` : "—";
  return {
    headline: `${report.status} · ${report.reason_code}`,
    rows: [
      ["Network", network],
      ["Ledger", report.ledger_index?.toLocaleString("en-US") ?? "—"],
      ["Requested", amount(report.requested_amount)],
      ["Delivered", amount(report.delivered_amount)],
      ["Difference", report.amount_difference ?? "—"],
      ["Read from", report.sources.join(" and ") || "no source answered"],
      ["Evidence digest", report.evidence_digest],
    ],
    findings: report.findings.map((f) => ({
      id: f.code,
      title: f.code,
      detail: f.explanation,
      severity: report.status === "VERIFIED" ? "ok" : report.status === "HOLD" ? "warn" : "critical",
    })),
  };
}
