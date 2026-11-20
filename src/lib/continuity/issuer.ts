import { rpc, XrplError } from "../xrpl/client";
import {
  isAddress,
  validatedLedger,
  type LedgerAt,
} from "../compliance/registry";
import { amountUnits } from "./amounts";
import { inputRecord, inputText } from "./portfolio";

export type Closure = { id: string; wallet: string | null; closed: string };
export type IssuerFact = {
  balance: string;
  authorized: boolean;
  frozen: boolean;
  linePresent: boolean;
};
export type IssuerReview = {
  source: string;
  issuer: string;
  currency: string;
  graceDays: number;
  requireFrozen: boolean;
  ledger: LedgerAt | null;
  asOf: string;
  issuerFlags: number | null;
  rows: (Closure & { outcome: string; fact: IssuerFact | null })[];
};

export function issuerCurrencyKey(code: string): string {
  if (/^[A-Fa-f0-9]{40}$/.test(code)) return code.toUpperCase();
  return (
    "0".repeat(24) +
    Array.from(code)
      .map((character) => character.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase() +
    "0".repeat(10)
  );
}

export function parseClosures(value: unknown, asOf: string): Closure[] {
  if (!Array.isArray(value) || !value.length || value.length > 20)
    throw new Error("Supply 1–20 customer closure records.");
  const ids = new Set<string>();
  return value.map((value) => {
    const row = inputRecord(value);
    const id = inputText(row.id);
    if (ids.has(id)) throw new Error("Duplicate closure reference.");
    ids.add(id);
    if (
      row.wallet !== null &&
      (typeof row.wallet !== "string" || !isAddress(row.wallet))
    )
      throw new Error(
        "Use a classic wallet address or null for an unmapped customer.",
      );
    const closed = inputText(row.closed);
    const date = new Date(closed + "T00:00:00Z");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(closed) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== closed ||
      closed > asOf
    )
      throw new Error(
        "Closure date must be a valid date through the snapshot date.",
      );
    return {
      id,
      wallet: row.wallet === null ? null : row.wallet.trim(),
      closed,
    };
  });
}

export function closureOutcome(
  row: Closure,
  fact: IssuerFact | null,
  asOf: string,
  graceDays: number,
  requireFrozen: boolean,
): string {
  if (!fact) return "Wallet evidence needed";
  if (!fact.linePresent) return "No trust line at snapshot";
  const negative = fact.balance.startsWith("-");
  const amount = amountUnits(negative ? fact.balance.slice(1) : fact.balance);
  if (negative && amount) return "Negative balance requires review";
  if (requireFrozen && !fact.frozen) return "Freeze policy review required";
  if (!amount)
    return fact.authorized
      ? "Zero balance; authorization persists"
      : "Zero balance observed";
  const age =
    (Date.parse(asOf + "T00:00:00Z") - Date.parse(row.closed + "T00:00:00Z")) /
    86400000;
  return age >= graceDays
    ? "Balance exceeds redemption window"
    : "Within redemption window";
}

export async function readIssuerClosures(
  issuer: string,
  currency: string,
  values: unknown,
  graceDays: number,
  requireFrozen: boolean,
): Promise<IssuerReview> {
  if (
    !isAddress(issuer) ||
    currency === "XRP" ||
    !/^(?:[A-Za-z0-9?!@#$%^&*<>(){}\[\]|]{3}|[A-Fa-f0-9]{40})$/.test(
      currency,
    ) ||
    /^0{40}$/.test(currency)
  )
    throw new Error(
      "Enter a classic issuer address and a raw 3-character or 40-hex currency code.",
    );
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 365)
    throw new Error("Set a redemption window of 0–365 days.");
  const code = currency.length === 40 ? currency.toUpperCase() : currency;
  const ledger = await validatedLedger();
  const asOf = ledger.closeIso.slice(0, 10);
  const rows = parseClosures(values, asOf);
  if (rows.some((row) => row.wallet === issuer))
    throw new Error("The issuer cannot be used as its own holder mapping.");
  const issuerState = await rpc("account_info", {
    account: issuer,
    ledger_index: ledger.index,
  });
  if (
    issuerState.ledger_index !== ledger.index ||
    issuerState.validated !== true ||
    issuerState.account_data?.Account !== issuer ||
    !Number.isSafeInteger(issuerState.account_data?.Flags)
  )
    throw new Error(
      "Issuer state did not match the requested validated ledger.",
    );
  const facts = new Map<string, IssuerFact | null>();
  for (const wallet of new Set(
    rows.flatMap((row) => (row.wallet ? [row.wallet] : [])),
  )) {
    let marker: unknown;
    let fact: IssuerFact = {
      balance: "0",
      authorized: false,
      frozen: false,
      linePresent: false,
    };
    try {
      for (let page = 0; page < 10; page++) {
        const result = await rpc("account_lines", {
          account: wallet,
          peer: issuer,
          ledger_index: ledger.index,
          limit: 400,
          ...(marker ? { marker } : {}),
        });
        if (
          result.validated !== true ||
          result.ledger_index !== ledger.index ||
          result.account !== wallet ||
          !Array.isArray(result.lines)
        )
          throw new Error(
            "Trust-line evidence did not match the requested validated ledger.",
          );
        for (const raw of result.lines) {
          if (raw.account !== issuer || typeof raw.currency !== "string")
            throw new Error("Unexpected issuer in trust-line response.");
          if (
            !/^(?:[A-Za-z0-9?!@#$%^&*<>(){}\[\]|]{3}|[A-Fa-f0-9]{40})$/.test(
              raw.currency,
            )
          )
            throw new Error(
              "Malformed currency identity in trust-line response.",
            );
          const actualCode =
            raw.currency.length === 40
              ? raw.currency.toUpperCase()
              : raw.currency;
          if (issuerCurrencyKey(actualCode) !== issuerCurrencyKey(code))
            continue;
          if (fact.linePresent)
            throw new Error("Duplicate trust-line evidence.");
          if (typeof raw.balance !== "string")
            throw new Error("Balance evidence is incomplete.");
          for (const field of [
            "peer_authorized",
            "freeze_peer",
            "deep_freeze_peer",
          ]) {
            if (raw[field] !== undefined && typeof raw[field] !== "boolean")
              throw new Error("Trust-line control evidence is malformed.");
          }
          amountUnits(
            raw.balance.startsWith("-") ? raw.balance.slice(1) : raw.balance,
          );
          fact = {
            balance: raw.balance,
            authorized: raw.peer_authorized === true,
            frozen: raw.freeze_peer === true || raw.deep_freeze_peer === true,
            linePresent: true,
          };
        }
        marker = result.marker;
        if (!marker) break;
      }
      if (marker) throw new Error("Trust-line pagination remains incomplete.");
      facts.set(wallet, fact);
    } catch (error) {
      if (error instanceof XrplError && error.code === "actNotFound")
        facts.set(wallet, null);
      else throw error;
    }
  }
  return {
    source:
      "Validated Mainnet state. Customer-to-wallet mappings are supplied by the operator.",
    issuer,
    currency: code,
    graceDays,
    requireFrozen,
    ledger,
    asOf,
    issuerFlags: issuerState.account_data.Flags,
    rows: rows.map((row) => {
      const fact = row.wallet ? (facts.get(row.wallet) ?? null) : null;
      return {
        ...row,
        fact,
        outcome: closureOutcome(row, fact, asOf, graceDays, requireFrozen),
      };
    }),
  };
}

export function sampleIssuerReview(): IssuerReview {
  const asOf = "2026-11-20";
  const rows = [
    {
      id: "Closure-01",
      wallet: "Sample wallet A",
      closed: "2026-10-01",
      fact: {
        balance: "2000",
        authorized: true,
        frozen: false,
        linePresent: true,
      },
    },
    {
      id: "Closure-02",
      wallet: "Sample wallet B",
      closed: "2026-11-08",
      fact: {
        balance: "100",
        authorized: true,
        frozen: false,
        linePresent: true,
      },
    },
    {
      id: "Closure-03",
      wallet: "Sample wallet C",
      closed: "2026-10-01",
      fact: {
        balance: "0",
        authorized: true,
        frozen: false,
        linePresent: true,
      },
    },
    { id: "Closure-04", wallet: null, closed: "2026-10-02", fact: null },
  ];
  return {
    source: "Fictional sample",
    issuer: "Sample issuer",
    currency: "USD",
    graceDays: 30,
    requireFrozen: false,
    ledger: null,
    asOf,
    issuerFlags: null,
    rows: rows.map((row) => ({
      ...row,
      outcome: closureOutcome(row, row.fact, asOf, 30, false),
    })),
  };
}
