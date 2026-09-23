import type { LedgerEntry } from "@/lib/desk/ledger";
import type { DeskAlert, WalletSnapshot } from "@/lib/desk/portfolio";
import type { DriftAlert } from "@/lib/desk/watch";
import { stateOf, type CasePriority, type Investigation } from "@/lib/desk/investigations";
import type { PolicyException } from "@/lib/org/governance";

/**
 * The control room: one summary of everything this workstation (and, when
 * one governs it, the organization) is actually watching.
 *
 * Every figure is computed from a record the app already holds — a live
 * account read, a recorded verdict, a stored drift alert, a case, an
 * exception. A figure whose source is not available is reported as
 * unavailable with the reason, never as zero: "no exposure" and "exposure
 * unknown" must not look the same.
 */

export type Figure<T> = { state: "ok"; value: T; note?: string } | { state: "unavailable"; reason: string };

export type IntelItem = {
  id: string;
  at: string | null;
  severity: "critical" | "warn" | "info";
  source: "issuer-watch" | "portfolio" | "verdict" | "exception";
  title: string;
  body: string;
  subject?: string;
};

export type QueueItem = {
  id: string;
  title: string;
  subject: string;
  priority: CasePriority;
  status: string;
  updatedAt?: string;
  linked: number;
};

export type ControlRoomInput = {
  now: number;
  /** Portfolio: null when the person has no access to it (reason given). */
  portfolio: { snapshots: WalletSnapshot[]; alerts: DeskAlert[] } | { unavailable: string };
  entries: LedgerEntry[];
  drift: DriftAlert[];
  /** Issuers the drift watch holds a baseline for. */
  watchedIssuers: string[];
  cases: Investigation[];
  /** Organization exceptions, when an organization governs this workstation. */
  orgExceptions: PolicyException[] | null;
};

export type ControlRoom = {
  exposure: Figure<{ xrp: number; wallets: number; unreadable: number }>;
  monitored: { wallets: number | null; issuers: number; total: number | null };
  exceptions: { recorded30d: number; noGo30d: number; pendingOrg: number | null };
  critical: number;
  feed: IntelItem[];
  queue: { open: number; high: number; items: QueueItem[] };
};

const DAY = 24 * 60 * 60 * 1000;
const PRIORITY_RANK: Record<CasePriority, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_RANK: Record<IntelItem["severity"], number> = { critical: 0, warn: 1, info: 2 };

/** Whether a recorded verdict carried an institutional-policy exception (REVIEW or FAIL). */
export function hasPolicyException(e: LedgerEntry): boolean {
  return (e.policyResults ?? []).some((r) => r.state === "REVIEW" || r.state === "FAIL");
}

export function controlRoom(input: ControlRoomInput): ControlRoom {
  const { now } = input;
  const since30 = now - 30 * DAY;

  // Exposure: live balances of the portfolio's wallets. An unreadable
  // wallet is counted as unreadable, never as zero.
  let exposure: ControlRoom["exposure"];
  let walletCount: number | null = null;
  if ("unavailable" in input.portfolio) {
    exposure = { state: "unavailable", reason: input.portfolio.unavailable };
  } else {
    const snaps = input.portfolio.snapshots;
    walletCount = snaps.length;
    const settled = snaps.filter((s) => !s.loading);
    if (snaps.length === 0) {
      exposure = { state: "unavailable", reason: "No wallets in the portfolio yet. Add them on the Desk." };
    } else if (settled.length < snaps.length) {
      exposure = { state: "unavailable", reason: `Reading ${snaps.length - settled.length} of ${snaps.length} wallets from mainnet…` };
    } else {
      const readable = settled.filter((s) => !s.error && s.account);
      const xrp = readable.reduce((sum, s) => sum + Number(s.account!.balanceXrp), 0);
      const unreadable = settled.length - readable.length;
      exposure = {
        state: "ok",
        value: { xrp, wallets: readable.length, unreadable },
        note: unreadable ? `${unreadable} wallet${unreadable === 1 ? "" : "s"} could not be read and ${unreadable === 1 ? "is" : "are"} not included.` : undefined,
      };
    }
  }

  const issuers = new Set(input.watchedIssuers).size;
  const monitored = { wallets: walletCount, issuers, total: walletCount === null ? null : walletCount + issuers };

  const recent = input.entries.filter((e) => Date.parse(e.at) >= since30);
  const exceptions = {
    recorded30d: recent.filter(hasPolicyException).length,
    noGo30d: recent.filter((e) => e.verdict === "no-go").length,
    pendingOrg: input.orgExceptions ? input.orgExceptions.filter((x) => x.status === "pending").length : null,
  };

  // Live intelligence: only things that happened, each with its source.
  const feed: IntelItem[] = [];
  for (const d of input.drift) {
    if (d.acknowledged) continue;
    feed.push({ id: `drift-${d.id}`, at: d.at, severity: d.severity, source: "issuer-watch", title: d.headline, body: d.detail, subject: d.issuer });
  }
  if (!("unavailable" in input.portfolio)) {
    for (const a of input.portfolio.alerts) {
      feed.push({ id: `desk-${a.id}`, at: null, severity: a.severity, source: "portfolio", title: a.title, body: a.body, subject: a.address });
    }
  }
  for (const e of recent.slice(0, 200)) {
    if (e.verdict === "no-go" || hasPolicyException(e)) {
      const rules = (e.policyResults ?? []).filter((r) => r.state === "REVIEW" || r.state === "FAIL").map((r) => r.label);
      feed.push({
        id: `verdict-${e.id}`,
        at: e.at,
        severity: e.verdict === "no-go" ? "critical" : "warn",
        source: "verdict",
        title: e.verdict === "no-go" ? "Settlement refused (NO-GO)" : "Policy exception on a verdict",
        body: `${e.amountXrp.toLocaleString("en-US")} XRP · ${e.domainCode}${rules.length ? ` · ${rules.join(", ")}` : ""}${e.policy ? ` · ${e.policy.name} v${e.policy.version}` : ""}`,
        subject: e.subject,
      });
    }
  }
  for (const x of input.orgExceptions ?? []) {
    if (x.status !== "pending") continue;
    feed.push({
      id: `exc-${x.id}`,
      at: x.requestedAt,
      severity: "warn",
      source: "exception",
      title: "Exception awaiting a decision",
      body: x.reason,
      subject: x.subject,
    });
  }
  feed.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (b.at ?? "").localeCompare(a.at ?? ""));

  const openCases = input.cases
    .map((c) => ({ c, s: stateOf(c) }))
    .filter(({ s }) => s.status !== "closed")
    .map(({ c, s }): QueueItem => ({ id: c.id, title: c.title, subject: c.subject, priority: s.priority, status: s.status, updatedAt: s.updatedAt, linked: s.linked.length }))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  return {
    exposure,
    monitored,
    exceptions,
    critical: feed.filter((f) => f.severity === "critical").length,
    feed,
    queue: { open: openCases.length, high: openCases.filter((c) => c.priority === "high").length, items: openCases },
  };
}
