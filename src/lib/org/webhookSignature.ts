/**
 * Reference verifier for NOSHASHI webhook signatures (docs/api/WEBHOOKS.md).
 *
 * The server signs "<t>.<raw body>" with HMAC-SHA256 using the webhook's
 * secret and sends `X-Noshashi-Signature: t=<unix seconds>,v1=<hex>`.
 * Verify against the raw request body, byte for byte — not a re-serialised
 * copy — and reject stale timestamps to stop replays.
 */
export async function verifyNoshashiSignature(input: {
  secret: string;
  header: string | null;
  rawBody: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const parts = Object.fromEntries((input.header ?? "").split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isInteger(t) || !v1 || !/^[0-9a-f]{64}$/.test(v1)) return { ok: false, reason: "malformed signature header" };
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (input.toleranceSeconds ?? 300)) return { ok: false, reason: "timestamp outside tolerance" };
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${input.rawBody}`)));
  const expected = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time comparison.
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0 ? { ok: true } : { ok: false, reason: "signature mismatch" };
}
