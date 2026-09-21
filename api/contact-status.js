/*
 * GET /api/contact-status — will a message from the form reach anybody?
 *
 * The counterpart to /api/stripe-status, and it exists for the same
 * reason: a contact form's failure mode is silent. Nothing about a
 * working form looks different from a broken one until an enquiry that
 * mattered never arrives, and by then the sender is gone.
 *
 * This reports which channels are configured, and where mail would be
 * sent, without sending a test message and without revealing a key.
 */

const ROUTE = {
  support: "support@noshashi.app",
  institutions: "institutions@noshashi.app",
  security: "security@noshashi.app",
  privacy: "privacy@noshashi.app",
  other: "support@noshashi.app",
};

const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

/** Show enough of an address to recognise it, not enough to harvest it. */
function mask(address) {
  const [local, domain] = String(address).split("@");
  if (!domain) return "(invalid)";
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");

  const resendKey = process.env.RESEND_API_KEY || "";
  const webhook = process.env.CONTACT_WEBHOOK_URL || "";

  const configured = String(process.env.CONTACT_TO || "")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => EMAIL.test(a));

  const emailReady = Boolean(resendKey) && /^re_/.test(resendKey);

  const report = {
    deliveryReady: emailReady || Boolean(webhook),
    channels: {
      email: {
        configured: Boolean(resendKey),
        keyLooksValid: emailReady,
        // Where a message actually lands. Masked, because this endpoint
        // is public and a plain address here is a scraped address.
        forwardsTo: configured.length ? configured.map(mask) : null,
        fallbackPerTopic: configured.length ? null : Object.fromEntries(
          Object.entries(ROUTE).map(([topic, address]) => [topic, mask(address)])
        ),
        sender: process.env.CONTACT_FROM ? "CONTACT_FROM is set" : "default (noreply@noshashi.app)",
      },
      webhook: { configured: Boolean(webhook) },
      updateList: {
        configured: Boolean(process.env.RESEND_AUDIENCE_ID),
        note: process.env.RESEND_AUDIENCE_ID
          ? "Subscribers are stored in a Resend Audience."
          : "Set RESEND_AUDIENCE_ID to accept subscribers; /api/subscribe returns 503 until then.",
      },
    },
    problem: null,
    configure: null,
  };

  if (!report.deliveryReady) {
    report.problem = "No delivery channel is configured. The form returns 503 and shows the direct email address instead of accepting a message it cannot deliver.";
    report.configure =
      "Set RESEND_API_KEY and CONTACT_TO (a comma-separated list is allowed) to forward enquiries by email, " +
      "and/or CONTACT_WEBHOOK_URL to post them to Slack, Zapier or a sheet. Both fire when both are set.";
  } else if (resendKey && !emailReady) {
    report.problem = "RESEND_API_KEY is set but does not look like a Resend key (they begin re_).";
  } else if (emailReady && !configured.length) {
    report.problem = "Email is configured but CONTACT_TO is not set, so enquiries route to the per-topic noshashi.app addresses rather than to a personal inbox.";
    report.configure = "Set CONTACT_TO to the address that should receive enquiries.";
  }

  return res.status(200).json(report);
}
