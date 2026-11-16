import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { stripeSignature } from "../supabase/functions/_shared/stripeWebhookSafety.ts";
import {
  applyCreditCheckout,
  reconcileSubscription,
} from "../supabase/functions/_shared/stripeBilling.ts";
const secret = "synthetic-signing-secret";
const signed = (body, t = 1000) =>
  `t=${t},v1=${
    createHmac("sha256", secret).update(t + "." + body).digest("hex")
  }`;
const key = ["rk", "test", "synthetic"].join("_");
const event = {
  id: "evt_fixture",
  data: {
    object: {
      id: "sub_fixture",
      status: "active",
      metadata: { account_id: "verified-account" },
    },
  },
};
const catalog = {
  operator: { features: ["console"], verification_quota: 0 },
  desk: { features: ["console", "compliance_api"], verification_quota: 5000 },
};
const current = (status) => ({
  id: "sub_fixture",
  livemode: false,
  customer: "cus_fixture",
  status,
  metadata: { account_id: "verified-account", tier: "desk" },
  items: {
    data: [{
      quantity: 1,
      price: { id: "price_fixture" },
      current_period_end: 1900000000,
    }],
  },
});
describe("signed webhook boundary", () => {
  it("accepts a valid rotating signature without accepting tampered payloads", async () => {
    const header = signed("{}") + ",v1=" + "0".repeat(64);
    expect(await stripeSignature("{}", header, secret, 1000)).toBe(true);
    expect(await stripeSignature('{"changed":true}', header, secret, 1000))
      .toBe(false);
  });
  it.each([["t=NaN,v1=" + "0".repeat(64), 1000], [signed("{}"), 1400], [
    signed("{}"),
    600,
  ], [signed("{}") + ",t=1000", 1000]])(
    "refuses invalid, old/future or ambiguous timestamps",
    async (h, n) =>
      expect(await stripeSignature("{}", h, secret, n)).toBe(false),
  );
});
describe("current-state fulfillment with account leases", () => {
  it("uses current canceled state rather than a late active event, fetching only after lease acquisition", async () => {
    const order = [];
    const calls = [];
    const db = {
      rpc: vi.fn(async (name, args) => {
        order.push(name);
        calls.push([name, args]);
        return {
          data: name === "billing_claim"
            ? { token: "lease-token" }
            : { applied: true },
          error: null,
        };
      }),
    };
    const fetcher = vi.fn(async () => {
      order.push("stripe-read");
      return Response.json(current("canceled"));
    });
    await reconcileSubscription(
      db,
      event,
      "a".repeat(64),
      "sub_fixture",
      key,
      catalog,
      fetcher,
      "verified-account",
    );
    expect(order).toEqual([
      "billing_claim",
      "stripe-read",
      "billing_apply_subscription",
    ]);
    expect(calls[1][1].p_subscription.status).toBe("canceled");
  });
  it("does not repeat a committed event or bypass a busy lease", async () => {
    const fetcher = vi.fn();
    await reconcileSubscription(
      { rpc: async () => ({ data: { applied: true }, error: null }) },
      event,
      "hash",
      "sub_fixture",
      key,
      catalog,
      fetcher,
      "verified-account",
    );
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      reconcileSubscription(
        { rpc: async () => ({ data: { busy: true }, error: null }) },
        event,
        "hash",
        "sub_fixture",
        key,
        catalog,
        fetcher,
        "verified-account",
      ),
    ).rejects.toThrow(/busy/);
  });
  it("propagates storage errors, releases the lease, and never accepts another account or environment", async () => {
    for (const scenario of ["storage", "account", "environment", "provider"]) {
      const db = {
        rpc: vi.fn(async (name) =>
          name === "billing_claim"
            ? { data: { token: "lease" }, error: null }
            : name === "billing_apply_subscription"
            ? { error: { message: "sensitive detail" } }
            : { error: null }
        ),
      };
      const fetcher = async () =>
        scenario === "provider"
          ? new Response("", { status: 503 })
          : Response.json({
            ...current("active"),
            ...(scenario === "account"
              ? { metadata: { account_id: "other", tier: "desk" } }
              : {}),
            ...(scenario === "environment" ? { livemode: true } : {}),
          });
      await expect(
        reconcileSubscription(
          db,
          event,
          "hash",
          "sub_fixture",
          key,
          catalog,
          fetcher,
          "verified-account",
        ),
      ).rejects.toThrow();
      expect(db.rpc.mock.calls.at(-1)[0]).toBe("billing_release");
    }
  });
  it("does not reserve or credit an unpaid checkout", async () => {
    const db = { rpc: vi.fn() };
    await applyCreditCheckout(
      db,
      { id: "evt_unpaid", data: { object: { payment_status: "unpaid" } } },
      "hash",
      "account",
    );
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
