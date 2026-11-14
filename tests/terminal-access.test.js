import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  handle,
  sha256,
  canonicalJSON,
} from "../supabase/functions/noshashi-terminal/handler.ts";
import { terminalFeatures } from "../supabase/functions/_shared/terminalPlans.ts";
import { readEvidence } from "../supabase/functions/noshashi-terminal/reader.ts";
const account = "a0000000-0000-0000-0000-000000000001",
  org = "a0000000-0000-0000-0000-000000000002",
  key = "a0000000-0000-0000-0000-000000000003";
const input = { mode: "payment", hash: "A".repeat(64) };
let deps;
const report = () => ({
  schema: "noshashi.cloud-terminal.v1",
  network: "XRPL Mainnet",
  status: "VERIFIED",
  validated: true,
  subject: input,
  retrieved_at: new Date().toISOString(),
});
const req = (
  path = "access",
  method = "GET",
  body,
  headers = { Authorization: "Bearer valid" },
) =>
  new Request(
    "https://example.invalid/functions/v1/noshashi-terminal/" + path,
    {
      method,
      headers: {
        ...headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
beforeEach(() => {
  deps = {
    user: vi.fn(async () => ({ id: account, mfaRequired: false })),
    rpc: vi.fn(async (args) => ({
      data:
        args.p_action === "access"
          ? {
              account_id: account,
              tier: "desk",
              organization_id: null,
              role: null,
            }
          : null,
      error: null,
    })),
    organizations: vi.fn(async () => ({ data: [], error: null })),
    readEvidence: vi.fn(async () => report()),
  };
});
describe("private terminal trust boundary", () => {
  it("requires authenticated identity and MFA before accessing storage", async () => {
    expect((await handle(req("access", "GET", null, {}), deps)).status).toBe(
      401,
    );
    deps.user.mockResolvedValueOnce(null);
    expect((await handle(req(), deps)).status).toBe(401);
    deps.user.mockResolvedValueOnce({ id: account, mfaRequired: true });
    expect((await handle(req(), deps)).status).toBe(403);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("passes verified identity only and refuses client accounts or tiers", async () => {
    for (const path of [
      "access?tier=institution",
      "access?account_id=" + org,
      "access?organization_id=" + org + "&organization_id=" + org,
      "access?organization_id=bad",
    ])
      expect((await handle(req(path), deps)).status).toBe(400);
    for (const field of [
      "tier",
      "account_id",
      "report",
      "source",
      "endpoint",
      "organization_id",
    ])
      expect(
        (
          await handle(
            req(
              "cases",
              "POST",
              { ...input, [field]: "institution" },
              { Authorization: "Bearer valid", "Idempotency-Key": key },
            ),
            deps,
          )
        ).status,
      ).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
    await handle(req("access?organization_id=" + org), deps);
    expect(deps.rpc).toHaveBeenCalledWith({
      p_account: account,
      p_action: "access",
      p_org: org,
    });
  });
  it("refuses paid operations before public-node reads when the SQL guard denies them", async () => {
    deps.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect(
      (
        await handle(
          req("cases", "POST", input, {
            Authorization: "Bearer valid",
            "Idempotency-Key": key,
          }),
          deps,
        )
      ).status,
    ).toBe(403);
    expect(deps.readEvidence).not.toHaveBeenCalled();
  });
  it("saves server-fetched evidence and rechecks scope in SQL after the reading", async () => {
    const res = await handle(
      req("cases?organization_id=" + org, "POST", input, {
        Authorization: "Bearer valid",
        "Idempotency-Key": key,
      }),
      deps,
    );
    expect(res.status).toBe(201);
    expect(deps.rpc.mock.calls.map((c) => c[0].p_action)).toEqual([
      "lookup",
      "save",
    ]);
    const save = deps.rpc.mock.calls[1][0];
    expect(save).toMatchObject({
      p_account: account,
      p_org: org,
      p_request: key,
      p_report: { subject: input },
    });
    expect(save.p_digest).toBe(await sha256(canonicalJSON(save.p_report)));
  });
  it("does not make another node read after idempotent replay", async () => {
    deps.rpc.mockResolvedValue({
      data: { id: key, replayed: true },
      error: null,
    });
    const res = await handle(
      req("cases", "POST", input, {
        Authorization: "Bearer valid",
        "Idempotency-Key": key,
      }),
      deps,
    );
    expect((await res.json()).replayed).toBe(true);
    expect(deps.readEvidence).not.toHaveBeenCalled();
  });
  it("rejects invalid identifiers, missing request keys and oversized input", async () => {
    expect((await handle(req("cases", "POST", input), deps)).status).toBe(400);
    expect(
      (
        await handle(
          req(
            "cases",
            "POST",
            { ...input, hash: "bad" },
            { Authorization: "Bearer valid", "Idempotency-Key": key },
          ),
          deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (await handle(req("cases", "POST", { mode: "x".repeat(3000) }), deps))
        .status,
    ).toBe(413);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("does not save partial, stale, wrong-subject or unavailable evidence", async () => {
    for (const change of [
      { status: "PARTIAL" },
      { validated: false },
      { subject: { ...input, hash: "B".repeat(64) } },
      { retrieved_at: "bad" },
      { retrieved_at: "2000-01-01" },
    ]) {
      deps.readEvidence.mockResolvedValueOnce({ ...report(), ...change });
      expect(
        (
          await handle(
            req("cases", "POST", input, {
              Authorization: "Bearer valid",
              "Idempotency-Key": key,
            }),
            deps,
          )
        ).status,
      ).toBe(503);
    }
    expect(deps.rpc.mock.calls.every((c) => c[0].p_action === "lookup")).toBe(
      true,
    );
  });
  it("does not save after a downgrade during a node read", async () => {
    deps.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect(
      (
        await handle(
          req("cases", "POST", input, {
            Authorization: "Bearer valid",
            "Idempotency-Key": key,
          }),
          deps,
        )
      ).status,
    ).toBe(403);
  });
  it("preserves safe errors, ownership denials, conflict and capacity limits", async () => {
    for (const [code, status] of [
      ["P0002", 404],
      ["23505", 409],
      ["54000", 429],
      ["XXsecret", 503],
    ]) {
      deps.rpc.mockResolvedValueOnce({
        data: null,
        error: { code, message: "private credential" },
      });
      const response = await handle(req("cases/" + key), deps);
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("credential");
    }
  });
  it("only lists caller memberships and enforces an explicit grammar", async () => {
    await handle(req("organizations"), deps);
    expect(deps.organizations).toHaveBeenCalledWith(account);
    expect((await handle(req("shell", "POST", {}), deps)).status).toBe(404);
    expect(
      (
        await handle(
          new Request("https://x/noshashi-terminal/access", {
            method: "OPTIONS",
          }),
          deps,
        )
      ).status,
    ).toBe(204);
  });
  it("verifies saved case integrity after JSONB key reordering", async () => {
    const stored = { b: 2, a: 1 };
    deps.rpc.mockResolvedValueOnce({
      data: {
        report: { a: 1, b: 2 },
        sha256: await sha256(canonicalJSON(stored)),
      },
      error: null,
    });
    expect((await handle(req("cases/" + key), deps)).status).toBe(200);
    deps.rpc.mockResolvedValueOnce({
      data: { report: stored, sha256: "bad" },
      error: null,
    });
    expect((await handle(req("cases/" + key), deps)).status).toBe(503);
  });
  it("maps Pro below Institutional and retains role restrictions", () => {
    const base = {
      account_id: account,
      tier: "desk",
      organization_id: null,
      role: null,
    };
    expect(terminalFeatures(base)).toMatchObject({
      personal_cases: true,
      team_cases: false,
      team_write: false,
    });
    expect(terminalFeatures({ ...base, organization_id: org })).toMatchObject({
      personal_cases: false,
      team_cases: false,
    });
    expect(
      terminalFeatures({
        ...base,
        tier: "institution",
        organization_id: org,
        role: "viewer",
      }),
    ).toMatchObject({ team_cases: true, team_write: false });
    expect(
      terminalFeatures({
        ...base,
        tier: "institution",
        organization_id: org,
        role: "analyst",
      }).team_write,
    ).toBe(true);
  });
  it("hashes canonical JSON independent of JSONB key order", async () => {
    expect(await sha256(canonicalJSON({ b: 2, a: { z: 1, x: 2 } }))).toBe(
      await sha256(canonicalJSON({ a: { x: 2, z: 1 }, b: 2 })),
    );
  });
});
describe("private evidence reader", () => {
  it("pins issuer follow-up to its validated ledger and preserves source methods", async () => {
    const issuer = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
    const fetcher = vi.fn(async (_, options) => {
      const { method } = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          result:
            method === "account_info"
              ? {
                  validated: true,
                  ledger_index: 123,
                  account_data: { Account: issuer, Flags: 0 },
                  signer_lists: [],
                }
              : {
                  validated: true,
                  ledger_index: 123,
                  ledger: {
                    ledger_index: "123",
                    close_time: Math.floor(Date.now() / 1000) - 946684800,
                  },
                },
        }),
      );
    });
    const r = await readEvidence(
      { mode: "issuer", issuer, currency: "USD" },
      fetcher,
    );
    expect(r.status).toBe("VERIFIED");
    expect(
      JSON.parse(fetcher.mock.calls[1][1].body).params[0].ledger_index,
    ).toBe(123);
  });

  it("uses fixed public endpoints and rejects unvalidated results", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            result: {
              hash: input.hash,
              validated: false,
              TransactionType: "Payment",
            },
          }),
        ),
    );
    await expect(readEvidence(input, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.every(([url]) =>
        ["https://xrplcluster.com", "https://s1.ripple.com:51234"].includes(
          url,
        ),
      ),
    ).toBe(true);
  });
});
