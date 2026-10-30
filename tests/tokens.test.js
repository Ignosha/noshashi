import { describe, expect, it } from "vitest";
import { isValidClassicAddress } from "ripple-address-codec";
import { loadTokens, slugFor } from "../scripts/build-tokens.mjs";

describe("token directory", () => {
  it("every issuer is a checksummed classic address", async () => {
    const { tokens } = await loadTokens();
    for (const t of tokens) expect(isValidClassicAddress(t.issuer), t.name).toBe(true);
  });

  it("every page has its own slug, safe in a URL", async () => {
    const { tokens } = await loadTokens();
    const slugs = tokens.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("no token is listed twice", async () => {
    const { tokens } = await loadTokens();
    const keys = tokens.map((t) => `${t.issuer}/${t.currency}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("a slug clash falls back to the issuer", () => {
    const t = { name: "USD", by: "GateHub", issuer: "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq" };
    expect(slugFor(t)).toBe("usd-gatehub");
    expect(slugFor(t, new Set(["usd-gatehub"]))).toBe("usd-gatehub-hub8vr");
  });
});
