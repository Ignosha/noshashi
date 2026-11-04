import { useId } from "react";
import type { Trace } from "@/lib/security/incident";
import { shortAddress } from "@/lib/xrpl/client";

export function EvidenceTrail({ trace }: { trace: Trace }) {
  const marker = useId().replace(/:/g, "");
  const nodes = trace.nodes.slice(0, 12);
  const columns = [...new Set(nodes.map((n) => n.depth))].sort((a, b) => a - b);
  const positions = new Map(
    nodes.map((n) => {
      const peers = nodes.filter((x) => x.depth === n.depth);
      return [
        n.address,
        {
          x: 32 + columns.indexOf(n.depth) * 200,
          y: 48 + peers.indexOf(n) * 88,
        },
      ];
    }),
  );
  const width = Math.max(440, columns.length * 200);
  const height = Math.max(
    180,
    ...nodes.map((n) => positions.get(n.address)!.y + 75),
  );
  return (
    <figure className="border border-border bg-card p-3">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: 440 }}
          className="w-full text-foreground"
          role="img"
          aria-label={`Observed transfer graph, ${nodes.length} of ${trace.nodes.length} accounts. Connections do not prove that the same funds moved or identify an attacker.`}
        >
          <defs>
            <marker
              id={marker}
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0 0 6 3 0 6" fill="none" stroke="currentColor" />
            </marker>
          </defs>
          {trace.flows.map((f, i) => {
            const a = positions.get(f.from),
              b = positions.get(f.to);
            return a && b ? (
              <path
                key={f.hash + ":" + i}
                d={`M${a.x + 136} ${a.y + 20}L${b.x} ${b.y + 20}`}
                stroke="currentColor"
                strokeOpacity=".4"
                fill="none"
                markerEnd={`url(#${marker})`}
              />
            ) : null;
          })}
          {nodes.map((n) => {
            const p = positions.get(n.address)!;
            return (
              <g key={n.address}>
                <title>
                  {n.address} · {n.status}
                </title>
                <rect
                  x={p.x}
                  y={p.y}
                  width="136"
                  height="48"
                  fill="hsl(var(--card))"
                  stroke="currentColor"
                />
                <text
                  x={p.x + 8}
                  y={p.y + 19}
                  fontSize="11"
                  fill="currentColor"
                  fontFamily="monospace"
                >
                  {shortAddress(n.address)}
                </text>
                <text
                  x={p.x + 8}
                  y={p.y + 36}
                  fontSize="10"
                  fill="currentColor"
                >
                  {n.status === "custodial"
                    ? "TAGGED / UNVERIFIED"
                    : n.status.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Showing {nodes.length} of {trace.nodes.length} accounts. These are
        observed transfers within a bounded history, not proof of stolen-fund
        attribution. Funds may be commingled. Destination tags do not verify a
        custodian’s identity. Inspect the full evidence before contacting an
        operator.
        {trace.coverage && ` Limits: ${trace.coverage.accountLimit} accounts / ${trace.coverage.flowLimit} flows. ${trace.coverage.omittedAccounts} additional destination(s) omitted.${trace.coverage.flowLimitReached ? " Flow limit reached; coverage is incomplete." : ""}`}
        {trace.nodes.some(n=>n.status === "unread" || n.truncated) && " Some history was unavailable or truncated; absence of an incident is not established."}
      </figcaption>
    </figure>
  );
}
