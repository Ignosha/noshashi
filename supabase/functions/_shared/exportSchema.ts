/**
 * Custom export schemas — an organization's own record shapes.
 *
 * A schema is a list of fields, each a dotted path into the record and the
 * column name to write it under: [{ path: "data.delivered.value", as:
 * "amount" }]. The same function shapes a bulk export saved from the
 * console and a feed pulled through the API, so a schema means one thing
 * everywhere. Pure: no imports, no I/O.
 */

export type SchemaField = { path: string; as: string };
export type ExportFormat = "csv" | "ndjson" | "json";

const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+){0,7}$/;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_ .-]{0,62}$/;

/** The fields of a stored schema that are well formed; anything else is dropped rather than half-applied. */
export function sanitizeFields(raw: unknown): SchemaField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is SchemaField => !!f && typeof f === "object" && PATH_RE.test(String((f as SchemaField).path)) && NAME_RE.test(String((f as SchemaField).as)))
    .slice(0, 100)
    .map((f) => ({ path: f.path, as: f.as }));
}

export function valueAt(record: unknown, path: string): unknown {
  let cur: unknown = record;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur === undefined ? null : cur;
}

export function applySchema(records: unknown[], fields: SchemaField[]): Array<Record<string, unknown>> {
  return records.map((r) => Object.fromEntries(fields.map((f) => [f.as, valueAt(r, f.path)])));
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Quoted when needed, and a leading formula character neutralised so a
  // spreadsheet opening the export never evaluates ledger data.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function serialize(rows: Array<Record<string, unknown>>, columns: string[], format: ExportFormat): string {
  if (format === "json") return JSON.stringify(rows, null, 2);
  if (format === "ndjson") return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  return [columns.map(csvCell).join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
}

export const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  ndjson: "application/x-ndjson",
  json: "application/json",
};

/** The paths an events record offers, for the schema editor. */
export const EVENT_PATHS = [
  "id", "address", "type", "tx_hash", "ledger_index", "ledger_time", "tx_type", "tx_result", "counterparty", "verdict",
  "data.delivered.value", "data.delivered.currency", "data.delivered.issuer", "data.amount.value", "data.partial",
  "data.destinationTag", "data.sourceTag", "data.memos", "data.limit.currency", "data.limit.value", "data.set", "data.clear",
  "screening.verdict", "screening.credit.value", "screening.credit.currency", "screening.findings", "watch_id", "created_at",
];

/** The paths an audit record offers. */
export const AUDIT_PATHS = [
  "id", "occurred_at", "action", "entity_type", "entity_id", "actor_account_id", "previous_state", "new_state", "request_id",
];
