import { supabase } from "@/lib/supabase/client";
import { supabaseErrorMessage } from "@/lib/supabase/errors";
import type { DepositConfig, EventType, Screening } from "./deposit";
import type { ExportFormat, SchemaField } from "../../../supabase/functions/_shared/exportSchema.ts";

/**
 * Ledger Watch (supabase/migrations/20260927200000_xrpl_event_feeds.sql).
 *
 * The organization's watched accounts, the events the server watcher
 * (noshashi-xrpl-watch) records for them every minute, and the export
 * schemas and retention that shape and keep that record. Reads go through
 * row-level security (members see their organization's); every change goes
 * through a database function that checks role and plan and writes the
 * audit log.
 */

export type WatchPurpose = "monitor" | "deposit";

export type Watch = {
  id: string;
  address: string;
  label: string | null;
  purpose: WatchPurpose;
  eventTypes: EventType[];
  depositConfig: Partial<DepositConfig>;
  active: boolean;
  lastLedger: number | null;
  lastPolledAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export type LedgerEvent = {
  id: number;
  watchId: string | null;
  address: string;
  type: EventType;
  txHash: string;
  ledgerIndex: number;
  ledgerTime: string | null;
  txType: string;
  txResult: string;
  counterparty: string | null;
  data: Record<string, unknown>;
  screening: (Screening & { chain?: Array<{ account: string; fundedBy: string | null; activatedLedger: number | null }> }) | null;
  verdict: Screening["verdict"] | null;
  createdAt: string;
};

export type ExportSchema = {
  id: string;
  name: string;
  dataset: "events" | "audit";
  format: ExportFormat;
  fields: SchemaField[];
  updatedAt: string;
};

const db = () => supabase().schema("noshashi");

const REFUSALS: Record<string, string> = {
  NOT_AUTHENTICATED: "Sign in again to continue.",
  INSUFFICIENT_PERMISSIONS: "Your role cannot change this. Owners, admins, compliance and risk manage watches; owners, admins and compliance manage schemas.",
  FEATURE_NOT_IN_PLAN: "Your organization's plan does not include this. Deposit screening is Enterprise; event feeds and custom schemas are Strategic.",
  INVALID_ADDRESS: "That is not a classic XRPL address.",
  INVALID_PURPOSE: "Choose monitor or deposit.",
  INVALID_EVENTS: "Choose at least one event type.",
  INVALID_CONFIG: "The deposit configuration is not valid.",
  WATCH_LIMIT: "An organization can watch at most 100 accounts.",
  ALREADY_WATCHED: "This organization already watches that account.",
  NOT_FOUND: "No such record in an organization you belong to.",
  INVALID_TERM: "Keep event history for between 7 and 3,650 days.",
  INVALID_SCHEMA: "Each field needs a path such as data.delivered.value and a column name.",
  NAME_TAKEN: "A schema with that name already exists.",
  SCHEMA_LIMIT: "An organization can keep at most 50 schemas.",
};

async function call(fn: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(`${supabaseErrorMessage(error)} Nothing was changed.`);
  const r = data as { ok?: boolean; code?: string } | null;
  if (r?.ok !== true) throw new Error(REFUSALS[String(r?.code)] ?? `Not done (${String(r?.code)}).`);
  return r as Record<string, unknown>;
}

export async function listWatches(org: string): Promise<Watch[]> {
  const { data, error } = await db()
    .from("xrpl_watches")
    .select("id, address, label, purpose, event_types, deposit_config, active, last_ledger, last_polled_at, last_error, created_at")
    .eq("organization_id", org)
    .order("created_at", { ascending: true });
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map((r) => ({
    id: String(r.id),
    address: String(r.address),
    label: (r.label as string | null) ?? null,
    purpose: r.purpose as WatchPurpose,
    eventTypes: (r.event_types as EventType[]) ?? [],
    depositConfig: (r.deposit_config as Partial<DepositConfig>) ?? {},
    active: Boolean(r.active),
    lastLedger: r.last_ledger === null ? null : Number(r.last_ledger),
    lastPolledAt: (r.last_polled_at as string | null) ?? null,
    lastError: (r.last_error as string | null) ?? null,
    createdAt: String(r.created_at),
  }));
}

export const addWatch = (org: string, address: string, label: string, purpose: WatchPurpose) =>
  call("add_xrpl_watch", { p_org: org, p_address: address.trim(), p_label: label, p_purpose: purpose, p_event_types: null });

export const updateWatch = (
  id: string,
  patch: { label?: string; eventTypes?: EventType[]; active?: boolean; depositConfig?: DepositConfig }
) =>
  call("update_xrpl_watch", {
    p_watch: id,
    p_label: patch.label ?? null,
    p_event_types: patch.eventTypes ?? null,
    p_active: patch.active ?? null,
    p_deposit_config: patch.depositConfig ?? null,
  });

export const removeWatch = (id: string) => call("remove_xrpl_watch", { p_watch: id });

export type EventFilter = { verdict?: Screening["verdict"]; type?: EventType; address?: string; beforeId?: number };

function toEvent(r: Record<string, unknown>): LedgerEvent {
  return {
    id: Number(r.id),
    watchId: (r.watch_id as string | null) ?? null,
    address: String(r.address),
    type: r.event_type as EventType,
    txHash: String(r.tx_hash),
    ledgerIndex: Number(r.ledger_index),
    ledgerTime: (r.ledger_time as string | null) ?? null,
    txType: String(r.tx_type),
    txResult: String(r.tx_result),
    counterparty: (r.counterparty as string | null) ?? null,
    data: (r.data as Record<string, unknown>) ?? {},
    screening: (r.screening as LedgerEvent["screening"]) ?? null,
    verdict: (r.verdict as LedgerEvent["verdict"]) ?? null,
    createdAt: String(r.created_at),
  };
}

const EVENT_COLUMNS = "id, watch_id, address, event_type, tx_hash, ledger_index, ledger_time, tx_type, tx_result, counterparty, data, screening, verdict, created_at";

/** The newest events first, `limit` at a time. */
export async function listEvents(org: string, filter: EventFilter = {}, limit = 100): Promise<LedgerEvent[]> {
  let q = db().from("xrpl_events").select(EVENT_COLUMNS).eq("organization_id", org).order("id", { ascending: false }).limit(limit);
  if (filter.verdict) q = q.eq("verdict", filter.verdict);
  if (filter.type) q = q.eq("event_type", filter.type);
  if (filter.address) q = q.eq("address", filter.address);
  if (filter.beforeId) q = q.lt("id", filter.beforeId);
  const { data, error } = await q;
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map((r) => toEvent(r as Record<string, unknown>));
}

/** Every record of a dataset, oldest first, up to `max`: the rows a bulk export writes, in the API's shape. */
export async function readDataset(org: string, dataset: "events" | "audit", max = 50_000): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let after = 0;
  while (out.length < max) {
    const page = Math.min(1000, max - out.length);
    const q =
      dataset === "events"
        ? db().from("xrpl_events").select(EVENT_COLUMNS).eq("organization_id", org).gt("id", after).order("id", { ascending: true }).limit(page)
        : db().from("audit_log").select("id, occurred_at, action, entity_type, entity_id, actor_account_id, previous_state, new_state, request_id").eq("organization_id", org).gt("id", after).order("id", { ascending: true }).limit(page);
    const { data, error } = await q;
    if (error) throw new Error(supabaseErrorMessage(error));
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    // The feed API names the event type `type`; the export offers the same paths.
    out.push(...(dataset === "events" ? rows.map((r) => ({ ...r, type: r.event_type })) : rows));
    if (rows.length < page) break;
    after = Number(rows[rows.length - 1].id);
  }
  return out;
}

export async function listSchemas(org: string): Promise<ExportSchema[]> {
  const { data, error } = await db()
    .from("org_export_schemas")
    .select("id, name, dataset, format, fields, updated_at")
    .eq("organization_id", org)
    .order("name");
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    dataset: r.dataset as ExportSchema["dataset"],
    format: r.format as ExportFormat,
    fields: (r.fields as SchemaField[]) ?? [],
    updatedAt: String(r.updated_at),
  }));
}

export const saveSchema = (org: string, schema: { id?: string; name: string; dataset: "events" | "audit"; format: ExportFormat; fields: SchemaField[] }) =>
  call("save_export_schema", { p_org: org, p_id: schema.id ?? null, p_name: schema.name, p_dataset: schema.dataset, p_format: schema.format, p_fields: schema.fields });

export const deleteSchema = (id: string) => call("delete_export_schema", { p_id: id });

export async function readRetention(org: string): Promise<number | null> {
  const { data, error } = await db().from("organizations").select("event_retention_days").eq("id", org).maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  return data ? Number(data.event_retention_days) : null;
}

export const setRetention = (org: string, days: number) => call("set_event_retention", { p_org: org, p_days: days });

/** The feed API's address, for the snippets the console shows. */
export const FEED_ENDPOINT = "https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1/noshashi-xrpl-watch";

// ── Embeds: the organization's screening widget ─────────────────────

export type EmbedWidget = "verify" | "check" | "deposit";

export type Embed = {
  id: string;
  label: string;
  widgets: EmbedWidget[];
  allowedOrigins: string[];
  depositAddress: string | null;
  theme: "auto" | "light" | "dark";
  active: boolean;
  createdAt: string;
};

const EMBED_REFUSALS: Record<string, string> = {
  FEATURE_NOT_IN_PLAN: "The screening widget is part of the Enterprise and Strategic plans.",
  INSUFFICIENT_PERMISSIONS: "Owners, admins and compliance manage widgets.",
  INVALID_LABEL: "Give the widget a name of 1 to 80 characters.",
  INVALID_WIDGETS: "Choose at least one check.",
  INVALID_ORIGIN: "Each allowed site must be an exact origin such as https://www.example.com (http only for localhost), up to 20.",
  DEPOSIT_ADDRESS_NOT_WATCHED: "Address verification and deposit status need one of this organization's watched deposit addresses.",
  INVALID_THEME: "Choose auto, light or dark.",
  EMBED_LIMIT: "An organization can have at most 20 widgets.",
  NOT_FOUND: "No such widget in an organization you belong to.",
};

async function embedCall(fn: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(`${supabaseErrorMessage(error)} Nothing was changed.`);
  const r = data as { ok?: boolean; code?: string } | null;
  if (r?.ok !== true) throw new Error(EMBED_REFUSALS[String(r?.code)] ?? REFUSALS[String(r?.code)] ?? `Not done (${String(r?.code)}).`);
  return r as Record<string, unknown>;
}

export async function listEmbeds(org: string): Promise<Embed[]> {
  const { data, error } = await db()
    .from("org_embeds")
    .select("id, label, widgets, allowed_origins, deposit_address, theme, active, created_at")
    .eq("organization_id", org)
    .order("created_at", { ascending: true });
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map((r) => ({
    id: String(r.id),
    label: String(r.label),
    widgets: (r.widgets as EmbedWidget[]) ?? [],
    allowedOrigins: (r.allowed_origins as string[]) ?? [],
    depositAddress: (r.deposit_address as string | null) ?? null,
    theme: (r.theme as Embed["theme"]) ?? "auto",
    active: Boolean(r.active),
    createdAt: String(r.created_at),
  }));
}

export const saveEmbed = (
  org: string,
  embed: { id?: string; label: string; widgets: EmbedWidget[]; allowedOrigins: string[]; depositAddress: string | null; theme: Embed["theme"]; active: boolean }
) =>
  embedCall("save_org_embed", {
    p_org: org,
    p_id: embed.id ?? null,
    p_label: embed.label,
    p_widgets: embed.widgets,
    p_origins: embed.allowedOrigins,
    p_deposit_address: embed.depositAddress,
    p_theme: embed.theme,
    p_active: embed.active,
  });

export const deleteEmbed = (id: string) => embedCall("delete_org_embed", { p_id: id });

/** What an organization pastes into its own page. */
export const embedSnippet = (id: string) =>
  `<div data-noshashi-embed="${id}"></div>\n<script src="https://www.noshashi.app/embed/v1.js" async></script>`;

/** The sanctions list as the server last read it. */
export async function readSanctionsStatus(): Promise<{ listed: number; asOf: string | null }> {
  const [{ count, error }, { data: last }] = await Promise.all([
    db().from("sanctioned_addresses").select("address", { count: "exact", head: true }).is("removed_at", null),
    db().from("sanctions_refreshes").select("finished_at").eq("status", "ok").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) throw new Error(supabaseErrorMessage(error));
  return { listed: count ?? 0, asOf: (last?.finished_at as string | null) ?? null };
}
