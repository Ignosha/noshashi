/**
 * Ledger sync — what several public nodes say, and where they disagree.
 *
 * Every other tool in NOSHASHI asks one endpoint a question and renders the
 * answer. This one asks several the same question at once, because the
 * answer to "is the network healthy" from a single node is not a fact about
 * the network — it is a fact about that node, and about the path between it
 * and this machine. A dashboard that prints one node's `server_info` under
 * the heading NETWORK STATUS is asserting something it did not measure.
 *
 * So this reports nodes, plural, names them, and treats disagreement between
 * them as the signal rather than an error to smooth over.
 *
 * Three things it must not get wrong, all verified on 2026-08-27:
 *
 *   1. `s1.ripple.com` and `s2.ripple.com` redact `build_version`,
 *      `server_state` and `peers` — they come back absent, not empty. That
 *      is a disclosure choice by the operator, not a fault and not an
 *      unknown, and it is rendered as "not disclosed" rather than as a gap.
 *
 *   2. Ledgers close every three to four seconds, so nodes sitting one or
 *      two sequences apart are mid-close, not divergent. Painting normal
 *      cadence as drift would make the tool cry wolf on every read.
 *
 *   3. The latency figure spans DNS, TLS, the WebSocket upgrade and the
 *      first response. It says as much about this machine's connection as
 *      about the node, and it is labelled as reachability, never as the
 *      node's own speed.
 */

export const PUBLIC_NODES = [
  "wss://xrplcluster.com",
  "wss://s1.ripple.com",
  "wss://s2.ripple.com",
  "wss://xrpl.ws",
] as const;

/** Ledgers close every ~3-4s; this many behind is cadence, not lag. */
const NORMAL_SPREAD = 2;
/** At this many sequences behind the leader a node is genuinely trailing. */
const LAG_THRESHOLD = 4;
const PROBE_TIMEOUT_MS = 12_000;

export type NodeReading = {
  url: string;
  reachable: boolean;
  /** Connect-through-first-response, from this machine. Not the node's speed. */
  roundTripMs?: number;
  error?: string;
  ledgerSeq?: number;
  /** Seconds since that ledger closed, as the node reports it. */
  ledgerAge?: number;
  /** undefined means the operator does not disclose it, not that it is unknown. */
  version?: string;
  serverState?: string;
  peers?: number;
  /** Earliest ledger the node retains. 32570 is the full history genesis. */
  historyFrom?: number;
  amendmentBlocked?: boolean;
};

export type SyncReport = {
  nodes: NodeReading[];
  reachableCount: number;
  /** Highest sequence any node reported. */
  leaderSeq?: number;
  /** Highest minus lowest across reachable nodes. */
  spread?: number;
  fee?: FeeReading;
  readAt: string;
};

export type FeeReading = {
  source: string;
  /** Multiple of the reference fee to enter the current open ledger. */
  pressure: number;
  queueSize: number;
  maxQueueSize: number;
  expectedLedgerSize: number;
  minimumFeeDrops: number;
  openLedgerFeeDrops: number;
};

function probeNode(url: string): Promise<NodeReading> {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let socket: WebSocket;

    const finish = (reading: NodeReading) => {
      if (settled) return;
      settled = true;
      try {
        socket?.close();
      } catch {
        /* already closing */
      }
      resolve(reading);
    };

    try {
      socket = new WebSocket(url);
    } catch (caught) {
      finish({
        url,
        reachable: false,
        error: caught instanceof Error ? caught.message : "could not open socket",
      });
      return;
    }

    const timer = window.setTimeout(
      () => finish({ url, reachable: false, error: "no response within 12s" }),
      PROBE_TIMEOUT_MS
    );

    socket.onerror = () => {
      window.clearTimeout(timer);
      finish({ url, reachable: false, error: "connection refused or blocked" });
    };

    socket.onopen = () => {
      socket.send(JSON.stringify({ id: 1, command: "server_info" }));
    };

    socket.onmessage = (event) => {
      window.clearTimeout(timer);
      try {
        const info = JSON.parse(String(event.data))?.result?.info ?? {};
        const validated = info.validated_ledger ?? {};
        const history = String(info.complete_ledgers ?? "").split("-")[0];
        finish({
          url,
          reachable: true,
          roundTripMs: Date.now() - started,
          ledgerSeq: Number(validated.seq) || undefined,
          ledgerAge: typeof validated.age === "number" ? validated.age : undefined,
          // Absent on s1/s2 by operator choice — preserved as undefined.
          version: typeof info.build_version === "string" ? info.build_version : undefined,
          serverState: typeof info.server_state === "string" ? info.server_state : undefined,
          peers: typeof info.peers === "number" ? info.peers : undefined,
          historyFrom: Number(history) || undefined,
          amendmentBlocked:
            typeof info.amendment_blocked === "boolean" ? info.amendment_blocked : undefined,
        });
      } catch {
        finish({ url, reachable: false, error: "unreadable response" });
      }
    };
  });
}

function probeFee(url: string): Promise<FeeReading | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket;
    const finish = (value: FeeReading | undefined) => {
      if (settled) return;
      settled = true;
      try {
        socket?.close();
      } catch {
        /* already closing */
      }
      resolve(value);
    };

    try {
      socket = new WebSocket(url);
    } catch {
      finish(undefined);
      return;
    }

    const timer = window.setTimeout(() => finish(undefined), PROBE_TIMEOUT_MS);
    socket.onerror = () => {
      window.clearTimeout(timer);
      finish(undefined);
    };
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, command: "fee" }));
    socket.onmessage = (event) => {
      window.clearTimeout(timer);
      try {
        const r = JSON.parse(String(event.data))?.result ?? {};
        const levels = r.levels ?? {};
        const reference = Number(levels.reference_level) || 256;
        finish({
          source: url,
          pressure: (Number(levels.open_ledger_level) || reference) / reference,
          queueSize: Number(r.current_queue_size ?? 0),
          maxQueueSize: Number(r.max_queue_size ?? 0),
          expectedLedgerSize: Number(r.expected_ledger_size ?? 0),
          minimumFeeDrops: Number(r.drops?.minimum_fee ?? 0),
          openLedgerFeeDrops: Number(r.drops?.open_ledger_fee ?? 0),
        });
      } catch {
        finish(undefined);
      }
    };
  });
}

export async function readSync(): Promise<SyncReport> {
  const [nodes, fee] = await Promise.all([
    Promise.all(PUBLIC_NODES.map(probeNode)),
    probeFee(PUBLIC_NODES[0]),
  ]);

  const seqs = nodes
    .filter((n) => n.reachable && typeof n.ledgerSeq === "number")
    .map((n) => n.ledgerSeq as number);

  return {
    nodes,
    reachableCount: nodes.filter((n) => n.reachable).length,
    leaderSeq: seqs.length > 0 ? Math.max(...seqs) : undefined,
    spread: seqs.length > 1 ? Math.max(...seqs) - Math.min(...seqs) : undefined,
    fee,
    readAt: new Date().toISOString(),
  };
}

export type SyncFinding = {
  id: string;
  severity: "critical" | "warn" | "info" | "ok";
  title: string;
  detail: string;
  action?: string;
};

export function syncFindings(report: SyncReport): SyncFinding[] {
  const out: SyncFinding[] = [];
  const total = report.nodes.length;

  if (report.reachableCount === 0) {
    out.push({
      id: "all-unreachable",
      severity: "critical",
      title: "No public node answered",
      detail: `All ${total} endpoints failed to respond. Every reading in this console depends on reaching one of them, so this is almost certainly a problem with this machine's network rather than with the ledger.`,
      action: "Check the connection here before drawing any conclusion about XRPL.",
    });
    return out;
  }

  const unreachable = report.nodes.filter((n) => !n.reachable);
  if (unreachable.length > 0) {
    out.push({
      id: "some-unreachable",
      severity: "warn",
      title: `${unreachable.length} of ${total} nodes did not answer`,
      detail: unreachable
        .map((n) => `${n.url} — ${n.error ?? "no response"}`)
        .join(". "),
      action:
        "A single unreachable endpoint is routine. All-but-one usually means this machine, not the ledger.",
    });
  }

  // Lag, measured against the furthest-ahead node rather than a clock.
  if (typeof report.leaderSeq === "number") {
    const trailing = report.nodes.filter(
      (n) =>
        n.reachable &&
        typeof n.ledgerSeq === "number" &&
        (report.leaderSeq as number) - n.ledgerSeq >= LAG_THRESHOLD
    );
    if (trailing.length > 0) {
      out.push({
        id: "node-lag",
        severity: "warn",
        title: `${trailing.length} node${trailing.length === 1 ? " is" : "s are"} behind the others`,
        detail: trailing
          .map(
            (n) =>
              `${n.url} is ${(report.leaderSeq as number) - (n.ledgerSeq as number)} ledgers back`
          )
          .join(". ") + `. Ledgers close every three to four seconds, so this is beyond normal cadence.`,
        action: "Readings taken from a trailing node describe a ledger that has already moved on.",
      });
    } else if (typeof report.spread === "number" && report.spread <= NORMAL_SPREAD) {
      out.push({
        id: "in-sync",
        severity: "ok",
        title: `All ${report.reachableCount} reachable nodes agree`,
        detail:
          report.spread === 0
            ? `Every reachable node reports ledger ${report.leaderSeq.toLocaleString()}. They are on exactly the same ledger.`
            : `Sequences span ${report.spread} ledger${report.spread === 1 ? "" : "s"} at ${report.leaderSeq.toLocaleString()} — nodes mid-close, which is the normal cadence.`,
      });
    }
  }

  const blocked = report.nodes.filter((n) => n.amendmentBlocked === true);
  if (blocked.length > 0) {
    out.push({
      id: "amendment-blocked",
      severity: "critical",
      title: `${blocked.length} node${blocked.length === 1 ? " is" : "s are"} amendment-blocked`,
      detail: `${blocked.map((n) => n.url).join(", ")} cannot validate: an amendment has activated that this software does not implement. Anything read from it is stale by definition.`,
      action: "Do not rely on that endpoint until its operator upgrades.",
    });
  }

  const partial = report.nodes.filter(
    (n) => n.reachable && typeof n.historyFrom === "number" && n.historyFrom > 32_570
  );
  if (partial.length > 0) {
    out.push({
      id: "partial-history",
      severity: "info",
      title: `${partial.length} node${partial.length === 1 ? " keeps" : "s keep"} only recent history`,
      detail: partial
        .map((n) => `${n.url} retains from ledger ${n.historyFrom?.toLocaleString()}`)
        .join(". ") + ". Queries against older ledgers will fail there even though the node is healthy.",
    });
  }

  if (report.fee) {
    const f = report.fee;
    const queuePct = f.maxQueueSize > 0 ? f.queueSize / f.maxQueueSize : 0;
    if (f.pressure > 1) {
      out.push({
        id: "fee-pressure",
        severity: f.pressure >= 10 ? "warn" : "info",
        title: `Transactions cost ${f.pressure.toFixed(1)}x the reference fee right now`,
        detail: `The open ledger is charging ${f.openLedgerFeeDrops.toLocaleString()} drops against a ${f.minimumFeeDrops.toLocaleString()}-drop minimum, with ${f.queueSize.toLocaleString()} transactions queued of ${f.maxQueueSize.toLocaleString()} capacity. Fees on XRPL rise with load and fall back when it clears.`,
        action: "A transaction submitted at the minimum fee may sit in the queue until pressure drops.",
      });
    } else {
      out.push({
        id: "fee-clear",
        severity: "ok",
        title: "No fee pressure",
        detail: `The open ledger is charging the reference fee — ${f.openLedgerFeeDrops.toLocaleString()} drops — with ${f.queueSize.toLocaleString()} transactions queued of ${f.maxQueueSize.toLocaleString()} capacity (${(queuePct * 100).toFixed(1)}% full). Expected ledger size is ${f.expectedLedgerSize.toLocaleString()} transactions.`,
      });
    }
  }

  const undisclosed = report.nodes.filter((n) => n.reachable && n.version === undefined);
  if (undisclosed.length > 0) {
    out.push({
      id: "undisclosed",
      severity: "info",
      title: `${undisclosed.length} node${undisclosed.length === 1 ? " does" : "s do"} not disclose their software version`,
      detail: `${undisclosed.map((n) => n.url).join(", ")} answered normally but omit build version, server state and peer count. That is an operator's choice about what to publish — it is not a fault, and it is not something this tool can infer.`,
    });
  }

  const rank = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
