import {
  digest,
  normalizeHash,
  parseInvoice,
  policyProblem,
  invoiceJson,
  readSources,
  verify,
  LIMITS,
  type InvoicePolicy,
  type VerificationReport,
} from "../noshashi-verify/payment.ts";

export const REVIEW_VERSION = "noshashi.payment-review/1";
export const REVIEW_PLANS = {
  operator: { name: "Free", monthly: 0, records: 25, batch: 5 },
  desk: { name: "Pro", monthly: 749, records: 5000, batch: 25 },
  institution: {
    name: "Institutional",
    monthly: 4000,
    records: 100000,
    batch: 25,
  },
  enterprise: {
    name: "Enterprise",
    monthly: 10000,
    records: 100000,
    batch: 25,
  },
  strategic: {
    name: "Strategic Infrastructure",
    monthly: 20833,
    records: 100000,
    batch: 25,
  },
} as const;
export type ReviewTier = keyof typeof REVIEW_PLANS;
export type ReviewRow = { hash: string; invoice: InvoicePolicy };

export class ReviewError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function parseBatch(raw: unknown): ReviewRow[] {
  if (!raw || typeof raw !== "object" || !("rows" in raw))
    throw new ReviewError(400, "Supply a rows array.");
  const rows = (raw as { rows: unknown }).rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 25)
    throw new ReviewError(400, "Supply 1–25 rows.");
  const seen = new Set<string>();
  return rows.map((row, i) => {
    if (!row || typeof row !== "object")
      throw new ReviewError(400, `Row ${i + 1} is invalid.`);
    const hash = normalizeHash(String(row.hash ?? ""));
    if (!hash)
      throw new ReviewError(
        400,
        `Row ${i + 1}: use a 64-character transaction hash.`,
      );
    if (seen.has(hash))
      throw new ReviewError(
        400,
        "A transaction may appear only once per batch.",
      );
    seen.add(hash);
    const invoice = parseInvoice(row.invoice);
    if (typeof invoice === "string")
      throw new ReviewError(400, `Row ${i + 1}: ${invoice}`);
    const problem = policyProblem(invoice);
    if (problem) throw new ReviewError(400, `Row ${i + 1}: ${problem}`);
    if (!invoice.invoice_id.trim() || invoice.invoice_id.length > 120)
      throw new ReviewError(
        400,
        "Use a nonempty invoice ID of at most 120 characters.",
      );
    return { hash, invoice };
  });
}

export function batchPayload(rows: ReviewRow[]) {
  return {
    schema: REVIEW_VERSION,
    network: "mainnet",
    rows: rows.map((r) => ({ hash: r.hash, invoice: invoiceJson(r.invoice) })),
  };
}

export async function reviewRows(
  rows: ReviewRow[],
  fetcher: typeof fetch = fetch,
) {
  // Four concurrent rows, two public operators each; a bounded read, no hidden fallback.
  const reports: VerificationReport[] = new Array(rows.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, rows.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= rows.length) return;
        const row = rows[i];
        const { reads } = await readSources(
          row.hash,
          "mainnet",
          true,
          { ...LIMITS, requestTimeoutMs: 6000, maxAttempts: 1 },
          fetcher,
        );
        reports[i] = await verify({
          requestedHash: row.hash,
          network: "mainnet",
          reads,
          invoice: row.invoice,
          priorInvoice: null,
          evaluatedAt: new Date().toISOString(),
        });
      }
    }),
  );
  const evidence = { schema: REVIEW_VERSION, network: "mainnet", reports };
  return {
    ...evidence,
    digest: await digest(evidence),
    signature: null,
    limitations: [
      "Public servers remain trusted; two reads are not independent consensus verification.",
      "A receipt hash is not a digital signature.",
      "This checks the supplied payment list; it does not prove the list is complete.",
      "No settlement booking, invoice allocation or transaction execution occurs.",
    ],
  };
}

export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}

export function reviewCsv(reports: VerificationReport[]) {
  const keys = [
    "invoice_id",
    "transaction_hash",
    "status",
    "reason_code",
    "ledger_index",
    "delivered",
    "difference",
    "evidence_digest",
  ];
  return (
    [
      keys.join(","),
      ...reports.map((r) =>
        [
          r.invoice_id,
          r.transaction_hash,
          r.status,
          r.reason_code,
          r.ledger_index,
          r.delivered_amount?.value,
          r.amount_difference,
          r.evidence_digest,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
