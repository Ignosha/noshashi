import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { controlRoom } from "@/lib/desk/controlRoom";
import { LENSES, LENS_FOR_ROLE, LENS_ORDER, lensMetrics } from "@/lib/desk/lenses";
import type { LedgerEntry } from "@/lib/desk/ledger";
import type { WalletSnapshot } from "@/lib/desk/portfolio";

const root = resolve(import.meta.dirname, "../../../..");
const NOW = Date.parse("2026-09-24T12:00:00Z");
const entry = (over: Partial<LedgerEntry>) =>
  ({ id: Math.random().toString(36), subject: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe", domainCode: "SETL", verdict: "go", digest: "A".repeat(64), amountXrp: 1, failedRules: [], checksPassed: 1, checksTotal: 1, latencyMs: 1, at: "2026-09-24T10:00:00Z", offline: false, ...over }) as LedgerEntry;
const snap = (balance: string, ownerCount: number): WalletSnapshot =>
  ({ address: "r" + balance, label: null, account: { balanceXrp: balance, ownerCount } as never, credentials: [], verdict: "go", failing: 0, error: null, loading: false });

function metrics(entries: LedgerEntry[], snapshots: WalletSnapshot[] | null) {
  const room = controlRoom({ now: NOW, portfolio: snapshots ? { snapshots, alerts: [] } : { unavailable: "x" }, entries, drift: [], watchedIssuers: [], cases: [], orgExceptions: null });
  return lensMetrics({ now: NOW, room, entries, snapshots, mainnet: "connected", policy: "active" });
}

describe("role lenses — figures come from the same records as the control room", () => {
  it("policy compliance is the share of recorded verdicts with no policy exception", () => {
    const m = metrics(
      [entry({}), entry({}), entry({}), entry({ verdict: "hold", policyResults: [{ state: "REVIEW", label: "HHI" }] as never })],
      null
    );
    expect(m.complianceRate30d).toBe(75);
    expect(LENSES.executive.items.find((i) => i.id === "compliance")!.figure!(m)).toBe("75% of 4");
  });

  it("no verdicts, no portfolio → unavailable, never 0% or 0 XRP", () => {
    const m = metrics([], null);
    expect(m.complianceRate30d).toBeNull();
    expect(m.exposureXrp).toBeNull();
    expect(m.spendableXrp).toBeNull();
    expect(LENSES.executive.items.find((i) => i.id === "exposure")!.figure!(m)).toBeNull();
  });

  it("liquidity is XRP above each wallet's owner reserve", () => {
    const m = metrics([], [snap("100", 5), snap("1.5", 10)]); // 100 − (1 + 5×0.2) = 98; 1.5 − 3 → 0
    expect(m.exposureXrp).toBe(101.5);
    expect(m.spendableXrp).toBe(98);
  });

  it("worst concentration is the highest HHI recorded in 30 days", () => {
    expect(metrics([entry({ hhi: 3200 }), entry({ hhi: 5100 }), entry({ hhi: 9000, at: "2026-06-01T00:00:00Z" })], null).worstHhi30d).toBe(5100);
  });
});

describe("role lenses — structure", () => {
  it("every role has a default lens and every lens has items", () => {
    for (const role of ["owner", "admin", "compliance", "risk", "analyst", "viewer", "api"] as const) {
      expect(LENS_ORDER).toContain(LENS_FOR_ROLE[role]);
    }
    for (const l of LENS_ORDER) expect(LENSES[l].items.length).toBeGreaterThan(0);
  });

  it("every 'where' names a tab that exists in Ledger & Policy", () => {
    const ws = readFileSync(resolve(root, "src/components/scenes/WorkstationScene.tsx"), "utf8");
    const tabs = new Set([...ws.matchAll(/<TabsTrigger value="([a-z]+)">/g)].map((m) => m[1].toUpperCase()));
    expect(ws).toContain('subject.as === "tab"');
    for (const l of LENS_ORDER) {
      for (const item of LENSES[l].items) {
        if (item.where) {
          expect(item.scene).toBe("workstation");
          expect(tabs.has(item.where), `${l}/${item.id} → ${item.where}`).toBe(true);
        }
      }
    }
  });

  it("the executive lens covers what the prompt lists, and the analyst lens ends at raw data and the AI", () => {
    expect(LENSES.executive.items.map((i) => i.label)).toEqual([
      "TOTAL EXPOSURE", "ACTIVE EXCEPTIONS", "CRITICAL ITEMS", "LIQUIDITY", "POLICY COMPLIANCE", "INVESTIGATION STATUS", "SYSTEM STATUS",
    ]);
    const analyst = LENSES.analyst.items.map((i) => i.id);
    expect(analyst[0]).toBe("raw");
    expect(analyst).toContain("ai");
  });
});
