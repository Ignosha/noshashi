import { snapshot } from '../rlusd.js';
import { clientKey, take } from '../rate-limit.js';
let cached, pending;
export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'GET required' }); }
  const gate = take(`rlusd:${clientKey(req)}`, { limit: 12 });
  if (!gate.ok) { res.setHeader('Retry-After', String(gate.retryAfter)); return res.status(429).json({ error: 'Please wait before refreshing' }); }
  res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=0, must-revalidate');
  if (!cached || Date.now() - cached.at >= 300000) {
    pending ??= snapshot().then(value => { cached = { value, at: Date.now() }; }).finally(() => { pending = null; });
    await pending;
  }
  return res.status(200).json({ ...cached.value, cached_for_seconds: Math.floor((Date.now() - cached.at) / 1000), cache_ttl_seconds: 300 });
}
