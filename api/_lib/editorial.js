/** Editorial content only. Never imports the private BD store or changes risk policy. */
import { createHash } from 'node:crypto';

export const STATES = ['RESEARCHING', 'DRAFT', 'NEEDS REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'CORRECTED', 'RETRACTED'];
export const EVIDENCE = ['VERIFIED', 'INFERRED', 'UNVERIFIED', 'UNKNOWN'];
export const CATEGORIES = ['XRPL & XRP', 'Institutional Adoption', 'Stablecoins', 'Payments', 'Tokenization', 'Issuer Risk', 'Counterparty Risk', 'Liquidity', 'Compliance', 'Regulation', 'Security', 'Market Infrastructure', 'NOSHASHI Updates'];
export const WORKFLOWS = {
  stablecoin: { label: 'Inspect RLUSD evidence', href: '/intelligence/rlusd/' },
  issuer: { label: 'Inspect issuer controls', href: '/certificate/' },
  payment: { label: 'Inspect a delivered payment', href: '/delivered/' },
  liquidity: { label: 'Inspect funded depth', href: '/book-health/' },
};
export function httpsUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
// Digest the exact public projection, in fixed key order. Private notes never enter it.
export function publicContent(a) {
  return {
    slug: a.slug, title: a.title, category: a.category, eventDate: a.eventDate ?? null,
    reportedAt: a.reportedAt, updatedAt: a.updatedAt, summary: a.summary,
    simple: a.simple, professional: a.professional, relevance: a.relevance,
    limitations: a.limitations, workflows: a.workflows,
    sources: a.sources.map(s => ({ id: s.id, title: s.title, url: s.url, publisher: s.publisher, publishedAt: s.publishedAt ?? null, checkedAt: s.checkedAt, primary: s.primary })),
    claims: a.claims.map(c => ({ text: c.text, evidence: c.evidence, sourceIds: c.sourceIds })),
    correction: a.correction ?? null,
  };
}
export function contentDigest(a) {
  return createHash('sha256').update(JSON.stringify(publicContent(a)), 'utf8').digest('hex');
}
export function validateArticle(a, now = Date.now()) {
  if (!a || typeof a !== 'object') throw new Error('Article is required');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug ?? '') || a.slug.length > 100) throw new Error('Invalid article slug');
  if (!STATES.includes(a.state) || !CATEGORIES.includes(a.category)) throw new Error('Invalid editorial state/category');
  for (const field of ['title', 'summary', 'relevance', 'limitations']) if (!nonempty(a[field]) || a[field].length > 10000) throw new Error(`Missing/oversized ${field}`);
  if (!validDate(a.reportedAt) || !validDate(a.updatedAt) || Date.parse(a.updatedAt) < Date.parse(a.reportedAt) || Date.parse(a.updatedAt) > now) throw new Error('Invalid article dates');
  if (a.eventDate !== null && a.eventDate !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(a.eventDate) || !Number.isFinite(Date.parse(a.eventDate)))) throw new Error('Invalid event date');
  for (const mode of ['simple', 'professional']) if (!Array.isArray(a[mode]) || !a[mode].length || a[mode].length > 40 || a[mode].some(p => !nonempty(p) || p.length > 10000)) throw new Error(`Missing/oversized ${mode} analysis`);
  if (!Array.isArray(a.workflows) || a.workflows.some(w => !WORKFLOWS[w])) throw new Error('Unsupported workflow');
  if (!Array.isArray(a.sources) || !a.sources.length || a.sources.length > 20) throw new Error('Sources required');
  const sourceIds = new Set();
  for (const s of a.sources) {
    if (!/^[a-z0-9-]+$/.test(s.id ?? '') || sourceIds.has(s.id) || !httpsUrl(s.url) || !nonempty(s.title) || !nonempty(s.publisher) || typeof s.primary !== 'boolean' || !validDate(s.checkedAt) || Date.parse(s.checkedAt) > now || (s.publishedAt !== null && s.publishedAt !== undefined && (!validDate(s.publishedAt) || Date.parse(s.publishedAt) > now))) throw new Error('Invalid source');
    sourceIds.add(s.id);
  }
  if (!a.sources.some(s => s.primary)) throw new Error('Primary document required');
  if (!Array.isArray(a.claims) || !a.claims.length || a.claims.length > 50) throw new Error('Claim ledger required');
  for (const c of a.claims) {
    if (!nonempty(c.text) || !EVIDENCE.includes(c.evidence) || !Array.isArray(c.sourceIds) || c.sourceIds.some(id => !sourceIds.has(id)) || (c.evidence === 'VERIFIED' && c.sourceIds.length === 0)) throw new Error('Invalid/unsupported claim');
  }
  if (a.correction !== null && a.correction !== undefined && !nonempty(a.correction)) throw new Error('Invalid correction');
  return a;
}
export function approveArticle(a, actor, now = new Date().toISOString()) {
  validateArticle(a, Date.parse(now));
  if (a.state !== 'NEEDS REVIEW' || !nonempty(actor)) throw new Error('Review state and authenticated owner process required');
  return { ...a, state: 'APPROVED', approval: { actor, at: now, digest: contentDigest(a), authority: 'owner-local-review' } };
}
export function assertApproval(a, now = Date.now()) {
  validateArticle(a, now);
  if (a.approval?.authority !== 'owner-local-review' || !nonempty(a.approval.actor) || !validDate(a.approval.at) || Date.parse(a.approval.at) > now || a.approval.digest !== contentDigest(a)) throw new Error('Missing or stale exact-content owner approval');
}
export function publishArticle(a, now = new Date().toISOString()) {
  assertApproval(a, Date.parse(now));
  if (!['APPROVED', 'SCHEDULED'].includes(a.state)) throw new Error('Article is not approved for publication');
  if (a.state === 'SCHEDULED' && (!validDate(a.scheduledAt) || Date.parse(a.scheduledAt) > Date.parse(now))) throw new Error('Scheduled publication is not due');
  return { ...a, state: a.correction ? 'CORRECTED' : 'PUBLISHED', publishedAt: now };
}
/** Fail the entire build on invalid public records; do not silently publish a subset. */
export function publicManifest(records, now = Date.now()) {
  if (!Array.isArray(records) || records.length > 500) throw new Error('Invalid public manifest');
  const seen = new Set();
  return records.map(a => {
    assertApproval(a, now);
    if (!['PUBLISHED', 'CORRECTED', 'RETRACTED'].includes(a.state) || !validDate(a.publishedAt) || Date.parse(a.publishedAt) > now || Date.parse(a.publishedAt) < Date.parse(a.approval.at)) throw new Error('Non-public article in public manifest');
    if (seen.has(a.slug)) throw new Error('Duplicate slug');
    seen.add(a.slug);
    if (a.state === 'CORRECTED' && !nonempty(a.correction)) throw new Error('Correction notice required');
    if (a.state === 'RETRACTED') {
      if (!nonempty(a.retraction?.reason) || !validDate(a.retraction.at) || Date.parse(a.retraction.at) > now || !nonempty(a.retraction.actor)) throw new Error('Retraction notice required');
      return { slug: a.slug, title: a.title, state: a.state, publishedAt: a.publishedAt, retraction: { reason: a.retraction.reason, at: a.retraction.at } };
    }
    return { ...publicContent(a), state: a.state, publishedAt: a.publishedAt };
  }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
export function dailyBrief(articles, day) {
  return articles.filter(a => a.state !== 'RETRACTED' && a.publishedAt.startsWith(day)).slice(0, 5);
}
/** Whitelist the build input too; never copy a private queue object into Git. */
export function exportBuildArtifact(records, now = Date.now()) {
  publicManifest(records, now);
  return records.map(a => ({
    ...publicContent(a), state: a.state, publishedAt: a.publishedAt,
    approval: { actor: 'founder-local-owner', authority: a.approval.authority, at: a.approval.at, digest: a.approval.digest },
    ...(a.state === 'RETRACTED' ? { retraction: { actor: 'founder-local-owner', at: a.retraction.at, reason: a.retraction.reason } } : {}),
  }));
}
