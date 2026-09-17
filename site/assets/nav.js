/*
 * Mobile navigation.
 *
 * Below 820px every nav link was `display:none`. The bar kept the
 * wordmark, the theme toggle and two buttons, and dropped the actual
 * navigation — so on a phone there was no route to pricing, the
 * newsroom, progress, status, the guide or the findings except by
 * scrolling the landing page and hoping. That is most of the site
 * unreachable on the device most people will open it on.
 *
 * Rather than restyle the existing flex bar into a menu — which would
 * mean three different sets of overrides for three different pages that
 * each hand-rolled their own header — this lifts the links into a panel
 * of its own and leaves the bar untouched. Desktop is not affected at
 * all: the panel only exists below the breakpoint.
 *
 * Loaded by every page that carries a .nav-links bar. Pages with only a
 * brand and a back link (the guide, legal, research, the Edge Pack) have
 * nothing to collapse and are left alone.
 */
(function () {
  "use strict";

  var BREAKPOINT = 820;

  var bar = document.querySelector("header .nav-links");
  if (!bar) return;

  var links = [].slice.call(bar.querySelectorAll("a:not(.btn)"));
  if (!links.length) return;

  var header = bar.closest("header");
  if (!header) return;

  /* The toggle lives in the bar, before the buttons, so the primary
     action stays in the corner a thumb reaches for. */
  var button = document.createElement("button");
  button.type = "button";
  button.className = "nav-menu-btn";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Open navigation menu");
  button.innerHTML = '<span class="nav-menu-bars" aria-hidden="true"></span><span>MENU</span>';

  var firstButton = bar.querySelector(".btn, .theme-toggle");
  bar.insertBefore(button, firstButton || null);

  /*
   * Marks the bar as having a working menu, which is what lets CSS drop
   * the call-to-action buttons on a phone: at 375px the wordmark, MENU,
   * the theme toggle and two buttons do not fit, and the last button
   * runs off the edge. Both are repeated at the foot of the panel.
   *
   * Set from script on purpose. If this file fails to load, the class
   * is absent, the buttons stay in the bar, and the page keeps the
   * navigation it had rather than losing both.
   */
  bar.classList.add("has-menu");

  var panel = document.createElement("div");
  panel.className = "nav-panel";
  panel.id = "nav-panel";
  panel.hidden = true;

  var list = document.createElement("nav");
  list.setAttribute("aria-label", "Site");
  links.forEach(function (link) {
    var copy = document.createElement("a");
    copy.href = link.getAttribute("href");
    copy.textContent = link.textContent.trim();
    if (link.hasAttribute("aria-current")) copy.setAttribute("aria-current", "page");
    if (link.hasAttribute("rel")) copy.setAttribute("rel", link.getAttribute("rel"));
    list.appendChild(copy);
  });
  panel.appendChild(list);

  /* Contact is in the bar as a button and is the one thing someone
     opening a menu on a phone is most likely to want. Repeat it at the
     foot of the panel rather than making them close the menu to find
     a control that was behind it. */
  var foot = document.createElement("div");
  foot.className = "nav-panel-foot";
  foot.innerHTML =
    '<a href="/contact/">Contact</a>' +
    '<a href="/#download">Download beta</a>';
  panel.appendChild(foot);

  header.appendChild(panel);
  button.setAttribute("aria-controls", panel.id);

  function open() {
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-label", "Close navigation menu");
    button.classList.add("on");
    document.addEventListener("click", onOutside, true);
  }

  function close() {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Open navigation menu");
    button.classList.remove("on");
    document.removeEventListener("click", onOutside, true);
  }

  function onOutside(event) {
    if (!header.contains(event.target)) close();
  }

  button.addEventListener("click", function (event) {
    event.stopPropagation();
    if (panel.hidden) open();
    else close();
  });

  /* A same-page anchor does not reload, so the panel would stay open
     over the section it just scrolled to. */
  panel.addEventListener("click", function (event) {
    if (event.target.closest("a")) close();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !panel.hidden) {
      close();
      button.focus();
    }
  });

  /* Rotating a phone can cross the breakpoint with the panel open,
     which would leave it stranded over a desktop bar. */
  window.addEventListener("resize", function () {
    if (window.innerWidth > BREAKPOINT && !panel.hidden) close();
  });
})();
