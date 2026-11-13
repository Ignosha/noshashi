import { createHash } from 'node:crypto';
import { rippleRpcWithSource } from '../authority.js';
import { clientKey, take } from '../rate-limit.js';
import { evaluateSettlement, validateExpectation, HASH } from '../settlement-exceptions.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST required' }); }
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return res.status(415).json({ error: 'JSON required' });
  const limit = take(`settlement:${clientKey(req)}`, { limit: 10 });
  if (!limit.ok) { res.setHeader('Retry-After', String(limit.retryAfter)); return res.status(429).json({ error: 'Please wait before checking again' }); }
  let input;
  try {
    if (Number(req.headers['content-length'] || 0) > 4096 || Buffer.byteLength(JSON.stringify(req.body) || '') > 4096) return res.status(413).json({ error: 'Request too large' });
    input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!input || typeof input.transaction_hash !== 'string' || !HASH.test(input.transaction_hash)) throw new Error('A 64-character transaction hash is required');
    input = { transaction_hash: input.transaction_hash.toUpperCase(), expectation: validateExpectation(input.expectation) };
  } catch (error) { return res.status(400).json({ error: error.message || 'Invalid request' }); }
  try {
    // Only the public hash goes to the node, never invoice fields.
    const { result, endpoint } = await rippleRpcWithSource('tx', { transaction: input.transaction_hash, binary: false }, 4000);
    const report = { ...evaluateSettlement(input.expectation, result, input.transaction_hash), network: 'XRPL Mainnet', observed_at: new Date().toISOString(), source: endpoint, evidence: result };
    const digest = createHash('sha256').update(JSON.stringify(report)).digest('hex');
    return res.status(200).json({ ...report, receipt: { algorithm: 'SHA-256', encoding: 'UTF-8 JSON.stringify(report without receipt or limitation)', digest }, limitation: 'A ledger match does not establish business authorization, legal settlement, compliance or independent consensus verification. Receipt is a hash, not a digital signature.' });
  } catch {
    return res.status(503).json({ status: 'UNRESOLVED', error: 'Ledger evidence unavailable. No payment match established; retry later.' });
  }
}
