/*
 * Issuer Watch: $19 a month for an email the moment one issuer's powers
 * change. The checkout must start a monthly subscription that carries the
 * issuer on the subscription (noshashi-stripe-webhook reads it there), and
 * the email channel must only ever be written by the webhook.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { readWatchScope, watchForm, WATCH_MONTHLY_CENTS } from "../api/create-checkout-session.js";

const SOLO = "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz";

describe("Issuer Watch checkout", () => {
  it("needs a real issuing account", () => {
    expect(readWatchScope({ issuer: "nope" }).error).toBeTruthy();
    expect(readWatchScope({ issuer: SOLO, label: "SOLO" })).toEqual({ issuer: SOLO, label: "SOLO" });
  });

  it("is $19 a month, with the issuer on the subscription", () => {
    const form = watchForm(readWatchScope({ issuer: SOLO, label: "SOLO" }), "https://www.noshashi.app");
    expect(WATCH_MONTHLY_CENTS).toBe(1900);
    expect(form.get("mode")).toBe("subscription");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("1900");
    expect(form.get("line_items[0][price_data][recurring][interval]")).toBe("month");
    expect(form.get("subscription_data[metadata][product]")).toBe("issuer_watch");
    expect(form.get("subscription_data[metadata][issuer]")).toBe(SOLO);
    expect(form.get("metadata[issuer]")).toBe(SOLO);
    expect(form.get("success_url")).toContain("/watch/subscribed/");
  });
});

describe("delivery", () => {
  const alerts = readFileSync("supabase/functions/noshashi-issuer-alerts/index.ts", "utf8");
  const webhook = readFileSync("supabase/functions/noshashi-stripe-webhook/index.ts", "utf8");

  it("the alerts function can send email, and the public subscribe route still cannot take an address", () => {
    expect(alerts).toMatch(/channel === "email" \? sendEmail\(target, text\)/);
    expect(alerts).toMatch(/async function subscribe\(db: Db, issuer: string, channel: "discord" \| "telegram"/);
  });

  it("the webhook records a paid watch and switches it off when the subscription stops", () => {
    expect(webhook).toMatch(/product === "issuer_watch"\) \{\s*await recordWatch\(session\)/);
    expect(webhook).toMatch(/subscription\.status === "active" \|\| subscription\.status === "trialing"/);
    expect(webhook).toMatch(/const WATCH_MONTHLY_CENTS = 1_900;/);
  });

  it("the migration allows email only alongside a Stripe subscription column", () => {
    const sql = readFileSync("supabase/migrations/20261119060000_issuer_watch_email.sql", "utf8");
    expect(sql).toContain("check (channel in ('discord', 'telegram', 'email'))");
    expect(sql).toContain("stripe_subscription_id");
  });
});

describe("the page", () => {
  it("is built, in the sitemap, and sells at the checkout price", () => {
    expect(existsSync("site/watch/index.html")).toBe(true);
    expect(existsSync("site/watch/subscribed/index.html")).toBe(true);
    expect(readFileSync("site/sitemap.xml", "utf8")).toContain("https://www.noshashi.app/watch/</loc>");
    expect(readFileSync("site/watch/index.html", "utf8")).toContain("$19 a month");
  });
});
