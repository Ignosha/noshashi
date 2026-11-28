import { afterEach, expect, it, vi } from "vitest";
import { claimRipplingKey, resolveRipplingPlan } from "../api/_lib/rippling-subscriptions.js";

const env = {
  VERCEL_ENV: "preview",
  STRIPE_SECRET_KEY: ["sk", "test", "0".repeat(24)].join("_"),
  RIPPLING_SUBSCRIPTION_SECRET: "ab".repeat(32),
};
const id = "sub_0123456789012345";
const sessionId = "cs_test_0123456789012345";
const subscription = {
  id, livemode: false, status: "active", latest_invoice: { status: "paid" },
  metadata: { product: "rippling_api", rippling_plan: "starter" },
};
const session = {
  id: sessionId, livemode: false, status: "complete", payment_status: "paid", mode: "subscription",
  metadata: subscription.metadata, subscription,
};

afterEach(() => vi.unstubAllGlobals());

it("issues one stable key after payment and revokes it when the subscription ends", async () => {
  const stripe = vi.fn(async (url) => {
    const value = url.includes("/checkout/") ? session : { ...subscription, status: "canceled" };
    return { ok: true, json: async () => value };
  });
  vi.stubGlobal("fetch", stripe);
  const issued = await claimRipplingKey(sessionId, env);
  expect(issued.plan).toBe("starter");
  expect(await claimRipplingKey(sessionId, env)).toEqual(issued);
  const req = { headers: { authorization: `Bearer ${issued.key}` } };
  stripe.mockResolvedValueOnce({ ok: true, json: async () => subscription });
  expect(await resolveRipplingPlan(req, env)).toBe("starter");
  expect(await resolveRipplingPlan(req, env)).toBeNull();
  expect(await resolveRipplingPlan({ headers: { authorization: `Bearer ${issued.key}x` } }, env)).toBeNull();
  expect(stripe).toHaveBeenCalledTimes(4);
});

it("does not fulfill unpaid sessions, unpaid invoices, or mismatched purchases", async () => {
  const stripe = vi.fn();
  vi.stubGlobal("fetch", stripe);
  for (const value of [
    { ...session, payment_status: "unpaid" },
    { ...session, subscription: { ...subscription, latest_invoice: { status: "open" } } },
    { ...session, metadata: { ...session.metadata, rippling_plan: "desk" } },
  ]) {
    stripe.mockResolvedValueOnce({ ok: true, json: async () => value });
    expect(await claimRipplingKey(sessionId, env)).toBeNull();
  }
  expect(await claimRipplingKey(sessionId, { ...env, VERCEL_ENV: "production" })).toBeNull();
  expect(stripe).toHaveBeenCalledTimes(3);
});
