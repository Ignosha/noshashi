/*
 * POST /api/contact — the enquiry channel.
 *
 * Every configured channel is delivered to, not the first one that
 * works:
 *
 *   1. RESEND_API_KEY → emailed to every address in CONTACT_TO.
 *   2. CONTACT_WEBHOOK_URL → posted as JSON (Slack, Zapier, Make, a
 *      Google Sheet, anything that takes a webhook).
 *
 * Both fire when both are set, and the response says which succeeded.
 * That is on purpose: the point of this endpoint is that a pitch reply
 * from an institution is not lost, and two independent copies is the
 * cheapest insurance there is against one provider having a bad day.
 * A partial success is still a success — the message reached somebody.
 *
 * With neither configured the endpoint returns 503 and the address
 * that does work. A contact form that silently accepts a message it
 * cannot deliver is worse than no contact form: the sender believes
 * they have been in touch and nobody has their message. This one
 * refuses to claim a delivery it did not perform.
 *
 * Replies go to the sender, not to us: `reply_to` is set to their
 * address, so answering the forwarded mail from an ordinary inbox
 * reaches them directly. That is the whole mechanism — there is no
 * second system to log into to read responses.
 *
 * No database. There is no server-side state anywhere else on this
 * site, and an enquiries table would be the first — with a retention
 * question attached to it — for no gain over delivering the message.
 *
 * Configuration is documented in .env.example and README.md.
 */

import { clientKey, take } from "./_lib/rate-limit.js";
import { fetchWithTimeout } from "./_lib/html.js";

const LIMITS = { name: 120, email: 200, org: 160, subject: 160, message: 4000 };
const TOPICS = new Set(["support", "institutions", "security", "privacy", "other"]);
const ROUTE = {
  support: "support@noshashi.app",
  institutions: "institutions@noshashi.app",
  security: "security@noshashi.app",
  privacy: "privacy@noshashi.app",
  other: "support@noshashi.app",
};

/*
 * Deliberately permissive. The strict RFC 5322 pattern rejects real
 * addresses, and the only thing this check needs to catch is a field
 * that plainly is not an address — delivery is the real validator.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

function clean(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** CONTACT_TO may list several addresses; all of them get a copy. */
function recipients(topic) {
  const configured = String(process.env.CONTACT_TO || "")
    .split(",")
    .map((address) => address.trim())
    .filter((address) => EMAIL.test(address));
  return configured.length ? configured : [ROUTE[topic]];
}

async function deliverByEmail(enquiry) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;

  const to = recipients(enquiry.topic);
  const from = process.env.CONTACT_FROM || "NOSHASHI site <noreply@noshashi.app>";
  const lines = [
    `Topic:   ${enquiry.topic}`,
    `Name:    ${enquiry.name}`,
    `Email:   ${enquiry.email}`,
    enquiry.org ? `Org:     ${enquiry.org}` : null,
    `Sent:    ${enquiry.at}`,
    `Source:  ${enquiry.origin}`,
    "",
    enquiry.message,
  ].filter(Boolean);

  const response = await fetchWithTimeout("https://api.resend.com/emails", {
    timeout: 10_000,
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      // Answering the forwarded mail replies to the sender directly.
      reply_to: enquiry.email,
      subject: `[${enquiry.topic}] ${enquiry.subject}`,
      text: lines.join("\n"),
    }),
  });
  return response.ok ? "email" : null;
}

async function deliverByWebhook(enquiry) {
  const url = process.env.CONTACT_WEBHOOK_URL;
  if (!url) return null;
  const response = await fetchWithTimeout(url, {
    timeout: 10_000,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `text` carries a readable rendering for webhooks that show one
    // field (Slack); the structured fields sit alongside it.
    body: JSON.stringify({
      text: `NOSHASHI enquiry — ${enquiry.topic} — ${enquiry.subject}\nFrom ${enquiry.name} <${enquiry.email}>${enquiry.org ? ` (${enquiry.org})` : ""}\n\n${enquiry.message}`,
      ...enquiry,
    }),
  });
  return response.ok ? "webhook" : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");

  const limit = take(`contact:${clientKey(req)}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!limit.ok) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({ error: "Too many messages from this address. Try again shortly." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body && typeof body === "object" ? body : {};

  /*
   * Two spam gates, both silent successes.
   *
   * `company_website` is a honeypot: hidden from people, irresistible
   * to a form-filling bot. `elapsed` is how long the form was open —
   * a human cannot read the fields and type a message in under three
   * seconds. Both return 200 rather than an error, because telling a
   * bot which gate it tripped is how it learns to pass next time.
   */
  if (clean(body.company_website, 40)) return res.status(200).json({ ok: true, delivered: "accepted" });
  if (Number(body.elapsed) >= 0 && Number(body.elapsed) < 3000) {
    return res.status(200).json({ ok: true, delivered: "accepted" });
  }

  const enquiry = {
    topic: TOPICS.has(body.topic) ? body.topic : "other",
    name: clean(body.name, LIMITS.name),
    email: clean(body.email, LIMITS.email),
    org: clean(body.org, LIMITS.org),
    subject: clean(body.subject, LIMITS.subject) || "Website enquiry",
    // Newlines are meaning in a message body, so it gets its own
    // trim rather than the whitespace-collapsing one.
    message: String(body.message ?? "").trim().slice(0, LIMITS.message),
    at: new Date().toISOString(),
    origin: process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`,
  };

  const problems = [];
  if (!enquiry.name) problems.push("a name");
  if (!EMAIL.test(enquiry.email)) problems.push("a valid email address");
  if (enquiry.message.length < 12) problems.push("a message of at least a few words");
  if (problems.length) {
    return res.status(400).json({ error: `Please add ${problems.join(", ")}.` });
  }

  // Both channels are attempted; neither can prevent the other from
  // running, which is the point of settling rather than chaining.
  const attempts = await Promise.allSettled([deliverByEmail(enquiry), deliverByWebhook(enquiry)]);
  const delivered = attempts
    .filter((a) => a.status === "fulfilled" && a.value)
    .map((a) => a.value);

  for (const attempt of attempts) {
    if (attempt.status === "rejected") {
      console.error("[contact] a delivery channel failed", attempt.reason?.message || attempt.reason);
    }
  }

  if (delivered.length) {
    return res.status(200).json({
      ok: true,
      delivered: delivered.join("+"),
      route: recipients(enquiry.topic)[0],
      message: "Message sent. You will get a reply at the address you gave.",
    });
  }

  return res.status(503).json({
    error: "This form has no working delivery channel, so the message was not sent.",
    mailto: ROUTE[enquiry.topic],
    configure: "Set RESEND_API_KEY (and CONTACT_TO) or CONTACT_WEBHOOK_URL in the Vercel project. /api/contact-status reports what is configured.",
  });
}
