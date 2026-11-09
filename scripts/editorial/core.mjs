import { createHash } from 'node:crypto';
import { parseFeed } from '../../api/_lib/news.js';
import { httpsUrl } from '../../api/_lib/editorial.js';

// Fixed public sources. No URLs from mail, collected articles or request bodies are fetched.
export const SOURCES = [
  { id: 'xrplf-rippled', publisher: 'XRPL Foundation rippled releases', url: 'https://github.com/XRPLF/rippled/releases.atom', kind: 'primary' },
  { id: 'zodia-custody', publisher: 'Zodia Custody', url: 'https://zodia-custody.com/feed/', kind: 'primary' },
  { id: 'noshashi-releases', publisher: 'NOSHASHI repository', url: 'https://github.com/Ignosha/noshashi/releases.atom', kind: 'product-update' },
];
export function mergeDiscoveries(existing, incoming, now = new Date().toISOString()) {
  const result = new Map(existing.map(x => [x.id, x]));
  for (const item of incoming) {
    const url = httpsUrl(item.url);
    if (!url || !item.title || item.title.length > 500) continue;
    const id = createHash('sha256').update(url).digest('hex');
    const old = result.get(id);
    // Changed source metadata never overwrites reviewed original analysis or grants approval.
    if (old) {
      if (old.sourceTitle !== item.title) result.set(id, { ...old, sourceTitle: item.title, sourceChangedAt: now, needsRecheck: true, lastSeenAt: now });
      else result.set(id, { ...old, lastSeenAt: now });
    } else result.set(id, { id, url, sourceTitle: item.title, publisher: item.publisher, sourceKind: item.sourceKind, sourcePublishedAt: item.publishedAt ?? null, firstSeenAt: now, lastSeenAt: now, state: 'RESEARCHING', evidence: 'UNVERIFIED', article: null });
  }
  return [...result.values()];
}
async function boundedText(response, limit = 512 * 1024) {
  if (!response.body) throw new Error('Missing response body');
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > limit) throw new Error('Source exceeds byte budget');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}
export async function collect({ fetcher = fetch, now = new Date().toISOString(), sources = SOURCES, previousHealth = [] } = {}) {
  const incoming = [], health = [];
  // Sequential, one attempt per source per run. Next scheduled run is the retry.
  for (const source of sources) {
    try {
      if (!SOURCES.some(s => s.url === source.url)) throw new Error('Unapproved source');
      const prior = previousHealth.find(h => h.id === source.id);
      if (prior?.retryAt && Date.parse(prior.retryAt) > Date.parse(now)) { health.push({ ...prior, status: 'retry_deferred' }); continue; }
      const response = await fetcher(source.url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml', 'User-Agent': 'NOSHASHI editorial discovery (+https://www.noshashi.app)' } });
      if (!response.ok) {
        const retry = response.headers.get('retry-after');
        const retryMs = retry && /^\d+$/.test(retry) ? Date.parse(now) + Number(retry) * 1000 : Date.parse(retry);
        health.push({ id: source.id, status: 'unavailable', error: `Source HTTP ${response.status}`, checkedAt: now, ...(Number.isFinite(retryMs) && retryMs > Date.parse(now) ? { retryAt: new Date(retryMs).toISOString() } : {}) });
        continue;
      }
      const items = parseFeed(await boundedText(response), source.publisher).slice(0, 30);
      incoming.push(...items.map(i => ({ ...i, publisher: source.publisher, sourceKind: source.kind })));
      health.push({ id: source.id, status: items.length ? 'read' : 'empty_or_unrecognized', count: items.length, checkedAt: now });
    } catch (error) { health.push({ id: source.id, status: 'unavailable', error: error.message, checkedAt: now }); }
  }
  return { incoming, health, checkedAt: now };
}
