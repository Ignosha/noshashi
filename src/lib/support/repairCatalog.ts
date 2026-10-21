/**
 * The only repairs NOSHREPAIR can propose, shared by the NOSHASHI app (which
 * runs them) and NOSHREPAIR (which proposes them).
 *
 * This list is the security boundary for remote help. Support cannot send
 * code, commands, file paths or settings: only one of these ids, which the
 * database checks against the same list
 * (supabase/migrations/20261021120000_noshrepair.sql), and which the
 * customer's app maps to a fixed function it already contains. Each one is
 * shown to the customer in the words below and runs only when they press
 * Apply. None of them can move funds, read keys, or change anything outside
 * NOSHASHI's own settings. repairCatalog.test.ts keeps this list and the SQL
 * list identical.
 */

export const REPAIR_ACTIONS = [
  {
    id: "run_self_repair",
    title: "Run the full self-check",
    customer: "Your app re-checks its connection, clock, sign-in, saved data, knowledge base and updates, and fixes what it can by itself. The report is added to this ticket.",
    staff: "Runs every self-repair probe on their machine and attaches the report.",
  },
  {
    id: "refresh_plan",
    title: "Re-read your plan",
    customer: "Your app asks NOSHASHI for your current plan again, in case it is showing an old one.",
    staff: "Re-reads entitlements from the server. Use when a paid feature still shows as locked.",
  },
  {
    id: "reconnect_ledger",
    title: "Reconnect to the XRP Ledger",
    customer: "Your app closes its connection to the public XRPL servers and opens a fresh one.",
    staff: "Drops and re-opens the ledger link. Use for stuck RECONNECTING or stale data.",
  },
  {
    id: "check_for_update",
    title: "Check for a newer version",
    customer: "Your app checks whether a newer NOSHASHI release exists. Nothing installs unless you choose to.",
    staff: "Checks the signed update feed and reports the version found.",
  },
  {
    id: "send_diagnostics",
    title: "Share recent diagnostics",
    customer: "Your app adds its version, platform and recent error messages to this ticket. Secrets, keys and email addresses are removed first.",
    staff: "Attaches the scrubbed error log and environment.",
  },
  {
    id: "reset_onboarding",
    title: "Show the getting-started guide again",
    customer: "Your app brings back the getting-started steps on the Overview screen. Your data is not touched.",
    staff: "Resets onboarding flags only.",
  },
] as const;

export type RepairActionId = (typeof REPAIR_ACTIONS)[number]["id"];
export type RepairStatus = "pending" | "applied" | "declined" | "failed" | "expired";

export const REPAIR_IDS: readonly RepairActionId[] = REPAIR_ACTIONS.map((a) => a.id);

export function repairAction(id: string) {
  return REPAIR_ACTIONS.find((a) => a.id === id);
}

export type RepairRequest = {
  id: string;
  ticketId: string;
  action: RepairActionId;
  note: string | null;
  status: RepairStatus;
  result: string | null;
  requestedAt: string;
  decidedAt: string | null;
};

export type AccessGrant = { id: string; grantedAt: string; expiresAt: string; revokedAt: string | null };

export type AccessEvent = {
  id: number;
  event:
    | "access_requested"
    | "access_granted"
    | "access_revoked"
    | "account_viewed"
    | "repair_proposed"
    | "repair_applied"
    | "repair_declined"
    | "repair_failed"
    | "diagnostics_attached";
  actorRole: "customer" | "staff";
  detail: string | null;
  at: string;
};

/** Plain words for each access-log event, for the customer and for staff. */
export const ACCESS_EVENT_LABEL: Record<AccessEvent["event"], string> = {
  access_requested: "Support asked to view the account",
  access_granted: "Access allowed",
  access_revoked: "Access revoked",
  account_viewed: "Support viewed the account",
  repair_proposed: "Support proposed a repair",
  repair_applied: "Repair applied",
  repair_declined: "Repair declined",
  repair_failed: "Repair failed",
  diagnostics_attached: "Diagnostics shared",
};

export const REPAIR_REFUSALS: Record<string, string> = {
  NOT_AUTHENTICATED: "Sign in first.",
  NOT_FOUND: "That ticket or request was not found, or it is not yours.",
  NO_ACCESS: "The customer has not allowed access to this account, or it has expired.",
  INSUFFICIENT_PERMISSIONS: "This needs a NOSHASHI support account signed in with two-factor authentication.",
  MALFORMED: "That request was not in the expected form. Nothing changed.",
  RATE_LIMITED: "Too many requests on this ticket. Wait for the customer to answer the ones already sent.",
  ALREADY_DECIDED: "That repair was already answered.",
  EXPIRED: "That repair request is more than 7 days old and has expired.",
};

export class RepairError extends Error {
  constructor(public code: string) {
    super(REPAIR_REFUSALS[code] ?? `Nothing changed (${code}).`);
  }
}

export const requestFromRow = (r: {
  id: string;
  ticket_id: string;
  action: RepairActionId;
  note: string | null;
  status: RepairStatus;
  result: string | null;
  requested_at: string;
  decided_at: string | null;
}): RepairRequest => ({
  id: r.id,
  ticketId: r.ticket_id,
  action: r.action,
  note: r.note,
  status: r.status,
  result: r.result,
  requestedAt: r.requested_at,
  decidedAt: r.decided_at,
});

export const eventFromRow = (r: { id: number; event: AccessEvent["event"]; actor_role: "customer" | "staff"; detail: string | null; at: string }): AccessEvent => ({
  id: r.id,
  event: r.event,
  actorRole: r.actor_role,
  detail: r.detail,
  at: r.at,
});
