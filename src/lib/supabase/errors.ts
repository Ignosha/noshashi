/**
 * Turning transport failures into sentences.
 *
 * supabase-js reports an unreachable backend as whatever the platform's fetch
 * threw, and that string reaches the user unaltered. Chromium says "Failed to
 * fetch"; WebKit says "Load failed". Both are accurate and neither is usable —
 * they name a browser primitive rather than anything the reader can act on, and
 * they read as a defect in the application rather than a connection that is not
 * there.
 *
 * This matters more in the desktop shell than it would on the web. There is no
 * address bar and no reload button, so this sentence is the entire diagnosis
 * the user is given.
 *
 * The two wordings are not interchangeable trivia. Tauri renders in WKWebView
 * on macOS and WebView2 on Windows, so the same fault produces "Load failed" in
 * one shipped build and "Failed to fetch" in another. Matching only one of them
 * would fix the bug on one platform and leave it standing on the other.
 *
 * This lives beside the client rather than under auth because every Supabase
 * call has the same failure mode. Signing in is simply where it is noticed
 * first.
 *
 * Errors the server actually returned are deliberately passed through
 * untouched. "Invalid login credentials" is precisely what the user needs to
 * read, and flattening every failure into one friendly message would hide it.
 */

/**
 * Lowercased fragments that mean "the request never reached a server".
 *
 * ERR_NAME_NOT_RESOLVED earns its place from experience: a paused Supabase
 * project has its DNS record withdrawn, so the failure is name resolution
 * rather than a refused connection.
 */
const TRANSPORT_FAILURES = [
  "failed to fetch",
  "load failed",
  "network request failed",
  "networkerror",
  "err_internet_disconnected",
  "err_name_not_resolved",
  "err_connection_refused",
  "err_connection_timed_out",
];

export const UNREACHABLE_MESSAGE =
  "Cannot reach the NOSHASHI service. Check your connection and try again.";

export const UNKNOWN_MESSAGE = "Something went wrong. Please try again.";

/** True when the failure is transport, not a rejection by the server. */
export function isTransportFailure(error: unknown): boolean {
  const needle = messageOf(error).toLowerCase();
  if (needle === "") return false;
  return TRANSPORT_FAILURES.some((fragment) => needle.includes(fragment));
}

/** The sentence to show the user for a failed Supabase call. */
export function supabaseErrorMessage(error: unknown): string {
  if (isTransportFailure(error)) return UNREACHABLE_MESSAGE;
  const raw = messageOf(error).trim();
  return raw === "" ? UNKNOWN_MESSAGE : raw;
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}
