import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * noshashi-checkout — turn an authenticated session into a Stripe
 * Checkout Session.
 *
 * The caller may only name a price id; amounts, currency and mode all
 * come from Stripe itself. A client that could set its own price would
 * be a client that could set its own price to zero.
 */

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE_URL = Deno.env.get("NOSHASHI_SITE_URL") ?? "https://www.noshashi.app";

/** Only these prices may be purchased. Anything else is rejected. */
const ALLOWED_PRICES: Record<string, { tier: string; mode: "subscription" | "payment"; seatBased: boolean; verifications?: number }> = {
  price_1U6U1eGSxPXLjUKIGnORqp43: { tier: "desk", mode: "subscription", seatBased: true },
  // Annual prepay — ten times the monthly rate, so two months are free.
  // The pricing page quoted this long before it existed, and a visitor
  // who chose "Annual prepay" was billed monthly.
  price_1UHV60GSxPXLjUKIytehVDNd: { tier: "desk", mode: "subscription", seatBased: true },
  price_1U6U3lGSxPXLjUKIfMMEwMcG: { tier: "credits", mode: "payment", seatBased: false, verifications: 10000 },
  price_1U6U3yGSxPXLjUKIcnPSGUSr: { tier: "credits", mode: "payment", seatBased: false, verifications: 50000 },
  price_1U6U4EGSxPXLjUKIsEUlezwg: { tier: "credits", mode: "payment", seatBased: false, verifications: 250000 },
};

/**
 * Institutional prices exist in Stripe and are deliberately absent from
 * the allow-list above.
 *
 * They exist so an invoice can be raised against them once an MSA is
 * signed. They are not purchasable here, because the pricing page
 * states as policy that they are not: "Not available by card.
 * Institutional access requires an executed MSA, and a payment that
 * clears before anyone has signed one would create an entitlement with
 * no contract behind it." The tier carries a 99.9% uptime SLA with
 * service credits, a DPA, regulator read-only seats and white
 * labelling. A card that cleared here would create every one of those
 * obligations against nobody's signature.
 *
 * Named rather than merely omitted so the rejection can say why, and so
 * the next person to read this knows the omission was a decision.
 */
const CONTACT_SALES_PRICES: Record<string, true> = {
  price_1U6U1sGSxPXLjUKI7mCncAIu: true,
  price_1UHV6AGSxPXLjUKIyxTwSBpO: true,
};

/**
 * CORS that reflects whatever headers the caller asked for.
 *
 * A fixed allow-list looks safer and is a trap: supabase-js adds its own
 * headers over time, and any custom header on the client (ours sends
 * x-noshashi-client) fails the preflight with an error that surfaces
 * only as "failed to send a request to the Edge Function". Reflecting
 * the request grants nothing extra — authorisation is still enforced by
 * the JWT check below.
 */
function corsHeaders(request: Request): Record<string, string> {
  const requested = request.headers.get("Access-Control-Request-Headers");
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      requested ?? "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Access-Control-Request-Headers",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

async function stripe(path: string, form: Record<string, string>) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Stripe returned ${response.status}`);
  }
  return payload;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  if (!STRIPE_SECRET_KEY) {
    return json(
      request,
      { error: "Billing is not configured. Set STRIPE_SECRET_KEY in the project's Edge Function secrets." },
      503,
    );
  }

  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json(request, { error: "Not authenticated" }, 401);
    const user = userData.user;

    const body = await request.json().catch(() => ({}));
    const priceId = String(body.priceId ?? "");
    if (CONTACT_SALES_PRICES[priceId]) {
      return json(
        request,
        {
          error:
            "Institutional is not available by card. It requires an executed MSA — email institutions@noshashi.app and we will raise an invoice.",
          reason: "contact_sales",
        },
        400,
      );
    }

    const plan = ALLOWED_PRICES[priceId];
    if (!plan) return json(request, { error: "Unknown price" }, 400);

    // Seats are clamped server-side; a tampered client cannot buy 0 seats.
    const seats = plan.seatBased
      ? Math.max(1, Math.min(500, Math.floor(Number(body.seats ?? 1)) || 1))
      : 1;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Reuse the customer across purchases so billing history stays whole.
    const { data: existing } = await admin
      .schema("noshashi")
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("account_id", user.id)
      .not("stripe_customer_id", "is", null)
      .limit(1)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe("customers", {
        email: user.email ?? "",
        "metadata[account_id]": user.id,
      });
      customerId = customer.id;
    }

    const form: Record<string, string> = {
      mode: plan.mode,
      customer: customerId!,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": String(seats),
      success_url: `${SITE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/billing/cancelled`,
      "metadata[account_id]": user.id,
      "metadata[tier]": plan.tier,
      client_reference_id: user.id,
      // Off by default. A one-off internal test coupon left standing was
      // enough to take a $749 subscription to $0.50, because every
      // session this function opened invited a promotion code.
      allow_promotion_codes:
        Deno.env.get("STRIPE_ALLOW_PROMOTION_CODES") === "true" ? "true" : "false",
    };

    // Credit packs need the purchased quantity on the session so the
    // webhook can add exactly that many verifications.
    if (plan.verifications) {
      form["metadata[verifications]"] = String(plan.verifications);
    }

    if (plan.mode === "subscription") {
      form["subscription_data[metadata][account_id]"] = user.id;
      form["subscription_data[metadata][tier]"] = plan.tier;
      if (plan.seatBased) {
        form["line_items[0][adjustable_quantity][enabled]"] = "true";
        form["line_items[0][adjustable_quantity][minimum]"] = "1";
        form["line_items[0][adjustable_quantity][maximum]"] = "500";
      }
    }

    const session = await stripe("checkout/sessions", form);
    return json(request, { url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("checkout failed", error);
    return json(request, { error: error instanceof Error ? error.message : "Checkout failed" }, 500);
  }
});
