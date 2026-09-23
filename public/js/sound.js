/* IGNOSHASHI - Retro UI Sound Engine (Web Audio API) */
(function (global) {
  'use strict';

  let audioCtx = null;
  let soundEnabled = false;

  function getCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone(freq, duration, type, vol) {
    if (!soundEnabled) return;
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol || 0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (duration || 0.08));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + (duration || 0.08));
    } catch (e) { /* silent */ }
  }

  function blip() { playTone(800, 0.05, 'square', 0.03); }
  function hoverBlip() { playTone(600, 0.04, 'square', 0.02); }
  function clickBlip() { playTone(1200, 0.06, 'square', 0.04); }
  function successBlip() { playTone(523, 0.08, 'square', 0.04); setTimeout(() => playTone(784, 0.1, 'square', 0.04), 80); }
  function errorBlip() { playTone(200, 0.15, 'sawtooth', 0.04); }
  function notifyBlip() { playTone(880, 0.06, 'square', 0.03); setTimeout(() => playTone(1100, 0.08, 'square', 0.03), 60); }

  global.SoundEngine = {
    blip,
    hoverBlip,
    clickBlip,
    successBlip,
    errorBlip,
    notifyBlip,
    toggle() {
      soundEnabled = !soundEnabled;
      if (soundEnabled) getCtx();
      const btn = document.getElementById('soundToggle');
      if (btn) {
        btn.textContent = soundEnabled ? '🔊' : '🔇';
        btn.style.borderColor = soundEnabled ? 'var(--green)' : 'var(--cyan)';
        btn.style.color = soundEnabled ? 'var(--green)' : 'var(--cyan)';
      }
      global.toast && global.toast('Sound ' + (soundEnabled ? 'ON' : 'OFF'));
      return soundEnabled;
    },
    isEnabled() { return soundEnabled; },
  };

  // Wire up sound toggle button
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('soundToggle');
    if (btn) {
      btn.addEventListener('click', () => global.SoundEngine.toggle());
      btn.addEventListener('mouseenter', () => { if (soundEnabled) global.SoundEngine.hoverBlip(); });
    }
  });

  // Auto-wire hover sounds for interactive elements
  document.addEventListener('mouseover', (e) => {
    const el = e.target;
    if (!soundEnabled) return;
    if (el.matches('button, .chip, .nav-item, .token-row, .pixel-btn, .tool-card, .launch-card')) {
      global.SoundEngine.hoverBlip();
    }
  });

  // Click sounds for buttons
  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!soundEnabled) return;
    if (el.matches('button, .chip, .nav-item, .pixel-btn')) {
      global.SoundEngine.clickBlip();
    }
  });
})(window);
