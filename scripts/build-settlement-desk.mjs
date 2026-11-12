import { renderPage } from '../api/_lib/shell.js';
export const SETTLEMENT_PAGES = [['/settlement-desk/', 'monthly', '0.8']];
export async function buildSettlementDesk(write) {
  await write('settlement-desk/index.html', renderPage({
    title: 'Settlement Exception Desk · NOSHASHI LABS',
    description: 'Compare invoice expectations with public XRPL delivered-payment evidence. Review exceptions and export a ledger evidence receipt.',
    path: '/settlement-desk/',
    head: '<link rel="stylesheet" href="/assets/settlement-desk.css">',
    scripts: '<script type="module" src="/assets/settlement-desk.js"></script>',
    body: `<div class="settlement-desk">
      <div class="sd-masthead"><a href="/">NOSHASHI LABS</a><span>LEDGER DESK / PAYMENT OPERATIONS</span><span>PUBLIC BETA · MAINNET</span></div>
      <header class="sd-hero"><div><p class="sd-kicker">FROM PAYMENT TO EVIDENCE</p><h1>Settlement<br><em>Exception Desk.</em></h1><p class="sd-intro">What was expected. What arrived.<br>What needs a second look.</p><p>Compare an invoice with public XRPL payment evidence. Keep the amount, destination and asset in view before a human decides the next step.</p><a href="#new-case" class="sd-button">Review a payment ↓</a></div><aside class="sd-flow" aria-label="Review workflow"><span>01 / EXPECTATION</span><strong>Invoice & destination</strong><i>↓</i><span>02 / LEDGER EVIDENCE</span><strong>Actual delivered amount</strong><i>↓</i><span>03 / HUMAN DECISION</span><strong>Exception → Review → Receipt</strong><p>Read-only. No keys. No transaction signing.</p></aside></header>
      <div class="sd-notice">A ledger match is an accounting check, not proof of business authorization, compliance or legal settlement. This desk cannot block or reverse a payment.</div>
      <section class="sd-workspace"><div class="sd-entry"><p class="sd-kicker">01 / ADD AN EXPECTATION</p><h2 id="new-case">Check one payment</h2><p>Invoice fields are sent to NOSHASHI for this check; only the public transaction hash is sent to a ledger node. Do not enter personal or confidential invoice details.</p>
      <form id="sd-form">
        <label>Invoice reference<input name="invoice_id" required maxlength="80" placeholder="Your internal reference" autocomplete="off"></label>
        <label>Transaction hash<input name="transaction_hash" required pattern="[a-fA-F0-9]{64}" maxlength="64" spellcheck="false" placeholder="64 hexadecimal characters"></label>
        <label>Expected destination<input name="destination" required maxlength="35" spellcheck="false" placeholder="Classic XRPL address · r…"></label>
        <div class="sd-fields"><label>Destination tag (optional)<input name="destination_tag" inputmode="numeric" pattern="[0-9]+" maxlength="10" placeholder="Leave blank if absent"></label><label>Asset<select name="kind" id="sd-kind"><option value="xrp">Native XRP</option><option value="issued">Issued asset</option></select></label></div>
        <fieldset id="sd-issued" hidden disabled><legend>Exact issued-asset identity</legend><label>Raw currency code<input name="currency" required maxlength="40" placeholder="USD or 40-character hex code"></label><label>Issuer address<input name="issuer" required maxlength="35" spellcheck="false" placeholder="Classic issuer address · r…"></label></fieldset>
        <label>Expected amount<input name="expected_amount" required inputmode="decimal" pattern="[0-9]+(\\.[0-9]+)?" maxlength="180" placeholder="Decimal amount, without commas"></label>
        <button class="sd-button" type="submit">Compare with ledger</button><p id="sd-message" role="status" aria-live="polite"></p>
      </form><p class="sd-small">Up to 25 checks per page session. The queue is held in memory and clears on reload. Download receipts before leaving. Nothing is automatically credited or approved.</p></div>
      <section class="sd-queue" aria-labelledby="queue-title"><div class="sd-queue-heading"><div><p class="sd-kicker">02 / REVIEW WORKLIST</p><h2 id="queue-title">Evidence before decisions.</h2></div><span id="sd-count">0 checks</span></div><div class="sd-filters" role="group" aria-label="Filter checks"><button data-filter="ALL" aria-pressed="true">All</button><button data-filter="ATTENTION" aria-pressed="false">Needs attention</button><button data-filter="MATCHED" aria-pressed="false">Matched</button></div><div id="sd-cases"><div class="sd-empty"><span>—</span><h3>No payments checked yet.</h3><p>Add an invoice expectation and transaction hash. Actual results appear here, with the responding node and observation time.</p></div></div></section></section>
      <section class="sd-next"><p class="sd-kicker">BUILD THE OPERATING WORKFLOW</p><h2>Start with a scoped evaluation.</h2><p>Bring a small, non-sensitive payment sample and define the exceptions your team needs to review. Shared approvals, integration, monitoring and service commitments require separately agreed scope.</p><div class="sd-links"><a href="/design-partners/#apply">Discuss a pilot ↗</a><a href="/delivered/">Delivered-payment export ↗</a><a href="/certificate/">Issuer controls ↗</a><a href="/book-health/">Liquidity snapshot ↗</a></div></section>
    </div>`,
  }));
}
