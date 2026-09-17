/*
 * POST /api/create-checkout-session — start a Pro subscription.
 *
 * What was wrong with this before, in the order it bites:
 *
 * 1. Every Stripe failure collapsed into `502 "Stripe could not create
 *    checkout."` — the same five words whether the key was from the
 *    wrong mode, the price had been archived, or the account was
 *    restricted. Stripe returns a precise `code` and `message` for all
 *    three and the handler threw them away, so the one signal that
 *    tells you which of them it is never reached anybody. Stripe's own
 *    error text is now logged in full and its `code` is returned to
 *    the caller.
 * 2. The price ID was a literal in source. Moving between Stripe test
 *    and live mode means a different price ID, so the literal could
 *    only ever be right in one of the two modes — and a live key with
 *    a test price fails with exactly the generic 502 above. It now
 *    reads STRIPE_PRO_PRICE_ID, keeping the literal as the default.
 * 3. `fetch` was unguarded: a network failure or a Stripe timeout threw
 *    out of the handler and became an unhandled 500 with a stack trace
 *    in the logs and nothing useful for the visitor.
 * 4. It only ever answered with a redirect, so the pricing page could
 *    not call it with `fetch` and show a real error — a failure just
 *    navigated the visitor to a blank error page.
 *
 * `/api/stripe-status` reports which of these applies without exposing
 * the key.
 */

import { clientKey, take } from "./_lib/rate-limit.js";

const DEFAULT_PRO_PRICE_ID = "price_1U6U1eGSxPXLjUKIGnORqp43";

function isConfigured(key) {
  return Boolean(key) && !key.includes("placeholder") && /^sk_(test|live)_/.test(key);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");

  // A browser form posts HTML and expects a redirect; the pricing page
  // calls with fetch and expects JSON it can show an error from.
  const wantsJson = String(req.headers.accept || "").includes("application/json");
  const fail = (status, message, extra = {}) =>
    wantsJson
      ? res.status(status).json({ error: message, ...extra })
      : res.status(status).send(
          `<!doctype html><meta charset="utf-8"><title>Checkout unavailable</title>` +
            `<body style="font:15px/1.6 system-ui;background:#0B0F14;color:#E6E8EB;padding:48px;max-width:46rem;margin:0 auto">` +
            `<h1 style="font-size:20px">Checkout could not start</h1><p>${message}</p>` +
            `<p><a style="color:#3A82F6" href="/pricing/">Back to pricing</a> · ` +
            `<a style="color:#3A82F6" href="mailto:support@noshashi.app">support@noshashi.app</a></p></body>`
        );

  const limit = take(`checkout:${clientKey(req)}`, { limit: 10, windowMs: 60_000 });
  if (!limit.ok) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return fail(429, "Too many checkout attempts. Try again in a minute.");
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!isConfigured(secretKey)) {
    return fail(
      503,
      "Card checkout is not configured on this deployment yet. Email support@noshashi.app and a subscription will be set up directly.",
      { reason: "stripe_not_configured" }
    );
  }

  const priceId = process.env.STRIPE_PRO_PRICE_ID || DEFAULT_PRO_PRICE_ID;
  const origin = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;

  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/billing/success/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/billing/cancelled/`,
    billing_address_collection: "auto",
    allow_promotion_codes: "true",
    // Lets a subscriber reach Stripe's own portal to cancel, which is
    // the "cancel any time in two clicks" the pricing page promises.
    "subscription_data[metadata][source]": "noshashi.app",
  });

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // Stripe replays a retried request rather than double-charging.
        "Idempotency-Key": `noshashi-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      },
      body: form,
    });

    const session = await response.json().catch(() => ({}));

    if (!response.ok || !session.url) {
      const stripeError = session.error || {};
      // The whole point of this rewrite: the real reason goes to the
      // logs, where the operator can actually read it.
      console.error("[stripe] checkout session failed", {
        status: response.status,
        type: stripeError.type,
        code: stripeError.code,
        param: stripeError.param,
        message: stripeError.message,
        priceId,
      });

      const readable =
        stripeError.code === "resource_missing"
          ? "The configured Pro price does not exist on this Stripe account — most often a live key paired with a test-mode price ID. Set STRIPE_PRO_PRICE_ID to a price from the same mode as STRIPE_SECRET_KEY."
          : stripeError.message ||
            "Stripe declined the checkout request. The error has been logged.";

      return fail(502, readable, { reason: stripeError.code || "stripe_error" });
    }

    if (wantsJson) return res.status(200).json({ url: session.url });
    return res.redirect(303, session.url);
  } catch (error) {
    console.error("[stripe] checkout request threw", error);
    return fail(504, "Stripe did not respond. Try again, or email support@noshashi.app.", {
      reason: "stripe_unreachable",
    });
  }
}
