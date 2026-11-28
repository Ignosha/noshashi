import { rippleRpcWithSource } from "../authority.js";
import { receiptFor } from "../asset-risk-receipt.js";
import { isValidClassicAddress } from "../classic-address.js";
import { queryOf } from "../query.js";
import { clientKey, take } from "../rate-limit.js";

const REQUIRE_TAG = 0x00020000;
const DEPOSIT_AUTH = 0x01000000;
const DISALLOW_XRP = 0x00080000;
const HASH = /^[A-Fa-f0-9]{64}$/;

function begin(req, res, route) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Use GET." });
    return false;
  }
  const limit = take(`${route}:${clientKey(req)}`, { limit: 20 });
  if (limit.ok) return true;
  res.setHeader("Retry-After", String(limit.retryAfter));
  res.status(429).json({ error: "Rate limit reached. Try again shortly." });
  return false;
}

async function reply(res, report) {
  return res.status(200).json({
    ...report,
    receipt: { algorithm: "SHA-256", digest: await receiptFor(report) },
  });
}

export async function destinationPreflight(req, res) {
  if (!begin(req, res, "destination-preflight")) return;
  const q = queryOf(req);
  const address = String(q.account ?? "").trim();
  const tag = q.tag;
  if (!isValidClassicAddress(address)) return res.status(400).json({ error: "Enter a valid XRPL classic address." });
  if (tag !== undefined && (!/^\d{1,10}$/.test(String(tag)) || Number(tag) > 4294967295)) {
    return res.status(400).json({ error: "Use a destination tag from 0 to 4294967295." });
  }
  const report = {
    schema: "noshashi.destination-preflight.v1",
    network: "XRPL Mainnet",
    destination: address,
    supplied_tag: tag === undefined ? null : Number(tag),
    scope: "Recipient settings for direct XRP payments. Tag ownership, funding, sender authorization and transaction execution are outside this check.",
  };
  try {
    const { result, endpoint } = await rippleRpcWithSource("account_info", { account: address, ledger_index: "validated" }, 6000);
    const flags = result.account_data?.Flags;
    const index = Number(result.ledger_index);
    if (result.validated !== true || !Number.isSafeInteger(index) || index < 1 ||
        result.account_data?.Account !== address || !Number.isInteger(flags) || flags < 0 || flags > 0xffffffff) {
      return res.status(502).json({ error: "Could not verify the destination against a validated ledger." });
    }
    const checks = {
      requires_destination_tag: Boolean(flags & REQUIRE_TAG),
      deposit_authorization: Boolean(flags & DEPOSIT_AUTH),
      prefers_no_xrp: Boolean(flags & DISALLOW_XRP),
    };
    const findings = [];
    if (checks.requires_destination_tag && tag === undefined) findings.push("DESTINATION_TAG_REQUIRED");
    if (checks.deposit_authorization) findings.push("DEPOSIT_AUTHORIZATION_NEEDS_REVIEW");
    if (checks.prefers_no_xrp) findings.push("RECIPIENT_PREFERS_NO_XRP");
    return reply(res, { ...report, verdict: findings.length ? "REVIEW" : "NO_SETTING_ISSUE_FOUND", checks, findings, ledger_index: index, source: endpoint });
  } catch (error) {
    if (error?.code === "actNotFound") return reply(res, { ...report, verdict: "REVIEW", findings: ["ACCOUNT_NOT_FOUND"], ledger_index: null });
    return res.status(503).json({ error: "XRPL account data is temporarily unavailable." });
  }
}

export async function paymentReceipt(req, res) {
  if (!begin(req, res, "payment-receipt")) return;
  const hash = String(queryOf(req).hash ?? "").trim().toUpperCase();
  if (!HASH.test(hash)) return res.status(400).json({ error: "Enter a 64-character transaction hash." });
  try {
    const { result, endpoint } = await rippleRpcWithSource("tx", { transaction: hash, binary: false }, 6000);
    const tx = result.tx_json ?? result;
    const index = Number(result.ledger_index ?? tx.ledger_index);
    const meta = result.meta;
    if (result.validated !== true || !Number.isSafeInteger(index) || index < 1 ||
        String(result.hash ?? tx.hash).toUpperCase() !== hash) {
      return res.status(409).json({ error: "The transaction could not be confirmed in a validated ledger." });
    }
    if (tx.TransactionType !== "Payment") return res.status(422).json({ error: "This transaction is not an XRPL Payment." });
    if (typeof meta?.TransactionResult !== "string") return res.status(502).json({ error: "Payment metadata was unavailable." });
    const raw = meta.delivered_amount;
    const delivered = typeof raw === "string" && /^\d+$/.test(raw) ? { currency: "XRP", drops: raw }
      : raw && typeof raw === "object" ? raw : null;
    const success = meta.TransactionResult === "tesSUCCESS";
    return reply(res, {
      schema: "noshashi.payment-receipt.v1", network: "XRPL Mainnet", transaction_hash: hash,
      ledger_index: index, source: endpoint, sender: tx.Account, destination: tx.Destination,
      destination_tag: tx.DestinationTag ?? null, transaction_result: meta.TransactionResult,
      status: !success ? "FAILED" : delivered ? "DELIVERED" : "AMOUNT_UNAVAILABLE",
      delivered_amount: success ? delivered : null,
    });
  } catch (error) {
    if (error?.code === "txnNotFound") return res.status(404).json({ error: "Transaction not found on the queried XRPL node." });
    return res.status(503).json({ error: "XRPL transaction data is temporarily unavailable." });
  }
}
