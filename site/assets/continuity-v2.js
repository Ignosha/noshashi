/* Progressive enhancement only: content is readable without JavaScript. */
(() => {
  const section = document.querySelector("[data-cv2-motion]");
  if (!section || !("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  section.classList.add("cv2-ready");
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      section.classList.add("cv2-visible");
      observer.disconnect();
    }
  }, { threshold: 0.14 });
  observer.observe(section);
  // Never hide the message indefinitely if observers fail to fire.
  window.setTimeout(() => { section.classList.add("cv2-visible"); observer.disconnect(); }, 3000);
})();
