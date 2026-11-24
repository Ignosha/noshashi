/**
 * NOSHASHI Autopsy research gateway (local, read-only, opt-in).
 * This is NOT an enterprise production service. Auth is a single local secret,
 * rates are per-process, and provider availability is not under our control.
 */
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeIssuedCurrency } from "./xrpl-trustline-evidence.mjs";

const HEX64 = /^[0-9A-F]{64}$/;
export const UPSTREAMS = Object.freeze([
  { name: "InFTF", url: "https://xrplcluster.com/" },
  { name: "Honeycluster", url: "https://honeycluster.io/" },
]);
const MAX_RPC_RESPONSE_BYTES = 1024 * 1024;
const MAX_REQUEST_BYTES = 512;
const MAX_IN_FLIGHT = 4;

export function validRequest(body) {
  return !!body && typeof body === "object" && !Array.isArray(body) &&
    Object.keys(body).sort().join(",") === "hash,network" &&
    body.network === "xrpl-mainnet" &&
    typeof body.hash === "string" && HEX64.test(body.hash.toUpperCase());
}

export function unknownReport(hash, reason, sources = []) {
  return {
    schema: "noshashi.autopsy.v1",
    network: "xrpl-mainnet",
    hash, status: "UNKNOWN", validated: false, ledgerIndex: null,
    ledgerHash: null, resultCode: null, disposition: "UNKNOWN",
    reasonCodes: [reason], evidenceSources: sources, provenance: "incomplete",
    simulated: false,
  };
}

function positiveDecimal(value) {
  if (typeof value !== "string" || value.length > 180) return null;
  const parts = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d{1,3}))?$/i.exec(value);
  if (!parts) return null;
  const [, integer, fraction = "", exponent = "0"] = parts;
  const digits = (integer + fraction).replace(/^0+/, "");
  if (!digits) return null;
  const scale = fraction.length - Number(exponent);
  if (scale <= 0) return digits + "0".repeat(-scale);
  const padded = digits.padStart(scale + 1, "0");
  return (padded.slice(0, -scale) + "." + padded.slice(-scale)).replace(/0+$/, "").replace(/\.$/, "");
}

export function parseValidatedTx(raw, expectedHash) {
  const data = raw && typeof raw === "object" ? (raw.result ?? raw) : null;
  if (!data || data.status === "error" || data.error) return null;
  if (data.validated !== true) return null;
  const txHash = data.hash ?? data.tx_json?.hash;
  if (typeof txHash !== "string" || txHash.toUpperCase() !== expectedHash) return null;
  if (!Number.isSafeInteger(data.ledger_index) || data.ledger_index <= 0) return null;
  if (typeof data.ledger_hash !== "string" || !HEX64.test(data.ledger_hash.toUpperCase())) return null;
  const code = data.meta?.TransactionResult;
  // Only tesSUCCESS and tec-class outcomes are valid finalized ledger outcomes.
  if (typeof code !== "string" || !/^(tesSUCCESS|tec[A-Za-z0-9_]+)$/.test(code)) return null;
  const tx = data.tx_json ?? data;
  const paymentDestination = tx.TransactionType === "Payment" && typeof tx.Destination === "string" && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(tx.Destination) ? tx.Destination : null;
  // Delivered asset, not requested Amount/DeliverMax (partial payments can differ).
  const delivered = data.meta?.delivered_amount;
  const currency = normalizeIssuedCurrency(delivered?.currency);
  const issuer = delivered?.issuer;
  const paymentAsset = paymentDestination && code === "tesSUCCESS" && currency &&
    typeof issuer === "string" && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(issuer)
    ? {issuer, currency} : null;
  let deliveredAmount = null;
  if (paymentDestination && code === "tesSUCCESS") {
    if (typeof delivered === "string" && /^[1-9]\d{0,17}$/.test(delivered)) {
      deliveredAmount = { unit: "drops", value: delivered };
    } else if (paymentAsset) {
      const value = positiveDecimal(delivered.value);
      if (value !== null) deliveredAmount = { unit: "issued", value };
    }
  }
  return {
    deliveredAmount,
    paymentAsset,
    paymentDestination,
    ledgerIndex: data.ledger_index,
    ledgerHash: data.ledger_hash.toUpperCase(),
    resultCode: code,
  };
}

export async function fetchRpcTx(server, hash, fetchFn = fetch) {
  // URLs are fixed in code, never constructed from user input. Redirects are forbidden.
  const response = await fetchFn(server.url, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(4500),
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ method: "tx", params: [{
      transaction: hash, binary: false, api_version: 2,
    }] }),
  });
  if (!response.ok) throw new Error("UPSTREAM_HTTP_FAILURE");
  const size = Number(response.headers?.get?.("content-length") ?? 0);
  if (size > MAX_RPC_RESPONSE_BYTES) throw new Error("UPSTREAM_RESPONSE_TOO_LARGE");
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > MAX_RPC_RESPONSE_BYTES) throw new Error("UPSTREAM_RESPONSE_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Corroboration is two separate RPC provider reports, NOT a cryptographic ledger proof. */
export async function corroborateAutopsy(hash, { servers = UPSTREAMS, fetchFn = fetch } = {}) {
  if (typeof hash !== "string" || !HEX64.test(hash.toUpperCase())) throw new Error("INVALID_TRANSACTION_HASH");
  const normalized = hash.toUpperCase();
  if (servers.length !== 2 || servers[0].url === servers[1].url) {
    return unknownReport(normalized, "INDEPENDENT_SOURCES_NOT_CONFIGURED");
  }
  const results = await Promise.allSettled(servers.map(async server => ({
    source: server.name,
    tx: parseValidatedTx(await fetchRpcTx(server, normalized, fetchFn), normalized),
  })));
  const valid = results.map(r => r.status === "fulfilled" ? r.value : null);
  if (valid.some(r => !r?.tx)) return unknownReport(normalized, "INDEPENDENT_EVIDENCE_UNAVAILABLE");
  const [a,b] = valid;
  if (a.tx.ledgerIndex !== b.tx.ledgerIndex ||
      a.tx.ledgerHash !== b.tx.ledgerHash ||
      a.tx.resultCode !== b.tx.resultCode ||
      a.tx.paymentDestination !== b.tx.paymentDestination ||
      JSON.stringify(a.tx.deliveredAmount) !== JSON.stringify(b.tx.deliveredAmount) ||
      JSON.stringify(a.tx.paymentAsset) !== JSON.stringify(b.tx.paymentAsset)) {
    return unknownReport(normalized, "UPSTREAM_EVIDENCE_DISAGREEMENT", [a.source, b.source]);
  }
  return {
    schema: "noshashi.autopsy.v1", network: "xrpl-mainnet", hash: normalized,
    status: "VERIFIED_FACT", validated: true,
    ledgerIndex: a.tx.ledgerIndex, ledgerHash: a.tx.ledgerHash,
    resultCode: a.tx.resultCode,
    paymentDestination: a.tx.paymentDestination,
    paymentAsset: a.tx.paymentAsset,
    deliveredAmount: a.tx.deliveredAmount,
    disposition: a.tx.resultCode === "tesSUCCESS" ? "SUCCESS" : "FAILED",
    reasonCodes: a.tx.resultCode === "tesSUCCESS" ? [] : [a.tx.resultCode],
    evidenceSources: [a.source, b.source],
    provenance: "two-rpc-providers",
    simulated: false,
  };
}

function safeKeyEquals(candidate, secret) {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

function readRequestBody(req, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const cleanup = () => {
      clearTimeout(timer);
      req.off("data", onData).off("end", onEnd).off("error", onError);
    };
    const fail = (error) => {
      cleanup();
      req.pause();
      req.once("error", () => {});
      reject(error);
    };
    const onData = (chunk) => {
      total += chunk.byteLength;
      if (total > MAX_REQUEST_BYTES) fail(new Error("TOO_LARGE"));
      else chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const onError = (error) => fail(error);
    const timer = setTimeout(() => fail(new Error("BODY_TIMEOUT")), timeoutMs);
    req.on("data", onData).once("end", onEnd).once("error", onError);
  });
}

export function createAutopsyGateway({ apiKey, lookup = corroborateAutopsy, limit = 30, bodyTimeoutMs = 2000 } = {}) {
  if (typeof apiKey !== "string" || apiKey.length < 32) throw new Error("A 32+ character local API secret is required.");
  const rates = new Map();
  let active = 0;
  return http.createServer({
    headersTimeout: 5000, requestTimeout: 10000, connectionsCheckingInterval: 1000,
  }, async (req, res) => {
    const json = (code, data, additionalHeaders = {}) => {
      res.writeHead(code, { "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store", "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer", ...(!req.complete ? { connection: "close" } : {}), ...additionalHeaders });
      res.end(JSON.stringify(data));
    };
    if (req.url === "/health" && req.method === "GET") {
      json(200, { status: "ok", mode: "local-research", productionReady: false });
      return;
    }
    if (req.url !== "/v1/xrpl/transactions/autopsy" || req.method !== "POST") {
      json(404, { error: "NOT_FOUND" }); return;
    }
    const client = req.socket.remoteAddress ?? "unknown";
    const current = Date.now();
    // Bound memory with periodic lazy cleanup. Per-process quota is NOT distributed rate limiting.
    if (rates.size > 5000) for (const [key, item] of rates) if (item.until < current) rates.delete(key);
    const entry = rates.get(client) ?? { until: current + 60_000, count: 0 };
    if (entry.until <= current) { entry.until = current + 60_000; entry.count = 0; }
    entry.count++;
    rates.set(client, entry);
    if (entry.count > limit) {
      json(429, { error: "RATE_LIMITED" }, { "retry-after": String(Math.ceil((entry.until - current) / 1000)) }); return;
    }
    const match = /^Bearer ([!-~]{1,256})$/.exec(req.headers.authorization ?? "");
    if (!match || !safeKeyEquals(match[1], apiKey)) {
      json(401, { error: "UNAUTHORIZED" }); return;
    }
    if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers["content-type"] ?? ""))) {
      json(415, { error: "UNSUPPORTED_MEDIA_TYPE" }); return;
    }
    if (Number(req.headers["content-length"]) > MAX_REQUEST_BYTES) {
      json(413, { error: "PAYLOAD_TOO_LARGE" }, { connection: "close" }); return;
    }
    if (active >= MAX_IN_FLIGHT) { json(503, { error: "BUSY" }); return; }
    active++;
    try {
      const body = await readRequestBody(req, bodyTimeoutMs);
      let payload;
      try { payload = JSON.parse(body); }
      catch { json(400, { error: "INVALID_JSON" }); return; }
      if (!validRequest(payload)) { json(400, { error: "INVALID_REQUEST" }); return; }
      const result = await lookup(payload.hash.toUpperCase());
      json(200, result);
    } catch (error) {
      if (res.destroyed || req.socket.destroyed) return;
      if (error?.message === "BODY_TIMEOUT")
        json(408, { error: "BODY_TIMEOUT" }, { connection: "close" });
      else if (error?.message === "TOO_LARGE")
        json(413, { error: "PAYLOAD_TOO_LARGE" }, { connection: "close" });
      else json(503, { error: "LOOKUP_UNAVAILABLE" });
    } finally { active--; }
  });
}

// Explicit opt-in. No secret => no service. Local loopback only, never publicly bound.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createAutopsyGateway({ apiKey: process.env.NOSHASHI_AUTOPSY_LOCAL_KEY });
  server.listen(Number(process.env.NOSHASHI_AUTOPSY_LOCAL_PORT ?? 1442), "127.0.0.1",
    () => console.log("NOSHASHI local research gateway listening on 127.0.0.1 (not production)."));
}
