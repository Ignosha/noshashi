import { describe, it, expect, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/lib/xrpl/client", () => ({ rpc, XrplError: class extends Error {} }));
import { credentialsOf } from "../src/lib/compliance/registry.ts";

describe("complete credential reads for Continuity", () => {
  it("rejects a portfolio read that still has a continuation marker at the cap", async () => {
    rpc.mockReset().mockResolvedValue({ account_objects: [], marker: "more" });
    await expect(credentialsOf("account", "subject", 123)).rejects.toThrow("exceeded 4,000 objects");
    expect(rpc).toHaveBeenCalledTimes(10);
    expect(rpc.mock.calls.every(([, params]) => params.ledger_index === 123)).toBe(true);
  });
  it("accepts a final page at the cap", async () => {
    rpc.mockReset();
    for (let page = 0; page < 9; page++) rpc.mockResolvedValueOnce({ account_objects: [], marker: "more" });
    rpc.mockResolvedValueOnce({ account_objects: [] });
    await expect(credentialsOf("account", "subject", 123)).resolves.toEqual([]);
  });
});
