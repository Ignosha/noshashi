import { useCallback, useEffect, useState } from "react";
import { readSetting, writeSetting } from "@/lib/store";
import type { PolicyReceipt } from "@/lib/policy";
import type { Status } from "@/lib/xrpl/types";

/**
 * The local adjudication ledger.
 *
 * Every verdict the workstation produces is written to disk and survives
 * a restart. This is the difference between a tool that answers a
 * question and one that can prove, months later, what it answered and
 * when — which is the only form an examiner accepts.
 *
 * It is deliberately local. Nothing here is transmitted, so an
 * institution's settlement history never becomes someone else's dataset.
 */

export type LedgerEntry = {
  id: string;
  subject: string;
  label?: string;
  domainCode: string;
  verdict: Status;
  digest: string;
  amountXrp: number;
  /** Rules that failed, by id — enough to reconstruct the reasoning. */
  failedRules: string[];
  checksPassed: number;
  checksTotal: number;
  hhi?: number;
  latencyMs: number;
  /** ISO timestamp. */
  at: string;
  /** True when adjudicated against cached state rather than a live read. */
  offline: boolean;
};

const KEY = "engine.ledger";
const MAX_ENTRIES = 10_000;

export function receiptToEntry(
  receipt: PolicyReceipt,
  extra: { domainCode: string; label?: string; hhi?: number; offline?: boolean }
): LedgerEntry {
  return {
    id: `${receipt.digest.slice(0, 16)}-${Date.parse(receipt.evaluatedAt)}`,
    subject: receipt.subject,
    label: extra.label,
    domainCode: extra.domainCode,
    verdict: receipt.verdict,
    digest: receipt.digest,
    amountXrp: receipt.amountXrp,
    failedRules: receipt.checks.filter((c) => !c.passed).map((c) => c.id),
    checksPassed: receipt.checks.filter((c) => c.passed).length,
    checksTotal: receipt.checks.length,
    hhi: extra.hhi,
    latencyMs: receipt.latencyMs,
    at: receipt.evaluatedAt,
    offline: Boolean(extra.offline),
  };
}

export function useLedger() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readSetting<LedgerEntry[]>(KEY, []).then((stored) => {
      if (cancelled) return;
      setEntries(Array.isArray(stored) ? stored : []);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const append = useCallback(async (entry: LedgerEntry) => {
    // Read-modify-write against storage rather than state, so two windows
    // adjudicating at once cannot clobber each other's history.
    const current = await readSetting<LedgerEntry[]>(KEY, []);
    const list = Array.isArray(current) ? current : [];
    // The digest is deterministic; the same check twice is one record.
    const deduped = [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES);
    await writeSetting(KEY, deduped);
    setEntries(deduped);
  }, []);

  const clear = useCallback(async () => {
    await writeSetting(KEY, []);
    setEntries([]);
  }, []);

  const reload = useCallback(async () => {
    const stored = await readSetting<LedgerEntry[]>(KEY, []);
    setEntries(Array.isArray(stored) ? stored : []);
  }, []);

  return { entries, loaded, append, clear, reload };
}

/** Distinct wallets ever adjudicated, with their most recent verdict. */
export type WalletSummary = {
  subject: string;
  label?: string;
  lastVerdict: Status;
  lastAt: string;
  scans: number;
  worstHhi?: number;
};

export function summariseWallets(entries: LedgerEntry[]): WalletSummary[] {
  const map = new Map<string, WalletSummary>();
  for (const entry of entries) {
    const existing = map.get(entry.subject);
    if (!existing) {
      map.set(entry.subject, {
        subject: entry.subject,
        label: entry.label,
        lastVerdict: entry.verdict,
        lastAt: entry.at,
        scans: 1,
        worstHhi: entry.hhi,
      });
      continue;
    }
    existing.scans += 1;
    if (entry.at > existing.lastAt) {
      existing.lastAt = entry.at;
      existing.lastVerdict = entry.verdict;
      existing.label = entry.label ?? existing.label;
    }
    if (entry.hhi !== undefined) {
      existing.worstHhi = Math.max(existing.worstHhi ?? 0, entry.hhi);
    }
  }
  return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/**
 * Sign an export: SHA-256 over the exact bytes written to the file.
 *
 * This is chain-of-custody, not authentication — it proves the file in
 * an examiner's hands is the file that left the workstation, unaltered.
 */
export async function signContent(content: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function ledgerToCsv(entries: LedgerEntry[]): string {
  const headers = [
    "timestamp", "subject", "label", "domain", "verdict", "digest",
    "amount_xrp", "checks_passed", "checks_total", "failed_rules",
    "hhi", "latency_ms", "source",
  ];
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = entries.map((e) =>
    [
      e.at, e.subject, e.label ?? "", e.domainCode, e.verdict, e.digest,
      e.amountXrp, e.checksPassed, e.checksTotal, e.failedRules.join(" "),
      e.hhi ?? "", e.latencyMs, e.offline ? "cached" : "live",
    ].map(escape).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}
