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
  // Spreadsheet applications interpret these leading characters as formulas.
  // Prefixing a single quote keeps exported evidence textual when opened in
  // Excel or similar tools, without changing the displayed cell value.
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safeText)
    ? `"${safeText.replace(/"/g, '""')}"`
    : safeText;
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

/**
 * Turn a 160-bit currency code into the ticker a person recognises.
 *
 * XRPL carries any currency longer than three characters as 40 hex
 * characters, zero-padded. RLUSD is
 * 524C555344000000000000000000000000000000 on the wire, and printing
 * that to a reader is printing nothing — it was doing exactly that on
 * the public certificate page until a live read showed it.
 *
 * Anything that is not the fixed 40-character form is returned
 * unchanged, including the ordinary three-character codes, which are
 * already tickers. So is a decode that produces non-printable bytes:
 * some 160-bit codes are not text at all, and a mojibake rendering
 * would be worse than the hex, which at least can be looked up.
 *
 * DISPLAY ONLY. The raw code is what the ledger uses to identify an
 * issuance and what an authority certificate's digest is computed
 * over, so decoding before hashing would mean a certificate could not
 * be re-verified from the code the ledger actually holds.
 */
export function decodeCurrency(code: string): string {
  if (!/^[0-9A-F]{40}$/i.test(code)) return code;
  const decoded = (code.match(/../g) ?? [])
    .map((byte) => String.fromCharCode(parseInt(byte, 16)))
    .join("")
    .replace(/\0+$/, "")
    .trim();
  return decoded && /^[\x20-\x7E]+$/.test(decoded) ? decoded : code;
}

/**
 * Words that stay in capitals when a console-style label is set in
 * sentence case. The Ledger Desk sets prose labels the way a research
 * report does ("Trust lines unreadable"), but an acronym is a name.
 */
const KEEP_CAPS = new Set([
  "AI", "AML", "AMM", "API", "CSV", "DEX", "DID", "ETF", "FATF", "HUD", "ID", "IOU",
  "KYC", "LP", "MPT", "NFT", "NOSHASHI", "NOSHX", "OFAC", "PDF", "RLUSD",
  "RPC", "SHA-256", "UI", "URL", "USD", "XLS", "XRP", "XRPL",
]);

/** Names that keep a capital first letter wherever they fall in a label. */
const PROPER = new Map([
  ["PRO", "Pro"],
  ["INSTITUTIONAL", "Institutional"],
  ["ENTERPRISE", "Enterprise"],
  ["STRATEGIC", "Strategic"],
  ["MAINNET", "Mainnet"],
  ["TESTNET", "Testnet"],
]);

/**
 * Turn an all-capitals console label into sentence case, keeping acronyms.
 * Mixed-case input is returned unchanged: it was already written for a reader.
 */
export function sentenceCase(label: string): string {
  if (label !== label.toUpperCase()) return label;
  let first = true;
  return label.replace(/[A-Za-z][A-Za-z0-9-]*/g, (word) => {
    const upper = word.toUpperCase();
    const out = KEEP_CAPS.has(upper)
      ? upper
      : PROPER.has(upper)
        ? PROPER.get(upper)!
        : first
        ? upper.charAt(0) + upper.slice(1).toLowerCase()
        : upper.toLowerCase();
    first = false;
    return out;
  }).replace(/\bXRP ledger\b/g, "XRP Ledger");
}
