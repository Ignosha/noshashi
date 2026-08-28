/** Formatting helpers shared across every scene. */

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCompact(value: number): string {
  return compact.format(value);
}

/** XRP drops (integer string) → human XRP with 6dp precision, trimmed. */
export function dropsToXrp(drops: string | number): string {
  const value = Number(drops) / 1_000_000;
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(6).replace(/\.?0+$/, "");
}

/** Ripple epoch (seconds since 2000-01-01) → JS Date. */
export function rippleTimeToDate(rippleSeconds: number): Date {
  return new Date((rippleSeconds + 946_684_800) * 1000);
}

export function formatClock(date: Date = new Date()): string {
  return date.toLocaleTimeString("en-US", { hour12: false });
}

/** "4s ago", "12m ago" — compact relative time for stream rows. */
export function timeAgo(from: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Middle-truncate any long identifier (hash, key, address). */
export function truncateMiddle(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Escape a cell for CSV export (audit trail download). */
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  }
  return lines.join("\n");
}
