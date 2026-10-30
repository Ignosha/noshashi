import { describe, expect, it } from "vitest";
import { isValidClassicAddress } from "ripple-address-codec";
import { SAMPLE_ADDRESSES } from "@/lib/samples";

describe("test addresses", () => {
  it("every one is a checksummed classic address", () => {
    for (const sample of SAMPLE_ADDRESSES) {
      expect(isValidClassicAddress(sample.address), sample.label).toBe(true);
    }
  });

  it("no address is listed twice", () => {
    const addresses = SAMPLE_ADDRESSES.map((s) => s.address);
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  it("the Testnet entry opens the screen that has a Testnet switch", () => {
    // The palette hands mainnet addresses over; a Testnet one is copied only,
    // so it has to land where the tester can point the read at Testnet.
    const testnet = SAMPLE_ADDRESSES.filter((s) => s.network === "testnet");
    expect(testnet.map((s) => s.scene)).toEqual(["settlement"]);
  });
});
