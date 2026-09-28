import { rpc } from "@/lib/xrpl/client";
import { decodeCurrency } from "../../../supabase/functions/_shared/xrplEvents.ts";
import { sha256Hex } from "./incident";

/**
 * Wrong-deposit helper — "I sent XRP and it never arrived."
 *
 * Reads the transaction by its hash and says what actually happened. A
 * failed payment (tecDST_TAG_NEEDED, tecNO_DST_INSUF_XRP, tecPATH_DRY and
 * the rest) moved nothing but its fee: the funds are still in the sender's
 * account. A payment that succeeded without the destination tag an
 * exchange needs, or with the wrong one, reached the exchange's pooled
 * account, where only the exchange can credit it: this writes the letter
 * to its support team with every fact it will ask for, and the SHA-256 of
 * that letter. A payment to a private wallet can only be returned by its
 * owner, and this says so plainly.
 */

type Json = Record<string, any>;

export type DepositOutcome =
  | "not_found"
  | "not_payment"
  | "failed_nothing_lost"
  | "delivered"
  | "delivered_no_tag_custodial"
  | "delivered_tag_custodial"
  | "delivered_private"
  | "partial_delivery";

export type DepositDiagnosis = {
  hash: string;
  outcome: DepositOutcome;
  headline: string;
  explanation: string;
  steps: string[];
  facts: {
    result: string | null;
    ledger: number | null;
    at: string | null;
    from: string | null;
    to: string | null;
    destinationTag: number | null;
    requested: string | null;
    delivered: string | null;
    feeXrp: number | null;
    destinationDomain: string | null;
    destinationRequiresTag: boolean | null;
    destinationExists: boolean | null;
  };
  /** Letter to the receiving service, when one should be written. */
  letter?: { text: string; sha256: string };
};

/** What each failure code means for someone whose deposit "disappeared". Only the fee was spent. */
const FAILURES: Record<string, string> = {
  tecDST_TAG_NEEDED: "The destination requires a destination tag and none was given, so the ledger refused the payment.",
  tecNO_DST: "The destination account does not exist, and the payment was too small to create it.",
  tecNO_DST_INSUF_XRP: "The destination account does not exist, and the payment was below the base reserve needed to create it.",
  tecNO_PERMISSION: "The destination only accepts payments from senders it has preauthorised (deposit authorisation).",
  tecUNFUNDED_PAYMENT: "The sender did not have enough spendable XRP (balance above the reserve) to send that amount.",
  tecPATH_DRY: "No path could deliver the token: the destination has no trust line for it, or there was no liquidity.",
  tecPATH_PARTIAL: "The path could not deliver the full amount, so nothing was delivered.",
  tecNO_LINE: "The destination has no trust line for that token.",
  tecNO_LINE_INSUF_RESERVE: "The destination has no trust line for that token and cannot afford the reserve to create one.",
  tecNO_AUTH: "The token's issuer requires authorisation and the destination is not authorised to hold it.",
  tecFROZEN: "The token is frozen, so it could not move.",
  tecINSUF_RESERVE_LINE: "The account could not afford the reserve the trust line needed.",
  tecEXPIRED: "The transaction expired before it could apply.",
};

const LSF_REQUIRE_DEST_TAG = 0x00020000;

function amountText(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string" && /^\d+$/.test(raw)) return `${(Number(raw) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
  const a = raw as Json;
  return `${a.value} ${decodeCurrency(String(a.currency ?? ""))}${a.issuer ? ` (issuer ${a.issuer})` : ""}`;
}

const iso = (t: unknown) => (typeof t === "number" ? new Date((t + 946_684_800) * 1000).toISOString() : null);

function hexText(hex: unknown): string | null {
  if (typeof hex !== "string" || !/^([0-9A-Fa-f]{2})+$/.test(hex)) return null;
  return new TextDecoder().decode(new Uint8Array((hex.match(/../g) ?? []).map((b) => parseInt(b, 16))));
}

export type DepositInput = {
  /** The `tx` reply for the hash, or null when the ledger does not know it. */
  tx: Json | null;
  /** account_info of the destination now, or null when it does not exist. */
  destination: Json | null;
  /** The tag the user was told to use, if they give it. */
  expectedTag?: number | null;
  /** Share of the destination's recent incoming payments that carried a destination tag (0–1), when read. */
  taggedShare?: number | null;
};

/** Share of incoming payments in account_tx rows that carried a destination tag, or null with too few to judge. */
export function taggedShareOf(address: string, rows: Json[]): number | null {
  const incoming = rows
    .map((r) => (r.tx_json ?? r.tx ?? r) as Json)
    .filter((t) => t.TransactionType === "Payment" && t.Destination === address && t.Account !== address);
  if (incoming.length < 5) return null;
  return incoming.filter((t) => typeof t.DestinationTag === "number").length / incoming.length;
}

/** Diagnose from the ledger's replies. `generatedAt` fixes the letter's date for tests. Pure apart from hashing. */
export async function diagnoseDeposit(hash: string, input: DepositInput, opts: { generatedAt?: string; customerRef?: string } = {}): Promise<DepositDiagnosis> {
  const reply = input.tx;
  const tx = (reply?.tx_json ?? reply) as Json | null;
  const meta = (reply?.meta ?? {}) as Json;
  const dest = (input.destination?.account_data ?? null) as Json | null;
  const facts: DepositDiagnosis["facts"] = {
    result: meta.TransactionResult ?? null,
    ledger: typeof reply?.ledger_index === "number" ? reply.ledger_index : null,
    at: iso(tx?.date ?? reply?.date) ?? (typeof reply?.close_time_iso === "string" ? reply.close_time_iso : null),
    from: tx?.Account ?? null,
    to: tx?.Destination ?? null,
    destinationTag: typeof tx?.DestinationTag === "number" ? tx.DestinationTag : null,
    requested: amountText(tx?.DeliverMax ?? tx?.Amount),
    delivered: amountText(meta.delivered_amount ?? meta.DeliveredAmount),
    feeXrp: tx?.Fee ? Number(tx.Fee) / 1_000_000 : null,
    destinationDomain: hexText(dest?.Domain),
    destinationRequiresTag: dest ? (Number(dest.Flags ?? 0) & LSF_REQUIRE_DEST_TAG) !== 0 : null,
    destinationExists: input.destination === null ? false : dest ? true : null,
  };

  if (!reply || !tx) {
    return { hash, outcome: "not_found", headline: "No validated transaction has this hash", explanation: "The public ledger does not know it. Check the hash (it is 64 characters, from your wallet's history). If your wallet shows it as pending, it was never validated and nothing left your account.", steps: ["Copy the hash again from your wallet's transaction details.", "If it never validated, your balance was not changed: check it."], facts };
  }
  if (tx.TransactionType !== "Payment") {
    return { hash, outcome: "not_payment", headline: `This is a ${tx.TransactionType}, not a payment`, explanation: "This helper explains deposits. Open the transaction in Settlement Forensics for any other type.", steps: [], facts };
  }
  const result = String(meta.TransactionResult ?? "");
  if (result !== "tesSUCCESS") {
    const why = FAILURES[result] ?? `The payment failed with ${result}.`;
    return {
      hash,
      outcome: "failed_nothing_lost",
      headline: "The payment failed. Your funds never left your account.",
      explanation: `${why} A failed transaction still pays its fee (${facts.feeXrp ?? 0.00001} XRP, destroyed), but nothing else moved: the amount is still in ${facts.from}.`,
      steps: result === "tecDST_TAG_NEEDED" ? ["Get the destination tag from the exchange's deposit page.", "Send again with that tag."] : ["Fix the cause above, then send again.", "Check your balance: the amount is still there."],
      facts,
    };
  }
  const delivered = meta.delivered_amount ?? meta.DeliveredAmount;
  const requestedRaw = tx.DeliverMax ?? tx.Amount;
  if (typeof delivered === "object" && typeof requestedRaw === "object" && Number(delivered.value) < Number(requestedRaw.value)) {
    return { hash, outcome: "partial_delivery", headline: `Only ${facts.delivered} arrived, not ${facts.requested}`, explanation: "This was a partial payment: the Amount field is a ceiling, not what arrived. A recipient must credit delivered_amount, which is what reached them.", steps: ["Compare with what the recipient credited.", "If they credited the Amount field, they were misled by the partial-payment flag."], facts };
  }
  if (typeof delivered === "string" && typeof requestedRaw === "string" && Number(delivered) < Number(requestedRaw)) {
    return { hash, outcome: "partial_delivery", headline: `Only ${facts.delivered} arrived, not ${facts.requested}`, explanation: "This was a partial payment: the Amount field is a ceiling, not what arrived.", steps: [], facts };
  }

  // A service that pools customers' deposits either requires destination tags or, when it does not
  // enforce them, still receives mostly tagged payments. A domain alone is not the mark.
  const custodial = facts.destinationRequiresTag === true || (input.taggedShare ?? 0) >= 0.5;
  const tagWrong = input.expectedTag !== undefined && input.expectedTag !== null && facts.destinationTag !== input.expectedTag;
  if (custodial && (facts.destinationTag === null || tagWrong)) {
    const outcome: DepositOutcome = facts.destinationTag === null ? "delivered_no_tag_custodial" : "delivered_tag_custodial";
    const letter = await depositLetter(hash, facts, { expectedTag: input.expectedTag ?? null, generatedAt: opts.generatedAt, customerRef: opts.customerRef });
    return {
      hash,
      outcome,
      headline: facts.destinationTag === null ? `${facts.delivered} reached the service, without a destination tag` : `${facts.delivered} reached the service with tag ${facts.destinationTag}, not your tag ${input.expectedTag}`,
      explanation: `The payment succeeded: the funds are in ${facts.to}${facts.destinationDomain ? ` (which claims ${facts.destinationDomain})` : ""}, a pooled account where the service credits each customer by tag. Without the right tag it cannot tell the deposit is yours, so it sits unassigned. Only the service can credit it, and services routinely do when given the facts below. Nobody else can move it, so ignore anyone offering to "recover" it for a fee.`,
      steps: [
        "Open a support ticket with the service from your logged-in account (never through a link someone sent you).",
        "Paste the letter below; attach it as a file if they allow.",
        "Expect them to ask you to prove you own the sending address, usually by a small payment or signing a message from it.",
      ],
      facts,
      letter,
    };
  }
  if (!custodial && facts.destinationExists !== false) {
    return {
      hash,
      outcome: "delivered_private",
      headline: `${facts.delivered} was delivered to ${facts.to}`,
      explanation: "The payment succeeded to an account that does not require destination tags: most likely a personal wallet. Only whoever holds its key can send it back. If you meant to send elsewhere (a mistyped or poisoned address), the only route is asking the owner; if the account belongs to someone who tricked you, see Incident Response.",
      steps: ["Compare the destination with the address you meant, character by character.", "If you know the owner, ask them to return it.", "If it was a scam, open Incident Response to trace it and prepare a report."],
      facts,
    };
  }
  return { hash, outcome: "delivered", headline: `${facts.delivered} was delivered to ${facts.to}${facts.destinationTag !== null ? ` with tag ${facts.destinationTag}` : ""}`, explanation: "The payment succeeded with a destination tag. If the service has not credited it, give it the hash: it can look up the deposit directly.", steps: ["Send the service the transaction hash and the tag.", "Deposits are usually credited after a few ledgers; delays mean a manual review."], facts };
}

async function depositLetter(hash: string, f: DepositDiagnosis["facts"], o: { expectedTag: number | null; generatedAt?: string; customerRef?: string }) {
  const lines = [
    `Subject: Unassigned XRP Ledger deposit, transaction ${hash}`,
    "",
    `To the support team${f.destinationDomain ? ` of ${f.destinationDomain}` : ""},`,
    "",
    `I sent a deposit to your XRP Ledger address ${f.to} that was ${f.destinationTag === null ? "sent without a destination tag" : `sent with destination tag ${f.destinationTag} instead of my tag`}. It was validated on the ledger and is in your account. Please credit it to my account.`,
    "",
    "Transaction facts (from the validated XRP Ledger):",
    `- Transaction hash: ${hash}`,
    `- Validated in ledger: ${f.ledger ?? "unknown"}${f.at ? ` at ${f.at}` : ""}`,
    `- Result: ${f.result}`,
    `- From (my address): ${f.from}`,
    `- To (your address): ${f.to}`,
    `- Destination tag used: ${f.destinationTag ?? "none"}`,
    `- My correct destination tag: ${o.expectedTag ?? "<your tag from the deposit page>"}`,
    `- Amount delivered: ${f.delivered}`,
    `- My account with you: ${o.customerRef ?? "<your account email or ID>"}`,
    "",
    "I can prove I control the sending address by any method you require (for example, a small payment from it or a signed message).",
    "",
    "Anyone can check these facts on any XRP Ledger explorer by the transaction hash.",
    `Prepared ${o.generatedAt ?? new Date().toISOString()} with NOSHASHI.`,
  ];
  const text = lines.join("\n");
  return { text, sha256: await sha256Hex(text) };
}

/** Read the transaction and its destination live, then diagnose. */
export async function checkDeposit(hash: string, expectedTag?: number | null): Promise<DepositDiagnosis> {
  const clean = hash.trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(clean)) throw new Error("A transaction hash is 64 hexadecimal characters.");
  const tx = await rpc("tx", { transaction: clean, binary: false }).catch((e: unknown) => {
    if (/txnNotFound|not found/i.test(e instanceof Error ? e.message : String(e))) return null;
    throw e;
  });
  const to = (tx?.tx_json ?? tx)?.Destination;
  const destination = typeof to === "string"
    ? await rpc("account_info", { account: to, ledger_index: "validated" }).catch((e: unknown) => (/actNotFound|not found/i.test(e instanceof Error ? e.message : String(e)) ? null : undefined))
    : undefined;
  const history = typeof to === "string" && destination
    ? await rpc("account_tx", { account: to, ledger_index_min: -1, ledger_index_max: -1, forward: false, limit: 100 }).catch(() => null)
    : null;
  return diagnoseDeposit(clean, {
    tx: tx && tx.validated !== false ? tx : null,
    destination: destination === undefined ? ({} as Json) : destination,
    expectedTag,
    taggedShare: history && typeof to === "string" ? taggedShareOf(to, (history.transactions ?? []) as Json[]) : null,
  });
}
