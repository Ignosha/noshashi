import { supabase } from "@/lib/supabase/client";
import { isTauri } from "@/lib/env";
import { rpc } from "@/lib/xrpl/client";
import { xrplLink } from "@/lib/xrpl/link";
import { autodetect } from "@/lib/agent/client";
import { checkForUpdate } from "@/lib/updates";
import { searchKnowledge } from "@/lib/noshx/knowledge";
import { BRAND } from "@/lib/brand";

/**
 * Self-repair: what NOSHX runs when someone says the app is broken.
 *
 * Every check is a real probe of something that actually fails in the
 * field, and where the app can put it right itself it does, then probes
 * again to confirm. Nothing is assumed healthy because it was healthy a
 * minute ago, and nothing is reported fixed unless the second probe says
 * so. What cannot be repaired from inside the app (a firewall, a wrong
 * system clock, an expired plan) is named with the step that fixes it.
 *
 * It needs no account and no network round trip to NOSHASHI for the
 * local checks; the account checks run when someone is signed in.
 */

export type RepairState = "pass" | "repaired" | "warn" | "fail";

export type RepairCheck = {
  id: string;
  label: string;
  state: RepairState;
  detail: string;
  /** What the person can do when the app could not fix it itself. */
  action?: string;
};

export type RepairContext = {
  /** Re-reads the plan from the server (useBilling().refresh). */
  refreshPlan?: () => Promise<void>;
  /** The plan tier as the app currently holds it, after any refresh. */
  tier?: () => string;
  /** The organization to check watched accounts for, when the person is in one. */
  organizationId?: string | null;
};

export type RepairReport = {
  at: string;
  version: string;
  platform: string;
  checks: RepairCheck[];
  repaired: number;
  failing: number;
};

const RIPPLE_EPOCH = 946684800;

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - start) };
}

async function readValidated(): Promise<{ index: number; closeSeconds: number }> {
  const result = (await rpc("ledger", { ledger_index: "validated" })) as Record<string, any>;
  const ledger = result.ledger ?? {};
  return { index: Number(ledger.ledger_index ?? result.ledger_index), closeSeconds: Number(ledger.close_time) + RIPPLE_EPOCH };
}

async function checkLedger(checks: RepairCheck[]): Promise<{ closeSeconds: number } | null> {
  let reconnected = false;
  if (!xrplLink.isConnected()) reconnected = await xrplLink.reconnect();
  try {
    const { value, ms } = await timed(readValidated);
    checks.push({
      id: "ledger",
      label: "Mainnet link",
      state: reconnected ? "repaired" : ms > 2500 ? "warn" : "pass",
      detail: `${reconnected ? "Was disconnected; reconnected to another public server. " : ""}Validated ledger ${value.index.toLocaleString("en-US")} read in ${ms} ms.${ms > 2500 ? " Slower than usual: the public server is loaded or the network is slow." : ""}`,
    });
    return value;
  } catch {
    // Connected but silent: drop it and try the next server.
    const ok = await xrplLink.reconnect();
    try {
      const { value, ms } = await timed(readValidated);
      checks.push({
        id: "ledger",
        label: "Mainnet link",
        state: "repaired",
        detail: `The connection was open but not answering. Switched to another public server (${ok ? "connected" : "connecting"}); ledger ${value.index.toLocaleString("en-US")} read in ${ms} ms.`,
      });
      return value;
    } catch (error) {
      checks.push({
        id: "ledger",
        label: "Mainnet link",
        state: "fail",
        detail: `No public XRPL server answered (${error instanceof Error ? error.message : "no reply"}), after trying the next one.`,
        action: "A firewall, VPN or proxy is most likely blocking secure WebSockets (wss:// on port 443) to xrplcluster.com and s1/s2.ripple.com. Allow them, or try another network.",
      });
      return null;
    }
  }
}

function checkClock(checks: RepairCheck[], ledger: { closeSeconds: number } | null) {
  if (!ledger || !Number.isFinite(ledger.closeSeconds)) return;
  // A validated ledger closed a few seconds ago; its close time is rounded to 10 s.
  const skew = Math.round(Date.now() / 1000 - ledger.closeSeconds);
  const off = Math.abs(skew) > 120;
  checks.push({
    id: "clock",
    label: "System clock",
    state: off ? "fail" : "pass",
    detail: off
      ? `This computer's clock is ${Math.abs(skew).toLocaleString("en-US")} seconds ${skew > 0 ? "ahead of" : "behind"} the ledger. Sign-in tokens are time-limited, so a wrong clock signs you out and makes the server refuse requests.`
      : `Within ${Math.abs(skew)} s of the ledger's close time.`,
    action: off ? "Turn on automatic date and time in the operating system's settings, then sign in again." : undefined,
  });
}

async function checkAccount(checks: RepairCheck[], context: RepairContext) {
  const client = supabase();
  const { data } = await client.auth.getSession();
  const session = data.session;
  if (!session) {
    checks.push({ id: "session", label: "Sign-in", state: "pass", detail: "Not signed in. The free checks work without an account; tickets and paid features need one." });
    return false;
  }
  const expiresIn = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000);
  let refreshed = false;
  if (expiresIn < 120) {
    const { error } = await client.auth.refreshSession();
    refreshed = !error;
    if (error) {
      checks.push({
        id: "session",
        label: "Sign-in",
        state: "fail",
        detail: `The sign-in expired and could not be renewed (${error.message}).`,
        action: "Sign out and sign in again.",
      });
      return false;
    }
  }
  checks.push({
    id: "session",
    label: "Sign-in",
    state: refreshed ? "repaired" : "pass",
    detail: refreshed ? "The sign-in had expired; it was renewed." : `Signed in as ${session.user.email ?? "your account"}.`,
  });

  try {
    const { ms } = await timed(async () => {
      const { error } = await client.schema("noshashi").rpc("is_support_staff");
      if (error) throw error;
    });
    checks.push({ id: "server", label: "NOSHASHI server", state: ms > 3000 ? "warn" : "pass", detail: `Answered in ${ms} ms.` });
  } catch (error) {
    checks.push({
      id: "server",
      label: "NOSHASHI server",
      state: "fail",
      detail: `Did not answer: ${error instanceof Error ? error.message : "no reply"}.`,
      action: "Check the connection. If other sites load, the service may be briefly down; the ledger checks keep working without it.",
    });
    return true;
  }

  if (context.refreshPlan) {
    const before = context.tier?.();
    await context.refreshPlan().catch(() => undefined);
    // The app re-renders with the new plan just after the refresh resolves.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const after = context.tier?.();
    checks.push({
      id: "plan",
      label: "Plan",
      state: before && after && before !== after ? "repaired" : "pass",
      detail: before && after && before !== after
        ? `The app was showing ${before}; the server says ${after}. The app now uses ${after}.`
        : `Re-read from the server: ${after ?? "unknown"}.`,
    });
  }

  if (context.organizationId) {
    const { data: watches, error } = await client
      .schema("noshashi")
      .from("xrpl_watches")
      .select("address, label, active, last_error, last_polled_at")
      .eq("organization_id", context.organizationId);
    if (!error && watches && watches.length) {
      const failing = watches.filter((w) => w.active && w.last_error);
      const stale = watches.filter((w) => w.active && w.last_polled_at && Date.now() - Date.parse(String(w.last_polled_at)) > 15 * 60_000);
      checks.push({
        id: "watches",
        label: "Watched accounts",
        state: failing.length || stale.length ? "warn" : "pass",
        detail: failing.length
          ? `${failing.length} of ${watches.length} could not be read on the last pass: ${failing.map((w) => `${w.label ?? w.address} (${w.last_error})`).join("; ")}. The server retries every minute.`
          : stale.length
            ? `${stale.length} of ${watches.length} have not been read for over 15 minutes.`
            : `All ${watches.length} read in the last minutes.`,
        action: stale.length ? "Open a ticket from this conversation: the server-side watcher needs a look." : undefined,
      });
    }
  }
  return true;
}

function checkStorage(checks: RepairCheck[]) {
  let ok = true;
  try {
    window.localStorage.setItem("noshashi:probe", "1");
    ok = window.localStorage.getItem("noshashi:probe") === "1";
    window.localStorage.removeItem("noshashi:probe");
  } catch {
    ok = false;
  }
  // Settings that no longer parse make a screen fall back to defaults every time.
  let cleared = 0;
  if (ok) {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith("noshashi:")) continue;
      const raw = window.localStorage.getItem(key);
      if (raw && /^[[{"]/.test(raw)) {
        try {
          JSON.parse(raw);
        } catch {
          window.localStorage.removeItem(key);
          cleared += 1;
        }
      }
    }
  }
  checks.push({
    id: "storage",
    label: "Saved settings",
    state: !ok ? "warn" : cleared ? "repaired" : "pass",
    detail: !ok
      ? "Settings cannot be saved here (private browsing, or storage is blocked), so they reset on every visit."
      : cleared
        ? `${cleared} damaged setting${cleared === 1 ? " was" : "s were"} removed; ${cleared === 1 ? "it goes" : "they go"} back to the default.`
        : isTauri
          ? "Readable and writable in the application data directory."
          : "Readable and writable in this browser.",
    action: !ok ? "Use a normal (not private) window, or the desktop app." : undefined,
  });
}

async function checkKnowledge(checks: RepairCheck[]) {
  try {
    const hits = await searchKnowledge("noshashi plans", 1);
    checks.push({
      id: "knowledge",
      label: "NOSHX knowledge",
      state: hits.length ? "pass" : "fail",
      detail: hits.length ? "The built-in help index loads and answers." : "The built-in help index is empty.",
      action: hits.length ? undefined : "Reinstall the app from noshashi.app; the help index ships inside it.",
    });
  } catch (error) {
    checks.push({ id: "knowledge", label: "NOSHX knowledge", state: "fail", detail: `The help index did not load (${error instanceof Error ? error.message : "error"}).`, action: "Reload the app." });
  }
}

async function checkUpdate(checks: RepairCheck[]) {
  if (!isTauri) return;
  const update = await checkForUpdate().catch(() => null);
  if (!update) return;
  if (update.state === "available") {
    checks.push({
      id: "update",
      label: "App version",
      state: "warn",
      detail: `You are on ${BRAND.version}; ${update.version} is available. Many reported problems are already fixed in a newer version.`,
      action: "Install it from Settings › Updates (the download is signature-checked before it installs).",
    });
  } else if (update.state === "current") {
    checks.push({ id: "update", label: "App version", state: "pass", detail: `${BRAND.version} is the latest release.` });
  }
}

async function checkRuntime(checks: RepairCheck[]) {
  const runtime = await autodetect().catch(() => null);
  checks.push({
    id: "runtime",
    label: "AI runtime",
    state: "pass",
    detail: runtime
      ? `A local model runtime answers at ${runtime.baseUrl}.`
      : "No local model runtime. NOSHX Core needs none: it answers from the ledger and NOSHASHI's pages by itself.",
  });
}

/** Run every check, repairing what the app can, and report what is left. */
export async function runSelfRepair(context: RepairContext = {}): Promise<RepairReport> {
  const checks: RepairCheck[] = [];
  const ledger = await checkLedger(checks);
  checkClock(checks, ledger);
  await checkAccount(checks, context).catch((error) => {
    checks.push({ id: "session", label: "Sign-in", state: "fail", detail: error instanceof Error ? error.message : "The account could not be read." });
  });
  if (typeof window !== "undefined") checkStorage(checks);
  await checkKnowledge(checks);
  await checkUpdate(checks);
  await checkRuntime(checks);
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return {
    at: new Date().toISOString(),
    version: BRAND.version,
    platform: `${/Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Unknown"} · ${isTauri ? "desktop" : "browser"}`,
    checks,
    repaired: checks.filter((c) => c.state === "repaired").length,
    failing: checks.filter((c) => c.state === "fail").length,
  };
}

const MARK: Record<RepairState, string> = { pass: "✓", repaired: "↻", warn: "!", fail: "✕" };

/** The report as plain text: for NOSHX's answer and for a ticket. */
export function repairReportText(report: RepairReport): string {
  const head =
    report.failing === 0 && report.repaired === 0
      ? "Everything NOSHX can check is working."
      : `${report.repaired ? `NOSHX repaired ${report.repaired} thing${report.repaired === 1 ? "" : "s"}. ` : ""}${report.failing ? `${report.failing} still need${report.failing === 1 ? "s" : ""} attention.` : "Nothing is failing now."}`;
  const lines = report.checks.map((c) => `${MARK[c.state]} ${c.label}: ${c.detail}${c.action ? ` What to do: ${c.action}` : ""}`);
  return [head, ...lines, `(NOSHASHI ${report.version}, ${report.platform}, ${report.at.slice(0, 16).replace("T", " ")} UTC)`].join("\n");
}
