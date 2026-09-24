import { supabase } from "@/lib/supabase/client";
import { supabaseErrorMessage } from "@/lib/supabase/errors";

/**
 * Organization webhooks (supabase/migrations/20260924010000_org_webhooks.sql).
 *
 * Events are emitted by the database from records it already keeps, signed
 * with HMAC-SHA256 and sent by pg_net. Owners and admins manage them here;
 * the signing secret is returned once, at creation, and is never readable
 * again. Everything shown is the server's record.
 */

export const WEBHOOK_EVENTS = [
  { id: "policy_exception", label: "Policy exception requested" },
  { id: "exception_decided", label: "Exception approved or rejected" },
  { id: "exception_evidence_requested", label: "More evidence requested on an exception" },
  { id: "exception_evidence_added", label: "Evidence added to an exception" },
  { id: "policy_activated", label: "Policy version activated" },
  { id: "investigation_created", label: "Investigation opened" },
  { id: "investigation_resolved", label: "Investigation closed" },
  { id: "receipt_created", label: "API verification receipt recorded" },
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["id"];

export type Webhook = {
  id: string;
  url: string;
  description: string | null;
  events: WebhookEvent[];
  active: boolean;
  createdBy: string;
  createdAt: string;
};

export type Delivery = {
  id: string;
  webhookId: string;
  event: string;
  status: "queued" | "sent" | "delivered" | "failed";
  attempt: number;
  responseStatus: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

/** Mirrors noshashi.webhook_url_allowed so the form can explain a refusal before sending. */
export function webhookUrlProblem(url: string): string | null {
  const m = /^https:\/\/([A-Za-z0-9.-]+)(:[0-9]{2,5})?(\/\S*)?$/.exec(url.trim());
  if (!m) return "Use an https:// address.";
  const host = m[1].toLowerCase();
  if (url.length > 2048) return "The address is too long.";
  if (/^[0-9.]+$/.test(host)) return "Use a DNS name, not an IP address.";
  if (!host.includes(".")) return "Use a fully qualified domain name.";
  if (/(^localhost$|\.localhost$|\.local$|\.internal$|\.arpa$|supabase\.(co|in|net|com)$)/.test(host)) {
    return "Local, internal and Supabase addresses are not allowed.";
  }
  return null;
}

const db = () => supabase().schema("noshashi");

const REFUSALS: Record<string, string> = {
  NOT_AUTHENTICATED: "Sign in again to continue.",
  INSUFFICIENT_PERMISSIONS: "Only owners and admins manage webhooks.",
  NOT_FOUND: "No such webhook in an organization you administer.",
  URL_NOT_ALLOWED: "That address is not allowed. Use https:// and a public DNS name.",
  INVALID_EVENTS: "Choose at least one event.",
};

async function call<T extends Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(`${supabaseErrorMessage(error)} Nothing was changed.`);
  const r = data as { ok?: boolean; code?: string } | null;
  if (r?.ok !== true) throw new Error(REFUSALS[String(r?.code)] ?? `Not done (${String(r?.code)}).`);
  return r as unknown as T;
}

export async function listWebhooks(organizationId: string): Promise<Webhook[]> {
  const { data, error } = await db()
    .from("org_webhooks")
    .select("id, url, description, events, active, created_by, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map((r) => ({
    id: r.id, url: r.url, description: r.description, events: r.events, active: r.active, createdBy: r.created_by, createdAt: r.created_at,
  }));
}

export async function listDeliveries(organizationId: string, limit = 50): Promise<Delivery[]> {
  const { data, error } = await db()
    .from("webhook_deliveries")
    .select("id, webhook_id, event, status, attempt, response_status, error, created_at, completed_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map((r) => ({
    id: r.id, webhookId: r.webhook_id, event: r.event, status: r.status, attempt: r.attempt,
    responseStatus: r.response_status, error: r.error, createdAt: r.created_at, completedAt: r.completed_at,
  }));
}

/** Returns the signing secret — the only time it is ever available. */
export const createWebhook = (organizationId: string, url: string, events: WebhookEvent[], description: string) =>
  call<{ id: string; secret: string }>("create_org_webhook", { p_org: organizationId, p_url: url.trim(), p_events: events, p_description: description });

export const setWebhookActive = (id: string, active: boolean) => call("set_org_webhook_active", { p_webhook: id, p_active: active });

export const sendTestWebhook = (id: string) => call("send_test_webhook", { p_webhook: id });
