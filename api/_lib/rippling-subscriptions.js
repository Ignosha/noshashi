import { createHmac, timingSafeEqual } from "node:crypto";
import { RIPPLING_PLANS, planFor } from "./rippling-keys.js";

const PREFIX = "nsh_rip_sub_";
const SESSION_ID = /^cs_(?:test|live)_[A-Za-z0-9]{15,160}$/;
const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]{8,80}$/;

export function ripplingBillingMode(env = process.env) {
  if (!/^[a-f0-9]{64}$/i.test(env.RIPPLING_SUBSCRIPTION_SECRET ?? "")) return null;
  const prefix = env.VERCEL_ENV === "production" ? "sk_live_" : "sk_test_";
  if (!env.STRIPE_SECRET_KEY?.startsWith(prefix)) return null;
  return prefix === "sk_live_" ? "live" : "test";
}

function signature(subscriptionId, env) {
  return createHmac("sha256", Buffer.from(env.RIPPLING_SUBSCRIPTION_SECRET, "hex"))
    .update(`noshashi:rippling:v1:${ripplingBillingMode(env)}:${subscriptionId}`)
    .digest("base64url");
}

async function stripeRead(resource, env) {
  const response = await fetch(`https://api.stripe.com/v1/${resource}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Stripe subscription verification unavailable");
  return response.json();
}

function activePlan(subscription, id, mode) {
  if (subscription?.id !== id || subscription.livemode !== (mode === "live") ||
      subscription.status !== "active" || subscription.latest_invoice?.status !== "paid" ||
      subscription.metadata?.product !== "rippling_api") return null;
  const plan = subscription.metadata.rippling_plan;
  return Object.hasOwn(RIPPLING_PLANS, plan) && RIPPLING_PLANS[plan].batch > 0 ? plan : null;
}

export async function claimRipplingKey(sessionId, env = process.env) {
  const mode = ripplingBillingMode(env);
  if (!mode || typeof sessionId !== "string" || !SESSION_ID.test(sessionId) ||
      !sessionId.startsWith(`cs_${mode}_`)) return null;
  const session = await stripeRead(`checkout/sessions/${sessionId}?expand[]=subscription.latest_invoice`, env);
  if (session?.id !== sessionId || session.livemode !== (mode === "live") ||
      session.status !== "complete" || session.payment_status !== "paid" ||
      session.mode !== "subscription" || session.metadata?.product !== "rippling_api") return null;
  const id = session.subscription?.id;
  if (!SUBSCRIPTION_ID.test(id ?? "")) return null;
  const plan = activePlan(session.subscription, id, mode);
  if (!plan || plan !== session.metadata.rippling_plan) return null;
  return { key: `${PREFIX}${id}.${signature(id, env)}`, plan };
}

export async function resolveRipplingPlan(req, env = process.env) {
  const token = String(req.headers?.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith(PREFIX)) return planFor(req, env);
  const mode = ripplingBillingMode(env);
  const parts = token.slice(PREFIX.length).split(".");
  if (!mode || parts.length !== 2) return null;
  const [id, mac] = parts;
  if (!SUBSCRIPTION_ID.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(mac)) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(signature(id, env)))) return null;
  return activePlan(await stripeRead(`subscriptions/${id}?expand[]=latest_invoice`, env), id, mode);
}
