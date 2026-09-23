---
name: Noshashi Instrument
source: noshashi-brand-reference.png
description: Aerospace instrumentation for financial adjudication. Navy ground, a single blue accent for the brand and one telemetry cyan for live signal. Status colour is spent only on GO/HOLD/NO-GO. Soft corners, thin rules, tabular numerals, static orbital geometry behind the data.
mode: operate
colors:
  ground: "#0B0F14"
  surface: "#11161D"
  elevated: "#1C2330"
  text-primary: "#E6E8EB"
  text-secondary: "#A3A8B3"
  text-faint: "#747C8B"
  border: "#2A313C"
  accent: "#3A82F6"
  telemetry: "#00E0C6"
  go: "#35D49A"
  hold: "#F5B942"
  no-go: "#FF5F6D"
fonts:
  display: "Space Grotesk"
  mono: "IBM Plex Mono"
radius: "0.5rem"
---

# NOSHASHI — Design System

Register: **Operate.** The visitor completes a task. Scanability, consistency
and the real usage scene outrank expression. Brand lives in precise details,
never in decoration.

## The reference

NASA instrumentation without sci-fi cosplay.
Bloomberg information density without visual clutter.
Apple refinement without minimalism becoming empty.

The user is not *using a crypto dashboard*. The user is *operating NOSHASHI*.

## Colour

Defined once as tokens in `src/index.css`. Never hard-code a colour in a
component — the codebase currently holds only two hex literals outside the
token file and that number must not grow.

Values come from the brand board, section 05.

| Token | Value | Use |
|---|---|---|
| `--background` | `#0B0F14` | Page ground. Navy, not neutral black — it is what makes the blue and teal read as lit rather than printed on top. |
| `--card` | `#11161D` | Panels, inputs, table headers. |
| `--popover` | `#1C2330` | Popovers, dialogs, hover surfaces. |
| `--foreground` | `#E6E8EB` | Headlines, values, `<strong>`. |
| `--muted-foreground` | `#A3A8B3` | Body, labels. |
| `--faint` | `#747C8B` | Captions, metadata, units. |
| `--border` | `#2A313C` | Rules and panel edges. |
| `--brand` | `#3A82F6` | Brand. Primary action. Default chart series. |
| `--telemetry` | `#00E0C6` | Live signal only — a value updating *right now*. |
| `--go` / `--hold` / `--no-go` | `#35D49A` / `#F5B942` / `#FF5F6D` | Verdict. Nothing else. |

### One board value was moved for contrast

Every token is measured against its ground rather than eyeballed.

The board's neutral `#6B7280` measures **3.98:1** on `#0B0F14` and fails WCAG
AA. It ships as `#747C8B` — same hue, same saturation, four points of
lightness, **4.56:1**. It carries captions and units at 9–10px, the size at
which failing contrast is least forgivable.

Light mode needed three similar nudges (`--telemetry`, `--status-hold`,
`--faint`), each one to two points of lightness.

Both themes now pass at every token. Re-run the contrast audit before
changing any value.

### The colour rule

**Saturation is a budget, and status owns it.**

A screen showing a NO-GO verdict must have exactly one red thing on it. If a
chart line, a badge, and an icon are also coloured, the verdict stops reading
as the most important fact on the page — which is the one job this product has.

Consequences:
- Charts draw in `--brand`, as the board's market charts do. A series only takes a status colour when that series *is* reporting status.
- No categorical palettes. Distinguish series by weight, dash, and direct labelling.
- `--telemetry` cyan is reserved for genuinely live values. A static number in cyan is a lie about liveness.
- Never encode meaning in colour alone. Every status colour is paired with a glyph or a word.

## Typography

| Role | Face | Notes |
|---|---|---|
| Display / UI | **Space Grotesk** 500, 600 | Headings, labels, navigation |
| Data | **IBM Plex Mono** 400, 500 | Every number, address, hash, timestamp |

Both self-hosted in `public/fonts/`, matching the existing policy: no font CDN
in the CSP, and the app opens without announcing itself to anyone.

**Retired:** Orbitron, Rajdhani, Inter and JetBrains Mono. The board specifies
exactly two faces. Inter and JetBrains Mono became dead weight the moment
`--font-interface` and `--font-mono` repointed — 616 KB of fonts nothing
referenced. Total font payload is now 136 KB.

### Numerals

Every financial column uses `font-variant-numeric: tabular-nums`. Non-negotiable
— proportional digits make columns shift width as values tick, which reads as
instability in a product selling precision.

### Scale

`11 · 12 · 13 · 14 · 16 · 20 · 24 · 32 · 44`

Uppercase is for labels ≤ 12px with `letter-spacing: .08em–.16em`. Body copy is
never uppercase; it costs too much legibility below 13px.

## Spacing

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`

No arbitrary values. If a layout needs 13px, the layout is wrong.

## Structure

### Radius: 0.5rem

The brand board renders panels with a soft corner and a pill-shaped command
field. Zero-radius was the earlier NOVA direction; the board supersedes it.
HUD corner ticks are retired with it — they are drawn square at a -1px offset
and hang off a rounded corner. Crosshairs and orbital geometry belong in the
background pattern (board section 07), never on the frame of every panel.

### Borders — the card-prison rule

**A panel may not contain another bordered panel.**

Hierarchy comes from, in order of preference:
1. Space
2. A single hairline rule
3. A surface step (`--surface` → `--elevated`)

A border is the last resort, not the first. `Panel` takes a `nested` prop that
drops the border for exactly this case.

### Density

This is a desktop instrument, not a marketing page. Default row height 32px,
compact 28px. Panel padding 16px, not 24px. Information density is a feature —
but density without alignment is clutter, so every number in a column shares a
right edge and a decimal position.

## Motion

| Tier | Duration | Easing | Use |
|---|---|---|---|
| Micro | 100–160ms | `cubic-bezier(.2,0,0,1)` | Hover, focus, toggle |
| Standard | 180–240ms | `cubic-bezier(.2,0,0,1)` | Panel enter, tab change, popover |
| Major | 280–450ms | `cubic-bezier(.16,1,.3,1)` | Scene transition, preloader beat |

Motion communicates **state, hierarchy, activity, transition**. Never decoration.

**Banned:** bounce, elastic overshoot, spring physics on layout, screen shake,
particle bursts, parallax on data, animating an entire dashboard on every render.

`prefers-reduced-motion` removes movement but must preserve the state change —
an instant swap, not a broken interface. Never a global `0.01ms` kill.

## Charts

Custom SVG in `src/components/nova/Charts.tsx`. Do not replace with a charting
library: the custom set is ~4 KB and monochrome by principle, and Recharts would
add ~90 KB while fighting the colour rule.

Every chart must have: a crosshair on hover, a tooltip carrying the exact value
and timestamp, labelled axes with units, and tabular numerals.

Every visualisation answers a question. If you cannot write the question above
the chart in six words, delete the chart.

The board's area charts carry a vertical gradient under the trace — strong at
the line, gone at the baseline. That is the house style and is not chart junk;
it reads depth without adding a second encoding.

**Banned:** rainbow series, categorical palettes, 3D, glow, drop shadows on
data, decorative axes, chart junk of any kind.

## Empty, loading, error

- **Empty** — say what would appear here and how to make it appear. The mark may appear at ≤ 24px, at 40% opacity, never as a hero illustration.
- **Loading** — skeleton telemetry matching the final layout's dimensions. No spinners, no layout shift on arrival.
- **Error** — what failed, when it last worked, what to do. Raw errors only behind developer mode.

## Brand assets

The mark is the **flower**, the owner's artwork (`brand/flower-source.png`):
four long cardinal petals, four diagonals with the lower pair longer, inner
petals and a white-hot core. It replaced the rocket in September 2026.

**The artwork is the logo.** Everywhere the mark appears in colour it is the
artwork itself, never a redrawing: the app icon (on the garden ground), the
favicons (an SVG embedding the 64px crop, so every page's existing
`/favicon.svg` link carries it), the site header on every page, the sign-up
popup, the Stripe return pages and every colour `NoshashiMark` in the console
(`public/brand/flower-mark-128.png`). `scripts/gen-brand-raster.mjs` makes
the square crops, centred on the artwork's lit core.

The one vector is the **single-colour silhouette** traced from the artwork
(`scripts/gen-brand.mjs` → `brand/flower-mono.svg`,
`src/components/nova/brand/flower.ts`), because some places must be one flat
colour: the macOS menu-bar template image, and `mono` marks such as the icon
inside a filled button or the error screen. `npm run check:brand` fails CI
when a generated file is stale.

Regenerate everything after a change:

```bash
node scripts/gen-brand.mjs && node scripts/gen-brand-raster.mjs && npm run icon
```

Rules the drawing keeps:

- `color`: the artwork. Use it wherever the mark appears on its own.
- `mono`: the flat silhouette, cardinal petals *cut* out of the diagonals by a
  mask so the gaps are transparent on any ground. Only where one colour is
  required.
- the app icon is full-bleed (each OS applies its own corner mask).

Components: `NoshashiMark`, `NoshashiLogo`, `NoshashiWordmark`.

## Brand pattern — board section 07

Four elements in `src/components/nova/brand/BrandPattern.tsx`: a concentric
orbital system, a dot grid, a tilted ellipse orbit with bodies on the path,
and a diagonal hatch. Placed with `PatternMark`, absolutely positioned so
they bleed off an edge rather than sitting in the layout like a picture.

Default opacity is 3–8%. They exist to give a panel somewhere to sit and must
never compete with data for attention.

**These replaced the starfield, warp field and Y2K set, which are deleted.**
The distinction is not taste: the starfield ran a `requestAnimationFrame`
loop for the life of the session behind live telemetry — a permanent frame
cost, animating in the same field of view as numbers the operator is reading.
The board's geometry is static.

### One exception: the marketing hero

`site/assets/cosmos.js` draws a drifting starfield behind the landing page's
opening section. This is a deliberate exception, granted on the product
owner's instruction, and it is bounded so that it cannot become the thing the
rule above was written against:

| The objection | How the hero sky answers it |
|---|---|
| "a permanent frame cost" | The loop runs only while the hero intersects the viewport, and stops on `visibilitychange`. Scrolled past, it is zero cost. |
| "behind live telemetry" | It is mounted in `.hero` only. No panel, table, chart, ticker or verdict ever has moving pixels behind it. |
| "in the same field of view as numbers" | A radial mask fades it out before the copy starts, and it is hidden entirely below 900px. |
| motion as decoration | `prefers-reduced-motion` renders the field once and never animates it. The picture survives; the movement does not. |

The orbital rings in the brand lockup are the same exception on the same
terms: rotation only, hero only, stopped under reduced motion.

**This exception does not travel.** It applies to the public marketing hero
and nowhere else — not to the application, not to a panel, and not to any
surface where a number is being read. A field that drifts down the page and
ends up behind a reading is the original mistake, and should be deleted
rather than argued about.

### The second exception: the bloom and the XRP pond

The website hero is a garden: **NOSHASHI** as the title above the question,
the generated bloom (`scripts/gen-hero-bloom.mjs`) as the static centrepiece,
and an ASCII pond underneath. The owner's flower artwork was tried as an
animated hero in 1.0.7 and taken back off the home page; it remains the logo.
`src/lib/garden/field.ts` paints slow liquid folds and the **XRP
mark** into the water, sends a ring from each of the bloom's flowers and from
the pointer, and bends the mark as each ring passes, so the logo ripples like a
reflection; [asciify-engine](https://github.com/ayangabryl/asciify-engine) (MIT)
renders it as glyphs in `--brand`. Behind every page of the site, below the
hero, a second, fainter pond drifts at 20fps (opacity .24 dark, .20 light) with
the pointer's ripples and an occasional ambient ring; it pauses while the hero
fills the screen. The desktop app's landing has the pond and the XRP mark only,
with no flower artwork.

The XRP mark is drawn as the plain X of two cupped arcs that identifies the XRP
Ledger, the network this product reads. It says what the product is about; it
does not claim an affiliation.

| The objection | How it answers |
|---|---|
| "decoration is banned" | Granted explicitly, for the website's marketing hero and the console's landing scene only, and recorded here. |
| "decorative data" | Nothing here is data or resembles any: no axis, no baseline, no tick, no numeral. The glyphs are `. · : - ~ = + *`, texture and never a figure. |
| "a permanent frame cost" | Bounded rather than absent: 30fps, a source image of at most 180 columns, paused off-screen and in hidden tabs, and one still frame under `prefers-reduced-motion`. |
| "behind live telemetry" | Panels, tables, charts and verdicts all sit on opaque surfaces, so the page pond is only ever visible between them, behind plain section text at a quarter opacity. In the hero, each of the bloom's flowers keeps a clear pool, text crossing the bloom carries a ground-coloured halo, and below 1200px the node labels step aside rather than collide. |
| "a third-party asset" | The artwork is ours (`brand/flower-source.png`). The engine is bundled from npm into `site/assets/garden-field.js` and served from our own origin, so `script-src 'self'` holds; `npm run check:garden` and `npm run check:bloom` fail CI when a generated file is stale. |
| "unreadable in one theme" | Ink is read from `--brand` and re-read when the theme toggles; the artwork multiplies on the light ground so its dark haze drops out. |

**This exception does not travel.** Decoration behind a reading stays banned,
and "decorative data" stays banned without qualification.

## Signals

An alert is a **reading**, not a coloured box — `src/components/nova/Signal.tsx`.

```
CLEAR                                    14:32:08 UTC
Exitable, and the issuer has surrendered freeze   412,602 USD
The bid side holds … and lsfNoFreeze is set …
CONFIDENCE HIGH    SOURCE DEX BOOK · rvYAfW…s59B
```

Every field except the headline is optional. A signal that invents a
confidence level to fill a slot is worse than one that admits it has none.
Used by the issuer drift monitor and the exit-liquidity assessments.

## Anti-patterns

Explicitly banned in this codebase:

- Purple/blue AI gradients · glassmorphism · neon cyberpunk
- Rounded-rectangle overload · nested cards · giant glowing buttons
- Rainbow charts · gradient chart fills · fake 3D · unnecessary blur
- Decorative particles, starfields, or warp effects behind working data (the marketing hero is the single bounded exception — see the brand-pattern section)
- Emoji as interface icons · mixed icon libraries (Lucide only)
- Giant headings · fake futuristic terminology · decorative data
- **Fabricated data of any kind**, including plausible placeholder numbers in an unconfigured module
