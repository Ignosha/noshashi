export declare const SITE: string;
export declare const FUNCTIONS: string;
export declare const ADDRESS_RE: RegExp;

export declare class NoshashiError extends Error {
  status: number;
  code: string;
  body: unknown;
}

export type Verdict = "go" | "hold" | "no-go" | "insufficient-data";

export interface Check {
  id: string;
  label: string;
  severity: "block" | "warn";
  passed: boolean;
  state?: "INSUFFICIENT_DATA" | "NOT_APPLICABLE";
  detail: string;
}

export interface AuthorityCertificate {
  verdict: Verdict;
  issuer: string;
  currency?: string;
  currencyLabel?: string;
  checks: Check[];
  digest: string;
  ledgerIndex: number;
  evaluatedAt: string;
  source: "ledger" | "indexer" | "none";
  rulesVersion: number;
  disclaimer: string;
}

export interface DeliveredRow {
  date_utc: string;
  ledger_index: number;
  tx_hash: string;
  direction: "in" | "out" | "self";
  counterparty: string;
  destination_tag: number | "";
  currency: string;
  currency_code: string;
  issuer: string;
  amount_stated: string;
  amount_delivered: string;
  partial_payment: "yes" | "no";
  delivered_less_than_stated: "yes" | "no";
  fee_xrp: string;
}

export interface DeliveredReport {
  account: string;
  complete: boolean;
  stopped_because: "end_of_history" | "reached_from_date" | "page_cap" | "time_budget";
  summary: { payments: number; partial_payments: number; delivered_less_than_stated: number; delivered_unavailable: number };
  rows: DeliveredRow[];
}

export interface NoshashiOptions {
  apiKey?: string;
  fetch?: typeof fetch;
  site?: string;
  functions?: string;
  timeoutMs?: number;
}

export declare class Noshashi {
  constructor(options?: NoshashiOptions);
  authority(issuer: string, options?: { walk?: boolean }): Promise<AuthorityCertificate>;
  issuerState(issuer: string): Promise<{ issuer: string; read_at: string; result: Record<string, unknown> }>;
  issuerPowers(issuer: string): Promise<{ issuer: string; ledger_index: number | null; powers: Record<string, unknown>; summary: string }>;
  badgeUrl(issuer: string, options?: { style?: "flat" | "card"; theme?: "light" | "dark" }): string;
  checkCertificate(certificate: AuthorityCertificate): Promise<Record<string, unknown>>;
  sanctions(addresses: string | string[]): Promise<Record<string, unknown>>;
  threats(addresses: string | string[]): Promise<Record<string, unknown>>;
  phishing(domain: string): Promise<Record<string, unknown>>;
  verifyDomain(input: { address?: string; domain?: string }): Promise<Record<string, unknown>>;
  screenAddress(address: string, options?: { asIssuer?: boolean }): Promise<{
    address: string;
    sanctions: Record<string, unknown> | null;
    threats: Record<string, unknown> | null;
    authority?: AuthorityCertificate | null;
    errors: Record<string, string>;
  }>;
  delivered(account: string, options?: { from?: string; to?: string; format?: "json" }): Promise<DeliveredReport>;
  delivered(account: string, options: { from?: string; to?: string; format: "csv" }): Promise<{ csv: string; complete: boolean; stoppedBecause: string | null }>;
  verify(input: { subject: string; domain: string; amount_xrp: number }): Promise<{ verdict: Exclude<Verdict, "insufficient-data">; checks: Check[]; digest: string; evaluated_at: string } & Record<string, unknown>>;
  receipt(digest: string): Promise<Record<string, unknown>>;
  screenDeposit(input: { hash: string; deposit_address: string; config?: Record<string, unknown> }): Promise<Record<string, unknown>>;
  screenWithdrawal(input: { destination: string; destination_tag?: number; amount_xrp?: number; previous_destinations?: string[]; own_addresses?: string[] }): Promise<Record<string, unknown>>;
}

export default Noshashi;
