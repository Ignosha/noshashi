/*
 * POST /api/subscribe — join the product-update list.
 * GET  /api/subscribe?unsubscribe=<token> — leave it.
 *
 * Two places a subscriber can be stored, in order:
 *
 *   1. A Resend Audience, when RESEND_AUDIENCE_ID is set. Resend then
 *      owns the list and its unsubscribe handling.
 *   2. Otherwise the NOSHASHI Supabase project, through two narrow
 *      functions (noshashi_subscribe / noshashi_unsubscribe) callable with
 *      the publishable key the desktop app already ships. The table itself
 *      is private: nothing on this side can read the list back.
 *
 * The welcome email (RESEND_API_KEY) is sent immediately and is the
 * confirmation: a subscribe form that silently succeeds gives the visitor
 * no way to know whether their address was typed correctly.
 */

import { clientKey, take } from "./_lib/rate-limit.js";
import { fetchWithTimeout } from "./_lib/html.js";
import { welcomeEmail } from "./_lib/email.js";
import { queryOf } from "./_lib/query.js";

const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;
const API = "https://api.resend.com";
const SITE = "https://www.noshashi.app";
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public by design: the same project URL and publishable key the desktop
// app ships (src/lib/supabase/project.ts). They grant only what the two
// functions above allow.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://xiurbiwuwcfowqnpmwki.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5Kk09a9QEwX1iALqmX-w8g_2fLY7tHO";

function supabaseRpc(name, args) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    timeout: 10_000,
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

function page(res, status, title, text) {
  res.status(status).setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title} · NOSHASHI</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07130d;color:#e6efe9;
font:16px/1.6 system-ui,sans-serif;padding:16px}main{max-width:440px;text-align:center}
a{color:#4C8DFF}</style></head><body><main><h1>${title}</h1><p>${text}</p>
<p><a href="${SITE}/">Back to noshashi.app</a></p></main></body></html>`);
}

async function unsubscribe(req, res) {
  const token = String(queryOf(req).unsubscribe || "");
  if (!TOKEN.test(token)) return page(res, 400, "Link not recognised", "This unsubscribe link is incomplete. Email support@noshashi.app and we will remove you by hand.");
  try {
    const r = await supabaseRpc("noshashi_unsubscribe", { p_token: token });
    if (!r.ok) throw new Error(`rpc ${r.status}`);
    // A token that matched nothing was already used: the visitor is off
    // the list either way, so both cases say the same thing.
    return page(res, 200, "You're unsubscribed", "You will not get any more update emails from NOSHASHI.");
  } catch (error) {
    console.error("[subscribe] unsubscribe failed", error);
    return page(res, 502, "That did not go through", "Try the link again in a minute, or email support@noshashi.app.");
  }
}

export default async function handler(req, res) {
  if (req.method === "GET" && queryOf(req).unsubscribe !== undefined) return unsubscribe(req, res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");

  const limit = take(`subscribe:${clientKey(req)}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!limit.ok) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({ error: "Too many attempts. Try again shortly." });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body && typeof body === "object" ? body : {};

  // Same two silent gates as the contact form.
  if (String(body.company_website || "").trim()) return res.status(200).json({ ok: true });
  if (Number(body.elapsed) >= 0 && Number(body.elapsed) < 2000) return res.status(200).json({ ok: true });

  const email = String(body.email || "").trim().slice(0, 200);
  if (!EMAIL.test(email)) {
    return res.status(400).json({ error: "That does not look like an email address." });
  }

  const key = process.env.RESEND_API_KEY;
  const audience = process.env.RESEND_AUDIENCE_ID;
  const source = String(body.source || "").slice(0, 80) || null;

  try {
    let unsubscribeUrl;
    if (key && audience) {
      const add = await fetchWithTimeout(`${API}/audiences/${encodeURIComponent(audience)}/contacts`, {
        timeout: 10_000,
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, unsubscribed: false }),
      });
      if (!add.ok) {
        const detail = await add.json().catch(() => ({}));
        // An address already on the list is a success from the visitor's
        // side. Telling them otherwise invites a second attempt, and
        // confirming "you are already subscribed" to an arbitrary caller
        // leaks who is on the list.
        const already = add.status === 409 || /already/i.test(detail?.message || "");
        if (!already) {
          console.error("[subscribe] resend rejected the contact", add.status, detail?.message);
          return res.status(502).json({ error: "That did not save. Try again, or email support@noshashi.app." });
        }
        return res.status(200).json({ ok: true, message: "You're on the list." });
      }
      unsubscribeUrl = "{{{RESEND_UNSUBSCRIBE_URL}}}";
    } else {
      const add = await supabaseRpc("noshashi_subscribe", { p_email: email, p_source: source });
      if (!add.ok) {
        console.error("[subscribe] supabase rejected the contact", add.status);
        return res.status(502).json({ error: "That did not save. Try again, or email support@noshashi.app." });
      }
      const token = await add.json().catch(() => null);
      // No token means the address was already subscribed. Same answer as
      // above, for the same reason, and no second welcome email.
      if (!token) return res.status(200).json({ ok: true, message: "You're on the list." });
      unsubscribeUrl = `${SITE}/api/subscribe?unsubscribe=${encodeURIComponent(token)}`;
    }

    if (!key) return res.status(200).json({ ok: true, message: "Subscribed." });

    const from = process.env.CONTACT_FROM || "NOSHASHI <noreply@noshashi.app>";
    const welcome = welcomeEmail({ unsubscribeUrl });
    const sent = await fetchWithTimeout(`${API}/emails`, {
      timeout: 10_000,
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: welcome.subject,
        html: welcome.html,
        headers: unsubscribeUrl.startsWith("http") ? { "List-Unsubscribe": `<${unsubscribeUrl}>` } : undefined,
      }),
    });

    // The contact is saved either way; a failed welcome is worth logging
    // but is not worth telling the visitor they failed to subscribe.
    if (!sent.ok) console.error("[subscribe] welcome email failed", sent.status);

    return res.status(200).json({
      ok: true,
      message: sent.ok ? "Subscribed. Check your inbox." : "Subscribed.",
    });
  } catch (error) {
    console.error("[subscribe] threw", error);
    return res.status(502).json({ error: "That did not save. Try again shortly." });
  }
}
