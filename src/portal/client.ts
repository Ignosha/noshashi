import { SUPABASE_PUBLISHABLE_KEY, supabase } from "@/lib/supabase/client";
import { FUNCTIONS_URL } from "@/lib/supabase/project";

export type Report = {
  transaction_hash: string;
  status: string;
  reason_code: string;
  explanation: string;
  invoice_id: string;
  ledger_index: number | null;
  delivered_amount: { value: string; asset: {kind:string;currency?:string;issuer?:string} } | null;
  amount_difference: string | null;
  evidence_digest: string;
  evidence: unknown;
};
export type Run = {
  id: string;
  status: string;
  result?: {
    schema: string;
    network: string;
    reports: Report[];
    digest: string;
    limitations: string[];
  };
  replayed?: boolean;
};
export type Usage = {
  tier: string;
  plan: { name: string; monthly: number; records: number; batch: number };
  used: number;
  period_start: string;
};
export async function portalApi<T>(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  const { data } = await supabase().auth.getSession();
  if (!data.session) throw new Error("Sign in to continue.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(
      `${FUNCTIONS_URL}/noshashi-payment-review/${path}`,
      {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    const result = await response
      .json()
      .catch(() => ({ error: "Service returned an unreadable response." }));
    const current = await supabase().auth.getSession();
    if (current.data.session?.user.id !== data.session.user.id)
      throw new Error(
        "Account changed. Sign in again before loading private results.",
      );
    if (!response.ok)
      throw new Error(result.error ?? `Request failed (${response.status}).`);
    return result as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error(
        "The request timed out. Retry the same batch to recover its saved result.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function download(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(reports: Report[]) {
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return [
    [
      "invoice_id",
      "hash",
      "status",
      "reason",
      "ledger",
      "delivered",
      "difference",
      "receipt",
    ],
    ...reports.map((r) => [
      r.invoice_id,
      r.transaction_hash,
      r.status,
      r.reason_code,
      r.ledger_index,
      r.delivered_amount?.value,
      r.amount_difference,
      r.evidence_digest,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
