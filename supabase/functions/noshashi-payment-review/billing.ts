import Stripe from "npm:stripe@23";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ReviewError } from "../_shared/paymentReview.ts";

// Existing Pro prices; no new products, amounts or institutional card sales.
const PRICES = {
  monthly: "price_1U6U1eGSxPXLjUKIGnORqp43",
  annual: "price_1UHV60GSxPXLjUKIytehVDNd",
};
export async function billingAction(
  admin: SupabaseClient,
  action: "checkout" | "portal",
  accountId: string,
  cadence: string,
) {
  const secret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!/^(sk|rk)_(test|live)_/.test(secret))
    throw new ReviewError(
      503,
      "Stripe billing is not configured. No charge was made.",
    );
  const site = new URL(
    Deno.env.get("NOSHASHI_SITE_URL") ?? "https://www.noshashi.app",
  );
  if (
    site.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(site.hostname)
  )
    throw new ReviewError(503, "Billing return address is not configured.");
  const stripe = new Stripe(secret, {
    apiVersion: "2026-10-28.endive",
    timeout: 10000,
    maxNetworkRetries: 1,
  });
  const db = admin.schema("noshashi");
  const { data: subscriptions, error } = await db
    .from("subscriptions")
    .select("stripe_customer_id,status,current_period_end")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw new ReviewError(503, "Billing records are unavailable.");
  const existing = subscriptions?.find((s) => s.stripe_customer_id);
  const active = subscriptions?.some((s) =>
    ["active", "trialing", "past_due", "incomplete", "unpaid"].includes(
      s.status,
    ),
  );
  if (action === "portal" || active) {
    if (!existing)
      throw new ReviewError(
        409,
        "There is no existing subscription to manage.",
      );
    return {
      url: (
        await stripe.billingPortal.sessions.create({
          customer: existing.stripe_customer_id,
          return_url: `${site.origin}/developers/portal/`,
        })
      ).url,
    };
  }
  if (cadence !== "monthly" && cadence !== "annual")
    throw new ReviewError(400, "Choose monthly or annual billing.");
  const priceId =
    (cadence === "annual"
      ? Deno.env.get("STRIPE_PRO_ANNUAL_PRICE_ID")
      : Deno.env.get("STRIPE_PRO_PRICE_ID")) || PRICES[cadence];
  const price = await stripe.prices.retrieve(priceId);
  const amount = cadence === "annual" ? 749000 : 74900;
  const interval = cadence === "annual" ? "year" : "month";
  if (
    !price.active ||
    price.currency !== "usd" ||
    price.unit_amount !== amount ||
    price.recurring?.interval !== interval ||
    price.recurring.interval_count !== 1 ||
    price.livemode !== secret.includes("_live_")
  )
    throw new ReviewError(
      503,
      "Configured Pro price does not match the published plan. No charge was made.",
    );
  const { data: known, error: knownError } = await db
    .from("payment_review_customers")
    .select("stripe_customer_id")
    .eq("account_id", accountId)
    .maybeSingle();
  if (knownError)
    throw new ReviewError(503, "Billing records are unavailable.");
  const customerId =
    existing?.stripe_customer_id ||
    known?.stripe_customer_id ||
    (
      await stripe.customers.create(
        { metadata: { account_id: accountId } },
        { idempotencyKey: `review-customer-${accountId}` },
      )
    ).id;
  const { error: customerError } = await db
    .from("payment_review_customers")
    .upsert({ account_id: accountId, stripe_customer_id: customerId });
  if (customerError)
    throw new ReviewError(
      503,
      "Could not save the billing account. No checkout was opened.",
    );
  const { data: claim, error: claimError } = await db.rpc(
    "payment_review_checkout_claim",
    { p_account: accountId, p_price: priceId },
  );
  if (claimError || !claim?.id)
    throw new ReviewError(503, "Could not reserve checkout.");
  if (claim.price_id !== priceId)
    throw new ReviewError(
      409,
      "A checkout for a different billing period is already reserved. Finish that checkout or contact support before changing it.",
    );
  if (claim.url) return { url: claim.url };
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: accountId,
      metadata: {
        account_id: accountId,
        tier: "desk",
        portal: "payment-review",
      },
      subscription_data: { metadata: { account_id: accountId, tier: "desk" } },
      success_url: `${site.origin}/developers/portal/?billing=return`,
      cancel_url: `${site.origin}/developers/portal/?billing=cancelled`,
      integration_identifier: "noshashi_review_qnzlhrtp",
      allow_promotion_codes: false,
    },
    { idempotencyKey: `review-checkout-${claim.id}` },
  );
  if (!session.url)
    throw new ReviewError(503, "Stripe did not return a checkout address.");
  const { error: saveError } = await db
    .from("payment_review_checkouts")
    .update({
      url: session.url,
      expires_at: new Date(session.expires_at * 1000 + 60000).toISOString(),
    })
    .eq("account_id", accountId)
    .eq("id", claim.id);
  if (saveError)
    throw new ReviewError(
      503,
      "Checkout state is uncertain. Retry the same billing period to reconcile it.",
    );
  return { url: session.url };
}
