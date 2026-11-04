import { canonical } from "@/lib/compliance/registry";

export const INTEGRITY_NODES = [
  "wss://xrplcluster.com",
  "wss://s1.ripple.com",
  "wss://s2.ripple.com",
] as const;
type Request = (
  node: string,
  command: "ledger" | "ledger_entry",
  params: Record<string, unknown>,
) => Promise<Record<string, any>>;
export type Anchor = { hash: string; index: number; closeTime: number };
export type NodeEvidence = {
  node: string;
  status: "read" | "unavailable";
  nodeBinary?: string;
  sha256?: string;
  error?: string;
};
export type IntegrityReport = {
  scope: "noshashi-accountroot-integrity-v1";
  account: string;
  observedAt: string;
  anchor: Anchor;
  nodes: NodeEvidence[];
  status: "agreed" | "partial" | "insufficient" | "disagreement";
  anchorConflicts: boolean;
};
const hex = /^[A-Fa-f0-9]{64}$/;
export const integrityRequest: Request = (node, command, params) =>
  new Promise((resolve, reject) => {
    if (!(INTEGRITY_NODES as readonly string[]).includes(node)) {
      reject(Error("Node is not on the fixed read-only allow-list."));
      return;
    }
    let settled = false;
    let socket: WebSocket | undefined;
    const finish = (error?: string, value?: Record<string, any>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
      error ? reject(Error(error)) : resolve(value!);
    };
    const timer = setTimeout(
      () => finish("No bounded response within 8 seconds."),
      8000,
    );
    try {
      socket = new WebSocket(node);
      socket.onopen = () =>
        socket!.send(JSON.stringify({ id: 1, command, ...params }));
      socket.onmessage = (event) => {
        try {
          if (String(event.data).length > 262144)
            throw Error("Node response exceeds 256 KiB.");
          const data = JSON.parse(String(event.data));
          if (data.id !== 1) return;
          if (data.status === "error" || !data.result || data.result.error)
            finish("The node could not return the requested ledger object.");
          else finish(undefined, data.result);
        } catch {
          finish("Malformed node response.");
        }
      };
      socket.onerror = () => finish("Node connection failed.");
      socket.onclose = () => finish("Node closed before returning evidence.");
    } catch {
      finish("Node connection could not be opened.");
    }
  });
export function compareIntegrity(
  anchor: Anchor,
  nodes: NodeEvidence[],
  anchorConflicts = false,
): IntegrityReport["status"] {
  if (
    !hex.test(anchor.hash) ||
    new Set(nodes.map((n) => n.node)).size !== nodes.length
  )
    return "insufficient";
  const read = nodes.filter(
    (n) =>
      n.status === "read" &&
      typeof n.sha256 === "string" &&
      hex.test(n.sha256) &&
      typeof n.nodeBinary === "string" &&
      /^(?:[A-F0-9]{2})+$/.test(n.nodeBinary),
  );
  if (anchorConflicts || new Set(read.map((n) => n.sha256)).size > 1)
    return "disagreement";
  if (read.length < 2) return "insufficient";
  return read.length === nodes.length && nodes.length === INTEGRITY_NODES.length
    ? "agreed"
    : "partial";
}
export async function readLedgerIntegrity(
  account: string,
  request: Request = integrityRequest,
  now = Date.now(),
): Promise<IntegrityReport> {
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(account))
    throw Error("Enter a public XRPL classic address.");
  const claims = await Promise.allSettled(
    INTEGRITY_NODES.map(async (node) => {
      const r = await request(node, "ledger", {
        ledger_index: "validated",
        transactions: false,
      });
      const hash = String(
        r.ledger_hash ?? r.ledger?.ledger_hash ?? "",
      ).toUpperCase();
      const index = Number(r.ledger_index ?? r.ledger?.ledger_index);
      const closeTime = Number(r.ledger?.close_time);
      if (
        r.validated !== true ||
        !hex.test(hash) ||
        !Number.isSafeInteger(index) ||
        index <= 0 ||
        !Number.isFinite(closeTime) ||
        now - (closeTime + 946684800) * 1000 > 180000 ||
        (closeTime + 946684800) * 1000 > now + 30000
      )
        throw Error("Missing or stale validated-ledger anchor.");
      return { hash, index, closeTime };
    }),
  );
  const anchors = claims
    .flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
    .sort((a, b) => b.index - a.index);
  if (!anchors.length)
    throw Error(
      "No fresh validated-ledger anchor could be read. Comparison is unavailable.",
    );
  const anchor = anchors[0];
  const anchorConflicts = anchors.some(
    (a) => a.index === anchor.index && a.hash !== anchor.hash,
  );
  const nodes: NodeEvidence[] = await Promise.all(
    INTEGRITY_NODES.map(async (node) => {
      try {
        const r = await request(node, "ledger_entry", {
          account_root: account,
          ledger_hash: anchor.hash,
          binary: true,
        });
        const binary = String(r.node_binary ?? "").toUpperCase();
        if (
          r.validated !== true ||
          String(r.ledger_hash).toUpperCase() !== anchor.hash ||
          Number(r.ledger_index) !== anchor.index ||
          !/^(?:[A-F0-9]{2})+$/.test(binary) ||
          binary.length > 131072
        )
          throw Error("Missing binary evidence or mismatched ledger scope.");
        const { decode } = await import("ripple-binary-codec");
        const object = decode(binary);
        if (
          object.LedgerEntryType !== "AccountRoot" ||
          object.Account !== account
        )
          throw Error(
            "The binary object does not describe the requested AccountRoot.",
          );
        const payload = {
          scope: "noshashi-accountroot-integrity-v1",
          account,
          ledgerHash: anchor.hash,
          ledgerIndex: anchor.index,
          nodeBinary: binary,
        };
        const bytes = new TextEncoder().encode(canonical(payload));
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return {
          node,
          status: "read" as const,
          nodeBinary: binary,
          sha256: Array.from(new Uint8Array(digest), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join(""),
        };
      } catch (e) {
        return {
          node,
          status: "unavailable" as const,
          error: e instanceof Error ? e.message : "Read unavailable.",
        };
      }
    }),
  );
  return {
    scope: "noshashi-accountroot-integrity-v1",
    account,
    observedAt: new Date(now).toISOString(),
    anchor,
    nodes,
    anchorConflicts,
    status: compareIntegrity(anchor, nodes, anchorConflicts),
  };
}
