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
  issuerFactsFrom,
  normalizeTx,
  sanitizeDepositConfig,
  screenDeposit,
  type DepositConfig,
  type FundingHop,
  type IssuerFacts,
  type XrplEvent,
} from "../_shared/xrplEvents.ts";
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

  async screen(event: XrplEvent, config: DepositConfig, currentLedger: number) {
    const delivered = (event.data as { delivered?: { issuer: string | null; currency: string } | null }).delivered;
    const [issuer, chain] = await Promise.all([
      delivered?.issuer ? this.issuer(delivered.issuer, delivered.currency) : Promise.resolve(null),
      event.counterparty ? this.chain(event.counterparty) : Promise.resolve([]),
    ]);
    return { ...screenDeposit({ event, config, issuer, chain, currentLedger }), chain };
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
          ? { ...event, screening: await req.reads.screen(event, req.config, req.currentLedger) }
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

async function readWatch(supabase: ServiceClient, watch: Watch, validated: number, reads: Reads): Promise<{ recorded: number; error?: string }> {
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
    });
    return { recorded: await record(read.events, read.processedTo, null) };
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === "object" ? JSON.stringify(error) : String(error);
    await record([], null, message.slice(0, 500));
    return { recorded: 0, error: message };
  }
}

async function tick(supabase: ServiceClient): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.schema("noshashi").rpc("xrpl_watches_due", { p_limit: WATCHES_PER_TICK });
  if (error) throw error;
  const watches = (data ?? []) as Watch[];
  if (!watches.length) return { watches: 0 };
  const validated = await validatedLedger();
  const reads = new Reads();
  const results: Array<{ recorded: number; error?: string }> = [];
  // Four at a time: the public servers are shared and free.
  for (let i = 0; i < watches.length; i += 4) {
    results.push(...(await Promise.all(watches.slice(i, i + 4).map((w) => readWatch(supabase, w, validated, reads)))));
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
    const route = new URL(request.url).pathname.split("/").filter(Boolean).pop();
    const authorization = request.headers.get("authorization");

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

    if (route !== "events" && route !== "screen" && route !== "history") {
      return json(404, { error: "not_found", routes: ["GET /events", "POST /screen", "POST /history"] }, requestId);
    }

    let org: string | null = null;
    if (!internal) {
      const auth = await authenticateKey(supabase, authorization);
      if (auth === "unauthorized") return json(401, { error: "unauthorized", message: "A valid, unexpired nsh_live_ key with the read or verify scope is required." }, requestId, { "WWW-Authenticate": 'Bearer realm="noshashi"' });
      if (auth === "org_key_required") return json(403, { error: "org_key_required", message: "Event feeds and screening belong to an organization. Issue the key from the organization's API keys." }, requestId);
      if (!(await rateAllowed(supabase, auth.keyId))) return json(429, { error: "rate_limited", message: "At most 10 requests a second and 300 a minute." }, requestId, { "Retry-After": "1" });
      org = auth.organizationId;
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
  const screening = await new Reads().screen(event, config, validated);
  return json(200, {
    source: `XRPL mainnet, validated ledger ${validated}, read live from the public servers`,
    event,
    verdict: screening.verdict,
    credit: screening.credit,
    findings: screening.findings,
    funding_chain: screening.chain,
    config_used: { accepted_issuers: config.acceptedIssuers, deny_list_entries: config.denylist.length, require_tag: config.requireTag, travel_rule_xrp: config.travelRuleXrp },
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
    config: sanitizeDepositConfig(body?.config ?? {}), currentLedger: validated, reads: new Reads(),
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
