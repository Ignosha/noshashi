import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearErrors, recentErrors, recordError, scrub } from "../errorLog";

// Shaped like the real thing, but not real: never paste a live secret here.
const FAKE_SEED = "s" + "X".repeat(28);
const FAKE_KEY = "ED" + "A".repeat(64);
const TX_HASH = "B".repeat(64);
const FAKE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJlLWZha2U";

describe("scrub", () => {
  it("removes anything that could be a credential", () => {
    const out = scrub(
      `seed ${FAKE_SEED} key ${FAKE_KEY} auth Bearer abcdefgh12345678 jwt ${FAKE_JWT} ` +
        `sb_secret_abcdefgh1234 sk_live_abcdefgh1234 nsh_abcdefgh1234 password=hunter22x mail me@example.com`
    );
    for (const secret of [FAKE_SEED, FAKE_KEY, "abcdefgh12345678", FAKE_JWT, "sb_secret_", "sk_live_", "nsh_abcdefgh", "hunter22x", "me@example.com"]) {
      expect(out).not.toContain(secret);
    }
  });

  it("keeps what makes a ledger bug reproducible", () => {
    const text = `tx ${TX_HASH} from rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh failed: tecUNFUNDED_PAYMENT`;
    expect(scrub(text)).toBe(text);
  });

  it("caps the length", () => {
    expect(scrub("x".repeat(5000), 100)).toHaveLength(101);
  });
});

describe("error log", () => {
  beforeEach(() => {
    // Tests run in Node; give the log the browser storage it expects.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    clearErrors();
  });

  it("stores errors scrubbed, newest last, and drops repeats", () => {
    recordError(new Error(`boom ${FAKE_SEED}`), "Scene");
    recordError(new Error(`boom ${FAKE_SEED}`), "Scene");
    const errors = recentErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("[seed removed]");
    expect(JSON.stringify(errors)).not.toContain(FAKE_SEED);
  });

  it("keeps only the last 25", () => {
    for (let i = 0; i < 40; i++) recordError(new Error(`error number ${i}`), "loop");
    const errors = recentErrors();
    expect(errors).toHaveLength(25);
    expect(errors[errors.length - 1]?.message).toContain("error number 39");
  });
});
