/**
 * The error log NOSHREPAIR reads.
 *
 * Errors the app hits (a render crash caught by an ErrorBoundary, an
 * uncaught exception, a rejected promise) are kept here, on this device
 * only, in a ring of the last 25. Nothing is sent anywhere until the person
 * opens a ticket and chooses to share diagnostics; then the scrubbed list
 * travels with the ticket so support sees what actually failed instead of
 * "it's broken".
 *
 * Scrubbing happens when an error is recorded, not when it is sent, so a
 * secret never reaches storage either. It removes anything that could be a
 * credential (XRPL seeds, hex private keys, bearer tokens and JWTs, API
 * keys) and email addresses. Addresses and transaction hashes stay: they
 * are public, and they are what makes a ledger bug reproducible.
 */

export type LoggedError = {
  at: string;
  message: string;
  where?: string;
  stack?: string;
  version: string;
  platform: string;
};

const KEY = "noshashi.errors";
const LIMIT = 25;

const SCRUBS: Array<[RegExp, string]> = [
  // XRPL family and Ed25519 seeds: base58 starting with "s". Broader than
  // the checksum test in agent/secrets.ts on purpose; an error log loses
  // nothing by over-redacting.
  [/\bs[1-9A-HJ-NP-Za-km-z]{24,34}\b/g, "[seed removed]"],
  // Hex private keys: 33 bytes with the 00 or ED prefix (66 hex). A bare
  // 64-hex string is a transaction hash and is kept.
  [/\b(?:00|ED|ed)[0-9A-Fa-f]{64}\b/g, "[private key removed]"],
  // JWTs and bearer tokens.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[token removed]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [token removed]"],
  // Service and API keys.
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}\b/g, "[key removed]"],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g, "[key removed]"],
  [/\bnsh_[A-Za-z0-9_-]{8,}\b/g, "[key removed]"],
  [/\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[^\s"',}]{6,}/gi, "[credential removed]"],
  // Email addresses.
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email removed]"],
];

export function scrub(text: string, max = 1000): string {
  let out = String(text ?? "");
  for (const [pattern, replacement] of SCRUBS) out = out.replace(pattern, replacement);
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

function environment(): { version: string; platform: string } {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const os = /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Unknown";
  const shell = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? "desktop" : "browser";
  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown";
  return { version, platform: `${os} · ${shell}` };
}

function read(): LoggedError[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LoggedError[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: LoggedError[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-LIMIT)));
  } catch {
    // Storage full or blocked: the log is a convenience, never a reason to fail.
  }
}

/** Record an error. Safe to call from anywhere; it never throws. */
export function recordError(error: unknown, where?: string): void {
  try {
    const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error));
    const entry: LoggedError = {
      at: new Date().toISOString(),
      message: scrub(`${err.name && err.name !== "Error" ? `${err.name}: ` : ""}${err.message || "Unknown error"}`, 300),
      where: where ? scrub(where, 120) : undefined,
      stack: err.stack ? scrub(err.stack.split("\n").slice(0, 8).join("\n"), 1200) : undefined,
      ...environment(),
    };
    const list = read();
    const last = list[list.length - 1];
    // A render loop can throw the same error dozens of times a second.
    if (last && last.message === entry.message && Date.parse(entry.at) - Date.parse(last.at) < 5000) return;
    list.push(entry);
    write(list);
  } catch {
    // Recording an error must never cause one.
  }
}

export function recentErrors(): LoggedError[] {
  return read();
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

let installed = false;

/** Listen for uncaught errors and rejected promises. Call once at start-up. */
export function installErrorLog(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => recordError(event.error ?? event.message, "window"));
  window.addEventListener("unhandledrejection", (event) => recordError(event.reason, "promise"));
}
