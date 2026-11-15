import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { TIERS, type Tier, schedule } from "../_shared/evidenceReport.ts";
import { privilegedFetch } from "../_shared/privilegedRequest.ts";
import { boundedText, PayloadError } from "../_shared/httpLimits.ts";
import { stripeSignature } from "../_shared/stripeWebhookSafety.ts";
import { applyCreditCheckout, reconcileSubscription } from "../_shared/stripeBilling.ts";
import { reviewBillingRisk } from "../_shared/paymentReviewBillingEvents.ts";

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

/**
 * Which features each tier turns on. Read by the console's gating.
 *
 * THIS TABLE MUST MATCH `grants` IN src/lib/billing/catalog.ts. It is
 * the same fact written twice, because the console cannot import from
 * an Edge Function and the Edge Function cannot import from src. What
 * is written here is what a paying account actually receives; what is
 * written there is what the pricing page promises and what the UI
 * unlocks. When they disagree, the customer is billed for one and
 * given the other.
 *
 * This is not hypothetical. `desk` is sold "5,000 API verifications
 * included" at a published 50 req/sec, and this function writes
 * `verification_quota: 5000` for it below — but `compliance_api` was
 * missing from this list, so every one of those 5,000 calls answered
 * 403. The quota and the key have to be granted by the same tier, or
 * one of them is a line on a pricing page that nothing honours.
 *
 * src/lib/billing/__tests__/entitlement-parity.test.ts reads both files
 * and fails when they drift. Change one, change the other, and redeploy
 * this function — a catalog edit alone changes what is advertised and
 * nothing about what is granted.
 */
const TIER_FEATURES: Record<string, string[]> = {
  operator: ["console", "gate", "agent", "export"],
  desk: [
    "console", "gate", "agent", "export",
    "portfolios", "alerts", "receipt_anchoring", "priority_support",
    "authority_certificate", "compliance_api", "incident_response",
    "asset_recovery",
  ],
  institution: [
    "console", "gate", "agent", "export",
    "portfolios", "alerts", "receipt_anchoring", "priority_support",
    "authority_certificate", "compliance_api",
    "webhooks", "regulator_seats", "white_label", "sla",
    "sso", "audit_log", "bulk_monitoring", "custom_alert_logic",
    "incident_response", "asset_recovery", "proof_of_reserves", "threat_registry", "issuance_surveillance",
  ],
  // Contact-sales tiers. Sales creates the subscription with
  // metadata[tier] set, and this table is what that customer receives.
  // Without these two entries a $10,000/month Enterprise contract fell
  // through to TIER_FEATURES.operator — the free tier.
  enterprise: [
    "console", "gate", "agent", "export",
    "portfolios", "alerts", "receipt_anchoring", "priority_support",
    "authority_certificate", "compliance_api",
    "webhooks", "regulator_seats", "white_label", "sla",
    "sso", "audit_log", "bulk_monitoring", "custom_alert_logic",
    "asset_passports", "dedicated_environment", "deposit_screening",
    "embedded_delivery", "incident_response", "forensic_trace",
    "asset_recovery", "proof_of_reserves", "threat_registry", "issuance_surveillance", "customer_protection",
    "withdrawal_screening", "market_surveillance",
  ],
  strategic: [
    "console", "gate", "agent", "export",
    "portfolios", "alerts", "receipt_anchoring", "priority_support",
    "authority_certificate", "compliance_api",
    "webhooks", "regulator_seats", "white_label", "sla",
    "sso", "audit_log", "bulk_monitoring", "custom_alert_logic",
    "asset_passports", "dedicated_environment", "deposit_screening",
    "embedded_delivery", "event_feeds", "custom_schemas",
    "incident_response", "forensic_trace", "security_guardian",
    "asset_recovery", "proof_of_reserves", "threat_registry", "issuance_surveillance", "customer_protection",
    "withdrawal_screening", "market_surveillance", "protection_monitoring", "phishing_feed",
  ],
};

/** Included API verifications per period. Contract tiers start at Institutional's. */
const TIER_QUOTA: Record<string, number> = {
  operator: 0,
  desk: 5_000,
  institution: 100_000,
  enterprise: 100_000,
  strategic: 100_000,
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


Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!WEBHOOK_SECRET) return new Response("Webhook secret not configured", { status: 503 });

  const signature = request.headers.get("Stripe-Signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let raw: string;
  try { raw = await boundedText(request, 1024 * 1024); }
  catch(error) { return new Response("Invalid webhook body",{status:error instanceof PayloadError?error.status:400}); }
  if (!(await stripeSignature(raw, signature, WEBHOOK_SECRET))) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event;
  try { event=JSON.parse(raw);if(!event || typeof event.id!=="string" || typeof event.type!=="string" || !event.data?.object)throw new Error(); }
  catch { return new Response("Invalid webhook event",{status:400}); }
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw))),v=>v.toString(16).padStart(2,"0")).join("");
  const catalog=Object.fromEntries(Object.entries(TIER_FEATURES).map(([tier,features])=>[tier,{features,verification_quota:TIER_QUOTA[tier]??0}]));
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {global:{fetch:privilegedFetch},auth:{persistSession:false,autoRefreshToken:false}},
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
        throw new Error("Billing account lookup unavailable.");
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
      throw new Error("Paid account provisioning unavailable.");
    }
    return invited.user.id;
  };

  /**
   * Write the account id back onto the Stripe subscription, so the
   * renewal, upgrade and cancellation events that follow resolve the
   * normal way instead of repeating the lookup above.
   */
  const stampSubscription = async (subscriptionId: string, accountId: string, tier: string) => {
    if (!STRIPE_SECRET_KEY || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId))throw new Error("Subscription reconciliation unavailable.");
    const response=await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,{
      method:"POST",headers:{Authorization:`Bearer ${STRIPE_SECRET_KEY}`,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({"metadata[account_id]":accountId,"metadata[tier]":tier}),signal:AbortSignal.timeout(10000),
    });
    if(!response.ok)throw new Error("Subscription metadata reconciliation failed.");
  };


  /**
   * A paid Ledger Evidence Report: the order, the deliveries its tier buys,
   * and a kick so the first report goes out now rather than on the hour.
   * Idempotent on the session id, since Stripe retries webhooks.
   */
  // deno-lint-ignore no-explicit-any
  const recordEvidenceOrder = async (session: any) => {
    const meta = session.metadata ?? {};
    const tier = String(meta.tier ?? "standard") as Tier;
    const email = String(session.customer_details?.email ?? "").trim();
    if (!(tier in TIERS) || session.payment_status !== "paid" || !email) {
      console.error(JSON.stringify({event:"evidence_order_invalid"}));
      return;
    }
    if (Number(session.amount_total) < TIERS[tier].cents) {
      console.error(JSON.stringify({event:"evidence_order_underpaid"}));
      return;
    }
    const split = (v: unknown) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const periodEnd = /^\d{4}-\d{2}-\d{2}$/.test(String(meta.period_end ?? "")) ? String(meta.period_end) : null;
    const created = new Date(Number(session.created) * 1000 || Date.now());
    const reference = `NER-${created.toISOString().slice(0, 10).replaceAll("-", "")}-${String(session.id).slice(-6).toUpperCase()}`;
    const { data: order, error } = await db
      .from("evidence_report_orders")
      .upsert(
        {
          reference,
          stripe_session_id: session.id,
          tier,
          email,
          organization: String(meta.organization ?? "").trim() || null,
          issuers: split(meta.issuers),
          wallets: split(meta.wallets),
          books: split(meta.books),
          period_end: periodEnd,
          amount_cents: Number(session.amount_total),
          currency: String(session.currency ?? "usd"),
        },
        { onConflict: "stripe_session_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (error) throw error;
    // A retried event finds the order already there; its schedule is
    // written again below and the duplicates are ignored, so a retry
    // after a half-finished first attempt still completes it.
    const orderId =
      order?.id ??
      (await db.from("evidence_report_orders").select("id").eq("stripe_session_id", session.id).maybeSingle()).data?.id;
    if (!orderId) throw new Error(`evidence report order for ${session.id} was not written`);
    const rows = schedule(tier, created, periodEnd).map((d, i) => ({ order_id: orderId, seq: i + 1, period_end: d.period_end, due_on: d.due_on }));
    const { error: scheduleError } = await db
      .from("evidence_report_deliveries")
      .upsert(rows, { onConflict: "order_id,seq", ignoreDuplicates: true });
    if (scheduleError) throw scheduleError;
    const {error:kickError}=await db.rpc("evidence_reports_kick");
    if(kickError)throw new Error("Evidence scheduling unavailable.");
  };

  try {
    if (await reviewBillingRisk(db, event, async (chargeId) => {
      if (!/^ch_[A-Za-z0-9]+$/.test(chargeId) || !STRIPE_SECRET_KEY) throw new Error('Cannot reconcile billing risk event.');
      const response=await fetch(`https://api.stripe.com/v1/charges/${encodeURIComponent(chargeId)}`, {
        headers:{Authorization:`Bearer ${STRIPE_SECRET_KEY}`},signal:AbortSignal.timeout(10000),
      });
      if(!response.ok)throw new Error('Could not reconcile Stripe charge.');
      return await response.json();
    })) return new Response('ok',{status:200});
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        // A Ledger Evidence Report grants nothing in the app: it is built
        // and emailed by noshashi-evidence-report. Resolving its buyer
        // below would invite them into an account they never asked for,
        // so it is recorded here and stops.
        if (session.metadata?.product === "evidence_report") {
          await recordEvidenceOrder(session);
          break;
        }
        if(session.mode==="payment" && session.payment_status!=="paid")break;
        let accountId = session.metadata?.account_id ?? session.client_reference_id;

        // A purchase made from the marketing site carries an email and
        // no account id. Resolve it before anything else, so both the
        // credit-pack and subscription branches below have one.
        if (!accountId) {
          accountId = await resolveAccountByEmail(session.customer_details?.email);
        }
        if (!accountId) throw new Error("Paid checkout account unavailable.");

        if (session.mode === "payment") {
          await applyCreditCheckout(db,event,hash,accountId);
        }

        if (session.mode === "subscription" && session.subscription) {
          // Stamping the id means the subscription lifecycle events that
          // follow take the ordinary metadata path.
          const tier = String(session.metadata?.tier ?? "desk");
          await stampSubscription(String(session.subscription), accountId, tier);
          await reconcileSubscription(db,event,hash,String(session.subscription),STRIPE_SECRET_KEY,catalog,fetch,accountId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription=event.data.object;
        await reconcileSubscription(db,event,hash,String(subscription.id),STRIPE_SECRET_KEY,catalog,fetch,subscription.metadata?.account_id);
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId=invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
        if(typeof subscriptionId==='string')await reconcileSubscription(db,event,hash,subscriptionId,STRIPE_SECRET_KEY,catalog);
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error(JSON.stringify({event:"billing_fulfillment_failed",request_id:crypto.randomUUID()}));
    // 500 asks Stripe to retry rather than silently dropping the event.
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
