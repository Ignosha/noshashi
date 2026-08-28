import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase connection.
 *
 * The publishable key is designed to ship in clients — it grants nothing
 * on its own. Every table is behind row level security, so a row is only
 * ever reachable by the account that owns it, and the service-role key
 * (which would bypass that) exists only inside Edge Functions.
 */

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://xiurbiwuwcfowqnpmwki.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_5Kk09a9QEwX1iALqmX-w8g_2fLY7tHO";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The desktop shell has no URL bar to carry an OAuth fragment.
        detectSessionInUrl: false,
        storageKey: "noshashi.auth",
        flowType: "pkce",
      },
      global: {
        headers: { "x-noshashi-client": "console" },
      },
    });
  }
  return client;
}

/** Invoke an Edge Function with the caller's session attached. */
export async function callFunction<T>(
  name: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase().functions.invoke<T>(name, { body });
  if (error) {
    throw new Error(error.message || `Function ${name} failed`);
  }
  if (!data) throw new Error(`Function ${name} returned no data`);
  return data;
}
