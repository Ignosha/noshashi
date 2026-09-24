/**
 * The website pond's one data source: the XRPL ledger stream.
 *
 * The site's CSP allows these three public servers (vercel.json), and the
 * app's own link (src/lib/xrpl/link.ts) reads the same ones. One
 * `subscribe` to the ledger stream: each validated ledger that closes
 * arrives as one small message, and each becomes one ring. Nothing is
 * sent but the subscription, and no key or account is involved.
 */

export const LEDGER_SERVERS = ["wss://xrplcluster.com", "wss://s1.ripple.com", "wss://s2.ripple.com"] as const;

export type LedgerClose = { index: number; txnCount: number };

/** A `ledgerClosed` stream message, or null for anything else. */
export function parseLedgerClose(raw: unknown): LedgerClose | null {
  let m: Record<string, unknown>;
  try {
    m = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>);
  } catch {
    return null;
  }
  if (!m || m.type !== "ledgerClosed") return null;
  const index = Number(m.ledger_index);
  const txnCount = Number(m.txn_count ?? 0);
  if (!Number.isInteger(index) || index <= 0 || !Number.isFinite(txnCount)) return null;
  return { index, txnCount };
}

/**
 * Follow the ledger stream until stopped, moving to the next server when
 * one drops. `onState` reports whether a server is currently delivering.
 */
export function followLedger(onClose: (close: LedgerClose) => void, onState: (live: boolean) => void): () => void {
  let stopped = false;
  let socket: WebSocket | null = null;
  let server = 0;
  let retry = 1_000;
  let timer = 0;

  const connect = () => {
    if (stopped) return;
    const ws = new WebSocket(LEDGER_SERVERS[server % LEDGER_SERVERS.length]);
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, command: "subscribe", streams: ["ledger"] }));
    ws.onmessage = (event) => {
      const close = parseLedgerClose(event.data);
      if (!close) return;
      retry = 1_000;
      onState(true);
      onClose(close);
    };
    ws.onclose = () => {
      onState(false);
      if (stopped) return;
      server += 1;
      timer = window.setTimeout(connect, retry);
      retry = Math.min(retry * 2, 30_000);
    };
    ws.onerror = () => ws.close();
  };

  connect();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    socket?.close();
  };
}
