// Synthetic loopback integration of real Edge handlers and Supabase SDK.
// Auth/RPC responses are fixtures; database RLS/concurrency has separate SQL tests.
import { policyHash } from "../noshashi-policy-activate/policy.ts";
const actor = "d1000000-0000-4000-8000-000000000001";
const org = "d2000000-0000-4000-8000-000000000001";
const exception = "d3000000-0000-4000-8000-000000000001";
const params = {
  hhiLimit: 2500,
  counterpartyShareLimitPct: 25,
  travelRule: { thresholdFiat: 1000, currency: "USD", xrpReferenceRate: 2 },
  reserveHeadroomMinXrp: 30,
  strictFreeze: true,
  outcomes: {
    hhi: "review",
    counterparty: "review",
    travelRule: "review",
    reserve: "review",
    freeze: "fail",
  },
};
const policy = { id: "http_fixture", name: "HTTP fixture", version: 1, params };
const equal = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};
const token = (aal: string) => {
  const enc = (value: unknown) =>
    btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_")
      .replaceAll("=", "");
  return enc({ alg: "HS256", typ: "JWT" }) + "." +
    enc({
      sub: actor,
      role: "authenticated",
      aal,
      exp: Math.floor(Date.now() / 1000) + 600,
    }) + "." + enc("synthetic-signature-not-for-production");
};
Deno.test("policy and exception HTTP boundaries (synthetic Auth/RPC)", async (t) => {
  const observed: Array<
    { path: string; body: Record<string, unknown> | null }
  > = [];
  let member = true, altered = false, dbFailure = false;
  const hash = await policyHash(policy);
  const fixture = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    async (req) => {
      const path = new URL(req.url).pathname;
      const body = req.method === "POST" ? await req.json() : null;
      observed.push({ path, body });
      const respond = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path === "/auth/v1/user") {
        return respond({
          id: actor,
          email: "synthetic@example.invalid",
          aud: "authenticated",
          role: "authenticated",
          factors: [{
            id: "fixture-factor",
            factor_type: "totp",
            status: "verified",
          }],
        });
      }
      if (path === "/rest/v1/organization_members") {
        return respond(
          member ? [{ role: "reviewer" }] : [],
        );
      }
      if (path === "/rest/v1/org_policies") {
        return respond([{
          policy_id: policy.id,
          name: policy.name,
          version: 1,
          params,
          hash: altered ? "F".repeat(64) : hash,
          engine: "1",
          status: "pending",
        }]);
      }
      if (path.startsWith("/rest/v1/rpc/")) {
        return dbFailure
          ? respond(
            { message: "sensitive-database-detail", code: "XX000" },
            500,
          )
          : respond({
            ok: true,
            status: path.endsWith("activate_org_policy")
              ? "active"
              : "approved",
          });
      }
      return respond({ error: "unexpected fixture route" }, 404);
    },
  );
  const previous = new Map(
    [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "STRIPE_SECRET_KEY",
    ].map(
      (key) => [key, Deno.env.get(key)],
    ),
  );
  Deno.env.set("SUPABASE_URL", `http://127.0.0.1:${fixture.addr.port}`);
  Deno.env.set("SUPABASE_ANON_KEY", "synthetic-public-key");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
  Deno.env.set("STRIPE_SECRET_KEY", "synthetic-test-credential");
  const serve = Deno.serve;
  const handlers: Array<(request: Request) => Promise<Response>> = [];
  // Capture bootstrap only. The handlers, SDK and HTTP transport run unmodified.
  Deno.serve = ((handler: (request: Request) => Promise<Response>) => {
    handlers.push(handler);
  }) as unknown as typeof Deno.serve;
  try {
    await import("../noshashi-policy-activate/index.ts");
    await import("../noshashi-exception-decide/index.ts");
    await import("../noshashi-password/index.ts");
    await import("../noshashi-portal/index.ts");
    await import("../noshashi-return/index.ts");
  } finally {
    Deno.serve = serve;
  }
  const body = {
    organizationId: org,
    policyId: policy.id,
    version: 1,
    exceptionId: exception,
    decision: "approve",
    actor: "forged-body-actor",
    aal: "aal2",
  };
  const request = (data: unknown, aal = "aal2", bearer = true) =>
    new Request("https://example.invalid/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: "Bearer " + token(aal) } : {}),
      },
      body: JSON.stringify(data),
    });
  const calls = () => observed.filter((row) => row.path.includes("/rest/"));
  const oldError = console.error;
  const errors: string[] = [];
  console.error = (value: unknown) => errors.push(String(value));
  try {
    for (const [i, handler] of handlers.slice(0, 2).entries()) {
      await t.step(
        `handler ${i}: missing session and enrolled MFA deny before database access`,
        async () => {
          observed.length = 0;
          equal((await handler(request(body, "aal2", false))).status, 401);
          equal(calls().length, 0);
          observed.length = 0;
          equal((await handler(request(body, "aal1"))).status, 403);
          equal(calls().length, 0);
        },
      );
      await t.step(
        `handler ${i}: verified actor overrides forged body fields`,
        async () => {
          observed.length = 0;
          const r = await handler(request(body));
          equal(r.status, 200);
          equal(r.headers.get("Cache-Control"), "no-store");
          if (
            !r.headers.get("X-Request-ID")?.match(/^[0-9a-f-]{36}$/)
          ) throw new Error("Missing server trace identifier");
          equal(
            calls().find((row) => row.path.includes("/rpc/"))?.body?.p_actor,
            actor,
          );
        },
      );
      await t.step(
        `handler ${i}: malformed and oversized bodies never reach RPC`,
        async () => {
          observed.length = 0;
          equal((await handler(request([]))).status, 400);
          equal(calls().length, 0);
          observed.length = 0;
          equal(
            (await handler(request({ note: "x".repeat(33000) }))).status,
            413,
          );
          equal(calls().length, 0);
        },
      );
      await t.step(
        `handler ${i}: dependency failures do not disclose provider details`,
        async () => {
          dbFailure = true;
          const r = await handler(request(body));
          equal(r.status, 500);
          if ((await r.text()).includes("sensitive-database-detail")) {
            throw new Error("Error detail leaked");
          }
          dbFailure = false;
        },
      );
    }
    await t.step(
      "activation checks membership before policy data and refuses an altered stored hash",
      async () => {
        observed.length = 0;
        member = false;
        equal((await handlers[0](request(body))).status, 404);
        equal(observed.some((row) => row.path.endsWith("org_policies")), false);
        member = true;
        observed.length = 0;
        altered = true;
        equal((await handlers[0](request(body))).status, 422);
        equal(observed.some((row) => row.path.includes("/rpc/")), false);
        altered = false;
      },
    );
    await t.step(
      "billing portal requires verified MFA before querying billing records",
      async () => {
        observed.length = 0;
        equal((await handlers[3](request(body, "aal1"))).status, 403);
        equal(calls().length, 0);
        equal((await handlers[3](request(body, "aal2", false))).status, 401);
      },
    );
    await t.step(
      "public password screening bounds input before any external request",
      async () => {
        observed.length = 0;
        equal((await handlers[2](request([]))).status, 400);
        equal(
          (await handlers[2](request({ password: "x".repeat(9000) }))).status,
          413,
        );
        equal(calls().length, 0);
      },
    );
    await t.step("billing return renders the canonical emblem without claiming fulfillment or echoing session data", async () => {
      for (const path of ["success", "cancel", "billing"]) {
        const r = await handlers[4](new Request("https://example.invalid/" + path + "?session_id=private-test-marker"));
        equal(r.status, 200);
        equal(r.headers.get("Cache-Control"), "no-store");
        if (!r.headers.get("Content-Security-Policy")?.includes("default-src 'none'")) throw new Error("Missing static-page CSP");
        const html = await r.text();
        equal(html.includes('class="brand-mark"'), true);
        equal(html.includes("private-test-marker"), false);
        equal(html.includes("Your plan is active."), false);
      }
    });
    if (errors.join("\n").includes("sensitive-database-detail")) {
      throw new Error("Provider detail leaked into logs");
    }
  } finally {
    console.error = oldError;
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
    await fixture.shutdown();
  }
});
