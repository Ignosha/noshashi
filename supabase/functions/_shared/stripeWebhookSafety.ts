/** Raw-body HMAC, timestamp window, and overlapping v1 signatures on rotation. */
export async function stripeSignature(
  payload: string,
  header: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
) {
  if (!secret) return false;
  const times: string[] = [], signatures: string[] = [];
  for (const part of header.split(",")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    const name = part.slice(0, at).trim(), value = part.slice(at + 1).trim();
    if (name === "t") times.push(value);
    if (name === "v1" && /^[a-fA-F0-9]{64}$/.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }
  if (times.length !== 1 || !/^\d+$/.test(times[0]) || !signatures.length) {
    return false;
  }
  const timestamp = Number(times[0]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${times[0]}.${payload}`),
  );
  const expected = Array.from(
    new Uint8Array(mac),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
  return signatures.some((value) => {
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ value.charCodeAt(i);
    }
    return diff === 0;
  });
}
