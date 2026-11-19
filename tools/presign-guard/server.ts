/**
 * NOSHASHI Pre-Sign Guard: the Callback Handler the Fireblocks API
 * Co-signer calls before it signs. Hosted by the institution, next to its
 * Co-signer; NOSHASHI never sees a request, a key or a decision.
 *
 *   node --experimental-strip-types tools/presign-guard/server.ts guard.config.json
 *
 * Endpoints (public key authentication, a JWT each way):
 *   POST /v2/tx_sign_request             the decision, from guard.ts
 *   POST /v2/config_change_sign_request  the policy's configChanges answer
 *   GET  /healthz                        200 when the policy and keys loaded
 *
 * Every decision is appended to the audit log as one JSON line whose hash
 * chains to the line before, so a deleted or edited line shows.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttps } from "node:https";
import type { KeyObject } from "node:crypto";
import { canonical, checks, decide, extract, loadPolicy, sha256, type Decision, type Facts, type Policy } from "./guard.ts";
import { gather } from "./ledger.ts";
import { privateKey, publicKey, signJwt, verifyJwt } from "./jwt.ts";

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>;

export type Config = {
  listen: { host: string; port: number };
  /** PEM paths. Without them, serve plain HTTP behind your own TLS terminator; Fireblocks requires HTTPS at the edge. */
  tls?: { cert: string; key: string };
  cosignerPublicKey: string;
  handlerPrivateKey: string;
  policy: string;
  auditLog: string;
  servers?: string[];
  noshashiApi?: string;
};

/** Decisions must be back well inside the Co-signer's 30 seconds. */
const DEADLINE_MS = 20_000;
const MAX_BODY = 1_000_000;

export type Deps = {
  policy: Policy;
  policyHash: string;
  cosignerKey: KeyObject;
  handlerKey: KeyObject;
  gather: (tx: Json) => Promise<Facts>;
  log: (line: Json) => void;
  now: () => Date;
};

/** One tx_sign_request (the verified JWT payload) to a decision. */
export async function decideRequest(req: Json, deps: Deps): Promise<Decision> {
  const { policy } = deps;
  const decidedAt = deps.now().toISOString();
  const ex = extract(req, policy);
  if (ex.kind === "other") {
    const findings = [{ id: "other_chain", severity: policy.otherAssets === "reject" ? "critical" : "info", title: `${req.asset} is not an XRP Ledger asset`, detail: `This guard inspects XRPL transactions only; policy.otherAssets is "${policy.otherAssets}".` }] as const;
    return decide(req, [...findings], policy, { seen: null, ledgerIndex: null, policyHash: deps.policyHash, decidedAt });
  }
  if (!ex.tx) return decide(req, ex.findings, policy, { seen: null, ledgerIndex: null, policyHash: deps.policyHash, decidedAt });
  let facts: Facts;
  try {
    facts = await deps.gather(ex.tx);
  } catch (e) {
    const findings = [...ex.findings, { id: "ledger_unread", severity: "retry" as const, title: "The ledger could not be read in time", detail: (e as Error).message }];
    return decide(req, findings, policy, { seen: ex, ledgerIndex: null, policyHash: deps.policyHash, decidedAt, tx: ex.tx });
  }
  return decide(req, [...ex.findings, ...checks(ex.tx, facts, policy)], policy, { seen: ex, ledgerIndex: facts.ledgerIndex, policyHash: deps.policyHash, decidedAt, tx: ex.tx });
}

/** The audit log: one JSON line per decision, each hashing the one before. */
export function auditLog(path: string): (line: Json) => void {
  let prev = "0".repeat(64);
  if (existsSync(path)) {
    const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
    if (lines.length) prev = String(JSON.parse(lines[lines.length - 1]).entryHash);
  }
  return (line) => {
    const entry = { ...line, prevHash: prev };
    const entryHash = sha256(canonical(entry));
    appendFileSync(path, JSON.stringify({ ...entry, entryHash }) + "\n", { mode: 0o600 });
    prev = entryHash;
  };
}

/** Recompute the chain; returns the first broken line number, or null when intact. */
export function verifyAuditLog(text: string): number | null {
  let prev = "0".repeat(64);
  const lines = text.trim().split("\n").filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const { entryHash, ...entry } = JSON.parse(lines[i]) as Json;
    if (entry.prevHash !== prev || sha256(canonical(entry)) !== entryHash) return i + 1;
    prev = entryHash;
  }
  return null;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function handler(deps: Deps) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, body: string, type = "application/jwt") => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
      res.end(body);
    };
    if (req.method === "GET" && req.url === "/healthz") return send(200, "ok", "text/plain");
    const path = (req.url ?? "").split("?")[0];
    if (req.method !== "POST" || (path !== "/v2/tx_sign_request" && path !== "/v2/config_change_sign_request")) return send(404, "not found", "text/plain");

    let payload: Json;
    try {
      payload = verifyJwt(await readBody(req), deps.cosignerKey);
    } catch (e) {
      deps.log({ kind: "unauthenticated", path, error: (e as Error).message, at: deps.now().toISOString() });
      return send(401, "unauthorized", "text/plain");
    }
    const requestId = String(payload.requestId ?? "");

    if (path === "/v2/config_change_sign_request") {
      const action = deps.policy.configChanges.toUpperCase();
      deps.log({ kind: "config_change", requestId, action, type: payload.type ?? null, at: deps.now().toISOString() });
      return send(200, signJwt({ action, requestId, ...(action === "REJECT" ? { rejectionReason: "Configuration changes are refused by the Pre-Sign Guard policy." } : {}) }, deps.handlerKey));
    }

    let decision: Decision;
    try {
      decision = await Promise.race([
        decideRequest(payload, deps),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("deadline")), DEADLINE_MS + 2_000).unref()),
      ]);
    } catch (e) {
      // Not decided in time: ask the Co-signer to come back, never sign blind.
      deps.log({ kind: "undecided", requestId, error: (e as Error).message, at: deps.now().toISOString() });
      return send(200, signJwt({ action: "RETRY", requestId }, deps.handlerKey));
    }
    deps.log({ kind: "decision", receipt: decision.receipt, receiptHash: decision.receiptHash, findings: decision.findings });
    const body: Json = { action: decision.action, requestId };
    if (decision.rejectionReason) body.rejectionReason = `${decision.rejectionReason} [receipt ${decision.receiptHash.slice(0, 16)}]`;
    return send(200, signJwt(body, deps.handlerKey));
  };
}

export function start(configPath: string) {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as Config;
  const policyText = readFileSync(config.policy, "utf8");
  const deps: Deps = {
    policy: loadPolicy(JSON.parse(policyText)),
    policyHash: sha256(policyText),
    cosignerKey: publicKey(readFileSync(config.cosignerPublicKey)),
    handlerKey: privateKey(readFileSync(config.handlerPrivateKey)),
    gather: (tx) => gather(tx, { servers: config.servers, noshashiApi: config.noshashiApi, deadlineMs: DEADLINE_MS }),
    log: auditLog(config.auditLog),
    now: () => new Date(),
  };
  const h = handler(deps);
  const server = config.tls
    ? createHttps({ cert: readFileSync(config.tls.cert), key: readFileSync(config.tls.key) }, h)
    : createHttp(h);
  server.listen(config.listen.port, config.listen.host, () => {
    console.log(`Pre-Sign Guard ${deps.policy.mode} mode, policy ${deps.policy.version} (${deps.policyHash.slice(0, 12)}), on ${config.tls ? "https" : "http"}://${config.listen.host}:${config.listen.port}`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv[2]) {
    console.error("Usage: node --experimental-strip-types tools/presign-guard/server.ts <guard.config.json>");
    process.exit(2);
  }
  start(process.argv[2]);
}
