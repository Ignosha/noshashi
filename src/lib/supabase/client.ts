import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase connection.
 *
 * The publishable key is designed to ship in clients — it grants nothing
 * on its own. Every table is behind row level security, so a row is only
 * ever reachable by the account that owns it, and the service-role key
 * (which would bypass that) exists only inside Edge Functions.
 *
 * Both values fall back to the production project rather than requiring
 * environment variables, because the release workflow supplies neither and a
 * packaged build must work without them. See .env.example to override locally.
 *
 * The origin below is repeated in the Content Security Policy of both
 * src-tauri configs, over https and over wss. That policy is compiled into the
 * installer while the dev server relaxes it, so a change here alone would pass
 * every local check and then block every request in the shipped application.
 * client-csp.test.ts fails when the three drift apart.
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
