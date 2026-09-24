import type { SceneId } from "@/App";
import { interpretTransaction, formatAmount } from "@/lib/desk/settlement";
import { buildSide } from "@/lib/desk/book";
import { minimumSignersForQuorum } from "@/lib/desk/control";
import { sentSinceCreation } from "@/lib/desk/provenance";
import { unfundedAccount } from "@/lib/xrpl/client";
import { evaluatePolicy, DOMAIN_REGISTRY } from "@/lib/policy";
import { rippleTimeToDate } from "@/lib/format";
import recorded from "./misread.cases.json";

/**
 * "The ledger can be transparent and still be misread."
 *
 * Each case pairs a real mainnet reply with two readings of it: what an
 * interface gets by taking the obvious field at face value, and what
 * NOSHASHI reports. The verified column is not written here — it is the
 * output of the same function the app runs on a live read (settlement,
 * book, provenance, control, policy), called on the recorded reply. If
 * that code changed its answer, this page would change with it, and
 * src/lib/learn/__tests__/misread.test.ts pins both columns.
 */

export type MisreadCase = {
  id: string;
  title: string;
  /** What a basic interface shows. */
  basic: { label: string; value: string };
  /** What NOSHASHI reports, from its own code. */
  verified: { label: string; value: string };
  why: string;
  /** The recorded evidence: ledger and the object it came from. */
  evidence: { ledger: number; ref: string; refLabel: string };
  /** The module that makes the verified reading. */
  module: string;
  /** Where to run the same reading live in the app. */
  scene: SceneId;
};

const n = (v: number, max = 6) => v.toLocaleString("en-US", { maximumFractionDigits: max });
const utc = (d: Date) => d.toISOString().replace("T", " ").replace(/\.000Z$/, " UTC");

export function misreadCases(): MisreadCase[] {
  const pp = recorded.partialPayment;
  const report = interpretTransaction(pp.reply);

  const book = recorded.book;
  const side = buildSide(
    book.offers.map(([Account, gets, pays, funded, Expiration]) => ({
      Account,
      TakerGets: { currency: "USD", issuer: book.issuer, value: gets },
      TakerPays: pays,
      ...(funded !== null ? { taker_gets_funded: { currency: "USD", issuer: book.issuer, value: funded } } : {}),
      ...(Expiration !== null ? { Expiration } : {}),
    })),
    book.closeTime,
    false
  );

  const seq = recorded.sequence;
  const sent = sentSinceCreation(seq.accountRoot.Sequence, seq.createdBy.ledger_index);

  const q = recorded.quorum.signerList;
  const signers = q.SignerEntries.map((e) => ({ account: e.SignerEntry.Account, weight: e.SignerEntry.SignerWeight }));
  const needed = minimumSignersForQuorum(signers, q.SignerQuorum);

  const absent = recorded.absent;
  const verdict = evaluatePolicy({
    account: unfundedAccount(absent.address),
    credentials: [],
    domain: DOMAIN_REGISTRY[0],
    amountXrp: 0,
  });
  const activated = verdict.checks.find((c) => c.id === "ACCOUNT_ACTIVATED")!;

  const date = pp.reply.date;

  return [
    {
      id: "delivered",
      title: "delivered_amount ≠ Amount",
      basic: { label: "Amount field", value: `${formatAmount(report.requested!)} paid` },
      verified: {
        label: "delivered_amount",
        value: `${formatAmount(report.delivered!)} arrived — ${n((report.deliveredFraction ?? 0) * 100, 5)}% of the stated amount`,
      },
      why: `A successful (${report.result}) payment carries the amount it asked to deliver and, separately, what arrived. With the partial-payment flag set they differ and the transaction still succeeds. Crediting the Amount field would over-credit by ${n(1 / (report.deliveredFraction ?? 1), 0)}×. This one is an account paying itself through the exchange; the same flag on a payment to an exchange is how deposits get over-credited.`,
      evidence: { ledger: pp.ledger, ref: report.hash, refLabel: "transaction" },
      module: "src/lib/desk/settlement.ts",
      scene: "settlement",
    },
    {
      id: "depth",
      title: "Quoted depth ≠ fillable depth",
      basic: { label: "Sum of offers", value: `${n(side.listedDepth, 2)} USD on offer` },
      verified: {
        label: "Funded and unexpired",
        value: `${n(side.fundableDepth, 2)} USD can fill — ${n(side.fundedRatio * 100, 1)}% of what is shown; ${side.deadOffers} of ${side.offers.length} offers cannot fill at all`,
      },
      why: "An offer stays in the book whether or not its owner still holds the asset, and an expired offer is removed only when something touches it. Summing the advertised figures counts exits that cannot happen.",
      evidence: { ledger: book.ledger, ref: book.issuer, refLabel: `${book.offers.length} USD.Bitstamp offers for XRP` },
      module: "src/lib/desk/book.ts",
      scene: "book",
    },
    {
      id: "sequence",
      title: "Sequence ≠ transaction count",
      basic: { label: "Sequence", value: `${n(seq.accountRoot.Sequence)} transactions sent` },
      verified: {
        label: "Sequence − creation ledger",
        value: `${n(sent)} transactions sent. The account was created in ledger ${n(seq.createdBy.ledger_index)}, and as an ${seq.pseudoAccount} pseudo-account it cannot send any.`,
      },
      why: "Since the DeletableAccounts amendment, a new account's Sequence starts at the ledger index it was created in. It says when the account began, not what it has done.",
      evidence: { ledger: seq.ledger, ref: seq.accountRoot.Account, refLabel: "account" },
      module: "src/lib/desk/provenance.ts",
      scene: "provenance",
    },
    {
      id: "quorum",
      title: "Quorum ≠ signer headcount",
      basic: { label: "Signers listed", value: `${signers.length} signers control the account` },
      verified: {
        label: "Minimum who must agree",
        value: `${needed} of ${signers.length} can sign: quorum ${q.SignerQuorum} against weights ${signers.map((s) => s.weight).join(", ")}`,
      },
      why: "XRPL compares a multi-signature quorum against the sum of signing weights, not the number of signers. The number that describes control is the fewest signers who can reach the quorum.",
      evidence: { ledger: recorded.quorum.ledger, ref: q.Owner, refLabel: "signer list owner" },
      module: "src/lib/desk/control.ts",
      scene: "control",
    },
    {
      id: "absent",
      title: "Absent ≠ false",
      basic: { label: "Balance", value: "0 XRP" },
      verified: {
        label: activated.label,
        value: `${activated.passed ? "PASS" : "FAIL"} — ${activated.detail}`,
      },
      why: `The ledger answered ${absent.reply.error}: there is no account at this address. That is not an account holding nothing; a payment to it would have to create it, and nothing about it can be verified.`,
      evidence: { ledger: absent.ledger, ref: absent.address, refLabel: "address" },
      module: "src/lib/xrpl/client.ts",
      scene: "verify",
    },
    {
      id: "epoch",
      title: "Ripple epoch ≠ Unix epoch",
      basic: { label: "date as Unix time", value: utc(new Date(date * 1000)) },
      verified: { label: "date from 2000-01-01", value: utc(rippleTimeToDate(date)) },
      why: "Ledger times count seconds from 2000-01-01, not 1970-01-01. Both readings are plausible dates and only one is right; the wrong one is 30 years early.",
      evidence: { ledger: pp.ledger, ref: report.hash, refLabel: "transaction" },
      module: "src/lib/format.ts",
      scene: "settlement",
    },
  ];
}
