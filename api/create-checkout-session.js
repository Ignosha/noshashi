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
 * 5. Quantity was the literal "1". The page sells Pro "per seat / month"
 *    and a seat is a person, so a four-person desk that bought here paid
 *    for one seat and the other three were free. Seats now come from the
 *    request, clamped server-side, and the Stripe page lets the buyer
 *    adjust them.
 * 6. The annual/monthly switch on the pricing page changed the rendered
 *    figures and nothing else: a visitor who chose "Annual prepay" and
 *    paid was put on the $749 *monthly* price. The cadence is now part
 *    of the request and selects a real annual price.
 * 7. The session carried no metadata, so `noshashi-stripe-webhook` —
 *    which keys entitlements off `metadata.account_id` — dropped the
 *    event and provisioned nothing. Somebody could pay $749 here and
 *    receive no entitlement at all. The tier and cadence now ride on the
 *    subscription, and the webhook resolves the account from the
 *    customer's email when no account id is present.
 * 8. `allow_promotion_codes` was unconditionally true, which is what let
 *    a one-off internal test coupon take a $749 subscription to $0.50.
 *    It is now off unless STRIPE_ALLOW_PROMOTION_CODES is set.
 *
 * `/api/stripe-status` reports which of these applies without exposing
 * the key.
 */

import { clientKey, take } from "./_lib/rate-limit.js";

/**
 * Pro, by billing period. Both are overridable by environment because a
 * test-mode key needs test-mode prices, and a price id is the one piece
 * of this that differs between the two modes.
 */
const DEFAULT_PRICE_IDS = {
  monthly: "price_1U6U1eGSxPXLjUKIGnORqp43",
  annual: "price_1UHV60GSxPXLjUKIytehVDNd",
};

/** A seat is a person. Nobody buys none, and 500 is well past a desk. */
const MIN_SEATS = 1;
const MAX_SEATS = 500;

function isConfigured(key) {
  return Boolean(key) && !key.includes("placeholder") && /^sk_(test|live)_/.test(key);
}

/**
 * The body arrives as JSON from the pricing page's `fetch`, or as form
 * fields from the no-script `<form>` fallback. Vercel parses both into
 * `req.body`, but a body-less POST leaves it undefined.
 */
function readBody(req) {
  const body = req.body;
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return Object.fromEntries(new URLSearchParams(body));
    }
  }
  return body;
}

/**
 * Clamped server-side on purpose. The seat count decides the invoice, so
 * it is not something a posted form gets to be trusted about: a hand
 * -edited `seats=0` would otherwise be a free subscription, and a
 * `seats=1e9` an invoice nobody can pay.
 */
function readSeats(body) {
  const seats = Math.floor(Number(body.seats));
  if (!Number.isFinite(seats)) return MIN_SEATS;
  return Math.max(MIN_SEATS, Math.min(MAX_SEATS, seats));
}

function readCadence(body) {
  return String(body.cadence ?? "monthly") === "annual" ? "annual" : "monthly";
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

  const body = readBody(req);
  const cadence = readCadence(body);
  const seats = readSeats(body);

  const priceId =
    cadence === "annual"
      ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID || DEFAULT_PRICE_IDS.annual
      : process.env.STRIPE_PRO_PRICE_ID || DEFAULT_PRICE_IDS.monthly;

  const origin = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;

  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": String(seats),
    // The buyer can still correct the seat count on Stripe's own page,
    // which is where they are when they realise they miscounted.
    "line_items[0][adjustable_quantity][enabled]": "true",
    "line_items[0][adjustable_quantity][minimum]": String(MIN_SEATS),
    "line_items[0][adjustable_quantity][maximum]": String(MAX_SEATS),
    success_url: `${origin}/billing/success/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/billing/cancelled/`,
    billing_address_collection: "auto",
    // Off by default. A discount should be a decision, not the standing
    // state of every checkout this site opens.
    allow_promotion_codes: process.env.STRIPE_ALLOW_PROMOTION_CODES === "true" ? "true" : "false",
    // The webhook reads the tier off the subscription to decide which
    // entitlements to write. Without it the payment lands and the buyer
    // is provisioned nothing.
    "subscription_data[metadata][tier]": "desk",
    "subscription_data[metadata][cadence]": cadence,
    "subscription_data[metadata][source]": "noshashi.app",
    "metadata[tier]": "desk",
    "metadata[cadence]": cadence,
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
        cadence,
        seats,
      });

      const readable =
        stripeError.code === "resource_missing"
          ? "The configured Pro price does not exist on this Stripe account — most often a live key paired with a test-mode price ID. Set STRIPE_PRO_PRICE_ID (and STRIPE_PRO_ANNUAL_PRICE_ID) to prices from the same mode as STRIPE_SECRET_KEY."
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
