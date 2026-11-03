import { describe, it, expect, vi } from "vitest";
import { reviewBillingRisk } from "../supabase/functions/_shared/paymentReviewBillingEvents.ts";

describe("Payment Review Stripe risk holds", () => {
  it.each([
    "charge.dispute.created",
    "charge.refunded",
    "radar.early_fraud_warning.created",
  ])(
    "persists %s by verified Stripe customer, without granting access",
    async (type) => {
      const upsert = vi.fn(async () => ({ error: null }));
      const from = vi.fn(() => ({ upsert }));
      const charge = { id: "ch_example", customer: "cus_example" };
      const loader = vi.fn(async () => charge);
      await reviewBillingRisk(
        { from },
        {
          id: "evt_example",
          type,
          data: {
            object:
              type === "charge.refunded"
                ? charge
                : {
                    charge: "ch_example",
                    metadata: { account_id: "untrusted" },
                  },
          },
        },
        loader,
      );
      expect(from).toHaveBeenCalledWith("payment_review_billing_holds");
      expect(upsert).toHaveBeenCalledWith(
        {
          event_id: "evt_example",
          stripe_customer_id: "cus_example",
          reason: type,
        },
        { onConflict: "event_id", ignoreDuplicates: true },
      );
      expect(
        type === "charge.refunded"
          ? loader.mock.calls.length === 0
          : loader.mock.calls.length === 1,
      ).toBe(true);
    },
  );
  it("does not acknowledge a risk event if private storage fails", async () => {
    await expect(
      reviewBillingRisk(
        { from: () => ({ upsert: async () => ({ error: {} }) }) },
        {
          id: "evt_failure",
          type: "charge.refunded",
          data: { object: { customer: "cus_example" } },
        },
        vi.fn(),
      ),
    ).rejects.toThrow(/persist/);
  });
  it("leaves unrelated events to the existing billing handler", async () => {
    const from = vi.fn();
    expect(
      await reviewBillingRisk(
        { from },
        { id: "evt_other", type: "invoice.paid", data: { object: {} } },
        vi.fn(),
      ),
    ).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});
