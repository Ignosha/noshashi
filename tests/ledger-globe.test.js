import { describe, it, expect } from 'vitest';
import { readLedgerSnapshot, meridianPaths } from '../site/assets/ledger-globe-core.mjs';
import { renderNewsroom, renderLedgerGlobe } from '../scripts/build-newsroom.mjs';

const now = Date.parse('2026-11-09T15:00:00Z');
const fixture = () => ({ sources: { ledger: true, spot: false }, live: false, fetchedAt: '2026-11-09T14:59:00Z', ledger: { sequence: 100, baseFeeXrp: 0.00001, peers: 7, node: 'xrplcluster.com' } });
describe('globe telemetry stays separate from animation and market-price health', () => {
  it('accepts a complete node snapshot when the separate price source is unavailable', () => {
    expect(readLedgerSnapshot(fixture(), now)).toEqual({ sequence: 100, baseFeeXrp: 0.00001, peers: 7, source: 'xrplcluster.com', fetchedAt: fixture().fetchedAt, stale: false });
  });
  for (const [label, patch] of Object.entries({ missingLedger: { ledger: null }, missingAvailability: { sources: {} }, missingTime: { fetchedAt: null }, invalidTime: { fetchedAt: 'unknown' }, futureTime: { fetchedAt: '2026-11-10T00:00:00Z' }, stringIndex: { ledger: { ...fixture().ledger, sequence: '100' } }, negativeIndex: { ledger: { ...fixture().ledger, sequence: -1 } }, nonintegerIndex: { ledger: { ...fixture().ledger, sequence: 1.5 } }, unsafeIndex: { ledger: { ...fixture().ledger, sequence: Number.MAX_SAFE_INTEGER + 1 } }, sourceMismatch: { ledger: { ...fixture().ledger, node: 'unverified.example' } }, sourceFailed: { sources: { ledger: false } } })) it(`refuses ${label}`, () => {
    expect(readLedgerSnapshot({ ...fixture(), ...patch }, now)).toBeNull();
  });
  it('labels cached old snapshots stale rather than live', () => {
    expect(readLedgerSnapshot({ ...fixture(), fetchedAt: '2026-11-09T14:00:00Z' }, now).stale).toBe(true);
  });
  it('keeps unavailable optional metrics null; never substitutes zero', () => {
    for (const value of [undefined, null, -1, '0.1', NaN, Infinity]) {
      const r = readLedgerSnapshot({ ...fixture(), ledger: { ...fixture().ledger, baseFeeXrp: value, peers: value } }, now);
      expect(r.baseFeeXrp).toBeNull(); expect(r.peers).toBeNull();
    }
    const r = readLedgerSnapshot({ ...fixture(), ledger: { ...fixture().ledger, baseFeeXrp: 0, peers: 0 } }, now);
    expect(r.baseFeeXrp).toBe(0); expect(r.peers).toBe(0);
  });
  it('sphere coordinates stay bounded and change smoothly with rotation', () => {
    const a = meridianPaths(0), b = meridianPaths(0.1);
    expect(a).toHaveLength(12); expect(a[0].d).not.toBe(b[0].d);
    for (const p of [...a, ...b]) {
      expect(p.d).not.toMatch(/NaN|Infinity/);
      for (const match of p.d.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)) {
        expect(+match[1]).toBeGreaterThanOrEqual(107); expect(+match[1]).toBeLessThanOrEqual(413);
        expect(+match[2]).toBeGreaterThanOrEqual(57); expect(+match[2]).toBeLessThanOrEqual(363);
      }
    }
  });
  it('includes source, freshness, motion controls and an explicit illustrative boundary', () => {
    const html = renderLedgerGlobe();
    expect(html).toContain('data-globe-motion'); expect(html).toContain('data-globe-refresh');
    expect(html).toContain('not transaction locations'); expect(html).toContain('not independent consensus verification');
    expect(html).toContain('data-globe-sequence>Not read');
    expect(renderNewsroom([])).toContain('/assets/ledger-globe.mjs');
  });
});
