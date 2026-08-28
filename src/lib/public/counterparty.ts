import {
  fetchAccount,
  fetchIssuerPosture,
  fetchTrustLines,
  fetchWalletCredentials,
  fetchWalletTransactions,
  fetchIssuerObligations,
  isValidAddress,
} from "@/lib/xrpl/client";
import type { CredentialRecord, IssuerPosture } from "@/lib/xrpl/types";

/**
 * Counterparty check — the public-facing half of NOSHASHI.
 *
 * Anyone can paste an address here before paying it: a shop, a token
 * issuer, someone on the other end of a P2P trade. Everything reported is
 * a published fact from the validated ledger, read only.
 *
 * Three deliberate constraints keep this safe to ship to the general
 * public:
 *
 *   1. It never moves money, holds a key, or signs anything. It is a
 *      lookup, which is why it carries none of the regulatory weight of a
 *      transmitter or a custodian.
 *   2. It never says "safe" or "trustworthy". It reports what the ledger
 *      publishes and what that implies. A clean account is an account with
 *      nothing recorded against it, which is not the same as a good one,
 *      and the copy says so.
 *   3. It never invents a reputation score. There is no list of "known bad
 *      actors" behind this, because NOSHASHI does not have one and
 *      pretending otherwise would be the worst kind of fabrication — the
 *      kind someone acts on.
 */

export type CheckSeverity = "critical" | "warn" | "info" | "ok";

export type CheckFinding = {
  id: string;
  severity: CheckSeverity;
  title: string;
  detail: string;
  /** What the reader should actually do about it. */
  action?: string;
};

export type CounterpartyVerdict = "clear" | "caution" | "avoid" | "unknown";

export type CounterpartyReport = {
  address: string;
  verdict: CounterpartyVerdict;
  headline: string;
  findings: CheckFinding[];

  exists: boolean;
  funded: boolean;
  balanceXrp: number;
  /** Domain the account claims, if any. Claimed is not verified. */
  domain?: string;
  /** Distinct counterparties seen in recent history. */
  activityCount: number;
  firstSeen?: string;
  /** Set when the address issues its own currency. */
  isIssuer: boolean;
  issuedCurrencies: string[];
  posture?: IssuerPosture;
  credentials: CredentialRecord[];
  ledgerIndex: number;
  checkedAt: string;
};

const VERDICT_COPY: Record<CounterpartyVerdict, { label: string; blurb: string }> = {
  clear: {
    label: "NOTHING RECORDED AGAINST IT",
    blurb:
      "The ledger publishes nothing that would stop you. That is not the same as a recommendation.",
  },
  caution: {
    label: "THINGS TO KNOW FIRST",
    blurb: "The ledger publishes facts here you should read before you pay.",
  },
  avoid: {
    label: "SERIOUS SIGNALS",
    blurb: "The ledger publishes something that would cost you money or control.",
  },
  unknown: {
    label: "NOT READABLE",
    blurb: "This address could not be read, so nothing about it is being asserted.",
  },
};

export { VERDICT_COPY };

/** Roughly a month of ledgers, used to describe "recent" honestly. */
const RECENT_TX_LIMIT = 60;

export async function checkCounterparty(
  raw: string
): Promise<CounterpartyReport> {
  const address = raw.trim();
  const base: CounterpartyReport = {
    address,
    verdict: "unknown",
    headline: VERDICT_COPY.unknown.label,
    findings: [],
    exists: false,
    funded: false,
    balanceXrp: 0,
    activityCount: 0,
    isIssuer: false,
    issuedCurrencies: [],
    credentials: [],
    ledgerIndex: 0,
    checkedAt: new Date().toISOString(),
  };

  if (!isValidAddress(address)) {
    return {
      ...base,
      findings: [
        {
          id: "malformed",
          severity: "critical",
          title: "That is not a valid XRPL address",
          detail:
            "An XRP Ledger address starts with r and is 25–35 characters. Check for a missing character or a copy that picked up whitespace.",
          action: "Re-copy the address from its original source, not from a message.",
        },
      ],
      headline: "NOT A VALID ADDRESS",
    };
  }

  const account = await fetchAccount(address).catch(() => null);
  if (!account) return base;

  if (account.unfunded) {
    return {
      ...base,
      exists: true,
      funded: false,
      domain: account.domain,
      verdict: "caution",
      headline: VERDICT_COPY.caution.label,
      findings: [
        {
          id: "unfunded",
          severity: "warn",
          title: "This address has never been funded",
          detail:
            "It is well-formed but does not exist on the ledger yet. Nobody has ever activated it with the base reserve, so it has no history at all.",
          action:
            "If someone gave you this address as a shop or a payee, confirm it with them another way first.",
        },
      ],
    };
  }

  // Read the rest in parallel — none of these depend on each other.
  const [credentials, lines, transactions] = await Promise.all([
    fetchWalletCredentials(address).catch(() => [] as CredentialRecord[]),
    fetchTrustLines(address).catch(() => []),
    fetchWalletTransactions(address, RECENT_TX_LIMIT).catch(() => []),
  ]);

  const obligations = await fetchIssuerObligations(address).catch(() => null);
  const issuedCurrencies = Object.keys(obligations?.obligations ?? {});
  const isIssuer = issuedCurrencies.length > 0;
  const posture = isIssuer
    ? await fetchIssuerPosture(address).catch(() => undefined)
    : undefined;

  const findings: CheckFinding[] = [];

  /* ── Identity ─────────────────────────────────────────────────── */
  if (account.domain) {
    findings.push({
      id: "domain",
      severity: "info",
      title: `Claims the domain ${account.domain}`,
      detail:
        "An account can write any domain it likes into this field. It becomes meaningful only when that domain publishes a matching xrp-ledger.toml naming this address back.",
      action: `Open https://${account.domain}/.well-known/xrp-ledger.toml and confirm this address is listed.`,
    });
  } else {
    findings.push({
      id: "no-domain",
      severity: "info",
      title: "Claims no domain",
      detail:
        "The account has not published a domain, so there is no website to check it against. Common for personal wallets, unusual for a business asking to be paid.",
    });
  }

  if (credentials.length > 0) {
    const good = credentials.filter((c) => c.accepted && !c.revoked);
    findings.push({
      id: "credentials",
      severity: good.length > 0 ? "ok" : "warn",
      title:
        good.length > 0
          ? `Holds ${good.length} accepted credential${good.length === 1 ? "" : "s"}`
          : "Holds credentials, but none currently valid",
      detail:
        good.length > 0
          ? `Someone has attested to this account on-ledger: ${good
              .map((c) => c.credentialType)
              .join(", ")}. The attestation is only worth as much as the issuer behind it.`
          : "Every credential attached to this account is either unaccepted or revoked.",
    });
  }

  /* ── Issuer posture — the expensive facts ─────────────────────── */
  if (isIssuer && posture) {
    if (posture.globalFreeze) {
      findings.push({
        id: "global-freeze",
        severity: "critical",
        title: "This issuer has frozen everything it issued",
        detail:
          "lsfGlobalFreeze is set. Every balance of every currency this account issues is immobilised right now — holders cannot send or redeem.",
        action: "Do not buy this issuer's tokens while this flag stands.",
      });
    }
    if (posture.noFreeze) {
      findings.push({
        id: "no-freeze",
        severity: "ok",
        title: "This issuer has permanently given up the right to freeze",
        detail:
          "lsfNoFreeze is set and cannot be undone. It can never immobilise a holder's balance.",
      });
    } else if (!posture.globalFreeze) {
      findings.push({
        id: "can-freeze",
        severity: "warn",
        title: "This issuer can freeze your balance at any time",
        detail:
          "lsfNoFreeze is not set, so the issuer retains the right to immobilise what it issued — yours included — in a single transaction, without warning.",
        action: "Hold only what you would accept losing access to.",
      });
    }
    if (posture.transferRateBps > 0) {
      findings.push({
        id: "transfer-fee",
        severity: "warn",
        title: `Charges ${posture.transferRateBps} basis points to transfer`,
        detail: `Moving this issuer's token costs ${(posture.transferRateBps / 100).toFixed(2)}%, taken by the issuer. It is not refundable and it applies every time the token changes hands.`,
      });
    }
    if (posture.requireAuth) {
      findings.push({
        id: "require-auth",
        severity: "info",
        title: "Requires authorisation before you can hold it",
        detail:
          "You cannot receive this issuance until the issuer explicitly authorises your account. Expect an onboarding step.",
      });
    }
    findings.push({
      id: "supply",
      severity: "info",
      title: `Issues ${issuedCurrencies.length} currenc${issuedCurrencies.length === 1 ? "y" : "ies"}`,
      detail: `Outstanding: ${issuedCurrencies
        .slice(0, 6)
        .map((c) => `${c} ${Math.round(obligations?.obligations[c] ?? 0).toLocaleString()}`)
        .join(" · ")}`,
    });
  }

  /* ── Has it frozen other people? ──────────────────────────────── */
  const frozenByThem = lines.filter((l) => l.frozenByIssuer || l.deepFrozenByIssuer);
  if (frozenByThem.length > 0) {
    findings.push({
      id: "freezes-others",
      severity: "warn",
      title: `Has frozen ${frozenByThem.length} counterpart${frozenByThem.length === 1 ? "y" : "ies"}`,
      detail:
        "This account has used freeze against people it deals with. That may be entirely legitimate — a sanctions response, for instance — but it demonstrates both the willingness and the ability to do it.",
    });
  }

  /* ── Activity ─────────────────────────────────────────────────── */
  const counterparties = new Set(
    transactions.map((t) => t.counterparty).filter(Boolean) as string[]
  );
  if (transactions.length === 0) {
    findings.push({
      id: "no-history",
      severity: "warn",
      title: "No recent transaction history",
      detail:
        "The account is funded but nothing recent is visible. A shop asking for payment should have a trail.",
    });
  } else {
    findings.push({
      id: "history",
      severity: "info",
      title: `${transactions.length} recent transactions across ${counterparties.size} counterparties`,
      detail:
        counterparties.size <= 2
          ? "Almost all activity is with the same one or two addresses, which is unusual for a business."
          : "Activity is spread across a range of counterparties.",
    });
  }

  /* ── Verdict — worst finding wins, and it is never a recommendation ── */
  const worst = findings.reduce<CheckSeverity>((acc, f) => {
    const rank = { critical: 3, warn: 2, info: 1, ok: 0 } as const;
    return rank[f.severity] > rank[acc] ? f.severity : acc;
  }, "ok");

  const verdict: CounterpartyVerdict =
    worst === "critical" ? "avoid" : worst === "warn" ? "caution" : "clear";

  return {
    address,
    verdict,
    headline: VERDICT_COPY[verdict].label,
    findings: findings.sort((a, b) => {
      const rank = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
      return rank[a.severity] - rank[b.severity];
    }),
    exists: true,
    funded: true,
    balanceXrp: Number(account.balanceXrp),
    domain: account.domain,
    activityCount: transactions.length,
    isIssuer,
    issuedCurrencies,
    posture,
    credentials,
    ledgerIndex: obligations?.ledgerIndex ?? 0,
    checkedAt: new Date().toISOString(),
  };
}
