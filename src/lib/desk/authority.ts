import type { Status } from "../xrpl/types";
import type { PolicyCheck } from "../policy";
import { digestOf } from "../policy";
import { decodeCurrency } from "../format";
import { fetchIssuerPosture } from "../xrpl/client";
import { readControlSurface, type ControlSurface } from "./control";
import { readIssuance, type IssuanceReport, type CurrencySurveillance } from "./issuance";

/**
 * Authority certificate — who can still act on an issued asset.
 *
 * ── What this is ────────────────────────────────────────────────────
 * One question, answered from validated ledger state: can any single
 * party still freeze, seize, dilute or immobilise this issuance?
 *
 * The inputs are already measured elsewhere in this codebase. This
 * module composes them and states a verdict, in the same shape as the
 * settlement gate, with the same tamper-evident receipt.
 *
 *   control.ts   → can one key sign for the issuer?
 *   client.ts    → freeze, deep freeze, authorisation, transfer rate
 *   issuance.ts  → how concentrated is the supply, and is that knowable?
 *
 * ── What this is NOT ────────────────────────────────────────────────
 * It is not a score. There is no 0–100, no grade, no weighting. A
 * composite number would imply a precision the ledger does not support
 * and could not be defended when someone asks why it is 87 and not 84 —
 * and inventing one would contradict the claim, made on the pricing
 * page, that this product does not fabricate.
 *
 * It is also NOT a legal determination. "Decentralised" is a statutory
 * term that an agency or a court applies against statutory criteria.
 * What this reports is a set of ledger facts that bear on it. Every
 * label below is phrased as an observation about authority, never as a
 * conclusion about a token's legal character, and the distinction is
 * load-bearing rather than lawyerly: the moment this reads as a legal
 * opinion about someone else's asset, it is both wrong and a liability.
 *
 * ── Reading the verdict ─────────────────────────────────────────────
 *   GO     no unilateral authority found over this issuance
 *   HOLD   authority exists but is constrained — a quorum, no clawback
 *   NO-GO  a single party can freeze, seize or reissue
 *
 * Same three states as the settlement gate on purpose. An operator
 * should not have to learn a second vocabulary to read a second
 * instrument.
 */

/** Everything the certificate reads, captured at one ledger index. */
export type AuthoritySurface = {
  issuer: string;
  /** Null when the issuer account could not be read at all. */
  control: ControlSurface | null;
  posture: Awaited<ReturnType<typeof fetchIssuerPosture>> | null;
  /** Null when supply was not walked — the concentration checks abstain. */
  issuance: IssuanceReport | null;
  /** Set when a source failed, so the certificate can say so rather than pass. */
  unreadable: string[];
  ledgerIndex: number;
  readAt: string;
};

export type AuthorityCertificate = {
  verdict: Status;
  issuer: string;
  /**
   * The currency the concentration checks were scoped to, as the ledger
   * holds it — a three-character code, or 40 hex characters for
   * anything longer. THIS is what the digest is computed over, so it
   * stays raw: a reader re-deriving the digest from a printed
   * certificate has to be able to use the value they were given.
   */
  currency?: string;
  /**
   * The same currency, decoded for a person to read. Display only, and
   * deliberately outside the digest — RLUSD reaches the page as
   * 524C555344000000000000000000000000000000, which tells a reader
   * nothing at all.
   */
  currencyLabel?: string;
  checks: PolicyCheck[];
  /** SHA-256 over the canonical body, via the shared digest. */
  digest: string;
  ledgerIndex: number;
  evaluatedAt: string;
};

/**
 * Coverage below which no concentration figure is reported.
 *
 * Deliberately the same floor issuance.ts uses. A holder walk that saw
 * 40% of supply produces shares inflated by a small denominator and
 * deflated by whichever large holders went unseen, so the honest output
 * is an abstention rather than a number with a caveat attached to it.
 */
const COVERAGE_FLOOR = 0.95;

/**
 * Addresses whose private key provably does not exist.
 *
 * Setting the regular key to one of these and then disabling the
 * master key is how an XRPL issuer gives up control — "blackholing".
 * The account keeps issuing what it already issued and can never sign
 * another transaction, because nobody can produce a signature for a
 * key nobody holds. Alongside lsfNoFreeze it is the strongest
 * surrender the ledger offers.
 *
 * Which makes it the worst thing to get backwards, and the first
 * version did. Having just been taught to read the regular key, the
 * check treated any regular key as a controller and marked Sologenic's
 * SOLO — blackholed to ACCOUNT_ONE — as controlled by
 * rrrrrrrrrrrrrrrrrrrrBZbvji "on its own". The most decentralised
 * configuration available scored worst, and on the page built to
 * inform a decentralisation argument.
 *
 * These four are reserved by the protocol and are not the product of
 * any keypair: ACCOUNT_ZERO and ACCOUNT_ONE are the base58 encodings
 * of 0 and 1, and the other two are rippled's own sentinels.
 */
const UNUSABLE_KEYS = new Set([
  "rrrrrrrrrrrrrrrrrrrrrhoLvTp", // ACCOUNT_ZERO
  "rrrrrrrrrrrrrrrrrrrrBZbvji", // ACCOUNT_ONE
  "rrrrrrrrrrrrrrrrrNAMEtxvNvQ", // reserved for name lookups
  "rrrrrrrrrrrrrrrrrrrn5RM1rHd", // rippled's NaN sentinel
]);

/** True when a regular key is set to something that can actually sign. */
export function regularKeyCanSign(regularKey: string | undefined): boolean {
  return Boolean(regularKey) && !UNUSABLE_KEYS.has(regularKey!);
}

/** HHI at or above which a supply is called concentrated. */
const HHI_CONCENTRATED = 2500;

export async function readAuthoritySurface(
  issuer: string,
  options: { walkSupply?: boolean } = {}
): Promise<AuthoritySurface> {
  const unreadable: string[] = [];

  const [control, rawPosture, issuance] = await Promise.all([
    readControlSurface(issuer).catch((error: unknown) => {
      unreadable.push(`control: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }),
    fetchIssuerPosture(issuer).catch((error: unknown) => {
      unreadable.push(`posture: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }),
    // The supply walk is the expensive read, so it is opt-in. When it is
    // skipped the concentration checks abstain rather than assume.
    options.walkSupply
      ? readIssuance(issuer).catch((error: unknown) => {
          unreadable.push(`issuance: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        })
      : Promise.resolve(null),
  ]);

  /**
   * fetchIssuerPosture NEVER REJECTS. It catches its own failure and
   * returns a posture object with `unreadable` set and every flag
   * false — which is why the .catch() above cannot be relied on and
   * this check exists.
   *
   * Left unhandled, a posture that failed to read produced
   * globalFreeze: false and requireAuth: false, and both of those are
   * PASSES — one of them on a blocking check. An issuer nobody could
   * read would have been certified as not frozen and openly holdable,
   * which is the precise failure this module claims to rule out: a
   * certificate that looks clean because a request did not come back.
   * An absent reading is not a negative reading.
   */
  const posture = rawPosture?.unreadable ? null : rawPosture;
  if (rawPosture?.unreadable) {
    unreadable.push(`posture: ${rawPosture.unreadable}`);
  }

  return {
    issuer,
    control,
    posture,
    issuance,
    unreadable,
    ledgerIndex: control?.ledgerIndex ?? issuance?.ledgerIndex ?? 0,
    readAt: new Date().toISOString(),
  };
}

/** Pick the currency to scope concentration to: the largest outstanding. */
export function primaryCurrency(report: IssuanceReport | null): CurrencySurveillance | null {
  if (!report || report.currencies.length === 0) return null;
  return report.currencies.reduce((a, b) => (b.outstanding > a.outstanding ? b : a));
}

/**
 * The checks. Pure and synchronous, so the identical function runs in
 * the console for instant feedback and inside the Compliance API for
 * enforcement — the same property evaluatePolicy has, and for the same
 * reason: two implementations of one rule is two different answers.
 */
export function authorityChecks(surface: AuthoritySurface): PolicyCheck[] {
  const checks: PolicyCheck[] = [];
  const { control, posture } = surface;

  /* ── Could the issuer be read at all? ───────────────────────────── */
  /*
   * `posture.unreadable` is tested here as well as in
   * readAuthoritySurface, and the duplication is deliberate.
   *
   * fetchIssuerPosture reports its own failure in-band: it resolves with
   * every flag false and `unreadable` set, rather than rejecting. A
   * surface carrying that object is not a surface with a posture, it is
   * a surface with a record of a failed read — and the flags on it are
   * defaults, not findings. Reading them as findings certifies an issuer
   * nobody could reach as un-frozen and openly holdable.
   *
   * readAuthoritySurface already normalises this to null, so on the live
   * path the branch below never sees it. The guard is here because
   * certificateFrom is exported for surfaces this module did not build:
   * one captured for offline re-certification, or one assembled
   * server-side. Those callers cannot be relied on to have normalised
   * anything, and the check that matters must hold wherever the surface
   * came from.
   */
  if (!posture || posture.unreadable || !control) {
    checks.push({
      id: "AUTHORITY_READABLE",
      label: "Issuer state readable",
      severity: "block",
      passed: false,
      detail:
        [...surface.unreadable, posture?.unreadable ? `posture: ${posture.unreadable}` : ""]
          .filter(Boolean)
          .join("; ") ||
        "The issuer account could not be read from validated state, so no authority claim can be made about it.",
    });
    return checks;
  }

  /* ── Seizure ────────────────────────────────────────────────────── */
  // lsfNoFreeze is the only irrevocable surrender on the ledger: once
  // set it cannot be cleared, which is why it is the single strongest
  // signal available and is checked first.
  checks.push({
    id: "FREEZE_SURRENDERED",
    label: "Freeze permanently surrendered",
    severity: "warn",
    passed: posture.noFreeze,
    detail: posture.noFreeze
      ? "lsfNoFreeze is set. The issuer has irrevocably given up the ability to freeze any line of this issuance."
      : "lsfNoFreeze is not set. The issuer retains the ability to freeze holders' lines, and can exercise it at any time without notice to the holder.",
  });

  checks.push({
    id: "NOT_GLOBALLY_FROZEN",
    label: "Issuance not frozen now",
    severity: "block",
    passed: !posture.globalFreeze,
    detail: posture.globalFreeze
      ? "lsfGlobalFreeze is set. Every trust line of this issuer is frozen at this ledger — balances cannot move."
      : "lsfGlobalFreeze is clear. Lines are not under a global freeze at this ledger.",
  });

  /* ── Admission ──────────────────────────────────────────────────── */
  checks.push({
    id: "OPEN_HOLDING",
    label: "Holding does not require issuer permission",
    severity: "warn",
    passed: !posture.requireAuth,
    detail: posture.requireAuth
      ? "lsfRequireAuth is set. The issuer authorises each holder individually, so who may hold this asset is the issuer's decision."
      : "lsfRequireAuth is clear. Any account may open a line without the issuer's permission.",
  });

  /* ── Unilateral control of the issuer account ───────────────────── */
  /*
   * Three ways to sign for an XRPL account, and all three have to be
   * read before anything can be said about unilateral control:
   *
   *   a signer list   quorum against SUMMED WEIGHTS, not a headcount
   *   a regular key   one key, signing alone — unless it is unusable
   *   the master key  one key, signing alone, unless disabled
   *
   * Both halves of this were found on live mainnet rather than
   * reasoned out, and they fail in opposite directions.
   *
   * Reading no regular key at all passed Bitstamp's USD issuer, which
   * has the master key disabled and rUUs1jns6tdUQwAABDJyHMUHvdGNvNADvJ
   * signing alone: "the account cannot currently be signed for at all".
   *
   * Reading every regular key as a controller then failed Sologenic's
   * SOLO, blackholed to ACCOUNT_ONE, which nobody can sign for. The
   * key has to be one that can actually sign.
   */
  const signersUnreadable = Boolean(control.signers.unreadable);
  const blackholed =
    !control.masterKeyEnabled &&
    Boolean(control.regularKey) &&
    !regularKeyCanSign(control.regularKey);

  const unilateral = control.signers.present
    ? control.signers.minimumSigners <= 1
    : regularKeyCanSign(control.regularKey) || control.masterKeyEnabled;

  checks.push({
    id: "NO_UNILATERAL_SIGNER",
    label: "No single key controls the issuer",
    severity: "block",
    // A signer list that could not be read cannot be ruled out, and an
    // unverifiable absence must not read as an absence.
    passed: !unilateral && !signersUnreadable,
    detail: signersUnreadable
      ? `The signer list could not be read (${control.signers.unreadable}), so it cannot be established whether a committee controls this account or one key does. This is an unknown, not a pass.`
      : control.signers.present
        ? control.signers.minimumSigners <= 1
          ? `A signer list is present, but ${control.signers.unilateralSigners.length || 1} signer reaches the quorum of ${control.signers.quorum} alone. This is a single-key account wearing a committee's clothes.`
          : `${control.signers.minimumSigners} signers must agree to reach the quorum of ${control.signers.quorum}, derived from summed weights rather than a headcount.`
        : blackholed
          ? `The master key is disabled and the regular key is set to ${control.regularKey}, an address whose private key does not exist. The account is blackholed: it can never sign another transaction, so no party can act on this issuance.`
          : regularKeyCanSign(control.regularKey)
            ? `No signer list. The master key is ${control.masterKeyEnabled ? "enabled" : "disabled"} and a regular key is set, so ${control.regularKey} signs for this issuer on its own.`
            : control.masterKeyEnabled
              ? `No signer list and no usable regular key, and the master key is enabled. One key signs for this issuer.`
              : "The master key is disabled, no regular key is set and no signer list is present, so the account cannot currently be signed for at all.",
  });

  /* ── Cost of transacting ────────────────────────────────────────── */
  if (posture.transferRateBps > 0) {
    checks.push({
      id: "NO_TRANSFER_FEE",
      label: "No issuer transfer fee",
      severity: "warn",
      passed: false,
      detail: `The issuer charges ${(posture.transferRateBps / 100).toFixed(2)}% on every transfer between holders. The rate is set by the issuer and can be changed by them.`,
    });
  }

  /* ── Supply concentration ───────────────────────────────────────── */
  const currency = primaryCurrency(surface.issuance);
  /*
   * "Not walked" and "walked, and the read failed" are different
   * findings and used to print the same sentence.
   *
   * The walk is optional, so a null issuance legitimately means the
   * caller did not ask for one. But readAuthoritySurface also catches a
   * failed walk into `unreadable` and returns null — so a caller who
   * DID ask, and whose read then broke, was told the supply "was not
   * walked for this certificate", as though that had been their
   * choice. Same shape as the posture bug above: a failure wearing the
   * clothes of a benign state.
   */
  const walkFailed = surface.unreadable.find((entry) => entry.startsWith("issuance:"));
  if (!surface.issuance) {
    checks.push({
      id: "SUPPLY_CONCENTRATION",
      label: "Supply concentration",
      severity: "warn",
      passed: false,
      detail: walkFailed
        ? `The holder walk was requested and could not be completed (${walkFailed.replace(/^issuance:\s*/, "")}), so no concentration finding is made. This is a failed read, not an abstention and not a pass.`
        : "Supply was not walked for this certificate, so no concentration finding is made. This is an abstention, not a pass.",
    });
  } else if (!currency) {
    checks.push({
      id: "SUPPLY_CONCENTRATION",
      label: "Supply concentration",
      severity: "warn",
      passed: false,
      detail: "The issuer reports no outstanding obligations, so there is no supply to measure.",
    });
  } else if (currency.coverage < COVERAGE_FLOOR) {
    // The rule issuance.ts already enforces, inherited deliberately: a
    // low-coverage HHI is not a floor or an estimate, it is a different
    // number about a different population.
    checks.push({
      id: "SUPPLY_CONCENTRATION",
      label: `${decodeCurrency(currency.currency)} supply concentration`,
      severity: "warn",
      passed: false,
      detail: `The holder lines read account for ${(currency.coverage * 100).toFixed(1)}% of the outstanding ${decodeCurrency(currency.currency)}. Below ${COVERAGE_FLOOR * 100}% coverage no concentration figure is reported, high or low, because shares over that fraction describe the holders seen rather than the issuance.`,
    });
  } else {
    const concentrated = currency.hhi >= HHI_CONCENTRATED;
    checks.push({
      id: "SUPPLY_CONCENTRATION",
      label: `${decodeCurrency(currency.currency)} supply not concentrated`,
      severity: "warn",
      passed: !concentrated,
      detail: concentrated
        ? `HHI ${Math.round(currency.hhi)} over ${currency.holders} holders at ${(currency.coverage * 100).toFixed(1)}% coverage. The largest holder carries ${currency.topHolderPct.toFixed(1)}% and the top five carry ${currency.topFivePct.toFixed(1)}%.`
        : `HHI ${Math.round(currency.hhi)} over ${currency.holders} holders at ${(currency.coverage * 100).toFixed(1)}% coverage, below the ${HHI_CONCENTRATED} threshold.`,
    });
  }

  return checks;
}

/**
 * What each verdict means for a certificate.
 *
 * Separate from VERDICT_COPY in policy.ts, which says things like
 * "cleared to broadcast" — true of a settlement and meaningless about
 * an issuer. Reusing it would have put settlement language on a
 * document that makes no claim about any transaction.
 *
 * The wording is about retained authority and nothing else. None of it
 * says safe, compliant, decentralised or sound, because the certificate
 * does not establish any of those and a reader in a hurry will quote
 * whatever the headline says.
 */
export const AUTHORITY_VERDICT_COPY: Record<Status, { title: string; blurb: string }> = {
  go: {
    title: "NO UNILATERAL AUTHORITY FOUND",
    blurb:
      "On the checks run, no single party was found able to freeze, gate or unilaterally sign for this issuance at this ledger. This describes the authority observed, not the conduct of whoever holds it.",
  },
  hold: {
    title: "AUTHORITY RETAINED, CONSTRAINED",
    blurb:
      "No single party can act alone, but the issuer has kept powers that bear on a holder — a freeze it has not surrendered, a fee it sets, or a supply too concentrated or too unreadable to call dispersed.",
  },
  "no-go": {
    title: "UNILATERAL AUTHORITY PRESENT",
    blurb:
      "A single party can act on this issuance without anyone's agreement, or the issuance could not be read well enough to say otherwise. Either way a holder's balance is not solely in the holder's control.",
  },
};

/** Blocking failure → NO-GO; advisory failure → HOLD; otherwise GO. */
export function verdictFor(checks: PolicyCheck[]): Status {
  if (checks.some((c) => c.severity === "block" && !c.passed)) return "no-go";
  if (checks.some((c) => !c.passed)) return "hold";
  return "go";
}

/** Read, check, digest. What a caller actually invokes. */
export async function certifyAuthority(
  issuer: string,
  options: { walkSupply?: boolean } = {}
): Promise<AuthorityCertificate> {
  const surface = await readAuthoritySurface(issuer, options);
  return certificateFrom(surface);
}

/** The pure half of certifyAuthority, so a captured surface re-certifies. */
export async function certificateFrom(
  surface: AuthoritySurface
): Promise<AuthorityCertificate> {
  const checks = authorityChecks(surface);
  const verdict = verdictFor(checks);
  const currency = primaryCurrency(surface.issuance)?.currency;
  const evaluatedAt = surface.readAt;

  const digest = await digestOf({
    kind: "authority",
    subject: surface.issuer,
    // The ledger index is inside the digest because a certificate is a
    // claim about one ledger, not about an issuer in general. The same
    // issuer at a later ledger is a different assertion and must not
    // share a digest with this one.
    scope: { currency: currency ?? "", ledgerIndex: surface.ledgerIndex, verdict },
    checks,
    evaluatedAt,
  });

  return {
    verdict,
    issuer: surface.issuer,
    currency,
    currencyLabel: currency ? decodeCurrency(currency) : undefined,
    checks,
    digest,
    ledgerIndex: surface.ledgerIndex,
    evaluatedAt,
  };
}
