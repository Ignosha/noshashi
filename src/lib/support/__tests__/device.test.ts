import { describe, expect, it } from "vitest";
import { forThisDevice } from "../repair";
import type { RepairRequest } from "../repairCatalog";

const req = (id: string, deviceId: string | null): RepairRequest => ({
  id,
  ticketId: "t",
  action: "reconnect_ledger",
  note: null,
  status: "pending",
  result: null,
  requestedAt: "2026-10-23T00:00:00Z",
  decidedAt: null,
  deviceId,
  automatic: false,
});

describe("forThisDevice", () => {
  it("keeps requests for this computer and for any computer, and drops the rest", () => {
    const mine = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    const kept = forThisDevice([req("a", mine), req("b", null), req("c", other)], mine).map((r) => r.id);
    expect(kept).toEqual(["a", "b"]);
  });
});
