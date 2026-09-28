import type { Holdings, HoldingsReader } from "./objects";
import { dropsToXrp, isoFromRipple, lineSide, liveHoldingsReader } from "./objects";
import { decodeCurrency } from "../../../supabase/functions/_shared/xrplEvents.ts";

/**
 * Stuck funds and reserve recovery — XRP an account can get back.
 *
 * Every XRP Ledger account has value it may not know about: escrows that
 * have matured and are waiting for someone to finish them, escrows that
 * expired and can be cancelled back to their owner, payment channels
 * whose unclaimed balance returns once they close, checks written to it
 * that it never cashed, and the owner reserve (0.2 XRP each today) locked
 * by old trust lines, orders, NFT offers, preauthorisations and tickets
 * it no longer needs. This scan reads all of it at one validated ledger
 * and writes the transaction that releases each one.
 *
 * Every transaction is unsigned. NOSHASHI never signs: the owner reviews
 * and signs each one in their own wallet.
 */

type Json = Record<string, any>;

export type RecoveryKind =
  | "escrow_finish"
  | "escrow_cancel"
  | "escrow_waiting"
  | "escrow_conditional"
  | "check_cash"
  | "check_cancel"
  | "channel_close"
  | "channel_request_close"
  | "offer_cancel"
  | "nft_offer_cancel"
  | "trustline_remove"
  | "preauth_remove"
  | "ticket_use";

export type RecoveryItem = {
  id: string;
  kind: RecoveryKind;
  title: string;
  detail: string;
  /** XRP that arrives in the account when this transaction succeeds (an upper bound for a check). */
  xrp: number;
  /** Owner reserve released, in XRP. */
  reserveXrp: number;
  /** now: do it today. optional: frees reserve, but only if you no longer want the object. later: not yet possible. info: nothing to sign. */
  when: "now" | "optional" | "later" | "info";
  /** When a "later" item becomes possible. */
  availableAt?: string | null;
  /** Unsigned transaction. Fields in <angle brackets> are yours to fill in. Null when there is nothing to sign. */
  tx: Json | null;
  /** Read before signing. */
  caution?: string;
};

export type RecoveryReport = {
  address: string;
  exists: boolean;
  ledgerIndex: number;
  at: string | null;
  balanceXrp: number;
  /** Base reserve plus the owner reserve of every object. */
  lockedXrp: number;
  spendableXrp: number;
  items: RecoveryItem[];
  /** XRP that returns today by signing the "now" items. */
  recoverableNowXrp: number;
  /** Owner reserve released if every optional clean-up is signed too. */
  optionalReserveXrp: number;
  /** XRP arriving later, when escrows mature or channels finish closing. */
  laterXrp: number;
  /** Closing the account entirely: what AccountDelete would return, and what blocks it. */
  deletion: { possible: boolean; returnsXrp: number; blockers: string[]; tx: Json | null };
  complete: boolean;
};

const TF_CLOSE = 0x00020000;
const TF_SET_NO_RIPPLE = 0x00020000;
const LSF_DEFAULT_RIPPLE = 0x00800000;
const LSF_SELL_NFTOKEN = 0x00000001;

const xrpText = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;

function amountText(raw: unknown): string {
  const xrp = dropsToXrp(raw);
  if (xrp !== null) return xrpText(xrp);
  const a = raw as Json;
  return `${a?.value} ${decodeCurrency(String(a?.currency ?? ""))}`;
}

/**
 * The recovery report for holdings read at one ledger. `sequences` maps an
 * escrow's ledger index to the sequence of the EscrowCreate that made it,
 * which EscrowFinish and EscrowCancel must name; see resolveEscrowSequences.
 */
export function recoveryFrom(h: Holdings, sequences: Record<string, number> = {}): RecoveryReport {
  const me = h.address;
  const now = h.closeTime;
  const inc = h.reserveIncXrp;
  const items: RecoveryItem[] = [];
  const root = h.root;
  const at = isoFromRipple(now);

  if (!root) {
    return {
      address: me,
      exists: false,
      ledgerIndex: h.ledgerIndex,
      at,
      balanceXrp: 0,
      lockedXrp: 0,
      spendableXrp: 0,
      items: [],
      recoverableNowXrp: 0,
      optionalReserveXrp: 0,
      laterXrp: 0,
      deletion: { possible: false, returnsXrp: 0, blockers: ["The account does not exist."], tx: null },
      complete: true,
    };
  }

  for (const o of h.objects) {
    const index = String(o.index ?? "");
    switch (o.LedgerEntryType) {
      case "Escrow": {
        const xrp = dropsToXrp(o.Amount) ?? 0;
        const finishAfter = typeof o.FinishAfter === "number" ? o.FinishAfter : null;
        const cancelAfter = typeof o.CancelAfter === "number" ? o.CancelAfter : null;
        const expired = cancelAfter !== null && cancelAfter <= now;
        const seq = sequences[index] ?? (typeof o.Sequence === "number" ? o.Sequence : null);
        const offerSequence = seq ?? "<sequence of the EscrowCreate>";
        if (o.Destination === me && !expired) {
          if (o.Condition) {
            items.push({ id: `escrow-${index}`, kind: "escrow_conditional", title: `${amountText(o.Amount)} in escrow for you, locked by a condition`, detail: `Escrow from ${o.Account}. It needs the fulfillment (the secret matching its crypto-condition), which only whoever set it up has.`, xrp: 0, reserveXrp: 0, when: "info", tx: null });
          } else if (finishAfter === null || finishAfter <= now) {
            items.push({
              id: `escrow-${index}`,
              kind: "escrow_finish",
              title: `Finish an escrow: ${amountText(o.Amount)} is waiting for you`,
              detail: `Escrow from ${o.Account}${finishAfter ? `, matured ${isoFromRipple(finishAfter)?.slice(0, 10)}` : ""}${cancelAfter ? `, cancellable by its owner from ${isoFromRipple(cancelAfter)?.slice(0, 10)}` : ""}. Nothing moves until someone submits EscrowFinish; ${cancelAfter ? "finish it before then." : "it waits forever."}`,
              xrp,
              reserveXrp: 0,
              when: "now",
              tx: { TransactionType: "EscrowFinish", Account: me, Owner: o.Account, OfferSequence: offerSequence },
            });
          } else {
            items.push({ id: `escrow-${index}`, kind: "escrow_waiting", title: `${amountText(o.Amount)} in escrow for you, maturing ${isoFromRipple(finishAfter)?.slice(0, 10)}`, detail: `Escrow from ${o.Account}. From ${isoFromRipple(finishAfter)} anyone can finish it; this scan will list the transaction then.`, xrp, reserveXrp: 0, when: "later", availableAt: isoFromRipple(finishAfter), tx: null });
          }
        } else if (o.Account === me) {
          if (expired) {
            items.push({
              id: `escrow-${index}`,
              kind: "escrow_cancel",
              title: `Cancel an expired escrow: ${amountText(o.Amount)} comes back`,
              detail: `You escrowed it for ${o.Destination}${o.Destination === me ? " (yourself)" : ""}; it expired ${isoFromRipple(cancelAfter)?.slice(0, 10)} without being finished. Cancelling returns it and the ${inc} XRP reserve it holds.`,
              xrp,
              reserveXrp: inc,
              when: "now",
              tx: { TransactionType: "EscrowCancel", Account: me, Owner: me, OfferSequence: offerSequence },
            });
          } else if (cancelAfter !== null && o.Destination !== me) {
            items.push({ id: `escrow-${index}`, kind: "escrow_waiting", title: `${amountText(o.Amount)} escrowed to ${o.Destination}, returnable ${isoFromRipple(cancelAfter)?.slice(0, 10)} if unfinished`, detail: "If the recipient has not finished it by then, you can cancel it back.", xrp: 0, reserveXrp: 0, when: "later", availableAt: isoFromRipple(cancelAfter), tx: null });
          }
        } else if (o.Destination === me && expired) {
          items.push({ id: `escrow-${index}`, kind: "escrow_waiting", title: `An escrow for you from ${o.Account} expired unfinished`, detail: `${amountText(o.Amount)} can now only go back to its owner.`, xrp: 0, reserveXrp: 0, when: "info", tx: null });
        }
        break;
      }
      case "Check": {
        const expired = typeof o.Expiration === "number" && o.Expiration <= now;
        if (o.Destination === me && !expired) {
          const xrp = dropsToXrp(o.SendMax) ?? 0;
          items.push({
            id: `check-${index}`,
            kind: "check_cash",
            title: `Cash a check for up to ${amountText(o.SendMax)}`,
            detail: `Written to you by ${o.Account}${o.Expiration ? `, valid until ${isoFromRipple(o.Expiration)?.slice(0, 10)}` : ""}. It pays only what the writer still has when you cash it.`,
            xrp,
            reserveXrp: 0,
            when: "now",
            tx: { TransactionType: "CheckCash", Account: me, CheckID: index, Amount: o.SendMax },
            caution: "Checks are also sent as lures. Cashing one moves value to you and cannot hurt you; never visit a link that came with it.",
          });
        } else if (o.Account === me) {
          items.push({
            id: `check-${index}`,
            kind: "check_cancel",
            title: `Cancel a check you wrote to ${o.Destination}${expired ? " (expired)" : ""}`,
            detail: `${expired ? "It can no longer be cashed." : `While it exists, ${o.Destination} can pull up to ${amountText(o.SendMax)} from you.`} Cancelling frees its ${inc} XRP reserve.`,
            xrp: 0,
            reserveXrp: inc,
            when: expired ? "now" : "optional",
            tx: { TransactionType: "CheckCancel", Account: me, CheckID: index },
          });
        } else if (o.Destination === me && expired) {
          items.push({ id: `check-${index}`, kind: "check_cancel", title: `Clear an expired check from ${o.Account}`, detail: "It can no longer be cashed. Cancelling removes it (the reserve is the writer's).", xrp: 0, reserveXrp: 0, when: "optional", tx: { TransactionType: "CheckCancel", Account: me, CheckID: index } });
        }
        break;
      }
      case "PayChannel": {
        if (o.Account !== me) break;
        const unclaimed = (dropsToXrp(o.Amount) ?? 0) - (dropsToXrp(o.Balance) ?? 0);
        const closesAt = [o.Expiration, o.CancelAfter].filter((t): t is number => typeof t === "number").sort((a, b) => a - b)[0];
        if (closesAt !== undefined && closesAt <= now) {
          items.push({
            id: `channel-${index}`,
            kind: "channel_close",
            title: `Close an expired payment channel: ${xrpText(unclaimed)} comes back`,
            detail: `Channel to ${o.Destination}, expired ${isoFromRipple(closesAt)?.slice(0, 10)}. Closing returns what was never claimed and its ${inc} XRP reserve.`,
            xrp: unclaimed,
            reserveXrp: inc,
            when: "now",
            tx: { TransactionType: "PaymentChannelClaim", Account: me, Channel: index, Flags: TF_CLOSE },
          });
        } else {
          items.push({
            id: `channel-${index}`,
            kind: "channel_request_close",
            title: `Payment channel to ${o.Destination} holds ${xrpText(unclaimed)} unclaimed`,
            detail: `Asking to close starts a ${Number(o.SettleDelay ?? 0).toLocaleString("en-US")}-second settle delay so ${o.Destination} can redeem claims you already signed; after that the rest (and the ${inc} XRP reserve) comes back with a second close.${closesAt ? ` It expires on its own ${isoFromRipple(closesAt)?.slice(0, 10)}.` : ""}`,
            xrp: 0,
            reserveXrp: 0,
            when: "optional",
            availableAt: closesAt ? isoFromRipple(closesAt) : null,
            tx: { TransactionType: "PaymentChannelClaim", Account: me, Channel: index, Flags: TF_CLOSE },
            caution: "Only if the channel is finished with: the recipient loses the ability to redeem further claims.",
          });
        }
        break;
      }
      case "Offer": {
        if (o.Account !== me) break;
        const expired = typeof o.Expiration === "number" && o.Expiration <= now;
        items.push({
          id: `offer-${index}`,
          kind: "offer_cancel",
          title: `${expired ? "Remove an expired" : "Cancel an open"} DEX order: pay ${amountText(o.TakerGets)} for ${amountText(o.TakerPays)}`,
          detail: `${expired ? "It can no longer fill but still holds" : "While it is open anyone can fill it at that price. It holds"} ${inc} XRP of reserve.`,
          xrp: 0,
          reserveXrp: inc,
          when: expired ? "now" : "optional",
          tx: { TransactionType: "OfferCancel", Account: me, OfferSequence: o.Sequence },
        });
        break;
      }
      case "NFTokenOffer": {
        if (o.Owner !== me) break;
        const expired = typeof o.Expiration === "number" && o.Expiration <= now;
        const sell = (Number(o.Flags ?? 0) & LSF_SELL_NFTOKEN) !== 0;
        items.push({
          id: `nftoffer-${index}`,
          kind: "nft_offer_cancel",
          title: `${expired ? "Remove an expired" : "Cancel an open"} NFT ${sell ? "sell" : "buy"} offer (${amountText(o.Amount)})`,
          detail: `NFT ${String(o.NFTokenID).slice(0, 16)}…${o.Destination ? `, only for ${o.Destination}` : ""}. It holds ${inc} XRP of reserve${sell && !expired ? ", and while it is open the NFT can be taken at that price" : ""}.`,
          xrp: 0,
          reserveXrp: inc,
          when: expired ? "now" : "optional",
          tx: { TransactionType: "NFTokenCancelOffer", Account: me, NFTokenOffers: [index] },
        });
        break;
      }
      case "RippleState": {
        const side = lineSide(o, me);
        if (!side.reserved || side.balance !== 0) break;
        const defaultRipple = (Number(root.Flags ?? 0) & LSF_DEFAULT_RIPPLE) !== 0;
        items.push({
          id: `line-${index}`,
          kind: "trustline_remove",
          title: `Remove an empty trust line: ${decodeCurrency(side.currency)} from ${side.counterparty}`,
          detail: `Zero balance, and it holds ${inc} XRP of reserve. Setting the limit to zero deletes it once every setting on your side is back to default.`,
          xrp: 0,
          reserveXrp: inc,
          when: "optional",
          tx: {
            TransactionType: "TrustSet",
            Account: me,
            LimitAmount: { currency: side.currency, issuer: side.counterparty, value: "0" },
            ...(defaultRipple ? {} : { Flags: TF_SET_NO_RIPPLE }),
          },
          caution: "If the line has a freeze or authorisation on your side, it stays until those are cleared too.",
        });
        break;
      }
      case "DepositPreauth": {
        if (o.Account !== me || typeof o.Authorize !== "string") break;
        items.push({ id: `preauth-${index}`, kind: "preauth_remove", title: `Withdraw ${o.Authorize}'s preauthorisation`, detail: `It lets ${o.Authorize} pay you while deposit authorisation is on, and holds ${inc} XRP of reserve.`, xrp: 0, reserveXrp: inc, when: "optional", tx: { TransactionType: "DepositPreauth", Account: me, Unauthorize: o.Authorize } });
        break;
      }
      case "Ticket": {
        items.push({ id: `ticket-${index}`, kind: "ticket_use", title: `Use up unused ticket ${o.TicketSequence}`, detail: `Each unused ticket holds ${inc} XRP of reserve. A no-op AccountSet that spends the ticket releases it.`, xrp: 0, reserveXrp: inc, when: "optional", tx: { TransactionType: "AccountSet", Account: me, Sequence: 0, TicketSequence: o.TicketSequence }, caution: "Skip it if you have transactions pre-signed against this ticket." });
        break;
      }
    }
  }

  const balanceXrp = Number(root.Balance ?? 0) / 1_000_000;
  const lockedXrp = h.reserveBaseXrp + inc * Number(root.OwnerCount ?? 0);
  const order = { now: 0, optional: 1, later: 2, info: 3 } as const;
  items.sort((a, b) => order[a.when] - order[b.when] || b.xrp + b.reserveXrp - (a.xrp + a.reserveXrp));
  const sum = (xs: RecoveryItem[], f: (i: RecoveryItem) => number) => Math.round(xs.reduce((n, i) => n + f(i), 0) * 1e6) / 1e6;
  const nowItems = items.filter((i) => i.when === "now");

  // AccountDelete: possible only without deletion blockers, and 256 ledgers after the account's current sequence.
  const blockers: string[] = [];
  const count = (type: string) => h.objects.filter((o) => o.LedgerEntryType === type).length;
  if (count("Escrow")) blockers.push(`${count("Escrow")} escrow${count("Escrow") === 1 ? "" : "s"}`);
  if (count("PayChannel")) blockers.push(`${count("PayChannel")} payment channel${count("PayChannel") === 1 ? "" : "s"}`);
  if (count("Check")) blockers.push(`${count("Check")} check${count("Check") === 1 ? "" : "s"}`);
  const heldLines = h.objects.filter((o) => o.LedgerEntryType === "RippleState" && lineSide(o, me).balance !== 0).length;
  if (heldLines) blockers.push(`${heldLines} trust line${heldLines === 1 ? "" : "s"} with a balance`);
  if (h.nfts.length || count("NFTokenPage")) blockers.push(`${h.nfts.length || "some"} NFTs`);
  if (count("AMM") || root.AMMID) blockers.push("an AMM");
  if (Number(root.Sequence ?? 0) + 256 > h.ledgerIndex) blockers.push("its sequence is too recent (wait 256 ledgers, about 15 minutes)");
  const deleteFee = inc;
  const returnsXrp = Math.max(0, Math.round((balanceXrp - deleteFee) * 1e6) / 1e6);

  return {
    address: me,
    exists: true,
    ledgerIndex: h.ledgerIndex,
    at,
    balanceXrp,
    lockedXrp: Math.round(lockedXrp * 1e6) / 1e6,
    spendableXrp: Math.max(0, Math.round((balanceXrp - lockedXrp) * 1e6) / 1e6),
    items,
    recoverableNowXrp: sum(nowItems, (i) => i.xrp + i.reserveXrp),
    optionalReserveXrp: sum(items.filter((i) => i.when === "optional"), (i) => i.reserveXrp),
    laterXrp: sum(items.filter((i) => i.when === "later"), (i) => i.xrp),
    deletion: {
      possible: blockers.length === 0,
      returnsXrp,
      blockers,
      tx: blockers.length === 0 ? { TransactionType: "AccountDelete", Account: me, Destination: "<an account you own>", Fee: String(Math.round(deleteFee * 1_000_000)) } : null,
    },
    complete: h.complete,
  };
}

/**
 * EscrowFinish and EscrowCancel name an escrow by its creator and the
 * sequence of the EscrowCreate. The Escrow entry records the hash of the
 * transaction that created it (PreviousTxnID, since escrows are never
 * modified); that transaction carries the sequence, or the ticket used.
 */
export async function resolveEscrowSequences(h: Holdings, reader: HoldingsReader = liveHoldingsReader): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const o of h.objects) {
    if (o.LedgerEntryType !== "Escrow" || typeof o.PreviousTxnID !== "string") continue;
    const tx = await reader.request("tx", { transaction: o.PreviousTxnID, binary: false }).catch(() => null);
    const body = (tx?.tx_json ?? tx) as Json | null;
    if (body?.TransactionType !== "EscrowCreate") continue;
    const seq = Number(body.TicketSequence ?? body.Sequence ?? 0);
    if (seq > 0) out[String(o.index)] = seq;
  }
  return out;
}
