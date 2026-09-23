/* IGNOSHASHI - Onboarding tour */
(function (global) {
  'use strict';
  let currentStep = 1;
  const totalSteps = 5;
  let onboardingEl = null;
  let stepEls = [];
  let initialized = false;

  function init() {
    onboardingEl = document.getElementById('onboarding');
    if (!onboardingEl) return;
    stepEls = [];
    for (let i = 1; i <= totalSteps; i++) {
      const el = document.getElementById('onbStep' + i);
      if (el) stepEls.push(el);
    }

    // Wire buttons
    const nextBtnIds = ['onbNext1', 'onbNext2', 'onbNext3', 'onbNext4'];
    nextBtnIds.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => next());
    });
    const finishBtn = document.getElementById('onbFinish');
    if (finishBtn) finishBtn.addEventListener('click', finish);

    // Keyboard: ENTER to advance
    document.addEventListener('keydown', (e) => {
      if (!onboardingEl || onboardingEl.style.display === 'none') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (currentStep < totalSteps) next();
        else finish();
      }
    });

    initialized = true;
  }

  function showStep(n) {
    stepEls.forEach((el, i) => {
      if (el) el.classList.toggle('hidden', i + 1 !== n);
    });
    const dots = document.getElementById('onbDots');
    if (dots) {
      dots.innerHTML = Array.from({ length: totalSteps }, (_, i) => 
        `<div class="dot ${i + 1 === n ? 'active' : ''}"></div>`
      ).join('');
    }
  }

  function next() {
    if (!initialized) return;
    if (currentStep < totalSteps) {
      currentStep++;
      showStep(currentStep);
    } else {
      finish();
    }
  }

  function finish() {
    if (onboardingEl) onboardingEl.style.display = 'none';
    localStorage.setItem('igno_onboarded', '1');
  }

  function start() {
    if (localStorage.getItem('igno_onboarded')) return;
    init();
    if (!onboardingEl) return;
    currentStep = 1;
    showStep(1);
    onboardingEl.classList.remove('hidden');
    onboardingEl.style.display = 'flex';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(start, 1500));
  } else {
    setTimeout(start, 1500);
  }

  global.Onboarding = { next, finish, start };
})(window);
