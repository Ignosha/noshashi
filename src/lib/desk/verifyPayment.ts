import { isValidClassicAddress, isValidXAddress, xAddressToClassicAddress } from "ripple-address-codec";
import { isTauri } from "@/lib/env";

/**
 * Invoice-level payment verification, decided in Rust.
 *
 * settlement.ts reads a transaction and describes what it moved. This
 * module asks the question a merchant actually has: did this transaction
 * pay this invoice? The answer comes from the `verify_xrpl_payment`
 * command (src-tauri/src/verify), which reads allowlisted XRPL nodes,
 * compares exact amounts and returns VERIFIED, HOLD or REJECTED with a
 * reason code and an evidence digest. Nothing here decides a settlement:
 * the form checks below only stop obviously incomplete input from being
 * sent, and the Rust side validates everything again.
 *
 * Money stays in strings end to end. A JavaScript number would turn
 * 0.1 + 0.2 into 0.30000000000000004 and 10^17 drops into a rounded figure.
 */

export type Asset = { kind: "xrp" } | { kind: "issued"; currency: string; issuer: string };

export type InvoicePolicy = {
  invoice_id: string;
  destination: string;
  destination_tag?: number;
  asset: Asset;
  /** Units of the asset (XRP, not drops), as a decimal string. */
  expected_amount: string;
  underpayment_tolerance?: string;
  allow_partial_payment: boolean;
  hold_overpayment: boolean;
};

export type VerificationStatus = "VERIFIED" | "HOLD" | "REJECTED";

export type AmountView = { asset: Asset; value: string };

export type VerificationReport = {
  transaction_hash: string;
  network: "mainnet" | "testnet";
  status: VerificationStatus;
  reason_code: string;
  explanation: string;
  findings: Array<{ code: string; explanation: string }>;
  validated: boolean | null;
  ledger_index: number | null;
  transaction_result: string | null;
  transaction_type: string | null;
  requested_amount: AmountView | null;
  delivered_amount: AmountView | null;
  partial_payment: boolean | null;
  amount_difference: string | null;
  amount_mismatch: boolean | null;
  invoice_id: string | null;
  sources: string[];
  observed_at: string;
  rule_version: string;
  decision_key: string;
  evidence_digest: string;
  evidence: unknown;
};

export type SourceStats = { source: string; attempts: number; latency_ms: number; last_error: string | null };

export type VerifyResponse = { report: VerificationReport; sourceStats: SourceStats[]; recorded: boolean };

export type InvoiceForm = {
  invoiceId: string;
  destination: string;
  destinationTag: string;
  assetKind: "xrp" | "issued";
  currency: string;
  issuer: string;
  expectedAmount: string;
  tolerance: string;
  allowPartial: boolean;
  holdOverpayment: boolean;
};

export const EMPTY_INVOICE: InvoiceForm = {
  invoiceId: "",
  destination: "",
  destinationTag: "",
  assetKind: "xrp",
  currency: "",
  issuer: "",
  expectedAmount: "",
  tolerance: "",
  allowPartial: false,
  holdOverpayment: false,
};

const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * An address as pasted, without the characters copying adds: spaces, line
 * breaks, and invisible ones (zero-width space, joiners, BOM, soft hyphen)
 * that String.trim leaves in and that make a correct address fail.
 */
export function cleanAddress(value: string): string {
  return value.replace(/[\s\u00AD\u200B-\u200D\u2060\uFEFF]/g, "");
}

/**
 * Why an address is not a classic XRPL address, or null when it is. The
 * base58 checksum is checked here, so a single mistyped character is caught
 * before the ledger is read instead of coming back as a destination mismatch.
 */
export function addressProblem(address: string, role: string): string | null {
  if (!address) return `Enter the ${role}.`;
  if (/^R/.test(address)) return `The ${role} starts with a capital R. XRPL addresses start with a lower-case r.`;
  if (!address.startsWith("r")) return `The ${role} is an XRPL address beginning with r.`;
  if (/[0OIl]/.test(address)) return `The ${role} contains 0, O, I or l, which XRPL addresses never use. Check for a mistyped character.`;
  if (address.length < 25 || address.length > 35) return `The ${role} is ${address.length} characters; XRPL addresses are 25 to 35.`;
  if (!isValidClassicAddress(address)) return `The ${role} fails its checksum, so a character is probably mistyped. Paste it from the wallet or explorer.`;
  return null;
}

/** The form as an invoice policy, or the first thing missing from it. */
export function buildInvoice(form: InvoiceForm): InvoicePolicy | string {
  const id = form.invoiceId.trim();
  if (!id) return "Give the invoice an identifier.";
  let destination = cleanAddress(form.destination);
  // An X-address carries the account and its tag together; the ledger
  // records them apart, so it is split here.
  let xTag: number | undefined;
  if (isValidXAddress(destination)) {
    const x = xAddressToClassicAddress(destination);
    destination = x.classicAddress;
    if (x.tag !== false) xTag = x.tag;
  }
  const destinationProblem = addressProblem(destination, "receiving account");
  if (destinationProblem) return destinationProblem;
  const amount = form.expectedAmount.trim();
  if (!DECIMAL.test(amount) || /^0+(\.0+)?$/.test(amount)) return "The expected amount is a positive decimal number, like 125 or 0.5.";
  let tag: number | undefined;
  if (form.destinationTag.trim()) {
    const n = Number(form.destinationTag.trim());
    if (!Number.isInteger(n) || n < 0 || n > 4294967295) return "A destination tag is a whole number up to 4294967295.";
    tag = n;
  }
  if (xTag !== undefined) {
    if (tag !== undefined && tag !== xTag) return `The receiving account's X-address carries tag ${xTag}, but the destination tag says ${tag}.`;
    tag = xTag;
  }
  const tolerance = form.tolerance.trim();
  if (tolerance && !DECIMAL.test(tolerance)) return "The tolerance is a decimal number, or empty for none.";
  let asset: Asset = { kind: "xrp" };
  if (form.assetKind === "issued") {
    const currency = form.currency.trim();
    const issuer = cleanAddress(form.issuer);
    if (!/^([A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}|[0-9A-Fa-f]{40})$/.test(currency) || currency.toUpperCase() === "XRP") {
      return "An issued currency is a 3-character code or a 40-hex code.";
    }
    const issuerProblem = addressProblem(issuer, "issuer");
    if (issuerProblem) return issuerProblem;
    asset = { kind: "issued", currency, issuer };
  }
  return {
    invoice_id: id,
    destination,
    ...(tag !== undefined ? { destination_tag: tag } : {}),
    asset,
    expected_amount: amount,
    ...(tolerance ? { underpayment_tolerance: tolerance } : {}),
    allow_partial_payment: form.allowPartial,
    hold_overpayment: form.holdOverpayment,
  };
}

export async function verifyPayment(request: {
  hash: string;
  network: "mainnet" | "testnet";
  invoice?: InvoicePolicy;
  dualSource: boolean;
  record: boolean;
}): Promise<VerifyResponse> {
  if (!isTauri) {
    throw new Error("Invoice verification runs in the NOSHASHI desktop app, where the checks are made in Rust against the ledger.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<VerifyResponse>("verify_xrpl_payment", { request });
}

export function formatAmountView(a: AmountView | null): string {
  if (!a) return "—";
  if (a.asset.kind === "xrp") return `${a.value} XRP`;
  let code = a.asset.currency;
  if (/^[0-9A-F]{40}$/i.test(code)) {
    const decoded = (code.match(/../g) ?? [])
      .map((b) => String.fromCharCode(parseInt(b, 16)))
      .join("")
      .replace(/\0+$/, "")
      .trim();
    if (decoded && /^[\x20-\x7E]+$/.test(decoded)) code = decoded;
  }
  return `${a.value} ${code}`;
}

/** The evidence record and its digest, as a file a reviewer can re-hash. */
export function evidenceFile(report: VerificationReport): { filename: string; contents: string } {
  return {
    filename: `noshashi-payment-evidence-${report.transaction_hash.slice(0, 12)}.json`,
    contents: JSON.stringify(
      {
        evidence_digest: report.evidence_digest,
        digest_algorithm: "SHA-256 over canonical JSON (object keys sorted by UTF-8 bytes at every depth, no whitespace) of `evidence`",
        decision_key: report.decision_key,
        status: report.status,
        reason_code: report.reason_code,
        evidence: report.evidence,
      },
      null,
      2
    ),
  };
}

/**
 * The canonical form the Rust engine digests (src-tauri/src/verify/
 * evidence.rs): object keys sorted by their UTF-8 bytes at every depth, no
 * whitespace. With it, anyone holding an exported record can recompute
 * its digest without this app: SHA-256 of canonicalJson(evidence).
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const encoder = new TextEncoder();
    const keys = Object.keys(value as Record<string, unknown>).sort((a, b) => {
      const x = encoder.encode(a);
      const y = encoder.encode(b);
      for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] !== y[i]) return x[i] - y[i];
      return x.length - y.length;
    });
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
