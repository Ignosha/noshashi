/** Drawn locally so arrow glyphs do not depend on the system's fallback fonts. */
export function DeskArrow() {
  return (
    <svg
      className="desk-arrow"
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
    >
      <path d="M3 13 13 3M3 3h10v10" />
    </svg>
  );
}
