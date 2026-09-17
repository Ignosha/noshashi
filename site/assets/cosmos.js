/*
 * The hero's sky.
 *
 * A drifting starfield, a slow parallax, and an occasional meteor,
 * drawn on a canvas behind the landing page's opening section.
 *
 * DESIGN.md bans decorative particle fields, and it is worth being
 * precise about what that ban is actually protecting, because this is a
 * deliberate exception rather than an oversight. The objection recorded
 * there is that the old starfield "ran a requestAnimationFrame loop for
 * the life of the session behind live telemetry — a permanent frame
 * cost, animating in the same field of view as numbers the operator is
 * reading." Every clause of that is about motion behind data.
 *
 * So this field is constrained to never become that:
 *
 *   - It is mounted in the hero only. No panel, table, chart, ticker or
 *     verdict ever has moving pixels behind it.
 *   - The loop stops when the hero scrolls out of view, and when the tab
 *     is hidden. It is not a permanent frame cost; it is a frame cost
 *     while you are looking at the top of a marketing page.
 *   - `prefers-reduced-motion` gets the sky with no movement at all —
 *     the stars are still drawn, once. The picture survives; the motion
 *     does not.
 *   - Nothing here encodes anything. It is never a scale, a status or a
 *     quantity, and it sits behind copy, never behind a number.
 *
 * If this ever drifts down the page and ends up behind a reading, it is
 * the same mistake the ban was written for, and it should be deleted.
 */
(function () {
  "use strict";

  var hero = document.querySelector(".hero");
  var canvas = document.querySelector("canvas.cosmos");
  if (!hero || !canvas || !canvas.getContext) return;

  var context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  var SKY_MAX = 920;
  var stars = [];
  var meteors = [];
  var width = 0;
  var height = 0;
  var ratio = 1;
  var frame = null;
  var visible = true;
  var lastFrameAt = 0;
  var nextMeteorAt = 0;

  /* Three depths. Far stars are dimmer, smaller and slower — which is
     the whole of the parallax, and it is enough. */
  var LAYERS = [
    { count: 70, speed: 0.6, size: [0.5, 1.0], alpha: [0.18, 0.42] },
    { count: 46, speed: 1.3, size: [0.7, 1.4], alpha: [0.30, 0.62] },
    { count: 18, speed: 2.2, size: [1.0, 1.9], alpha: [0.45, 0.85] },
  ];

  function random(min, max) { return min + Math.random() * (max - min); }

  function build() {
    stars = [];
    for (var l = 0; l < LAYERS.length; l++) {
      var layer = LAYERS[l];
      // Density scales with area so a wide monitor is not sparse and a
      // phone is not a snowstorm.
      var count = Math.round(layer.count * Math.min(2.2, (width * height) / (1280 * 620)));
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: random(layer.size[0], layer.size[1]),
          a: random(layer.alpha[0], layer.alpha[1]),
          speed: layer.speed,
          // Each star breathes on its own period, so the field never
          // pulses in unison — which reads as a strobe, not a sky.
          phase: Math.random() * Math.PI * 2,
          rate: random(0.4, 1.3),
        });
      }
    }
  }

  function resize() {
    var rect = hero.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    /*
     * The cap is stated here rather than read back off the element.
     *
     * Measuring the canvas's own box is circular: this function writes
     * an inline height, so the next read returns whatever was written
     * last. Called before layout settled it read the full hero — some
     * 2,600px — wrote that inline, and the inline value then overrode
     * the CSS cap for the rest of the session. The result was a buffer
     * nearly three times the pixels on screen with the same star count
     * spread thinly across it.
     *
     * SKY_MAX must stay equal to the cap in modules.css
     * (`height:min(100%,920px)`); the two are the same decision.
     */
    height = Math.max(1, Math.min(SKY_MAX, Math.round(rect.height)));
    ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    build();
  }

  function draw(elapsed, time) {
    context.clearRect(0, 0, width, height);

    for (var i = 0; i < stars.length; i++) {
      var star = stars[i];
      // A slow rightward drift. Wrapping rather than respawning keeps
      // the density constant instead of thinning over time.
      star.x += star.speed * elapsed * 0.006;
      if (star.x > width + 2) star.x = -2;

      var twinkle = still.matches ? 1 : 0.72 + 0.28 * Math.sin(time * 0.001 * star.rate + star.phase);
      context.globalAlpha = star.a * twinkle;
      context.beginPath();
      context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      context.fill();
    }

    for (var m = meteors.length - 1; m >= 0; m--) {
      var meteor = meteors[m];
      meteor.life += elapsed;
      var progress = meteor.life / meteor.duration;
      if (progress >= 1) { meteors.splice(m, 1); continue; }

      var x = meteor.x + meteor.dx * progress;
      var y = meteor.y + meteor.dy * progress;
      // Fade in and out rather than appearing and vanishing.
      var fade = Math.sin(progress * Math.PI);

      var gradient = context.createLinearGradient(x, y, x - meteor.dx * 0.12, y - meteor.dy * 0.12);
      gradient.addColorStop(0, "rgba(255,255,255," + (0.7 * fade).toFixed(3) + ")");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.globalAlpha = 1;
      context.strokeStyle = gradient;
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - meteor.dx * 0.12, y - meteor.dy * 0.12);
      context.stroke();
    }

    context.globalAlpha = 1;
  }

  function spawnMeteor() {
    var fromLeft = Math.random() > 0.35;
    var x = fromLeft ? random(-60, width * 0.5) : random(width * 0.5, width + 60);
    var y = random(-20, height * 0.55);
    var distance = random(180, 420);
    meteors.push({
      x: x, y: y,
      dx: fromLeft ? distance : -distance,
      dy: distance * random(0.28, 0.55),
      life: 0,
      duration: random(700, 1300),
    });
  }

  function tick(time) {
    frame = window.requestAnimationFrame(tick);
    if (!lastFrameAt) lastFrameAt = time;
    var elapsed = Math.min(64, time - lastFrameAt);
    lastFrameAt = time;

    if (time > nextMeteorAt) {
      // Rare on purpose. A meteor every second is weather, not a sky.
      nextMeteorAt = time + random(7000, 17000);
      if (meteors.length < 2) spawnMeteor();
    }
    draw(elapsed, time);
  }

  function paintOnce() {
    lastFrameAt = 0;
    draw(0, 0);
  }

  function start() {
    if (frame !== null) return;
    if (still.matches) { paintOnce(); return; }
    lastFrameAt = 0;
    nextMeteorAt = 0;
    frame = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (frame === null) return;
    window.cancelAnimationFrame(frame);
    frame = null;
  }

  function sync() {
    if (visible && !document.hidden) start();
    else stop();
  }

  function setColour() {
    // The sky is white on the navy ground and disappears entirely in
    // light mode, where a starfield would read as dust on the screen.
    var light = document.documentElement.getAttribute("data-theme") === "light";
    canvas.style.opacity = light ? "0" : "1";
    context.fillStyle = "#FFFFFF";
  }

  resize();
  setColour();
  paintOnce();

  /* The loop exists only while the hero is on screen. This is the
     clause that keeps it out of DESIGN.md's ban. */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      sync();
    }, { rootMargin: "80px" }).observe(hero);
  }
  document.addEventListener("visibilitychange", sync);

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      resize();
      setColour();
      if (frame === null) paintOnce();
    }, 180);
  });

  // The theme toggle repaints the sky rather than reloading the page.
  new MutationObserver(setColour).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme"],
  });

  if (still.addEventListener) {
    still.addEventListener("change", function () { stop(); sync(); });
  }

  sync();
})();
