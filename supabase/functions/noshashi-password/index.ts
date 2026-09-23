import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * noshashi-password — screens a password against known data breaches on
 * the server, and records it as screened.
 *
 * The password is checked against HaveIBeenPwned's Pwned Passwords range
 * API with k-anonymity: only the first five characters of its SHA-1 leave
 * this function, and responses are padded. If the password appears in a
 * breach it is refused. If the breach database cannot be reached, nothing
 * is recorded: an unchecked password is never treated as clean.
 *
 * A clean password is passed to noshashi.attest_password, which verifies
 * it against the account's stored hash and records a fingerprint of that
 * hash. The Custom Access Token hook (noshashi.password_screen_hook)
 * allows password sign-in only when the fingerprint matches — so a
 * password set any other way cannot be used to sign in until it passes
 * here, and a breached one never can.
 *
 * The answer for a clean password is the same whether or not the account
 * exists and whether or not the password is the account's, so this cannot
 * be used to find accounts or test passwords. The password is never logged.
 * JWT verification is off at the gateway because a person whose sign-in
 * was refused has no session yet; nothing here depends on one.
 */

const RANGE = "https://api.pwnedpasswords.com/range/";

function corsHeaders(request: Request): Record<string, string> {
  const requested = request.headers.get("Access-Control-Request-Headers");
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": requested ?? "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Access-Control-Request-Headers",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

async function sha1Upper(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function countInRange(body: string, suffix: string): number {
  for (const line of body.split(/\r?\n/)) {
    const [s, c] = line.trim().split(":");
    if (s && s.toUpperCase() === suffix) return Number.parseInt(c ?? "0", 10) || 0;
  }
  return 0;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(request, { ok: false, code: "SCREENING_UNAVAILABLE" }, 503);

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || email.length > 320 || !password || password.length > 1024) {
    return json(request, { ok: false, code: "BAD_REQUEST" }, 400);
  }

  const hash = await sha1Upper(password);
  let count: number;
  try {
    const response = await fetch(`${RANGE}${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true", "User-Agent": "noshashi-password-screening" },
    });
    if (!response.ok) return json(request, { ok: false, code: "SCREENING_UNAVAILABLE" }, 503);
    count = countInRange(await response.text(), hash.slice(5));
  } catch {
    return json(request, { ok: false, code: "SCREENING_UNAVAILABLE" }, 503);
  }
  if (count > 0) return json(request, { ok: false, code: "PASSWORD_BREACHED", count }, 422);

  try {
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).schema("noshashi");
    const { error } = await service.rpc("attest_password", { p_email: email, p_password: password });
    if (error) throw error;
  } catch (error) {
    console.error("noshashi-password: attestation failed", error instanceof Error ? error.message : "unknown");
    return json(request, { ok: false, code: "SCREENING_UNAVAILABLE" }, 503);
  }
  return json(request, { ok: true });
});
