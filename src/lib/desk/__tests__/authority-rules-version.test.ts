import { describe, expect, it } from "vitest";
import { authorityChecks, AUTHORITY_RULES_VERSION, type AuthoritySurface } from "../authority";
import type { ControlSurface } from "../control";
import type { IssuanceReport, CurrencySurveillance } from "../issuance";

/**
 * A lock on the rule set, not on its source text.
 *
 * AUTHORITY_RULES_VERSION is inside the certificate digest, so a rule
 * that changes behaviour while the version stays put makes two
 * different claims share an attestation — the exact thing §58 is
 * about. A version constant that a human has to remember to bump is
 * not a control; this is.
 *
 * The fingerprint is taken from OUTCOMES, over a battery of surfaces
 * chosen to exercise each rule in both directions. Hashing the file's
 * text instead would fire on a reworded comment and stay silent on a
 * threshold reached through a renamed constant. What matters is
 * whether the rules decide differently, so that is what is hashed.
 *
 * When this fails: if you changed a rule on purpose, bump
 * AUTHORITY_RULES_VERSION and paste the printed fingerprint below. If
 * you did not, you changed behaviour by accident and the fingerprint
 * just told you.
 */

const control = (over: Partial<ControlSurface> = {}): ControlSurface =>
  ({
    address: "rIssuer",
    masterKeyEnabled: false,
    regularKey: undefined,
    signers: {
      present: true,
      quorum: 3,
      signers: [],
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
  }) as ControlSurface;

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

const issuance = (c: CurrencySurveillance[] = [currency()]): IssuanceReport =>
  ({
    issuer: "rIssuer",
    currencies: c,
    linesWalked: 400,
    truncated: false,
    requiresAuth: false,
    canFreeze: false,
    globalFreeze: false,
    ledgerIndex: 84_112_907,
    readAt: "2026-09-20T00:00:00.000Z",
  }) as IssuanceReport;

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

/** Each entry aims at one rule, in a state that should flip it. */
const BATTERY: Array<[string, AuthoritySurface]> = [
  ["baseline clean", surface()],
  ["master key live", surface({ control: control({ masterKeyEnabled: true }) })],
  [
    "usable regular key",
    surface({ control: control({ regularKey: "rSomeRealKeyThatCouldSign11111" }) }),
  ],
  [
    "blackholed",
    surface({ control: control({ regularKey: "rrrrrrrrrrrrrrrrrrrrBZbvji" }) }),
  ],
  [
    "single signer reaches quorum",
    surface({
      control: control({
        signers: {
          present: true,
          quorum: 1,
          signers: [],
          totalWeight: 3,
          minimumSigners: 1,
          unilateralSigners: ["rA"],
        },
      }),
    }),
  ],
  ["freeze retained", surface({ posture: posture({ noFreeze: false }) })],
  ["globally frozen", surface({ posture: posture({ globalFreeze: true }) })],
  ["authorisation required", surface({ posture: posture({ requireAuth: true }) })],
  ["transfer fee set", surface({ posture: posture({ transferRateBps: 25 }) })],
  ["concentrated supply", surface({ issuance: issuance([currency({ hhi: 4000 })]) })],
  ["just under the HHI line", surface({ issuance: issuance([currency({ hhi: 2499 })]) })],
  ["exactly on the HHI line", surface({ issuance: issuance([currency({ hhi: 2500 })]) })],
  ["coverage below the floor", surface({ issuance: issuance([currency({ coverage: 0.5 })]) })],
  ["coverage just under", surface({ issuance: issuance([currency({ coverage: 0.949 })]) })],
  ["coverage exactly at the floor", surface({ issuance: issuance([currency({ coverage: 0.95 })]) })],
  ["no supply read", surface({ issuance: null })],
  ["posture unreadable", surface({ posture: null })],
  ["control unreadable", surface({ control: null })],
  ["a source threw", surface({ unreadable: ["posture: timeout"] })],
];

/* Local rather than imported: policy.ts keeps sha256Hex private, and
 * widening a module's public surface for a test's convenience is the
 * wrong trade. */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function fingerprint(): Promise<string> {
  const rows: string[] = [];
  for (const [name, s] of BATTERY) {
    for (const check of authorityChecks(s)) {
      rows.push(`${name}|${check.id}|${check.severity}|${check.passed}`);
    }
  }
  return sha256Hex(rows.join("\n"));
}

/*
 * Bump AUTHORITY_RULES_VERSION and update this together, never
 * separately — that pairing is the whole point of the file.
 */
const EXPECTED_VERSION = 1;
const EXPECTED_FINGERPRINT =
  "64A44BAFCCDEF12E8C866283E17D5E649397A3D5A453E176D5CAE4BC8EAE0B42";

describe("authority rule set version", () => {
  it("has not changed behaviour without a version bump", async () => {
    const actual = await fingerprint();
    expect(
      { version: AUTHORITY_RULES_VERSION, fingerprint: actual },
      "The rules decide differently than the recorded fingerprint. If that was " +
        "deliberate, bump AUTHORITY_RULES_VERSION and record the new fingerprint " +
        "printed here. If it was not, you changed a rule by accident."
    ).toEqual({ version: EXPECTED_VERSION, fingerprint: EXPECTED_FINGERPRINT });
  });

  it("covers every check the rules can emit", () => {
    const seen = new Set<string>();
    for (const [, s] of BATTERY) for (const c of authorityChecks(s)) seen.add(c.id);
    // A rule absent from the battery is a rule this lock does not guard.
    expect([...seen].sort()).toEqual([
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
