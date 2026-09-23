/**
 * Leaked-password check against HaveIBeenPwned's Pwned Passwords range API
 * — the same free, open data Supabase Auth uses for its (paid-plan)
 * "Prevent use of leaked passwords" setting.
 *
 * k-anonymity: only the first five characters of the password's SHA-1 are
 * sent. The service answers with every suffix sharing that prefix, and the
 * comparison happens here. The password, and its full hash, never leave
 * this device. Responses are padded (Add-Padding) so their size says
 * nothing about the prefix either.
 *
 * This runs in the app before sign-up and before a password change. It is
 * not a server-side control: a client that skips it can still set a leaked
 * password. If the service cannot be reached the check reports that it
 * could not run, and the caller decides; nothing is assumed safe.
 */

export const PWNED_RANGE_URL = "https://api.pwnedpasswords.com/range/";

export async function sha1Upper(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** How many times `suffix` appears in a range response ("SUFFIX:COUNT" per line). Padding lines count 0. */
export function countInRange(body: string, suffix: string): number {
  for (const line of body.split(/\r?\n/)) {
    const [s, c] = line.trim().split(":");
    if (s && s.toUpperCase() === suffix) return Number.parseInt(c ?? "0", 10) || 0;
  }
  return 0;
}

export type PwnedResult = { checked: true; count: number } | { checked: false; reason: string };

export async function pwnedCount(password: string, fetcher: typeof fetch = fetch): Promise<PwnedResult> {
  const hash = await sha1Upper(password);
  const prefix = hash.slice(0, 5);
  try {
    const response = await fetcher(`${PWNED_RANGE_URL}${prefix}`, { headers: { "Add-Padding": "true" } });
    if (!response.ok) return { checked: false, reason: `the breach database answered ${response.status}` };
    return { checked: true, count: countInRange(await response.text(), hash.slice(5)) };
  } catch {
    return { checked: false, reason: "the breach database could not be reached" };
  }
}

/** Throws when the password is known to be leaked. */
export async function assertNotPwned(password: string): Promise<PwnedResult> {
  const r = await pwnedCount(password);
  if (r.checked && r.count > 0) {
    throw new Error(
      `This password has appeared ${r.count.toLocaleString("en-US")} time${r.count === 1 ? "" : "s"} in known data breaches. Choose a different one.`
    );
  }
  return r;
}
