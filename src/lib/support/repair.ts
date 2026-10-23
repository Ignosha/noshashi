import { supabase } from "@/lib/supabase/client";
import { writeSetting } from "@/lib/store";
import { checkForUpdate, installPendingUpdate } from "@/lib/updates";
import { isTauri } from "@/lib/env";
import { rpc } from "@/lib/xrpl/client";
import { xrplLink } from "@/lib/xrpl/link";
import { EVIDENCE_CHECKED_KEY, GUIDE_DISMISSED_KEY, MODE_CHOSEN_KEY } from "@/lib/onboarding";
import { clearErrors, recentErrors } from "./errorLog";
import { deviceId, deviceLabel } from "./device";
import { repairReportText, runSelfRepair, type RepairContext } from "./selfRepair";
import { collectSnapshot, damagedSettings, snapshotFindings } from "./snapshot";
import {
  GRANT_COLUMNS,
  REPAIR_COLUMNS,
  RepairError,
  eventFromRow,
  grantFromRow,
  repairAction,
  requestFromRow,
  type AccessEvent,
  type AccessGrant,
  type RepairActionId,
  type RepairRequest,
} from "./repairCatalog";

/**
 * The customer's side of NOSHREPAIR, in the NOSHASHI app.
 *
 * The customer decides everything here: whether support may view the
 * account (and for how long), whether diagnostics go with a ticket, and
 * whether fixes wait for Apply or may run while the grant lasts. Every call
 * goes through a database function that checks the caller owns the ticket,
 * and names this computer, so a repair meant for one computer is never run
 * on another; see supabase/migrations/20261023120000_noshrepair_devices.sql.
 */

const db = () => supabase().schema("noshashi");

async function call<T extends Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message || "NOSHASHI support did not answer. Check your connection and try again.");
  const result = (data ?? {}) as { ok?: boolean; code?: string } & T;
  if (!result.ok) throw new RepairError(result.code ?? "UNKNOWN");
  return result;
}

/**
 * Let support view this account, read-only, for 1 to 72 hours, and
 * optionally apply fixes from the fixed list without asking each time.
 */
export async function allowSupportAccess(ticketId: string, hours: number, autoRepair = false): Promise<string> {
  const result = await call<{ expires_at: string }>("grant_support_access", {
    p_ticket: ticketId,
    p_hours: hours,
    p_auto_repair: autoRepair,
    p_device: await deviceId(),
    p_device_label: deviceLabel(),
  });
  return result.expires_at;
}

/** End support's access to this account now. */
export async function revokeSupportAccess(ticketId: string): Promise<void> {
  await call("revoke_support_access", { p_ticket: ticketId });
}

export async function activeGrant(ticketId: string): Promise<AccessGrant | null> {
  return (await activeGrants())[ticketId] ?? null;
}

/** Live grants on this account's tickets, by ticket. */
export async function activeGrants(): Promise<Record<string, AccessGrant>> {
  const { data, error } = await db()
    .from("support_access_grants")
    .select(`ticket_id, ${GRANT_COLUMNS}`)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true });
  if (error) throw new Error(error.message);
  const out: Record<string, AccessGrant> = {};
  for (const row of (data ?? []) as Array<Parameters<typeof grantFromRow>[0] & { ticket_id: string }>) out[row.ticket_id] = grantFromRow(row);
  return out;
}

export type AccessRequest = { ticketId: string; ticketRef: string; subject: string; reason: string | null; at: string; logId: number };

/**
 * Support's requests to look at this account that the customer has not
 * answered yet: an access request on a ticket with no grant made after it.
 */
export async function openAccessRequests(): Promise<AccessRequest[]> {
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data, error } = await db()
    .from("support_access_log")
    .select("id, ticket_id, event, detail, at")
    .in("event", ["access_requested", "access_granted"])
    .gt("at", since)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  const latest = new Map<string, { id: number; event: string; detail: string | null; at: string }>();
  for (const row of (data ?? []) as Array<{ id: number; ticket_id: string; event: string; detail: string | null; at: string }>) latest.set(row.ticket_id, row);
  const open = [...latest.entries()].filter(([, row]) => row.event === "access_requested");
  if (!open.length) return [];
  const { data: tickets } = await db()
    .from("support_tickets")
    .select("id, number, subject, status")
    .in("id", open.map(([id]) => id));
  const byId = new Map(((tickets ?? []) as Array<{ id: string; number: number; subject: string; status: string }>).map((t) => [t.id, t]));
  return open
    .filter(([id]) => byId.has(id) && byId.get(id)!.status !== "resolved")
    .map(([id, row]) => ({ ticketId: id, ticketRef: `NSH-${byId.get(id)!.number}`, subject: byId.get(id)!.subject, reason: row.detail, at: row.at, logId: row.id }));
}

export async function accessLog(ticketId: string): Promise<AccessEvent[]> {
  const { data, error } = await db()
    .from("support_access_log")
    .select("id, event, actor_role, detail, at")
    .eq("ticket_id", ticketId)
    .order("id", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map(eventFromRow);
}

export async function repairRequests(ticketId: string): Promise<RepairRequest[]> {
  const { data, error } = await db()
    .from("support_repair_actions")
    .select(REPAIR_COLUMNS)
    .eq("ticket_id", ticketId)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(requestFromRow);
}

/** Repairs waiting on this computer, across all of this person's tickets. */
export async function pendingRepairs(): Promise<RepairRequest[]> {
  const mine = await deviceId();
  const { data } = await db()
    .from("support_repair_actions")
    .select(REPAIR_COLUMNS)
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  return forThisDevice((data ?? []).map(requestFromRow), mine);
}

/** Requests for any of the person's computers, or for this one. */
export function forThisDevice(requests: RepairRequest[], mine: string): RepairRequest[] {
  return requests.filter((r) => r.deviceId === null || r.deviceId === mine);
}

/** Environment and the scrubbed error log, as one diagnostics payload. */
export function diagnosticsPayload() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return {
    version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown",
    platform: /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Unknown",
    language: typeof navigator === "undefined" ? "" : navigator.language,
    errors: recentErrors(),
  };
}

async function attach(ticketId: string, kind: string, payload: Record<string, unknown>): Promise<void> {
  await call("attach_support_diagnostics", { p_ticket: ticketId, p_kind: kind, p_payload: payload, p_device: await deviceId() });
}

export async function shareDiagnostics(ticketId: string): Promise<void> {
  await attach(ticketId, "errors", { ...diagnosticsPayload(), device: deviceLabel() });
}

export type RepairRuntime = RepairContext & {
  /** Drops and re-opens the ledger link (useXRPL's resync). */
  reconnect?: () => void;
  /** Re-renders the parts of the app that hold the session, after a refresh. */
  onSessionRefreshed?: () => void;
};

/** Set by a fix that needs the window reloaded once its result is recorded. */
type Outcome = { text: string; after?: () => void | Promise<void> };

/**
 * Run one request on this computer: by Apply, or by itself while the grant
 * allows it. Only the ids in REPAIR_ACTIONS reach here; anything else is
 * refused before it runs. Returns the plain-language result recorded on the
 * ticket, and anything that must wait until the result is saved.
 */
async function perform(action: RepairActionId, ticketId: string, runtime: RepairRuntime): Promise<Outcome> {
  if (!repairAction(action)) throw new RepairError("MALFORMED");
  switch (action) {
    case "collect_snapshot": {
      const snapshot = await collectSnapshot({ tier: runtime.tier });
      await attach(ticketId, "snapshot", snapshot as unknown as Record<string, unknown>);
      const findings = snapshotFindings(snapshot);
      return { text: findings.length ? `Snapshot sent. Found: ${findings.join(" ")}` : "Snapshot sent. Nothing wrong found." };
    }
    case "run_self_repair": {
      const report = await runSelfRepair(runtime);
      await attach(ticketId, "self-repair", report as unknown as Record<string, unknown>);
      return { text: `${report.repaired} repaired, ${report.failing} still failing.\n${repairReportText(report)}` };
    }
    case "refresh_plan": {
      if (!runtime.refreshPlan) return { text: "The plan could not be re-read here: not signed in." };
      await runtime.refreshPlan();
      return { text: `Plan re-read: ${runtime.tier ? runtime.tier() : "done"}.` };
    }
    case "reconnect_ledger": {
      if (runtime.reconnect) runtime.reconnect();
      else await xrplLink.reconnect();
      return { text: "The ledger link was closed and re-opened." };
    }
    case "switch_ledger_server": {
      const before = xrplLink.currentEndpoint();
      await xrplLink.reconnect();
      const after = xrplLink.currentEndpoint();
      try {
        const result = (await rpc("ledger", { ledger_index: "validated" })) as Record<string, any>;
        const index = Number(result.ledger?.ledger_index ?? result.ledger_index);
        runtime.reconnect?.();
        return { text: `Moved from ${before} to ${after}; validated ledger ${index.toLocaleString("en-US")} read.` };
      } catch (error) {
        return { text: `Moved from ${before} to ${after}, but it did not answer yet (${error instanceof Error ? error.message : "no reply"}).` };
      }
    }
    case "refresh_session": {
      const { data, error } = await supabase().auth.refreshSession();
      if (error || !data.session) return { text: `The sign-in could not be renewed (${error?.message ?? "no session"}). Sign out and in again.` };
      runtime.onSessionRefreshed?.();
      const minutes = Math.round(((data.session.expires_at ?? 0) - Date.now() / 1000) / 60);
      return { text: `Sign-in renewed; valid for about ${minutes} minutes.` };
    }
    case "repair_settings": {
      const { writable, damaged } = damagedSettings();
      if (!writable) return { text: "Settings cannot be saved on this computer (storage is blocked), so there is nothing to repair here." };
      for (const key of damaged) {
        try {
          window.localStorage.removeItem(`noshashi:${key}`);
        } catch {
          // Already gone.
        }
      }
      return { text: damaged.length ? `Removed ${damaged.length} damaged setting(s): ${damaged.join(", ")}. Those screens use their defaults now.` : "No damaged settings were found." };
    }
    case "clear_error_log": {
      const count = recentErrors().length;
      clearErrors();
      return { text: `Cleared ${count} recent error(s).` };
    }
    case "check_for_update": {
      const found = await checkForUpdate();
      return {
        text:
          found.state === "available"
            ? `A newer version is available: ${found.version}.`
            : found.state === "current"
              ? "This is the latest version."
              : `Update check: ${found.reason}`,
      };
    }
    case "install_update": {
      if (!isTauri) return { text: "Updates install in the desktop app only." };
      const found = await checkForUpdate();
      if (found.state !== "available") {
        return { text: found.state === "current" ? `Already on the latest version (${found.version}).` : `No update installed: ${found.reason}.` };
      }
      return { text: `Installing ${found.version}; the app restarts when it is done.`, after: () => installPendingUpdate() };
    }
    case "send_diagnostics": {
      await shareDiagnostics(ticketId);
      return { text: `Diagnostics shared: ${recentErrors().length} recent error(s).` };
    }
    case "reset_onboarding": {
      await Promise.all([
        writeSetting(GUIDE_DISMISSED_KEY, false),
        writeSetting(MODE_CHOSEN_KEY, false),
        writeSetting(EVIDENCE_CHECKED_KEY, false),
      ]);
      return { text: "The getting-started guide will show on the Overview screen." };
    }
    case "reload_app": {
      return { text: "The app window reloaded.", after: () => window.location.reload() };
    }
  }
}

/** Run one request and return its result, for callers that record it themselves. */
export async function runRepair(action: RepairActionId, ticketId: string, runtime: RepairRuntime): Promise<string> {
  const outcome = await perform(action, ticketId, runtime);
  await outcome.after?.();
  return outcome.text;
}

/**
 * Apply or decline a request, and record the outcome. `automatic` marks one
 * this computer ran by itself because the grant allows it; the database
 * refuses that unless such a grant is live.
 */
export async function answerRepair(
  request: RepairRequest,
  decision: "apply" | "decline",
  runtime: RepairRuntime,
  automatic = false
): Promise<string> {
  const device = await deviceId();
  if (request.deviceId && request.deviceId !== device) throw new RepairError("OTHER_DEVICE");
  const respond = (status: "applied" | "declined" | "failed", result: string | null) =>
    call("respond_support_repair", { p_action: request.id, p_status: status, p_result: result, p_device: device, p_auto: automatic });
  if (decision === "decline") {
    await respond("declined", null);
    return "Declined.";
  }
  let outcome: Outcome;
  try {
    outcome = await perform(request.action, request.ticketId, runtime);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The repair did not complete.";
    await respond("failed", message.slice(0, 4000)).catch(() => undefined);
    throw error;
  }
  await respond("applied", outcome.text.slice(0, 4000));
  // Restarts and reloads happen only after the result is safely recorded.
  await outcome.after?.();
  return outcome.text;
}
