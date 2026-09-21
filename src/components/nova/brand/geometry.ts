/**
 * NOSHASHI rocket mark — authoritative path geometry.
 *
 * These coordinates are copied verbatim from the supplied SVG brand pack
 * (`noshashi-mark-color.svg`). Not one node has been moved, and none may
 * be: the artwork is the brand, and redrawing it — even "improving" a
 * curve — makes every previously shipped asset wrong.
 *
 * What *has* changed is packaging. The supplied files carry four faults
 * that make them unusable in an application, all fixable without touching
 * a coordinate:
 *
 *   1. The porthole and nose dot were painted as opaque #05070A fills
 *      rather than cut out. On any ground that is not exactly #05070A the
 *      white body vanishes and those two dark shapes are all that render —
 *      the monochrome mark is invisible on light surfaces.
 *
 *      Note the porthole is NOT a subset of the body: it overhangs the
 *      lower-left edge, so the original relies on overpainting the ground
 *      as well as the body. That rules out an `evenodd` cutout, which
 *      would fill the overhang rather than hide it. NoshashiMark scopes a
 *      <mask> to the body path instead — the overhang is clipped for
 *      free, and the artwork needs no boolean edit.
 *
 *   2. Gradient ids were global (`blue`, `metal`). Two colour marks inline
 *      on one page collide and the second silently restyles the first.
 *      Ids are now namespaced per instance via `useId()`.
 *
 *   3. The app icons nested a second <title id="title">, duplicating an id
 *      and breaking `aria-labelledby`.
 *
 *   4. The wordmark and lockups carried a baked #05070A <rect>, so they
 *      could not sit on any other surface.
 *
 * The mark is drawn in a 180×180 viewBox and reads down to 16px.
 */

/** Rocket body silhouette. */
export const BODY = "M78 119 C82 86 98 53 129 29 C139 21 149 16 160 13 C157 29 151 43 141 56 C124 79 105 96 78 119Z";

/** Porthole, as a filled shape for the colour treatment. */
export const PORTHOLE = "M95 99 C91 80 94 64 103 50 C114 59 121 70 123 83 C116 91 106 97 95 99Z";

/** Upper fin. */
export const FIN_UPPER = "M92 111 L63 132 C60 116 66 103 78 93Z";
/** Lower fin. */
export const FIN_LOWER = "M111 91 L130 118 C114 119 101 113 93 103Z";
/** Exhaust plume, near element. */
export const PLUME_NEAR = "M82 121 L67 150 L94 132Z";
/** Exhaust plume, far element. */
export const PLUME_FAR = "M73 143 L61 164 L84 151Z";

/** The two orbital arcs, stroked. */
export const ORBIT_UPPER = "M76 20 A56 56 0 0 1 150 68";
export const ORBIT_LOWER = "M164 92 A56 56 0 0 1 86 156";

/** Orbital node sitting on the upper arc terminus. */
export const NODE = { cx: 151, cy: 69, r: 7 } as const;

/** Nose dot centre, for the colour treatment where it is drawn not cut. */
export const NOSE_DOT = { cx: 129, cy: 63, r: 5 } as const;

export const VIEWBOX = "0 0 180 180";

/**
 * Tight viewBox around the rocket alone — body, fins and plume, no orbit.
 *
 * The orbital arcs are stroked at 7 units in a 180 grid, so below roughly
 * 24px they render sub-pixel and alias into grey mush that reads as noise
 * rather than as a mark. Verified by rasterising at 16/20/24/32. The
 * compact form drops them and crops to the rocket, which stays legible at
 * 16px. It is a subset of the same paths — nothing is redrawn.
 */
export const VIEWBOX_COMPACT = "58 10 108 158";

/** Below this pixel size the full mark stops being legible. */
export const COMPACT_THRESHOLD = 24;

/**
 * App-icon transform.
 *
 * The supplied icons used `translate(166 166) scale(1)`, placing the
 * 180-unit mark inside a 512 canvas at 35% fill — a small rocket adrift in
 * a large square. Apple's icon grid wants the glyph at roughly 70–80%.
 *
 * Naively centring on the viewBox is also wrong: the artwork is not
 * centred within its own 180 grid. Rasterised at 1800px, the ink measures
 * x[61.0, 169.1] y[13.0, 164.7] — 108×152, centred at (115.1, 88.9), well
 * right of centre. These values fit that measured box to 76% of a 512
 * canvas and centre it optically.
 */
export const ICON_TRANSFORM = "translate(-39.1 28.1) scale(2.5651)";
export const ICON_INK_BBOX = { x: 61.0, y: 13.0, w: 108.1, h: 151.7 } as const;
