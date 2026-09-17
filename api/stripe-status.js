/*
 * GET /api/stripe-status — is checkout actually wired up?
 *
 * Written because the answer was previously unknowable from outside:
 * a misconfigured checkout and a working one both returned a redirect
 * or a generic 502, and the only way to tell them apart was to put a
 * card in. This asks Stripe whether the configured price exists and
 * reports what it finds.
 *
 * It never returns the key or any part of it — only the mode prefix
 * (`sk_test` / `sk_live`), which is the fact that matters when a live
 * key has been paired with a test price. Every field here is derived
 * from configuration the operator already knows.
 */

const DEFAULT_PRO_PRICE_ID = "price_1U6U1eGSxPXLjUKIGnORqp43";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");

  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  const priceId = process.env.STRIPE_PRO_PRICE_ID || DEFAULT_PRO_PRICE_ID;
  const configured = Boolean(secretKey) && !secretKey.includes("placeholder") && /^sk_(test|live)_/.test(secretKey);
  const keyMode = /^sk_live_/.test(secretKey) ? "live" : /^sk_test_/.test(secretKey) ? "test" : null;

  const report = {
    checkoutReady: false,
    keyPresent: Boolean(secretKey),
    keyLooksValid: configured,
    keyMode,
    priceId,
    priceIdSource: process.env.STRIPE_PRO_PRICE_ID ? "STRIPE_PRO_PRICE_ID" : "built-in default",
    siteUrl: process.env.PUBLIC_SITE_URL || null,
    price: null,
    problem: null,
  };

  if (!configured) {
    report.problem = secretKey
      ? "STRIPE_SECRET_KEY is set but is a placeholder or not in sk_test_/sk_live_ form."
      : "STRIPE_SECRET_KEY is not set on this deployment.";
    return res.status(200).json(report);
  }

  try {
    const response = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      report.problem =
        payload?.error?.code === "resource_missing"
          ? `Price ${priceId} does not exist on this ${keyMode} account. A price ID is mode-specific: a test price is invisible to a live key and vice versa.`
          : payload?.error?.message || `Stripe responded ${response.status}.`;
      return res.status(200).json(report);
    }

    report.price = {
      active: Boolean(payload.active),
      currency: payload.currency,
      unitAmount: payload.unit_amount,
      recurring: payload.recurring ? `${payload.recurring.interval_count || 1}/${payload.recurring.interval}` : null,
      livemode: Boolean(payload.livemode),
    };

    if (!payload.active) report.problem = "The price exists but is archived in Stripe.";
    else if (!payload.recurring) report.problem = "The price is one-off, but checkout is created in subscription mode.";
    else report.checkoutReady = true;

    return res.status(200).json(report);
  } catch (error) {
    report.problem = "Could not reach Stripe from this deployment.";
    return res.status(200).json(report);
  }
}
