const el = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
const host = document.querySelector('#se-case'), nav = document.querySelector('#se-navigation');
let pack, current, feedbackChanged = false;
const assessments = {};
const download = (data, filename) => { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = el('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
function show(id) {
  const c = pack.cases.find(c => c.id === id); if (!c) return;
  current = id; host.replaceChildren();
  nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.case === id)));
  host.append(el('p', c.evidence_modified ? 'SYNTHETIC SOURCE-FAILURE SIMULATION' : 'SYNTHETIC INVOICE / ARCHIVED PUBLIC PAYMENT', 'se-label'), el('h2', c.title), el('p', c.explanation));
  const asset = c.expectation.asset;
  const facts = el('dl', undefined, 'se-facts');
  for (const [key, value] of [['Invoice expectation', c.expectation.expected_amount + ' issued-asset units'], ['Actual delivered', c.report.delivered?.value ?? 'Unknown in this simulation'], ['Raw asset code', asset.currency], ['Issuer', asset.issuer], ['Expected tag', c.expectation.destination_tag ?? 'Absent'], ['Archived transaction', pack.source.transaction_hash], ['Archived ledger', pack.source.ledger_index]]) facts.append(el('dt', key), el('dd', String(value)));
  host.append(facts);
  const result = el('div', undefined, 'se-result'); result.dataset.status = c.allocation_warning ? 'EXCEPTION' : c.report.status;
  result.append(el('p', c.allocation_warning ? 'ALLOCATION REVIEW REQUIRED' : c.report.status, 'sd-kicker'), el('h3', c.allocation_warning || c.report.findings.map(x => x.replaceAll('_', ' ').toLowerCase()).join(' · ')), el('p', 'Rule output for this evaluation case. A human must determine the accounting or business action.'));
  host.append(result);
  const assessmentLabel = el('label', 'What would your reviewer do? (optional)');
  const assessment = el('select');
  for (const text of ['Choose a decision', 'Request more evidence', 'Investigate a discrepancy', 'Reconcile invoice allocation', 'No discrepancy found', 'Existing system already resolves this']) { const option = el('option', text); option.value = text === 'Choose a decision' ? '' : text; assessment.append(option); }
  assessment.value = assessments[id] || '';
  assessment.addEventListener('change', () => { assessments[id] = assessment.value; feedbackChanged = true; });
  assessmentLabel.append(assessment); host.append(assessmentLabel);
  const details = el('details'); details.append(el('summary', 'Inspect source and rule output'), el('pre', JSON.stringify({ source: pack.source, synthetic_expectation: true, evidence_modified: !!c.evidence_modified, report: c.report, evidence: c.evidence }, null, 2))); host.append(details);
  if (!c.evidence_modified) { const link = el('a', 'Load this expectation in the live desk →', 'se-link'); link.href = '/settlement-desk/#evaluation=' + encodeURIComponent(id); host.append(link); }
  host.append(el('p', 'Source captured 11 October 2026. This page does not make a live node request or assert a real invoice discrepancy.', 'sd-small'));
}
try {
  const response = await fetch('/assets/settlement-evaluation.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Case pack unavailable');
  pack = await response.json();
  for (const c of pack.cases) { const button = el('button', c.title); button.type = 'button'; button.dataset.case = c.id; button.setAttribute('aria-pressed', 'false'); button.addEventListener('click', () => show(c.id)); nav.append(button); }
  show(pack.cases[0].id);
} catch { host.replaceChildren(el('h2', 'Examples unavailable'), el('p', 'The case pack could not be loaded. No result has been established. Try again later.')); }
const form = document.querySelector('#se-feedback-form');
form.addEventListener('input', () => { feedbackChanged = true; });
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!pack) { document.querySelector('#se-feedback-status').textContent = 'Load the case pack before exporting feedback.'; return; }
  download({ schema: 'noshashi.settlement-feedback.v1', created_at: new Date().toISOString(), case_pack: pack.schema, source_hash: pack.source.evidence_sha256, last_viewed_case: current, case_assessments: { ...assessments }, answers: Object.fromEntries(new FormData(form)), privacy: 'User-entered evaluation feedback. No submission, buyer interest or commercial agreement is inferred from this local export.' }, 'noshashi-evaluation-feedback.json');
  feedbackChanged = false;
  document.querySelector('#se-feedback-status').textContent = 'Feedback downloaded. Nothing was sent to NOSHASHI.';
});
window.addEventListener('beforeunload', event => { if (feedbackChanged) { event.preventDefault(); event.returnValue = ''; } });
