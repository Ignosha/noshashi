import { isValidClassicAddress } from 'ripple-address-codec';
export const RULE_VERSION = 'settlement-exceptions.v1';
export const HASH = /^[A-Fa-f0-9]{64}$/;
const currency = value => /^[a-fA-F0-9]{40}$/.test(value) ? value.toUpperCase() : value;
// Bounded, exact coefficients; no floating-point amounts.
function decimal(value, scientific = false) {
  if (typeof value !== 'string' || value.length > 180) throw new Error('Invalid decimal');
  const m = value.match(scientific ? /^(\d{1,96})(?:\.(\d{1,96}))?(?:[eE]([+-]?\d{1,3}))?$/ : /^(\d{1,96})(?:\.(\d{1,96}))?$/);
  if (!m) throw new Error('Use a positive decimal string, without separators');
  const exponent = Number(m[3] || 0), scale = (m[2] || '').length - exponent;
  if (Math.abs(exponent) > 96 || scale > 96 || scale < -96) throw new Error('Decimal out of range');
  return BigInt(m[1] + (m[2] || '')) * 10n ** BigInt(96 - scale);
}
export function validateExpectation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expectation required');
  const { invoice_id, destination, destination_tag, expected_amount, asset } = input;
  if (typeof invoice_id !== 'string' || !invoice_id.trim() || invoice_id.length > 80 || /[\x00-\x1f]/.test(invoice_id)) throw new Error('Invoice reference must be 1–80 characters');
  if (typeof destination !== 'string' || !isValidClassicAddress(destination)) throw new Error('Valid classic destination required');
  if (destination_tag !== undefined && (!Number.isInteger(destination_tag) || destination_tag < 0 || destination_tag > 4294967295)) throw new Error('Destination tag must be an unsigned 32-bit integer');
  if (decimal(expected_amount) <= 0n) throw new Error('Expected amount must be positive');
  if (!asset || !['xrp', 'issued'].includes(asset.kind)) throw new Error('Choose XRP or an issued asset');
  if (asset.kind === 'xrp' && (expected_amount.split('.')[1] || '').length > 6) throw new Error('XRP supports at most six decimal places');
  let normalizedAsset = { kind: 'xrp' };
  if (asset.kind === 'issued') {
    if (typeof asset.currency !== 'string' || !/^(?:[A-Za-z0-9?!@#$%^&*<>(){}\[\]|]{3}|[A-Fa-f0-9]{40})$/.test(asset.currency) || asset.currency === 'XRP' || /^0{40}$/.test(asset.currency)) throw new Error('Use the raw issued currency code (not XRP)');
    if (typeof asset.issuer !== 'string' || !isValidClassicAddress(asset.issuer)) throw new Error('Valid issuer required');
    normalizedAsset = { kind: 'issued', currency: currency(asset.currency), issuer: asset.issuer };
  }
  return { invoice_id: invoice_id.trim(), destination, ...(destination_tag === undefined ? {} : { destination_tag }), expected_amount, asset: normalizedAsset };
}
function delivered(raw) {
  if (typeof raw === 'string' && /^\d{1,30}$/.test(raw)) {
    const padded = raw.padStart(7, '0');
    return { asset: { kind: 'xrp' }, value: `${padded.slice(0, -6)}.${padded.slice(-6)}` };
  }
  if (raw && typeof raw === 'object' && typeof raw.currency === 'string' && typeof raw.issuer === 'string') {
    decimal(raw.value, true);
    return { asset: { kind: 'issued', currency: currency(raw.currency), issuer: raw.issuer }, value: raw.value };
  }
  throw new Error('Delivered amount unavailable or unsupported');
}
export function evaluateSettlement(expectation, result, hash) {
  const invoice = validateExpectation(expectation), tx = result.tx_json || result;
  const base = { rule_version: RULE_VERSION, transaction_hash: hash, expectation: invoice, ledger_index: result.ledger_index ?? tx.ledger_index ?? null, validated: result.validated === true, findings: [], delivered: null };
  const outcome = (status, code) => ({ ...base, status, findings: [...base.findings, code] });
  const returnedHash = result.hash ?? tx.hash;
  if (!returnedHash || returnedHash.toUpperCase() !== hash.toUpperCase()) return outcome('UNRESOLVED', 'TRANSACTION_ID_UNCONFIRMED');
  if (result.validated !== true || !Number.isSafeInteger(base.ledger_index) || base.ledger_index <= 0) return outcome('UNRESOLVED', 'VALIDATED_LEDGER_UNCONFIRMED');
  if (tx.TransactionType !== 'Payment') return outcome('EXCEPTION', 'NOT_A_PAYMENT');
  const meta = result.meta;
  if (!meta || typeof meta !== 'object' || typeof meta.TransactionResult !== 'string') return outcome('UNRESOLVED', 'RESULT_UNAVAILABLE');
  if (meta.TransactionResult !== 'tesSUCCESS') return outcome('EXCEPTION', 'PAYMENT_FAILED');
  if (tx.Destination !== invoice.destination) base.findings.push('DESTINATION_MISMATCH');
  if (tx.DestinationTag !== invoice.destination_tag) base.findings.push('DESTINATION_TAG_MISMATCH');
  try { base.delivered = delivered(meta.delivered_amount); }
  catch { return outcome('UNRESOLVED', 'DELIVERED_AMOUNT_UNAVAILABLE'); }
  const actual = base.delivered.asset;
  if (actual.kind !== invoice.asset.kind || (actual.kind === 'issued' && (actual.currency !== invoice.asset.currency || actual.issuer !== invoice.asset.issuer))) base.findings.push('ASSET_MISMATCH');
  else {
    const difference = decimal(base.delivered.value, true) - decimal(invoice.expected_amount);
    if (difference < 0n) base.findings.push('UNDERPAYMENT');
    if (difference > 0n) base.findings.push('OVERPAYMENT');
  }
  if ((Number(tx.Flags || 0) & 0x00020000) !== 0) base.findings.push('PARTIAL_PAYMENT_FLAG');
  return { ...base, status: base.findings.length ? 'EXCEPTION' : 'MATCHED', findings: base.findings.length ? base.findings : ['EXACT_LEDGER_MATCH'] };
}
