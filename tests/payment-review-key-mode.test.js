import { describe, expect, it } from "vitest";
import { stripeKeyLivemode } from "../supabase/functions/noshashi-payment-review/stripeKeyMode.ts";

describe("Stripe price environment guard", () => {
  it.each(["sk_test_example", "rk_test_example", "rkcs_test_example"])(
    "requires test prices for %s",
    (key) => {
      expect(stripeKeyLivemode(key)).toBe(false);
    },
  );
  it.each(["sk_live_example", "rk_live_example"])(
    "requires live prices for %s",
    (key) => {
      expect(stripeKeyLivemode(key)).toBe(true);
    },
  );
  it.each([
    "",
    "pk_test_example",
    "sk_example",
    "rkcs_",
    "rkcs_live_example",
    "rkcs_example",
    "rkcs_test_example\n",
    "sk_test_example\n",
    "sk_test_example trailing",
  ])("rejects unrecognized credentials %j", (key) => {
    expect(stripeKeyLivemode(key)).toBe(null);
  });
});
