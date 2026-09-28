import type { Holdings } from "./objects";
import { lineSide } from "./objects";
import { recoveryFrom } from "./recovery";
import { decodeCurrency } from "../../../supabase/functions/_shared/xrplEvents.ts";

/**
 * Emergency kit — what to sign, in what order, the moment an account is
 * compromised.
 *
 * When a thief has an account's key, it is a race: whoever's transactions
 * land first wins. The kit is the whole response prepared in advance as
 * unsigned transactions, ordered so the most valuable moves come first:
 *
 *   1. take away what others can pull (NFT sell offers, checks you wrote);
 *   2. move the value out to a cold account you control (AccountDelete when
 *      nothing blocks it, since it sweeps every drop in one transaction;
 *      otherwise a payment of the spendable XRP and each token);
 *   3. change who can sign, so nothing more can be taken.
 *
 * With Tickets the kit can be signed now, while the key is still yours, and
 * kept offline: transactions that use a ticket stay valid whatever happens
 * to the account's sequence. A higher fee helps a transaction win the race
 * into the next ledger. NOSHASHI never signs: every step is for the owner's
 * own wallet.
 */

type Json = Record<string, any>;

export type KitStep = {
  id: string;
  order: number;
  title: string;
  why: string;
  tx: Json;
  caution?: string;
};

export type EmergencyKit = {
  address: string;
  cold: string;
  steps: KitStep[];
  /** The TicketCreate to sign first when the kit is to be pre-signed. */
  tickets: Json | null;
  sweepsEverything: boolean;
  notes: string[];
};

export type KitOptions = {
  /** An account you control on a device that never held this account's key. */
  cold: string;
  /** A new key to hand signing to, if the account is to be kept. */
  newRegularKey?: string;
  /** Build every step on a Ticket so the kit can be signed now and kept offline. */
  useTickets?: boolean;
  /** Fee in drops for every step; a higher fee helps win the race. Default 5000 (0.005 XRP). */
  feeDrops?: number;
};

const LSF_SELL_NFTOKEN = 0x00000001;

export function emergencyKit(h: Holdings, opts: KitOptions): EmergencyKit {
  const me = h.address;
  if (!h.root) throw new Error("There is no account at this address to protect.");
  if (opts.cold === me) throw new Error("The cold account must be a different account.");
  const fee = String(opts.feeDrops ?? 5000);
  const steps: Omit<KitStep, "order">[] = [];

  // 1. What others can pull.
  const sellOffers = h.objects.filter((o) => o.LedgerEntryType === "NFTokenOffer" && o.Owner === me && (Number(o.Flags ?? 0) & LSF_SELL_NFTOKEN) !== 0);
  for (let i = 0; i < sellOffers.length; i += 200) {
    const batch = sellOffers.slice(i, i + 200);
    steps.push({ id: `nft-offers-${i}`, title: `Cancel ${batch.length} NFT sell offer${batch.length === 1 ? "" : "s"}`, why: "Anyone holding one of these can take the NFT at its price, including a thief's own zero-price offer.", tx: { TransactionType: "NFTokenCancelOffer", Account: me, NFTokenOffers: batch.map((o) => String(o.index)) } });
  }
  for (const c of h.objects.filter((o) => o.LedgerEntryType === "Check" && o.Account === me)) {
    steps.push({ id: `check-${c.index}`, title: `Cancel the check to ${c.Destination}`, why: "Its payee can pull from the account until it is cancelled.", tx: { TransactionType: "CheckCancel", Account: me, CheckID: String(c.index) } });
  }

  // 2. Move the value out.
  const report = recoveryFrom(h);
  const blockers = report.deletion.blockers.filter((b) => !/sequence is too recent/.test(b));
  // Objects the read did not reach may block AccountDelete: an AccountDelete that fails
  // loses the race, so it is used only when every object the account owns is known.
  const unread = Math.max(0, Number(h.root.OwnerCount ?? 0) - h.objects.length - h.nfts.length);
  if (!h.complete || unread > 0) blockers.push(`${unread || "some"} object${unread === 1 ? "" : "s"} the read did not reach (NFT pages, for example)`);
  const sweepsEverything = blockers.length === 0;
  if (sweepsEverything) {
    steps.push({
      id: "sweep-delete",
      title: `Delete the account into ${opts.cold}`,
      why: `AccountDelete sends every drop the account holds (${report.balanceXrp.toLocaleString("en-US")} XRP today, less its fee) to the cold account in one transaction, however the balance changes before it is submitted.`,
      tx: { TransactionType: "AccountDelete", Account: me, Destination: opts.cold, Fee: String(Math.max(Number(fee), Math.round(h.reserveIncXrp * 1_000_000))) },
      caution: "The account must be at least 256 ledgers past its last sequence when this is submitted. It is gone afterwards; anything sent to it later needs the reserve anew.",
    });
  } else {
    const lines = h.objects.filter((o) => o.LedgerEntryType === "RippleState").map((o) => lineSide(o, me)).filter((l) => l.balance > 0);
    for (const l of lines) {
      steps.push({
        id: `token-${l.currency}-${l.counterparty}`,
        title: `Send the ${l.balance.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${decodeCurrency(l.currency)} to ${opts.cold}`,
        why: "Tokens are taken as easily as XRP.",
        tx: { TransactionType: "Payment", Account: me, Destination: opts.cold, Amount: { currency: l.currency, issuer: l.counterparty, value: String(l.balance) } },
        caution: `The cold account needs a trust line to ${l.counterparty} for ${decodeCurrency(l.currency)}, set before the emergency.`,
      });
    }
    steps.push({
      id: "sweep-xrp",
      title: `Send the spendable XRP to ${opts.cold}`,
      why: `AccountDelete is blocked by ${blockers.join(", ")}, so the XRP above the reserve is paid out instead.`,
      tx: { TransactionType: "Payment", Account: me, Destination: opts.cold, Amount: "0" },
      caution: "The amount is fixed when signed, leaving the fees of the kit (and the reserve of its unused tickets) behind. If the balance has fallen by the time it is submitted, it fails: rebuild it with the amount shown then.",
    });
    const offers = h.objects.filter((o) => o.LedgerEntryType === "Offer" && o.Account === me);
    for (const o of offers) steps.push({ id: `offer-${o.index}`, title: `Cancel order ${o.Sequence}`, why: "An open order can be filled at a stale price while you are busy.", tx: { TransactionType: "OfferCancel", Account: me, OfferSequence: o.Sequence } });
  }

  // 3. Who can sign.
  if (!sweepsEverything) {
    if (opts.newRegularKey) {
      steps.push({ id: "rotate", title: "Hand signing to a new key", why: "A thief holding the old regular key loses it.", tx: { TransactionType: "SetRegularKey", Account: me, RegularKey: opts.newRegularKey } });
      steps.push({ id: "disable-master", title: "Disable the master key", why: "If the master seed is what leaked, this is the only way to stop it signing.", tx: { TransactionType: "AccountSet", Account: me, SetFlag: 4 }, caution: "Only after the new regular key has signed a test transaction, or the account locks for good." });
    } else {
      steps.push({ id: "rotate", title: "Hand signing to a new key", why: "Choose a key from a hardware wallet that never held this seed.", tx: { TransactionType: "SetRegularKey", Account: me, RegularKey: "<a new key's address>" } });
    }
  }

  const ordered: KitStep[] = steps.map((s, i) => ({ ...s, order: i + 1 }));
  let tickets: Json | null = null;
  if (opts.useTickets) {
    tickets = { TransactionType: "TicketCreate", Account: me, TicketCount: ordered.length, Fee: fee };
    ordered.forEach((s, i) => {
      s.tx = { ...s.tx, Sequence: 0, TicketSequence: `<ticket ${i + 1} from the TicketCreate>` };
    });
  }
  for (const s of ordered) if (!s.tx.Fee) s.tx.Fee = fee;

  // The XRP payment leaves behind every fee the kit spends and, with tickets, the reserve of
  // the tickets still unused when it lands (its own included), so it cannot fail for want of either.
  const sweep = ordered.find((s) => s.id === "sweep-xrp");
  if (sweep) {
    const feesDrops = ordered.reduce((n, s) => n + Number(s.tx.Fee), 0) + (tickets ? Number(fee) : 0);
    const ticketsOutstanding = tickets ? ordered.length - sweep.order + 1 : 0;
    const drops = Math.max(0, Math.floor(report.spendableXrp * 1_000_000 - feesDrops - ticketsOutstanding * Math.round(h.reserveIncXrp * 1_000_000)));
    sweep.tx.Amount = String(drops);
    sweep.title = `Send the spendable ${(drops / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP to ${opts.cold}`;
  }

  const notes = [
    "Submit the steps in order, as fast as you can: a thief with the key is racing you.",
    opts.useTickets
      ? "Sign the TicketCreate now, read the ticket numbers it creates, fill them in and sign every step now. Keep the signed kit offline; it stays valid whatever happens to the account's sequence."
      : "Signing needs the account's current key: prepare the kit now, sign it the moment it is needed.",
    `Each ticket and each open object holds ${h.reserveIncXrp} XRP of reserve while it exists.`,
  ];
  return { address: me, cold: opts.cold, steps: ordered, tickets, sweepsEverything, notes };
}

