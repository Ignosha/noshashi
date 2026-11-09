(() => {
  const titles = new Map([
    ['AXN9-m0uXKk', 'Apex 2025'],
    ['Zdze88QcAq4', 'Sending payments on the XRP Ledger'],
  ]);
  let active = null;
  const close = card => {
    card.querySelector('iframe')?.remove();
    card.querySelector('.nr-video-cover').hidden = false;
    card.querySelector('[data-video-load]').hidden = false;
    card.querySelector('[data-video-close]').hidden = true;
    card.querySelector('[data-video-status]').textContent = 'Player closed. YouTube loads only when you choose.';
    if (active === card) active = null;
  };
  for (const card of document.querySelectorAll('.nr-video-card')) {
    const button = card.querySelector('[data-video-load]');
    const id = button.dataset.videoLoad;
    if (!titles.has(id)) continue;
    button.hidden = false;
    button.addEventListener('click', () => {
      if (active) close(active);
      active = card;
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&playsinline=1&cc_load_policy=1`;
      frame.title = titles.get(id);
      frame.allow = 'encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      // Keep all fallback links visible. Cross-origin load does not establish playback.
      const status = card.querySelector('[data-video-status]');
      status.textContent = 'External player requested. If it is blocked or unavailable, use Watch at source.';
      frame.addEventListener('error', () => { status.textContent = 'Player unavailable. Watch at source instead.'; });
      card.querySelector('.nr-video-cover').hidden = true;
      card.querySelector('[data-video-stage]').append(frame);
      button.hidden = true;
      card.querySelector('[data-video-close]').hidden = false;
    });
    card.querySelector('[data-video-close]').addEventListener('click', () => { close(card); button.focus(); });
  }
})();
