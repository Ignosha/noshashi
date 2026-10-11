/**
 * noshashi-issuer-alerts — tell a holder the moment an issuer's powers change.
 *
 *   GET  /powers?issuer=r…   The issuer's current powers, read live. Public.
 *
 *   POST /subscribe          { issuer, discord_webhook }  Public, from the
 *                            /alerts/ page. Posts a receipt with the issuer's
 *                            current powers and an unsubscribe link to the
 *                            webhook, so only whoever owns the channel ever
 *                            sees it.
 *
 *   POST /unsubscribe        { token }  Public. The token is in every alert.
 *
 *   POST /telegram           The Telegram bot's webhook. Commands:
 *                            /watch r…, /unwatch r…, /list, /start.
 *                            Auth: Telegram's X-Telegram-Bot-Api-Secret-Token
 *                            header must equal TELEGRAM_WEBHOOK_SECRET.
 *
 *   POST /tick               Every five minutes from pg_cron
 *                            (noshashi.issuer_alerts_kick), only while a
 *                            subscription is active. Reads each watched
 *                            issuer once, compares it with the last reading,
 *                            and posts any change to every subscriber.
 *                            Auth: the random token kept in Vault.
 *
 * Free, within limits: FREE_ISSUERS_PER_TARGET issuers per Discord channel
 * or Telegram chat. The rules for what counts as a change are in
 * ../_shared/issuerPowers.ts. Every reading is live from the public XRPL
 * servers; an issuer that could not be read is skipped this round, never
 * reported as changed.
 *
 * Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (always present),
 * TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET (only for Telegram; the
 * Discord path works without them).
 *
 * Deploy: supabase functions deploy noshashi-issuer-alerts --no-verify-jwt
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ADDRESS_RE,
  alertText,
  describePowers,
  diffPowers,
  DISCORD_WEBHOOK_RE,
  powersFrom,
  type Powers,
} from "../_shared/issuerPowers.ts";

const XRPL_HTTP = ["https://xrplcluster.com/", "https://s2.ripple.com:51234/", "https://s1.ripple.com:51234/"];
const FREE_ISSUERS_PER_TARGET = 3;
const ISSUERS_PER_TICK = 150;
const SITE = "https://www.noshashi.app";
const ALLOWED_ORIGINS = new Set([SITE, "https://noshashi.app"]);

// deno-lint-ignore no-explicit-any
type Json = any;

function service() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).schema("noshashi");
}
type Db = NonNullable<ReturnType<typeof service>>;

async function accountInfo(issuer: string): Promise<{ info: Json; ledgerIndex: number | null } | null> {
  let last: unknown = null;
  for (const endpoint of XRPL_HTTP) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "account_info",
          params: [{ account: issuer, ledger_index: "validated", signer_lists: true }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`${new URL(endpoint).host} replied ${response.status}`);
      const result = ((await response.json()) as { result?: Json }).result ?? {};
      // The account does not exist: the ledger's answer, not a transport fault.
      if (result.error === "actNotFound") return null;
      if (result.error) throw new Error(String(result.error_message ?? result.error));
      return { info: result, ledgerIndex: Number(result.ledger_index ?? result.ledger_current_index) || null };
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("ledger unreachable");
}

function cors(origin: string | null): Record<string, string> {
  return origin && ALLOWED_ORIGINS.has(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" }
    : {};
}

function json(status: number, body: Json, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...cors(origin) },
  });
}

const unsubscribeUrl = (token: string) => `${SITE}/alerts/?unsubscribe=${token}`;

// ── Delivery ─────────────────────────────────────────────────────────

/** true: delivered; false: the target is gone for good (stop sending); null: try next time. */
async function sendDiscord(webhook: string, text: string): Promise<boolean | null> {
  if (!DISCORD_WEBHOOK_RE.test(webhook)) return false;
  try {
    const response = await fetch(`${webhook}?wait=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // No mentions: an alert must never be a way to ping @everyone.
      body: JSON.stringify({ content: text.slice(0, 1990), allowed_mentions: { parse: [] }, username: "NOSHASHI" }),
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404 || response.status === 401) return false;
    return response.ok ? true : null;
  } catch {
    return null;
  }
}

async function sendTelegram(chatId: string, text: string): Promise<boolean | null> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token || !/^-?\d{1,20}$/.test(chatId)) return null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8_000),
    });
    // 403: the bot was blocked or removed from the chat.
    if (response.status === 403 || response.status === 400) return false;
    return response.ok ? true : null;
  } catch {
    return null;
  }
}

const deliver = (channel: string, target: string, text: string) =>
  channel === "discord" ? sendDiscord(target, text) : sendTelegram(target, text);

// ── Subscriptions ────────────────────────────────────────────────────

type SubscribeResult = { ok: true; token: string; powers: Powers; ledgerIndex: number | null } | { ok: false; status: number; error: string; message: string };

async function subscribe(db: Db, issuer: string, channel: "discord" | "telegram", target: string): Promise<SubscribeResult> {
  if (!ADDRESS_RE.test(issuer)) return { ok: false, status: 400, error: "invalid_issuer", message: "That is not an XRPL classic address. They begin with r." };

  const { count, error: countError } = await db
    .from("issuer_alert_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("channel", channel).eq("target", target).eq("active", true).neq("issuer", issuer);
  if (countError) throw countError;
  if ((count ?? 0) >= FREE_ISSUERS_PER_TARGET) {
    return { ok: false, status: 402, error: "limit_reached", message: `Free alerts cover ${FREE_ISSUERS_PER_TARGET} issuers per channel. Unwatch one, or write to institutions@noshashi.app for more.` };
  }

  const read = await accountInfo(issuer);
  if (!read) return { ok: false, status: 404, error: "issuer_not_found", message: "No account with that address exists on the ledger." };
  const powers = powersFrom(read.info);
  if (!powers) return { ok: false, status: 502, error: "unreadable", message: "The issuer could not be read. Try again shortly." };

  // The first reading is the baseline. Kept if one exists, so a new
  // subscriber does not reset what everyone else is compared against.
  const { error: stateError } = await db.from("issuer_alert_state").upsert(
    { issuer, powers, ledger_index: read.ledgerIndex, checked_at: new Date().toISOString() },
    { onConflict: "issuer", ignoreDuplicates: true },
  );
  if (stateError) throw stateError;

  const { data, error } = await db
    .from("issuer_alert_subscriptions")
    .upsert({ issuer, channel, target, active: true, failures: 0 }, { onConflict: "issuer,channel,target" })
    .select("unsubscribe_token")
    .single();
  if (error) throw error;
  return { ok: true, token: data.unsubscribe_token as string, powers, ledgerIndex: read.ledgerIndex };
}

function receiptText(issuer: string, ledgerIndex: number | null, powers: Powers, token: string): string {
  return [
    "NOSHASHI · watching issuer",
    `${issuer}${ledgerIndex ? ` (ledger ${ledgerIndex})` : ""}`,
    "",
    describePowers(powers),
    "",
    "You will get a message here the moment any of these change: freeze, clawback, signing keys, signer list, transfer fee, holding permission, domain.",
    `Full reading: ${SITE}/certificate/?issuer=${issuer}`,
    `Stop: ${unsubscribeUrl(token)}`,
  ].join("\n");
}

async function handleSubscribe(db: Db, request: Request, origin: string | null): Promise<Response> {
  let body: Json;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid_json" }, origin);
  }
  const issuer = String(body?.issuer ?? "").trim();
  const webhook = String(body?.discord_webhook ?? "").trim();
  if (!DISCORD_WEBHOOK_RE.test(webhook)) {
    return json(400, { error: "invalid_webhook", message: "Paste a Discord channel webhook URL (Server Settings → Integrations → Webhooks → Copy Webhook URL)." }, origin);
  }
  const result = await subscribe(db, issuer, "discord", webhook);
  if (!result.ok) return json(result.status, { error: result.error, message: result.message }, origin);

  const sent = await sendDiscord(webhook, receiptText(issuer, result.ledgerIndex, result.powers, result.token));
  if (sent === false) {
    await db.from("issuer_alert_subscriptions").update({ active: false }).eq("unsubscribe_token", result.token);
    return json(400, { error: "webhook_rejected", message: "Discord refused that webhook. Check it was copied whole and still exists." }, origin);
  }
  // The token is not returned: it is in the Discord message, which only the
  // channel's members can read. Returning it here would let anyone who knew a
  // webhook URL mint unsubscribe links for it.
  return json(200, { ok: true, issuer, ledger_index: result.ledgerIndex, powers: result.powers, receipt_delivered: sent === true }, origin);
}

async function handleUnsubscribe(db: Db, request: Request, origin: string | null): Promise<Response> {
  let token = "";
  try {
    token = String((await request.json())?.token ?? "");
  } catch { /* fall through to the shape check */ }
  if (!/^[0-9a-f]{48}$/.test(token)) return json(400, { error: "invalid_token" }, origin);
  const { data, error } = await db.from("issuer_alert_subscriptions").update({ active: false }).eq("unsubscribe_token", token).select("issuer");
  if (error) throw error;
  if (!data?.length) return json(404, { error: "not_found", message: "That link is not valid, or was already used." }, origin);
  return json(200, { ok: true, issuer: data[0].issuer }, origin);
}

async function handleTelegram(db: Db, request: Request): Promise<Response> {
  const secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) return json(401, { error: "unauthorized" });
  const update: Json = await request.json().catch(() => null);
  const message = update?.message ?? update?.channel_post;
  const chatId = message?.chat?.id !== undefined ? String(message.chat.id) : "";
  const text = String(message?.text ?? "").trim();
  if (!chatId || !text.startsWith("/")) return json(200, { ok: true });

  const [command, argument = ""] = text.split(/\s+/, 2);
  const name = command.split("@")[0].toLowerCase();
  const reply = (body: string) => sendTelegram(chatId, body);

  if (name === "/watch") {
    const result = await subscribe(db, argument, "telegram", chatId);
    await reply(result.ok ? receiptText(argument, result.ledgerIndex, result.powers, result.token) : result.message);
  } else if (name === "/unwatch") {
    const { data, error } = await db.from("issuer_alert_subscriptions").update({ active: false })
      .eq("channel", "telegram").eq("target", chatId).eq("issuer", argument).eq("active", true).select("id");
    if (error) throw error;
    await reply(data?.length ? `Stopped watching ${argument}.` : `This chat was not watching ${argument}.`);
  } else if (name === "/list") {
    const { data, error } = await db.from("issuer_alert_subscriptions").select("issuer")
      .eq("channel", "telegram").eq("target", chatId).eq("active", true);
    if (error) throw error;
    await reply(data?.length ? `Watching:\n${data.map((r) => r.issuer).join("\n")}` : "Not watching any issuer. Send /watch r… to start.");
  } else {
    await reply([
      "NOSHASHI issuer alerts. Read-only: this bot never asks for keys or seeds, and never will.",
      "",
      "/watch r…    alert this chat when an XRPL issuer's powers change",
      "/unwatch r…  stop",
      "/list        what this chat watches",
      "",
      `Free for up to ${FREE_ISSUERS_PER_TARGET} issuers per chat. ${SITE}/alerts/`,
    ].join("\n"));
  }
  return json(200, { ok: true });
}

// ── The tick ─────────────────────────────────────────────────────────

async function tick(db: Db): Promise<Json> {
  const { data: subs, error } = await db.from("issuer_alert_subscriptions")
    .select("id, issuer, channel, target, unsubscribe_token, failures").eq("active", true);
  if (error) throw error;

  const byIssuer = new Map<string, Json[]>();
  for (const s of subs ?? []) byIssuer.set(s.issuer, [...(byIssuer.get(s.issuer) ?? []), s]);

  // Least recently checked first, so a long list is covered in turn.
  const { data: states, error: stateError } = await db.from("issuer_alert_state")
    .select("issuer, powers, ledger_index, checked_at").in("issuer", [...byIssuer.keys()]);
  if (stateError) throw stateError;
  const stateOf = new Map((states ?? []).map((s) => [s.issuer, s]));
  const order = [...byIssuer.keys()]
    .sort((a, b) => String(stateOf.get(a)?.checked_at ?? "").localeCompare(String(stateOf.get(b)?.checked_at ?? "")))
    .slice(0, ISSUERS_PER_TICK);

  let read = 0, changed = 0, sent = 0, unreadable = 0;
  for (const issuer of order) {
    let reading;
    try {
      reading = await accountInfo(issuer);
    } catch {
      unreadable += 1;
      continue;
    }
    const after = reading ? powersFrom(reading.info) : null;
    if (!after) { unreadable += 1; continue; }
    read += 1;

    const before = (stateOf.get(issuer)?.powers ?? null) as Powers | null;
    const changes = diffPowers(before, after);
    if (changes.length) {
      changed += 1;
      for (const s of byIssuer.get(issuer) ?? []) {
        const ok = await deliver(s.channel, s.target, alertText(issuer, reading!.ledgerIndex, changes, unsubscribeUrl(s.unsubscribe_token)));
        if (ok === true) {
          sent += 1;
          await db.from("issuer_alert_subscriptions").update({ last_notified_at: new Date().toISOString(), failures: 0 }).eq("id", s.id);
        } else {
          // Gone for good, or failing for a day of ticks: stop trying.
          const failures = Number(s.failures ?? 0) + 1;
          await db.from("issuer_alert_subscriptions").update({ failures, active: ok === null && failures < 288 }).eq("id", s.id);
        }
      }
    }
    // The new reading becomes the baseline whether or not anything changed,
    // and only after delivery was attempted: a crash between the two sends
    // the alert again rather than losing it.
    await db.from("issuer_alert_state").upsert({ issuer, powers: after, ledger_index: reading!.ledgerIndex, checked_at: new Date().toISOString() });
  }
  return { issuers: byIssuer.size, read, changed, sent, unreadable };
}

// ── HTTP ─────────────────────────────────────────────────────────────

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  try {
    const db = service();
    if (!db) return json(503, { error: "not_configured" });
    const url = new URL(request.url);
    const route = url.pathname.split("/").filter(Boolean).pop();

    if (route === "powers" && request.method === "GET") {
      const issuer = url.searchParams.get("issuer") ?? "";
      if (!ADDRESS_RE.test(issuer)) return json(400, { error: "invalid_issuer" }, origin);
      const read = await accountInfo(issuer);
      if (!read) return json(404, { error: "issuer_not_found" }, origin);
      const powers = powersFrom(read.info);
      return json(powers ? 200 : 502, { issuer, ledger_index: read.ledgerIndex, powers, summary: powers ? describePowers(powers) : null }, origin);
    }
    if (route === "subscribe" && request.method === "POST") return await handleSubscribe(db, request, origin);
    if (route === "unsubscribe" && request.method === "POST") return await handleUnsubscribe(db, request, origin);
    if (route === "telegram" && request.method === "POST") return await handleTelegram(db, request);

    if (route === "tick" && request.method === "POST") {
      const auth = request.headers.get("authorization") ?? "";
      const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (!/^[0-9a-f]{64}$/.test(bearer)) return json(401, { error: "unauthorized" });
      const { data, error } = await db.rpc("issuer_alerts_token_ok", { p_token: bearer });
      if (error) throw error;
      if (data !== true) return json(401, { error: "unauthorized" });
      return json(200, await tick(db));
    }
    return json(404, { error: "not_found", routes: ["GET /powers?issuer=", "POST /subscribe", "POST /unsubscribe", "POST /telegram", "POST /tick"] }, origin);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", where: "issuer-alerts", message: error instanceof Error ? error.message : String(error) }));
    return json(500, { error: "internal" }, origin);
  }
});
