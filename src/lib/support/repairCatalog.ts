/**
 * The only repairs NOSHREPAIR can propose, shared by the NOSHASHI app (which
 * runs them) and NOSHREPAIR (which proposes them).
 *
 * This list is the security boundary for remote help. Support cannot send
 * code, commands, file paths or settings: only one of these ids, which the
 * database checks against the same list
 * (supabase/migrations/20261023120000_noshrepair_devices.sql), and which the
 * customer's app maps to a fixed function it already contains. Each one is
 * shown to the customer in the words below. A request can be addressed to
 * one of the customer's computers, and only that computer runs it.
 *
 * Fixes run when the customer presses Apply, or by themselves while the
 * customer's grant says support may apply fixes. The read-only snapshot runs
 * by itself while any grant is active, since looking is what the grant
 * allows. None of them can move funds, read keys, or change anything outside
 * NOSHASHI's own settings and its own window. repairCatalog.test.ts keeps
 * this list and the SQL list identical.
 */

export const REPAIR_ACTIONS = [
  {
    id: "collect_snapshot",
    title: "Look at the app",
    customer: "Your app sends support a read-only picture of itself: version, ledger connection, clock, sign-in state, plan, settings health and recent errors. No keys, addresses or what your settings contain. It runs by itself while you allow support to look.",
    staff: "Reads the live state of their app on that computer. Read-only; runs by itself while their grant is active.",
    readOnly: true,
  },
  {
    id: "run_self_repair",
    title: "Run the full self-check",
    customer: "Your app re-checks its connection, clock, sign-in, saved data, knowledge base and updates, and fixes what it can by itself. The report is added to this ticket.",
    staff: "Runs every self-repair probe on their machine, fixes what it can, and attaches the report.",
    readOnly: false,
  },
  {
    id: "reconnect_ledger",
    title: "Reconnect to the XRP Ledger",
    customer: "Your app closes its connection to the public XRPL servers and opens a fresh one.",
    staff: "Drops and re-opens the ledger link. Use for stuck RECONNECTING or stale data.",
    readOnly: false,
  },
  {
    id: "switch_ledger_server",
    title: "Switch to another ledger server",
    customer: "Your app moves to the next public XRPL server and checks that it answers.",
    staff: "Moves the link to the next public server and confirms a validated ledger read. Use when one server is slow or failing for them.",
    readOnly: false,
  },
  {
    id: "refresh_session",
    title: "Renew your sign-in",
    customer: "Your app renews its sign-in with NOSHASHI. You stay signed in; nothing else changes.",
    staff: "Refreshes their session token. Use for repeated 'not signed in' or expired-session errors.",
    readOnly: false,
  },
  {
    id: "refresh_plan",
    title: "Re-read your plan",
    customer: "Your app asks NOSHASHI for your current plan again, in case it is showing an old one.",
    staff: "Re-reads entitlements from the server. Use when a paid feature still shows as locked.",
    readOnly: false,
  },
  {
    id: "repair_settings",
    title: "Repair damaged settings",
    customer: "Your app removes saved settings that can no longer be read, so those screens go back to their defaults. Settings that are fine are kept.",
    staff: "Deletes only the settings the snapshot reports as damaged (unparseable). Healthy settings are untouched.",
    readOnly: false,
  },
  {
    id: "clear_error_log",
    title: "Clear the error log",
    customer: "Your app clears its list of recent errors, so support can see whether they come back.",
    staff: "Empties their on-device error log. Use after a fix to confirm the error does not recur.",
    readOnly: false,
  },
  {
    id: "check_for_update",
    title: "Check for a newer version",
    customer: "Your app checks whether a newer NOSHASHI release exists. Nothing installs.",
    staff: "Checks the signed update feed and reports the version found.",
    readOnly: false,
  },
  {
    id: "install_update",
    title: "Install the latest version",
    customer: "Your app downloads the newest signed NOSHASHI release, checks its signature, installs it and restarts.",
    staff: "Installs the latest signed release on that computer and restarts the app. Desktop only.",
    readOnly: false,
  },
  {
    id: "send_diagnostics",
    title: "Share recent diagnostics",
    customer: "Your app adds its version, platform and recent error messages to this ticket. Secrets, keys and email addresses are removed first.",
    staff: "Attaches the scrubbed error log and environment.",
    readOnly: false,
  },
  {
    id: "reset_onboarding",
    title: "Show the getting-started guide again",
    customer: "Your app brings back the getting-started steps on the Overview screen. Your data is not touched.",
    staff: "Resets onboarding flags only.",
    readOnly: false,
  },
  {
    id: "reload_app",
    title: "Restart the app's window",
    customer: "Your app reloads its window, the same as closing and reopening it. Nothing is lost.",
    staff: "Reloads the app's window after the result is recorded. Use to clear a stuck screen.",
    readOnly: false,
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
  /** The one computer it is for; null means any of the customer's computers. */
  deviceId: string | null;
  /** True when the customer's app ran it by itself, as the grant allowed. */
  automatic: boolean;
};

export type AccessGrant = {
  id: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  /** The customer allowed fixes to run without asking each time. */
  autoRepair: boolean;
  deviceId: string | null;
  deviceLabel: string | null;
};

export const grantFromRow = (r: {
  id: string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  auto_repair?: boolean | null;
  device_id?: string | null;
  device_label?: string | null;
}): AccessGrant => ({
  id: r.id,
  grantedAt: r.granted_at,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  autoRepair: Boolean(r.auto_repair),
  deviceId: r.device_id ?? null,
  deviceLabel: r.device_label ?? null,
});

/** Whether this computer may run a request by itself, without Apply. */
export function runsByItself(request: Pick<RepairRequest, "action">, grant: Pick<AccessGrant, "autoRepair"> | null): boolean {
  if (!grant) return false;
  return repairAction(request.action)?.readOnly === true || grant.autoRepair;
}

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
  OTHER_DEVICE: "That repair is for another of your computers. Open NOSHASHI on that computer to answer it.",
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
  device_id?: string | null;
  automatic?: boolean | null;
}): RepairRequest => ({
  id: r.id,
  ticketId: r.ticket_id,
  action: r.action,
  note: r.note,
  status: r.status,
  result: r.result,
  requestedAt: r.requested_at,
  decidedAt: r.decided_at,
  deviceId: r.device_id ?? null,
  automatic: Boolean(r.automatic),
});

/** Columns every read of support_repair_actions selects. */
export const REPAIR_COLUMNS = "id, ticket_id, action, note, status, result, requested_at, decided_at, device_id, automatic";
export const GRANT_COLUMNS = "id, granted_at, expires_at, revoked_at, auto_repair, device_id, device_label";

export const eventFromRow = (r: { id: number; event: AccessEvent["event"]; actor_role: "customer" | "staff"; detail: string | null; at: string }): AccessEvent => ({
  id: r.id,
  event: r.event,
  actorRole: r.actor_role,
  detail: r.detail,
  at: r.at,
});
