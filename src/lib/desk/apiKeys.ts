import { supabase } from "@/lib/supabase/client";
import { supabaseErrorMessage } from "@/lib/supabase/errors";

/**
 * Compliance API keys.
 *
 * The key is generated from the platform CSPRNG, shown exactly once, and
 * stored only as a SHA-256 digest. Losing the database therefore does not
 * leak a single working key, and support genuinely cannot recover one for
 * a caller — which is the property that makes the promise credible.
 */

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

/** Characters of secret in a key. 40 base62 characters is ~238 bits. */
const KEY_CHARS = 40;

const KEY_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Uniformly random base62, by rejection sampling.
 *
 * The previous implementation was `alphabet[byte % 62]` over 32 random
 * bytes. 62 does not divide 256, so the first eight characters of the
 * alphabet — 0 through 7 — came up on five byte values each while the
 * remaining fifty-four came up on four. Every character of every key was
 * drawn from that skewed distribution: a fifth of the alphabet was 25%
 * more likely than the rest.
 *
 * The practical loss was small — roughly 190 bits of entropy instead of
 * 190.5, still far past brute force — so this was never an exploitable
 * key. It is fixed anyway for two reasons. Modulo bias in a credential
 * generator is the first thing a security review greps for, and being
 * able to say the generator is uniform is worth more than the half-bit.
 *
 * 248 is the largest multiple of 62 below 256, so bytes at or above it
 * are discarded rather than folded, which is what makes the result
 * uniform. Discards are refilled in batches instead of one byte at a
 * time; each draw keeps ~97% of its bytes, so one refill is almost
 * always enough.
 */
function randomBase62(length: number): string {
  const limit = 256 - (256 % KEY_ALPHABET.length); // 248
  let out = "";
  while (out.length < length) {
    const draw = new Uint8Array((length - out.length) * 2);
    crypto.getRandomValues(draw);
    for (const byte of draw) {
      if (byte >= limit) continue;
      out += KEY_ALPHABET[byte % KEY_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function listApiKeys(accountId: string): Promise<ApiKeyRow[]> {
  const { data, error } = await supabase()
    .schema("noshashi")
    .from("api_keys")
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(supabaseErrorMessage(error));

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    prefix: row.prefix as string,
    createdAt: row.created_at as string,
    lastUsedAt: (row.last_used_at as string) ?? null,
    revokedAt: (row.revoked_at as string) ?? null,
  }));
}

/** Returns the raw key exactly once; it is never retrievable again. */
export async function createApiKey(
  accountId: string,
  name: string
): Promise<{ raw: string; row: ApiKeyRow }> {
  const raw = `nsh_live_${randomBase62(KEY_CHARS)}`;
  const prefix = raw.slice(0, 16);
  const keyHash = await sha256Hex(raw);

  const { data, error } = await supabase()
    .schema("noshashi")
    .from("api_keys")
    .insert({ account_id: accountId, name: name.trim() || "Untitled key", prefix, key_hash: keyHash })
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
    .single();
  if (error) throw new Error(supabaseErrorMessage(error));

  return {
    raw,
    row: {
      id: data.id as string,
      name: data.name as string,
      prefix: data.prefix as string,
      createdAt: data.created_at as string,
      lastUsedAt: null,
      revokedAt: null,
    },
  };
}

/**
 * Revoke a key. Terminal: the database trigger refuses to write
 * revoked_at back to null, so this cannot be undone from any client.
 *
 * The account filter is redundant against row level security, which
 * already scopes the update to the caller. It is here anyway because it
 * costs one predicate: an unscoped `eq("id", …)` is only safe for as long
 * as the policy is correct, and defence that depends on exactly one
 * control being right is the kind that fails quietly when the policy is
 * next edited.
 */
export async function revokeApiKey(accountId: string, id: string): Promise<void> {
  const { error } = await supabase()
    .schema("noshashi")
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", accountId);
  if (error) throw new Error(supabaseErrorMessage(error));
}

export type UsageSummary = {
  total: number;
  last30Days: number;
  byVerdict: Record<string, number>;
};

/**
 * Usage, counted rather than sampled.
 *
 * This used to select up to 1,000 rows and report `rows.length` as the
 * total. Past a thousand verifications the number simply stopped moving,
 * and the thirty-day figure and the verdict split were computed over the
 * same truncated window — so an account doing real volume saw a usage
 * dashboard that under-reported it and then stayed still. On a page a
 * customer reconciles against an invoice, that is the worst kind of
 * wrong: stable, plausible and false.
 *
 * Four exact counts from the database instead of arithmetic over a page
 * of rows. `head: true` transfers no rows at all — only the count.
 */
export async function readUsage(accountId: string): Promise<UsageSummary> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const events = () =>
    supabase().schema("noshashi").from("verification_events");

  const [total, last30, go, hold, noGo] = await Promise.all([
    events().select("id", { count: "exact", head: true }).eq("account_id", accountId),
    events()
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .gte("created_at", since),
    events()
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("verdict", "go"),
    events()
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("verdict", "hold"),
    events()
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("verdict", "no-go"),
  ]);

  for (const result of [total, last30, go, hold, noGo]) {
    if (result.error) throw new Error(supabaseErrorMessage(result.error));
  }

  return {
    total: total.count ?? 0,
    last30Days: last30.count ?? 0,
    byVerdict: {
      go: go.count ?? 0,
      hold: hold.count ?? 0,
      "no-go": noGo.count ?? 0,
    },
  };
}
