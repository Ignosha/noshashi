import { describe, it, expect } from "vitest";
import {
  authorityChecks as tsChecks,
  verdictFor as tsVerdict,
  certificateFrom as tsCertificate,
  type AuthoritySurface,
} from "../authority";
// The server-side mirror. Plain ESM JavaScript, so it imports into this
// suite directly — which is the whole point: the two implementations are
// compared by running them, not by matching their source text.
// @ts-expect-error — untyped JS module, imported deliberately.
import * as server from "../../../../api/_lib/authority.js";
import type { ControlSurface } from "../control";
import type { IssuanceReport, CurrencySurveillance } from "../issuance";

/**
 * The console and the public endpoint must answer identically.
 *
 * src/lib/desk/authority.ts reads the ledger over a WebSocket, because
 * the public rippled HTTP endpoints send no CORS headers and a webview
 * cannot POST to them. api/_lib/authority.js reads the same ledger over
 * HTTP, because a Vercel function has no socket worth holding and no
 * TypeScript build step. Neither can import the other, so the checks
 * are written twice.
 *
 * Twice-written rules drift, and the drift is invisible until someone
 * compares two certificates for the same issuer and finds different
 * digests — at which point the digest, the one thing that was supposed
 * to make a certificate checkable, is what is broken.
 *
 * Both copies are pure functions of a surface, so this test builds
 * surfaces and runs both. A single character's difference in a check id
 * or a flipped threshold changes the digest and fails here.
 */

const control = (over: Partial<ControlSurface> = {}): ControlSurface => ({
  address: "rIssuer",
  masterKeyEnabled: false,
  signers: {
    present: true,
    quorum: 3,
    signers: [
      { account: "rA", weight: 1 },
      { account: "rB", weight: 1 },
      { account: "rC", weight: 1 },
    ],
    totalWeight: 3,
    minimumSigners: 3,
    unilateralSigners: [],
  },
  ownerCount: 0,
  reserveLockedXrp: 0,
  reserveBaseXrp: 1,
  reserveIncrementXrp: 0.2,
  balanceXrp: 100,
  escrows: [],
  escrowedXrp: 0,
  truncated: false,
  ledgerIndex: 84_112_907,
  readAt: "2026-09-20T00:00:00.000Z",
  ...over,
});

const posture = (over: Record<string, unknown> = {}) =>
  ({
    address: "rIssuer",
    noFreeze: true,
    globalFreeze: false,
    requireAuth: false,
    masterDisabled: true,
    transferRateBps: 0,
    ...over,
  }) as AuthoritySurface["posture"];

const currency = (over: Partial<CurrencySurveillance> = {}): CurrencySurveillance => ({
  currency: "USD",
  outstanding: 1_000_000,
  observedHeld: 1_000_000,
  holders: 400,
  activeHolders: 380,
  hhi: 400,
  topHolderPct: 4,
  topFivePct: 12,
  frozenSeen: 0,
  authorizedSeen: 0,
  coverage: 1,
  top: [],
  ...over,
});

const issuance = (c: CurrencySurveillance[] = [currency()]): IssuanceReport => ({
  issuer: "rIssuer",
  currencies: c,
  linesWalked: 400,
  truncated: false,
  requiresAuth: false,
  canFreeze: false,
  globalFreeze: false,
  ledgerIndex: 84_112_907,
  readAt: "2026-09-20T00:00:00.000Z",
});

const surface = (over: Partial<AuthoritySurface> = {}): AuthoritySurface => ({
  issuer: "rIssuer",
  control: control(),
  posture: posture(),
  issuance: issuance(),
  unreadable: [],
  ledgerIndex: 84_112_907,
  readAt: "2026-09-20T00:00:00.000Z",
  ...over,
});

/**
 * One surface per branch the checks can take. A case added to
 * authority.ts without a case added here is a branch nothing compares.
 */
const CASES: Array<{ name: string; surface: AuthoritySurface }> = [
  { name: "clean issuance, freeze surrendered", surface: surface() },
  {
    name: "freeze retained",
    surface: surface({ posture: posture({ noFreeze: false }) }),
  },
  {
    name: "frozen right now",
    surface: surface({ posture: posture({ globalFreeze: true }) }),
  },
  {
    name: "holding requires authorisation",
    surface: surface({ posture: posture({ requireAuth: true }) }),
  },
  {
    name: "transfer fee charged",
    surface: surface({ posture: posture({ transferRateBps: 25 }) }),
  },
  {
    name: "one signer carries the quorum",
    surface: surface({
      control: control({
        signers: {
          present: true,
          quorum: 3,
          signers: [
            { account: "rBoss", weight: 3 },
            { account: "rA", weight: 1 },
          ],
          totalWeight: 4,
          minimumSigners: 1,
          unilateralSigners: ["rBoss"],
        },
      }),
    }),
  },
  {
    name: "master key enabled, no signer list",
    surface: surface({
      control: control({
        masterKeyEnabled: true,
        signers: {
          present: false, quorum: 0, signers: [],
          totalWeight: 0, minimumSigners: 0, unilateralSigners: [],
        },
      }),
    }),
  },
  {
    name: "regular key set, master disabled",
    surface: surface({
      control: control({
        masterKeyEnabled: false,
        regularKey: "rHotKeySigner",
        signers: {
          present: false, quorum: 0, signers: [],
          totalWeight: 0, minimumSigners: 0, unilateralSigners: [],
        },
      }),
    }),
  },
  {
    name: "regular key set, master also enabled",
    surface: surface({
      control: control({
        masterKeyEnabled: true,
        regularKey: "rHotKeySigner",
        signers: {
          present: false, quorum: 0, signers: [],
          totalWeight: 0, minimumSigners: 0, unilateralSigners: [],
        },
      }),
    }),
  },
  {
    name: "blackholed to ACCOUNT_ONE",
    surface: surface({
      control: control({
        masterKeyEnabled: false,
        regularKey: "rrrrrrrrrrrrrrrrrrrrBZbvji",
        signers: {
          present: false, quorum: 0, signers: [],
          totalWeight: 0, minimumSigners: 0, unilateralSigners: [],
        },
      }),
    }),
  },
  {
    name: "burn key but master still enabled",
    surface: surface({
      control: control({
        masterKeyEnabled: true,
        regularKey: "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
        signers: {
          present: false, quorum: 0, signers: [],
          totalWeight: 0, minimumSigners: 0, unilateralSigners: [],
        },
      }),
    }),
  },
  {
    name: "signer list unreadable",
    surface: surface({
      control: control({
        masterKeyEnabled: false,
        signers: {
          present: false, unreadable: "connect ETIMEDOUT", quorum: 0, signers: [],
          totalWeight: 0, minimumSigners: 0, unilateralSigners: [],
        },
      }),
    }),
  },
  {
    name: "account cannot be signed for at all",
    surface: surface({
      control: control({
        masterKeyEnabled: false,
        signers: {
          present: false, quorum: 0, signers: [],
          totalWeight: 0, minimumSigners: 0, unilateralSigners: [],
        },
      }),
    }),
  },
  { name: "supply not walked", surface: surface({ issuance: null }) },
  {
    name: "supply walk failed",
    surface: surface({ issuance: null, unreadable: ["issuance: rippled replied 503"] }),
  },
  { name: "no outstanding obligations", surface: surface({ issuance: issuance([]) }) },
  {
    name: "coverage below the floor",
    surface: surface({ issuance: issuance([currency({ coverage: 0.41, observedHeld: 410_000 })]) }),
  },
  {
    name: "indexer-sourced distribution",
    surface: surface({
      issuance: {
        ...issuance([currency({ hhi: 702, holders: 67_339, topHolderPct: 14.1 })]),
        source: "indexer",
        sourceName: "xrpscan.com",
      },
    }),
  },
  {
    name: "indexer-sourced and concentrated",
    surface: surface({
      issuance: {
        ...issuance([currency({ hhi: 7400, topHolderPct: 81.2 })]),
        source: "indexer",
        sourceName: "xrpscan.com",
      },
    }),
  },
  {
    name: "supply concentrated",
    surface: surface({
      issuance: issuance([currency({ hhi: 7400, holders: 3, topHolderPct: 81.2, topFivePct: 100 })]),
    }),
  },
  {
    name: "exactly at the concentration threshold",
    surface: surface({ issuance: issuance([currency({ hhi: 2500 })]) }),
  },
  {
    name: "exactly at the coverage floor",
    surface: surface({ issuance: issuance([currency({ coverage: 0.95 })]) }),
  },
  {
    name: "control unreadable",
    surface: surface({ control: null, unreadable: ["control: actNotFound"] }),
  },
  {
    name: "posture unreadable in band",
    surface: surface({ posture: posture({ unreadable: "connect ETIMEDOUT" }) }),
  },
  {
    name: "a 160-bit hex currency code",
    // RLUSD as the ledger actually carries it. Live mainnet printed
    // this straight to the page before it was decoded.
    surface: surface({
      issuance: issuance([
        currency({ currency: "524C555344000000000000000000000000000000", hhi: 300 }),
      ]),
    }),
  },
  {
    name: "a hex code that does not decode to text",
    surface: surface({
      issuance: issuance([currency({ currency: "0158415500000000C1F76FF6ECB0BAC600000000", hhi: 300 })]),
    }),
  },
  {
    name: "several currencies, largest wins",
    surface: surface({
      issuance: issuance([
        currency({ currency: "EUR", outstanding: 10_000, hhi: 9000 }),
        currency({ currency: "USD", outstanding: 4_000_000, hhi: 300 }),
      ]),
    }),
  },
];

describe("console and endpoint agree, check for check", () => {
  for (const testCase of CASES) {
    it(`${testCase.name}: identical findings`, () => {
      // Compared whole rather than field by field. A detail string is
      // not cosmetic here — it is what a reader is given as the reason,
      // and two readers given different reasons for the same ledger is
      // the failure this guards.
      expect(server.authorityChecks(testCase.surface)).toEqual(tsChecks(testCase.surface));
    });

    it(`${testCase.name}: identical verdict`, () => {
      const checks = tsChecks(testCase.surface);
      expect(server.verdictFor(checks)).toBe(tsVerdict(checks));
    });

    it(`${testCase.name}: identical digest`, async () => {
      const [ours, theirs] = await Promise.all([
        tsCertificate(testCase.surface),
        server.certificateFrom(testCase.surface),
      ]);
      expect(theirs.digest).toBe(ours.digest);
      expect(theirs.verdict).toBe(ours.verdict);
      expect(theirs.currency).toBe(ours.currency);
      expect(theirs.currencyLabel).toBe(ours.currencyLabel);
      expect(theirs.ledgerIndex).toBe(ours.ledgerIndex);
      // Published as well as digested: a verifier recomputes from the
      // body, so the two runtimes must agree on what they emit, not
      // only on what they hash.
      expect(theirs.source).toBe(ours.source);
    });
  }

  it("covers every check the console can emit", () => {
    // Guards the case list itself. If authority.ts grows a check that no
    // surface above triggers, the comparisons still pass while saying
    // nothing about it.
    const emitted = new Set(CASES.flatMap((c) => tsChecks(c.surface)).map((c) => c.id));
    expect([...emitted].sort()).toEqual([
      "AUTHORITY_READABLE",
      "FREEZE_SURRENDERED",
      "NOT_GLOBALLY_FROZEN",
      "NO_TRANSFER_FEE",
      "NO_UNILATERAL_SIGNER",
      "OPEN_HOLDING",
      "SUPPLY_CONCENTRATION",
    ]);
  });
});

/**
 * The greedy quorum walk is the one piece of real arithmetic that is
 * duplicated, and it is where a mirror is most likely to be written
 * "close enough". Exercised directly against the original.
 */
describe("minimum signers agrees with the console", async () => {
  const { minimumSignersForQuorum } = await import("../control");

  const lists = [
    { signers: [{ account: "a", weight: 3 }, { account: "b", weight: 1 }, { account: "c", weight: 1 }], quorum: 3 },
    { signers: [{ account: "a", weight: 1 }, { account: "b", weight: 1 }, { account: "c", weight: 1 }], quorum: 3 },
    { signers: [{ account: "a", weight: 2 }, { account: "b", weight: 2 }], quorum: 3 },
    { signers: [{ account: "a", weight: 1 }], quorum: 5 },
    { signers: [], quorum: 1 },
    { signers: [{ account: "a", weight: 5 }], quorum: 0 },
  ];

  for (const [index, list] of lists.entries()) {
    it(`case ${index + 1}`, () => {
      expect(server.minimumSignersForQuorum(list.signers, list.quorum)).toBe(
        minimumSignersForQuorum(list.signers, list.quorum)
      );
    });
  }
});
