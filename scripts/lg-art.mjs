/*
 * The homepage's line illustrations, inline SVG so they cost no request
 * and take the theme's colours. Periwinkle-to-lavender gradient fills with deep-indigo
 * outlines, after the owner's Web3 references.
 *
 * HERO: an open ledger box with two XRP coins lifting out of it and a key
 * on a line: what an issuer can still do to what you hold, opened up.
 * ALERT: an eye, for the issuer alerts that watch for you.
 *
 * Each coin is labelled XRP in the display face, not a copy of any
 * logo.
 */

const GRAD = (id, from = "#8E9BFF", mid = "#B9A8FF", to = "#F1EEFF") =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;

const coin = (x, y, r, fill) => `<g transform="translate(${x} ${y})">
  <circle r="${r}" fill="url(#${fill})" stroke="#15142E" stroke-width="2.5"/>
  <circle r="${(r * 0.72).toFixed(1)}" fill="none" stroke="#15142E" stroke-width="2"/>
  <text y="${(r * 0.17).toFixed(1)}" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="${(r * 0.62).toFixed(1)}" fill="#15142E" letter-spacing="1">XRP</text>
</g>`;

export const HERO_ART = `<svg class="lg-svg" viewBox="0 0 520 440" role="img" aria-label="An open box with XRP coins rising out of it">
  <defs>${GRAD("lgA")}${GRAD("lgB", "#C9BCFF", "#F1EEFF", "#9AA8FF")}${GRAD("lgC", "#6F78F0", "#8E9BFF", "#C3B4FF")}</defs>
  <g class="lg-line" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M70 92h46M70 102h60M70 112h38"/>
    <path d="M362 300 L448 318"/>
    <circle cx="462" cy="321" r="13"/>
    <circle cx="462" cy="321" r="4" fill="currentColor"/>
    <path d="M96 300 v44 M104 300 v44 M112 300 v44 M120 300 v44"/>
  </g>
  <path d="M160 240 L260 190 L230 128 L130 178 Z" fill="url(#lgB)" stroke="#15142E" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M260 190 L360 240 L404 176 L304 126 Z" fill="url(#lgA)" stroke="#15142E" stroke-width="2.5" stroke-linejoin="round"/>
  ${coin(262, 128, 44, "lgA")}
  ${coin(352, 62, 28, "lgB")}
  <path d="M160 240 L260 290 L260 400 L160 350 Z" fill="url(#lgC)" stroke="#15142E" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M260 290 L360 240 L360 350 L260 400 Z" fill="url(#lgA)" stroke="#15142E" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M260 290 L360 240 L432 268 L332 318 Z" fill="url(#lgB)" stroke="#15142E" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="205" cy="318" r="9" fill="#15142E"/>
  <path d="M205 318 L205 352" stroke="#15142E" stroke-width="3" stroke-linecap="round"/>
  <g class="lg-line" fill="currentColor"><circle cx="440" cy="120" r="3"/><circle cx="96" cy="210" r="3"/><circle cx="420" cy="410" r="3"/></g>
</svg>`;

export const ALERT_ART = `<svg class="lg-svg lg-svg-sm" viewBox="0 0 320 180" role="img" aria-label="An eye watching an issuer">
  <defs>${GRAD("lgD")}</defs>
  <circle cx="110" cy="96" r="58" fill="url(#lgD)" opacity=".55"/>
  <circle cx="214" cy="84" r="44" fill="url(#lgD)" opacity=".35"/>
  <path d="M58 92 Q160 18 262 92 Q160 166 58 92 Z" fill="#FFFFFF" stroke="#15142E" stroke-width="2.5"/>
  <circle cx="160" cy="92" r="30" fill="url(#lgD)" stroke="#15142E" stroke-width="2.5"/>
  <circle cx="160" cy="92" r="12" fill="#15142E"/>
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M24 40h30M24 50h44M276 140h22M276 150h30"/></g>
</svg>`;
