import { rpc, XrplError } from "@/lib/xrpl/client";

/**
 * Unsolicited claims — what strangers have addressed to an account.
 *
 * A Check is an offer to pay: the sender creates one, and the recipient may
 * later cash it. Anyone can create one to anyone, unasked, for a token of
 * their choosing. That combination is being used for impersonation at
 * industrial scale, and the mechanism is a property of XRPL that most people
 * do not know:
 *
 *   A CURRENCY CODE IS NOT A NAME ANYONE OWNS.
 *
 * "USDT" is three bytes in a field. Any account may issue a token called
 * USDT, and the ledger will render it as USDT everywhere, indistinguishably
 * from any other. The only thing that identifies a token is its ISSUER.
 *
 * Measured on mainnet 2026-08-28, one account was running this continuously:
 *
 *   - 1,116,900 transactions sent since it was created nine days earlier,
 *     derived from its sequence against its origin ledger
 *   - CheckCreate and CheckCancel in exactly equal numbers, and not one
 *     CheckCash in 7,499 consecutive transactions
 *   - every check denominated in "USDT" from an issuer whose
 *     `gateway_balances` obligations are EMPTY — it has issued nothing, so
 *     there is no balance any of these checks could ever be cashed for
 *   - sender and issuer publishing the same domain
 *
 * Two things this module must state correctly, because getting either wrong
 * would either panic someone or lull them:
 *
 *   1. Receiving a check takes NOTHING. The Check object counts against the
 *      SENDER's reserve, not the recipient's — verified by comparing
 *      OwnerCount against account_objects on both sides. It cannot move your
 *      funds and ignoring it costs you nothing. The risk is entirely that it
 *      is bait for something off-ledger.
 *
 *   2. An issuer with no obligations is not proof of fraud on its own. A
 *      genuinely new token has no holders yet either. It is decisive only
 *      alongside a borrowed ticker, which is why the two are reported
 *      together rather than as one verdict.
 */

/** Tickers people recognise, and therefore the ones worth borrowing. */
const IMPERSONATED = new Set([
  "USDT",
  "USDC",
  "USD",
  "EUR",
  "DAI",
  "BTC",
  "ETH",
  "XRP",
  "RLUSD",
  "GBP",
  "TUSD",
  "BUSD",
]);

export type ClaimAmount =
  | { kind: "xrp"; value: number }
  | { kind: "iou"; currency: string; issuer: string; value: number };

export type InboundClaim = {
  /** Ledger object id, so a claim can be told apart from an identical one. */
  index: string;
  from: string;
  amount: ClaimAmount;
  destinationTag?: number;
  expiration?: Date;
  /** Obligations the claimed issuer actually has outstanding. */
  issuerObligations?: number;
  /** True when the issuer owes nothing at all in that currency. */
  issuerOwesNothing: boolean;
  /** The ticker is one people recognise, which anyone may use. */
  borrowedTicker: boolean;
  /** Domain the issuer publishes, if any. */
  issuerDomain?: string;
};

export type ClaimsReport = {
  address: string;
  inbound: InboundClaim[];
  /** Checks this account created itself. Not a risk; shown for completeness. */
  outboundCount: number;
  ledgerIndex: number;
  readAt: string;
};

const RIPPLE_EPOCH_OFFSET = 946_684_800;

/**
 * Decode a hex-encoded field of arbitrary length, such as a Domain.
 *
 * Distinct from decodeCurrency, which only accepts the fixed 40-character
 * form a 160-bit currency code takes. Passing a Domain through that one
 * returns it unchanged — a domain is however many bytes it is — which is
 * how `usdxrp.net` first rendered as 7573647872702E6E6574.
 */
function decodeHexField(value: string): string {
  if (!/^([0-9A-F]{2})+$/i.test(value)) return value;
  const decoded = (value.match(/../g) ?? [])
    .map((b) => String.fromCharCode(parseInt(b, 16)))
    .join("")
    .replace(/\0+$/, "")
    .trim();
  return decoded && /^[\x20-\x7E]+$/.test(decoded) ? decoded : value;
}

function decodeCurrency(code: string): string {
  if (!/^[0-9A-F]{40}$/i.test(code)) return code;
  const decoded = (code.match(/../g) ?? [])
    .map((b) => String.fromCharCode(parseInt(b, 16)))
    .join("")
    .replace(/\0+$/, "")
    .trim();
  return decoded && /^[\x20-\x7E]+$/.test(decoded) ? decoded : code;
}

export function formatClaim(amount: ClaimAmount): string {
  if (amount.kind === "xrp") {
    return `${amount.value.toLocaleString(undefined, { maximumFractionDigits: 6 })} XRP`;
  }
  return `${amount.value.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${decodeCurrency(amount.currency)}`;
}

export async function readClaims(address: string): Promise<ClaimsReport> {
  let res: Record<string, any>;
  try {
    res = await rpc("account_objects", {
      account: address,
      ledger_index: "validated",
      type: "check",
      limit: 200,
    });
  } catch (caught) {
    if (caught instanceof XrplError && caught.code === "actNotFound") {
      throw new Error(
        "That address is not funded, so it has no account and nothing can be addressed to it yet."
      );
    }
    throw caught;
  }

  const objects = (res.account_objects ?? []) as Array<Record<string, any>>;
  const incoming = objects.filter((o) => o.Destination === address);

  /*
   * Verify each distinct claimed issuer once. A spam run uses a single
   * issuer across every check, so caching turns N reads into one.
   */
  const issuers = new Map<string, { obligations: number; domain?: string }>();
  for (const check of incoming) {
    const sendMax = check.SendMax;
    if (typeof sendMax !== "object" || !sendMax?.issuer) continue;
    const key = `${sendMax.issuer}|${sendMax.currency}`;
    if (issuers.has(key)) continue;
    try {
      const [balances, info] = await Promise.all([
        rpc("gateway_balances", { account: sendMax.issuer, ledger_index: "validated" }),
        rpc("account_info", { account: sendMax.issuer, ledger_index: "validated" }),
      ]);
      const obligations = Number((balances.obligations ?? {})[sendMax.currency] ?? 0);
      const rawDomain = info.account_data?.Domain;
      issuers.set(key, {
        obligations: Number.isFinite(obligations) ? obligations : 0,
        domain: rawDomain ? decodeHexField(String(rawDomain)) : undefined,
      });
    } catch {
      // An unreadable issuer is left unknown rather than assumed innocent
      // or guilty; the finding layer reports it as unverified.
    }
  }

  return interpretChecks(address, objects, issuers, Number(res.ledger_index ?? 0));
}

/** What a resolved issuer lookup carries. */
export type IssuerFacts = { obligations: number; domain?: string };

/**
 * Turn raw check objects into a report.
 *
 * Split from the fetch so the partitioning can be tested. A mutation that
 * removed the Destination filter — making an account's OWN outgoing checks
 * register as claims against it — passed the entire suite, because every
 * test built its report by hand and none exercised this step. The spammer's
 * own account would have reported 34 threats against itself.
 */
export function interpretChecks(
  address: string,
  objects: Array<Record<string, any>>,
  issuers: Map<string, IssuerFacts>,
  ledgerIndex: number
): ClaimsReport {
  // account_objects returns checks addressed TO the account as well as ones
  // it created. Only the former are claims against it.
  const incoming = objects.filter((o) => o.Destination === address);

  const inbound: InboundClaim[] = incoming.map((check) => {
    const sendMax = check.SendMax;
    const isIou = typeof sendMax === "object" && sendMax !== null;
    const amount: ClaimAmount = isIou
      ? {
          kind: "iou",
          currency: String(sendMax.currency ?? ""),
          issuer: String(sendMax.issuer ?? ""),
          value: Number(sendMax.value ?? 0),
        }
      : { kind: "xrp", value: Number(sendMax ?? 0) / 1_000_000 };

    const key = isIou ? `${sendMax.issuer}|${sendMax.currency}` : "";
    const verified = issuers.get(key);
    const ticker = isIou ? decodeCurrency(String(sendMax.currency ?? "")) : "XRP";

    return {
      index: String(check.index ?? ""),
      from: String(check.Account ?? ""),
      amount,
      destinationTag:
        check.DestinationTag !== undefined ? Number(check.DestinationTag) : undefined,
      expiration:
        check.Expiration !== undefined
          ? new Date((Number(check.Expiration) + RIPPLE_EPOCH_OFFSET) * 1000)
          : undefined,
      issuerObligations: verified?.obligations,
      issuerOwesNothing: verified !== undefined && verified.obligations === 0,
      borrowedTicker: isIou && IMPERSONATED.has(ticker.toUpperCase()),
      issuerDomain: verified?.domain,
    };
  });

  return {
    address,
    inbound,
    outboundCount: objects.length - incoming.length,
    ledgerIndex,
    readAt: new Date().toISOString(),
  };
}

export type ClaimFinding = {
  id: string;
  severity: "critical" | "warn" | "info" | "ok";
  title: string;
  detail: string;
  action?: string;
};

export function claimFindings(report: ClaimsReport): ClaimFinding[] {
  const out: ClaimFinding[] = [];

  if (report.inbound.length === 0) {
    out.push({
      id: "none",
      severity: "ok",
      title: "Nothing is addressed to this account",
      detail:
        "No checks are pending against it. Note that a check can be cancelled by whoever created it at any time before it is cashed, so an empty result today does not mean none has ever arrived.",
    });
    return out;
  }

  // The dangerous combination, reported per claim.
  const impersonating = report.inbound.filter((c) => c.borrowedTicker && c.issuerOwesNothing);
  for (const claim of impersonating) {
    const ticker = claim.amount.kind === "iou" ? decodeCurrency(claim.amount.currency) : "XRP";
    out.push({
      id: `impersonation-${claim.index.slice(0, 12)}`,
      severity: "critical",
      title: `A claim for ${formatClaim(claim.amount)} that cannot be cashed for anything`,
      detail: `${claim.from} has addressed a check for ${formatClaim(claim.amount)} to this account. A currency code is not a name anyone owns — any account can issue a token called ${ticker}, and the ledger renders them identically. This one's issuer has NO obligations outstanding at all, meaning it has never issued a balance to anyone, so there is nothing this check could pay out.${claim.issuerDomain ? ` The issuer publishes the domain ${claim.issuerDomain}.` : ""}`,
      action:
        "Do not visit any domain associated with it and do not enter a wallet key anywhere it leads. The check itself is inert — it cannot move your funds, and ignoring it costs you nothing.",
    });
  }

  const borrowedOnly = report.inbound.filter((c) => c.borrowedTicker && !c.issuerOwesNothing);
  for (const claim of borrowedOnly) {
    const ticker = claim.amount.kind === "iou" ? decodeCurrency(claim.amount.currency) : "XRP";
    out.push({
      id: `ticker-${claim.index.slice(0, 12)}`,
      severity: "warn",
      title: `A claim denominated in ${ticker} — verify the issuer, not the ticker`,
      detail: `The issuer does have ${claim.issuerObligations?.toLocaleString(undefined, { maximumFractionDigits: 2 })} outstanding, so this token is genuinely held by someone. That still does not make it the ${ticker} you are thinking of: the code is unowned and any issuer may use it. Only the issuing address identifies a token.`,
      action: `Confirm ${claim.amount.kind === "iou" ? claim.amount.issuer : ""} is the issuer you expect before treating this as ${ticker}.`,
    });
  }

  const unverified = report.inbound.filter(
    (c) => c.amount.kind === "iou" && c.issuerObligations === undefined
  );
  if (unverified.length > 0) {
    out.push({
      id: "unverified",
      severity: "warn",
      title: `${unverified.length} claim${unverified.length === 1 ? "'s issuer" : "s' issuers"} could not be checked`,
      detail:
        "The ledger did not answer for those issuing accounts, so whether they have issued anything is unknown — which is not the same as their being fine.",
    });
  }

  const plain = report.inbound.filter(
    (c) => !c.borrowedTicker && (c.issuerObligations !== undefined || c.amount.kind === "xrp")
  );
  if (plain.length > 0) {
    out.push({
      id: "pending",
      severity: "info",
      title: `${plain.length} other claim${plain.length === 1 ? "" : "s"} pending`,
      detail:
        "Checks addressed to this account that do not borrow a well-known ticker. A check is an offer to pay, not a payment: nothing moves until it is cashed, and the sender can cancel it first.",
    });
  }

  out.push({
    id: "reserve",
    severity: "info",
    title: "None of this costs the recipient anything",
    detail:
      "A Check object counts against the reserve of whoever created it, not of whoever receives it. Ignoring an unwanted claim is free, and there is nothing to clean up.",
  });

  const rank = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
