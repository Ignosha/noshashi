import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/project";

/**
 * NOSHREPAIR's own connection to NOSHASHI.
 *
 * It carries no special key. It signs in as the employee, with the same
 * publishable key every NOSHASHI client uses, and everything it can do is
 * decided by the database: noshashi.is_repair_staff() (support staff AND a
 * session verified with two-factor) and, for any customer account, a grant
 * the customer made themselves. A stolen copy of this program is worth
 * nothing without an employee's password and authenticator.
 *
 * Hardening on this side:
 *   · The session lives in sessionStorage, so it ends when the app closes.
 *     Nothing about a session or a ticket is written to disk.
 *   · A separate storage key from the NOSHASHI app, so the two never share
 *     a session on one machine.
 *   · No URL session detection: a link cannot sign anyone in.
 */

let client: SupabaseClient | null = null;

export function repairClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: typeof window === "undefined" ? undefined : window.sessionStorage,
        storageKey: "noshrepair.auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
      global: { headers: { "x-noshashi-client": "noshrepair" } },
    });
  }
  return client;
}

export const db = () => repairClient().schema("noshashi");

/** Sign-in attempts allowed before a cool-down, on this machine. */
export const MAX_ATTEMPTS = 5;
export const COOLDOWN_MS = 60_000;

/** Signed-in sessions end after this long without input. */
export const IDLE_LIMIT_MS = 15 * 60_000;
/** The warning appears this long before, with a button to stay signed in (WCAG 2.2.1). */
export const IDLE_WARNING_MS = 2 * 60_000;
