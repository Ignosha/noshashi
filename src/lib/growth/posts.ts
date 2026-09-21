import type { XrplState } from "@/lib/xrpl/useXRPL";

/**
 * Content studio — drafts, not a posting bot.
 *
 * The obvious version of this feature drives a logged-in browser session to
 * post automatically. It is not built, deliberately: automating posts
 * outside a platform's API violates the terms of every major network, is
 * what their spam systems exist to catch, and would be a strange way to
 * market a compliance product.
 *
 * So this drafts and the operator posts. That constraint turns out to be
 * the feature — a human reading their own post before it goes out is the
 * check that stops a bot repeating a number that has since moved.
 *
 * Every draft is built from live state or from a measurement this codebase
 * actually made. Nothing is templated marketing copy with a blank where a
 * statistic should be.
 */

export type Platform = "x" | "linkedin" | "reddit" | "hn";

export type PlatformSpec = {
  id: Platform;
  label: string;
  /** Hard character ceiling, where the platform has one. */
  limit?: number;
  /** How the audience there actually reads. */
  register: string;
};

export const PLATFORMS: PlatformSpec[] = [
  { id: "x", label: "X", limit: 280, register: "One claim, one number, no preamble." },
  {
    id: "linkedin",
    label: "LinkedIn",
    limit: 3000,
    register: "Institutional. Lead with the operational problem, not the product.",
  },
  {
    id: "reddit",
    label: "Reddit — r/Ripple, r/XRP",
    limit: 10000,
    register: "Technical and unbranded. This audience punishes a pitch.",
  },
  {
    id: "hn",
    label: "Hacker News",
    limit: 2000,
    register: "The engineering finding is the story. The product is a footnote.",
  },
];

export type Angle = {
  id: string;
  title: string;
  /** Why this is worth somebody's attention — the actual hook. */
  hook: string;
  /** True when the copy embeds a figure read live rather than a fixed one. */
  usesLiveData: boolean;
};

export const ANGLES: Angle[] = [
  {
    id: "depth",
    title: "The 913× depth overstatement",
    hook: "A measured, checkable finding about XRPL order books that nobody has written up.",
    usesLiveData: false,
  },
  {
    id: "freeze",
    title: "Your balance may not be yours",
    hook: "Most holders do not know issuers can freeze issued balances, and it is one flag read away.",
    usesLiveData: false,
  },
  {
    id: "amendments",
    title: "Implemented is not activated",
    hook: "Tooling ships features the network rejects, because it checks the wrong endpoint.",
    usesLiveData: true,
  },
  {
    id: "check",
    title: "Check an address before you pay it",
    hook: "A free public utility, useful to someone who has never heard of a permissioned domain.",
    usesLiveData: false,
  },
];

export type Draft = {
  platform: Platform;
  angle: string;
  body: string;
  /** Over the platform ceiling — the UI must show this, not silently truncate. */
  overLimit: boolean;
  chars: number;
  /** Anything in this draft the operator must confirm is still true. */
  verifyBefore: string[];
};

function measured(data: XrplState) {
  return {
    ledger: data.ledger?.ledgerIndex?.toLocaleString() ?? null,
    fee: data.ledger?.openLedgerFeeXrp ?? null,
  };
}

/* The measured facts. These are the real numbers this codebase produced;
   they are quoted, not approximated, and the date is carried with them so a
   reader can tell how old the reading is. */
const DEPTH = {
  advertised: "12,692,991",
  reachable: "13,894",
  factor: "913×",
  spreadBefore: "−18,675 bps",
  spreadAfter: "20 bps",
  pair: "GateHub USD/XRP",
  when: "2026-08-23",
};

const AMENDMENTS = {
  active: 93,
  version: "3.3.0",
  notActivated: ["LendingProtocol", "SingleAssetVault", "ConfidentialMPT", "Batch"],
  when: "2026-08-24",
};

export function draft(
  platform: Platform,
  angleId: string,
  data: XrplState
): Draft {
  const spec = PLATFORMS.find((p) => p.id === platform)!;
  const live = measured(data);
  const verifyBefore: string[] = [];
  let body = "";

  if (angleId === "depth") {
    verifyBefore.push(
      `The ${DEPTH.pair} figures were measured on ${DEPTH.when}. Re-run the exit analysis before posting — a book moves.`
    );
    body =
      platform === "x"
        ? `An XRPL order book advertised $${DEPTH.advertised} of depth.\n\n$${DEPTH.reachable} was actually reachable within 10% of mid. ${DEPTH.factor} overstatement.\n\nThe touch was a single stale offer at 29× the real market. Naive depth summing counts bids nobody would ever fill against.`
        : platform === "hn"
          ? `Measuring XRPL order book depth honestly is harder than it looks\n\nSumming resting offers on ${DEPTH.pair} gives $${DEPTH.advertised} of apparent depth. Only $${DEPTH.reachable} sits within 10% of mid — a ${DEPTH.factor} overstatement.\n\nTwo failure modes, both found by probing mainnet rather than reading docs:\n\n1. The touch is routinely poisoned. Best bid read 19.90 against a real market of 0.68 — one stale offer at 29×. Anchoring spread on it produced ${DEPTH.spreadBefore}. Using the tightest *uncrossed* pair instead gives ${DEPTH.spreadAfter}.\n\n2. A depth percentile is worse, not better. Bid sides carry enormous size at absurd lowball prices, so the 10th percentile of depth lands in the junk rather than the market.\n\nWhat works: anchor on the tightest uncrossed pair, then count only depth within a band of it. Everything further out is a wish, not a bid.`
          : platform === "reddit"
            ? `Why "book depth" on the XRPL DEX is mostly fiction\n\nIf you add up every resting offer on ${DEPTH.pair} you get about $${DEPTH.advertised} of buyers. That is the number most tools show.\n\nOnly $${DEPTH.reachable} of it is within 10% of the real mid — everything else is lowball bids that would never fill at a price you would accept.\n\nWorse, the top of the book had a single stale offer priced at 29× the market. Take that as your best bid and every spread you compute from it is garbage (${DEPTH.spreadBefore} in this case).\n\nHappy to share the method if useful. The fix is to anchor on the tightest uncrossed pair and band the depth around it.`
            : `Most tools reading XRPL order books are overstating liquidity by orders of magnitude.\n\nMeasured on ${DEPTH.pair}: $${DEPTH.advertised} of apparent depth, $${DEPTH.reachable} actually reachable within 10% of mid. A ${DEPTH.factor} overstatement.\n\nFor anyone marking an issued position to market, that is the difference between a holding you can exit and one you cannot. The book had a single stale offer at 29× the market sitting at the touch, which poisons every spread and slippage figure computed from it.\n\nWe built the correction into NOSHASHI because the alternative was reporting a number we could not stand behind.`;
  }

  if (angleId === "freeze") {
    body =
      platform === "x"
        ? `If you hold an issued token on XRPL — a dollar, a euro, anything that is not XRP — the issuer can usually freeze it.\n\nThe balance stays visible in your wallet. It simply stops being able to move.\n\nOne account flag decides it. Almost no wallet shows you.`
        : platform === "linkedin"
          ? `An issued balance on the XRP Ledger is only an asset if two things are true at once.\n\nThe issuer cannot immobilise it — a compliance fact, sitting in account flags that most wallets never read.\n\nAnd there is somewhere to sell it — a market fact, sitting in the DEX and the AMM pools.\n\nEither one alone is a half-answer. A position with clean freeze rights and no order book is untradeable. A position with deep liquidity behind an issuer who can freeze it at will is not owned.\n\nInstitutions carry both risks and the tooling is split: compliance vendors never read the book, market terminals never read the flags.`
          : platform === "reddit"
            ? `PSA: issued tokens on XRPL can be frozen by their issuer\n\nThis is not a bug or a loophole — it is a built-in power of the ledger, and it applies to most issued currencies (not XRP itself).\n\nThree flags worth knowing:\n\n- lsfGlobalFreeze — the issuer has frozen everything it issued, right now\n- lsfNoFreeze — the issuer has permanently given the right up, and it cannot be undone\n- XLS-77 deep freeze — blocks a specific holder from sending AND receiving\n\nThat last one matters: an ordinary freeze still lets a sanctioned address accept funds.\n\nYou can read all of this yourself with account_info on the issuer. Most people never do.`
            : `Issued tokens on the XRP Ledger can be frozen by whoever issued them.\n\nThe balance stays in your wallet and stays visible. It just stops being able to move. lsfGlobalFreeze does it in one transaction, with no warning.\n\nSome issuers set lsfNoFreeze, which is irreversible and means they can never do it. That distinction is one account_info call away and almost nothing surfaces it.`;
  }

  if (angleId === "amendments") {
    verifyBefore.push(
      `Amendment counts were read on ${AMENDMENTS.when}. Re-read Settings › Network capabilities before posting; amendments activate on a two-week majority.`
    );
    if (live.ledger) {
      verifyBefore.push(`Ledger ${live.ledger} is from this session and will be stale by the time you post — drop it or refresh it.`);
    }
    body =
      platform === "hn"
        ? `A feature your node knows about is not a feature the network accepts\n\nXRPL ships features as amendments, and one exists in three distinct states:\n\n1. Specified — an XLS document exists\n2. Implemented — rippled knows the transaction type, so server_definitions lists it\n3. Activated — validator majority reached, and only now will a transaction succeed\n\nMost tooling checks (2) and calls it support. That is how you end up shipping a lending product every validator on the network rejects.\n\nOn mainnet today (rippled ${AMENDMENTS.version}, ${AMENDMENTS.active} amendments active): Credentials, PermissionedDomains, PermissionedDEX, DeepFreeze and TokenEscrow are live. ${AMENDMENTS.notActivated.join(", ")} are not — despite all appearing in server_definitions.\n\nThe check is cheap: read the amendments object from the validated ledger and compare against SHA-512Half of each feature name. No lookup table to drift.`
        : platform === "x"
          ? `XRPL tooling keeps shipping features the network rejects.\n\nrippled knowing a transaction type ≠ the amendment being activated. server_definitions lists both.\n\n${AMENDMENTS.notActivated.slice(0, 3).join(", ")} are all implemented and all still rejected by every validator.\n\nRead the amendments object, not the definitions.`
          : platform === "reddit"
            ? `If you are building on XRPL: server_definitions will lie to you about what works\n\nAn amendment goes through three states — specified, implemented in rippled, activated by validator majority. Only the third one actually works.\n\nserver_definitions lists transaction types the binary knows, including ones no validator will accept yet. Check that and you will confidently build against ${AMENDMENTS.notActivated[0]} or ${AMENDMENTS.notActivated[1]} and wonder why everything fails.\n\nThe reliable check is the amendments object in the validated ledger. Amendment IDs are SHA-512Half of the feature name, so you can compute them locally and never depend on someone else's table.`
            : `A lesson from building on the XRP Ledger.\n\nA feature exists in three states: specified, implemented in the node software, and activated by validator majority. Only the third one works.\n\nMost tooling checks the second and calls it support — which is how a product ends up offering a capability the network rejects on every attempt.\n\nWe made our platform read the ledger's own amendment record and refuse to surface anything not genuinely live. It means saying "not available yet" more often. It also means never promising something that cannot work.`;
  }

  if (angleId === "check") {
    body =
      platform === "x"
        ? `New and free: paste any XRPL address and read what the ledger already publishes about it.\n\nCan they freeze your balance? What do they charge to transfer? What have they issued?\n\nNo account, nothing signed. No reputation score either — we do not have one and will not invent one.`
        : platform === "linkedin"
          ? `We have made the counterparty check in NOSHASHI free and public.\n\nPaste any XRP Ledger address — a merchant, a token issuer, the other side of a trade — and read what the ledger already publishes: whether they can freeze what they issue, what they charge to transfer, what is outstanding, which credentials they hold.\n\nAll of it is public today. Almost nobody looks.\n\nOne deliberate omission: there is no reputation score and no bad-actor list, because we do not have one. A clean result means nothing is recorded against that address — which is not the same as a recommendation, and the interface says so plainly.`
          : platform === "reddit"
            ? `Made a free tool for checking an XRPL address before you send to it\n\nReads what is already public: issuer freeze rights, transfer fees, outstanding obligations, credentials held, recent counterparties.\n\nDeliberately does NOT do: reputation scores, bad-actor lists, sanctions screening. We do not have that data and inventing it would be worse than useless, because people act on it.\n\nNo account needed, nothing signed, read-only.`
            : `A free public check for XRPL addresses.\n\nPaste an address and read what the ledger publishes: issuer freeze rights, transfer fees, outstanding supply, credentials, counterparty history.\n\nExplicitly not included: any reputation score. We do not hold that data, and a score people act on is the worst thing to invent.`;
  }

  const chars = body.length;
  return {
    platform,
    angle: angleId,
    body,
    chars,
    overLimit: spec.limit !== undefined && chars > spec.limit,
    verifyBefore,
  };
}
