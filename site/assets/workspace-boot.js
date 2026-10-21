/* Applies the saved sidebar width before first paint, so a collapsed
   sidebar does not flash open on every page load. */
(function () {
  try {
    if (localStorage.getItem("noshashi-ws-side") === "rail") document.documentElement.setAttribute("data-ws-side", "rail");
  } catch (e) {}
})();
