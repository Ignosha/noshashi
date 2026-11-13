import { describe, it, expect } from 'vitest';
import { evaluateSettlement, validateExpectation } from '../api/_lib/settlement-exceptions.js';
const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const other = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
const hash = 'A'.repeat(64);
const invoice = { invoice_id: 'test-fixture-only', destination: address, expected_amount: '1', asset: { kind: 'xrp' } };
const transaction = (patch = {}) => ({ hash, validated: true, ledger_index: 100, TransactionType: 'Payment', Destination: address, Amount: '999999999999', meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1000000' }, ...patch });
const check = (patch, inv = invoice) => evaluateSettlement(inv, transaction(patch), hash);
describe('invoice expectations versus delivered ledger evidence (synthetic fixtures)', () => {
  it('matches delivered amount, ignoring requested Amount', () => expect(check({}).status).toBe('MATCHED'));
  it('supports v2 tx_json response envelopes', () => expect(check({ TransactionType: undefined, tx_json: { TransactionType: 'Payment', Destination: address } }).status).toBe('MATCHED'));
  it.each([undefined, 'unavailable', {}, { currency: 'USD', issuer: other, value: '1e999' }])('never substitutes requested amounts for unavailable delivery: %s', raw => {
    expect(check({ meta: { TransactionResult: 'tesSUCCESS', delivered_amount: raw } }).status).toBe('UNRESOLVED');
  });
  it.each([false, undefined])('requires validated evidence: %s', validated => expect(check({ validated }).status).toBe('UNRESOLVED'));
  it('requires a confirmed ledger and response transaction identity', () => {
    expect(check({ ledger_index: undefined }).status).toBe('UNRESOLVED');
    expect(check({ hash: 'B'.repeat(64) }).status).toBe('UNRESOLVED');
    expect(check({ hash: undefined }).status).toBe('UNRESOLVED');
  });
  it('rejects failed transactions and nonpayments', () => {
    expect(check({ meta: { TransactionResult: 'tecPATH_DRY', delivered_amount: '1000000' } }).findings).toContain('PAYMENT_FAILED');
    expect(check({ TransactionType: 'OfferCreate' }).findings).toContain('NOT_A_PAYMENT');
  });
  it('detects destination and unexpected or missing destination tag', () => {
    expect(check({ Destination: other }).findings).toContain('DESTINATION_MISMATCH');
    expect(check({ DestinationTag: 0 }).findings).toContain('DESTINATION_TAG_MISMATCH');
    expect(check({}, { ...invoice, destination_tag: 0 }).findings).toContain('DESTINATION_TAG_MISMATCH');
    expect(check({ DestinationTag: 0 }, { ...invoice, destination_tag: 0 }).status).toBe('MATCHED');
  });
  it('flags partial-payment permission conservatively even when amounts match', () => expect(check({ Flags: 0x20000 }).findings).toContain('PARTIAL_PAYMENT_FLAG'));
  it('compares native drops exactly', () => {
    expect(check({ meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '999999' } }).findings).toContain('UNDERPAYMENT');
    expect(check({ meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1000001' } }).findings).toContain('OVERPAYMENT');
  });
  const issued = { ...invoice, asset: { kind: 'issued', currency: 'USD', issuer: other }, expected_amount: '9007199254740993.0000000000000001' };
  const issuedResult = value => ({ meta: { TransactionResult: 'tesSUCCESS', delivered_amount: { currency: 'USD', issuer: other, value } } });
  it('does not lose issued-asset precision beyond IEEE safe integers', () => {
    expect(check(issuedResult(issued.expected_amount), issued).status).toBe('MATCHED');
    expect(check(issuedResult('9007199254740993.0000000000000000'), issued).findings).toContain('UNDERPAYMENT');
  });
  it('compares scientific ledger values exactly', () => expect(check(issuedResult('1e-16'), { ...issued, expected_amount: '0.0000000000000001' }).status).toBe('MATCHED'));
  it('requires exact issuer and raw currency identity', () => {
    expect(check(issuedResult('1')).findings).toContain('ASSET_MISMATCH');
    const patch = issuedResult('1'); patch.meta.delivered_amount.issuer = address;
    expect(check(patch, issued).findings).toContain('ASSET_MISMATCH');
    patch.meta.delivered_amount.issuer = other; patch.meta.delivered_amount.currency = 'usd';
    expect(check(patch, issued).findings).toContain('ASSET_MISMATCH');
  });
  it.each(['0', '-1', '1e99999999', 'NaN', '1,000', 1])('rejects invalid expected amount: %s', expected_amount => expect(() => validateExpectation({ ...invoice, expected_amount })).toThrow());
  it('rejects checksum-invalid addresses, bad tags and excess XRP precision', () => {
    expect(() => validateExpectation({ ...invoice, destination: address.slice(0, -1) + '2' })).toThrow();
    for (const destination_tag of [-1, 1.2, '1', 4294967296]) expect(() => validateExpectation({ ...invoice, destination_tag })).toThrow();
    expect(() => validateExpectation({ ...invoice, expected_amount: '0.0000001' })).toThrow();
  });
});

// Archived public ledger evidence; not a current market or network observation.
import { readFileSync } from 'node:fs';
it('reconciles the archived partial-payment fixture against delivery, not Amount', () => {
  const archive = JSON.parse(readFileSync(new URL('./fixtures/account-tx-solo-107587061.json', import.meta.url), 'utf8'));
  const entry = archive.transactions.find(e => e.tx.TransactionType === 'Payment' && (e.tx.Flags & 0x20000));
  expect(entry).toBeTruthy();
  const actual = entry.meta.delivered_amount;
  const expectation = { invoice_id: 'ARCHIVED-PUBLIC-FIXTURE', destination: entry.tx.Destination, ...(entry.tx.DestinationTag === undefined ? {} : { destination_tag: entry.tx.DestinationTag }), expected_amount: actual.value, asset: { kind: 'issued', currency: actual.currency, issuer: actual.issuer } };
  const result = evaluateSettlement(expectation, { ...entry.tx, validated: entry.validated, meta: entry.meta }, entry.tx.hash);
  expect(result.delivered.value).toBe(actual.value);
  expect(result.findings).toEqual(['PARTIAL_PAYMENT_FLAG']);
});
