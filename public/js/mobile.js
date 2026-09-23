/* IGNOSHASHI - Mobile menu */
(function (global) {
  'use strict';
  const btn = document.getElementById('hamburgerBtn');
  const sidebar = document.querySelector('.sidebar');
  if (!btn || !sidebar) return;
  btn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    btn.textContent = sidebar.classList.contains('open') ? '✕' : '☰';
  });
  document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && e.target !== btn && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      btn.textContent = '☰';
    }
  });
})(window);
