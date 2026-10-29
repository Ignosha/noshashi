/*
 * The GREEN / BLUE switch was retired when the site became blue-only.
 * This file stays so cached pages that still load it do nothing harmful:
 * it clears any saved choice, so an old "blue" setting cannot re-tint
 * the logo.
 */
(function () {
  "use strict";
  try { localStorage.removeItem("noshashi-accent"); } catch (e) {}
  document.documentElement.removeAttribute("data-accent");
})();
