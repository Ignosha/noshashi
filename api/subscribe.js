/*
 * POST /api/subscribe — join the product-update list.
 *
 * Contacts are stored in a Resend Audience rather than a database. That
 * is not laziness: the site has no server-side state anywhere else, and
 * a subscribers table would be the first — with a retention question,
 * an export obligation and a breach surface attached — to store
 * something Resend already stores, with unsubscribe handling built in.
 *
 * Needs RESEND_API_KEY (already set) and RESEND_AUDIENCE_ID. Without an
 * audience the endpoint returns 503 and says so, rather than accepting
 * an address it has nowhere to put. GET /api/contact-status reports it.
 *
 * The welcome email is sent immediately and is the confirmation: a
 * subscribe form that silently succeeds gives the visitor no way to
 * know whether their address was typed correctly.
 */

import { clientKey, take } from "./_lib/rate-limit.js";
import { fetchWithTimeout } from "./_lib/html.js";
import { welcomeEmail } from "./_lib/email.js";

const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;
const API = "https://api.resend.com";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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
  if (!key || !audience) {
    return res.status(503).json({
      error: "The update list is not configured on this deployment yet, so nothing was saved.",
      configure: "Set RESEND_AUDIENCE_ID (create an Audience in Resend). RESEND_API_KEY is already required by the contact form.",
    });
  }

  try {
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

    const from = process.env.CONTACT_FROM || "NOSHASHI <noreply@noshashi.app>";
    const welcome = welcomeEmail({ unsubscribeUrl: "{{{RESEND_UNSUBSCRIBE_URL}}}" });
    const sent = await fetchWithTimeout(`${API}/emails`, {
      timeout: 10_000,
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject: welcome.subject, html: welcome.html }),
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
