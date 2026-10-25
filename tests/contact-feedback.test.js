import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import handler from "../api/contact.js";

/**
 * Tester feedback through the contact endpoint.
 *
 * Feedback is the one topic that may arrive without an address, and an
 * address given without consent must not be passed on. Everything else
 * keeps the contact form's rules: a real message, honest failure when
 * nothing can deliver it.
 */

let sent;
let ip = 0;

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function post(body) {
  // A fresh client address per call keeps the rate limiter out of the way.
  ip += 1;
  const req = { method: "POST", headers: { host: "example.test", "x-forwarded-for": `10.0.0.${ip}` }, body };
  const res = mockRes();
  await handler(req, res);
  return res;
}

const feedback = (extra = {}) => ({
  topic: "feedback",
  subject: "Tester feedback · Usability or navigation",
  message: "The transfer fee line was hard to read on my phone.",
  elapsed: 20_000,
  ...extra,
});

beforeEach(() => {
  sent = [];
  vi.stubEnv("CONTACT_WEBHOOK_URL", "https://hooks.example.test/contact");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return new Response("{}", { status: 200 });
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("feedback topic", () => {
  it("accepts feedback with no name or email", async () => {
    const res = await post(feedback());
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/no reply will come/);
    expect(sent[0].body.name).toBe("Tester");
    expect(sent[0].body.email).toBe("");
  });

  it("drops an email given without consent", async () => {
    const res = await post(feedback({ email: "tester@example.com" }));
    expect(res.statusCode).toBe(200);
    expect(sent[0].body.email).toBe("");
    expect(sent[0].body.text).not.toContain("tester@example.com");
  });

  it("keeps an email given with consent", async () => {
    const res = await post(feedback({ email: "tester@example.com", consent: true }));
    expect(res.statusCode).toBe(200);
    expect(sent[0].body.email).toBe("tester@example.com");
    expect(res.body.message).toMatch(/reply at the address/);
  });

  it("rejects a consented email that is not an address", async () => {
    const res = await post(feedback({ email: "not-an-address", consent: true }));
    expect(res.statusCode).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("rejects a message that is too short", async () => {
    const res = await post(feedback({ message: "bad" }));
    expect(res.statusCode).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("silently drops honeypot and too-fast submissions", async () => {
    expect((await post(feedback({ company_website: "x" }))).body.delivered).toBe("accepted");
    expect((await post(feedback({ elapsed: 500 }))).body.delivered).toBe("accepted");
    expect(sent).toHaveLength(0);
  });

  it("says so when nothing can deliver it", async () => {
    vi.stubEnv("CONTACT_WEBHOOK_URL", "");
    const res = await post(feedback());
    expect(res.statusCode).toBe(503);
    expect(res.body.mailto).toBe("support@noshashi.app");
  });
});

describe("other topics still need an email", () => {
  it("rejects a support message without an address", async () => {
    const res = await post({ topic: "support", name: "A", message: "Hello there, a question.", elapsed: 20_000 });
    expect(res.statusCode).toBe(400);
  });
});
