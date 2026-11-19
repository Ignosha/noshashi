/**
 * The ledger reads behind one decision, from validated ledgers on public
 * XRPL servers (JSON-RPC over HTTPS), plus the free NOSHASHI sanctions and
 * scam-registry lookups. Every read has a deadline: the Co-signer waits 30
 * seconds at most, and an unread fact becomes RETRY, never a pass.
 */
import { activationOf, type FundingHop, type SanctionEntry, type ThreatEntry } from "../../supabase/functions/_shared/xrplEvents.ts";
import { accountsToRead, type Facts } from "./guard.ts";

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>;

/** Two operators, so one outage or one bad node cannot decide alone: Ripple's s1 and the community-run xrplcluster.com, both on port 443 (firewalls often block 51234). Point these at your own rippled nodes in production. */
export const DEFAULT_SERVERS = ["https://s1.ripple.com/", "https://xrplcluster.com/"];
export const DEFAULT_NOSHASHI_API = "https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1";
const FUNDING_HOPS = 3;

export class RpcError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function rpc(server: string, method: string, params: Json, signal: AbortSignal): Promise<Json> {
  const response = await fetch(server, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method, params: [params] }), signal });
  if (!response.ok) throw new RpcError("http", `${server} answered HTTP ${response.status} to ${method}`);
  const body = (await response.json()) as Json;
  const result = (body.result ?? {}) as Json;
  if (result.status === "error" || result.error) throw new RpcError(String(result.error ?? "error"), `${method}: ${result.error_message ?? result.error}`);
  return result;
}

/** First server that answers. */
async function anyServer(servers: string[], method: string, params: Json, signal: AbortSignal): Promise<Json> {
  let last: unknown;
  for (const s of servers) {
    try {
      return await rpc(s, method, params, signal);
    } catch (e) {
      if (e instanceof RpcError && e.code !== "http" && e.code !== "error") throw e; // the ledger's own answer, e.g. actNotFound
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error(`No server answered ${method}.`);
}

async function accountInfo(servers: string[], account: string, signal: AbortSignal): Promise<Json | null> {
  try {
    return await anyServer(servers, "account_info", { account, ledger_index: "validated" }, signal);
  } catch (e) {
    if (e instanceof RpcError && e.code === "actNotFound") return null;
    throw e;
  }
}

async function fundingChain(servers: string[], account: string, signal: AbortSignal): Promise<FundingHop[]> {
  const chain: FundingHop[] = [];
  let next: string | null = account;
  const seen = new Set<string>();
  while (next && chain.length < FUNDING_HOPS && !seen.has(next)) {
    seen.add(next);
    let hop: FundingHop;
    try {
      const r = await anyServer(servers, "account_tx", { account: next, ledger_index_min: -1, ledger_index_max: -1, forward: true, limit: 1 }, signal);
      hop = activationOf(next, ((r.transactions ?? []) as Json[])[0] ?? null);
    } catch {
      hop = { account: next, fundedBy: null, activatedLedger: null };
    }
    chain.push(hop);
    next = hop.fundedBy;
  }
  return chain;
}

export async function sanctionsFor(api: string, addresses: string[], signal: AbortSignal): Promise<Record<string, SanctionEntry> | null> {
  if (!addresses.length) return {};
  try {
    const r = await fetch(`${api}/noshashi-xrpl-watch/sanctions?addresses=${addresses.join(",")}`, { signal });
    if (!r.ok) return null;
    const body = (await r.json()) as { hits?: SanctionEntry[] };
    return Object.fromEntries((body.hits ?? []).map((h) => [h.address, h]));
  } catch {
    return null;
  }
}

export async function threatsFor(api: string, addresses: string[], signal: AbortSignal): Promise<Record<string, ThreatEntry> | null> {
  if (!addresses.length) return {};
  try {
    const r = await fetch(`${api}/noshashi-xrpl-watch/threats?addresses=${addresses.join(",")}`, { signal });
    if (!r.ok) return null;
    const body = (await r.json()) as { hits?: Array<{ address: string; reports: number; categories: string[]; first_confirmed: string }> };
    return Object.fromEntries((body.hits ?? []).map((h) => [h.address, { address: h.address, reports: h.reports, categories: h.categories, firstConfirmed: h.first_confirmed }]));
  } catch {
    return null;
  }
}

/** simulate's reply, as Facts records it. */
export function simulationFrom(server: string, result: Json): Facts["simulations"][number] {
  return { server, engineResult: String(result.engine_result ?? ""), message: result.engine_result_message, ledgerIndex: Number(result.ledger_index) || undefined };
}

/** The transaction as simulate takes it: unsigned. */
export function forSimulation(tx: Json): Json {
  const { TxnSignature: _sig, Signers: _signers, hash: _hash, ...rest } = tx;
  return rest;
}

/** Answers that mean "not at this fee, right now", given before the transaction itself is evaluated. */
export const FEE_ONLY = new Set(["telCAN_NOT_QUEUE", "telCAN_NOT_QUEUE_FEE", "telCAN_NOT_QUEUE_FULL", "telINSUF_FEE_P", "terQUEUED"]);

/**
 * simulate on one server. Under load a low fee is refused before the
 * transaction is looked at, so a fee-only answer is retried once with the
 * server's current open-ledger fee. Only the simulated copy changes; the
 * transaction being signed, and its hash, do not.
 */
export async function simulateOn(server: string, tx: Json, signal: AbortSignal): Promise<Facts["simulations"][number]> {
  try {
    const first = simulationFrom(server, await rpc(server, "simulate", { tx_json: forSimulation(tx) }, signal));
    if (!FEE_ONLY.has(String(first.engineResult))) return first;
    const fee = await rpc(server, "fee", {}, signal);
    const open = String(fee.drops?.open_ledger_fee ?? "");
    if (!/^\d+$/.test(open) || BigInt(open) <= BigInt(String(tx.Fee ?? "0") || "0")) return first;
    const again = simulationFrom(server, await rpc(server, "simulate", { tx_json: { ...forSimulation(tx), Fee: open } }, signal));
    return { ...again, feeRaised: { from: String(tx.Fee ?? ""), to: open, firstAnswer: String(first.engineResult) } };
  } catch (e) {
    return { server, error: (e as Error).message };
  }
}

export async function gather(tx: Json, opts: { servers?: string[]; noshashiApi?: string; deadlineMs: number }): Promise<Facts> {
  const servers = opts.servers?.length ? opts.servers : DEFAULT_SERVERS;
  const api = opts.noshashiApi ?? DEFAULT_NOSHASHI_API;
  const signal = AbortSignal.timeout(opts.deadlineMs);
  const { destination, issuers } = accountsToRead(tx);

  const simulations = Promise.all(servers.slice(0, 2).map((s) => simulateOn(s, tx, signal)));
  const [ledger, server] = await Promise.all([
    anyServer(servers, "ledger", { ledger_index: "validated" }, signal),
    anyServer(servers, "server_info", {}, signal),
  ]);
  const ledgerIndex = Number(ledger.ledger_index ?? ledger.ledger?.ledger_index);
  const reserveBaseXrp = Number(server.info?.validated_ledger?.reserve_base_xrp);
  if (!Number.isFinite(ledgerIndex) || !Number.isFinite(reserveBaseXrp)) throw new Error("The validated ledger could not be read.");

  const issuerInfo = Object.fromEntries(
    await Promise.all(issuers.map(async (i) => [i, await accountInfo(servers, i, signal).catch(() => null)] as const))
  );

  const facts: Facts = { ledgerIndex, reserveBaseXrp, sanctions: {}, threats: {}, issuers: issuerInfo, simulations: [] };
  if (destination) {
    facts.destinationInfo = await accountInfo(servers, destination, signal);
    facts.chain = facts.destinationInfo ? await fundingChain(servers, destination, signal) : [{ account: destination, fundedBy: null, activatedLedger: null }];
    const accounts = facts.chain.map((h) => h.account);
    [facts.sanctions, facts.threats] = await Promise.all([sanctionsFor(api, accounts, signal), threatsFor(api, accounts, signal)]);
  }
  facts.simulations = await simulations;
  return facts;
}
