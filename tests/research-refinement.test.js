import { describe, it, expect } from 'vitest';
import { evaluateCase, stageFinding } from '../site/assets/research-case-model.js';
import { renderOperationalStatus, renderResearchCase } from '../api/_lib/research-refinement.js';
import { researchTimestamp } from '../scripts/build-newsroom.mjs';
describe('simulated research decisions', () => {
 it('retains review when amount matches but issuer authority needs review', () => { const r=evaluateCase('review'); expect(r.amount_matches).toBe(true); expect(r.decision).toBe('HOLD'); });
 it('blocks a confirmed mismatch and keeps unavailable evidence unknown', () => { expect(evaluateCase('short').decision).toBe('NO-GO'); const r=evaluateCase('unknown'); expect(r.amount_matches).toBe(null); expect(r.ledger_reference).toBe(null); expect(r.decision).toBe('HOLD'); });
 it('cannot turn a sample into legal clearance or a real receipt', () => { for(const id of ['review','short','unknown']) { const r=evaluateCase(id); expect(r.simulated).toBe(true); expect(r.policy.legal_compliance_determined).toBe(false); expect(r.policy.travel_rule_status).toBe('NOT_EVALUATED'); expect(r.liquidity.execution_guaranteed).toBe(false); for(let n=0;n<6;n++) expect(stageFinding(r,n).evidence).toBeTruthy(); } expect(()=>evaluateCase('__proto__')).toThrow(); });
 it('renders all six findings without JavaScript', () => { expect(renderResearchCase().match(/data-case-step/g)).toHaveLength(6); });
});
describe('source transparency', () => {
 it('does not fabricate a latest release if the feed is missing', () => { expect(renderOperationalStatus(null)).toContain('Unavailable'); expect(renderOperationalStatus({tag:'<script>',at:'invalid'})).not.toContain('<script>'); });
 it('shows an evidenced release and exact UTC timestamps', () => { expect(renderOperationalStatus({tag:'v1.0.27',at:'2026-11-04T02:41:45Z',prerelease:false})).toContain('v1.0.27'); expect(researchTimestamp('2026-11-13T09:12:00Z')).toContain('09:12 UTC'); expect(researchTimestamp(null)).toContain('unknown'); });
});
