import { describe, it, expect } from 'vitest';
import { approveArticle, publishArticle, publicManifest, exportBuildArtifact, contentDigest, dailyBrief } from '../api/_lib/editorial.js';
import { mergeDiscoveries, collect, SOURCES } from '../scripts/editorial/core.mjs';
import { renderArticle, renderNewsroom, buildNewsroom } from '../scripts/build-newsroom.mjs';
import { inlineScriptCount } from '../scripts/inline-scripts.mjs';

const now = '2026-11-09T12:00:00Z';
const fixture = () => ({ slug: 'test-only-evidence', state: 'NEEDS REVIEW', title: 'TEST FIXTURE — not news', category: 'Payments', eventDate: '2026-11-08', reportedAt: '2026-11-09T09:00:00Z', updatedAt: '2026-11-09T10:00:00Z', summary: 'A synthetic test record.', simple: ['Test explanation.'], professional: ['Test detail.'], relevance: 'Test only.', limitations: 'Not real reporting.', workflows: ['payment'], sources: [{ id: 's1', title: 'Test source', url: 'https://example.com/source', publisher: 'Example', publishedAt: null, checkedAt: '2026-11-09T10:00:00Z', primary: true }], claims: [{ text: 'Test claim.', evidence: 'VERIFIED', sourceIds: ['s1'] }], privateNotes: 'DO_NOT_EXPOSE', prospect: { email: 'DO_NOT_EXPOSE' } });
const approved = () => approveArticle(fixture(), 'test-owner', now);
const published = () => publishArticle(approved(), now);
describe('editorial publication boundary', () => {
  it('exports only approved exact public content; strips private fields and approver identity', () => {
    const a = publicManifest([published()], Date.parse(now))[0];
    expect(a.title).toBe(fixture().title);
    expect(JSON.stringify(a)).not.toContain('DO_NOT_EXPOSE');
    expect(a.approval).toBeUndefined();
    expect(a.privateNotes).toBeUndefined();
    const artifact = exportBuildArtifact([published()], Date.parse(now));
    expect(JSON.stringify(artifact)).not.toContain('DO_NOT_EXPOSE');
    expect(JSON.stringify(artifact)).not.toContain('test-owner');
    expect(publicManifest(artifact, Date.parse(now))).toEqual([a]);
  });
  for (const state of ['RESEARCHING', 'DRAFT', 'NEEDS REVIEW', 'APPROVED', 'SCHEDULED']) it(`never exports ${state}`, () => {
    expect(() => publicManifest([{ ...published(), state }], Date.parse(now))).toThrow();
  });
  it('requires explicit review state; external data cannot directly approve', () => {
    expect(() => approveArticle({ ...fixture(), state: 'RESEARCHING' }, 'test-owner', now)).toThrow();
    expect(() => approveArticle(fixture(), '', now)).toThrow();
  });
  for (const [field, value] of Object.entries({ title: 'Changed', summary: 'Changed', simple: ['Changed'], professional: ['Changed'], relevance: 'Changed', limitations: 'Changed', eventDate: '2026-11-01', correction: 'Changed', sources: [{ ...fixture().sources[0], url: 'https://example.com/other' }], claims: [{ ...fixture().claims[0], text: 'Changed' }] })) it(`invalidates approval after changing ${field}`, () => {
    expect(() => publishArticle({ ...approved(), [field]: value }, now)).toThrow();
  });
  it('does not compare different scopes; private notes do not change the public digest', () => {
    expect(contentDigest({ ...fixture(), privateNotes: 'different' })).toBe(contentDigest(fixture()));
    expect(contentDigest({ ...fixture(), workflows: ['issuer'] })).not.toBe(contentDigest(fixture()));
  });
  it('rejects missing data, unsafe URLs, unsupported workflows and claims without sources', () => {
    for (const patch of [{ professional: [] }, { workflows: ['avalanche'] }, { sources: [] }, { sources: [{ ...fixture().sources[0], url: 'javascript:alert(1)' }] }, { claims: [{ text: 'Claim', evidence: 'VERIFIED', sourceIds: [] }] }, { sources: [{ ...fixture().sources[0], primary: false }] }, { updatedAt: '2030-01-01T00:00:00Z' }, { slug: '../private' }]) expect(() => approveArticle({ ...fixture(), ...patch }, 'owner', now)).toThrow();
  });
  it('rejects future, duplicate, premature scheduled and unapproved records', () => {
    expect(() => publicManifest([published(), published()], Date.parse(now))).toThrow();
    expect(() => publicManifest([{ ...published(), approval: null }], Date.parse(now))).toThrow();
    expect(() => publishArticle({ ...approved(), state: 'SCHEDULED', scheduledAt: '2026-11-10T00:00:00Z' }, now)).toThrow();
    expect(() => publicManifest([{ ...published(), publishedAt: '2030-01-01T00:00:00Z' }], Date.parse(now))).toThrow();
  });
  it('retraction removes the body while preserving the public record', () => {
    const a = publicManifest([{ ...published(), state: 'RETRACTED', retraction: { actor: 'owner', at: now, reason: 'Source withdrawn' } }], Date.parse(now))[0];
    const html = renderArticle(a);
    expect(html).toContain('Source withdrawn');
    expect(html).not.toContain('Test detail.');
    expect(html).not.toContain('DO_NOT_EXPOSE');
  });
  it('briefs contain at most five published developments for the day; never fill gaps', () => {
    expect(dailyBrief([], '2026-11-09')).toEqual([]);
    expect(dailyBrief(Array.from({ length: 7 }, published), '2026-11-09')).toHaveLength(5);
    expect(dailyBrief([published()], '2026-11-10')).toHaveLength(0);
  });
});
describe('research collection is metadata discovery, not reporting', () => {
  it('deduplicates identical URLs and flags changed sources without replacing reviewed work', () => {
    const input = { title: 'One source', url: 'https://example.com/source', publisher: 'Example' };
    const original = mergeDiscoveries([], [input], now);
    expect(mergeDiscoveries(original, [input], now)).toHaveLength(1);
    const changed = mergeDiscoveries([{ ...original[0], article: { title: 'Human analysis' } }], [{ ...input, title: 'Updated source' }], now)[0];
    expect(changed.needsRecheck).toBe(true);
    expect(changed.article.title).toBe('Human analysis');
    expect(changed.state).toBe('RESEARCHING');
  });
  it('bounded source failures stay unavailable, without fabricated drafts', async () => {
    let calls = 0;
    const r = await collect({ fetcher: async () => { calls++; return new Response('', { status: 503 }); }, now });
    expect(calls).toBe(SOURCES.length);
    expect(r.incoming).toEqual([]);
    expect(r.health.every(s => s.status === 'unavailable')).toBe(true);
  });
  it('rejects redirects and oversized documents, handles malformed feeds honestly', async () => {
    const r = await collect({ sources: [SOURCES[0]], fetcher: async (_, opts) => { expect(opts.redirect).toBe('error'); return new Response('x'.repeat(600000)); }, now });
    expect(r.health[0].status).toBe('unavailable');
    const empty = await collect({ sources: [SOURCES[0]], fetcher: async () => new Response('not a feed'), now });
    expect(empty.health[0].status).toBe('empty_or_unrecognized');
  });
  it('does not fetch arbitrary input URLs', async () => {
    const r = await collect({ sources: [{ id: 'bad', url: 'https://example.com/unapproved' }], fetcher: async () => { throw new Error('must not fetch'); }, now });
    expect(r.health[0].error).toBe('Unapproved source');
  });
  it('collects valid metadata as unverified research, never auto-written articles', async () => {
    const r = await collect({ sources: [SOURCES[0]], now, fetcher: async () => new Response('<feed><entry><title>Test release</title><link href="https://github.com/XRPLF/rippled/releases/tag/test"/><updated>2026-11-08T12:00:00Z</updated></entry></feed>') });
    expect(r.incoming).toHaveLength(1);
    const d = mergeDiscoveries([], r.incoming, now)[0];
    expect(d.state).toBe('RESEARCHING'); expect(d.evidence).toBe('UNVERIFIED'); expect(d.article).toBeNull();
  });
  it('preserves provider Retry-After and defers the next attempt', async () => {
    const r = await collect({ sources: [SOURCES[0]], now, fetcher: async () => new Response('', { status: 429, headers: { 'Retry-After': '86400' } }) });
    expect(r.health[0].retryAt).toBe('2026-11-10T12:00:00.000Z');
    const next = await collect({ sources: [SOURCES[0]], now, previousHealth: r.health, fetcher: async () => { throw new Error('must not call'); } });
    expect(next.health[0].status).toBe('retry_deferred');
  });
});
describe('public presentation', () => {
  it('standalone newsroom builds externalize executable scripts under the existing CSP', async () => {
    const files = new Map();
    await buildNewsroom(async (name, body) => { files.set(name, body); });
    expect(inlineScriptCount(files.get('intelligence/index.html'))).toBe(0);
    expect(inlineScriptCount(files.get('intelligence/archive/index.html'))).toBe(0);
    expect([...files.keys()].some(k => k.startsWith('assets/inline/'))).toBe(true);
  });
  it('renders honest empty states and no simulated news or numeric market strip', () => {
    const html = renderNewsroom([], { now: new Date(now) });
    expect(html).toContain('No approved briefing for today');
    expect(html).toContain('no published articles yet');
    expect(html).toContain('NO LIVE FLOWS');
    expect(html).not.toContain('DO_NOT_EXPOSE');
  });
  it('escapes article content and keeps sources, modes and limitations in no-JS HTML', () => {
    const raw = fixture(); raw.title = '<img src=x onerror=alert(1)>';
    const a = publicManifest([publishArticle(approveArticle(raw, 'owner', now), now)], Date.parse(now))[0];
    const html = renderArticle(a);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('Simple mode'); expect(html).toContain('Professional mode');
    expect(html).toContain('Not real reporting.'); expect(html).toContain('https://example.com/source');
  });
});
