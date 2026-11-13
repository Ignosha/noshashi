// Illustrative teaching data only. No addresses, transactions or legal thresholds.
export const CASES = Object.freeze({
  review: { label: 'Matched amount / issuer review', delivered: '1000', available: true },
  short: { label: 'Underpayment / exception', delivered: '950', available: true },
  unknown: { label: 'Missing evidence / unresolved', delivered: null, available: false },
});
export const STAGES = ['Transaction received', 'Delivered amount checked', 'Issuer authority examined', 'Liquidity conditions assessed', 'Example policy evaluated', 'Evidence report generated'];
export function evaluateCase(id = 'review') {
  if (!Object.hasOwn(CASES, id)) throw new Error('Unknown sample case');
  const c = CASES[id], expected = '1000';
  const amountMatches = c.available ? BigInt(c.delivered) === BigInt(expected) : null;
  const decision = amountMatches === false ? 'NO-GO' : 'HOLD';
  return {
    schema: 'noshashi.simulated-research-case.v1', simulated: true,
    case_id: 'XRPL-001', scenario: id, transaction_reference: 'SIMULATED/TX-001',
    ledger_reference: c.available ? 'SIMULATED/LEDGER-001' : null,
    expected: { asset: 'SIM-USD', amount: expected },
    delivered: c.delivered, amount_matches: amountMatches,
    issuer: { reference: 'SIMULATED/ISSUER-001', freeze_retained: true },
    liquidity: { quoted: '5000', funded: '1500', requested_size: '1000', units: 'SIM-USD', execution_guaranteed: false },
    policy: { id: 'EXAMPLE-ONLY', require_amount_match: true, review_retained_freeze: true, travel_rule_status: 'NOT_EVALUATED', legal_compliance_determined: false },
    decision, reason: amountMatches === false ? 'Delivered amount differs from the sample expectation.' : amountMatches === null ? 'Payment evidence is unavailable; retain an unresolved state.' : 'Sample amount matches; retained issuer freeze requires human review under this example policy.',
    limits: ['All values and findings are simulated.', 'No network request, real policy change or on-chain enforcement.', 'Sample rules are not law; no Travel Rule threshold is represented.', 'Public-node evidence in the real tools does not independently verify consensus.', 'A hash is not a digital signature.'],
  };
}
export function stageFinding(r, index) {
  return [
    { status: 'SAMPLE', evidence: `${r.transaction_reference} · expected ${r.expected.amount} ${r.expected.asset}`, finding: 'A synthetic payment enters the case file. No real wallet or transaction is represented.' },
    { status: r.amount_matches === null ? 'UNKNOWN' : r.amount_matches ? 'MATCH' : 'EXCEPTION', evidence: r.delivered === null ? 'Delivered evidence unavailable' : `Delivered ${r.delivered} / expected ${r.expected.amount} ${r.expected.asset}`, finding: 'Compare the actual delivered field with the expectation. Missing evidence stays unknown.' },
    { status: 'REVIEW', evidence: 'Freeze retained · simulated issuer', finding: 'A retained permission is a control to investigate, not proof of reserves, misconduct or investment quality.' },
    { status: 'SAMPLE', evidence: `Quoted ${r.liquidity.quoted} / funded ${r.liquidity.funded} ${r.expected.asset}`, finding: 'Quoted offers and funded depth differ. Even funded depth is a snapshot, not an execution promise.' },
    { status: r.decision, evidence: 'EXAMPLE-ONLY · amount match + retained-freeze review', finding: `${r.reason} Travel Rule and legal compliance are not evaluated.` },
    { status: 'SIMULATED', evidence: 'Local JSON report · sample findings and limitations', finding: 'Keep expectations, observations, unknowns and the example decision together. Export stays in your browser.' },
  ][index];
}
