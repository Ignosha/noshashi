import { containsLink, decodeCurrency, lookalikeOf } from "../../../supabase/functions/_shared/xrplEvents.ts";
import { ASF } from "./hardening";

/**
 * Pre-sign explainer — what a transaction will actually do, before you sign it.
 *
 * Takes the transaction a site or a wallet prompt asks you to sign, as
 * JSON or as the hex blob it will submit, and says in plain words what it
 * does and whether anything in it is how XRPL accounts get stolen: a new
 * regular key or signer list (someone else gets to sign for you), the
 * master key disabled, the account deleted, an NFT sold for nothing or to a
 * stranger, a partial payment, a lookalike or sanctioned destination, a
 * fee far above normal, a link hidden in a memo.
 *
 * Decoding is local (ripple-binary-codec), so nothing about the
 * transaction leaves the device. A signed blob decodes too: the signature
 * is ignored, and a blob that is already signed is flagged, because
 * anyone holding it can submit it.
 */

type Json = Record<string, any>;

export type SignFlag = { id: string; severity: "danger" | "warn" | "info"; text: string };

export type SignVerdict = "SAFE-LOOKING" | "CAREFUL" | "DO NOT SIGN";

export type SignExplanation = {
  tx: Json;
  /** How the input was given. */
  format: "json" | "blob";
  /** One line per effect, in plain words. */
  summary: string[];
  flags: SignFlag[];
  verdict: SignVerdict;
  /** True when the blob already carries a signature. */
  signed: boolean;
};

export type SignContext = {
  /** Your own address: flags a transaction that signs for a different account. */
  me?: string;
  /** Addresses you trust (your address book): flags lookalikes of them. */
  known?: string[];
  /** Sanctioned addresses, from the OFAC SDN list, keyed by address. */
  sanctioned?: Record<string, { entityName: string }>;
};

const TF_PARTIAL_PAYMENT = 0x00020000;
const TF_SELL_NFTOKEN = 0x00000001;
const TF_CLOSE = 0x00020000;
/** 1,000 drops: a hundred times the usual 10-drop fee and far more than a busy ledger asks. */
const HIGH_FEE_DROPS = 1_000;

/**
 * Parse what the user pasted: a JSON transaction (bare or wrapped as
 * tx_json) or a hex blob. The binary codec is loaded only for a blob, so
 * pages that never decode one (the website chat) do not carry it.
 */
export async function parseTransaction(input: string): Promise<{ tx: Json; format: "json" | "blob" }> {
  const text = input.trim();
  if (!text) throw new Error("Paste a transaction: its JSON, or the hex blob a site asks you to sign.");
  if (text.startsWith("{")) {
    let json: Json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("That is not valid JSON.");
    }
    const tx = (json.tx_json ?? json.transaction ?? json.txJson ?? json.tx ?? json) as Json;
    if (typeof tx.TransactionType !== "string") throw new Error("The JSON has no TransactionType, so it is not an XRPL transaction.");
    return { tx, format: "json" };
  }
  const hex = text.replace(/^0x/i, "").replace(/\s+/g, "");
  if (!/^([0-9A-Fa-f]{2})+$/.test(hex)) throw new Error("Not JSON and not a hex blob.");
  let tx: Json;
  try {
    const { decode } = await import("ripple-binary-codec");
    tx = decode(hex.toUpperCase()) as Json;
  } catch (e) {
    throw new Error(`The blob does not decode as an XRPL transaction (${e instanceof Error ? e.message : String(e)}).`);
  }
  if (typeof tx.TransactionType !== "string") throw new Error("The blob decoded, but not to a transaction.");
  return { tx, format: "blob" };
}

function amountText(raw: unknown): string {
  if (typeof raw === "string" && /^\d+$/.test(raw)) return `${(Number(raw) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
  if (raw && typeof raw === "object") {
    const a = raw as Json;
    if ("mpt_issuance_id" in a) return `${a.value} of MPT ${String(a.mpt_issuance_id).slice(0, 12)}…`;
    return `${a.value} ${decodeCurrency(String(a.currency ?? ""))}${a.issuer ? ` (issuer ${a.issuer})` : ""}`;
  }
  return String(raw);
}

function isZero(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (typeof raw === "string") return Number(raw) === 0;
  if (typeof raw === "object") return Number((raw as Json).value) === 0;
  return false;
}

function memoTexts(tx: Json): string[] {
  const out: string[] = [];
  for (const m of (tx.Memos ?? []) as Json[]) {
    const memo = (m.Memo ?? m) as Json;
    for (const field of ["MemoData", "MemoType", "MemoFormat"]) {
      const hex = memo[field];
      if (typeof hex !== "string" || !/^([0-9A-Fa-f]{2})+$/.test(hex)) continue;
      try {
        out.push(new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array((hex.match(/../g) ?? []).map((b) => parseInt(b, 16)))));
      } catch {
        /* binary memo */
      }
    }
  }
  return out;
}

const ASF_TEXT: Record<number, string> = {
  1: "require a destination tag on incoming payments",
  2: "require authorisation for its trust lines",
  3: "ask senders not to send XRP",
  4: "DISABLE THE MASTER KEY",
  5: "track the ID of its last transaction",
  6: "permanently give up the right to freeze (No Freeze)",
  7: "freeze every trust line it issued (global freeze)",
  8: "let balances ripple through it (Default Ripple)",
  9: "accept payments only from preauthorised senders",
  10: "let another account mint NFTs for it",
  12: "refuse incoming NFT offers",
  13: "refuse incoming checks",
  14: "refuse incoming payment channels",
  15: "refuse incoming trust lines",
  16: "allow clawback of its tokens",
};

/** Explain a parsed transaction. Pure. */
export function explainTransaction(tx: Json, format: "json" | "blob", ctx: SignContext = {}): SignExplanation {
  const summary: string[] = [];
  const flags: SignFlag[] = [];
  const type = String(tx.TransactionType);
  const account = typeof tx.Account === "string" ? tx.Account : "";
  const flagsValue = Number(tx.Flags ?? 0);
  const signed = typeof tx.TxnSignature === "string" || Array.isArray(tx.Signers);

  const checkDestination = (address: unknown, role: string) => {
    if (typeof address !== "string" || !address) return;
    const hit = ctx.sanctioned?.[address];
    if (hit) flags.push({ id: "sanctioned", severity: "danger", text: `The ${role} ${address} is on the OFAC SDN list (${hit.entityName}). Dealing with it is prohibited for US persons and many others.` });
    const known = ctx.known ?? [];
    if (known.length && !known.includes(address)) {
      const imitated = lookalikeOf(address, known);
      if (imitated) flags.push({ id: "lookalike", severity: "danger", text: `The ${role} ${address} starts and ends like ${imitated} from your address book but is a different account: address poisoning.` });
    }
  };

  if (ctx.me && account && account !== ctx.me) {
    flags.push({ id: "other-account", severity: "warn", text: `This transaction is for account ${account}, not ${ctx.me}. Signing it with your key only works if you are a signer or its regular key.` });
  }

  switch (type) {
    case "Payment": {
      const partial = (flagsValue & TF_PARTIAL_PAYMENT) !== 0;
      // API v2 replies name the Amount field DeliverMax.
      summary.push(`Sends ${amountText(tx.Amount ?? tx.DeliverMax)} from ${account} to ${tx.Destination}${typeof tx.DestinationTag === "number" ? ` with destination tag ${tx.DestinationTag}` : ""}.`);
      if (tx.SendMax) summary.push(`It may spend up to ${amountText(tx.SendMax)} to deliver that.`);
      if (partial) {
        flags.push({ id: "partial-payment", severity: "warn", text: "Partial payment flag set: the recipient may receive far less than the Amount shown. Legitimate for some conversions; used to fake large deposits." });
      }
      if (tx.Destination === account) summary.push("Sender and destination are the same account: a currency conversion through the DEX.");
      checkDestination(tx.Destination, "destination");
      break;
    }
    case "SetRegularKey":
      if (tx.RegularKey) {
        summary.push(`Gives the key of ${tx.RegularKey} full power to sign for ${account}.`);
        flags.push({ id: "regular-key", severity: "danger", text: `After this, whoever holds ${tx.RegularKey} can move everything in the account, and keeps that power even if you change nothing else. A site asking you to sign this is taking over the account unless ${tx.RegularKey} is a key you control.` });
        checkDestination(tx.RegularKey, "new key");
      } else {
        summary.push("Removes the account's regular key.");
        flags.push({ id: "regular-key-removed", severity: "warn", text: "If the master key is disabled and there is no signer list, removing the regular key leaves nothing that can sign: the account is locked forever." });
      }
      break;
    case "SignerListSet": {
      const entries = ((tx.SignerEntries ?? []) as Json[]).map((e) => e.SignerEntry ?? e);
      if (Number(tx.SignerQuorum ?? 0) === 0) {
        summary.push("Deletes the account's signer list.");
        flags.push({ id: "signers-removed", severity: "warn", text: "Removes the multi-signature requirement. If the master key is disabled and there is no regular key, nothing can sign afterwards." });
      } else {
        summary.push(`Lets ${entries.length} signer${entries.length === 1 ? "" : "s"} sign for ${account} together (quorum ${tx.SignerQuorum}): ${entries.map((e: Json) => `${e.Account} (weight ${e.SignerWeight})`).join(", ")}.`);
        flags.push({ id: "signer-list", severity: "danger", text: "These accounts will be able to move everything in this account. Sign only if every one of them is yours or someone you have chosen." });
        for (const e of entries) checkDestination(e.Account, "signer");
      }
      break;
    }
    case "AccountSet": {
      if (typeof tx.SetFlag === "number") summary.push(`Turns on: ${ASF_TEXT[tx.SetFlag] ?? `flag ${tx.SetFlag}`}.`);
      if (typeof tx.ClearFlag === "number") summary.push(`Turns off: ${ASF_TEXT[tx.ClearFlag] ?? `flag ${tx.ClearFlag}`}.`);
      if (tx.SetFlag === ASF.disableMaster) {
        flags.push({ id: "disable-master", severity: "warn", text: "Disables the master key. Sound when a regular key or signer list you control is already set and tested; if not, the account can never sign again." });
      }
      if (tx.ClearFlag === ASF.disableMaster) flags.push({ id: "enable-master", severity: "warn", text: "Re-enables the master key: whoever has the original seed can sign alone again." });
      if (tx.SetFlag === 6) flags.push({ id: "no-freeze", severity: "info", text: "No Freeze is permanent: it cannot be turned off again." });
      if (tx.SetFlag === 7) flags.push({ id: "global-freeze", severity: "warn", text: "Global freeze stops every holder of this account's tokens from moving them." });
      if (typeof tx.Domain === "string") summary.push(`Sets the account's domain to ${tx.Domain ? decodeHex(tx.Domain) : "(none)"}.`);
      if (typeof tx.TransferRate === "number") summary.push(`Sets a transfer fee of ${((tx.TransferRate / 1e9 - 1) * 100).toFixed(3)}% on its tokens.`);
      if (!summary.length) summary.push("Changes no flags: an AccountSet like this only bumps the sequence.");
      break;
    }
    case "AccountDelete":
      summary.push(`DELETES account ${account} and sends all of its remaining XRP to ${tx.Destination}${typeof tx.DestinationTag === "number" ? ` (tag ${tx.DestinationTag})` : ""}.`);
      flags.push({ id: "account-delete", severity: "danger", text: `The account ceases to exist and every drop it holds goes to ${tx.Destination}. Thieves ask victims to sign this to empty an account in one step. Sign only to close an account you are finished with, to a destination you own.` });
      checkDestination(tx.Destination, "destination");
      break;
    case "NFTokenCreateOffer": {
      const sell = (flagsValue & TF_SELL_NFTOKEN) !== 0;
      summary.push(`${sell ? "Offers to SELL" : "Offers to BUY"} NFT ${String(tx.NFTokenID).slice(0, 16)}… for ${isZero(tx.Amount) ? "NOTHING" : amountText(tx.Amount)}${tx.Destination ? `, only to ${tx.Destination}` : ", to anyone"}.`);
      if (sell && isZero(tx.Amount)) flags.push({ id: "nft-free", severity: "danger", text: "A sell offer for zero gives the NFT away. The classic NFT phishing prompt asks for exactly this, disguised as a 'claim' or 'verify'." });
      if (sell && tx.Destination) checkDestination(tx.Destination, "buyer");
      if (sell && tx.Destination && !(ctx.known ?? []).includes(tx.Destination)) flags.push({ id: "nft-stranger", severity: "warn", text: `Only ${tx.Destination} can accept this sell offer. Make sure that account is who you think it is.` });
      break;
    }
    case "NFTokenAcceptOffer":
      summary.push(`Accepts NFT offer${tx.NFTokenSellOffer && tx.NFTokenBuyOffer ? "s (brokered)" : ""} ${tx.NFTokenSellOffer ?? tx.NFTokenBuyOffer}.`);
      flags.push({ id: "nft-accept", severity: "info", text: "Accepting a sell offer pays its price; accepting a buy offer hands over your NFT. Check the offer's amount on the ledger (NFT explorer) before signing." });
      break;
    case "TrustSet": {
      const limit = tx.LimitAmount as Json | undefined;
      summary.push(`Sets a trust line to hold up to ${limit?.value} ${decodeCurrency(String(limit?.currency ?? ""))} issued by ${limit?.issuer}.`);
      flags.push({ id: "trustline", severity: "info", text: "A trust line only lets you hold a token. Airdropped tokens with a link in their name are a common lure; the token is only worth what its issuer stands behind." });
      break;
    }
    case "OfferCreate":
      summary.push(`Places a DEX order: pay ${amountText(tx.TakerGets)} to receive ${amountText(tx.TakerPays)}.`);
      break;
    case "OfferCancel":
      summary.push(`Cancels DEX order sequence ${tx.OfferSequence}.`);
      break;
    case "EscrowCreate":
      summary.push(`Locks ${amountText(tx.Amount)} in escrow for ${tx.Destination}.`);
      checkDestination(tx.Destination, "destination");
      break;
    case "EscrowFinish":
    case "EscrowCancel":
      summary.push(`${type === "EscrowFinish" ? "Releases" : "Cancels"} escrow ${tx.OfferSequence} created by ${tx.Owner}.`);
      break;
    case "CheckCreate":
      summary.push(`Writes a check for up to ${amountText(tx.SendMax)} that ${tx.Destination} can cash.`);
      checkDestination(tx.Destination, "payee");
      break;
    case "CheckCash":
      summary.push(`Cashes check ${String(tx.CheckID).slice(0, 16)}… for ${amountText(tx.Amount ?? tx.DeliverMin)}.`);
      break;
    case "CheckCancel":
      summary.push(`Cancels check ${String(tx.CheckID).slice(0, 16)}….`);
      break;
    case "PaymentChannelCreate":
      summary.push(`Opens a payment channel funding ${tx.Destination} with up to ${amountText(tx.Amount)}.`);
      checkDestination(tx.Destination, "destination");
      break;
    case "PaymentChannelClaim":
      summary.push(`Claims from payment channel ${String(tx.Channel).slice(0, 16)}…${(flagsValue & TF_CLOSE) !== 0 ? " and asks to close it" : ""}.`);
      break;
    case "DepositPreauth":
      summary.push(tx.Authorize ? `Lets ${tx.Authorize} pay this account while deposit authorisation is on.` : `Withdraws ${tx.Unauthorize}'s permission to pay this account.`);
      break;
    case "TicketCreate":
      summary.push(`Reserves ${tx.TicketCount} ticket${tx.TicketCount === 1 ? "" : "s"}: sequence numbers transactions can use later, in any order.`);
      flags.push({ id: "tickets", severity: "info", text: "Tickets let pre-signed transactions be submitted later, out of order. Know who will hold transactions signed against them." });
      break;
    default:
      summary.push(`A ${type} transaction from ${account}.`);
      flags.push({ id: "unfamiliar", severity: "info", text: `${type} is not one of the transactions this explainer describes in detail. Read the fields below before signing.` });
  }

  const fee = Number(tx.Fee ?? 0);
  if (Number.isFinite(fee) && fee > HIGH_FEE_DROPS) {
    flags.push({ id: "high-fee", severity: fee >= 1_000_000 ? "danger" : "warn", text: `The fee is ${(fee / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP, destroyed whether or not the transaction does anything. A normal fee is 0.00001 XRP.` });
  }
  const memos = memoTexts(tx);
  const link = memos.find(containsLink);
  if (link) flags.push({ id: "memo-link", severity: "warn", text: `A memo carries a link or domain ("${link.slice(0, 80)}"). Never visit links that arrive on the ledger.` });
  if (signed) flags.push({ id: "already-signed", severity: "warn", text: "This blob is already signed: anyone who has it can submit it, whether or not you approve." });
  if (typeof tx.LastLedgerSequence !== "number") flags.push({ id: "no-expiry", severity: "info", text: "No LastLedgerSequence: once signed, it stays valid until its sequence is used." });

  const verdict: SignVerdict = flags.some((f) => f.severity === "danger") ? "DO NOT SIGN" : flags.some((f) => f.severity === "warn") ? "CAREFUL" : "SAFE-LOOKING";
  return { tx, format, summary, flags, verdict, signed };
}

function decodeHex(hex: string): string {
  if (!/^([0-9A-Fa-f]{2})+$/.test(hex)) return hex;
  return new TextDecoder().decode(new Uint8Array((hex.match(/../g) ?? []).map((b) => parseInt(b, 16))));
}

/** Parse and explain in one step. */
export async function explainSigningRequest(input: string, ctx: SignContext = {}): Promise<SignExplanation> {
  const { tx, format } = await parseTransaction(input);
  return explainTransaction(tx, format, ctx);
}

/** Every address the transaction names, for a sanctions lookup before explaining. */
export function addressesIn(tx: Json): string[] {
  const out = new Set<string>();
  for (const key of ["Destination", "RegularKey", "Owner", "Authorize"]) if (typeof tx[key] === "string") out.add(tx[key]);
  for (const e of (tx.SignerEntries ?? []) as Json[]) if (typeof (e.SignerEntry ?? e).Account === "string") out.add((e.SignerEntry ?? e).Account);
  return [...out];
}
