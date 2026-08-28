/**
 * Canvas elements cannot use CSS custom properties directly, so the
 * theme token is read once and re-read whenever the theme flips. Without
 * this the starfield paints near-white stars onto a white page.
 */
export function readInkColor(): string {
  if (typeof window === "undefined") return "#f0f0fa";
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--foreground")
    .trim();
  return raw ? `hsl(${raw})` : "#f0f0fa";
}

/** Re-read the ink whenever the theme or contrast class changes. */
export function watchInkColor(onChange: (color: string) => void): () => void {
  const observer = new MutationObserver(() => onChange(readInkColor()));
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  return () => observer.disconnect();
}
