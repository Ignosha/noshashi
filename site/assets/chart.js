/*
 * Crosshair and tooltip for the server-rendered charts.
 *
 * DESIGN.md requires a crosshair on hover and a tooltip carrying the
 * exact value and timestamp. This adds both. It does not draw the
 * chart — the shapes are already in the HTML, and a visitor with
 * JavaScript off still gets the whole series, the axes and the labels.
 *
 * The series travels in the SVG's own data-series attribute, delta
 * encoded, so no request is made to make a chart interactive.
 */
(function () {
  "use strict";

  function setup(figure) {
    var svg = figure.querySelector("svg[data-series]");
    var tip = figure.querySelector(".chart-tip");
    if (!svg || !tip) return;

    var data;
    try { data = JSON.parse(svg.getAttribute("data-series")); } catch (e) { return; }
    if (!data || !data.v || !data.v.length) return;

    var cross = svg.querySelector(".cross");
    var line = svg.querySelector(".cross-x");
    var dot = svg.querySelector(".cross-dot");
    if (!cross || !line || !dot) return;

    var x0 = data.box[0], x1 = data.box[1], y0 = data.box[2], y1 = data.box[3];
    var lo = data.range[0], hi = data.range[1];
    var n = data.v.length;

    function priceAt(i) { return data.v[i]; }
    function timeAt(i) { return data.t0 + data.t[i]; }
    function sx(i) { return x0 + ((x1 - x0) * i) / (n - 1); }
    function sy(v) { return y1 - ((y1 - y0) * (v - lo)) / (hi - lo); }

    function fmtPrice(v) { return v >= 1 ? "$" + v.toFixed(4) : "$" + v.toFixed(5); }
    function fmtWhen(ms) {
      var d = new Date(ms);
      return d.toISOString().slice(0, 10) + " " + d.toISOString().slice(11, 16) + " UTC";
    }

    function show(clientX) {
      var rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      /* Pixel position → viewBox units. The SVG scales with the
         container, so the ratio has to be taken from the live rect
         rather than assumed from the viewBox. */
      var vx = ((clientX - rect.left) / rect.width) * data.w;
      var ratio = (vx - x0) / (x1 - x0);
      var i = Math.round(ratio * (n - 1));
      if (i < 0) i = 0;
      if (i > n - 1) i = n - 1;

      var px = sx(i), py = sy(priceAt(i));
      line.setAttribute("x1", px);
      line.setAttribute("x2", px);
      dot.setAttribute("cx", px);
      dot.setAttribute("cy", py);
      cross.removeAttribute("hidden");

      tip.innerHTML = "<b>" + fmtPrice(priceAt(i)) + "</b><span>" + fmtWhen(timeAt(i)) + "</span>";
      tip.hidden = false;

      /* Keep the tooltip inside the figure: past the midpoint it flips
         to the left of the crosshair instead of running off the edge. */
      var left = (px / data.w) * rect.width;
      var tipWidth = tip.offsetWidth;
      if (left + tipWidth + 16 > rect.width) left -= tipWidth + 14;
      else left += 14;
      tip.style.left = Math.max(0, left) + "px";
      tip.style.top = Math.max(0, (py / data.h) * rect.height - tip.offsetHeight - 10) + "px";
    }

    function hide() {
      cross.setAttribute("hidden", "");
      tip.hidden = true;
    }

    svg.addEventListener("pointermove", function (event) { show(event.clientX); });
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("pointercancel", hide);

    /* Keyboard: the chart is a real control, so it takes focus and
       arrow keys walk the series. A chart only a mouse can read is a
       chart half the audience cannot read. */
    svg.setAttribute("tabindex", "0");
    var index = n - 1;
    svg.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      index += event.key === "ArrowRight" ? 1 : -1;
      if (index < 0) index = 0;
      if (index > n - 1) index = n - 1;
      var rect = svg.getBoundingClientRect();
      show(rect.left + (sx(index) / data.w) * rect.width);
    });
    svg.addEventListener("blur", hide);
  }

  function init() {
    document.querySelectorAll("figure.chart").forEach(setup);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  /* Re-wire after the panel is replaced by a live refresh. */
  window.addEventListener("noshashi:charts", init);
})();
