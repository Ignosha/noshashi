import { DeskArrow } from "@/components/nova/DeskArrow";
import { useId, useState } from "react";

const LAYERS = [
  {
    label: "Authority",
    title: "Read the powers behind the promise.",
    copy: "Inspect issuer flags, signing authority and the controls that can affect a holder.",
    scene: "authority",
  },
  {
    label: "Liquidity",
    title: "Measure what can actually move.",
    copy: "Compare quoted offers with funded depth. Inspect the book before relying on its headline.",
    scene: "book",
  },
  {
    label: "Evidence",
    title: "Follow the answer to its source.",
    copy: "Inspect the recorded ledger, the rules evaluated and the fingerprint of the decision.",
    scene: "workstation",
  },
] as const;

/** Explanatory geometry, never a chart or a claim about measured coverage. */
export function LedgerInstrument({
  onNavigate,
}: {
  onNavigate: (scene: string) => void;
}) {
  const [selected, setSelected] = useState(0);
  const uid = useId();
  const topic = LAYERS[selected];
  return (
    <figure className="desk-instrument">
      <div className="desk-figure-meta">
        <span>Fig. 01 / The investigation</span>
        <span>Three connected questions</span>
      </div>
      <div className="desk-instrument-stage" aria-hidden="true">
        <svg viewBox="0 0 500 310" className="desk-instrument-svg">
          <defs>
            <linearGradient id={`${uid}-metal`} x1="0" x2="1" y2="1">
              <stop stopColor="currentColor" stopOpacity=".65" />
              <stop offset=".45" stopColor="currentColor" stopOpacity=".1" />
              <stop offset="1" stopColor="currentColor" stopOpacity=".45" />
            </linearGradient>
          </defs>
          <path d="M25 244H475M250 16V282" className="desk-axis" />
          {[0, 1, 2].map((i) => (
            <g
              key={i}
              className="desk-instrument-layer"
              style={{ transform: `translateY(${selected === i ? -12 : 0}px)` }}
            >
              <ellipse
                cx="250"
                cy={104 + i * 52}
                rx={166 - i * 25}
                ry={54 - i * 7}
                fill="none"
                stroke={`url(#${uid}-metal)`}
                strokeWidth={selected === i ? 1.8 : 0.7}
              />
              <ellipse
                cx="250"
                cy={109 + i * 52}
                rx={166 - i * 25}
                ry={54 - i * 7}
                fill="none"
                stroke="currentColor"
                strokeOpacity=".12"
                strokeWidth=".7"
              />
              <path
                d={`M${416 - i * 25} ${104 + i * 52}h${20 + i * 10}`}
                stroke="currentColor"
                strokeOpacity=".4"
                fill="none"
              />
              <text
                x={444 - i * 15}
                y={108 + i * 52}
                className="desk-diagram-label"
              >
                0{i + 1}
              </text>
            </g>
          ))}
          <path
            d="M250 53v168"
            stroke="currentColor"
            strokeDasharray="2 5"
            strokeOpacity=".25"
          />
          <circle
            cx="250"
            cy="155"
            r="31"
            fill="var(--desk-ground)"
            stroke="currentColor"
            strokeOpacity=".55"
          />
          <text x="250" y="168" textAnchor="middle" className="desk-monogram">
            N
          </text>
          <text
            x="250"
            y="289"
            textAnchor="middle"
            className="desk-diagram-caption"
          >
            AUTHORITY · LIQUIDITY · EVIDENCE
          </text>
        </svg>
      </div>
      <div
        className="desk-layer-controls"
        role="group"
        aria-label="Explore the investigation"
      >
        {LAYERS.map((layer, i) => (
          <button
            key={layer.label}
            type="button"
            aria-pressed={selected === i}
            aria-controls={`${uid}-detail`}
            onClick={() => setSelected(i)}
          >
            <span>0{i + 1}</span>
            {layer.label}
          </button>
        ))}
      </div>
      <div
        id={`${uid}-detail`}
        className="desk-layer-detail"
        aria-live="polite"
      >
        <h3>{topic.title}</h3>
        <p>{topic.copy}</p>
        <button
          type="button"
          className="desk-text-link"
          onClick={() => onNavigate(topic.scene)}
        >
          Open {topic.label.toLowerCase()} <DeskArrow />
        </button>
      </div>
      <figcaption className="desk-figure-note">
        Explanatory diagram. Select a layer to investigate the ledger.
      </figcaption>
    </figure>
  );
}
