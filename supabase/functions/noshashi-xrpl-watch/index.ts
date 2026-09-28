/**
 * noshashi-xrpl-watch — XRPL event feeds and deposit screening.
 *
 *   POST /tick     Called every minute by pg_cron (noshashi.xrpl_watch_kick)
 *                  while any watch is active. Reads each due watch's new
 *                  validated transactions, classifies them into events,
 *                  screens incoming payments to deposit addresses, and
 *                  records them. Recording fires the organization's signed
 *                  webhooks (xrpl_event, deposit_screened) in the database.
 *                  Auth: the random token kept in Vault.
 *
 *   GET  /events   The organization's event feed. Cursor-paged by event id,
 *                  JSON or NDJSON, optionally shaped by one of the
 *                  organization's export schemas (?schema=<id>).
 *                  Auth: an organization-scoped nsh_live_ key.
 *
 *   POST /history  Any account's events over a ledger range, read live,
 *                  classified (and screened, if asked) as a watch would.
 *                  Auth: an organization-scoped nsh_live_ key.
 *
 *   POST /screen   Screen one incoming payment before crediting it:
 *                  { hash, deposit_address, config? }. Uses the watch's
 *                  deposit configuration when the address is watched.
 *                  Auth: an organization-scoped nsh_live_ key.
 *
 *   GET  /sanctions?addresses=r…,r…
 *                  Which of up to 50 addresses are on the OFAC SDN list
 *                  (noshashi.sanctioned_addresses, refreshed daily from
 *                  treasury.gov), and as of when. Public: no key, any origin.
 *
 *   GET  /domain-verify?address=r…  |  ?domain=example.com
 *                  Does the domain an account claims list it back in its
 *                  /.well-known/xrp-ledger.toml (the only proof of a Domain
 *                  field)? Or: which accounts a domain lists, and whether
 *                  each names the domain back. Public: no key, any origin.
 *
 *   /embed/{id}/…  The organization's screening widget (site/embed/v1.js):
 *                  GET config, POST verify (is this really our deposit
 *                  address?), POST check (an address's ledger facts and
 *                  sanctions), POST deposit (has my deposit arrived?).
 *                  Auth: the page's Origin must be one the embed allows,
 *                  and the organization's plan must include it. No key
 *                  reaches the browser, and a customer is never shown a
 *                  screening finding (that would be tipping off).
 *
 *   POST /withdrawal-screen
 *                  Screen an outbound payment before it is signed: will it
 *                  bounce, is the destination new, fresh, a lookalike of a
 *                  known address, sanctioned or in the scam registry up to
 *                  three funding hops back. Auth: an organization key
 *                  (withdrawal_screening, Enterprise and up).
 *
 *   GET  /threats?addresses=r…,r…
 *                  Confirmed scam-registry entries: counts, categories,
 *                  evidence hashes, never who reported. Public.
 *
 *   GET  /phishing?domain=example.com
 *                  Has the domain been advertised in micro-payment memos on
 *                  the ledger, and to how many accounts. Public.
 *   GET  /phishing-feed
 *                  Every listed domain (phishing_feed, Strategic).
 *
 *   GET  /protection/{slug}
 *                  A public Customer Asset Protection program: reserves,
 *                  protection fund, published liabilities root and the
 *                  hash-chained daily attestations. Public, when the
 *                  program is public and the plan includes it.
 *   POST /protection/{slug}/attest
 *                  Attest now (proof_of_reserves). The daily attestation
 *                  runs by itself: POST /protection-tick from pg_cron.
 *
 * The rules live in ../_shared/xrplEvents.ts, shared with the console, so a
 * deposit gets the same verdict wherever it is screened. Everything is read
 * live from the public XRPL servers; nothing is estimated. A fact that
 * could not be read is reported as unknown and holds the deposit for review.
 *
 * Deploy: supabase functions deploy noshashi-xrpl-watch --no-verify-jwt
 *         (it authenticates every request itself, as above)
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  activationOf,
  classifyTransaction,
  DEFAULT_EVENT_TYPES,
  domainVerdict,
  normalizeDomain,
  issuerFactsFrom,
  normalizeTx,
  sanitizeDepositConfig,
  screenDeposit,
  screenWithdrawal,
  lookalikeOf,
  type DepositConfig,
  type FundingHop,
  type IssuerFacts,
  type SanctionEntry,
  type ThreatEntry,
  type XrplEvent,
} from "../_shared/xrplEvents.ts";
import { assessProtection, digestOf, heldAccountFrom, type HeldAccount } from "../_shared/protection.ts";
import { applySchema, CONTENT_TYPES, sanitizeFields, serialize, type ExportFormat } from "../_shared/exportSchema.ts";

function createServiceClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
type ServiceClient = ReturnType<typeof createServiceClient>;

// Full-history servers first: funding chains read an account's first transaction.
const XRPL_HTTP = ["https://s2.ripple.com:51234/", "https://xrplcluster.com/", "https://s1.ripple.com:51234/"];

/** Watches read per tick, and transactions read per watch per tick. */
const WATCHES_PER_TICK = 25;
const PAGE_LIMIT = 200;
const MAX_PAGES = 2;
const HARD_PAGE_CAP = 10;
const FUNDING_HOPS = 3;

type Reply = Record<string, any>;

/** Refusals that say the server is busy, not that the request is wrong. */
const RETRYABLE = new Set(["noNetwork", "tooBusy", "slowDown", "noCurrent", "noClosed", "notReady", "amendmentBlocked", "failedToForward", "unknown"]);

class RippledError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

async function xrpl(method: string, params: Record<string, unknown>): Promise<Reply> {
  let last: Error | null = null;
  for (const endpoint of XRPL_HTTP) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, params: [params] }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`${new URL(endpoint).host} replied ${response.status}`);
      const payload = (await response.json()) as { result?: Reply };
      const result = payload.result ?? {};
      // Command errors arrive inside `result` with HTTP 200, and some servers
      // send them as objects rather than strings.
      if (result.status === "error" || result.error) {
        const code = typeof result.error === "string" ? result.error : JSON.stringify(result.error ?? "error");
        const message = typeof result.error_message === "string" ? result.error_message : code;
        throw new RippledError(message, code);
      }
      return result;
    } catch (error) {
      // The ledger's own refusal would be repeated by the next server; a busy or
      // throttling server, or a transport failure, is retried on the next one.
      if (error instanceof RippledError && !RETRYABLE.has(error.code)) throw error;
      last = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw last ?? new Error("The XRPL servers could not be reached.");
}

async function validatedLedger(): Promise<number> {
  const result = await xrpl("ledger", { ledger_index: "validated" });
  const index = Number(result.ledger_index ?? result.ledger?.ledger_index);
  if (!Number.isFinite(index) || index <= 0) throw new Error("The validated ledger index could not be read.");
  return index;
}

// ── Screening reads, cached for one request ─────────────────────────

class Reads {
  private issuers = new Map<string, Promise<IssuerFacts | null>>();
  private hops = new Map<string, Promise<FundingHop>>();
  private listed = new Map<string, SanctionEntry | null>();
  private reported = new Map<string, ThreatEntry | null>();

  /** The database, for the sanctions list. Without it nothing is looked up. */
  constructor(private supabase?: ServiceClient) {}

  /**
   * Sanctions-list entries for these addresses. A failed lookup throws:
   * a deposit is never screened as if the list had been checked.
   */
  async sanctions(accounts: string[]): Promise<Record<string, SanctionEntry>> {
    const missing = [...new Set(accounts)].filter((a) => !this.listed.has(a));
    if (missing.length && this.supabase) {
      const { data, error } = await this.supabase.schema("noshashi").rpc("sanctions_lookup", { p_addresses: missing });
      if (error) throw error;
      for (const a of missing) this.listed.set(a, null);
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        this.listed.set(String(row.address), {
          address: String(row.address),
          list: String(row.list),
          entityNumber: row.entity_number === null ? null : Number(row.entity_number),
          entityName: String(row.entity_name),
          program: (row.program as string | null) ?? null,
          sourceUrl: String(row.source_url),
        });
      }
    }
    const out: Record<string, SanctionEntry> = {};
    for (const a of accounts) {
      const hit = this.listed.get(a);
      if (hit) out[a] = hit;
    }
    return out;
  }

  /** Confirmed scam-registry entries for these addresses. A failed lookup throws, as for sanctions. */
  async threats(accounts: string[]): Promise<Record<string, ThreatEntry>> {
    const missing = [...new Set(accounts)].filter((a) => !this.reported.has(a));
    if (missing.length && this.supabase) {
      const { data, error } = await this.supabase.schema("noshashi").rpc("threat_lookup", { p_addresses: missing });
      if (error) throw error;
      for (const a of missing) this.reported.set(a, null);
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        this.reported.set(String(row.address), {
          address: String(row.address),
          reports: Number(row.reports),
          categories: (row.categories as string[] | null) ?? [],
          firstConfirmed: String(row.first_confirmed),
        });
      }
    }
    const out: Record<string, ThreatEntry> = {};
    for (const a of accounts) {
      const hit = this.reported.get(a);
      if (hit) out[a] = hit;
    }
    return out;
  }

  issuer(issuer: string, currency: string): Promise<IssuerFacts | null> {
    const key = `${issuer}|${currency}`;
    if (!this.issuers.has(key)) {
      this.issuers.set(key, Promise.all([
        xrpl("account_info", { account: issuer, ledger_index: "validated" }).catch(() => null),
        xrpl("gateway_balances", { account: issuer, ledger_index: "validated" }).catch(() => null),
      ]).then(([info, balances]) => issuerFactsFrom(info, balances, currency)));
    }
    return this.issuers.get(key)!;
  }

  hop(account: string): Promise<FundingHop> {
    if (!this.hops.has(account)) {
      this.hops.set(account, xrpl("account_tx", { account, ledger_index_min: -1, ledger_index_max: -1, forward: true, limit: 1 })
        .then((r) => activationOf(account, ((r.transactions ?? []) as Reply[])[0] ?? null))
        .catch(() => ({ account, fundedBy: null, activatedLedger: null })));
    }
    return this.hops.get(account)!;
  }

  async chain(account: string): Promise<FundingHop[]> {
    const chain: FundingHop[] = [];
    let next: string | null = account;
    while (next && chain.length < FUNDING_HOPS && !chain.some((h) => h.account === next)) {
      const hop: FundingHop = await this.hop(next);
      chain.push(hop);
      next = hop.fundedBy;
    }
    return chain;
  }

  async screen(event: XrplEvent, config: DepositConfig, currentLedger: number, knownAddresses: string[] = []) {
    const delivered = (event.data as { delivered?: { issuer: string | null; currency: string } | null }).delivered;
    const [issuer, chain] = await Promise.all([
      delivered?.issuer ? this.issuer(delivered.issuer, delivered.currency) : Promise.resolve(null),
      event.counterparty ? this.chain(event.counterparty) : Promise.resolve([]),
    ]);
    const accounts = chain.map((h) => h.account);
    const [sanctions, threats] = await Promise.all([this.sanctions(accounts), this.threats(accounts)]);
    return { ...screenDeposit({ event, config, issuer, chain, currentLedger, sanctions, threats, knownAddresses }), chain };
  }
}

// ── The watcher ─────────────────────────────────────────────────────

type Watch = {
  id: string;
  organization_id: string;
  address: string;
  purpose: "monitor" | "deposit";
  event_types: string[];
  deposit_config: unknown;
  last_ledger: number | null;
};

type ReadRequest = {
  address: string;
  fromLedger: number;
  toLedger: number;
  types: string[];
  screenDeposits: boolean;
  config: DepositConfig;
  currentLedger: number;
  reads: Reads;
  /** The organization's watched addresses, which a poisoning sender would imitate. */
  knownAddresses?: string[];
};

/**
 * One account's events between two ledgers, oldest first, with incoming
 * payments screened when asked. Reads at most MAX_PAGES pages; when more
 * remain, `processedTo` stops short of the last ledger read so the next
 * read resumes there (its events are then skipped as duplicates).
 */
async function readEvents(req: ReadRequest): Promise<{ events: Array<XrplEvent & { screening?: unknown }>; processedTo: number; complete: boolean }> {
  const wanted = new Set(req.types);
  const events: Array<XrplEvent & { screening?: unknown }> = [];
  let marker: unknown = undefined;
  let processedTo = req.toLedger;
  // Past MAX_PAGES only while still inside the first ledger: stopping there
  // would leave nothing complete to advance to, and the watch would stall.
  for (let page = 0; page < MAX_PAGES || (processedTo < req.fromLedger && page < HARD_PAGE_CAP); page++) {
    const result = await xrpl("account_tx", {
      account: req.address,
      ledger_index_min: req.fromLedger,
      ledger_index_max: req.toLedger,
      forward: true,
      limit: PAGE_LIMIT,
      ...(marker ? { marker } : {}),
    });
    const rows = (result.transactions ?? []) as Reply[];
    for (const row of rows) {
      if (row.validated === false) continue;
      const { tx, meta, ledgerIndex } = normalizeTx(row);
      for (const event of classifyTransaction(tx, meta, req.address, ledgerIndex)) {
        if (!wanted.has(event.type)) continue;
        events.push(req.screenDeposits && event.type === "payment_in"
          ? { ...event, screening: await req.reads.screen(event, req.config, req.currentLedger, req.knownAddresses) }
          : event);
      }
    }
    marker = result.marker;
    if (!marker) return { events, processedTo, complete: true };
    const lastLedger = rows.length ? normalizeTx(rows[rows.length - 1]).ledgerIndex : req.fromLedger;
    processedTo = Math.max(req.fromLedger - 1, lastLedger - 1);
  }
  // A single ledger larger than every page read: record what was read and move past it.
  return { events, processedTo: Math.max(processedTo, req.fromLedger), complete: false };
}

async function readWatch(supabase: ServiceClient, watch: Watch, validated: number, reads: Reads, known: string[]): Promise<{ recorded: number; error?: string }> {
  const record = async (events: unknown[], lastLedger: number | null, error: string | null) => {
    const { data, error: rpcError } = await supabase.schema("noshashi").rpc("xrpl_record_events", {
      p_watch: watch.id, p_events: events, p_last_ledger: lastLedger, p_error: error,
    });
    if (rpcError) throw rpcError;
    return Number(data ?? 0);
  };

  // A new watch starts at the current ledger: it reports what happens from now on.
  if (watch.last_ledger === null) return { recorded: await record([], validated, null) };
  if (watch.last_ledger >= validated) return { recorded: await record([], watch.last_ledger, null) };

  try {
    const read = await readEvents({
      address: watch.address,
      fromLedger: watch.last_ledger + 1,
      toLedger: validated,
      types: watch.event_types,
      screenDeposits: watch.purpose === "deposit",
      config: sanitizeDepositConfig(watch.deposit_config),
      currentLedger: validated,
      reads,
      knownAddresses: known,
    });
    return { recorded: await record(read.events, read.processedTo, null) };
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === "object" ? JSON.stringify(error) : String(error);
    await record([], null, message.slice(0, 500));
    return { recorded: 0, error: message };
  }
}

/** Every address each organization watches, for address-poisoning checks. */
async function watchedAddresses(supabase: ServiceClient, orgs: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!orgs.length) return out;
  const { data, error } = await supabase.schema("noshashi").from("xrpl_watches").select("organization_id, address").in("organization_id", orgs);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ organization_id: string; address: string }>) {
    out.set(row.organization_id, [...(out.get(row.organization_id) ?? []), row.address]);
  }
  return out;
}

async function tick(supabase: ServiceClient): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.schema("noshashi").rpc("xrpl_watches_due", { p_limit: WATCHES_PER_TICK });
  if (error) throw error;
  const watches = (data ?? []) as Watch[];
  if (!watches.length) return { watches: 0 };
  const validated = await validatedLedger();
  const reads = new Reads(supabase);
  const known = await watchedAddresses(supabase, [...new Set(watches.map((w) => w.organization_id))]);
  const results: Array<{ recorded: number; error?: string }> = [];
  // Four at a time: the public servers are shared and free.
  for (let i = 0; i < watches.length; i += 4) {
    results.push(...(await Promise.all(watches.slice(i, i + 4).map((w) => readWatch(supabase, w, validated, reads, known.get(w.organization_id) ?? [])))));
  }
  return {
    watches: watches.length,
    ledger: validated,
    recorded: results.reduce((n, r) => n + r.recorded, 0),
    errors: results.filter((r) => r.error).length,
  };
}

// ── Auth ────────────────────────────────────────────────────────────

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type KeyAuth = { accountId: string; keyId: string; organizationId: string };

async function authenticateKey(supabase: ServiceClient, authorization: string | null): Promise<KeyAuth | "unauthorized" | "org_key_required"> {
  if (!authorization?.startsWith("Bearer nsh_live_")) return "unauthorized";
  const hash = await sha256Hex(authorization.slice("Bearer ".length).trim());
  const { data, error } = await supabase.schema("noshashi").from("api_keys")
    .select("id, account_id, organization_id, revoked_at, expires_at, scopes").eq("key_hash", hash).maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at) return "unauthorized";
  if (data.expires_at && new Date(String(data.expires_at)).getTime() <= Date.now()) return "unauthorized";
  const scopes = (data.scopes as string[] | null) ?? [];
  if (!scopes.some((s) => s === "read" || s === "verify")) return "unauthorized";
  // Events belong to an organization, so the key must be issued for one.
  if (!data.organization_id) return "org_key_required";
  return { accountId: String(data.account_id), keyId: String(data.id), organizationId: String(data.organization_id) };
}

async function hasFeature(supabase: ServiceClient, org: string, feature: string): Promise<boolean> {
  const { data, error } = await supabase.schema("noshashi").rpc("org_has_feature", { p_org: org, p_feature: feature });
  if (error) throw error;
  return data === true;
}

async function rateAllowed(supabase: ServiceClient, keyId: string): Promise<boolean> {
  for (const [window, limit] of [[1, 10], [60, 300]] as const) {
    const { data, error } = await supabase.schema("noshashi").rpc("api_rate_take", { p_key: keyId, p_window_seconds: window, p_limit: limit });
    if (error) throw error;
    if ((data as Record<string, unknown> | null)?.allowed !== true) return false;
  }
  return true;
}

// ── HTTP ────────────────────────────────────────────────────────────

function json(status: number, body: Record<string, unknown>, requestId: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ ...body, request_id: requestId }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": requestId,
      ...extra,
    },
  });
}

const HASH_RE = /^[0-9A-Fa-f]{64}$/;
const ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

Deno.serve(async (request: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json(503, { error: "not_configured" }, requestId);
    const supabase = createServiceClient(url, key);
    const segments = new URL(request.url).pathname.split("/").filter(Boolean);
    const protectionAt = segments.lastIndexOf("protection");
    const route = segments.pop();
    const authorization = request.headers.get("authorization");

    // Public: the sanctions list, from any origin.
    if (route === "sanctions") return await handleSanctions(supabase, request, requestId);
    // Public: confirmed scam-registry entries, and domains seen in phishing memos.
    if (route === "threats") return await handleThreats(supabase, request, requestId);
    if (route === "phishing") return await handlePhishing(supabase, request, requestId);
    // Public: does a domain vouch for an account (xrp-ledger.toml)?
    if (route === "domain-verify") return await handleDomainVerify(request, requestId);
    // The organization's widget: /embed/{id}/{action}.
    const embedAt = segments.lastIndexOf("embed");
    if (embedAt >= 0 && segments.length === embedAt + 2) {
      return await handleEmbed(supabase, request, segments[embedAt + 1], route ?? "", requestId);
    }

    // The watcher's own token (from Vault, via pg_cron).
    const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    let internal = false;
    if (/^[0-9a-f]{64}$/.test(bearer)) {
      // A failed check is an error, never a quiet "not authorized".
      const { data, error } = await supabase.schema("noshashi").rpc("xrpl_watch_token_ok", { p_token: bearer });
      if (error) throw error;
      internal = data === true;
    }

    if (route === "tick" && request.method === "POST") {
      if (!internal) return json(401, { error: "unauthorized" }, requestId);
      return json(200, await tick(supabase), requestId);
    }
    if (route === "protection-tick" && request.method === "POST") {
      if (!internal) return json(401, { error: "unauthorized" }, requestId);
      return json(200, await protectionTick(supabase), requestId);
    }

    // Public: a protection program's page. /protection/{slug}
    if (protectionAt >= 0 && protectionAt === segments.length - 1 && request.method !== "POST") {
      return await handleProtectionPage(supabase, request, route ?? "", requestId);
    }
    const attest = protectionAt >= 0 && protectionAt === segments.length - 2 && route === "attest" && request.method === "POST";

    const ROUTES = ["events", "screen", "history", "withdrawal-screen", "phishing-feed"];
    if (!attest && !ROUTES.includes(route ?? "")) {
      return json(404, { error: "not_found", routes: ["GET /events", "POST /screen", "POST /history", "POST /withdrawal-screen", "GET /phishing-feed", "POST /protection/{slug}/attest"] }, requestId);
    }

    let org: string | null = null;
    if (!internal) {
      const auth = await authenticateKey(supabase, authorization);
      if (auth === "unauthorized") return json(401, { error: "unauthorized", message: "A valid, unexpired nsh_live_ key with the read or verify scope is required." }, requestId, { "WWW-Authenticate": 'Bearer realm="noshashi"' });
      if (auth === "org_key_required") return json(403, { error: "org_key_required", message: "Event feeds and screening belong to an organization. Issue the key from the organization's API keys." }, requestId);
      if (!(await rateAllowed(supabase, auth.keyId))) return json(429, { error: "rate_limited", message: "At most 10 requests a second and 300 a minute." }, requestId, { "Retry-After": "1" });
      org = auth.organizationId;
    }

    if (attest) {
      if (!org) return json(400, { error: "org_key_required" }, requestId);
      return await handleAttest(supabase, segments[segments.length - 1], org, requestId);
    }
    if (route === "withdrawal-screen" && request.method === "POST") return await handleWithdrawalScreen(supabase, request, org, requestId);
    if (route === "phishing-feed" && request.method === "GET") {
      if (!org) return json(400, { error: "org_key_required" }, requestId);
      return await handlePhishingFeed(supabase, request, org, requestId);
    }
    if (route === "screen" && request.method === "POST") return await handleScreen(supabase, request, org, requestId);
    if (route === "history" && request.method === "POST") return await handleHistory(supabase, request, org, requestId);
    if (route === "events" && request.method === "GET") {
      if (!org) return json(400, { error: "org_key_required" }, requestId);
      return await handleEvents(supabase, request, org, requestId);
    }
    return json(405, { error: "method_not_allowed" }, requestId);
  } catch (error) {
    // Supabase client errors are plain objects: log them whole, not as "[object Object]".
    const message = error instanceof Error ? error.message : typeof error === "object" ? JSON.stringify(error) : String(error);
    console.error(JSON.stringify({ level: "error", request_id: requestId, message }));
    return json(500, { error: "internal", message: "The request could not be completed. It has been logged under this request id." }, requestId);
  }
});

async function handleScreen(supabase: ServiceClient, request: Request, org: string | null, requestId: string): Promise<Response> {
  if (org && !(await hasFeature(supabase, org, "deposit_screening"))) {
    return json(403, { error: "feature_not_enabled", message: "Deposit screening is part of the Enterprise plan." }, requestId);
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const hash = String(body?.hash ?? "");
  const depositAddress = String(body?.deposit_address ?? "");
  if (!HASH_RE.test(hash) || !ADDRESS_RE.test(depositAddress)) {
    return json(400, { error: "invalid_request", message: "Send { hash: <64 hex>, deposit_address: <r-address>, config?: {...} }." }, requestId);
  }
  let config = sanitizeDepositConfig(body?.config ?? {});
  if (org) {
    const { data: watch } = await supabase.schema("noshashi").from("xrpl_watches")
      .select("deposit_config").eq("organization_id", org).eq("address", depositAddress).eq("purpose", "deposit").maybeSingle();
    if (watch && !body?.config) config = sanitizeDepositConfig(watch.deposit_config);
  }

  let reply: Reply;
  try {
    reply = await xrpl("tx", { transaction: hash.toUpperCase() });
  } catch (error) {
    if (error instanceof RippledError && error.code === "txnNotFound") return json(404, { error: "transaction_not_found", message: "No validated transaction has that hash." }, requestId);
    throw error;
  }
  const { tx, meta, ledgerIndex } = normalizeTx(reply);
  if (reply.validated === false) return json(409, { error: "not_validated", message: "That transaction is not in a validated ledger yet. Screen it once it is." }, requestId);
  if (tx.TransactionType !== "Payment" || tx.Destination !== depositAddress) {
    return json(422, { error: "not_a_deposit", message: `That transaction is a ${tx.TransactionType} to ${tx.Destination ?? "no destination"}, not a payment to ${depositAddress}.` }, requestId);
  }
  const [event] = classifyTransaction(tx, meta, depositAddress, ledgerIndex);
  const validated = await validatedLedger();
  const known = org ? (await watchedAddresses(supabase, [org])).get(org) ?? [] : [];
  const screening = await new Reads(supabase).screen(event, config, validated, known);
  return json(200, {
    source: `XRPL mainnet, validated ledger ${validated}, read live from the public servers`,
    event,
    verdict: screening.verdict,
    credit: screening.credit,
    findings: screening.findings,
    funding_chain: screening.chain,
    config_used: { accepted_issuers: config.acceptedIssuers, deny_list_entries: config.denylist.length, require_tag: config.requireTag, travel_rule_xrp: config.travelRuleXrp, trusted_counterparties: config.trustedCounterparties.length },
    sanctions_list: await sanctionsStatus(supabase),
  }, requestId);
}

/**
 * Any account's events over a ledger range, read live and classified the
 * way a watch would record them: for backfilling a feed, or for looking
 * at an account before watching it. Nothing is stored.
 */
async function handleHistory(supabase: ServiceClient, request: Request, org: string | null, requestId: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const address = String(body?.address ?? "");
  const screen = body?.screen === true;
  if (org && !(await hasFeature(supabase, org, "event_feeds")) && !(screen && (await hasFeature(supabase, org, "deposit_screening")))) {
    return json(403, { error: "feature_not_enabled", message: "Event history is part of the Strategic plan; screened deposit history of the Enterprise plan." }, requestId);
  }
  const validated = await validatedLedger();
  const from = Number(body?.from_ledger);
  const to = body?.to_ledger === undefined ? validated : Number(body.to_ledger);
  if (!ADDRESS_RE.test(address) || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > validated) {
    return json(400, { error: "invalid_request", message: `Send { address, from_ledger, to_ledger? (at most ${validated}), types?, screen?, config? }.` }, requestId);
  }
  const requested = Array.isArray(body?.types) ? (body.types as unknown[]).filter((t): t is string => typeof t === "string") : [];
  const types = requested.length ? requested : DEFAULT_EVENT_TYPES;
  const read = await readEvents({
    address, fromLedger: from, toLedger: to, types, screenDeposits: screen,
    config: sanitizeDepositConfig(body?.config ?? {}), currentLedger: validated, reads: new Reads(supabase),
    knownAddresses: org ? (await watchedAddresses(supabase, [org])).get(org) ?? [] : [],
  });
  return json(200, {
    source: `XRPL mainnet, validated ledgers ${from}–${read.processedTo}, read live from the public servers`,
    events: read.events,
    count: read.events.length,
    complete: read.complete,
    next_from_ledger: read.complete ? null : read.processedTo + 1,
  }, requestId);
}

async function handleEvents(supabase: ServiceClient, request: Request, org: string, requestId: string): Promise<Response> {
  const feeds = await hasFeature(supabase, org, "event_feeds");
  const deposits = feeds || (await hasFeature(supabase, org, "deposit_screening"));
  if (!deposits) return json(403, { error: "feature_not_enabled", message: "Event feeds are part of the Strategic plan; screened deposits of the Enterprise plan." }, requestId);

  const params = new URL(request.url).searchParams;
  const after = Math.max(0, Number(params.get("after") ?? 0) || 0);
  const limit = Math.min(1000, Math.max(1, Number(params.get("limit") ?? 100) || 100));
  let query = supabase.schema("noshashi").from("xrpl_events")
    .select("id, watch_id, address, event_type, tx_hash, ledger_index, ledger_time, tx_type, tx_result, counterparty, data, screening, verdict, created_at")
    .eq("organization_id", org).gt("id", after).order("id", { ascending: true }).limit(limit);
  // Without the Strategic feed, only screened deposits are served.
  if (!feeds) query = query.not("screening", "is", null);
  const types = params.get("types");
  if (types) query = query.in("event_type", types.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20));
  const address = params.get("address");
  if (address && ADDRESS_RE.test(address)) query = query.eq("address", address);
  const verdict = params.get("verdict");
  if (verdict && ["clear", "review", "hold"].includes(verdict)) query = query.eq("verdict", verdict);
  const { data, error } = await query;
  if (error) throw error;

  const records: Array<Record<string, unknown>> = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ ...r, type: r.event_type }));
  const next = records.length ? String(records[records.length - 1].id) : String(after);

  const schemaId = params.get("schema");
  let format: ExportFormat = params.get("format") === "ndjson" ? "ndjson" : params.get("format") === "csv" ? "csv" : "json";
  let rows: Array<Record<string, unknown>> = records;
  let columns: string[] = [];
  if (schemaId) {
    const { data: schema } = await supabase.schema("noshashi").from("org_export_schemas")
      .select("name, dataset, format, fields").eq("id", schemaId).eq("organization_id", org).maybeSingle();
    if (!schema || schema.dataset !== "events") return json(404, { error: "schema_not_found", message: "No events schema with that id in this organization." }, requestId);
    const fields = sanitizeFields(schema.fields);
    rows = applySchema(records, fields);
    columns = fields.map((f) => f.as);
    if (!params.get("format")) format = schema.format as ExportFormat;
  }
  if (format === "json") {
    return json(200, { events: rows, count: rows.length, next_cursor: next, has_more: rows.length === limit }, requestId);
  }
  if (format === "csv" && !columns.length) columns = ["id", "address", "type", "tx_hash", "ledger_index", "ledger_time", "tx_type", "tx_result", "counterparty", "verdict"];
  return new Response(serialize(rows, columns, format), {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": requestId,
      "X-Next-Cursor": next,
      "X-Has-More": String(rows.length === limit),
    },
  });
}

// ── Sanctions (public) ──────────────────────────────────────────────

async function sanctionsStatus(supabase: ServiceClient): Promise<{ list: string; listed: number; list_as_of: string | null; source: string }> {
  const [{ count, error: countError }, { data: last, error: lastError }] = await Promise.all([
    supabase.schema("noshashi").from("sanctioned_addresses").select("address", { count: "exact", head: true }).is("removed_at", null),
    supabase.schema("noshashi").from("sanctions_refreshes").select("finished_at").eq("status", "ok").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (countError) throw countError;
  if (lastError) throw lastError;
  return {
    list: "OFAC SDN",
    listed: count ?? 0,
    list_as_of: (last?.finished_at as string | null) ?? null,
    source: "https://www.treasury.gov/ofac/downloads/sdn.csv and sdn_comments.csv",
  };
}

const PUBLIC_CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Cache-Control": "public, max-age=300" };

async function handleSanctions(supabase: ServiceClient, request: Request, requestId: string): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: PUBLIC_CORS });
  if (request.method !== "GET") return json(405, { error: "method_not_allowed" }, requestId, PUBLIC_CORS);
  const raw = new URL(request.url).searchParams.get("addresses") ?? "";
  const addresses = [...new Set(raw.split(",").map((a) => a.trim()).filter(Boolean))];
  if (!addresses.length || addresses.length > 50 || !addresses.every((a) => ADDRESS_RE.test(a))) {
    return json(400, { error: "invalid_request", message: "Send ?addresses= with 1 to 50 classic addresses, comma-separated." }, requestId, PUBLIC_CORS);
  }
  const hits = await new Reads(supabase).sanctions(addresses);
  return json(200, { ...(await sanctionsStatus(supabase)), hits: Object.values(hits) }, requestId, PUBLIC_CORS);
}

// ── Domain verification (public) ────────────────────────────────────

const TOML_MAX_BYTES = 256 * 1024;

/**
 * Read https://<domain>/.well-known/xrp-ledger.toml. Only a public
 * hostname is ever fetched (normalizeDomain refuses IPs and internal
 * names), over HTTPS, with one redirect allowed and only to the same
 * domain or its www. twin, a size cap and a timeout.
 */
async function fetchToml(domain: string): Promise<{ text: string | null; error?: string }> {
  let target = `https://${domain}/.well-known/xrp-ledger.toml`;
  for (let hop = 0; hop < 2; hop++) {
    let response: Response;
    try {
      response = await fetch(target, { redirect: "manual", headers: { Accept: "application/toml, text/plain, */*" }, signal: AbortSignal.timeout(8000) });
    } catch (error) {
      return { text: null, error: error instanceof Error && error.name === "TimeoutError" ? "timed out" : "could not connect" };
    }
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      const url = next ? new URL(next, target) : null;
      const host = url ? normalizeDomain(url.host) : null;
      const same = host && (host === domain || host === `www.${domain}` || `www.${host}` === domain);
      if (!url || url.protocol !== "https:" || !same) return { text: null, error: `redirects to ${url?.host ?? "nowhere"}` };
      target = url.toString();
      continue;
    }
    if (!response.ok) return { text: null, error: `HTTP ${response.status}` };
    const reader = response.body?.getReader();
    if (!reader) return { text: null, error: "empty reply" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > TOML_MAX_BYTES) {
        await reader.cancel();
        return { text: null, error: "file too large" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.byteLength;
    }
    return { text: new TextDecoder().decode(bytes) };
  }
  return { text: null, error: "too many redirects" };
}

function hexToText(hex: unknown): string {
  if (typeof hex !== "string" || !/^([0-9A-Fa-f]{2})+$/.test(hex)) return "";
  return new TextDecoder().decode(new Uint8Array((hex.match(/../g) ?? []).map((b) => parseInt(b, 16))));
}

async function domainOf(address: string): Promise<{ exists: boolean; domain: string | null; raw: string }> {
  try {
    const info = await xrpl("account_info", { account: address, ledger_index: "validated" });
    const raw = hexToText(info.account_data?.Domain);
    return { exists: true, domain: raw ? normalizeDomain(raw) : null, raw };
  } catch (error) {
    if (error instanceof RippledError && error.code === "actNotFound") return { exists: false, domain: null, raw: "" };
    throw error;
  }
}

async function handleDomainVerify(request: Request, requestId: string): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: PUBLIC_CORS });
  if (request.method !== "GET") return json(405, { error: "method_not_allowed" }, requestId, PUBLIC_CORS);
  const params = new URL(request.url).searchParams;
  const address = params.get("address")?.trim() ?? "";
  const domainParam = params.get("domain")?.trim() ?? "";
  if ((address && !ADDRESS_RE.test(address)) || (!address && !domainParam)) {
    return json(400, { error: "invalid_request", message: "Send ?address=r… (does its domain vouch for it?) or ?domain=example.com (which accounts does it list, and do they point back?)." }, requestId, PUBLIC_CORS);
  }
  const source = "XRPL mainnet account Domain fields (validated ledger) and the domain's /.well-known/xrp-ledger.toml, read live";

  if (address) {
    const account = await domainOf(address);
    if (!account.exists) {
      return json(200, { source, check: { address, domain: null, status: "no_account", listed: [], detail: "No account exists at this address.", tomlUrl: null } }, requestId, PUBLIC_CORS);
    }
    if (account.raw && !account.domain) {
      return json(200, { source, check: { address, domain: account.raw.slice(0, 120), status: "invalid_domain", listed: [], detail: `The account's Domain field ("${account.raw.slice(0, 60)}") is not a public hostname, so nothing can vouch for it.`, tomlUrl: null } }, requestId, PUBLIC_CORS);
    }
    const toml = account.domain ? await fetchToml(account.domain) : { text: null };
    return json(200, { source, check: domainVerdict(address, account.domain, toml) }, requestId, PUBLIC_CORS);
  }

  const domain = normalizeDomain(domainParam);
  if (!domain) return json(400, { error: "invalid_domain", message: "Send a public hostname such as example.com." }, requestId, PUBLIC_CORS);
  const toml = await fetchToml(domain);
  const check = domainVerdict(null, domain, toml);
  // Each listed account should name the domain back; an account that does not is listed but not claiming it.
  const accounts = [];
  for (const listed of check.listed.slice(0, 20)) {
    const account = await domainOf(listed).catch(() => null);
    accounts.push({ address: listed, exists: account?.exists ?? null, domain: account?.domain ?? null, points_back: account ? account.domain === domain || account.domain === `www.${domain}` || `www.${account.domain}` === domain : null });
  }
  return json(200, { source, check, accounts }, requestId, PUBLIC_CORS);
}

// ── The embeddable widget ───────────────────────────────────────────

type Embed = { organization_id: string; label: string; widgets: string[]; deposit_address: string | null; theme: string };

const EMBED_REFUSALS: Record<string, [number, string]> = {
  NOT_FOUND: [404, "This widget does not exist or is switched off."],
  ORIGIN_NOT_ALLOWED: [403, "This widget is not allowed on this website. Its owner adds the site's origin in NOSHASHI."],
  FEATURE_NOT_IN_PLAN: [403, "This widget's organization no longer has it in its plan."],
  RATE_LIMITED: [429, "Too many checks from this widget just now. Try again in a minute."],
};

const RIPPLE_EPOCH = 946684800;

async function handleEmbed(supabase: ServiceClient, request: Request, id: string, action: string, requestId: string): Promise<Response> {
  const origin = request.headers.get("origin") ?? "";
  // Answered only to the origin the embed allows; everything else gets no CORS headers at all.
  const cors = (allowed: boolean): Record<string, string> =>
    allowed ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Vary": "Origin" } : { "Vary": "Origin" };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(404, { error: "not_found" }, requestId, cors(false));

  if (request.method === "OPTIONS") {
    const { data } = await supabase.schema("noshashi").from("org_embeds").select("allowed_origins, active").eq("id", id).maybeSingle();
    const ok = Boolean(data?.active) && ((data?.allowed_origins as string[] | null) ?? []).includes(origin.toLowerCase());
    return new Response(null, { status: ok ? 204 : 403, headers: cors(ok) });
  }

  const { data: admitted, error } = await supabase.schema("noshashi").rpc("embed_admit", { p_id: id, p_origin: origin });
  if (error) throw error;
  const admit = admitted as ({ ok: true } & Embed) | { ok: false; code: string };
  if (!admit.ok) {
    const [status, message] = EMBED_REFUSALS[admit.code] ?? [403, "Not available."];
    return json(status, { error: admit.code.toLowerCase(), message }, requestId, cors(admit.code !== "ORIGIN_NOT_ALLOWED" && admit.code !== "NOT_FOUND"));
  }
  const embed = admit as Embed;
  const headers = cors(true);

  if (action === "config" && request.method === "GET") {
    const status = await sanctionsStatus(supabase);
    return json(200, {
      label: embed.label,
      widgets: embed.widgets,
      theme: embed.theme,
      deposit_address: embed.widgets.some((w) => w === "verify" || w === "deposit") ? embed.deposit_address : null,
      sanctions_list: { list: status.list, list_as_of: status.list_as_of },
    }, requestId, headers);
  }
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, requestId, headers);
  if (!embed.widgets.includes(action)) return json(404, { error: "widget_not_enabled", message: "This widget does not offer that check." }, requestId, headers);

  // Sent as text/plain by the widget so the browser needs no preflight.
  const body = (await request.text().then((t) => JSON.parse(t)).catch(() => null)) as Record<string, unknown> | null;

  if (action === "verify") {
    const address = String(body?.address ?? "").trim();
    if (!ADDRESS_RE.test(address)) return json(400, { error: "invalid_address", message: "That is not a classic XRP Ledger address (r…, 25 to 35 characters)." }, requestId, headers);
    const real = embed.deposit_address!;
    if (address === real) {
      return json(200, { result: "match", message: `This is ${embed.label}'s deposit address.`, address }, requestId, headers);
    }
    const imitates = lookalikeOf(address, [real]) !== null;
    return json(200, {
      result: imitates ? "lookalike" : "no_match",
      message: imitates
        ? `This is NOT ${embed.label}'s address. It starts and ends like it but is a different account: a lookalike made to be copied by mistake (address poisoning). Do not send to it.`
        : `This is not ${embed.label}'s deposit address. Copy the address from ${embed.label} directly, not from a message or your transaction history.`,
      address,
    }, requestId, headers);
  }

  if (action === "check") {
    const address = String(body?.address ?? "").trim();
    if (!ADDRESS_RE.test(address)) return json(400, { error: "invalid_address", message: "That is not a classic XRP Ledger address (r…, 25 to 35 characters)." }, requestId, headers);
    const reads = new Reads(supabase);
    const [info, hits, status] = await Promise.all([
      xrpl("account_info", { account: address, ledger_index: "validated" }).catch((e) => (e instanceof RippledError && e.code === "actNotFound" ? null : Promise.reject(e))),
      reads.sanctions([address]),
      sanctionsStatus(supabase),
    ]);
    const hit = hits[address];
    const data = info?.account_data as Record<string, unknown> | undefined;
    const hop = data ? await reads.hop(address) : null;
    const facts: string[] = [];
    if (!data) facts.push("This address has never been funded: it does not exist on the ledger yet.");
    else {
      facts.push(`Balance ${(Number(data.Balance) / 1e6).toLocaleString("en-US")} XRP at validated ledger ${Number(info!.ledger_index).toLocaleString("en-US")}.`);
      if (hop?.activatedLedger) facts.push(`Created in ledger ${hop.activatedLedger.toLocaleString("en-US")}${hop.fundedBy ? `, funded by ${hop.fundedBy}` : ""}.`);
      if (typeof data.Domain === "string" && data.Domain) {
        const domain = new TextDecoder().decode(new Uint8Array((data.Domain.match(/../g) ?? []).map((h) => parseInt(h, 16))));
        facts.push(`Claims the domain ${domain} (claimed, not verified).`);
      }
      if ((Number(data.Flags) & 0x00020000) !== 0) facts.push("Requires a destination tag: payments without one are refused.");
    }
    return json(200, {
      address,
      sanctioned: Boolean(hit),
      sanction: hit ? { list: hit.list, entity: hit.entityName, entry: hit.entityNumber, program: hit.program, source: hit.sourceUrl } : null,
      exists: Boolean(data),
      facts,
      sanctions_list: { list: status.list, list_as_of: status.list_as_of, listed: status.listed },
      note: "Facts the XRP Ledger publishes and the US Treasury's OFAC SDN list. Not being listed is not a clearance.",
    }, requestId, headers);
  }

  if (action === "deposit") {
    const hash = String(body?.hash ?? "").trim().toUpperCase();
    if (!HASH_RE.test(hash)) return json(400, { error: "invalid_hash", message: "Paste the 64-character transaction hash from your wallet." }, requestId, headers);
    let reply: Reply;
    try {
      reply = await xrpl("tx", { transaction: hash });
    } catch (e) {
      if (e instanceof RippledError && e.code === "txnNotFound") {
        return json(200, { status: "not_found", message: "No transaction with that hash is on the ledger yet. If you just sent it, wait a few seconds and check again." }, requestId, headers);
      }
      throw e;
    }
    const { tx, meta, ledgerIndex } = normalizeTx(reply);
    if (reply.validated === false) return json(200, { status: "pending", message: "It is on its way: not yet in a validated ledger. Check again in a few seconds." }, requestId, headers);
    if (tx.TransactionType !== "Payment" || tx.Destination !== embed.deposit_address) {
      return json(200, { status: "not_a_deposit", message: `That transaction is not a payment to ${embed.label}'s deposit address.` }, requestId, headers);
    }
    const [event] = classifyTransaction(tx, meta, embed.deposit_address!, ledgerIndex);
    const delivered = (event.data as { delivered?: { currency: string; value: number } | null }).delivered ?? null;
    if (event.result !== "tesSUCCESS") {
      return json(200, { status: "failed", message: `The ledger recorded ${event.result}: nothing arrived. Nothing was taken from you except the network fee.` }, requestId, headers);
    }
    // Screened with the organization's own configuration; the customer sees only whether it needs a look.
    const { data: watch } = await supabase.schema("noshashi").from("xrpl_watches").select("deposit_config")
      .eq("organization_id", embed.organization_id).eq("address", embed.deposit_address!).maybeSingle();
    const known = (await watchedAddresses(supabase, [embed.organization_id])).get(embed.organization_id) ?? [];
    const screening = await new Reads(supabase).screen(event, sanitizeDepositConfig(watch?.deposit_config), await validatedLedger(), known);
    return json(200, {
      status: screening.verdict === "clear" ? "received" : "under_review",
      delivered,
      destination_tag: (event.data as { destinationTag?: number | null }).destinationTag ?? null,
      ledger_index: ledgerIndex,
      ledger_time: event.rippleTime === null ? null : new Date((event.rippleTime + RIPPLE_EPOCH) * 1000).toISOString(),
      message: screening.verdict === "clear"
        ? `Received by ${embed.label}.`
        : `Received by ${embed.label} and waiting on a routine review before it is credited. You do not need to do anything.`,
    }, requestId, headers);
  }

  return json(404, { error: "not_found" }, requestId, headers);
}

// ── Scam registry and phishing links (public lookups) ───────────────

async function handleThreats(supabase: ServiceClient, request: Request, requestId: string): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: PUBLIC_CORS });
  if (request.method !== "GET") return json(405, { error: "method_not_allowed" }, requestId, PUBLIC_CORS);
  const raw = new URL(request.url).searchParams.get("addresses") ?? "";
  const addresses = [...new Set(raw.split(",").map((a) => a.trim()).filter(Boolean))];
  if (!addresses.length || addresses.length > 50 || !addresses.every((a) => ADDRESS_RE.test(a))) {
    return json(400, { error: "invalid_request", message: "Send ?addresses= with 1 to 50 classic addresses, comma-separated." }, requestId, PUBLIC_CORS);
  }
  const { data, error } = await supabase.schema("noshashi").rpc("threat_lookup", { p_addresses: addresses });
  if (error) throw error;
  return json(200, {
    registry: "NOSHASHI shared scam registry: reports from organizations, each with transaction evidence, confirmed by NOSHASHI staff who did not submit them",
    hits: data ?? [],
  }, requestId, PUBLIC_CORS);
}

async function phishingStatus(supabase: ServiceClient): Promise<{ last_ledger_read: number | null; last_read_at: string | null; ledgers_read_24h: number }> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ data: last, error: e1 }, { count, error: e2 }] = await Promise.all([
    supabase.schema("noshashi").from("phishing_scans").select("ledger_index, finished_at").eq("status", "ok").order("id", { ascending: false }).limit(1).maybeSingle(),
    supabase.schema("noshashi").from("phishing_scans").select("id", { count: "exact", head: true }).eq("status", "ok").gte("started_at", since),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { last_ledger_read: (last?.ledger_index as number | null) ?? null, last_read_at: (last?.finished_at as string | null) ?? null, ledgers_read_24h: count ?? 0 };
}

const PHISHING_METHOD = "One validated XRPL mainnet ledger read every minute; every domain named in the memo of an XRP payment under 0.01 XRP is kept with its transaction. A domain is listed once it was sent to at least five different accounts.";

async function handlePhishing(supabase: ServiceClient, request: Request, requestId: string): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: PUBLIC_CORS });
  if (request.method !== "GET") return json(405, { error: "method_not_allowed" }, requestId, PUBLIC_CORS);
  const domain = normalizeDomain(new URL(request.url).searchParams.get("domain") ?? "");
  if (!domain) return json(400, { error: "invalid_request", message: "Send ?domain= with a public domain name or a link." }, requestId, PUBLIC_CORS);
  const { data, error } = await supabase.schema("noshashi").rpc("phishing_domains", { p_domain: domain, p_listed_only: false, p_limit: 20 });
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return json(200, {
    domain,
    listed: rows.some((r) => r.listed === true),
    seen: rows.length > 0,
    sightings: rows,
    method: PHISHING_METHOD,
    ...(await phishingStatus(supabase)),
    note: "Not seen does not mean safe: only a sample of ledgers is read, and links also spread off the ledger.",
  }, requestId, PUBLIC_CORS);
}

async function handlePhishingFeed(supabase: ServiceClient, request: Request, org: string, requestId: string): Promise<Response> {
  if (!(await hasFeature(supabase, org, "phishing_feed"))) {
    return json(403, { error: "feature_not_enabled", message: "The phishing link feed is part of the Strategic plan. Single lookups are free at GET /phishing?domain=." }, requestId);
  }
  const params = new URL(request.url).searchParams;
  const limit = Math.min(1000, Math.max(1, Number(params.get("limit") ?? 200) || 200));
  const all = params.get("include") === "unlisted";
  const { data, error } = await supabase.schema("noshashi").rpc("phishing_domains", { p_domain: null, p_listed_only: !all, p_limit: limit });
  if (error) throw error;
  return json(200, { domains: data ?? [], count: (data ?? []).length, method: PHISHING_METHOD, ...(await phishingStatus(supabase)) }, requestId);
}

// ── Withdrawal screening ────────────────────────────────────────────

async function handleWithdrawalScreen(supabase: ServiceClient, request: Request, org: string | null, requestId: string): Promise<Response> {
  if (org && !(await hasFeature(supabase, org, "withdrawal_screening"))) {
    return json(403, { error: "feature_not_enabled", message: "Withdrawal screening is part of the Enterprise plan." }, requestId);
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const destination = String(body?.destination ?? "");
  const tag = body?.destination_tag === undefined || body?.destination_tag === null ? null : Number(body.destination_tag);
  const amount = body?.amount_xrp === undefined || body?.amount_xrp === null ? null : Number(body.amount_xrp);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((a): a is string => typeof a === "string" && ADDRESS_RE.test(a)).slice(0, 500) : []);
  if (!ADDRESS_RE.test(destination) || (tag !== null && (!Number.isInteger(tag) || tag < 0 || tag > 4294967295)) || (amount !== null && (!Number.isFinite(amount) || amount < 0))) {
    return json(400, { error: "invalid_request", message: "Send { destination, destination_tag?, amount_xrp?, previous_destinations?, own_addresses? }." }, requestId);
  }
  const [validated, info, server] = await Promise.all([
    validatedLedger(),
    xrpl("account_info", { account: destination, ledger_index: "validated" }).catch((e) => (e instanceof RippledError && e.code === "actNotFound" ? null : Promise.reject(e))),
    xrpl("server_info", {}),
  ]);
  const reserveBaseXrp = Number(server.info?.validated_ledger?.reserve_base_xrp);
  if (!Number.isFinite(reserveBaseXrp) || reserveBaseXrp <= 0) throw new Error("The base reserve could not be read.");
  const reads = new Reads(supabase);
  const chain = info ? await reads.chain(destination) : [{ account: destination, fundedBy: null, activatedLedger: null }];
  const accounts = chain.map((h) => h.account);
  const [sanctions, threats] = await Promise.all([reads.sanctions(accounts), reads.threats(accounts)]);
  const own = [...list(body?.own_addresses), ...(org ? (await watchedAddresses(supabase, [org])).get(org) ?? [] : [])];
  const result = screenWithdrawal({
    destination, destinationTag: tag, amountXrp: amount, destinationInfo: info, chain, currentLedger: validated, reserveBaseXrp,
    sanctions, threats, previousDestinations: list(body?.previous_destinations), ownAddresses: [...new Set(own)],
  });
  return json(200, {
    source: `XRPL mainnet, validated ledger ${validated}, read live from the public servers`,
    destination,
    verdict: result.verdict,
    findings: result.findings,
    funding_chain: chain,
    sanctions_list: await sanctionsStatus(supabase),
  }, requestId);
}

// ── Customer Asset Protection ───────────────────────────────────────

type Program = {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  reserve_addresses: string[];
  fund_addresses: string[];
  coverage_limit_xrp: number | string;
  public: boolean;
};

async function heldAccount(address: string, programAccounts: string[], ledgerIndex: number, closeTime: number): Promise<HeldAccount> {
  const info = await xrpl("account_info", { account: address, ledger_index: ledgerIndex, signer_lists: true })
    .catch((e) => (e instanceof RippledError && e.code === "actNotFound" ? null : Promise.reject(e)));
  const escrows: Reply[] = [];
  if (info) {
    let marker: unknown;
    for (let page = 0; page < 5; page++) {
      const r = await xrpl("account_objects", { account: address, ledger_index: ledgerIndex, type: "escrow", limit: 400, ...(marker ? { marker } : {}) });
      escrows.push(...((r.account_objects ?? []) as Reply[]));
      marker = r.marker;
      if (!marker) break;
    }
    if (marker) throw new Error(`${address} owns more than 2,000 escrows; the attestation would be incomplete.`);
  }
  return heldAccountFrom(address, info, escrows, programAccounts, closeTime);
}

/** Read the program's accounts at one validated ledger and record a hash-chained attestation. */
async function attestProgram(supabase: ServiceClient, prog: Program): Promise<Record<string, unknown>> {
  const ledger = await xrpl("ledger", { ledger_index: "validated" });
  const ledgerIndex = Number(ledger.ledger_index ?? ledger.ledger?.ledger_index);
  const closeTime = Number(ledger.ledger?.close_time);
  if (!Number.isFinite(ledgerIndex) || !Number.isFinite(closeTime)) throw new Error("The validated ledger could not be read.");
  const accounts = [...prog.reserve_addresses, ...prog.fund_addresses];
  const held: HeldAccount[] = [];
  for (let i = 0; i < accounts.length; i += 4) {
    held.push(...(await Promise.all(accounts.slice(i, i + 4).map((a) => heldAccount(a, accounts, ledgerIndex, closeTime)))));
  }
  const [{ data: liab, error: e1 }, { data: prev, error: e2 }] = await Promise.all([
    supabase.schema("noshashi").from("protection_liabilities").select("id, root, total_xrp, customers, as_of").eq("program_id", prog.id).order("id", { ascending: false }).limit(1).maybeSingle(),
    supabase.schema("noshashi").from("protection_attestations").select("digest").eq("program_id", prog.id).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const at = new Date((closeTime + 946_684_800) * 1000).toISOString();
  const report = assessProtection({
    name: prog.name,
    reserveAddresses: prog.reserve_addresses,
    fundAddresses: prog.fund_addresses,
    coverageLimitXrp: Number(prog.coverage_limit_xrp),
    liabilities: liab ? { root: String(liab.root), totalXrp: Number(liab.total_xrp), count: Number(liab.customers), asOf: new Date(String(liab.as_of)).toISOString() } : null,
  }, held.slice(0, prog.reserve_addresses.length), held.slice(prog.reserve_addresses.length), ledgerIndex, at);
  const digest = await digestOf(report);
  const { data: row, error } = await supabase.schema("noshashi").from("protection_attestations").insert({
    program_id: prog.id,
    liabilities_id: liab?.id ?? null,
    ledger_index: ledgerIndex,
    status: report.status,
    coverage_ratio: report.coverageRatio,
    report,
    digest,
    previous_digest: (prev?.digest as string | undefined) ?? null,
  }).select("id, attested_at").single();
  if (error) throw error;
  return { id: row.id, attested_at: row.attested_at, digest, previous_digest: prev?.digest ?? null, status: report.status, report };
}

const PROGRAM_COLUMNS = "id, organization_id, slug, name, reserve_addresses, fund_addresses, coverage_limit_xrp, public";

async function protectionTick(supabase: ServiceClient): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.schema("noshashi").from("protection_programs").select(PROGRAM_COLUMNS).order("created_at").limit(200);
  if (error) throw error;
  let attested = 0;
  const errors: string[] = [];
  for (const prog of (data ?? []) as Program[]) {
    if (!(await hasFeature(supabase, prog.organization_id, "proof_of_reserves"))) continue;
    try {
      await attestProgram(supabase, prog);
      attested += 1;
    } catch (e) {
      errors.push(`${prog.slug}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    }
  }
  if (errors.length) console.error(JSON.stringify({ level: "error", where: "protection-tick", errors }));
  return { programs: (data ?? []).length, attested, errors: errors.length };
}

async function handleAttest(supabase: ServiceClient, slug: string, org: string, requestId: string): Promise<Response> {
  const { data: prog, error } = await supabase.schema("noshashi").from("protection_programs").select(PROGRAM_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!prog || prog.organization_id !== org) return json(404, { error: "not_found", message: "No protection program of this organization has that slug." }, requestId);
  if (!(await hasFeature(supabase, org, "proof_of_reserves"))) {
    return json(403, { error: "feature_not_enabled", message: "Proof of reserves is part of the Institutional plan." }, requestId);
  }
  const { data: last } = await supabase.schema("noshashi").from("protection_attestations").select("attested_at").eq("program_id", prog.id).order("id", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - Date.parse(String(last.attested_at)) < 10 * 60_000) {
    return json(429, { error: "rate_limited", message: "One attestation per program every ten minutes; the daily one runs by itself." }, requestId, { "Retry-After": "600" });
  }
  return json(200, await attestProgram(supabase, prog as Program), requestId);
}

async function handleProtectionPage(supabase: ServiceClient, request: Request, slug: string, requestId: string): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: PUBLIC_CORS });
  if (request.method !== "GET") return json(405, { error: "method_not_allowed" }, requestId, PUBLIC_CORS);
  const notFound = () => json(404, { error: "not_found", message: "No public protection program has that name." }, requestId, PUBLIC_CORS);
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug)) return notFound();
  const { data: prog, error } = await supabase.schema("noshashi").from("protection_programs").select(PROGRAM_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!prog || !prog.public || !(await hasFeature(supabase, prog.organization_id, "customer_protection"))) return notFound();
  const [{ data: org }, { data: liab }, { data: history, error: e2 }] = await Promise.all([
    supabase.schema("noshashi").from("organizations").select("name, brand_name").eq("id", prog.organization_id).maybeSingle(),
    supabase.schema("noshashi").from("protection_liabilities").select("root, total_xrp, customers, as_of, published_at").eq("program_id", prog.id).order("id", { ascending: false }).limit(1).maybeSingle(),
    supabase.schema("noshashi").from("protection_attestations").select("id, attested_at, ledger_index, status, coverage_ratio, digest, previous_digest, report").eq("program_id", prog.id).order("id", { ascending: false }).limit(30),
  ]);
  if (e2) throw e2;
  const rows = (history ?? []) as Array<Record<string, unknown>>;
  return json(200, {
    program: { slug: prog.slug, name: prog.name, institution: org?.brand_name || org?.name || null, reserve_addresses: prog.reserve_addresses, fund_addresses: prog.fund_addresses, coverage_limit_xrp: Number(prog.coverage_limit_xrp) },
    liabilities: liab ?? null,
    latest: rows[0] ?? null,
    history: rows.map(({ report: _report, ...rest }) => rest),
    not_insurance: "NOSHASHI verifies and publishes what is on the ledger. It does not guarantee deposits or pay claims, and no government scheme stands behind this program.",
  }, requestId, PUBLIC_CORS);
}
