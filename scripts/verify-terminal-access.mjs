// Local preview only. Synthetic account/billing responses; never signs in a real user.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.APP_URL || "http://127.0.0.1:4355";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Use a local fixture preview only.");
const out =
  process.env.SHOTS_DIR || "/workspace/artifacts/terminal-access/browser";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const A = "a0000000-0000-0000-0000-000000000001",
  O = "a0000000-0000-0000-0000-000000000002",
  C = "a0000000-0000-0000-0000-000000000003";
const checks = [],
  errors = [];
const user = (id = A) => ({
  id,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  factors: [],
  created_at: new Date().toISOString(),
});
const session = (id = A) => {
  const payload = {
    sub: id,
    aud: "authenticated",
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    aal: "aal1",
    amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
  };
  return {
    access_token:
      "eyJhbGciOiJIUzI1NiJ9." +
      Buffer.from(JSON.stringify(payload)).toString("base64url") +
      ".fixture",
    refresh_token: "fixture-only",
    expires_in: 3600,
    expires_at: payload.exp,
    token_type: "bearer",
    user: user(id),
  };
};
try {
  for (const tier of ["guest", "operator", "desk", "institution"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      reducedMotion: "reduce",
    });
    let held,
      hold = false;
    if (tier !== "guest")
      await context.addInitScript(
        (s) => localStorage.setItem("noshashi.auth", JSON.stringify(s)),
        session(),
      );
    await context.route(
      "https://xiurbiwuwcfowqnpmwki.supabase.co/**",
      async (route) => {
        const u = new URL(route.request().url()),
          path = u.pathname;
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "*",
        };
        if (route.request().method() === "OPTIONS")
          return route.fulfill({ status: 204, headers: cors });
        if (path.includes("/auth/v1/"))
          return route.fulfill({
            headers: cors,
            status: path.includes("/logout") ? 204 : 200,
            ...(path.includes("/logout") ? {} : { json: user() }),
          });
        if (!path.includes("/functions/v1/noshashi-terminal/"))
          return route.fulfill({
            status: 503,
            headers: cors,
            json: { error: "Fixture blocks all unrelated service traffic" },
          });
        const team = u.searchParams.has("organization_id");
        let json;
        if (path.endsWith("/organizations"))
          json = {
            organizations: [
              {
                organization_id: O,
                role: "owner",
                organizations: { name: "SYNTHETIC test organization" },
              },
            ],
          };
        else if (path.endsWith("/access"))
          json = {
            access: {
              account_id: A,
              tier: team
                ? tier === "institution"
                  ? "institution"
                  : "desk"
                : tier === "institution"
                  ? "desk"
                  : tier,
              source:
                team && tier === "institution"
                  ? "contract"
                  : tier === "operator"
                    ? "free"
                    : "subscription",
              valid_until:
                tier === "operator"
                  ? null
                  : new Date(Date.now() + 3600000).toISOString(),
              organization_id: team ? O : null,
              role: team ? "owner" : null,
            },
            features: {
              public_demo: true,
              personal_cases: !team && ["desk", "institution"].includes(tier),
              team_cases: team && tier === "institution",
              team_write: team && tier === "institution",
            },
          };
        else if (path.endsWith("/cases") && route.request().method() === "POST")
          json = { id: C };
        else if (path.endsWith("/cases"))
          json = {
            cases: [
              {
                id: C,
                created_at: new Date().toISOString(),
                mode: "payment",
                subject: { hash: "A".repeat(64) },
              },
            ],
          };
        else if (path.endsWith("/" + C)) {
          if (hold) await new Promise((r) => (held = r));
          json = {
            historical: true,
            report: { test_only: "SYNTHETIC private case" },
          };
        } else
          return route.fulfill({
            status: 404,
            headers: cors,
            json: { error: "Unknown fixture" },
          });
        try {
          await route.fulfill({ headers: cors, json });
        } catch {
          /* An account/scope switch can abort a held fixture. */
        }
      },
    );
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/terminal/");
    await p.locator("#ws-account-label").click();
    await p
      .getByRole("heading", {
        name: tier === "guest" ? "Sign in to NOSHASHI" : "Your terminal access",
      })
      .waitFor();
    if (tier === "guest") {
      assert.equal(
        await p.getByRole("button", { name: "Save selected lookup" }).count(),
        0,
      );
      assert.ok(await p.getByLabel("Email", { exact: true }).isVisible());
      checks.push("Guest sign-in and free public tools");
    } else {
      await p.waitForFunction(
        () =>
          document.querySelector(".ta-status dd")?.textContent !== "UNVERIFIED",
      );
      const save = p.getByRole("button", { name: "Save selected lookup" });
      assert.equal(await save.isEnabled(), tier !== "operator");
      if (tier === "desk") {
        await p.locator(".ws-rail [data-ws-open=issuer]").click();
        await p.locator("[data-example=issuer]").click();
        await p.locator("#ws-account-label").click();
        const saved = p.waitForResponse(
          (r) =>
            r.url().includes("/noshashi-terminal/cases") &&
            r.request().method() === "POST",
        );
        await save.click();
        await saved;

        await p.waitForFunction(
          () =>
            document.querySelector(".ta-message")?.textContent ===
            "Access checked against your current account records.",
        );
        assert.ok(await save.isEnabled());
        await p.getByLabel("Workspace", { exact: true }).selectOption(O);
        await p.waitForFunction(
          () => document.querySelector(".ta-status dd")?.textContent === "Pro",
        );
        assert.ok(await save.isDisabled());
        assert.match(
          await p.locator(".ta-account").textContent(),
          /Pro does not unlock Institutional/,
        );
        checks.push(
          "Pro paid archive available; Institutional team archive locked",
        );
      }
      if (tier === "institution") {
        await p.getByLabel("Workspace", { exact: true }).selectOption(O);
        await p.waitForFunction(
          () =>
            document.querySelector(".ta-status dd")?.textContent ===
            "Institutional",
        );
        assert.ok(await save.isEnabled());
        await p.locator(".ta-account").evaluate((e) => (e.scrollTop = 0));
        await p.screenshot({
          path: `${out}/institution-team-desktop.png`,
          fullPage: true,
        });
        await p.setViewportSize({ width: 390, height: 844 });
        assert.ok(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await p.screenshot({
          path: `${out}/institution-team-mobile.png`,
          fullPage: true,
        });
        await p.setViewportSize({ width: 1440, height: 1050 });
        hold = true;
        await p
          .getByRole("button", { name: "Open case " + C.slice(0, 8) })
          .click();
        await p.waitForFunction(
          () =>
            document.querySelector(".ta-message")?.textContent === "Working…",
        );
        await p.getByLabel("Workspace", { exact: true }).selectOption("");
        held?.();
        await p.waitForFunction(
          () => document.querySelector(".ta-status dd")?.textContent === "Pro",
        );
        assert.equal(
          await p.getByRole("region", { name: "Historical case" }).count(),
          0,
        );
        checks.push(
          "Assigned Institutional team scope; switching scope discards delayed private response",
        );
      }
      if (tier === "operator")
        checks.push("Signed-in free account cannot save cases");
    }
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.locator(".ta-account").evaluate((e) => (e.scrollTop = 0));
    await p.screenshot({ path: `${out}/${tier}-desktop.png`, fullPage: true });
    await p.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({ path: `${out}/${tier}-mobile.png`, fullPage: true });
    // Escape and keyboard launcher return to existing console.
    await p.keyboard.press("Escape");
    await p.locator(".ws-rail [data-ws-open=console]").focus();
    await p.keyboard.press("Enter");
    assert.ok(await p.locator("#ws-command").isVisible());
    if (tier !== "guest") {
      await p.locator("#ws-account-label").click();
      await p.getByRole("button", { name: "Sign out", exact: true }).click();
      await p.getByRole("heading", { name: "Sign in to NOSHASHI" }).waitFor();
      assert.equal(
        await p.getByRole("region", { name: "Historical case" }).count(),
        0,
      );
      assert.equal(await p.locator(".ta-cases").count(), 0);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  checks.push(
    "Desktop/mobile no horizontal overflow; keyboard launcher; sign-out clears private state; no browser exceptions",
  );
  await writeFile(
    out + "/results.json",
    JSON.stringify(
      {
        checks,
        errors,
        scope:
          "Linux Chromium; synthetic Supabase authentication and access fixtures only. SQL authorization separately tested in isolated Postgres.",
      },
      null,
      2,
    ),
  );
  console.log(checks.join("\n"));
} finally {
  await browser.close();
}
