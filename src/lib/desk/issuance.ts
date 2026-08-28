import { rpc } from "@/lib/xrpl/client";

/**
 * Issuance surveillance — the view from the issuer's side.
 *
 * Everything else in NOSHASHI serves someone who *holds* a token. This
 * serves whoever issued it, which is a different buyer with a different
 * question: who is actually holding my paper, how concentrated is it, and
 * what have I done to them?
 *
 * Two integrity problems shape the whole module:
 *
 *   1. `account_lines` paginates, and an issuer of any size has more
 *      holders than one page. Concentration over a partial holder set has
 *      no known direction of error: normalising shares over what was
 *      observed inflates every one of them, while a whale sitting on a page
 *      the walk never reached deflates the top share. Those two effects
 *      fight, so a low-coverage HHI is not a floor, an estimate, or a
 *      conservative reading — it is not a measurement at all, and this
 *      module refuses to report one rather than dressing it in a caveat.
 *
 *   2. A trust line only carries `freeze` / `authorized` when those flags
 *      are set — they are absent otherwise, not `false`. Reading absence as
 *      "not frozen" is the same class of error as reading a failed request
 *      as zero, so this counts what it saw and says so.
 *
 * The holder sum is also cross-checked against `gateway_balances`. Those
 * two come from different commands and should agree; when they do not, the
 * walk was incomplete and the module says which figure to trust.
 */

/**
 * Hard ceiling on pages.
 *
 * The page size we ask for is not the page size we get: public clusters cap
 * `account_lines` at 200 rows however large a `limit` you send. Measured
 * against a mainnet issuer on 2026-08-27, `limit: 400` returned exactly 200
 * per page, every page. The real ceiling is therefore MAX_PAGES x 200.
 *
 * That same measurement is why this number is large and why coverage gates
 * every concentration figure. Walking one issuer's ~8.1M USD of obligations,
 * observed coverage went:
 *
 *     page  20 →  0.50%
 *     page  40 →  1.44%
 *     page  60 →  1.59%
 *     page  80 → 47.79%     <- one holder, twelve thousand lines in
 *     page 100 → 60.05%
 *
 * A walk that stopped at page 60 would have computed its concentration over
 * 1.59% of the supply and been wrong by a factor no caveat can express. The
 * whale is not at the front, the ledger does not order by balance, and there
 * is no page count at which partial results become safe to report.
 */
const MAX_PAGES = 250;
const PAGE_SIZE = 400;

/** Reports walk progress so a 40-second survey is not a bare spinner. */
export type IssuanceProgress = {
  linesWalked: number;
  pages: number;
};

export type HolderLine = {
  account: string;
  currency: string;
  /** Positive: what this account holds of the issuance. */
  held: number;
  /** The holder's trust limit — headroom they have granted the issuer. */
  limit: number;
  /** True only when the flag was present and set. */
  frozenByIssuer: boolean;
  authorized: boolean;
};

export type CurrencySurveillance = {
  currency: string;
  /** Authoritative outstanding, from gateway_balances. */
  outstanding: number;
  /** Summed from the holder lines actually walked. */
  observedHeld: number;
  holders: number;
  /** Holders carrying a non-zero balance. Dormant lines are the rest. */
  activeHolders: number;
  /** Herfindahl-Hirschman Index over held balances, 0–10,000. */
  hhi: number;
  topHolderPct: number;
  topFivePct: number;
  frozenSeen: number;
  authorizedSeen: number;
  /** observedHeld / outstanding. Well under 1 means the walk missed holders. */
  coverage: number;
  top: HolderLine[];
};

export type IssuanceReport = {
  issuer: string;
  domain?: string;
  currencies: CurrencySurveillance[];
  linesWalked: number;
  /** True when the walk stopped before the ledger ran out of holders. */
  truncated: boolean;
  /** Set when the walk stopped because a page failed, rather than on the cap. */
  walkError?: string;
  requiresAuth: boolean;
  canFreeze: boolean;
  globalFreeze: boolean;
  ledgerIndex: number;
  readAt: string;
};

const LSF_REQUIRE_AUTH = 0x00040000;
const LSF_GLOBAL_FREEZE = 0x00400000;
const LSF_NO_FREEZE = 0x00200000;

function hhiOf(values: number[]): number {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return values.reduce((acc, v) => acc + ((v / total) * 100) ** 2, 0);
}

export async function readIssuance(
  issuer: string,
  onProgress?: (p: IssuanceProgress) => void
): Promise<IssuanceReport> {
  const [info, balances] = await Promise.all([
    rpc("account_info", { account: issuer, ledger_index: "validated" }),
    rpc("gateway_balances", { account: issuer, ledger_index: "validated" }),
  ]);

  const data = info.account_data ?? {};
  const flags = Number(data.Flags ?? 0);

  const outstanding: Record<string, number> = {};
  for (const [currency, value] of Object.entries(
    (balances.obligations ?? {}) as Record<string, string>
  )) {
    const n = Number(value);
    if (Number.isFinite(n)) outstanding[currency] = n;
  }

  // Walk every holder line the ledger will give us.
  const lines: HolderLine[] = [];
  let marker: unknown = undefined;
  let pages = 0;
  let truncated = false;
  let walkError: string | undefined;

  while (pages < MAX_PAGES) {
    /*
     * `rpc` rejects on a ledger error rather than returning one, so a single
     * failed page part-way through a 250-page walk would otherwise throw away
     * every holder already read. Catching here keeps the partial walk and
     * lets the report say why it stopped — a survey that returns 40,000
     * holders and admits it stopped early beats one that returns nothing.
     */
    let res: Record<string, any>;
    try {
      res = await rpc("account_lines", {
        account: issuer,
        ledger_index: "validated",
        limit: PAGE_SIZE,
        ...(marker ? { marker } : {}),
      });
    } catch (caught) {
      if (pages === 0) throw caught; // Nothing read at all: a real failure.
      walkError = caught instanceof Error ? caught.message : "the walk was interrupted";
      truncated = true;
      break;
    }

    for (const raw of (res.lines ?? []) as Array<Record<string, any>>) {
      lines.push({
        account: String(raw.account ?? ""),
        currency: String(raw.currency ?? ""),
        // From the issuer's side a holder's balance is reported negative.
        held: Math.abs(Number(raw.balance ?? 0)),
        limit: Number(raw.limit_peer ?? raw.limit ?? 0),
        // Present-and-true, never absent-means-false.
        frozenByIssuer: raw.freeze === true,
        authorized: raw.authorized === true,
      });
    }

    marker = res.marker;
    pages += 1;
    onProgress?.({ linesWalked: lines.length, pages });
    if (!marker) break;
    if (pages >= MAX_PAGES) truncated = true;
  }

  const currencies: CurrencySurveillance[] = Object.keys(outstanding)
    .map((currency) => {
      const forCurrency = lines.filter((l) => l.currency === currency);
      const active = forCurrency.filter((l) => l.held > 0).sort((a, b) => b.held - a.held);
      const held = active.map((l) => l.held);
      const observedHeld = held.reduce((a, b) => a + b, 0);
      const supply = outstanding[currency];

      return {
        currency,
        outstanding: supply,
        observedHeld,
        holders: forCurrency.length,
        activeHolders: active.length,
        hhi: hhiOf(held),
        topHolderPct: observedHeld > 0 ? (held[0] ?? 0) / observedHeld : 0,
        topFivePct:
          observedHeld > 0
            ? held.slice(0, 5).reduce((a, b) => a + b, 0) / observedHeld
            : 0,
        frozenSeen: forCurrency.filter((l) => l.frozenByIssuer).length,
        authorizedSeen: forCurrency.filter((l) => l.authorized).length,
        coverage: supply > 0 ? observedHeld / supply : 0,
        top: active.slice(0, 10),
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);

  return {
    issuer,
    domain: data.Domain
      ? (() => {
          try {
            return decodeURIComponent(
              String(data.Domain).replace(/(..)/g, "%$1")
            );
          } catch {
            return undefined;
          }
        })()
      : undefined,
    currencies,
    linesWalked: lines.length,
    truncated,
    walkError,
    requiresAuth: (flags & LSF_REQUIRE_AUTH) !== 0,
    canFreeze: (flags & LSF_NO_FREEZE) === 0,
    globalFreeze: (flags & LSF_GLOBAL_FREEZE) !== 0,
    ledgerIndex: Number(info.ledger_index ?? 0),
    readAt: new Date().toISOString(),
  };
}

export type IssuanceFinding = {
  id: string;
  severity: "critical" | "warn" | "info" | "ok";
  title: string;
  detail: string;
  action?: string;
};

/** A regulator treats anything above this as a highly concentrated market. */
const HHI_CONCENTRATED = 2500;
/** Coverage below this means the holder walk missed too much to trust. */
const COVERAGE_FLOOR = 0.95;

export function issuanceFindings(report: IssuanceReport): IssuanceFinding[] {
  const out: IssuanceFinding[] = [];

  if (report.walkError) {
    out.push({
      id: "walk-error",
      severity: "warn",
      title: "The holder walk was cut short by a failed read",
      detail: `The ledger stopped answering part-way through: ${report.walkError}. ${report.linesWalked.toLocaleString()} lines were read before that. Everything below is computed on what was retrieved, which is a smaller set than this issuer actually has.`,
      action: "Run the survey again — a fresh walk usually completes.",
    });
  } else if (report.truncated) {
    out.push({
      id: "truncated",
      severity: "warn",
      title: "Holder walk stopped before the end",
      detail: `Read ${report.linesWalked.toLocaleString()} lines and the ledger had more. Every concentration figure below is computed on that subset, and concentration on a partial holder set can only understate — the largest holder may be on a page this did not reach.`,
      action: "Treat the figures as provisional until a complete walk is possible.",
    });
  }

  for (const c of report.currencies) {
    if (c.outstanding <= 0) continue;

    // Coverage is the integrity check: two different commands should agree.
    if (c.coverage < COVERAGE_FLOOR) {
      out.push({
        id: `coverage-${c.currency}`,
        severity: "warn",
        title: `${c.currency}: holder lines account for only ${(c.coverage * 100).toFixed(1)}% of supply`,
        detail: `gateway_balances reports ${c.outstanding.toLocaleString(undefined, { maximumFractionDigits: 2 })} outstanding, but the holder lines read sum to ${c.observedHeld.toLocaleString(undefined, { maximumFractionDigits: 2 })}. Those come from different commands and should agree, so the gap is holders this walk did not see.`,
        action: "Trust the outstanding figure; treat the holder breakdown as incomplete.",
      });
    }

    /*
     * Coverage gates every concentration claim, in BOTH directions. A green
     * "holdings are distributed" computed over 0.5% of supply is a false
     * all-clear, and a red one is a false alarm; neither is salvageable by
     * printing a caveat next to it.
     */
    const measurable = c.coverage >= COVERAGE_FLOOR;

    if (!measurable) {
      out.push({
        id: `hhi-unknown-${c.currency}`,
        severity: "warn",
        title: `${c.currency}: concentration cannot be measured from this walk`,
        detail: `The holder lines read account for ${(c.coverage * 100).toFixed(1)}% of the ${c.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })} outstanding. Shares computed over that fraction are inflated by the small denominator and deflated by whichever large holders went unseen, so no concentration figure — high or low — can be reported for this issuance.`,
        action: "Run this against a node that can complete the holder walk before drawing any conclusion about concentration.",
      });
    } else if (c.hhi >= HHI_CONCENTRATED) {
      out.push({
        id: `hhi-${c.currency}`,
        severity: c.hhi >= 5000 ? "critical" : "warn",
        title: `${c.currency}: holdings are highly concentrated (HHI ${Math.round(c.hhi).toLocaleString()})`,
        detail: `The largest holder carries ${(c.topHolderPct * 100).toFixed(1)}% of observed supply and the top five carry ${(c.topFivePct * 100).toFixed(1)}%, across ${c.activeHolders.toLocaleString()} accounts with a balance. A regulator treats anything above 2,500 as a highly concentrated market; this issuance is effectively held by a handful of counterparties.`,
        action:
          "Understand who those accounts are. A single redemption from the top holder would move most of the float.",
      });
    } else {
      out.push({
        id: `hhi-ok-${c.currency}`,
        severity: "ok",
        title: `${c.currency}: holdings are distributed (HHI ${Math.round(c.hhi).toLocaleString()})`,
        detail: `${c.activeHolders.toLocaleString()} accounts hold a balance, the largest at ${(c.topHolderPct * 100).toFixed(1)}%.`,
      });
    }

    const dormant = c.holders - c.activeHolders;
    if (dormant > 0) {
      out.push({
        id: `dormant-${c.currency}`,
        severity: "info",
        title: `${c.currency}: ${dormant.toLocaleString()} trust lines carry no balance`,
        detail: `Of ${c.holders.toLocaleString()} lines opened against this issuance, ${dormant.toLocaleString()} sit at zero. Each still costs its holder reserve, and a large dormant count usually means an onboarding funnel that people started and abandoned.`,
      });
    }

    if (c.frozenSeen > 0) {
      out.push({
        id: `frozen-${c.currency}`,
        severity: "info",
        title: `${c.currency}: ${c.frozenSeen} holder${c.frozenSeen === 1 ? "" : "s"} frozen by you`,
        detail:
          "Individually frozen lines seen in the walk. This is a record of enforcement actions you have taken and is visible to anyone reading the ledger.",
      });
    }
  }

  /* Issuer posture — what you can still do to holders. */
  if (report.globalFreeze) {
    out.push({
      id: "global-freeze",
      severity: "critical",
      title: "Every balance you issued is frozen right now",
      detail:
        "lsfGlobalFreeze is set. No holder can send or redeem anything you issued while it stands.",
    });
  } else if (report.canFreeze) {
    out.push({
      id: "can-freeze",
      severity: "info",
      title: "You retain the right to freeze",
      detail:
        "lsfNoFreeze is not set, so you can immobilise any holder's balance. Holders can read this, and a counterparty assessing you will treat it as a risk they carry.",
      action:
        "If you never intend to freeze, setting lsfNoFreeze is irreversible and materially improves how your issuance is assessed.",
    });
  } else {
    out.push({
      id: "no-freeze",
      severity: "ok",
      title: "You have permanently surrendered freeze",
      detail:
        "lsfNoFreeze is set and cannot be undone. Holders can verify that you are unable to immobilise their balances.",
    });
  }

  if (report.requiresAuth) {
    out.push({
      id: "require-auth",
      severity: "info",
      title: "Holders must be authorised individually",
      detail:
        "lsfRequireAuth is set, so nobody can hold your issuance until you authorise their line. Onboarding depends on you acting.",
    });
  }

  const rank = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
