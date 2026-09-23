import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { policyHash, type PolicyParams } from "@/lib/desk/institutional";
import type { LedgerEntry } from "@/lib/desk/ledger";
import {
  ACTIVATION_FAILED,
  can,
  evidenceOf,
  readGovernedResponse,
  verifiedActive,
  type MemberRole,
  type OrgPolicy,
} from "@/lib/org/governance";

const root = resolve(import.meta.dirname, "../../../..");

const params: PolicyParams = {
  hhiLimit: 2500,
  counterpartyShareLimitPct: 40,
  travelRule: { thresholdFiat: 1000, currency: "USD", xrpReferenceRate: 0.52 },
  reserveHeadroomMinXrp: 20,
  strictFreeze: true,
  outcomes: { hhi: "review", counterparty: "review", travelRule: "review", reserve: "fail", freeze: "fail" },
};

async function row(over: Partial<OrgPolicy> = {}): Promise<OrgPolicy> {
  const base = { id: "policy_settlement", name: "Institutional Settlement", version: 5, params };
  const p = { ...base, ...over };
  return {
    organizationId: "00000000-0000-4000-8000-000000000001",
    status: "active",
    engine: "1",
    createdBy: "author",
    createdAt: "2026-09-23T10:00:00Z",
    updatedAt: "2026-09-23T10:00:00Z",
    submittedBy: "author",
    submittedAt: "2026-09-23T10:05:00Z",
    activatedBy: "activator",
    effectiveAt: "2026-09-23T11:00:00Z",
    archivedAt: null,
    hash: await policyHash(p),
    ...p,
    ...over,
  } as OrgPolicy;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("the role table, as the app explains it (the server enforces it)", () => {
  const table: Record<string, [boolean, boolean, boolean, boolean]> = {
    //           edit   simulate activate approveException
    owner:      [true,  true,    true,    true],
    admin:      [true,  true,    true,    true],
    compliance: [true,  true,    true,    true],
    analyst:    [true,  true,    false,   false],
    viewer:     [false, false,   false,   false],
  };
  for (const [role, [edit, sim, act, appr]] of Object.entries(table)) {
    it(role, () => {
      const r = role as MemberRole;
      expect([can.editDraft(r), can.simulate(r), can.activate(r), can.approveException(r)]).toEqual([edit, sim, act, appr]);
    });
  }
  it("no role, no action", () => {
    expect(can.activate(null) || can.editDraft(null) || can.approveException(null)).toBe(false);
  });

  it("matches the roles the database grants (migration text)", () => {
    const sql = readFileSync(resolve(root, "supabase/migrations/20260923210000_governance_policies_exceptions.sql"), "utf8");
    // Activation and approval: owner, admin, compliance — in the RPCs and in both guard triggers.
    expect(sql.match(/m\.role in \('owner', 'admin', 'compliance'\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).not.toMatch(/m\.role in \([^)]*'analyst'/);
    expect(sql).not.toMatch(/m\.role in \([^)]*'viewer'/);
  });
});

describe("a server answer is success only when the server says so", () => {
  it("ok: true in a 2xx body is success", async () => {
    const r = await readGovernedResponse(json(200, { ok: true, status: "active", version: 6 }), ACTIVATION_FAILED);
    expect(r).toMatchObject({ ok: true, status: "active", version: 6 });
  });

  it("a refusal is shown in the server's words", async () => {
    const r = await readGovernedResponse(
      json(403, {
        ok: false,
        code: "FOUR_EYES_REQUIRED",
        title: "FOUR-EYES APPROVAL REQUIRED",
        message: "The policy author cannot activate this policy. A second authorized user must activate it.",
      }),
      ACTIVATION_FAILED
    );
    expect(r).toEqual({
      ok: false,
      code: "FOUR_EYES_REQUIRED",
      title: "FOUR-EYES APPROVAL REQUIRED",
      message: "The policy author cannot activate this policy. A second authorized user must activate it.",
      errors: undefined,
    });
  });

  it("validation errors are carried through", async () => {
    const r = await readGovernedResponse(
      json(422, { ok: false, code: "VALIDATION_FAILED", title: "POLICY VALIDATION FAILED", message: "x", errors: [{ field: "hhiLimit", message: "bad" }] }),
      ACTIVATION_FAILED
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual([{ field: "hhiLimit", message: "bad" }]);
  });

  for (const [name, response] of [
    ["no response (network down)", null],
    ["non-JSON body", new Response("<html>502</html>", { status: 502 })],
    ["2xx without ok", json(200, { status: "active" })],
    ["ok: true on a 500", json(500, { ok: true })],
    ["ok: 'true' as a string", json(200, { ok: "true" })],
    ["a gateway error body", json(401, { msg: "Invalid JWT" })],
  ] as const) {
    it(`${name} → ACTIVATION FAILED, never success`, async () => {
      const r = await readGovernedResponse(response, ACTIVATION_FAILED);
      expect(r).toEqual(ACTIVATION_FAILED);
    });
  }

  it("the fallback wording is exactly as specified", () => {
    expect(ACTIVATION_FAILED.title).toBe("ACTIVATION FAILED");
    expect(ACTIVATION_FAILED.message).toBe("The policy was not activated. No changes were committed.");
  });
});

describe("the activation function uses the specified error wording", () => {
  const src = readFileSync(resolve(root, "supabase/functions/noshashi-policy-activate/index.ts"), "utf8");
  const pairs: Array<[string, string, string]> = [
    ["INSUFFICIENT_PERMISSIONS", "AUTHORIZATION REQUIRED", "Your role cannot activate policies."],
    ["FOUR_EYES_REQUIRED", "FOUR-EYES APPROVAL REQUIRED", "The policy author cannot activate this policy. A second authorized user must activate it."],
    ["ALREADY_ACTIVE", "POLICY ALREADY ACTIVE", "This policy version has already been activated."],
    ["VALIDATION_FAILED", "POLICY VALIDATION FAILED", "The policy could not be activated because one or more parameters are invalid."],
  ];
  for (const [code, title, message] of pairs) {
    it(code, () => {
      const block = src.slice(src.indexOf(`${code}:`), src.indexOf("}", src.indexOf(`${code}:`)) + 1);
      expect(block).toContain(`title: "${title}"`);
      expect(block).toContain(`message: "${message}"`);
    });
  }
  it("server failure", () => {
    expect(src).toContain('title: "ACTIVATION FAILED", message: "The policy was not activated. No changes were committed."');
  });
});

describe("the gate uses an organization policy only when its hash verifies", () => {
  it("a verified active version is returned as the governing policy", async () => {
    const r = await verifiedActive([await row(), await row({ version: 4, status: "archived" })]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.policy?.version).toBe(5);
      expect(r.policy?.status).toBe("active");
      expect(r.policy?.activatedBy).toBe("activator");
    }
  });

  it("no active version → no policy, and that is not an error", async () => {
    expect(await verifiedActive([await row({ status: "pending", activatedBy: null, effectiveAt: null })])).toEqual({ ok: true, policy: null });
  });

  it("parameters that do not match the approved hash → UNAVAILABLE", async () => {
    const good = await row();
    const r = await verifiedActive([{ ...good, params: { ...params, hhiLimit: 9000 } }]);
    expect(r.ok).toBe(false);
  });

  it("two active versions → UNAVAILABLE", async () => {
    const r = await verifiedActive([await row(), await row({ id: "other_policy" })]);
    expect(r.ok).toBe(false);
  });

  it("a different engine version → UNAVAILABLE", async () => {
    const r = await verifiedActive([await row({ engine: "2" })]);
    expect(r.ok).toBe(false);
  });
});

describe("exception evidence is the verdict as recorded", () => {
  it("carries the receipt, the failed rules and the exact policy version", () => {
    const entry = {
      id: "e1",
      subject: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
      domainCode: "SETL",
      verdict: "hold",
      digest: "A".repeat(64),
      amountXrp: 25_000,
      failedRules: ["POLICY_HHI_LIMIT"],
      checksPassed: 7,
      checksTotal: 8,
      latencyMs: 3,
      at: "2026-09-23T12:00:00Z",
      offline: false,
      policy: { id: "policy_settlement", name: "Institutional Settlement", version: 5, hash: "B".repeat(64), engine: "1" },
      policyResults: [
        { key: "hhi", id: "POLICY_HHI_LIMIT", label: "HHI", state: "REVIEW", observed: "5000", configured: "2500", delta: "2500", reason: "above", calculation: "sum of squares" },
      ],
    } as unknown as LedgerEntry;
    expect(evidenceOf(entry)).toEqual({
      receiptDigest: "A".repeat(64),
      verdict: "hold",
      domainCode: "SETL",
      amountXrp: 25_000,
      decidedAt: "2026-09-23T12:00:00Z",
      failedRules: ["POLICY_HHI_LIMIT"],
      policy: { id: "policy_settlement", name: "Institutional Settlement", version: 5, hash: "B".repeat(64), engine: "1" },
      policyResults: [{ id: "POLICY_HHI_LIMIT", state: "REVIEW", observed: "5000", configured: "2500", reason: "above" }],
    });
  });
});
