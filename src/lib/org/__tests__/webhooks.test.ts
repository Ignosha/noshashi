import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webhookUrlProblem, WEBHOOK_EVENTS } from "@/lib/org/webhooks";
import { verifyNoshashiSignature } from "@/lib/org/webhookSignature";

const root = resolve(import.meta.dirname, "../../../..");
const sql = readFileSync(resolve(root, "supabase/migrations/20260924010000_org_webhooks.sql"), "utf8");

describe("webhook addresses — the form explains what the server refuses", () => {
  // The refusals below were each confirmed against the live database function.
  for (const [url, ok] of [
    ["https://hooks.example.com/noshashi", true],
    ["https://hooks.example.com:8443/in?x=1", true],
    ["http://hooks.example.com/x", false],
    ["https://localhost/x", false],
    ["https://10.0.0.5/x", false],
    ["https://abc.supabase.co/functions/v1/x", false],
    ["https://intranet/x", false],
    ["https://svc.internal/x", false],
  ] as const) {
    it(`${url} → ${ok ? "allowed" : "refused"}`, () => {
      expect(webhookUrlProblem(url) === null).toBe(ok);
    });
  }

  it("the app's event list is exactly the server's", () => {
    const serverEvents = sql.match(/events <@ array\[([\s\S]*?)\]::text\[\]/)![1].match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1));
    expect(WEBHOOK_EVENTS.map((e) => e.id).sort()).toEqual([...serverEvents].sort());
  });
});

describe("webhook signatures — the reference verifier matches the server's signing", () => {
  const secret = "whsec_" + "ab".repeat(24);
  const body = JSON.stringify({ id: "d1", event: "ping", data: { message: "Test delivery from NOSHASHI." } });
  const t = 1790000000;
  // Exactly what noshashi.webhook_send computes: hmac(t || '.' || payload::text, secret, 'sha256'), hex.
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`, "utf8").digest("hex");

  it("the server signs '<t>.<body>' with the secret", () => {
    expect(sql).toContain("extensions.hmac(convert_to(ts || '.' || d.payload::text, 'UTF8'), convert_to(w.secret, 'UTF8'), 'sha256')");
    expect(sql).toContain("'X-Noshashi-Signature', 't=' || ts || ',v1=' || sig");
  });

  it("verifies a genuine delivery", async () => {
    expect(await verifyNoshashiSignature({ secret, header: `t=${t},v1=${v1}`, rawBody: body, nowSeconds: t + 10 })).toEqual({ ok: true });
  });

  it("rejects a changed body, a wrong secret, a stale timestamp and a malformed header", async () => {
    expect((await verifyNoshashiSignature({ secret, header: `t=${t},v1=${v1}`, rawBody: body.replace("ping", "pong"), nowSeconds: t })).ok).toBe(false);
    expect((await verifyNoshashiSignature({ secret: secret + "x", header: `t=${t},v1=${v1}`, rawBody: body, nowSeconds: t })).ok).toBe(false);
    expect(await verifyNoshashiSignature({ secret, header: `t=${t},v1=${v1}`, rawBody: body, nowSeconds: t + 3600 })).toEqual({ ok: false, reason: "timestamp outside tolerance" });
    expect(await verifyNoshashiSignature({ secret, header: "v1=zz", rawBody: body, nowSeconds: t })).toEqual({ ok: false, reason: "malformed signature header" });
  });
});

describe("webhook delivery — the rules the server enforces", () => {
  it("the secret is never granted to clients, and every write goes through owner/admin functions", () => {
    expect(sql).toMatch(/grant select \(id, organization_id, url, description, events, active, created_by, created_at, updated_at\)\s+on noshashi\.org_webhooks to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*org_webhooks to authenticated/);
    expect(sql).toContain("revoke execute on function noshashi.webhook_emit(uuid, text, jsonb, uuid) from public, anon, authenticated");
  });

  it("events come only from server records", () => {
    expect(sql).toContain("create trigger audit_log_webhooks after insert on noshashi.audit_log");
    expect(sql).toContain("create trigger verification_events_webhooks after insert on noshashi.verification_events");
  });

  it("retries stop after three attempts", () => {
    expect(sql).toMatch(/status = 'failed' and attempt < 3/);
  });
});
