
(function () {
  var toggle = document.getElementById("themeToggle"), label = document.getElementById("themeLabel");
  var saved = "";
  try { saved = localStorage.getItem("noshashi-theme") || ""; } catch (_) {}
  document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
  function update() {
    var light = document.documentElement.dataset.theme === "light";
    if (label) label.textContent = light ? "DARK" : "LIGHT";
    if (toggle) toggle.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
  }
  update();
  if (toggle) toggle.addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("noshashi-theme", next); } catch (_) {}
    update();
  });
})();
