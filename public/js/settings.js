/* IGNOSHASHI - Settings */
(function (global) {
  'use strict';
  const $ = global.$;

  function applyTheme(theme) {
    document.body.classList.remove('theme-cyberpunk', 'theme-terminal', 'theme-retro', 'theme-minimal');
    document.body.classList.add('theme-' + theme);
    localStorage.setItem('igno_theme', theme);
    const themeEl = document.getElementById('settingTheme');
    if (themeEl) themeEl.value = theme;
  }

  function loadSettings() {
    const savedTheme = localStorage.getItem('igno_theme') || 'cyberpunk';
    applyTheme(savedTheme);
    const themeEl = document.getElementById('settingTheme');
    if (themeEl) {
      themeEl.value = savedTheme;
      themeEl.addEventListener('change', (e) => {
        applyTheme(e.target.value);
        global.toast('Theme applied: ' + e.target.value);
      });
    }
    const notif = document.getElementById('settingNotifType');
    if (notif) notif.value = localStorage.getItem('igno_notif') || 'all';
    notif && notif.addEventListener('change', (e) => {
      localStorage.setItem('igno_notif', e.target.value);
      global.toast('Notification settings saved');
    });
  }

  const btnTest = document.getElementById('btnTestSound');
  if (btnTest) {
    btnTest.addEventListener('click', () => {
      if (global.SoundEngine) {
        global.SoundEngine.toggle();
        setTimeout(() => { if (global.SoundEngine.isEnabled()) global.SoundEngine.successBlip(); }, 100);
      }
    });
  }

  global.renderPage = global.renderPage || {};
  global.renderPage.settings = loadSettings;
  global.renderPage.help = loadSettings;
})(window);
