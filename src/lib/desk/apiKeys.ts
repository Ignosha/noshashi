import { supabase } from "@/lib/supabase/client";

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

const KEY_BYTES = 32;

function toBase62(bytes: Uint8Array): string {
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
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
  if (error) throw new Error(error.message);

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
  const bytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(bytes);
  const secret = toBase62(bytes);
  const raw = `nsh_live_${secret}`;
  const prefix = raw.slice(0, 16);
  const keyHash = await sha256Hex(raw);

  const { data, error } = await supabase()
    .schema("noshashi")
    .from("api_keys")
    .insert({ account_id: accountId, name: name.trim() || "Untitled key", prefix, key_hash: keyHash })
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
    .single();
  if (error) throw new Error(error.message);

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

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabase()
    .schema("noshashi")
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export type UsageSummary = {
  total: number;
  last30Days: number;
  byVerdict: Record<string, number>;
};

export async function readUsage(accountId: string): Promise<UsageSummary> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase()
    .schema("noshashi")
    .from("verification_events")
    .select("verdict, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const byVerdict: Record<string, number> = { go: 0, hold: 0, "no-go": 0 };
  let last30Days = 0;
  for (const row of rows) {
    const verdict = String(row.verdict);
    byVerdict[verdict] = (byVerdict[verdict] ?? 0) + 1;
    if (String(row.created_at) >= since) last30Days += 1;
  }

  return { total: rows.length, last30Days, byVerdict };
}
