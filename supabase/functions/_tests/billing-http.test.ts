// Actual signed HTTP entry point and SDK; loopback-only synthetic database.
const account = "e1000000-0000-4000-8000-000000000001";
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`Expected ${b}, got ${a}`);
  }
};
Deno.test("signed billing HTTP failure and async-completion boundaries", async (t) => {
  let fail = false;
  const calls: string[] = [];
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    async (request) => {
      const route = new URL(request.url).pathname.split("/").at(-1)!;
      calls.push(route);
      return Response.json(
        route === "billing_claim"
          ? { token: "synthetic-lease" }
          : fail && route === "billing_apply_credits"
          ? { message: "sensitive-storage-detail", code: "XX000" }
          : { applied: true },
        { status: fail && route === "billing_apply_credits" ? 500 : 200 },
      );
    },
  );
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_SECRET_KEY",
  ];
  const previous = keys.map((key) => [key, Deno.env.get(key)]);
  const secret = "synthetic-webhook-secret";
  Deno.env.set("SUPABASE_URL", `http://127.0.0.1:${server.addr.port}`);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service");
  Deno.env.set("STRIPE_WEBHOOK_SECRET", secret);
  Deno.env.set("STRIPE_SECRET_KEY", ["rk", "test", "synthetic"].join("_"));
  let handle: (r: Request) => Promise<Response>;
  const serve = Deno.serve;
  Deno.serve = ((fn: (r: Request) => Promise<Response>) => {
    handle = fn;
  }) as unknown as typeof Deno.serve;
  try {
    await import("../noshashi-stripe-webhook/index.ts");
  } finally {
    Deno.serve = serve;
  }
  const send = async (object: unknown, signature = true) => {
    const raw = typeof object === "string" ? object : JSON.stringify(object),
      time = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(time + "." + raw),
    );
    const hex = Array.from(
      new Uint8Array(mac),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
    return await handle(
      new Request("https://example.invalid/webhook", {
        method: "POST",
        body: raw,
        headers: signature ? { "Stripe-Signature": `t=${time},v1=${hex}` } : {},
      }),
    );
  };
  const event = (type = "checkout.session.completed", paid = true) => ({
    id: "evt_synthetic",
    type,
    data: {
      object: {
        id: "cs_test_synthetic",
        mode: "payment",
        payment_status: paid ? "paid" : "unpaid",
        amount_total: 100,
        currency: "usd",
        metadata: { account_id: account, verifications: "10000" },
      },
    },
  });
  const priorError = console.error;
  const errors: string[] = [];
  console.error = (v: unknown) => errors.push(String(v));
  try {
    await t.step(
      "unsigned and signed malformed bodies fail before storage",
      async () => {
        calls.length = 0;
        equal((await send(event(), false)).status, 400);
        equal((await send("{")).status, 400);
        equal(calls.length, 0);
      },
    );
    await t.step(
      "unpaid completion waits without reserving credits",
      async () => {
        calls.length = 0;
        equal((await send(event(undefined, false))).status, 200);
        equal(calls.length, 0);
      },
    );
    await t.step(
      "paid async completion takes the durable fulfillment path",
      async () => {
        calls.length = 0;
        equal(
          (await send(event("checkout.session.async_payment_succeeded")))
            .status,
          200,
        );
        equal(calls, ["billing_claim", "billing_apply_credits"]);
      },
    );
    await t.step(
      "storage failure is retryable and never acknowledged as fulfilled",
      async () => {
        calls.length = 0;
        fail = true;
        const r = await send(event());
        equal(r.status, 500);
        equal(calls, [
          "billing_claim",
          "billing_apply_credits",
          "billing_release",
        ]);
        equal((await r.text()).includes("sensitive-storage-detail"), false);
        equal(errors.join("").includes("sensitive-storage-detail"), false);
      },
    );
  } finally {
    console.error = priorError;
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key!);
      else Deno.env.set(key!, value);
    }
    await server.shutdown();
  }
});
