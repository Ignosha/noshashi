import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * noshashi-stripe-webhook — Stripe is the source of truth for billing;
 * this mirrors it into entitlements.
 *
 * JWT verification is off because Stripe cannot present one. Authenticity
 * is established instead by verifying the `Stripe-Signature` HMAC against
 * the endpoint's signing secret, in constant time, with a timestamp window
 * that makes a captured request useless five minutes later.
 */

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const TOLERANCE_SECONDS = 300;

/**
 * Which features each tier turns on. Read by the console's gating.
 *
 * `desk` carries `compliance_api` because the tier is sold "5,000 API
 * verifications included" at a published 50 req/sec, and this function
 * writes `verification_quota: 5000` for it below. Withholding the flag
 * meant every one of those 5,000 calls answered 403 — the quota and the
 * key have to be granted by the same tier, or one of them is a line on
 * a pricing page that nothing honours.
 */
const TIER_FEATURES: Record<string, string[]> = {
  operator: ["console", "gate", "agent", "export"],
  desk: [
    "console", "gate", "agent", "export",
    "portfolios", "alerts", "receipt_anchoring", "priority_support",
    "compliance_api",
  ],
  institution: [
    "console", "gate", "agent", "export",
    "portfolios", "alerts", "receipt_anchoring", "priority_support",
    "compliance_api", "webhooks", "regulator_seats", "white_label", "sla",
  ],
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Stripe moved `current_period_end` off the subscription and onto the
 * subscription item in API version 2026-06-24.dahlia. Reading only the
 * old location silently yields null on current accounts — and a null
 * valid_until is an entitlement that never lapses, so a cancelled plan
 * would keep its paid features indefinitely. Prefer the item, fall back
 * to the legacy field for older API versions, and last of all accept
 * cancel_at, which is set when a cancellation is already scheduled.
 */
function resolvePeriodEnd(subscription: Record<string, unknown>): string | null {
  const items = (subscription.items as { data?: Record<string, unknown>[] } | undefined)?.data;
  const candidates = [
    ...(items ?? []).map((item) => item?.current_period_end),
    subscription.current_period_end,
    subscription.cancel_at,
  ];

  for (const candidate of candidates) {
    const seconds = Number(candidate);
    if (Number.isFinite(seconds) && seconds > 0) {
      return new Date(seconds * 1000).toISOString();
    }
  }
  return null;
}

async function verifySignature(payload: string, header: string): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(",").map((piece) => {
      const [key, ...rest] = piece.trim().split("=");
      return [key, rest.join("=")];
    }),
  );

  const timestamp = Number(parts.t);
  const signature = String(parts.v1 ?? "");
  if (!timestamp || !signature) return false;

  // Reject replays of an old, legitimately-signed request.
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expected, signature);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!WEBHOOK_SECRET) return new Response("Webhook secret not configured", { status: 503 });

  const signature = request.headers.get("Stripe-Signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const raw = await request.text();
  if (!(await verifySignature(raw, signature))) {
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(raw);
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const db = admin.schema("noshashi");

  /**
   * Find, or create, the account a payment belongs to.
   *
   * The marketing site's own checkout cannot know an account id: the
   * visitor is not signed in, there is no Supabase session on a static
   * page, and requiring one before a card would lose the sale. It used
   * to send no metadata at all, so every branch below fell through to
   * `if (!accountId) break;` and a completed $749 payment provisioned
   * absolutely nothing. Email is the only identifier such a purchase
   * carries, so it is the one used, and a buyer with no account yet is
   * invited into one rather than left holding a receipt for a product
   * they cannot open.
   */
  const resolveAccountByEmail = async (email: string | null | undefined): Promise<string | null> => {
    const address = String(email ?? "").trim().toLowerCase();
    if (!address) return null;

    // GoTrue has no server-side email filter on listUsers, so page.
    // A few hundred accounts is a couple of round trips; this runs once
    // per purchase, not per request.
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        console.error("listUsers failed while resolving a purchase", error);
        return null;
      }
      const match = data.users.find((user) => (user.email ?? "").toLowerCase() === address);
      if (match) return match.id;
      if (data.users.length < 200) break;
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(address);
    if (inviteError || !invited?.user) {
      // The payment is real and we could not attach it to anybody. This
      // has to be loud: it is the one failure here that costs a customer
      // money and gives them nothing.
      console.error("PAID BUT UNPROVISIONED — no account for", address, inviteError);
      return null;
    }
    return invited.user.id;
  };

  /**
   * Write the account id back onto the Stripe subscription, so the
   * renewal, upgrade and cancellation events that follow resolve the
   * normal way instead of repeating the lookup above.
   */
  const stampSubscription = async (subscriptionId: string, accountId: string, tier: string) => {
    if (!STRIPE_SECRET_KEY || !subscriptionId) return;
    try {
      await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          "metadata[account_id]": accountId,
          "metadata[tier]": tier,
        }),
      });
    } catch (error) {
      console.error("could not stamp account_id onto subscription", subscriptionId, error);
    }
  };

  const applyEntitlement = async (
    accountId: string,
    tier: string,
    seats: number,
    validUntil: string | null,
  ) => {
    await db.from("entitlements").upsert(
      {
        account_id: accountId,
        tier,
        seats,
        features: TIER_FEATURES[tier] ?? TIER_FEATURES.operator,
        verification_quota: tier === "institution" ? 100000 : tier === "desk" ? 5000 : 0,
        valid_until: validUntil,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    );
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        let accountId = session.metadata?.account_id ?? session.client_reference_id;

        // A purchase made from the marketing site carries an email and
        // no account id. Resolve it before anything else, so both the
        // credit-pack and subscription branches below have one.
        if (!accountId) {
          accountId = await resolveAccountByEmail(session.customer_details?.email);
        }
        if (!accountId) break;

        if (session.mode === "payment") {
          // Prepaid verification credits: add to the existing quota.
          const { data: current } = await db
            .from("entitlements")
            .select("verification_quota")
            .eq("account_id", accountId)
            .maybeSingle();
          const purchased = Number(session.metadata?.verifications ?? 0);
          await db
            .from("entitlements")
            .update({
              verification_quota: Number(current?.verification_quota ?? 0) + purchased,
              updated_at: new Date().toISOString(),
            })
            .eq("account_id", accountId);
        }

        if (session.mode === "subscription" && session.subscription) {
          // Stamping the id means the subscription lifecycle events that
          // follow take the ordinary metadata path.
          const tier = String(session.metadata?.tier ?? "desk");
          await stampSubscription(String(session.subscription), accountId, tier);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const accountId = subscription.metadata?.account_id;
        if (!accountId) break;

        const item = subscription.items?.data?.[0];
        const tier = subscription.metadata?.tier ?? "operator";
        const seats = Number(item?.quantity ?? 1);
        const status = String(subscription.status);
        const periodEnd = resolvePeriodEnd(subscription);

        await db.from("subscriptions").upsert(
          {
            account_id: accountId,
            stripe_customer_id: subscription.customer,
            stripe_subscription_id: subscription.id,
            price_id: item?.price?.id ?? null,
            tier,
            status,
            seats,
            current_period_end: periodEnd,
            cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "stripe_subscription_id" },
        );

        // Only a paying, current subscription grants the paid tier.
        const entitled = status === "active" || status === "trialing";
        await applyEntitlement(
          accountId,
          entitled ? tier : "operator",
          entitled ? seats : 1,
          entitled ? periodEnd : null,
        );
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const accountId = invoice.subscription_details?.metadata?.account_id
          ?? invoice.parent?.subscription_details?.metadata?.account_id;
        if (accountId) {
          await db
            .from("subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("account_id", accountId);
        }
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error("webhook handling failed", event.type, error);
    // 500 asks Stripe to retry rather than silently dropping the event.
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
