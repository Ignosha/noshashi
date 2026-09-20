/*
 * The authority certificate, server side.
 *
 * A deliberate mirror of src/lib/desk/authority.ts, and the duplication
 * is not laziness — it is unavoidable and it is tested. The console
 * module reads the ledger over a WebSocket, because the public rippled
 * HTTP endpoints send no CORS headers and a webview cannot POST to them
 * at all. A Vercel function has the opposite constraint: no CORS to
 * satisfy, no persistent socket worth holding, and no TypeScript build
 * step on this directory. Neither file can import the other.
 *
 * What makes the duplication safe is that the part that matters is
 * pure. `authorityChecks` takes a surface and returns findings with no
 * I/O in it, so both copies can be handed the identical surface and
 * compared, finding for finding and digest for digest. That is what
 * src/lib/desk/__tests__/authority-parity.test.ts does, importing this
 * file and the TypeScript one into the same process. If the two ever
 * disagree about a flag, a threshold or a single character of a check
 * id, the digests diverge and the test fails.
 *
 * Read the TypeScript file for why each check exists and why there is
 * no score. The reasoning is not repeated here; only the arithmetic is.
 */

import { fetchWithTimeout } from "./html.js";

/**
 * Public rippled HTTP endpoints, tried in order.
 *
 * Same list the Compliance API uses. A refusal from the ledger is an
 * answer and is not retried elsewhere; a transport failure moves on.
 */
const RIPPLE_HTTP = [
  "https://xrplcluster.com",
  "https://s1.ripple.com:51234",
  "https://s2.ripple.com:51234",
];

/** Inherited from issuance.ts. Below this, concentration abstains. */
const COVERAGE_FLOOR = 0.95;

/**
 * How far the holder walk goes, and why it is bounded twice.
 *
 * MAX_PAGES matches src/lib/desk/issuance.ts deliberately. It was 12
 * here against the console's 250, so the free endpoint measured
 * concentration over roughly a fiftieth of what the product measured —
 * and RLUSD came back at 8.7% coverage, abstaining every time. An
 * abstention is honest, but an endpoint that can only ever abstain is
 * not measuring anything.
 *
 * The page size asked for is NOT the page size returned: public
 * clusters cap `account_lines` at 200 rows however large a `limit` is
 * sent (measured against mainnet on 2026-08-27, and the reason the
 * comment in issuance.ts exists). So the real ceiling is MAX_PAGES x
 * 200, not x PAGE_SIZE, and any arithmetic that uses PAGE_SIZE to
 * predict depth is wrong by half.
 *
 * WALK_BUDGET_MS is the bound that actually fires. The console runs
 * over a WebSocket with a person watching a progress count and no
 * platform deadline; this runs in a Vercel function that is killed at
 * maxDuration, and a killed function returns nothing at all — not a
 * partial reading, not an abstention, just a 504. The budget stops the
 * walk early enough to always return the honest partial answer, which
 * for a big issuer is coverage below the floor and therefore an
 * abstention. Pages are sequential by construction, because each one
 * needs the previous page's marker, so this cannot be parallelised
 * away.
 */
const MAX_PAGES = 250;
const PAGE_SIZE = 400;
const WALK_BUDGET_MS = 25_000;
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
export function regularKeyCanSign(regularKey) {
  return Boolean(regularKey) && !UNUSABLE_KEYS.has(regularKey);
}

/** HHI at or above which a supply is called concentrated. */
const HHI_CONCENTRATED = 2500;

const LSF_REQUIRE_AUTH = 0x00040000;
const LSF_GLOBAL_FREEZE = 0x00400000;
const LSF_NO_FREEZE = 0x00200000;
const LSF_DISABLE_MASTER = 0x00100000;

/** Only a well-formed classic address is ever sent to a node. */
export const ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

class RippledError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "RippledError";
    this.code = code;
  }
}

async function rippleRpc(command, params, timeout = 8000) {
  let lastError = null;
  for (const endpoint of RIPPLE_HTTP) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        timeout,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: command, params: [params] }),
      });
      if (!response.ok) throw new Error(`rippled replied ${response.status}`);
      const payload = await response.json();

      // rippled's HTTP JSON-RPC reports a command error INSIDE `result`
      // and still sends HTTP 200. Only the WebSocket API puts it at the
      // top level, so testing payload.error alone sees no error at all
      // and an unreadable account comes back as an empty success.
      const result = payload?.result ?? {};
      const code = String(result.error ?? payload?.error ?? "");
      if (code) {
        throw new RippledError(String(result.error_message ?? code), code);
      }
      return result;
    } catch (error) {
      if (error instanceof RippledError) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error("Ledger unreachable");
}

/**
 * Turn a 160-bit currency code into the ticker a person recognises.
 *
 * Mirrors decodeCurrency in src/lib/format.ts. DISPLAY ONLY — the raw
 * code is what the digest is computed over, so a reader re-deriving a
 * digest from a printed certificate can use the value they were given.
 */
export function decodeCurrency(code) {
  if (!/^[0-9A-F]{40}$/i.test(code)) return code;
  const decoded = (code.match(/../g) ?? [])
    .map((byte) => String.fromCharCode(parseInt(byte, 16)))
    .join("")
    .replace(/\0+$/, "")
    .trim();
  return decoded && /^[\x20-\x7E]+$/.test(decoded) ? decoded : code;
}

/** Fewest signers that reach quorum, heaviest first. Greedy is exact. */
export function minimumSignersForQuorum(signers, quorum) {
  const weights = signers.map((s) => s.weight).sort((a, b) => b - a);
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) {
    total += weights[i];
    if (total >= quorum) return i + 1;
  }
  return Infinity;
}

function hhiOf(values) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return values.reduce((acc, v) => acc + ((v / total) * 100) ** 2, 0);
}

/* ── Reads ────────────────────────────────────────────────────────── */

async function readControl(issuer) {
  const [info, signerRes] = await Promise.all([
    rippleRpc("account_info", { account: issuer, ledger_index: "validated" }),
    // Tolerated so one failed object read does not lose the whole
    // control surface — but the failure is carried into the result,
    // because "no signer list" and "could not look" are different
    // answers and only one of them is reassuring.
    rippleRpc("account_objects", {
      account: issuer,
      type: "signer_list",
      ledger_index: "validated",
      limit: 10,
    }).catch((error) => ({ __unreadable: error?.message ?? String(error) })),
  ]);

  const data = info.account_data ?? {};
  const flags = Number(data.Flags ?? 0);
  const list = (signerRes.account_objects ?? [])[0];
  const signers = ((list?.SignerEntries ?? []))
    .map((e) => ({
      account: String(e.SignerEntry?.Account ?? ""),
      weight: Number(e.SignerEntry?.SignerWeight ?? 0),
    }))
    .filter((e) => e.account);
  const quorum = Number(list?.SignerQuorum ?? 0);

  return {
    address: issuer,
    masterKeyEnabled: (flags & LSF_DISABLE_MASTER) === 0,
    // The third signing path, and a plain field rather than an object,
    // which is why it is easy to miss. See authority.ts for what
    // missing it did to RLUSD's certificate.
    regularKey: data.RegularKey ? String(data.RegularKey) : undefined,
    signers: {
      present: signers.length > 0,
      unreadable: signerRes.__unreadable ? String(signerRes.__unreadable) : undefined,
      quorum,
      signers,
      totalWeight: signers.reduce((sum, s) => sum + s.weight, 0),
      minimumSigners: signers.length > 0 ? minimumSignersForQuorum(signers, quorum) : 0,
      unilateralSigners: signers.filter((s) => quorum > 0 && s.weight >= quorum).map((s) => s.account),
    },
    ledgerIndex: Number(info.ledger_index ?? info.ledger_current_index ?? 0),
  };
}

async function readPosture(issuer) {
  const result = await rippleRpc("account_info", {
    account: issuer,
    ledger_index: "validated",
  });
  const data = result.account_data ?? {};
  const flags = Number(data.Flags ?? 0);
  const rate = Number(data.TransferRate ?? 0);
  return {
    address: issuer,
    noFreeze: (flags & LSF_NO_FREEZE) !== 0,
    globalFreeze: (flags & LSF_GLOBAL_FREEZE) !== 0,
    requireAuth: (flags & LSF_REQUIRE_AUTH) !== 0,
    masterDisabled: (flags & LSF_DISABLE_MASTER) !== 0,
    // TransferRate is billionths; 1_000_000_000 means no fee.
    transferRateBps:
      rate > 1_000_000_000
        ? Math.round(((rate - 1_000_000_000) / 1_000_000_000) * 10_000)
        : 0,
  };
}

/**
 * Walk holder lines to measure concentration.
 *
 * Capped, and the cap is reported rather than hidden: a walk that
 * stopped early produces a coverage figure below the floor, and the
 * concentration check then abstains instead of reporting a number about
 * the holders that happened to fit in the pages read.
 */
async function readIssuanceSupply(
  issuer,
  { maxPages = MAX_PAGES, pageLimit = PAGE_SIZE, budgetMs = WALK_BUDGET_MS } = {}
) {
  const deadline = Date.now() + budgetMs;
  const balances = await rippleRpc("gateway_balances", {
    account: issuer,
    ledger_index: "validated",
  });

  const outstanding = {};
  for (const [currency, value] of Object.entries(balances.obligations ?? {})) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) outstanding[currency] = n;
  }
  if (Object.keys(outstanding).length === 0) {
    return { issuer, currencies: [], linesWalked: 0, truncated: false, ledgerIndex: 0 };
  }

  const held = {};
  for (const currency of Object.keys(outstanding)) held[currency] = [];

  let marker;
  let pages = 0;
  let linesWalked = 0;
  let truncated = false;
  let floorUnreachable = false;
  let ledgerIndex = 0;

  do {
    let page;
    try {
      page = await rippleRpc("account_lines", {
        account: issuer,
        ledger_index: "validated",
        limit: pageLimit,
        ...(marker ? { marker } : {}),
      });
    } catch {
      // Keep the pages already gathered and say the walk is short.
      truncated = true;
      break;
    }
    ledgerIndex = Number(page.ledger_index ?? ledgerIndex);
    for (const line of page.lines ?? []) {
      linesWalked += 1;
      // The issuer's own view: a holder's balance shows as negative.
      const amount = -Number(line.balance ?? 0);
      if (amount > 0 && held[line.currency]) held[line.currency].push(amount);
    }
    marker = page.marker;
    pages += 1;
    if (pages >= maxPages && marker) {
      truncated = true;
      break;
    }
    // Out of time. Reported exactly like the page cap: the walk is
    // short, coverage will say how short, and the concentration check
    // abstains on it. Stopping here is what makes the difference
    // between a partial answer and a 504 with no answer at all.
    if (marker && Date.now() >= deadline) {
      truncated = true;
      break;
    }

    /*
     * Give up early when the floor is out of reach.
     *
     * Measured against RLUSD on mainnet: 400 lines a page, ~750ms a
     * page, and 13,600 lines covering 8.8% of obligations — so roughly
     * 155,000 trust lines, and about nine minutes of sequential
     * requests to clear the 95% floor. No serverless function has nine
     * minutes, and the console's own 250-page cap tops out near 64% on
     * that issuer, so the honest answer for an issuance of that size is
     * an abstention no matter how long anyone waits.
     *
     * Without this the endpoint spent the entire 25-second budget
     * arriving at the abstention it could have reached in two, burning
     * the time and the public nodes' patience to produce the identical
     * result. Raising the page cap made that worse rather than better,
     * which is the opposite of what raising it was for.
     *
     * The projection is deliberately crude and deliberately generous:
     * extrapolate the pages needed at the rate observed so far, and
     * stop only when that exceeds what the cap or the clock could ever
     * allow. Holders are not ordered by balance, so a late whale can
     * lift coverage sharply — hence the 4x headroom before concluding
     * it is hopeless, and hence never stopping in the first few pages
     * where the rate is still noise.
     */
    if (marker && pages >= 5) {
      const seen = Object.entries(held).reduce(
        (sum, [currency, amounts]) =>
          sum + amounts.reduce((a, b) => a + b, 0) / (outstanding[currency] || Infinity),
        0
      );
      const coverageSoFar = seen / Object.keys(outstanding).length;
      if (coverageSoFar > 0) {
        const pagesNeeded = (pages / coverageSoFar) * COVERAGE_FLOOR;
        const msPerPage = (Date.now() - (deadline - budgetMs)) / pages;
        const reachable =
          pagesNeeded <= maxPages * 4 && pagesNeeded * msPerPage <= budgetMs * 4;
        if (!reachable) {
          truncated = true;
          floorUnreachable = true;
          break;
        }
      }
    }
  } while (marker);

  const currencies = Object.entries(outstanding).map(([currency, total]) => {
    const values = held[currency] ?? [];
    const observedHeld = values.reduce((a, b) => a + b, 0);
    const sorted = [...values].sort((a, b) => b - a);
    return {
      currency,
      outstanding: total,
      observedHeld,
      holders: values.length,
      hhi: hhiOf(values),
      topHolderPct: observedHeld > 0 ? ((sorted[0] ?? 0) / observedHeld) * 100 : 0,
      topFivePct:
        observedHeld > 0
          ? (sorted.slice(0, 5).reduce((a, b) => a + b, 0) / observedHeld) * 100
          : 0,
      coverage: total > 0 ? observedHeld / total : 0,
    };
  });

  return {
    issuer,
    currencies,
    linesWalked,
    truncated,
    ledgerIndex,
    // Why the walk ended, and how far it got. Coverage alone cannot
    // distinguish "we read every line there is and they only account
    // for 9% of the obligations" from "we ran out of pages" — and those
    // demand completely different responses.
    pages,
    stoppedBecause: !marker
      ? "no_more_lines"
      : floorUnreachable
        ? "floor_unreachable"
        : pages >= maxPages
          ? "page_cap"
          : Date.now() >= deadline
            ? "time_budget"
            : "page_failed",
    elapsedMs: Date.now() - (deadline - budgetMs),
  };
}

/** Read everything the certificate needs, at one ledger. */
export async function readAuthoritySurface(issuer, { walkSupply = false } = {}) {
  const unreadable = [];

  const [control, posture, issuance] = await Promise.all([
    readControl(issuer).catch((error) => {
      unreadable.push(`control: ${error?.message ?? String(error)}`);
      return null;
    }),
    readPosture(issuer).catch((error) => {
      unreadable.push(`posture: ${error?.message ?? String(error)}`);
      return null;
    }),
    walkSupply
      ? readIssuanceSupply(issuer).catch((error) => {
          unreadable.push(`issuance: ${error?.message ?? String(error)}`);
          return null;
        })
      : Promise.resolve(null),
  ]);

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

/** The currency concentration is scoped to: the largest outstanding. */
export function primaryCurrency(report) {
  if (!report || report.currencies.length === 0) return null;
  return report.currencies.reduce((a, b) => (b.outstanding > a.outstanding ? b : a));
}

/* ── The checks. Pure. Mirrored, and tested against the original. ─── */

export function authorityChecks(surface) {
  const checks = [];
  const { control, posture } = surface;

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

  checks.push({
    id: "OPEN_HOLDING",
    label: "Holding does not require issuer permission",
    severity: "warn",
    passed: !posture.requireAuth,
    detail: posture.requireAuth
      ? "lsfRequireAuth is set. The issuer authorises each holder individually, so who may hold this asset is the issuer's decision."
      : "lsfRequireAuth is clear. Any account may open a line without the issuer's permission.",
  });

  /*
   * Three ways to sign for an XRPL account, and all three have to be
   * read before anything can be said about unilateral control:
   *
   *   a signer list   quorum against SUMMED WEIGHTS, not a headcount
   *   a regular key   one key, signing alone, set as a plain field
   *   the master key  one key, signing alone, unless disabled
   *
   * Reading only the first and the last produced the worst possible
   * answer on live mainnet data. RLUSD's issuer has the master key
   * disabled and no signer list, so the check concluded the account
   * "cannot currently be signed for at all" and PASSED — an issuance
   * being actively minted, reported as controlled by nobody. It has a
   * regular key. That key signs alone.
   *
   * A genuinely unsignable account does exist and still passes, but it
   * now means all three are absent rather than two.
   */
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

  if (posture.transferRateBps > 0) {
    checks.push({
      id: "NO_TRANSFER_FEE",
      label: "No issuer transfer fee",
      severity: "warn",
      passed: false,
      detail: `The issuer charges ${(posture.transferRateBps / 100).toFixed(2)}% on every transfer between holders. The rate is set by the issuer and can be changed by them.`,
    });
  }

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

export function verdictFor(checks) {
  if (checks.some((c) => c.severity === "block" && !c.passed)) return "no-go";
  if (checks.some((c) => !c.passed)) return "hold";
  return "go";
}

/** Byte-for-byte the canonical form of digestOf() in src/lib/policy.ts. */
export async function digestOf({ kind, subject, scope, checks, evaluatedAt }) {
  const canonical = JSON.stringify({
    kind,
    subject,
    scope: Object.keys(scope).sort().map((key) => [key, scope[key]]),
    evaluatedAt,
    checks: checks.map((check) => [check.id, check.passed]),
  });
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function certificateFrom(surface) {
  const checks = authorityChecks(surface);
  const verdict = verdictFor(checks);
  const currency = primaryCurrency(surface.issuance)?.currency;
  const evaluatedAt = surface.readAt;

  const digest = await digestOf({
    kind: "authority",
    subject: surface.issuer,
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

export async function certifyAuthority(issuer, options = {}) {
  return certificateFrom(await readAuthoritySurface(issuer, options));
}
