import { it, expect } from 'vitest';
import { evaluationPack } from '../scripts/build-settlement-evaluation.mjs';
it('keeps provenance and labels every expectation as a teaching example', async () => {
  const pack = await evaluationPack();
  expect(pack.label).toContain('SYNTHETIC EXPECTATIONS');
  expect(pack.source.captured_on).toBe('2026-10-11');
  expect(pack.source.transaction_hash).toBe('33C313E12DD8B2CFDB98ABC6298D4EFD0F3BC8EF283C057A026DA6170E7939AD');
  expect(pack.source.evidence_sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(pack.cases).toHaveLength(5);
});
it('covers exact, short, tag, unknown and reuse decisions without fabricating a transaction', async () => {
  const pack = await evaluationPack();
  for (const c of pack.cases) {
    expect(c.report.status).toBe(c.expected_status);
    expect(c.report.findings).toEqual(c.expected_findings);
    expect(c.report.transaction_hash).toBe(pack.source.transaction_hash);
  }
  const unknown = pack.cases.find(c => c.id === 'unavailable');
  expect(unknown.evidence_modified).toBe(true);
  expect(unknown.report.delivered).toBeNull();
  expect(pack.cases.find(c => c.id === 'reused-payment').allocation_warning).toContain('do not credit twice');
  expect(pack.cases.find(c => c.id === 'short-delivery').evidence.meta.delivered_amount.value).toBe('0.067791435856414');
});
