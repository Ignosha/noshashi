import { supabase } from "@/lib/supabase/client";
import { writeSetting } from "@/lib/store";
import { checkForUpdate } from "@/lib/updates";
import { EVIDENCE_CHECKED_KEY, GUIDE_DISMISSED_KEY, MODE_CHOSEN_KEY } from "@/lib/onboarding";
import { recentErrors } from "./errorLog";
import { repairReportText, runSelfRepair, type RepairContext } from "./selfRepair";
import {
  RepairError,
  eventFromRow,
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
 * whether each proposed repair runs. Every call goes through a database
 * function that checks the caller owns the ticket; see
 * supabase/migrations/20261021120000_noshrepair.sql.
 */

const db = () => supabase().schema("noshashi");

async function call<T extends Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message || "NOSHASHI support did not answer. Check your connection and try again.");
  const result = (data ?? {}) as { ok?: boolean; code?: string } & T;
  if (!result.ok) throw new RepairError(result.code ?? "UNKNOWN");
  return result;
}

/** Let support view this account, read-only, for 1 to 72 hours. */
export async function allowSupportAccess(ticketId: string, hours: number): Promise<string> {
  const result = await call<{ expires_at: string }>("grant_support_access", { p_ticket: ticketId, p_hours: hours });
  return result.expires_at;
}

/** End support's access to this account now. */
export async function revokeSupportAccess(ticketId: string): Promise<void> {
  await call("revoke_support_access", { p_ticket: ticketId });
}

export async function activeGrant(ticketId: string): Promise<AccessGrant | null> {
  const { data } = await db()
    .from("support_access_grants")
    .select("id, granted_at, expires_at, revoked_at")
    .eq("ticket_id", ticketId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { id: string; granted_at: string; expires_at: string; revoked_at: string | null } | undefined;
  return row ? { id: row.id, grantedAt: row.granted_at, expiresAt: row.expires_at, revokedAt: row.revoked_at } : null;
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
    .select("id, ticket_id, action, note, status, result, requested_at, decided_at")
    .eq("ticket_id", ticketId)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(requestFromRow);
}

/** Repairs waiting on this person, across all their tickets. */
export async function pendingRepairs(): Promise<RepairRequest[]> {
  const { data } = await db()
    .from("support_repair_actions")
    .select("id, ticket_id, action, note, status, result, requested_at, decided_at")
    .eq("status", "pending")
    .order("requested_at", { ascending: false });
  return (data ?? []).map(requestFromRow);
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

export async function shareDiagnostics(ticketId: string): Promise<void> {
  await call("attach_support_diagnostics", { p_ticket: ticketId, p_kind: "errors", p_payload: diagnosticsPayload() });
}

export type RepairRuntime = RepairContext & {
  /** Drops and re-opens the ledger link (useXRPL's resync). */
  reconnect?: () => void;
};

/**
 * Run one proposed repair, on this device, after the person pressed Apply.
 * Only the ids in REPAIR_ACTIONS reach here; anything else is refused
 * before it runs. Returns the plain-language result recorded on the ticket.
 */
export async function runRepair(action: RepairActionId, ticketId: string, runtime: RepairRuntime): Promise<string> {
  if (!repairAction(action)) throw new RepairError("MALFORMED");
  switch (action) {
    case "run_self_repair": {
      const report = await runSelfRepair(runtime);
      await call("attach_support_diagnostics", { p_ticket: ticketId, p_kind: "self-repair", p_payload: report as unknown as Record<string, unknown> });
      return `${report.repaired} repaired, ${report.failing} still failing.\n${repairReportText(report)}`;
    }
    case "refresh_plan": {
      if (!runtime.refreshPlan) return "The plan could not be re-read here: not signed in.";
      await runtime.refreshPlan();
      return `Plan re-read: ${runtime.tier ? runtime.tier() : "done"}.`;
    }
    case "reconnect_ledger": {
      if (!runtime.reconnect) return "The ledger link is not available on this screen.";
      runtime.reconnect();
      return "The ledger link was closed and re-opened.";
    }
    case "check_for_update": {
      const found = await checkForUpdate();
      return found.state === "available"
        ? `A newer version is available: ${found.version}.`
        : found.state === "current"
          ? "This is the latest version."
          : `Update check: ${found.reason}`;
    }
    case "send_diagnostics": {
      await shareDiagnostics(ticketId);
      return `Diagnostics shared: ${recentErrors().length} recent error(s).`;
    }
    case "reset_onboarding": {
      await Promise.all([
        writeSetting(GUIDE_DISMISSED_KEY, false),
        writeSetting(MODE_CHOSEN_KEY, false),
        writeSetting(EVIDENCE_CHECKED_KEY, false),
      ]);
      return "The getting-started guide will show on the Overview screen.";
    }
  }
}

/** Apply or decline a proposed repair, and record the outcome. */
export async function answerRepair(
  request: RepairRequest,
  decision: "apply" | "decline",
  runtime: RepairRuntime
): Promise<string> {
  if (decision === "decline") {
    await call("respond_support_repair", { p_action: request.id, p_status: "declined", p_result: null });
    return "Declined.";
  }
  try {
    const result = await runRepair(request.action, request.ticketId, runtime);
    await call("respond_support_repair", { p_action: request.id, p_status: "applied", p_result: result.slice(0, 4000) });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The repair did not complete.";
    await call("respond_support_repair", { p_action: request.id, p_status: "failed", p_result: message.slice(0, 4000) }).catch(() => undefined);
    throw error;
  }
}
