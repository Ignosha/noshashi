import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync('site/assets/desk-editorial.js', 'utf8');
const fixture = JSON.parse(readFileSync('tests/fixtures/authority-bitstamp-107585800.json', 'utf8'));
const issuer = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
const ids = ['FREEZE_SURRENDERED', 'NOT_GLOBALLY_FROZEN', 'NO_UNILATERAL_SIGNER'];

async function render(reply, ok = true) {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, { textContent: '', hidden: true, addEventListener() {} });
    return elements.get(selector);
  };
  element('[data-ed-ledger]').textContent = '—';
  element('[data-ed-digest]').textContent = 'Awaiting an authority reading';
  const checks = ids.map(id => ({ dataset: { edCheck: id }, textContent: 'Not read' }));
  const receipt = { dataset: {}, setAttribute() {}, removeAttribute(name) { if (name === 'data-verdict') delete this.dataset.verdict; }, querySelector: element, querySelectorAll: () => checks };
  runInNewContext(script, {
    document: { body: { hasAttribute: () => true }, documentElement: { classList: { add() {} } }, querySelector: selector => selector === '.ed-receipt' ? receipt : null },
    window: { matchMedia: () => ({ matches: false }), addEventListener() {} },
    AbortSignal,
    fetch: async () => ({ ok, json: async () => reply }),
  });
  await new Promise(resolve => setImmediate(resolve));
  return { receipt, element, checks };
}

describe('Ledger Desk receipt', () => {
  it('renders the verdict, checks and fingerprint from the same complete reply', async () => {
    const { receipt, element, checks } = await render({ ...fixture, issuer });
    expect(receipt.dataset).toEqual({ state: 'read', verdict: fixture.verdict });
    expect(element('[data-ed-digest]').textContent).toBe(fixture.digest);
    expect(element('[data-ed-ledger]').textContent).toBe(fixture.ledgerIndex.toLocaleString('en-US'));
    expect(checks.map(check => check.textContent)).toEqual(['No', 'Yes', 'No']);
  });

  const cases = {
    'empty checks': { checks: [] },
    'missing displayed check': { checks: fixture.checks.filter(check => check.id !== ids[0]) },
    'duplicate displayed check': { checks: [...fixture.checks, fixture.checks[0]] },
    'unreadable check': { checks: fixture.checks.map(check => check.id === ids[0] ? { ...check, state: 'INSUFFICIENT_DATA' } : check) },
    'non-boolean result': { checks: fixture.checks.map(check => ({ ...check, passed: 'false' })) },
    'missing rules version': { rulesVersion: undefined },
    'unreadable authority': { unreadable: ['posture: timeout'] },
    'invalid digest': { digest: 'invalid' },
    'missing ledger': { ledgerIndex: undefined },
    'wrong issuer': { issuer: fixture.issuer },
  };
  for (const [name, override] of Object.entries(cases)) {
    it(`withholds the record and offers retry for ${name}`, async () => {
      const { receipt, element, checks } = await render({ ...fixture, issuer, ...override });
      expect(receipt.dataset).toEqual({ state: 'unavailable' });
      expect(element('[data-ed-verdict]').textContent).toBe('Not read');
      expect(element('[data-ed-ledger]').textContent).toBe('—');
      expect(element('[data-ed-digest]').textContent).toBe('Awaiting an authority reading');
      expect(checks.every(check => check.textContent === 'Not read')).toBe(true);
      expect(element('.ed-retry').hidden).toBe(false);
    });
  }
  it('offers retry on an HTTP failure', async () => {
    const { receipt, element } = await render(null, false);
    expect(receipt.dataset.state).toBe('unavailable');
    expect(element('.ed-retry').hidden).toBe(false);
  });
});
