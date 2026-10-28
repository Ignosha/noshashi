/**
 * noshashi-evidence-report — builds and emails the Ledger Evidence Report.
 *
 *   POST /tick               Hourly from pg_cron (noshashi.evidence_reports_kick),
 *                            only while a delivery is due, and at once from
 *                            the Stripe webhook when an order is paid.
 *                            Builds each due report from NOSHASHI's public
 *                            endpoints, emails it to the buyer with the raw
 *                            evidence attached, and records its SHA-256.
 *                            Auth: the random token kept in Vault.
 *
 *   GET  /verify?digest=…    Public. Whether a report with this SHA-256 was
 *                            issued, to whom and when, so an auditor holding
 *                            one can confirm it came from NOSHASHI unaltered.
 *
 * Email goes through Resend (RESEND_API_KEY; REPORT_FROM overrides the
 * sender, which must be on a domain verified in Resend). Until the key is
 * set, nothing is claimed and orders simply wait.
 *
 * A report whose readings could not all be taken is not sent: it is
 * retried on the next tick, and after MAX_ATTEMPTS the order is handed to
 * the support inbox instead, so a buyer never receives a report with a
 * gap presented as complete. Orders are written by noshashi-stripe-webhook;
 * the schedule each tier buys and the document itself are in
 * ../_shared/evidenceReport.ts.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  SITE,
  TIERS,
  type Source,
  type Tier,
  evidenceOf,
  findings,
  renderReport,
  requestsFor,
} from "../_shared/evidenceReport.ts";

const MAX_ATTEMPTS = 4;
/** Each tick stays well inside the function's wall-clock limit. */
const PER_TICK = 2;
const READ_TIMEOUT_MS = 50_000;
const ALLOWED_ORIGINS = new Set(["https://www.noshashi.app", "https://noshashi.app"]);

type Json = Record<string, unknown>;

function service() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).schema("noshashi");
}
type Db = NonNullable<ReturnType<typeof service>>;

function cors(origin: string | null): Record<string, string> {
  return origin && ALLOWED_ORIGINS.has(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin" }
    : {};
}

function json(status: number, body: Json, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...cors(origin) },
  });
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function read(path: string): Promise<{ reply?: unknown; error?: string }> {
  try {
    const response = await fetch(SITE + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { error: String((body as Json).error ?? `HTTP ${response.status}`) };
    return { reply: body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Every reading for one report. Supply is walked when the reading allows it, and read without when it does not. */
async function gather(scope: { issuers: string[]; wallets: string[]; books: string[] }, periodEnd: string | null): Promise<Source[]> {
  return await Promise.all(
    requestsFor(scope, periodEnd).map(async (r) => {
      let request = r.path;
      let got = await read(request);
      if (got.error && r.kind === "issuer") {
        request = r.path.replace("&walk=1", "");
        got = await read(request);
      }
      return { kind: r.kind, subject: r.subject, request, ...got } as Source;
    }),
  );
}

async function sendEmail(message: Json): Promise<{ ok: boolean; status: number; detail?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, status: 0, detail: "RESEND_API_KEY is not set" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("REPORT_FROM") || "NOSHASHI Reports <reports@mail.noshashi.app>", ...message }),
  }).catch((error) => ({ ok: false, status: 0, text: async () => String(error) }) as unknown as Response);
  return { ok: response.ok, status: response.status, detail: response.ok ? undefined : (await response.text().catch(() => "")).slice(0, 300) };
}

type Order = {
  id: string;
  reference: string;
  tier: Tier;
  email: string;
  organization: string | null;
  issuers: string[];
  wallets: string[];
  books: string[];
};
type Delivery = { id: string; order_id: string; seq: number; period_end: string | null; attempts: number };

async function deliver(db: Db, delivery: Delivery): Promise<string> {
  const { data: order } = await db.from("evidence_report_orders").select("*").eq("id", delivery.order_id).maybeSingle<Order>();
  if (!order) return "order_missing";
  const inbox = Deno.env.get("SUPPORT_INBOX") || "support@noshashi.app";
  const reference = `${order.reference}-${String(delivery.seq).padStart(2, "0")}`;
  const sources = await gather(order, delivery.period_end);
  const failed = sources.filter((s) => s.error);

  if (failed.length) {
    const giveUp = delivery.attempts >= MAX_ATTEMPTS;
    const error = failed.map((s) => `${s.subject}: ${s.error}`).join("; ").slice(0, 900);
    await db.from("evidence_report_deliveries").update({ status: giveUp ? "needs_attention" : "retry", last_error: error }).eq("id", delivery.id);
    if (giveUp) {
      await sendEmail({
        to: [inbox],
        subject: `[${reference}] Evidence report needs attention: readings failed ${delivery.attempts} times`,
        text: [
          `Order ${order.reference} (${TIERS[order.tier].name}) for ${order.organization ?? order.email} could not be built.`,
          `Readings that failed: ${error}`,
          "",
          `The buyer (${order.email}) has not been sent anything for this delivery. Check the addresses, then set the delivery's status back to 'retry' to try again, or refund it in Stripe.`,
        ].join("\n"),
      });
    }
    return giveUp ? "needs_attention" : "retry";
  }

  const generatedAt = new Date().toISOString();
  const evidence = evidenceOf(sources);
  const digest = await sha256(evidence);
  const html = renderReport({ reference, tier: order.tier, organization: order.organization, scope: order, periodEnd: delivery.period_end, generatedAt, sources, digest });
  const verify = `${SITE}/evidence-report/verify/?digest=${digest}`;
  const file = `noshashi-evidence-report-${reference}`;

  const sent = await sendEmail({
    to: [order.email],
    bcc: [inbox],
    reply_to: inbox,
    subject: `Your NOSHASHI Ledger Evidence Report ${reference}${delivery.period_end ? ` (period end ${delivery.period_end})` : ""}`,
    text: [
      `Your Ledger Evidence Report ${reference} is attached${order.organization ? ` for ${order.organization}` : ""}.`,
      "",
      "Findings in brief:",
      ...findings(sources).map((f) => `- ${f}`),
      "",
      `Open ${file}.html in any browser to read it, and print it to save it as a PDF. ${file}.json holds every ledger reply the report was built from; its SHA-256 is ${digest}.`,
      `Anyone, your auditor included, can confirm this report came from NOSHASHI unaltered: ${verify}`,
      "",
      "It is a record of public ledger facts at the stated ledger indexes, not an audit opinion, a valuation or a legal finding.",
      "Questions: reply to this email.",
      "",
      "NOSHASHI · https://www.noshashi.app",
    ].join("\n"),
    attachments: [
      { filename: `${file}.html`, content: base64(html) },
      { filename: `${file}.json`, content: base64(evidence) },
    ],
  });

  if (!sent.ok) {
    await db.from("evidence_report_deliveries").update({ status: delivery.attempts >= MAX_ATTEMPTS ? "needs_attention" : "retry", last_error: `email ${sent.status}: ${sent.detail ?? ""}`.slice(0, 900) }).eq("id", delivery.id);
    return "email_failed";
  }
  const ledgers = Object.fromEntries(
    sources.map((s) => {
      // deno-lint-ignore no-explicit-any
      const r = s.reply as any;
      return [s.request, r?.ledgerIndex ?? r?.ledger?.index ?? r?.ledger_index ?? null];
    }),
  );
  await db
    .from("evidence_report_deliveries")
    .update({ status: "sent", sent_at: new Date().toISOString(), report_sha256: digest, ledger_indexes: ledgers, last_error: null, generated_at: generatedAt })
    .eq("id", delivery.id);
  return "sent";
}

async function tick(db: Db): Promise<Json> {
  // Without a way to send, claiming would only spend attempts. Orders wait,
  // due, and the hourly tick picks them up once the key is set.
  if (!Deno.env.get("RESEND_API_KEY")) return { processed: 0, waiting: "RESEND_API_KEY is not set" };
  const { data: due, error } = await db.rpc("evidence_reports_claim", { p_limit: PER_TICK });
  if (error) throw error;
  const results: Json[] = [];
  for (const delivery of (due ?? []) as Delivery[]) {
    try {
      results.push({ id: delivery.id, result: await deliver(db, delivery) });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from("evidence_report_deliveries").update({ status: "retry", last_error: message.slice(0, 900) }).eq("id", delivery.id);
      results.push({ id: delivery.id, result: "error", message });
    }
  }
  return { processed: results.length, results };
}

async function verify(db: Db, digest: string, origin: string | null): Promise<Response> {
  if (!/^[0-9A-Fa-f]{64}$/.test(digest)) return json(400, { error: "invalid_digest" }, origin);
  const { data } = await db
    .from("evidence_report_deliveries")
    .select("seq, period_end, generated_at, sent_at, ledger_indexes, evidence_report_orders(reference, organization, tier)")
    .eq("report_sha256", digest.toUpperCase())
    .maybeSingle();
  if (!data) return json(200, { found: false, digest: digest.toUpperCase() }, origin);
  // deno-lint-ignore no-explicit-any
  const order = (data as any).evidence_report_orders ?? {};
  return json(
    200,
    {
      found: true,
      digest: digest.toUpperCase(),
      reference: `${order.reference}-${String(data.seq).padStart(2, "0")}`,
      organization: order.organization ?? null,
      tier: order.tier ? TIERS[order.tier as Tier]?.name ?? order.tier : null,
      period_end: data.period_end,
      generated_at: data.generated_at,
      sent_at: data.sent_at,
      ledger_indexes: data.ledger_indexes,
    },
    origin,
  );
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  try {
    const db = service();
    if (!db) return json(503, { error: "not_configured" });
    const url = new URL(request.url);
    const route = url.pathname.split("/").filter(Boolean).pop();

    if (route === "verify" && request.method === "GET") return await verify(db, url.searchParams.get("digest") ?? "", origin);

    if (route === "tick" && request.method === "POST") {
      const auth = request.headers.get("authorization") ?? "";
      const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (!/^[0-9a-f]{64}$/.test(bearer)) return json(401, { error: "unauthorized" });
      const { data, error } = await db.rpc("evidence_reports_token_ok", { p_token: bearer });
      if (error) throw error;
      if (data !== true) return json(401, { error: "unauthorized" });
      return json(200, await tick(db));
    }
    return json(404, { error: "not_found", routes: ["GET /verify?digest=", "POST /tick"] }, origin);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", where: "evidence-report", message: error instanceof Error ? error.message : String(error) }));
    return json(500, { error: "internal" }, origin);
  }
});
