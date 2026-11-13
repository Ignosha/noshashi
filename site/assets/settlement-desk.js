const form = document.querySelector('#sd-form');
const message = document.querySelector('#sd-message');
const list = document.querySelector('#sd-cases');
const cases = [];
let filter = 'ALL';
const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
const readable = value => value.replaceAll('_', ' ').toLowerCase();
const assetLabel = asset => asset.kind === 'xrp' ? 'XRP' : `${asset.currency} · issuer ${asset.issuer}`;
document.querySelector('#sd-kind').addEventListener('change', event => {
  const issued = document.querySelector('#sd-issued');
  issued.hidden = issued.disabled = event.target.value !== 'issued';
});
function render() {
  list.replaceChildren();
  document.querySelector('#sd-count').textContent = `${cases.length} check${cases.length === 1 ? '' : 's'}`;
  const visible = cases.filter(c => filter === 'ALL' || (filter === 'ATTENTION' ? c.report.status !== 'MATCHED' || duplicate(c) : c.report.status === 'MATCHED' && !duplicate(c)));
  if (!visible.length) { list.append(node('p', cases.length ? 'No checks match this filter.' : 'No payments checked yet.', 'sd-empty')); return; }
  for (const c of visible.toReversed ? visible.toReversed() : [...visible].reverse()) {
    const report = c.report, article = node('article', undefined, 'sd-case');
    article.dataset.status = duplicate(c) ? 'EXCEPTION' : report.status;
    article.append(node('p', duplicate(c) ? 'EXCEPTION · DUPLICATE PAYMENT REFERENCE' : report.status, 'sd-status'), node('h3', c.input.expectation.invoice_id));
    if (duplicate(c)) article.append(node('p', 'This transaction appears in more than one check. Reconcile allocation manually; do not credit it twice.', 'sd-warning'));
    article.append(node('p', (report.findings || ['EVIDENCE_UNAVAILABLE']).map(readable).join(' · ')));
    const details = node('dl');
    for (const [key, value] of [
      ['Expected', `${c.input.expectation.expected_amount} ${assetLabel(c.input.expectation.asset)}`],
      ['Delivered', report.delivered ? `${report.delivered.value} ${assetLabel(report.delivered.asset)}` : 'Unknown — no match established'],
      ['Destination', c.input.expectation.destination],
      ['Tag', c.input.expectation.destination_tag ?? 'Absent'],
      ['Transaction', c.input.transaction_hash],
      ['Ledger', report.ledger_index ?? 'Unconfirmed'],
      ['Observed', report.observed_at ?? 'No completed observation'],
      ['Node', report.source ?? 'Unavailable'],
    ]) details.append(node('dt', key), node('dd', String(value)));
    article.append(details);
    const reviewLabel = node('label', 'Human review (local session only)');
    const review = node('select');
    for (const text of ['Unreviewed', 'Investigating', 'Reviewed — follow-up needed', 'Reviewed — no further action']) { const option = node('option', text); option.value = text; review.append(option); }
    review.value = c.review;
    review.addEventListener('change', () => { c.review = review.value; c.history.push({ at: new Date().toISOString(), action: 'review', value: c.review }); });
    reviewLabel.append(review); article.append(reviewLabel);
    const noteLabel = node('label', 'Review note (no confidential information)');
    const notes = node('textarea'); notes.maxLength = 1000; notes.value = c.notes;
    notes.addEventListener('change', () => { c.notes = notes.value; c.history.push({ at: new Date().toISOString(), action: 'note', value: c.notes }); });
    noteLabel.append(notes); article.append(noteLabel);
    const evidence = node('details'); evidence.append(node('summary', 'Inspect report & ledger evidence'), node('pre', JSON.stringify(report, null, 2))); article.append(evidence);
    const download = node('button', 'Download evidence JSON'); download.type = 'button';
    download.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ schema: 'noshashi.settlement-review.v1', input: c.input, ledger_report: report, duplicate_payment_in_session: duplicate(c), review: c.review, notes: c.notes, review_history: c.history, warning: 'Reviewer fields are editable local annotations, not authenticated approvals or a tamper-proof audit trail.' }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = `noshashi-settlement-${c.input.transaction_hash.slice(0, 12)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    article.append(download, node('p', 'Ledger evidence is a point-in-time public node read. Review status does not change the ledger result or authorize funds.', 'sd-small'));
    list.append(article);
  }
}
function duplicate(c) { return cases.some(other => other !== c && other.input.transaction_hash === c.input.transaction_hash); }
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  render();
}));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (cases.length >= 25) { message.textContent = 'Session limit reached. Download receipts before reloading.'; return; }
  const data = new FormData(form);
  const expectation = { invoice_id: String(data.get('invoice_id')).trim(), destination: String(data.get('destination')).trim(), expected_amount: String(data.get('expected_amount')).trim(), asset: data.get('kind') === 'xrp' ? { kind: 'xrp' } : { kind: 'issued', currency: String(data.get('currency')).trim(), issuer: String(data.get('issuer')).trim() } };
  if (data.get('destination_tag') !== '') expectation.destination_tag = Number(data.get('destination_tag'));
  const input = { transaction_hash: String(data.get('transaction_hash')).trim().toUpperCase(), expectation };
  if (cases.some(c => JSON.stringify(c.input) === JSON.stringify(input) && c.report.status !== 'UNRESOLVED')) { message.textContent = 'This exact check is already in your queue.'; return; }
  const button = form.querySelector('button[type=submit]'); button.disabled = true;
  message.textContent = 'Reading public ledger evidence…';
  let report;
  try {
    const response = await fetch('/api/settlement-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), cache: 'no-store', signal: AbortSignal.timeout(16000) });
    report = await response.json();
    if (!response.ok) {
      if (response.status !== 503) throw new Error(report.error || 'Check could not be completed');
      report = { ...report, attempted_at: new Date().toISOString() };
    }
    cases.push({ input, report, review: 'Unreviewed', notes: '', history: [{ at: new Date().toISOString(), action: 'check', value: report.status }] });
    message.textContent = report.status === 'UNRESOLVED' ? 'Evidence is unresolved. No payment match established.' : 'Check added. Review the findings and evidence.';
    render();
  } catch (error) { message.textContent = error.name === 'TimeoutError' ? 'The check timed out. No payment match established; try later.' : error.message; }
  finally { button.disabled = false; }
});
window.addEventListener('beforeunload', event => { if (cases.length) { event.preventDefault(); event.returnValue = ''; } });

// Explicitly selected public teaching case: populate only; never auto-submit.
const evaluationId = new URLSearchParams(location.hash.slice(1)).get('evaluation');
if (evaluationId) {
  try {
    const response = await fetch('/assets/settlement-evaluation.json');
    if (!response.ok) throw new Error('Unavailable');
    const pack = await response.json(), c = pack.cases.find(c => c.id === evaluationId && !c.evidence_modified);
    if (!c) throw new Error('Unsupported teaching case');
    const e = c.expectation;
    for (const [key, value] of Object.entries({ invoice_id: e.invoice_id, transaction_hash: pack.source.transaction_hash, destination: e.destination, destination_tag: e.destination_tag ?? '', expected_amount: e.expected_amount, kind: e.asset.kind, currency: e.asset.currency ?? '', issuer: e.asset.issuer ?? '' })) form.elements.namedItem(key).value = String(value);
    document.querySelector('#sd-kind').dispatchEvent(new Event('change'));
    message.textContent = 'Synthetic invoice expectation loaded for a public archived transaction. Submit to fetch actual ledger evidence. No real invoice problem is claimed.';
  } catch { message.textContent = 'Teaching case could not load. Enter an expectation manually; nothing has been checked.'; }
}
