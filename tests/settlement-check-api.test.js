import { beforeEach, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
vi.mock('../api/_lib/authority.js', () => ({ rippleRpcWithSource: vi.fn() }));
vi.mock('../api/_lib/rate-limit.js', () => ({ clientKey: () => 'test', take: vi.fn(() => ({ ok: true })) }));
import { rippleRpcWithSource } from '../api/_lib/authority.js';
import { take } from '../api/_lib/rate-limit.js';
import handler from '../api/_lib/routes/settlement-check.js';
const hash = 'A'.repeat(64), destination = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const input = () => ({ transaction_hash: hash, expectation: { invoice_id: 'PRIVATE-TEST-REFERENCE', destination, expected_amount: '1', asset: { kind: 'xrp' } } });
const req = patch => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: input(), ...patch });
function res() { return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; }
beforeEach(() => { vi.clearAllMocks(); take.mockReturnValue({ ok: true }); rippleRpcWithSource.mockResolvedValue({ endpoint: 'https://xrplcluster.com', result: { hash, ledger_index: 100, validated: true, TransactionType: 'Payment', Destination: destination, meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1000000' } } }); });
it('passes only a hash to the node and hashes the exact report', async () => {
  const response = res(); await handler(req(), response);
  expect(response.code).toBe(200); expect(response.body.status).toBe('MATCHED');
  expect(rippleRpcWithSource).toHaveBeenCalledWith('tx', { transaction: hash, binary: false }, 4000);
  const { receipt, limitation, ...report } = response.body;
  expect(receipt.digest).toBe(createHash('sha256').update(JSON.stringify(report)).digest('hex'));
  expect(limitation).toContain('not a digital signature'); expect(response.headers['Cache-Control']).toBe('no-store');
});
it.each([[{ method: 'GET' }, 405], [{ headers: { 'content-type': 'text/plain' } }, 415], [{ body: { transaction_hash: 'bad' } }, 400], [{ body: { ...input(), junk: 'x'.repeat(5000) } }, 413]])('rejects invalid input before node access', async (patch, code) => {
  const response = res(); await handler(req(patch), response); expect(response.code).toBe(code); expect(rippleRpcWithSource).not.toHaveBeenCalled();
});
it('honors rate limiting without a ledger request', async () => { take.mockReturnValue({ ok: false, retryAfter: 30 }); const response = res(); await handler(req(), response); expect(response.code).toBe(429); expect(response.headers['Retry-After']).toBe('30'); expect(rippleRpcWithSource).not.toHaveBeenCalled(); });
it('fails closed without returning upstream errors or private inputs', async () => { rippleRpcWithSource.mockRejectedValue(new Error('sensitive provider error')); const response = res(); await handler(req(), response); expect(response.code).toBe(503); expect(response.body.status).toBe('UNRESOLVED'); expect(JSON.stringify(response.body)).not.toMatch(/sensitive|PRIVATE-TEST/); });
