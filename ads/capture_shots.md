# Capturing site footage for the commercial

`ads/commercial_9x16.py` composites real captures of the live site. It
reads PNGs from `/private/tmp/noshashi_shots/` and will refuse to run if
they are missing, rather than silently falling back to placeholder art.

Captures are **DOM renders, not screenshots**. A screenshot is limited to
the window's pixel size; a DOM render can be taken at 2–3× and stays
sharp when the compositor pushes in on it. That is the difference
between a product shot and a blurry crop.

## The pass

1. Serve the built site:

   ```bash
   npm run site:build && PORT=4440 node scripts/dev-site.mjs
   ```

2. Open `http://localhost:4440/` in a browser at a 1280×900 viewport.

3. The page's CSP is `script-src 'self'` and `connect-src 'self'`, so the
   capture library and the receiver both have to be same-origin. Copy
   `modern-screenshot` into the served assets and add a temporary
   receiver:

   ```bash
   cp .claude/skills/impeccable/scripts/modern-screenshot.umd.js site/assets/_capture.js
   ```

   The receiver is a throwaway `api/dev-capture.js` that writes a posted
   `data:image/png;base64,…` to `/private/tmp/noshashi_shots/<name>.png`.
   **Delete both when the pass is done** — neither belongs in a deploy.

4. In the page console, load the library and capture each target:

   ```js
   const ms = window.modernScreenshot;
   const shot = async (name, sel, scale = 2) => {
     const data = await ms.domToPng(document.querySelector(sel),
       { scale, backgroundColor: '#0B0F14', quality: 1 });
     await fetch('/api/dev-capture', { method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ name, data }) });
   };
   ```

## Targets

| Name | Selector | Used for |
|---|---|---|
| `xrp_panel` | `#xrp-live` | The live market beat |
| `board` | `#mission .board` | The status beat |
| `downloads` | `#download .platforms` | The BETA download beat |
| `m_hero` | `.lockup` at a 390px viewport, scale 3 | The phone beat |
| `hero_full`, `hero_lockup`, `pricing`, `questions`, `release_rail` | — | Spares, not currently cut in |

Re-capture whenever the site's visual design changes. The commercial
will keep rendering with stale shots quite happily — nothing checks that
a capture still matches the live page, and that is the failure mode to
watch for.
