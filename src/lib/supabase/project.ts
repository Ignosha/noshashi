/**
 * The Supabase project, as plain constants, so code that only calls an
 * Edge Function over fetch (the website's NOSHX build, the sanctions
 * lookup) does not pull in the whole client. See client.ts for why both
 * values fall back to production, and client-csp.test.ts for the three
 * places the origin must agree.
 */

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://xiurbiwuwcfowqnpmwki.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_5Kk09a9QEwX1iALqmX-w8g_2fLY7tHO";

/** Edge Functions live under the project origin. */
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
