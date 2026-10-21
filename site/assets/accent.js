/*
 * GREEN / BLUE theme switch. Loaded in <head> without defer so the saved
 * choice is applied before the first paint (no green flash on a blue
 * page); the button is wired once the document is parsed.
 */
(function () {
  "use strict";
  var KEY = "noshashi-accent";
  var root = document.documentElement;
  try {
    if (localStorage.getItem(KEY) === "blue") root.setAttribute("data-accent", "blue");
  } catch (e) {}

  function label(button) {
    var blue = root.getAttribute("data-accent") === "blue";
    var text = button.querySelector("[data-accent-label]");
    if (text) text.textContent = blue ? "GREEN" : "BLUE";
    button.setAttribute("aria-label", blue ? "Switch to the green theme" : "Switch to the blue theme");
    button.setAttribute("aria-pressed", blue ? "true" : "false");
  }

  function wire() {
    var buttons = document.querySelectorAll("[data-accent-toggle]");
    buttons.forEach(function (button) {
      label(button);
      button.addEventListener("click", function () {
        var blue = root.getAttribute("data-accent") !== "blue";
        if (blue) root.setAttribute("data-accent", "blue");
        else root.removeAttribute("data-accent");
        try { localStorage.setItem(KEY, blue ? "blue" : "green"); } catch (e) {}
        buttons.forEach(label);
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
