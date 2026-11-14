/** Local brand reveal only. No network probe, fake boot tasks or input gating. */
export function initStartup(root, command) {
  const boot = root.querySelector('#ws-boot');
  const skip = root.querySelector('#ws-boot-skip');
  const replay = root.querySelector('#ws-boot-replay');
  const label = root.querySelector('#ws-boot-label');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let timer;
  root.querySelector('#ws-crypto-status').textContent = globalThis.crypto?.subtle ? 'AVAILABLE' : 'UNAVAILABLE';

  function finish() {
    clearTimeout(timer);
    const wasFocused = document.activeElement === skip;
    boot.dataset.boot = 'ready';
    skip.hidden = true;
    label.textContent = 'LOCAL SESSION / READY';
    if (wasFocused) command.focus();
  }
  function start() {
    finish();
    if (motion.matches) return;
    // Restart finite CSS animations when replaying. Never hide or disable the prompt.
    void boot.offsetWidth;
    boot.dataset.boot = 'starting';
    skip.hidden = false;
    label.textContent = 'LOCAL STARTUP / NO NETWORK REQUEST';
    timer = setTimeout(finish, 1400);
  }
  skip.addEventListener('click', finish);
  replay.addEventListener('click', start);
  command.addEventListener('input', finish);
  root.addEventListener('ct:state', finish);
  motion.addEventListener('change', () => {if (motion.matches) finish();});
  replay.disabled = false;
  start();
}
