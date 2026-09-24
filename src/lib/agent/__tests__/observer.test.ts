import { describe, it, expect } from "vitest";
import mainnet from "@/lib/desk/__tests__/fixtures/xrpl-mainnet-107193471.json";
import { certificateFrom, type AuthoritySurface } from "@/lib/desk/authority";
import { observe, observationPrompt, BALANCE_THRESHOLD, EXPIRY_WINDOW_MS, type WalletReading } from "../observer";
import { investigationPrompt } from "../investigate";

/*
 * The accounts are real mainnet accounts from the recorded fixture
 * (ledger 107193471): Bitstamp's issuing account, and the sender and
 * destination of the recorded DIP payment with DIP's issuer. The readings
 * are the shape readWallet produces; each test changes one fact between
 * two readings and checks the observer reports exactly that.
 */
const BITSTAMP = mainnet.account_info_bitstamp.account_data;
const WALLET = mainnet.tx_payment.Destination;
const DIP_ISSUER = mainnet.tx_payment.Amount.issuer;

const posture = (address: string, over: Record<string, unknown> = {}) => ({
  address,
  noFreeze: false,
  globalFreeze: false,
  requireAuth: false,
  masterDisabled: false,
  transferRateBps: 0,
  ...over,
});

const reading = (over: Partial<WalletReading> = {}): WalletReading => ({
  address: WALLET,
  readAt: "2026-09-24T10:00:00.000Z",
  funded: true,
  balanceXrp: 100,
  ownerCount: 2,
  lines: [{ issuer: DIP_ISSUER, currency: "DIP", balance: 287.022082836, frozenByIssuer: false, deepFrozenByIssuer: false }],
  credentials: [],
  issuers: { [DIP_ISSUER]: posture(DIP_ISSUER) },
  ...over,
});
const later = (over: Partial<WalletReading> = {}) => reading({ readAt: "2026-09-24T10:05:00.000Z", ...over });

describe("the observer reports what changed between two readings, and nothing else", () => {
  it("reports nothing when nothing changed", () => {
    expect(observe(reading(), later())).toEqual([]);
  });

  it("an issuer freezing a held line is critical, with the before and after in the evidence", () => {
    const [o] = observe(reading(), later({ lines: [{ ...reading().lines[0], frozenByIssuer: true }] }));
    expect(o).toMatchObject({ severity: "critical", kind: "line-frozen", address: WALLET });
    expect(o.evidence).toEqual({
      subject: `${DIP_ISSUER}.DIP`, field: "freeze_peer", from: "clear", to: "set",
      readBefore: "2026-09-24T10:00:00.000Z", readAfter: "2026-09-24T10:05:00.000Z",
    });
  });

  it("a deep freeze is reported as a deep freeze, not an ordinary one", () => {
    const obs = observe(reading(), later({ lines: [{ ...reading().lines[0], frozenByIssuer: true, deepFrozenByIssuer: true }] }));
    expect(obs.map((o) => o.kind)).toEqual(["line-deep-frozen"]);
  });

  it("balances: a fall past the threshold is a warning, a smaller move is silent", () => {
    const fall = 100 * (1 - BALANCE_THRESHOLD);
    expect(observe(reading(), later({ balanceXrp: fall })).map((o) => [o.kind, o.severity])).toEqual([["xrp-fell", "warn"]]);
    expect(observe(reading(), later({ balanceXrp: 95 }))).toEqual([]);
    const held = observe(reading(), later({ lines: [{ ...reading().lines[0], balance: 100 }] }));
    expect(held[0]).toMatchObject({ kind: "holding-fell", severity: "warn" });
    expect(held[0].detail).toMatch(/clawback/);
  });

  it("credentials: expiring is reported once, when it enters the week; expiry itself is critical", () => {
    const t1 = Date.parse("2026-09-24T10:05:00.000Z");
    const cred = (expiresAt: number) => [{ issuer: BITSTAMP.Account, type: "KYC", accepted: true, revoked: false, expiresAt }];
    const entering = t1 + EXPIRY_WINDOW_MS - 60_000; // inside the window now, outside it five minutes ago
    expect(observe(reading({ credentials: cred(entering) }), later({ credentials: cred(entering) })).map((o) => o.kind)).toEqual(["credential-expiring"]);
    const inside = t1 + 60 * 60_000; // already inside the window at both readings
    expect(observe(reading({ credentials: cred(inside) }), later({ credentials: cred(inside) }))).toEqual([]);
    const lapsing = t1 - 60_000; // expired between the readings
    expect(observe(reading({ credentials: cred(lapsing) }), later({ credentials: cred(lapsing) }))[0]).toMatchObject({ kind: "credential-expired", severity: "critical" });
  });

  it("issuer drift reuses the issuer watch's own transitions", () => {
    const obs = observe(reading(), later({ issuers: { [DIP_ISSUER]: posture(DIP_ISSUER, { globalFreeze: true }) } }));
    expect(obs[0]).toMatchObject({ kind: "issuer-drift", severity: "critical", evidence: { field: "lsfGlobalFreeze", from: "clear", to: "set" } });
  });

  it("an account that disappears is reported alone, since nothing else can be compared", () => {
    expect(observe(reading(), later({ funded: false, lines: [], balanceXrp: 0 })).map((o) => o.kind)).toEqual(["account-deleted"]);
  });

  it("the same change at the same reading has the same id, so a sweep never duplicates it", () => {
    const next = later({ balanceXrp: 50 });
    expect(observe(reading(), next)[0].id).toBe(observe(reading(), next)[0].id);
  });

  it("the agent is handed the observation and its evidence, and told to stay inside them", () => {
    const [o] = observe(reading(), later({ lines: [{ ...reading().lines[0], frozenByIssuer: true }] }));
    const prompt = observationPrompt(o);
    expect(prompt).toContain(`Wallet: ${WALLET}`);
    expect(prompt).toContain(`freeze_peer on ${DIP_ISSUER}.DIP went from "clear" to "set"`);
    expect(prompt).toMatch(/Use only these facts; say so if they are not enough\.$/);
  });
});

describe("one-click issuer investigation", () => {
  // Bitstamp as recorded at ledger 107193471: master key disabled, a regular
  // key set, no signer list, a 0.15% transfer fee, freeze not surrendered.
  const surface: AuthoritySurface = {
    issuer: BITSTAMP.Account,
    control: {
      address: BITSTAMP.Account,
      masterKeyEnabled: false,
      regularKey: BITSTAMP.RegularKey,
      signers: { present: false, quorum: 0, signers: [], totalWeight: 0, minimumSigners: 0, unilateralSigners: [] },
      ownerCount: BITSTAMP.OwnerCount,
      reserveLockedXrp: 0,
      reserveBaseXrp: 1,
      reserveIncrementXrp: 0.2,
      balanceXrp: Number(BITSTAMP.Balance) / 1e6,
      escrows: [],
      escrowedXrp: 0,
      truncated: false,
      ledgerIndex: mainnet.account_info_bitstamp.ledger_index,
      readAt: "2026-09-24T01:34:12.000Z",
    } as never,
    posture: posture(BITSTAMP.Account, { masterDisabled: true, transferRateBps: 15 }) as never,
    issuance: null,
    unreadable: [],
    ledgerIndex: mainnet.account_info_bitstamp.ledger_index,
    readAt: "2026-09-24T01:34:12.000Z",
  };

  it("carries the certificate's digest, ledger and every check, and says concentration was not walked", async () => {
    const certificate = await certificateFrom(surface);
    const prompt = investigationPrompt({
      issuer: BITSTAMP.Account,
      certificate,
      obligations: { issuer: BITSTAMP.Account, obligations: { USD: 1250.5, EUR: 10 }, ledgerIndex: surface.ledgerIndex },
    });
    expect(prompt).toContain(`ledger 107,193,471`);
    expect(prompt).toContain(certificate.digest);
    for (const check of certificate.checks) expect(prompt).toContain(check.label);
    // Bitstamp's regular key signs alone, and it kept the power to freeze.
    expect(prompt).toContain("FAIL · No single key controls the issuer");
    expect(prompt).toContain("REVIEW · Freeze permanently surrendered");
    expect(prompt).toContain("Outstanding obligations: 1,250.5 USD; 10 EUR.");
    expect(prompt).toMatch(/Supply concentration was not walked/);
    expect(prompt).toMatch(/Use only the facts above/);
  });
});
