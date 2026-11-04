import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonical } from "@/lib/compliance/registry";
import type { TreasuryPreflight } from "../treasuryPreflight";
const { rpc, abortSignal } = vi.hoisted(() => ({
  rpc: vi.fn(),
  abortSignal: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: () => ({ schema: () => ({ rpc }) }),
}));
import {
  listTreasuryReviews,
  requestTreasuryReview,
  decideTreasuryReview,
  type TreasuryReviewRecord,
} from "../treasuryReviews";
const org = "00000000-0000-4000-8000-000000000001";
const proposal = {
  TransactionType: "Payment",
  Account: "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX",
  Destination: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
  Amount: "100",
  Fee: "12",
  Sequence: 1,
  LastLedgerSequence: 120,
};
const hash = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
async function record(): Promise<TreasuryReviewRecord> {
  const text = canonical(proposal);
  return {
    id: org,
    organization_id: org,
    requested_by: "requester",
    proposal_text: text,
    proposal_hash: await hash(text),
    proposal,
    policy: {},
    evidence: {},
    status: "pending",
    effective_status: "pending",
    expires_at: new Date(Date.now() + 600000).toISOString(),
    requested_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockReturnValue({ abortSignal });
});
describe("exact organization review receipts", () => {
  it("verifies the server’s raw UTF-8 proposal hash and semantic payload", async () => {
    const r = await record();
    abortSignal.mockResolvedValue({ data: { ok: true, records: [r] } });
    expect(await listTreasuryReviews(org)).toEqual([r]);
    abortSignal.mockResolvedValue({
      data: {
        ok: true,
        records: [{ ...r, proposal: { ...proposal, Amount: "999" } }],
      },
    });
    await expect(listTreasuryReviews(org)).rejects.toThrow("verification");
  });
  it("does not turn unavailable history into an empty approved queue", async () => {
    abortSignal.mockResolvedValue({ error: { message: "not installed" } });
    await expect(listTreasuryReviews(org)).rejects.toThrow("migration");
  });
  it("requires exact review confirmation and rejects expiry before any write", async () => {
    const r = await record();
    await expect(
      decideTreasuryReview(r, "approved", "Reviewed complete evidence", false),
    ).rejects.toThrow("Inspect");
    await expect(
      decideTreasuryReview(
        { ...r, expires_at: "2000-01-01T00:00:00Z" },
        "approved",
        "Reviewed complete evidence",
        true,
      ),
    ).rejects.toThrow("expired");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("retains server MFA and role refusals without claiming approval", async () => {
    const r = await record();
    abortSignal.mockResolvedValue({
      data: { ok: false, code: "MFA_REQUIRED" },
    });
    await expect(
      decideTreasuryReview(r, "approved", "Reviewed complete evidence", true),
    ).rejects.toThrow("MFA_REQUIRED");
  });
  it("refuses stale or oversized preflight instead of silently omitting evidence", async () => {
    const p = {
      observedAt: "invalid",
      proposal,
      policy: {},
    } as unknown as TreasuryPreflight;
    await expect(requestTreasuryReview(org, org, p)).rejects.toThrow("stale");
    await expect(
      requestTreasuryReview(org, org, {
        ...p,
        observedAt: new Date().toISOString(),
        extra: "x".repeat(66000),
      } as any),
    ).rejects.toThrow("64 KiB");
    expect(rpc).not.toHaveBeenCalled();
  });
});
