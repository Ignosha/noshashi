#!/usr/bin/env node
/**
 * Real XRPL Testnet payments for the Academy's invoice lab.
 *
 * Testnet is the XRP Ledger's public practice network: the same software,
 * XRP with no value, accounts from a free faucet. This script makes the
 * lab's cases happen there for real, then checks each one with the same
 * rules the desktop app uses (supabase/functions/noshashi-verify/payment.ts,
 * kept identical to the Rust engine by the shared vectors), reading two
 * independent testnet operators:
 *
 *   paid        5 XRP to tag 1042, invoice 5 XRP tag 1042   → VERIFIED
 *   wrong-tag   5 XRP to tag 2001, invoice tag 1042         → REJECTED
 *   underpaid   4 XRP to tag 1043, invoice 5 XRP            → REJECTED
 *   overpaid    6 XRP to tag 1044, invoice 5 XRP, hold over → HOLD
 *   partial     partial payment of a testnet token, 80 asked, 50 sent → REJECTED
 *
 * It writes src/lib/academy/testnet-cases.json: the accounts' public
 * addresses, each transaction hash and ledger, and the verdict read back.
 * The faucet's secrets exist only in this process's memory and are never
 * written anywhere. Run it on a machine that can reach the testnet (CI):
 *
 *   npm i --no-save xrpl@4.0.0
 *   node --experimental-strip-types scripts/academy/testnet-scenario.mjs
 *
 * Testnet is reset from time to time, which erases these transactions. Run
 * this again after a reset and the lab follows the new recording.
 */
import { writeFileSync } from "node:fs";
import { Client, xrpToDrops } from "xrpl";
import * as pay from "../../supabase/functions/noshashi-verify/payment.ts";

const OUT = new URL("../../src/lib/academy/testnet-cases.json", import.meta.url);
const TF_PARTIAL_PAYMENT = 0x00020000;
const ASF_DEFAULT_RIPPLE = 8;
// A testnet token. "TST" says what it is: nobody can mistake it for money.
const TOKEN = "TST";

const client = new Client("wss://s.altnet.rippletest.net:51233");
await client.connect();

async function submit(tx, wallet) {
  const res = await client.submitAndWait(tx, { autofill: true, wallet });
  const meta = res.result.meta;
  if (meta?.TransactionResult !== "tesSUCCESS") {
    throw new Error(`${tx.TransactionType} failed: ${meta?.TransactionResult}`);
  }
  return { hash: res.result.hash, ledger: res.result.ledger_index, delivered: meta.delivered_amount };
}

const fund = async () => (await client.fundWallet()).wallet;
// The faucet's grant is small, so the amounts below are a few XRP each.
const merchant = await fund();
const customer = await fund();
const issuer = await fund();
console.log(`merchant ${merchant.classicAddress}\ncustomer ${customer.classicAddress}\nissuer   ${issuer.classicAddress}`);

// The token: the issuer lets its token pass between holders, both holders
// trust it, and the issuer gives the customer 100.
await submit({ TransactionType: "AccountSet", Account: issuer.classicAddress, SetFlag: ASF_DEFAULT_RIPPLE }, issuer);
for (const holder of [customer, merchant]) {
  await submit(
    { TransactionType: "TrustSet", Account: holder.classicAddress, LimitAmount: { currency: TOKEN, issuer: issuer.classicAddress, value: "1000" } },
    holder
  );
}
await submit(
  {
    TransactionType: "Payment",
    Account: issuer.classicAddress,
    Destination: customer.classicAddress,
    Amount: { currency: TOKEN, issuer: issuer.classicAddress, value: "100" },
  },
  issuer
);

const xrpPay = (xrp, tag) => ({
  TransactionType: "Payment",
  Account: customer.classicAddress,
  Destination: merchant.classicAddress,
  DestinationTag: tag,
  Amount: xrpToDrops(xrp),
});
const tokenAsset = { kind: "issued", currency: TOKEN, issuer: issuer.classicAddress };

const CASES = [
  {
    id: "paid",
    title: "Paid in full, right tag",
    tx: xrpPay("5", 1042),
    invoice: { invoice_id: "TEST-1042", destination: merchant.classicAddress, destination_tag: 1042, asset: { kind: "xrp" }, expected_amount: "5" },
    expect: "VERIFIED",
  },
  {
    id: "wrong-tag",
    title: "Right amount, wrong destination tag",
    tx: xrpPay("5", 2001),
    invoice: { invoice_id: "TEST-1042B", destination: merchant.classicAddress, destination_tag: 1042, asset: { kind: "xrp" }, expected_amount: "5" },
    expect: "REJECTED",
  },
  {
    id: "underpaid",
    title: "Paid 4 XRP on a 5 XRP invoice",
    tx: xrpPay("4", 1043),
    invoice: { invoice_id: "TEST-1043", destination: merchant.classicAddress, destination_tag: 1043, asset: { kind: "xrp" }, expected_amount: "5" },
    expect: "REJECTED",
  },
  {
    id: "overpaid",
    title: "Paid 6 XRP on a 5 XRP invoice",
    tx: xrpPay("6", 1044),
    invoice: {
      invoice_id: "TEST-1044",
      destination: merchant.classicAddress,
      destination_tag: 1044,
      asset: { kind: "xrp" },
      expected_amount: "5",
      hold_overpayment: true,
    },
    expect: "HOLD",
  },
  {
    id: "partial",
    title: "A partial payment: 80 TST asked, at most 50 sent",
    tx: {
      TransactionType: "Payment",
      Account: customer.classicAddress,
      Destination: merchant.classicAddress,
      DestinationTag: 1045,
      Amount: { currency: TOKEN, issuer: issuer.classicAddress, value: "80" },
      SendMax: { currency: TOKEN, issuer: issuer.classicAddress, value: "50" },
      Flags: TF_PARTIAL_PAYMENT,
    },
    invoice: { invoice_id: "TEST-1045", destination: merchant.classicAddress, destination_tag: 1045, asset: tokenAsset, expected_amount: "80" },
    expect: "REJECTED",
  },
];

const cases = [];
for (const c of CASES) {
  const sent = await submit(c.tx, customer);
  // Both operators must have the validated transaction before it is judged.
  let report;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { reads } = await pay.readSources(sent.hash, "testnet", true);
    const invoice = pay.parseInvoice(c.invoice);
    if (typeof invoice === "string") throw new Error(`${c.id}: ${invoice}`);
    report = await pay.verify({ requestedHash: sent.hash, network: "testnet", reads, invoice, priorInvoice: null, evaluatedAt: new Date().toISOString() });
    if (report.status === c.expect) break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  console.log(`${c.id}: ${sent.hash} ledger ${sent.ledger} → ${report.status} ${report.reason_code}`);
  if (report.status !== c.expect) throw new Error(`${c.id}: expected ${c.expect}, got ${report.status} ${report.reason_code}`);
  cases.push({
    id: c.id,
    title: c.title,
    hash: sent.hash,
    ledger_index: sent.ledger,
    destination_tag: c.tx.DestinationTag,
    requested: typeof c.tx.Amount === "string" ? `${Number(c.tx.Amount) / 1e6} XRP` : `${c.tx.Amount.value} ${TOKEN}`,
    delivered: report.delivered_amount ? `${report.delivered_amount.value} ${report.delivered_amount.asset.kind === "xrp" ? "XRP" : TOKEN}` : null,
    partial_payment: report.partial_payment,
    invoice: c.invoice,
    status: report.status,
    reason_code: report.reason_code,
    sources: report.sources,
  });
}
await client.disconnect();

writeFileSync(
  OUT,
  JSON.stringify(
    {
      _about:
        "Real XRPL Testnet transactions made by scripts/academy/testnet-scenario.mjs and judged with the app's payment rules from two testnet operators. Testnet XRP has no value. Testnet is reset from time to time; re-run the script after a reset.",
      network: "testnet",
      recorded_at: new Date().toISOString(),
      rules_version: pay.RULES_VERSION,
      token: TOKEN,
      accounts: { merchant: merchant.classicAddress, customer: customer.classicAddress, issuer: issuer.classicAddress },
      cases,
    },
    null,
    2
  ) + "\n"
);
console.log(`wrote ${OUT.pathname}`);
