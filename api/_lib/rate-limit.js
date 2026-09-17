/*
 * A small in-memory rate limit.
 *
 * Honest about what it is: serverless instances are per-region and
 * recycled, so this bounds abuse from one caller hitting one warm
 * instance. It is not a distributed limiter and must not be relied on
 * as the only control on anything expensive or destructive — the
 * endpoints that use it are also bounded by a short input cap and, for
 * the model-backed path, by the absence of a key.
 *
 * It exists for the ordinary case: a loop in someone's console, or a
 * scraper walking the contact form.
 */

const BUCKETS = new Map();
const SWEEP_AFTER = 5 * 60 * 1000;
let lastSweep = Date.now();

/** The caller's address, as far as the platform will tell us. */
export function clientKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  const first = forwarded.split(",")[0].trim();
  return first || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

/**
 * Returns { ok, retryAfter } for one caller in a sliding window.
 * Never throws — a limiter that can fail a request by crashing is worse
 * than no limiter.
 */
export function take(key, { limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();

  // Opportunistic sweep: no timers in a serverless function, so the
  // map is pruned on use rather than on a schedule.
  if (now - lastSweep > SWEEP_AFTER) {
    for (const [k, hits] of BUCKETS) {
      if (!hits.length || now - hits[hits.length - 1] > windowMs * 4) BUCKETS.delete(k);
    }
    lastSweep = now;
  }

  const hits = (BUCKETS.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - hits[0])) / 1000);
    BUCKETS.set(key, hits);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }
  hits.push(now);
  BUCKETS.set(key, hits);
  return { ok: true, remaining: limit - hits.length };
}
