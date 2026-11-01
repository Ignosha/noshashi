/* Editorial enhancement. Geometry is explanatory; records come from /api/authority. */
(function () {
  'use strict';
  if (!document.body.hasAttribute('data-ledger-editorial')) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.documentElement.classList.add('ed-ready');
  var seal = document.querySelector('.ed-seal');
  var stage = document.querySelector('.ed-seal-stage');
  if (stage && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    stage.addEventListener('pointermove', function (e) {
      if (reduce.matches) return;
      var r = stage.getBoundingClientRect();
      stage.style.setProperty('--seal-x', ((.5 - (e.clientY - r.top) / r.height) * 8).toFixed(2) + 'deg');
      stage.style.setProperty('--seal-y', (((e.clientX - r.left) / r.width - .5) * 8).toFixed(2) + 'deg');
    });
    stage.addEventListener('pointerleave', function () {
      stage.style.setProperty('--seal-x', '0deg');
      stage.style.setProperty('--seal-y', '0deg');
    });
  }
  window.addEventListener('noshashi:ledger', function (e) {
    if (!seal || !e.detail || !Number.isInteger(e.detail.index)) return;
    seal.setAttribute('data-connected', '');
    seal.querySelector('[data-ed-seal-status]').textContent = 'Ledger ' + e.detail.index.toLocaleString('en-US') + ' / validated';
  });
  window.addEventListener('noshashi:stream', function (e) {
    if (!seal || e.detail && e.detail.live) return;
    seal.removeAttribute('data-connected');
    seal.querySelector('[data-ed-seal-status]').textContent = 'Reconnecting to the ledger';
  });

  var topics = [
    ['Issuer account', 'Start with who holds the power.', 'Account flags, keys and signer lists reveal which controls the issuer retains. Read those powers before reading the promise.', '/certificate/', 'Inspect issuer controls'],
    ['Holders', 'A balance comes with conditions.', 'Freeze, clawback and authorisation affect what a holder can do. NOSHASHI distinguishes powers an issuer retains from actions it has actually taken.', '/certificate/', 'Read an issuer’s state'],
    ['Order book', 'A quote is not a guarantee of depth.', 'Compare what is advertised with what offer owners can fund at the ledger read. The gap is liquidity that exists only on paper.', '#rh-f1', 'Explore quoted and fillable depth'],
    ['Payments', 'Credit what actually arrived.', 'The requested amount and the delivered amount can differ. NOSHASHI reads the delivered amount of a validated payment, including partial payments.', '/delivered/', 'Inspect a delivered amount'],
    ['Counterparties', 'Follow the relationship outward.', 'Counterparty screening looks beyond the immediate sender, up to three hops back. Coverage and limits belong alongside the finding.', '/enterprise/', 'Explore counterparty screening']
  ];
  var controls = document.querySelector('.ed-ring-controls');
  var detail = document.querySelector('.ed-ring-detail');
  if (controls && detail) controls.addEventListener('click', function (e) {
    var button = e.target.closest('[data-ed-ring]');
    if (!button || button.getAttribute('aria-pressed') === 'true') return;
    var n = Number(button.dataset.edRing), t = topics[n];
    if (!t) return;
    controls.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
    detail.querySelector('[data-ed-ring-label]').textContent = '0' + (n + 1) + ' / ' + t[0];
    detail.querySelector('[data-ed-ring-title]').textContent = t[1];
    detail.querySelector('[data-ed-ring-copy]').textContent = t[2];
    var link = detail.querySelector('[data-ed-ring-link]');
    link.href = t[3]; link.firstChild.textContent = t[4] + ' ';
    detail.classList.remove('is-changing');
    if (!reduce.matches) { void detail.offsetWidth; detail.classList.add('is-changing'); }
    window.dispatchEvent(new CustomEvent('noshashi:ring-focus', { detail: { index: n } }));
  });

  var receipt = document.querySelector('.ed-receipt');
  if (!receipt) return;
  var issuer = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
  var busy = false;
  function text(selector, value) { receipt.querySelector(selector).textContent = value; }
  function unavailable() {
    receipt.dataset.state = 'unavailable';
    receipt.removeAttribute('aria-busy');
    receipt.removeAttribute('data-verdict');
    text('[data-ed-verdict]', 'Not read');
    text('[data-ed-record-status]', 'The issuer could not be read. No verdict or fingerprint is shown.');
    receipt.querySelector('.ed-retry').hidden = false;
  }
  function read() {
    if (busy) return;
    busy = true;
    receipt.setAttribute('aria-busy', 'true');
    text('[data-ed-record-status]', 'Reading validated issuer state…');
    receipt.querySelector('.ed-retry').hidden = true;
    fetch('/api/authority?issuer=' + issuer, { signal: AbortSignal.timeout(20000) })
      .then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); })
      .then(function (c) {
        // Never turn a failed or partial authority read into a plausible receipt.
        if (c.issuer !== issuer || !Number.isInteger(c.ledgerIndex) || c.ledgerIndex <= 0 || !Array.isArray(c.checks) || !/^[a-f0-9]{64}$/i.test(c.digest) || !['go','hold','no-go'].includes(c.verdict) || !Number.isFinite(Date.parse(c.evaluatedAt)) || c.unreadable && c.unreadable.length || c.checks.some(function (k) { return k.id === 'AUTHORITY_READABLE' && !k.passed; })) throw new Error('incomplete');
        text('[data-ed-ledger]', c.ledgerIndex.toLocaleString('en-US'));
        text('[data-ed-rules]', c.rulesVersion || 'Not provided');
        text('[data-ed-verdict]', c.verdict.replace(/-/g, ' '));
        receipt.dataset.verdict = c.verdict;
        receipt.querySelectorAll('[data-ed-check]').forEach(function (el) {
          var check = c.checks.find(function (k) { return k.id === el.dataset.edCheck; });
          el.textContent = !check || check.state === 'INSUFFICIENT_DATA' ? 'Not read' : check.passed ? 'Yes' : 'No';
        });
        text('[data-ed-digest]', c.digest);
        text('[data-ed-record-status]', 'Read ' + new Date(c.evaluatedAt).toLocaleString('en-GB', { timeZone:'UTC', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) + ' UTC. Scope: issuer authority.');
        receipt.dataset.state = 'read';
        receipt.removeAttribute('aria-busy');
      }).catch(unavailable).finally(function () { busy = false; });
  }
  receipt.querySelector('.ed-retry').addEventListener('click', read);
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      observer.disconnect(); read();
    }, { rootMargin: '200px' });
    observer.observe(receipt);
  } else read();
})();
