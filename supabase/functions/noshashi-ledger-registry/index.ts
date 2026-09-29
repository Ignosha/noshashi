/**
 * noshashi-ledger-registry — every permissioned domain (XLS-80) and every
 * credential (XLS-70) on XRPL mainnet, as a directory.
 *
 * The ledger has no index of objects by type, so the directory is built the
 * only honest way: by reading the whole validated state with ledger_data,
 * type-filtered and binary, 2,048 objects a page. That is about 10,000 pages
 * per type, far more than one call can read, so POST /sweep (pg_cron, every
 * minute, with the watcher's token) reads pages for a bounded time and
 * leaves the marker in noshashi.ledger_registry_sweeps for the next call.
 * Each sweep is pinned to one validated ledger. A completed sweep marks the
 * rows it did not see as removed, and a new one starts a day later.
 *
 * Public, read-only routes (any origin, no account):
 *   GET /status                      sweep progress and the ledger each type was read at
 *   GET /domains?owner=&id=          directory of permissioned domains
 *   GET /credentials?issuer=&subject=  credentials by issuer or by subject
 *   GET /issuers                     issuers and the credential types they issue
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { decode } from "npm:ripple-binary-codec@2";
import { credentialFromEntry, domainFromEntry, RIPPLE_EPOCH } from "../_shared/ledgerRegistry.ts";

type Kind = "permissioned_domain" | "credential";
const KINDS: Kind[] = ["permissioned_domain", "credential"];
// Ripple's two full-history Clio servers: a sweep pinned hours ago can still
// be read, and their ledger_data markers are interchangeable. A rippled
// server (xrplcluster) rejects a Clio marker, which restarted the sweep.
const XRPL_HTTP = ["https://s2.ripple.com:51234/", "https://s1.ripple.com:51234/"];
/** Refusals that mean "slow down", not "wrong": the sweep pauses until the next call. */
const THROTTLED = new Set(["tooBusy", "slowDown"]);
/** Stop starting new pages after this long, well inside pg_net's 150 s. */
const BUDGET_MS = 95_000;
/** A completed sweep is repeated after this long (a sweep itself takes the best part of a day). */
const RESWEEP_MS = 24 * 3600_000;
/** Another call holding the sweep inside this window is left alone. */
const LEASE_MS = 115_000;

const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HEX64 = /^[0-9A-Fa-f]{64}$/;

type Reply = Record<string, any>;

class LedgerError extends Error {
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
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`${new URL(endpoint).host} replied ${response.status}`);
      const result = ((await response.json()) as { result?: Reply }).result ?? {};
      if (result.status === "error" || result.error) {
        const code = typeof result.error === "string" ? result.error : "error";
        throw new LedgerError(typeof result.error_message === "string" ? result.error_message : code, code);
      }
      return result;
    } catch (error) {
      // A malformed marker or a ledger the server no longer has is not
      // improved by asking the other server.
      if (error instanceof LedgerError && ["invalidParams", "lgrNotFound"].includes(error.code)) throw error;
      last = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw last ?? new Error("The XRPL servers could not be reached.");
}

function json(status: number, body: unknown, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function service() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("not_configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).schema("noshashi");
}
type Db = ReturnType<typeof service>;

// ── The sweep ─────────────────────────────────────────────────────────

type SweepRow = {
  kind: Kind;
  ledger_index: number | null;
  marker: string | null;
  started_at: string | null;
  pages: number;
  objects_found: number;
  last_run_at: string | null;
  last_complete_at: string | null;
};

async function claim(db: Db, kind: Kind): Promise<SweepRow | null> {
  const cutoff = new Date(Date.now() - LEASE_MS).toISOString();
  const { data, error } = await db
    .from("ledger_registry_sweeps")
    .update({ last_run_at: new Date().toISOString() })
    .eq("kind", kind)
    .or(`last_run_at.is.null,last_run_at.lt."${cutoff}"`)
    .select("kind, ledger_index, marker, started_at, pages, objects_found, last_run_at, last_complete_at")
    .maybeSingle();
  if (error) throw error;
  return data as SweepRow | null;
}

async function save(db: Db, kind: Kind, fields: Record<string, unknown>) {
  const { error } = await db.from("ledger_registry_sweeps").update(fields).eq("kind", kind);
  if (error) throw error;
}

async function storePage(db: Db, kind: Kind, state: Array<{ data?: string; index?: string }>, ledger: number): Promise<number> {
  const now = new Date().toISOString();
  if (kind === "permissioned_domain") {
    const rows = state
      .map((s) => (s.data ? domainFromEntry(decode(s.data) as Record<string, unknown>, s.index) : null))
      .filter((d) => d !== null)
      .map((d) => ({
        domain_id: d.domainId,
        owner: d.owner,
        sequence: d.sequence,
        accepted_credentials: d.accepted,
        previous_txn_id: d.previousTxnId,
        previous_txn_ledger: d.previousTxnLedger,
        seen_ledger: ledger,
        updated_at: now,
        removed_at: null,
      }));
    if (rows.length) {
      const { error } = await db.from("ledger_domains").upsert(rows, { onConflict: "domain_id" });
      if (error) throw error;
    }
    return rows.length;
  }
  const rows = state
    .map((s) => (s.data ? credentialFromEntry(decode(s.data) as Record<string, unknown>, s.index) : null))
    .filter((c) => c !== null)
    .map((c) => ({
      credential_id: c.credentialId,
      subject: c.subject,
      issuer: c.issuer,
      credential_type_hex: c.typeHex,
      credential_type: c.type,
      accepted: c.accepted,
      expiration: c.expiration,
      uri: c.uri?.slice(0, 512) ?? null,
      previous_txn_id: c.previousTxnId,
      previous_txn_ledger: c.previousTxnLedger,
      seen_ledger: ledger,
      updated_at: now,
      removed_at: null,
    }));
  if (rows.length) {
    const { error } = await db.from("ledger_credentials").upsert(rows, { onConflict: "credential_id" });
    if (error) throw error;
  }
  return rows.length;
}

async function sweepKind(db: Db, kind: Kind, deadline: number) {
  const row = await claim(db, kind);
  if (!row) return { kind, skipped: "busy" };
  let { ledger_index: ledger, marker, pages, objects_found: found } = row;
  if (ledger === null) {
    // Nothing in progress: start one if the last is old enough.
    const fresh = row.last_complete_at && Date.now() - Date.parse(row.last_complete_at) < RESWEEP_MS;
    if (fresh) return { kind, skipped: "fresh" };
    const validated = await xrpl("ledger", { ledger_index: "validated" });
    ledger = Number(validated.ledger_index ?? validated.ledger?.ledger_index);
    if (!Number.isFinite(ledger)) throw new Error("No validated ledger index.");
    marker = null;
    pages = 0;
    found = 0;
    await save(db, kind, { ledger_index: ledger, marker: null, started_at: new Date().toISOString(), pages: 0, objects_found: 0, last_error: null });
  }
  let read = 0;
  try {
    while (Date.now() < deadline) {
      const reply = await xrpl("ledger_data", {
        ledger_index: ledger,
        type: kind,
        binary: true,
        limit: 2048,
        ...(marker ? { marker } : {}),
      });
      found += await storePage(db, kind, (reply.state ?? []) as Array<{ data?: string; index?: string }>, ledger);
      pages++;
      read++;
      marker = typeof reply.marker === "string" ? reply.marker : null;
      if (!marker) {
        const removed = await db.rpc("ledger_registry_close_sweep", { p_kind: kind, p_ledger: ledger });
        if (removed.error) throw removed.error;
        await save(db, kind, {
          ledger_index: null,
          marker: null,
          pages: 0,
          objects_found: 0,
          last_complete_at: new Date().toISOString(),
          last_complete_ledger: ledger,
          last_complete_pages: pages,
          last_error: null,
          // Released at once: nothing is left to hold.
          last_run_at: null,
        });
        return { kind, completed: true, ledger, pages, found, removed: removed.data };
      }
      // Saved every page, so a timeout loses one page at most.
      await save(db, kind, { marker, pages, objects_found: found });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);
    if (error instanceof LedgerError && THROTTLED.has(error.code)) {
      // Both servers are throttling this client: keep the place and stop.
      await save(db, kind, { last_run_at: null });
      return { kind, throttled: true, read };
    }
    const restart = error instanceof LedgerError && ["lgrNotFound", "invalidParams"].includes(error.code);
    // A pinned ledger the server has dropped, or a marker it rejects, means
    // starting again from a fresh ledger; anything else is retried as is.
    await save(db, kind, restart ? { ledger_index: null, marker: null, pages: 0, objects_found: 0, last_error: message, last_run_at: null } : { last_error: message, last_run_at: null });
    return { kind, error: message, restarted: restart, read };
  }
  await save(db, kind, { last_run_at: null });
  return { kind, ledger, pages, found, read };
}

async function sweep(db: Db) {
  const deadline = Date.now() + BUDGET_MS;
  const results = [];
  // Domains first: fewer to hold and what the Domain Grid lists.
  for (const kind of KINDS) {
    if (Date.now() >= deadline) break;
    results.push(await sweepKind(db, kind, deadline));
  }
  return { results };
}

// ── Public reads ──────────────────────────────────────────────────────

const nowRipple = () => Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;

async function status(db: Db) {
  const { data, error } = await db
    .from("ledger_registry_sweeps")
    .select("kind, ledger_index, pages, objects_found, started_at, last_complete_at, last_complete_ledger, last_complete_pages, last_error");
  if (error) throw error;
  const [domains, credentials] = await Promise.all([
    db.from("ledger_domains").select("domain_id", { count: "exact", head: true }).is("removed_at", null),
    db.from("ledger_credentials").select("credential_id", { count: "exact", head: true }).is("removed_at", null),
  ]);
  return {
    sweeps: (data ?? []).map((s) => ({
      kind: s.kind,
      in_progress: s.ledger_index !== null,
      in_progress_ledger: s.ledger_index,
      pages_read: s.pages,
      found_so_far: s.objects_found,
      started_at: s.started_at,
      last_complete_at: s.last_complete_at,
      last_complete_ledger: s.last_complete_ledger,
      last_complete_pages: s.last_complete_pages,
      last_error: s.last_error,
    })),
    domains: domains.count ?? 0,
    credentials: credentials.count ?? 0,
    method:
      "Every PermissionedDomain and Credential object in the validated ledger state, read with ledger_data (type-filtered, binary, 2,048 objects a page), each sweep pinned to one ledger. Removed objects are kept, marked with when a sweep stopped seeing them.",
  };
}

const DOMAIN_COLUMNS = "domain_id, owner, sequence, accepted_credentials, previous_txn_id, previous_txn_ledger, seen_ledger, first_seen_at, removed_at";
const CREDENTIAL_COLUMNS = "credential_id, subject, issuer, credential_type_hex, credential_type, accepted, expiration, uri, previous_txn_id, previous_txn_ledger, seen_ledger, first_seen_at, removed_at";

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  }
  try {
    const url = new URL(request.url);
    const route = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const db = service();

    if (route === "sweep" && request.method === "POST") {
      const auth = request.headers.get("authorization") ?? "";
      const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (!/^[0-9a-f]{64}$/.test(bearer)) return json(401, { error: "unauthorized" });
      const { data, error } = await db.rpc("xrpl_watch_token_ok", { p_token: bearer });
      if (error) throw error;
      if (data !== true) return json(401, { error: "unauthorized" });
      const result = await sweep(db);
      const errors = result.results.filter((r) => "error" in r);
      if (errors.length) console.error(JSON.stringify({ level: "error", where: "ledger-registry-sweep", errors }));
      return json(200, result);
    }

    if (request.method !== "GET") return json(405, { error: "method_not_allowed" });

    if (route === "status") return json(200, await status(db), 30);

    if (route === "domains") {
      const owner = url.searchParams.get("owner");
      const id = url.searchParams.get("id");
      const withRemoved = url.searchParams.get("removed") === "1";
      if (owner && !ADDRESS.test(owner)) return json(400, { error: "invalid_owner" });
      if (id && !HEX64.test(id)) return json(400, { error: "invalid_id" });
      let q = db.from("ledger_domains").select(DOMAIN_COLUMNS).order("first_seen_at", { ascending: false }).limit(1000);
      if (owner) q = q.eq("owner", owner);
      if (id) q = q.eq("domain_id", id.toUpperCase());
      if (!withRemoved) q = q.is("removed_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return json(200, { domains: data ?? [], status: await status(db) }, 60);
    }

    if (route === "credentials") {
      const issuer = url.searchParams.get("issuer");
      const subject = url.searchParams.get("subject");
      if ((!issuer && !subject) || (issuer && !ADDRESS.test(issuer)) || (subject && !ADDRESS.test(subject))) {
        return json(400, { error: "give issuer= or subject=, a classic address" });
      }
      let q = db.from("ledger_credentials").select(CREDENTIAL_COLUMNS).is("removed_at", null).order("first_seen_at", { ascending: false }).limit(5000);
      if (issuer) q = q.eq("issuer", issuer);
      if (subject) q = q.eq("subject", subject);
      const { data, error } = await q;
      if (error) throw error;
      return json(200, { credentials: data ?? [], now_ripple: nowRipple() }, 60);
    }

    if (route === "issuers") {
      const { data, error } = await db.rpc("ledger_credential_issuers", { p_now: nowRipple() });
      if (error) throw error;
      return json(200, { issuers: data ?? [], now_ripple: nowRipple(), status: await status(db) }, 120);
    }

    return json(404, { error: "not_found", routes: ["GET /status", "GET /domains", "GET /credentials", "GET /issuers", "POST /sweep"] });
  } catch (error) {
    // PostgREST errors are plain objects, not Errors: keep their message.
    const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);
    console.error(JSON.stringify({ level: "error", message }));
    return json(500, { error: "internal" });
  }
});
