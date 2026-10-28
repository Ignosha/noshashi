import type { Lab } from "@/lib/learn/labs";
import recording from "./testnet-cases.json";

/**
 * The testnet invoice lab, built from real XRPL Testnet payments
 * (scripts/academy/testnet-scenario.mjs made them and judged each one from
 * two testnet operators; testnet-cases.json is that recording). Testnet XRP
 * has no value, so this is practice that costs nothing and risks nothing.
 */

export const TESTNET = recording;

type Case = (typeof recording.cases)[number];
const byId = (id: string) => recording.cases.find((c) => c.id === id) as Case;

const QUESTIONS: Record<string, { question: string; options: string[]; why: string }> = {
  paid: {
    question: "Why is this one VERIFIED?",
    options: [
      "The right amount reached the right account with the right destination tag, in a validated ledger",
      "Because it was sent on testnet",
      "Because the sender is trusted",
    ],
    why: "Every part of the invoice matched what was actually delivered, and both testnet operators agreed.",
  },
  "wrong-tag": {
    question: "The full 5 XRP arrived. Why is it REJECTED?",
    options: [
      "The destination tag says it was for a different customer (2001, not 1042)",
      "The amount was wrong",
      "Testnet payments are always rejected",
    ],
    why: "At an exchange or custodian the tag decides which customer is credited. The right amount with the wrong tag paid somebody else's invoice.",
  },
  underpaid: {
    question: "4 XRP arrived on a 5 XRP invoice. What does the check say?",
    options: ["REJECTED, underpaid", "VERIFIED, close enough", "HOLD, because it is close"],
    why: "Amounts are compared exactly. Short by any amount is underpaid unless the invoice sets an accepted shortfall.",
  },
  overpaid: {
    question: "6 XRP arrived on a 5 XRP invoice, and the invoice holds overpayments. Why HOLD?",
    options: [
      "A person should decide what to do with the extra 1 XRP before it is credited",
      "Overpayments are always rejected",
      "The ledger is not validated",
    ],
    why: "An overpayment can be a mistake to refund. HOLD means a person looks first; only VERIFIED is green.",
  },
  partial: {
    question: "80 TST was asked for and the payment succeeded. Why is it REJECTED?",
    options: [
      "It was a partial payment that delivered only 50 TST, and the invoice does not accept partial payments",
      "TST is not a real token",
      "The receiving account was wrong",
    ],
    why: "With the partial-payment flag, Amount is only a maximum. Only delivered_amount counts, and it was 50.",
  },
};

export const TESTNET_LAB: Lab = {
  id: "invoice-testnet",
  title: "Practise invoice checks on testnet",
  outcome: "Check five real testnet payments against their invoices and say why each one is VERIFIED, HOLD or REJECTED.",
  minutes: 6,
  note: `Real XRPL Testnet payments, recorded ${recording.recorded_at.slice(0, 10)}. Testnet XRP has no value. If testnet is reset, these payments disappear and the check reports them as not found.`,
  steps: recording.cases.map((c) => {
    const q = QUESTIONS[c.id];
    const inv = c.invoice as Record<string, unknown>;
    const asset = inv.asset as { kind: string; currency?: string; issuer?: string };
    return {
      id: c.id,
      task: `${c.title}. In NOSHASHI, open SETTLEMENT with this hash, switch INVOICE CHECK to TESTNET, enter the invoice below and press CHECK AGAINST INVOICE. Or run it here.`,
      scene: "settlement",
      copy: [
        { label: "TRANSACTION (TESTNET)", value: c.hash },
        { label: "RECEIVING ACCOUNT", value: String(inv.destination) },
        { label: "DESTINATION TAG", value: String(inv.destination_tag) },
        ...(asset.kind === "issued"
          ? [
              { label: "CURRENCY CODE", value: String(asset.currency) },
              { label: "ISSUER", value: String(asset.issuer) },
            ]
          : []),
        { label: "EXPECTED AMOUNT", value: String(inv.expected_amount) },
      ],
      lookFor: `Recorded at testnet ledger ${c.ledger_index.toLocaleString("en-US")}: ${c.status} with reason ${c.reason_code}. Requested ${c.requested}, delivered ${c.delivered}.`,
      check: { question: q.question, options: q.options, answer: 0, why: q.why },
    };
  }),
};

/** The invoice each testnet step checks, exactly as it was recorded. */
export const testnetInvoice = (stepId: string) => {
  const c = byId(stepId);
  return c ? { network: "testnet" as const, hash: c.hash, invoice: c.invoice as Record<string, unknown> } : null;
};
