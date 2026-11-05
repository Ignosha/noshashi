(function () {
  'use strict';
  var SERVICE_URL = 'https://noshashi-operator.joshedmond18.workers.dev';
  var ALLOWED = ['status', 'run', 'report', 'billing-sync', 'save-connection', 'disconnect', 'connection-status', 'open-secure-setup'];
  var pending = new Map(), sequence = 0, connected = false, busy = false, retryAction = 'connection-status';
  var ids = ['run', 'refresh', 'billing', 'send-report', 'secure-setup', 'disconnect'];
  var messages = {
    unauthorized: 'The saved access token was not accepted. Connect again with your current operator token.',
    keychain_access_denied: 'macOS did not allow Keychain access. Check the Keychain prompt, then retry.',
    keychain_error: 'The token could not be saved in macOS Keychain. Check Keychain access, then retry.',
    network_unavailable: 'The desk could not reach your hosted operator. Check your connection and refresh the status.',
    timeout: 'The request took too long. Refresh the status before trying the action again.',
    operator_unavailable: 'Operator data is unavailable. Refresh the status to check again.',
    native_bridge_unavailable: 'Open this desk inside NOSHASHI Operator for Mac to connect securely.',
    invalid_response: 'The operator returned an incomplete response. Refresh the status to check again.',
    runtime_key_missing: 'Automatic Stripe refresh needs the restricted read-only key in the hosted operator. Open Secure Stripe setup.',
    cancelled: 'The request was cancelled. You can try again when you are ready.'
  };
  function el(id) { return document.getElementById(id); }
  function node(tag, text, className) {
    var value = document.createElement(tag);
    if (text !== undefined && text !== null) value.textContent = String(text);
    if (className) value.className = className;
    return value;
  }
  function safeCount(value) { return Number.isSafeInteger(value) && value >= 0 ? String(value) : '—'; }
  function dateLabel(value) {
    if (!value || typeof value !== 'string') return 'Unknown';
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Unknown';
    return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function money(value) { return typeof value === 'string' && /^\d+\.\d{2}$/.test(value) ? '$' + Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null; }
  function announce(text, error, retry) {
    el('notice-text').textContent = text;
    el('notice').className = error ? 'notice error' : 'notice';
    el('retry').hidden = !retry;
  }
  function setBusy(value) {
    busy = value;
    ids.forEach(function (id) { el(id).disabled = value || !connected; });
    el('connect').disabled = value;
    el('admin-token').disabled = value;
    el('retry').disabled = value;
    el('desk').setAttribute('aria-busy', value ? 'true' : 'false');
  }
  function setConnected(value) {
    connected = value;
    el('connection-label').textContent = value ? 'Private desk connected' : 'Not connected';
    el('connection-panel').hidden = value;
    el('desk').hidden = !value;
    setBusy(busy);
  }
  function clearPrivate() {
    ['task-list', 'stage-list', 'source-list'].forEach(function (id) { el(id).replaceChildren(); });
    ['task-count', 'approval-count'].forEach(function (id) { el(id).textContent = '—'; });
    el('revenue-value').textContent = 'Unknown';
    el('report-text').textContent = 'No report is available.';
    el('report-state').textContent = 'No report returned';
    el('admin-token').value = '';
  }
  function bridge(action, payload) {
    return new Promise(function (resolve, reject) {
      if (ALLOWED.indexOf(action) === -1) { reject(new Error('invalid_action')); return; }
      var handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.operator;
      if (!handler || typeof handler.postMessage !== 'function') { reject(new Error('native_bridge_unavailable')); return; }
      var id = 'operator-' + (++sequence);
      var timer = setTimeout(function () { pending.delete(id); reject(new Error('timeout')); }, 35000);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      try { handler.postMessage({ id: id, action: action, payload: payload || {} }); }
      catch (_) { clearTimeout(timer); pending.delete(id); reject(new Error('native_bridge_unavailable')); }
    });
  }
  window.operatorReceive = function (reply) {
    if (!reply || typeof reply.id !== 'string' || !pending.has(reply.id)) return;
    var claim = pending.get(reply.id); pending.delete(reply.id); clearTimeout(claim.timer);
    if (reply.ok === true) claim.resolve(reply.data);
    else {
      var code = typeof reply.error === 'string' ? reply.error : reply.error && typeof reply.error.code === 'string' ? reply.error.code : '';
      claim.reject(new Error(Object.prototype.hasOwnProperty.call(messages, code) ? code : 'operator_unavailable'));
    }
  };
  function showError(error, action) {
    var code = error && error.message;
    if (code === 'unauthorized') { clearPrivate(); setConnected(false); retryAction = 'connection-status'; }
    else retryAction = action === 'save-connection' ? 'connection-status' : connected ? 'status' : 'connection-status';
    if (!connected) setConnected(false);
    announce(messages[code] || messages.operator_unavailable, true, true);
  }
  function renderRevenue(revenue) {
    revenue = revenue && typeof revenue === 'object' ? revenue : {};
    var labels = { fresh_manual_snapshot: 'Dated manual snapshot. Automatic refresh needs secure setup.', fresh_runtime_snapshot: 'Automatic reading from the live ignosha account.', stale_snapshot: 'This reading is stale. Refresh it before using a current total.', billing_data_unavailable: 'Stripe data is unavailable. A current revenue total is unknown.', not_connected: 'A Stripe reading has not been connected yet.' };
    var fresh = revenue.connected === true && (revenue.status === 'fresh_manual_snapshot' || revenue.status === 'fresh_runtime_snapshot')
      && revenue.stale !== true && dateLabel(revenue.observedAt) !== 'Unknown';
    var current = fresh ? money(revenue.verifiedMonthlyRevenue) : null;
    el('revenue-value').textContent = current || 'Unknown';
    el('billing-state').textContent = labels[revenue.status] || 'A current Stripe reading is unavailable.';
    el('billing-observed').textContent = 'Observed: ' + dateLabel(revenue.observedAt);
  }
  function renderTasks(tasks) {
    var parent = el('task-list'); parent.replaceChildren();
    var bounded = Array.isArray(tasks) ? tasks.slice(0, 20) : [];
    el('task-count').textContent = Array.isArray(tasks) ? String(bounded.length) : '—';
    el('tasks-empty').hidden = bounded.length > 0;
    bounded.forEach(function (task) {
      if (!task || typeof task !== 'object') return;
      var item = node('article', null, 'task'), header = node('div', null, 'task-header');
      header.append(node('h3', typeof task.title === 'string' ? task.title.slice(0, 500) : 'Review item'));
      var kind = task.kind === 'followup_review' ? 'Contact-history review' : task.kind === 'grant_review' ? 'Grant review' : task.kind === 'reply_review' ? 'Reply review' : 'Research review';
      header.append(node('span', kind, 'task-meta')); item.append(header);
      item.append(node('p', task.kind === 'followup_review' ? 'Verify actual contact dates, replies, permission and approval before another contact.' : 'Verify the full source, current evaluator and opportunity score before preparing outreach.', 'fine'));
      var evidence = task.evidence && typeof task.evidence === 'object' ? task.evidence : {};
      var article = evidence.article && typeof evidence.article === 'object' ? evidence.article : {};
      if (typeof article.url === 'string') item.append(node('p', article.url.slice(0, 2048), 'source-url'));
      var detail = node('details'), caption = node('summary', 'Inspect source and review requirements');
      var pre = node('pre', JSON.stringify({ evidence: evidence, reviewRequirements: task.guard || {} }, null, 2).slice(0, 25000));
      detail.append(caption, pre); item.append(detail); parent.append(item);
    });
  }
  function renderStages(stages) {
    var parent = el('stage-list'); parent.replaceChildren();
    var names = { RESEARCH: 'Research', QUALIFIED: 'Qualified records', 'CONTACT READY': 'Contact ready', CONTACTED: 'Contacted', REPLIED: 'Replied', TESTER: 'Testers', MEETING: 'Meetings', PILOT: 'Pilots', NEGOTIATION: 'Negotiations', CUSTOMER: 'Customers', DORMANT: 'Dormant', DISQUALIFIED: 'Disqualified' };
    var list = Array.isArray(stages) ? stages.filter(function (stage) { return stage && Object.prototype.hasOwnProperty.call(names, stage.pipeline_stage) && Number.isSafeInteger(stage.count) && stage.count >= 0; }) : [];
    el('pipeline-empty').hidden = list.length > 0;
    list.forEach(function (stage) { var row = node('div', null, 'stage'); row.append(node('span', names[stage.pipeline_stage]), node('strong', String(stage.count))); parent.append(row); });
  }
  function renderSources(sources) {
    var parent = el('source-list'); parent.replaceChildren();
    var list = Array.isArray(sources) ? sources.slice(0, 30) : [];
    var names = { 'xrplf-rippled': 'XRPLF · rippled releases', 'zodia-custody': 'Zodia Custody', fireblocks: 'Fireblocks', chainalysis: 'Chainalysis', 'trm-labs': 'TRM Labs' };
    el('sources-empty').hidden = list.length > 0;
    el('source-summary').textContent = list.length ? list.length + ' source records' : 'No readings returned';
    list.forEach(function (source) {
      var reading = 'Awaiting first successful check', className = '';
      var observed = source.observed || {};
      if (!source.observed && typeof source.observed_json === 'string') { try { observed = JSON.parse(source.observed_json); } catch (_) { observed = {}; } }
      if (source.last_error) { reading = source.last_error === 'feed_http_429' ? 'Rate limited · retry scheduled' : 'Unavailable · last reading retained'; className = 'state-error'; }
      else if (source.last_success_at) { reading = observed.staleOrUndated ? 'Older or undated feed · review required' : 'Feed read · article verification required'; className = observed.staleOrUndated ? 'state-warning' : ''; }
      var row = node('tr'); row.append(node('td', names[source.source_id] || String(source.source_id || 'Unknown source').slice(0, 120)), node('td', reading, className), node('td', dateLabel(source.last_success_at))); parent.append(row);
    });
  }
  function render(payload) {
    if (!payload || !payload.dashboard || typeof payload.dashboard !== 'object') throw new Error('invalid_response');
    var dashboard = payload.dashboard;
    el('approval-count').textContent = safeCount(dashboard.pendingApprovals);
    renderRevenue(dashboard.revenue); renderTasks(payload.tasks); renderStages(dashboard.stages); renderSources(dashboard.sources);
    var report = payload.latestReport, reportNames = { sent: 'Accepted by mail provider', uncertain: 'Delivery unconfirmed', failed: 'Delivery failed', processing: 'Delivery in progress', manual_review: 'Delivery needs review' };
    el('report-state').textContent = report && reportNames[report.status] ? reportNames[report.status] : 'No delivery confirmation';
    el('report-text').textContent = report && typeof report.text === 'string' ? report.text.slice(0, 30000) : 'No report is available.';
    el('desk-observed').textContent = dateLabel(dashboard.observedAt);
    if (dashboard.observedAt) el('desk-observed').setAttribute('datetime', dashboard.observedAt);
    setConnected(true);
  }
  async function loadConnection() {
    var result = await bridge('connection-status');
    if (!result || result.serviceURL && result.serviceURL !== SERVICE_URL) throw new Error('invalid_response');
    var saved = result.storedToken === true || result.hasSavedToken === true || result.connected === true;
    setConnected(saved);
    if (saved) { render(await bridge('status')); announce('Private desk loaded. Check each reading date before using the evidence.', false, false); }
    else { clearPrivate(); announce('Connect with your operator access token to open the private desk.', false, false); }
  }
  async function act(action) {
    if (busy) return;
    setBusy(true);
    var waiting = { status: 'Loading your private desk…', run: 'Checking one approved research source…', report: 'Checking the founder-report delivery record…', 'billing-sync': 'Reading the selected Stripe account…', 'connection-status': 'Checking the saved connection…', disconnect: 'Removing this Mac’s saved connection…', 'open-secure-setup': 'Opening the secure setup instructions…' };
    announce(waiting[action] || 'Working…', false, false);
    try {
      if (action === 'connection-status') { await loadConnection(); return; }
      if (action === 'disconnect') { await bridge(action); clearPrivate(); setConnected(false); announce('This Mac is disconnected. Hosted research continues on its existing schedule.', false, false); return; }
      if (action === 'open-secure-setup') { await bridge(action); announce('Secure setup instructions opened. Keep the restricted Stripe key in your hosted operator’s secure settings.', false, false); return; }
      var result = action === 'status' ? await bridge('status') : await bridge(action);
      render(action === 'status' ? result : await bridge('status'));
      var status = result && result.status;
      var message = action === 'status' ? 'Private desk refreshed. Source readings and Stripe data each keep their own date.'
        : action === 'billing-sync' ? status === 'runtime_key_missing' ? messages.runtime_key_missing : status === 'refreshed' ? 'Stripe reading refreshed. Check its date and whole-account scope below.' : 'Stripe refresh could not be confirmed. Check the dated reading below.'
        : action === 'run' ? status === 'already_claimed_or_daily_cap' ? 'This scan window has already run or reached its limit. The hosted schedule continues automatically.' : status === 'partial' ? 'The scan completed with an unavailable source. Check source readings and the review queue.' : 'Research check completed. Inspect source readings and review items before contacting anyone.'
        : status === 'sent' ? 'The founder report was accepted by the mail provider. This does not confirm inbox delivery.' : status === 'outside_owner_report_window' ? 'Founder-report delivery is outside its weekday window. The scheduled report remains enabled.' : status === 'uncertain' ? 'Report delivery is unconfirmed. Review the recorded status before another attempt.' : 'Founder-report policy checked. Inspect its recorded delivery status below.';
      announce(message, status === 'uncertain' || status === 'partial', false);
    } catch (error) { showError(error, action); }
    finally { setBusy(false); }
  }
  el('connection-form').addEventListener('submit', async function (event) {
    event.preventDefault(); if (busy) return;
    var token = el('admin-token').value.trim(); el('admin-token').value = '';
    if (token.length < 32 || token.length > 1024 || /\s/.test(token)) { announce('Enter the complete operator access token from your private access file.', true, false); return; }
    setBusy(true); announce('Saving the connection in macOS Keychain…', false, false);
    try { await bridge('save-connection', { token: token }); token = ''; await loadConnection(); }
    catch (error) { showError(error, 'save-connection'); }
    finally { token = ''; setBusy(false); }
  });
  [['run','run'],['refresh','status'],['billing','billing-sync'],['send-report','report'],['disconnect','disconnect'],['secure-setup','open-secure-setup']].forEach(function (pair) { el(pair[0]).addEventListener('click', function () { void act(pair[1]); }); });
  el('retry').addEventListener('click', function () { void act(retryAction); });
  // Keep the trusted local document URL unchanged: native RPC rejects navigation to other documents or fragments.
  var sectionLinks = document.querySelectorAll('a[href^="#"]');
  Array.prototype.forEach.call(sectionLinks, function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var href = link.getAttribute('href');
      if (!/^#(?:overview|reviews|sources|report)$/.test(href || '')) return;
      var target = el(href.slice(1));
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
      Array.prototype.forEach.call(sectionLinks, function (item) { item.className = item === link ? 'nav-item active' : 'nav-item'; });
    });
  });
  void act('connection-status');
}());
