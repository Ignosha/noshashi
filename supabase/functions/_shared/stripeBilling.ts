import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { stripeKeyLivemode } from "../../../api/_lib/stripe-key-mode.js";
type Db = ReturnType<SupabaseClient["schema"]>;
export type BillingEvent = {
  id: string;
  data: { object: Record<string, any> };
};
export type Catalog = Record<
  string,
  { features: string[]; verification_quota: number }
>;

async function claim(
  db: Db,
  event: BillingEvent,
  account: string,
  hash: string,
) {
  const { data, error } = await db.rpc("billing_claim", {
    p_event: event.id,
    p_account: account,
    p_hash: hash,
  });
  if (error || !data) throw new Error("Billing reservation unavailable.");
  if (data.applied === true) return null;
  if (typeof data.token !== "string") {
    throw new Error("Billing reconciliation busy.");
  }
  return data.token as string;
}
async function release(db: Db, account: string, token: string) {
  // Best effort only: a failed/uncertain release still expires and cannot commit
  // under a replacement token. Never acknowledge an uncommitted event.
  try {
    await db.rpc("billing_release", { p_account: account, p_token: token });
  } catch { /* lease expires */ }
}
export async function applyCreditCheckout(
  db: Db,
  event: BillingEvent,
  hash: string,
  account: string,
) {
  const session = event.data.object;
  if (session.payment_status !== "paid") return;
  const token = await claim(db, event, account, hash);
  if (!token) return;
  try {
    const { data, error } = await db.rpc("billing_apply_credits", {
      p_event: event.id,
      p_account: account,
      p_token: token,
      p_session: session.id,
      p_credits: Number(session.metadata?.verifications ?? 0),
      p_amount: Number(session.amount_total),
      p_currency: session.currency,
    });
    if (error || data?.applied !== true) {
      throw new Error("Credit fulfillment unavailable.");
    }
  } catch (error) {
    await release(db, account, token);
    throw error;
  }
}
export async function reconcileSubscription(
  db: Db,
  event: BillingEvent,
  hash: string,
  id: string,
  key: string,
  catalog: Catalog,
  fetcher: typeof fetch = fetch,
  accountHint?: string,
) {
  if (!/^sub_[A-Za-z0-9]+$/.test(id) || stripeKeyLivemode(key) === null) {
    throw new Error("Billing reconciliation is not configured.");
  }
  const load = async () => {
    const response = await fetcher(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error("Current subscription unavailable.");
    const value = await response.json();
    if (value.id !== id || value.livemode !== stripeKeyLivemode(key)) {
      throw new Error("Subscription environment mismatch.");
    }
    return value;
  };
  const account = accountHint ?? (await load()).metadata?.account_id;
  if (typeof account !== "string") {
    throw new Error("Subscription account unavailable.");
  }
  const token = await claim(db, event, account, hash);
  if (!token) return;
  try {
    // Fetch AFTER the account lease. Late events cannot replay old status, and
    // a stale worker cannot commit after its lease is replaced or expires.
    const current = await load();
    if (current.metadata?.account_id !== account) {
      throw new Error("Subscription account mismatch.");
    }
    const item = current.items?.data?.[0];
    const seconds = [
      item?.current_period_end,
      current.current_period_end,
      current.cancel_at,
    ].find((v) => Number.isFinite(Number(v)) && Number(v) > 0);
    const tier = current.metadata?.tier ?? "operator";
    if (!(tier in catalog)) throw new Error("Unsupported subscription tier.");
    const { data, error } = await db.rpc("billing_apply_subscription", {
      p_event: event.id,
      p_account: account,
      p_token: token,
      p_catalog: catalog,
      p_subscription: {
        stripe_subscription_id: id,
        stripe_customer_id: typeof current.customer === "string"
          ? current.customer
          : current.customer?.id,
        tier,
        status: current.status,
        price_id: item?.price?.id ?? null,
        seats: Number(item?.quantity ?? 1),
        current_period_end: seconds === undefined
          ? null
          : new Date(Number(seconds) * 1000).toISOString(),
        cancel_at_period_end: Boolean(current.cancel_at_period_end),
      },
    });
    if (error || data?.applied !== true) {
      throw new Error("Subscription fulfillment unavailable.");
    }
  } catch (error) {
    await release(db, account, token);
    throw error;
  }
}
