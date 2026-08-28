import { rpc, XrplError } from "@/lib/xrpl/client";

/**
 * AMM governance surveillance.
 *
 * An XRPL AMM's trading fee is not set by its operator — there is no
 * operator. It is voted on by liquidity providers, weighted by their share
 * of the LP token, across at most eight vote slots. Separately, an auction
 * slot can be bought that grants its holder a discounted fee for a 24-hour
 * window in twenty intervals.
 *
 * Nobody displays either. Explorers show the pool's balances and its current
 * fee, which is the output; this module shows who decided it, on how thin a
 * base, and who is currently trading against the pool more cheaply than
 * everyone else. For a desk providing liquidity that is the difference
 * between a pool and a pool someone else controls.
 *
 * Three shape problems, all verified against mainnet on 2026-08-27:
 *
 *   1. `amm_info` normalises what the raw ledger object leaves absent — a
 *      zero trading fee is missing entirely from the `amm` ledger entry but
 *      comes back as a real `0` here. That is why this reads `amm_info` and
 *      not `ledger_entry`; the absence trap is already handled upstream.
 *
 *   2. `auction_slot.expiration` is an ISO 8601 string from `amm_info` and a
 *      Ripple-epoch integer in the ledger object. Worse, the string carries a
 *      `+0000` offset, which V8 parses and WKWebView historically does not —
 *      and Tauri renders in WKWebView on macOS. It is normalised below
 *      rather than handed to `new Date()` as received.
 *
 *   3. `asset_frozen` is absent when the asset is XRP, because XRP cannot be
 *      frozen. Absent here means not-applicable, not false, and rendering it
 *      as "not frozen" would state a guarantee the ledger never made.
 */

/** Vote weights and fees are both expressed in units of 1/100,000. */
const WEIGHT_SCALE = 100_000;
/** Fee in the same units: 1,000 = 1.000%, which is also the protocol maximum. */
const FEE_SCALE = 1_000;

export type VoteSlot = {
  account: string;
  /** Fee this LP is voting for, as a percentage. */
  votedFeePct: number;
  /** This voter's share of the LP token, as a fraction of total supply. */
  weightOfSupply: number;
  /** This voter's share of the weight actually cast. */
  weightOfCast: number;
};

export type AuctionSlot = {
  holder: string;
  discountedFeePct: number;
  expiresAt: Date;
  /** Measured against the validated ledger's close time, not the wall clock. */
  expired: boolean;
  pricePaid: number;
  /** Accounts the holder nominated to also receive the discount. */
  authAccounts: string[];
};

export type AmmReport = {
  account: string;
  pair: string;
  tradingFeePct: number;
  /** Sum of all cast vote weight as a fraction of LP supply. */
  participation: number;
  votes: VoteSlot[];
  auction?: AuctionSlot;
  lpTokenSupply: number;
  /** undefined means the asset is XRP and freezing does not apply. */
  assetFrozen?: boolean;
  asset2Frozen?: boolean;
  ledgerCloseTime: Date;
  ledgerIndex: number;
  readAt: string;
};

const RIPPLE_EPOCH_OFFSET = 946_684_800;

/**
 * `amm_info` returns `+0000`; only `+00:00` is portable across engines.
 * Returns null rather than an Invalid Date so callers cannot render NaN.
 */
function parseAmmDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date((value + RIPPLE_EPOCH_OFFSET) * 1000);
  }
  if (typeof value !== "string" || value.length === 0) return null;
  const normalised = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const parsed = new Date(normalised);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function assetLabel(asset: unknown): string {
  if (!asset || typeof asset !== "object") return "XRP";
  const a = asset as Record<string, unknown>;
  const currency = String(a.currency ?? "XRP");
  if (currency === "XRP") return "XRP";
  // 160-bit hex currency codes carry an ASCII name padded with zeroes.
  if (/^[0-9A-F]{40}$/i.test(currency)) {
    const decoded = (currency.match(/../g) ?? [])
      .map((byte) => String.fromCharCode(parseInt(byte, 16)))
      .join("")
      .replace(/\0+$/, "")
      .trim();
    if (decoded && /^[\x20-\x7E]+$/.test(decoded)) return decoded;
  }
  return currency;
}

export async function readAmm(
  input: { ammAccount: string } | { asset: unknown; asset2: unknown }
): Promise<AmmReport> {
  /*
   * A non-AMM account makes `amm_info` reject rather than return an error
   * field, so the friendly message has to come out of the catch.
   */
  const NOT_AN_AMM =
    "No AMM exists at that address. An AMM account is created by the protocol when a pool is opened — it is not an ordinary wallet, and a wallet address will not resolve here.";

  let res: Record<string, any>;
  let led: Record<string, any>;
  try {
    [res, led] = await Promise.all([
      rpc("amm_info", {
        ...("ammAccount" in input
          ? { amm_account: input.ammAccount }
          : { asset: input.asset, asset2: input.asset2 }),
        ledger_index: "validated",
      }),
      rpc("ledger", { ledger_index: "validated" }),
    ]);
  } catch (caught) {
    // rippled answers a non-AMM address with actNotFound / actMalformed,
    // whose bare text ("Account not found.") explains nothing to someone who
    // has just pasted a perfectly valid wallet.
    if (
      caught instanceof XrplError &&
      (caught.code === "actNotFound" || caught.code === "actMalformed")
    ) {
      throw new Error(NOT_AN_AMM);
    }
    throw caught;
  }

  if (!res.amm) throw new Error(NOT_AN_AMM);

  const amm = res.amm as Record<string, any>;
  const closeTime = Number(led.ledger?.close_time ?? 0);
  const ledgerCloseTime = new Date((closeTime + RIPPLE_EPOCH_OFFSET) * 1000);

  const rawVotes = (amm.vote_slots ?? []) as Array<Record<string, any>>;
  const castWeight = rawVotes.reduce((sum, v) => sum + Number(v.vote_weight ?? 0), 0);

  const votes: VoteSlot[] = rawVotes
    .map((v) => ({
      account: String(v.account ?? ""),
      votedFeePct: Number(v.trading_fee ?? 0) / FEE_SCALE,
      weightOfSupply: Number(v.vote_weight ?? 0) / WEIGHT_SCALE,
      weightOfCast: castWeight > 0 ? Number(v.vote_weight ?? 0) / castWeight : 0,
    }))
    .sort((a, b) => b.weightOfSupply - a.weightOfSupply);

  let auction: AuctionSlot | undefined;
  const slot = amm.auction_slot as Record<string, any> | undefined;
  if (slot?.account) {
    const expiresAt = parseAmmDate(slot.expiration);
    if (expiresAt) {
      auction = {
        holder: String(slot.account),
        discountedFeePct: Number(slot.discounted_fee ?? 0) / FEE_SCALE,
        expiresAt,
        expired: expiresAt.getTime() < ledgerCloseTime.getTime(),
        pricePaid: Number(slot.price?.value ?? 0),
        authAccounts: ((slot.auth_accounts ?? []) as Array<Record<string, any>>)
          .map((a) => String(a.account ?? ""))
          .filter(Boolean),
      };
    }
  }

  return {
    account: String(amm.account ?? ""),
    pair: `${assetLabel(amm.amount)} / ${assetLabel(amm.amount2)}`,
    tradingFeePct: Number(amm.trading_fee ?? 0) / FEE_SCALE,
    participation: castWeight / WEIGHT_SCALE,
    votes,
    auction,
    lpTokenSupply: Number(amm.lp_token?.value ?? 0),
    // Preserved as undefined for XRP: absent means inapplicable, not false.
    assetFrozen: typeof amm.asset_frozen === "boolean" ? amm.asset_frozen : undefined,
    asset2Frozen: typeof amm.asset2_frozen === "boolean" ? amm.asset2_frozen : undefined,
    ledgerCloseTime,
    ledgerIndex: Number(led.ledger_index ?? led.ledger?.ledger_index ?? 0),
    readAt: new Date().toISOString(),
  };
}

export type AmmFinding = {
  id: string;
  severity: "critical" | "warn" | "info" | "ok";
  title: string;
  detail: string;
  action?: string;
};

/** Below this share of LP supply voting, the fee is set by a rounding error. */
const THIN_PARTICIPATION = 0.1;
/** A single voter at or above this share of cast weight decides the fee alone. */
const CONTROLLING_SHARE = 0.5;

export function ammFindings(report: AmmReport): AmmFinding[] {
  const out: AmmFinding[] = [];
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

  const top = report.votes[0];

  if (report.votes.length === 0) {
    out.push({
      id: "no-votes",
      severity: "warn",
      title: "Nobody is voting on this pool's fee",
      detail: `All eight vote slots are empty, so the trading fee sits at ${report.tradingFeePct.toFixed(3)}% by default. The first liquidity provider to cast a vote sets it, at whatever weight they hold.`,
      action: "If you hold LP tokens here, your vote is currently unopposed.",
    });
  } else if (top && top.weightOfCast >= CONTROLLING_SHARE) {
    out.push({
      id: "vote-capture",
      severity: top.weightOfCast >= 0.99 ? "critical" : "warn",
      title: `One account controls ${pct(top.weightOfCast)} of the votes cast`,
      detail: `${top.account} carries ${pct(top.weightOfCast)} of all weight cast and is voting for a ${top.votedFeePct.toFixed(3)}% fee. The pool charges ${report.tradingFeePct.toFixed(3)}%. Fee changes here do not require anyone else's agreement.`,
      action:
        "Treat the fee on this pool as a number one counterparty sets, not a market outcome.",
    });
  } else {
    out.push({
      id: "vote-spread",
      severity: "ok",
      title: `Fee votes are spread across ${report.votes.length} providers`,
      detail: `The largest single voter carries ${pct(top?.weightOfCast ?? 0)} of weight cast. No one account can move the fee alone.`,
    });
  }

  if (report.participation < THIN_PARTICIPATION && report.votes.length > 0) {
    out.push({
      id: "thin-participation",
      severity: "warn",
      title: `The fee is set by ${pct(report.participation)} of the liquidity`,
      detail: `Vote weight is a share of LP token supply, and only ${pct(report.participation)} of that supply has voted. The remaining ${pct(1 - report.participation)} of providers are accepting a fee chosen by a fraction of a percent of the pool.`,
      action:
        "A small LP position can carry disproportionate governance weight here.",
    });
  }

  if (report.auction) {
    const a = report.auction;
    if (a.expired) {
      out.push({
        id: "auction-expired",
        severity: "info",
        title: "The auction slot is expired and unclaimed",
        detail: `The last holder was ${a.holder}, whose window closed ${a.expiresAt.toISOString().slice(0, 10)} — ${Math.floor((report.ledgerCloseTime.getTime() - a.expiresAt.getTime()) / 86_400_000).toLocaleString()} days before the ledger this was read from. Nobody currently holds a discounted fee, and the slot is available.`,
        action: `Claiming it would trade at ${a.discountedFeePct.toFixed(3)}% against everyone else's ${report.tradingFeePct.toFixed(3)}%.`,
      });
    } else {
      const ratio =
        a.discountedFeePct > 0 ? report.tradingFeePct / a.discountedFeePct : Infinity;
      out.push({
        id: "auction-active",
        severity: "warn",
        title: `${a.holder} is trading this pool at a discount right now`,
        detail: `The auction slot holder pays ${a.discountedFeePct.toFixed(3)}% while every other participant pays ${report.tradingFeePct.toFixed(3)}%${Number.isFinite(ratio) ? ` — ${ratio.toFixed(0)}x cheaper` : " — the holder trades free"}. The window closes ${a.expiresAt.toISOString().replace("T", " ").slice(0, 16)} UTC.${a.authAccounts.length > 0 ? ` ${a.authAccounts.length} further account${a.authAccounts.length === 1 ? " has" : "s have"} been nominated to share the discount.` : ""}`,
        action:
          "Arbitrage against this pool is asymmetric until that window closes.",
      });
    }
  } else {
    out.push({
      id: "auction-none",
      severity: "ok",
      title: "No auction slot is held",
      detail: `Every participant pays the same ${report.tradingFeePct.toFixed(3)}% fee.`,
    });
  }

  for (const [label, frozen] of [
    ["First asset", report.assetFrozen],
    ["Second asset", report.asset2Frozen],
  ] as const) {
    if (frozen === true) {
      out.push({
        id: `frozen-${label}`,
        severity: "critical",
        title: `${label} in this pair is frozen by its issuer`,
        detail:
          "A frozen asset cannot leave the pool. Liquidity in this AMM is not withdrawable while the freeze stands, regardless of what the pool balance shows.",
        action: "Do not treat this pool's depth as available liquidity.",
      });
    }
  }

  const rank = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
