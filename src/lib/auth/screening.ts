import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/client";

/**
 * Server-side leaked-password screening (supabase/functions/noshashi-password).
 *
 * The server checks the password against HaveIBeenPwned (k-anonymity: only
 * a 5-character SHA-1 prefix leaves the server) and, if it is clean and
 * belongs to the account, records it as screened. Password sign-in is
 * refused by the Custom Access Token hook until the account's current
 * password has been screened, so this is enforced by the server, not by
 * this app: a client that skips it simply cannot sign in with a password.
 */

export type ScreenResult =
  | { ok: true }
  | { ok: false; code: "PASSWORD_BREACHED"; count: number }
  | { ok: false; code: "SCREENING_UNAVAILABLE" | "BAD_REQUEST" };

/** Read the function's answer. Anything unexpected is "unavailable", never "clean". */
export async function readScreenResponse(response: Response | null): Promise<ScreenResult> {
  if (!response) return { ok: false, code: "SCREENING_UNAVAILABLE" };
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok && body?.ok === true) return { ok: true };
  if (body?.code === "PASSWORD_BREACHED") return { ok: false, code: "PASSWORD_BREACHED", count: Number(body.count) || 1 };
  if (body?.code === "BAD_REQUEST") return { ok: false, code: "BAD_REQUEST" };
  return { ok: false, code: "SCREENING_UNAVAILABLE" };
}

export async function screenPassword(email: string, password: string): Promise<ScreenResult> {
  let response: Response | null = null;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/noshashi-password`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    response = null;
  }
  return readScreenResponse(response);
}

export function breachedMessage(count: number): string {
  return `This password has appeared ${count.toLocaleString("en-US")} time${count === 1 ? "" : "s"} in known data breaches. Choose a different one.`;
}

export const UNAVAILABLE_MESSAGE =
  "Your password could not be checked against known data breaches right now, so it was not used. Try again in a moment.";

/** Whether a sign-in error is the server's refusal of an unscreened password. */
export const isUnscreenedRefusal = (message: string) => message.includes("PASSWORD_NOT_SCREENED");
