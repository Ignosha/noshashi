import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, abortSignal } = vi.hoisted(() => ({
  rpc: vi.fn(),
  abortSignal: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: () => ({ schema: () => ({ rpc }) }),
}));
import {
  networkLookup,
  prepareSharedReport,
  sharePreparedReport,
} from "../threatNetwork";
const address = "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX";
const report = {
  organization: "00000000-0000-4000-8000-0000000000d4",
  address,
  category: "phishing" as const,
  evidence: ["a".repeat(64)],
  note: "Public incident evidence, pending review",
  sources: ["https://example.com/evidence"],
};
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockReturnValue({ abortSignal });
});
describe("reviewed sharing boundaries", () => {
  it("prepares exact data locally and never submits without consent", async () => {
    expect((await prepareSharedReport(report)).evidence).toEqual([
      "A".repeat(64),
    ]);
    expect(rpc).not.toHaveBeenCalled();
    await expect(sharePreparedReport(report, false)).rejects.toThrow(
      "explicitly",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("fails closed for missing setup, refusals and uncertain write receipts", async () => {
    abortSignal.mockResolvedValueOnce({
      error: { message: "missing migration" },
    });
    await expect(networkLookup([address])).rejects.toThrow("migration");
    abortSignal.mockResolvedValueOnce({
      data: { ok: false, code: "PARTICIPANT_REVIEW_REQUIRED" },
    });
    await expect(sharePreparedReport(report, true)).rejects.toThrow(
      "PARTICIPANT",
    );
    abortSignal.mockResolvedValueOnce({ data: { ok: true } });
    await expect(sharePreparedReport(report, true)).rejects.toThrow("receipt");
  });
  it("returns submitted report ID only after backend confirmation", async () => {
    abortSignal.mockResolvedValueOnce({
      data: { ok: true, id: report.organization },
    });
    expect((await sharePreparedReport(report, true)).id).toBe(
      report.organization,
    );
    expect(rpc).toHaveBeenCalledWith(
      "security_share_threat",
      expect.objectContaining({
        p_note: report.note,
        p_evidence: ["A".repeat(64)],
        p_sources: report.sources,
      }),
    );
  });
  it("rejects expired, unrequested and incomplete indicator data", async () => {
    const valid = {
      id: report.organization,
      address,
      category: "phishing",
      confidence: "staff_reviewed_indicator",
      evidence: ["A".repeat(64)],
      sources: report.sources,
      reviewedAt: "2026-11-03T00:00:00Z",
      expiresAt: "2026-12-01T00:00:00Z",
    };
    for (const change of [
      { expiresAt: "2026-10-01" },
      { address: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" },
      { sources: [] },
      { evidence: [] },
      { reviewedAt: "2027-01-01" },
    ]) {
      abortSignal.mockResolvedValueOnce({
        data: {
          ok: true,
          evaluatedAt: "2026-11-04T00:00:00Z",
          reports: [{ ...valid, ...change }],
        },
      });
      await expect(networkLookup([address])).rejects.toThrow("Incomplete");
    }
  });
  it("empty lookup is a snapshot, never a clearance", async () => {
    abortSignal.mockResolvedValueOnce({
      data: {
        ok: true,
        evaluatedAt: "2026-11-04T00:00:00Z",
        reports: [],
        limitation: "Indicators, not adjudication",
      },
    });
    expect((await networkLookup([address])).reports).toEqual([]);
    await expect(networkLookup([])).rejects.toThrow("1–50");
  });
});
