import { useId } from "react";

/** One recorded book, one linear scale. The extrusion is illustrative only. */
export function DepthComparison({
  quoted,
  funded,
  ledgerIndex,
}: {
  quoted: number;
  funded: number;
  ledgerIndex: number;
}) {
  const hatchId = useId();
  if (
    !Number.isFinite(quoted) ||
    !Number.isFinite(funded) ||
    quoted <= 0 ||
    funded < 0
  )
    return null;
  const scale = Math.max(quoted, funded);
  const quotedWidth = (284 * quoted) / scale;
  const fundedWidth = (284 * funded) / scale;
  return (
    <svg
      viewBox="0 0 320 92"
      className="desk-depth-figure"
      role="img"
      aria-label={`Quoted ask depth ${quoted.toLocaleString()} USD; funded ask depth ${funded.toLocaleString()} USD at ledger ${ledgerIndex}`}
    >
      <defs>
        <pattern
          id={hatchId}
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 5 5 0"
            stroke="currentColor"
            strokeWidth=".5"
            opacity=".4"
          />
        </pattern>
      </defs>
      <path
        d={`M8 20 22 10H${22 + quotedWidth}L${8 + quotedWidth} 20Z`}
        fill="none"
        stroke="currentColor"
        strokeOpacity=".5"
      />
      <rect
        data-series="quoted"
        x="8"
        y="20"
        width={quotedWidth}
        height="16"
        fill={`url(#${hatchId})`}
        stroke="currentColor"
        strokeOpacity=".5"
      />
      <text x="8" y="49">
        QUOTED
      </text>
      <g transform="translate(0 50)">
        <path
          d={`M8 20 22 10H${22 + fundedWidth}L${8 + fundedWidth} 20Z`}
          fill="currentColor"
          opacity=".25"
        />
        <rect
          data-series="funded"
          x="8"
          y="20"
          width={fundedWidth}
          height="9"
          fill="currentColor"
          opacity=".65"
        />
      </g>
      <text x="8" y="91">
        FUNDED / SAME SCALE
      </text>
    </svg>
  );
}
