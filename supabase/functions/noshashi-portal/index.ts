import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { privilegedIdentity, privilegedFetch, PrivilegedRequestError } from "../_shared/privilegedRequest.ts";

/**
 * noshashi-portal — hand the customer to Stripe's own billing portal.
 *
 * Card changes, cancellations and invoice history all happen on Stripe's
 * domain. Nothing about a payment method ever transits this application,
 * which is the entire point of using the portal instead of building one.
 */

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE_URL = Deno.env.get("NOSHASHI_SITE_URL") ?? "https://www.noshashi.app";

/** Reflects requested headers — see the note in noshashi-checkout. */
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
    headers: { ...corsHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if (!STRIPE_SECRET_KEY) {
    return json(request, { error: "Billing is not configured." }, 503);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: request.headers.get("Authorization") ?? "" }, fetch: privilegedFetch }, auth: { persistSession: false, autoRefreshToken: false } },
    );

    const actor = await privilegedIdentity(supabase.auth, request);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { fetch: privilegedFetch }, auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: subscription, error: storageError } = await admin
      .schema("noshashi")
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("account_id", actor)
      .not("stripe_customer_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (storageError) return json(request, { error: "Billing records are unavailable. Retry later." }, 503);
    if (!subscription?.stripe_customer_id) {
      return json(request, { error: "No billing record yet. Start a subscription first." }, 404);
    }

    const response = await privilegedFetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: subscription.stripe_customer_id,
        return_url: `${SITE_URL}/billing`,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? `Stripe returned ${response.status}`);
    }

    return json(request, { url: payload.url });
  } catch (error) {
    if (error instanceof PrivilegedRequestError) return json(request, { error: error.message, code: error.code }, error.status);
    console.error(JSON.stringify({ event: "billing_portal_failed" }));
    return json(request, { error: "Billing portal is unavailable. No subscription change was made here." }, 500);
  }
});
