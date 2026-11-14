import {parseCommand, completeCommand, PUBLIC_EXAMPLES} from './terminal-commands.js';

const root = document.querySelector('.ct-desktop');
if (root) {
  const $ = id => document.getElementById(id);
  const command = $('ws-command');
  const log = $('ws-log');
  const history = [];
  let historyIndex = 0;
  let draft = '';
  const windows = {console: $('ws-console-window'), evidence: $('ws-evidence-window')};
  const tabs = [...root.querySelectorAll('[data-ws-tab]')];

  function print(text, style = 'ws-output') {
    const line = document.createElement('p');
    line.className = style;
    line.textContent = text;
    log.append(line);
    while (log.children.length > 80) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  function updateWindows(active) {
    for (const [name, panel] of Object.entries(windows)) {
      panel.dataset.active = String(name === active && !panel.hidden);
      panel.inert = panel.hidden || (!!root.querySelector('.ws-maximized') && !panel.classList.contains('ws-maximized'));
      const button = panel.querySelector('[data-control=maximize]');
      const maximized = panel.classList.contains('ws-maximized');
      button.setAttribute('aria-pressed', String(maximized));
      button.setAttribute('aria-label', `${maximized ? 'Restore' : 'Maximize'} ${name}`);
    }
    $('ws-empty').hidden = Object.values(windows).some(panel => !panel.hidden);
    for (const button of root.querySelectorAll('.ws-rail [data-ws-open]')) {
      const name = button.dataset.wsOpen;
      const selected = name === 'evidence' ? !windows.evidence.hidden : !windows.console.hidden && $('ws-tab-' + name)?.getAttribute('aria-selected') === 'true';
      button.setAttribute('aria-pressed', String(!!selected));
    }
  }

  function restoreSizes() {
    Object.values(windows).forEach(panel => panel.classList.remove('ws-maximized'));
  }

  function open(target, focus = true) {
    const name = target === 'evidence' ? 'evidence' : 'console';
    if (!windows[name].classList.contains('ws-maximized')) restoreSizes();
    windows[name].hidden = false;
    if (name === 'console') {
      for (const tab of tabs) {
        const selected = tab.dataset.wsTab === target;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        $(tab.getAttribute('aria-controls')).hidden = !selected;
      }
    }
    updateWindows(name);
    if (focus) {
      const destination = {console: command, issuer: $('ct-account'), payment: $('ct-hash'), help: $('ws-panel-help'), evidence: $('ct-result-title')}[target];
      if (destination) { if (target === 'evidence') destination.tabIndex = -1; destination.focus(); }
    }
  }

  for (const button of root.querySelectorAll('[data-ws-open]')) button.addEventListener('click', () => open(button.dataset.wsOpen));
  for (const tab of tabs) {
    tab.addEventListener('click', () => {open(tab.dataset.wsTab, false); tab.focus();});
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let index = tabs.indexOf(tab);
      index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      open(tabs[index].dataset.wsTab, false);
      tabs[index].focus();
    });
  }
  for (const button of root.querySelectorAll('[data-control]')) button.addEventListener('click', () => {
    const name = button.dataset.window;
    const panel = windows[name];
    if (button.dataset.control === 'maximize') {
      const wasMaximized = panel.classList.contains('ws-maximized');
      restoreSizes();
      panel.classList.toggle('ws-maximized', !wasMaximized);
      updateWindows(name);
    } else {
      panel.hidden = true;
      panel.classList.remove('ws-maximized');
      updateWindows();
      root.querySelector(`.ws-rail [data-ws-open="${name}"]`).focus();
    }
  });
  for (const button of root.querySelectorAll('[data-ws-action=reset]')) button.addEventListener('click', () => {
    restoreSizes();
    windows.evidence.hidden = false;
    open('console');
  });
  for (const [name, panel] of Object.entries(windows)) panel.addEventListener('pointerdown', () => updateWindows(name));

  function run(text) {
    if (!text.trim()) return;
    print('noshashi@mainnet › ' + text, 'ws-command-line');
    if (history.at(-1) !== text) history.push(text);
    if (history.length > 30) history.shift();
    historyIndex = history.length;
    draft = '';
    command.value = '';
    let action;
    try {action = parseCommand(text);} catch (error) {print(error.message, 'ws-error'); return;}
    switch (action.command) {
      case 'help':
        print('issuer <address> <currency>   Read issuer controls\npayment <hash>              Inspect delivered metadata\nexample issuer | payment    Fill a public command; no fetch\nopen <tool>                 console / issuer / payment / evidence / help\nevidence show | copy | download\nstatus · history · clear · help\n\nRead-only NOSHASHI commands. No shell, script or arbitrary RPC execution.');
        break;
      case 'status':
        print(`XRPL Mainnet · read-only public beta\nEvidence: ${$('ct-state').textContent}\n${$('ws-ledger').textContent}\nNo account, saved filesystem or background monitor connected.\nSession history: memory only. Public requests may appear in platform logs.`);
        break;
      case 'history': print(history.map((line, index) => `${String(index + 1).padStart(2, '0')}  ${line}`).join('\n')); break;
      case 'clear': log.replaceChildren(); print('Console cleared. Current evidence and session command history remain available.'); break;
      case 'open': open(action.target); break;
      case 'example':
        command.value = PUBLIC_EXAMPLES[action.target];
        print('Public example placed in the prompt. Press Run to fetch evidence. No request sent.', 'ws-output ws-muted');
        command.focus();
        break;
      case 'evidence':
        open('evidence');
        if (action.target !== 'show') {
          const button = $('ct-' + action.target);
          if (button.disabled) print('Export unavailable. Read complete, fresh, validated evidence first.', 'ws-error');
          else {button.click(); print(action.target === 'copy' ? 'Copy requested. Check the evidence window for the clipboard outcome.' : 'Local JSON download requested. No case is saved to an account.');}
        }
        break;
      case 'issuer':
      case 'payment': {
        if (root.querySelector('.ct-results').getAttribute('aria-busy') === 'true') {print('A reading is in progress. Wait for its result before another command.', 'ws-error'); break;}
        const form = $('ct-' + action.command);
        if (action.command === 'issuer') {$('ct-account').value = action.issuer; $('ct-currency').value = action.currency;}
        else $('ct-hash').value = action.hash;
        // The same forms and evidence gates serve both interfaces. No new RPC surface.
        form.requestSubmit();
        break;
      }
    }
  }

  $('ws-command-form').addEventListener('submit', event => {event.preventDefault(); run(command.value.trim());});
  command.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      const completed = completeCommand(command.value);
      if (completed !== command.value) {event.preventDefault(); command.value = completed;}
    } else if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      if (historyIndex === history.length) draft = command.value;
      historyIndex = Math.max(0, Math.min(history.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
      command.value = historyIndex === history.length ? draft : history[historyIndex];
      command.setSelectionRange(command.value.length, command.value.length);
    }
  });
  for (const button of root.querySelectorAll('[data-ws-command]')) button.addEventListener('click', () => run(button.dataset.wsCommand));
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {event.preventDefault(); open('console');}
    if (event.key === 'Escape' && root.contains(document.activeElement)) {restoreSizes(); updateWindows();}
  });
  root.addEventListener('ct:state', event => {
    const {name, message} = event.detail;
    $('ws-session-state').textContent = name === 'NOT READ' ? 'READY · NO CURRENT EVIDENCE' : name;
    if (name === 'NOT READ') $('ws-ledger').textContent = 'LEDGER —';
    else print(`[${name}] ${message}`, ['READING', 'VERIFIED'].includes(name) ? 'ws-output' : 'ws-error');
    if (name === 'READING') open('evidence', false);
  });
  root.addEventListener('ct:evidence', event => {$('ws-ledger').textContent = 'LEDGER ' + (event.detail.ledger_index ?? '—');});
  command.disabled = false;
  $('ws-command-form').querySelector('button').disabled = false;
  updateWindows('console');
}
