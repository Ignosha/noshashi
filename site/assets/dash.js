/* The comparison uses the same bounded, fail-closed receipt path as the
 * first investigation. Each row is its own issuer/ledger/scope; no maximum
 * ledger or cross-request digest is presented as a shared snapshot. */
import { readVerifiedAuthority, authorityReadMessage, downloadCertificate } from './desk-experience-core.mjs?v=20261101-first-use';

const date = document.getElementById('rh-date');
if (date) date.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const table = document.getElementById('rh-issuers');
if (table) {
  const rows = [...table.querySelectorAll('tbody tr[data-issuer]')];
  const retryAll = document.getElementById('rh-t1-retry');
  const status = document.getElementById('rh-t1-l');
  function summary() {
    const pending = rows.filter(row => row.dataset.state === 'reading').length;
    const verified = rows.filter(row => row.dataset.state === 'verified').length;
    const failed = rows.filter(row => row.dataset.state === 'unavailable').length;
    table.setAttribute('aria-busy', String(pending > 0));
    retryAll.disabled = pending > 0;
    status.textContent = pending
      ? `${pending} issuer readings pending; ${verified} verified. Each request is limited to 20 seconds.`
      : `${verified} of ${rows.length} issuer receipts verified. ${failed ? `${failed} unavailable; retry those readings.` : 'Each row names its own ledger and read time.'} This is not a simultaneous snapshot.`;
  }
  async function readRow(row) {
    if (row.dataset.state === 'reading') return;
    row.dataset.state = 'reading';
    row.setAttribute('aria-busy', 'true');
    row.querySelectorAll('td[data-c]').forEach(cell => { cell.textContent = cell.dataset.c === 'record' ? 'Reading…' : 'Pending'; cell.className = ''; });
    summary();
    const record = row.querySelector('[data-c=record]');
    try {
      const { certificate, provenance } = await readVerifiedAuthority(row.dataset.issuer);
      row.querySelectorAll('td[data-c]').forEach(cell => {
        if (cell.dataset.c === 'record') return;
        if (cell.dataset.c === 'verdict') { cell.textContent = certificate.verdict.replaceAll('-', ' '); return; }
        const check = certificate.checks.find(item => item.id === cell.dataset.c);
        cell.textContent = !check || check.state === 'INSUFFICIENT_DATA' ? 'Not established' : check.state === 'NOT_APPLICABLE' ? 'Not applicable' : check.passed ? 'Yes' : 'No';
      });
      record.replaceChildren();
      const ledger = document.createElement('p');
      ledger.textContent = `Validated ledger ${certificate.ledgerIndex.toLocaleString('en-US')} · rules ${certificate.rulesVersion}`;
      const freshness = document.createElement('p');
      freshness.textContent = `${provenance.stale ? 'Stale' : provenance.cached ? 'Cached' : 'Recorded'} · ${new Date(certificate.evaluatedAt).toISOString()}`;
      const details = document.createElement('details');
      const title = document.createElement('summary'); title.textContent = 'Inspect receipt (SHA-256)';
      const subject = document.createElement('p'); subject.textContent = 'Issuer: ' + certificate.issuer;
      const scope = document.createElement('p'); scope.textContent = provenance.label;
      const digest = document.createElement('code'); digest.textContent = certificate.digest;
      const explanation = document.createElement('p'); explanation.textContent = 'Canonical payload hash matches; not a digital signature or independent node confirmation. JSON includes all findings and any abstentions.';
      const download = document.createElement('button'); download.type = 'button'; download.dataset.downloadIssuer = '';
      download.textContent = 'Download this JSON'; download.addEventListener('click', () => downloadCertificate(certificate));
      const certificateLink = document.createElement('a');
      certificateLink.href = '/certificate/?issuer=' + encodeURIComponent(row.dataset.issuer);
      certificateLink.textContent = 'Certificate tool (new read)';
      details.append(title, subject, scope, digest, explanation, download, certificateLink);
      record.append(ledger, freshness, details);
      row.dataset.state = 'verified';
    } catch (error) {
      row.querySelectorAll('td[data-c]').forEach(cell => { cell.textContent = 'Not read'; cell.className = 'na'; });
      record.textContent = authorityReadMessage(error);
      row.dataset.state = 'unavailable';
    } finally {
      const retry = document.createElement('button'); retry.type = 'button'; retry.dataset.retryIssuer = '';
      retry.textContent = row.dataset.state === 'verified' ? 'Read again' : 'Retry issuer';
      retry.setAttribute('aria-label', `${retry.textContent}: ${row.querySelector('th').textContent.trim()}`);
      retry.addEventListener('click', () => readRow(row));
      record.append(retry);
      row.removeAttribute('aria-busy');
      summary();
    }
  }
  retryAll.addEventListener('click', () => rows.forEach(readRow));
  rows.forEach(readRow);
}
