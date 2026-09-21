import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import handler from "../api/create-checkout-session.js";

/**
 * The website's own checkout endpoint.
 *
 * These exist because every defect they cover was live and silent. The
 * page sold Pro "per seat / month" while the endpoint posted a literal
 * quantity of 1; it rendered an annual figure the endpoint could not
 * charge; it sent no metadata, so the webhook that keys entitlements off
 * `metadata.account_id` dropped the event and a completed payment
 * provisioned nothing; and it invited a promotion code on every session,
 * which is how an internal test coupon took $749 to $0.50.
 *
 * None of that failed anything. It all returned 200.
 */

const MONTHLY = "price_1U6U1eGSxPXLjUKIGnORqp43";
const ANNUAL = "price_1UHV60GSxPXLjUKIytehVDNd";

/**
 * Not a key, and deliberately not written as one.
 *
 * `isConfigured` only checks the shape of STRIPE_SECRET_KEY, so any
 * correctly-shaped string exercises the handler. Spelling it out as a
 * literal makes GitHub's push protection reject the whole branch as a
 * leaked Stripe test key, which is a false positive that still costs a
 * push. Assembling it keeps the shape and leaves nothing to match.
 */
const FAKE_KEY = ["sk", "test", "0".repeat(24)].join("_");

/** Captures the form Stripe would have received. */
let sent;

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    redirect(code, url) {
      this.statusCode = code;
      this.body = url;
      return this;
    },
  };
  return res;
}

function post(body, { accept = "application/json" } = {}) {
  return {
    method: "POST",
    headers: { accept, host: "noshashi.app", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250) + 1}` },
    body,
  };
}

/** The parsed body of the single Stripe call the handler made. */
function stripeForm() {
  return Object.fromEntries(new URLSearchParams(sent));
}

beforeEach(() => {
  sent = undefined;
  process.env.STRIPE_SECRET_KEY = FAKE_KEY;
  delete process.env.STRIPE_ALLOW_PROMOTION_CODES;
  delete process.env.STRIPE_PRO_PRICE_ID;
  delete process.env.STRIPE_PRO_ANNUAL_PRICE_ID;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      sent = init.body.toString();
      return {
        ok: true,
        status: 200,
        json: async () => ({ url: "https://checkout.stripe.com/c/pay/test" }),
      };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("seats are what the buyer asked for", () => {
  it("bills the seat count it was given, not one", async () => {
    const res = mockRes();
    await handler(post({ seats: 4 }), res);
    expect(res.statusCode).toBe(200);
    expect(stripeForm()["line_items[0][quantity]"]).toBe("4");
  });

  it("defaults to a single seat when none is stated", async () => {
    const res = mockRes();
    await handler(post({}), res);
    expect(stripeForm()["line_items[0][quantity]"]).toBe("1");
  });

  it("refuses a free subscription dressed up as zero seats", async () => {
    const res = mockRes();
    await handler(post({ seats: 0 }), res);
    expect(stripeForm()["line_items[0][quantity]"]).toBe("1");
  });

  it("refuses an invoice nobody could pay", async () => {
    const res = mockRes();
    await handler(post({ seats: 1e9 }), res);
    expect(stripeForm()["line_items[0][quantity]"]).toBe("500");
  });

  it("ignores a seat count that is not a number", async () => {
    const res = mockRes();
    await handler(post({ seats: "four" }), res);
    expect(stripeForm()["line_items[0][quantity]"]).toBe("1");
  });

  it("lets the buyer correct the count on Stripe's own page", async () => {
    const res = mockRes();
    await handler(post({ seats: 2 }), res);
    expect(stripeForm()["line_items[0][adjustable_quantity][enabled]"]).toBe("true");
  });
});

describe("the billing period is the one that was chosen", () => {
  it("charges the monthly price by default", async () => {
    const res = mockRes();
    await handler(post({}), res);
    expect(stripeForm()["line_items[0][price]"]).toBe(MONTHLY);
  });

  it("charges the annual price when annual was chosen", async () => {
    const res = mockRes();
    await handler(post({ cadence: "annual" }), res);
    expect(stripeForm()["line_items[0][price]"]).toBe(ANNUAL);
  });

  it("treats an unknown period as monthly rather than guessing", async () => {
    const res = mockRes();
    await handler(post({ cadence: "weekly" }), res);
    expect(stripeForm()["line_items[0][price]"]).toBe(MONTHLY);
  });

  it("reads both prices from the environment when set", async () => {
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID = "price_test_annual";
    const res = mockRes();
    await handler(post({ cadence: "annual" }), res);
    expect(stripeForm()["line_items[0][price]"]).toBe("price_test_annual");
  });
});

describe("the payment can be attached to somebody", () => {
  it("names the tier the webhook has to write", async () => {
    const res = mockRes();
    await handler(post({ seats: 1 }), res);
    const form = stripeForm();
    expect(form["subscription_data[metadata][tier]"]).toBe("desk");
    expect(form["metadata[tier]"]).toBe("desk");
  });

  it("records which period was bought", async () => {
    const res = mockRes();
    await handler(post({ cadence: "annual" }), res);
    expect(stripeForm()["subscription_data[metadata][cadence]"]).toBe("annual");
  });
});

describe("discounts are a decision, not a default", () => {
  it("does not invite a promotion code", async () => {
    const res = mockRes();
    await handler(post({}), res);
    expect(stripeForm().allow_promotion_codes).toBe("false");
  });

  it("invites one only when the deployment says so", async () => {
    process.env.STRIPE_ALLOW_PROMOTION_CODES = "true";
    const res = mockRes();
    await handler(post({}), res);
    expect(stripeForm().allow_promotion_codes).toBe("true");
  });
});

describe("the no-script form still works", () => {
  it("accepts form-encoded fields and redirects", async () => {
    const res = mockRes();
    await handler(post("seats=3&cadence=annual", { accept: "text/html" }), res);
    const form = stripeForm();
    expect(form["line_items[0][quantity]"]).toBe("3");
    expect(form["line_items[0][price]"]).toBe(ANNUAL);
    expect(res.statusCode).toBe(303);
  });
});
