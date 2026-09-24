import { useEffect, useRef, useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Gated } from "@/components/nova/Gated";
import { NovaGrid, NovaSearch } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchIssuerObligations, fetchTrustLines, fetchWalletTransactions } from "@/lib/xrpl/client";
import { readSettlement, settlementFindings } from "@/lib/desk/settlement";
import {
  GEOMETRY,
  accountColumn,
  accountNode,
  askAiPrompt,
  evidenceColumn,
  holdersColumn,
  layoutGarden,
  markIssuer,
  subjectKind,
  txNode,
  type GardenColumn,
  type GardenKind,
  type GardenNode,
  type GardenTone,
} from "@/lib/garden/graph";
import { useClaimedSubject, useHandoff } from "@/lib/nav/handoff";
import { InvestigateIssuerButton } from "@/components/nova/InvestigateIssuerButton";
import { cn } from "@/lib/utils";

/** Bitstamp's issuing account — a long-lived mainnet issuer to start from. */
const EXAMPLE_ISSUER = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";

const KIND_LABEL: Record<GardenKind, string> = {
  issuer: "ISSUER",
  account: "ACCOUNT",
  asset: "ASSET",
  tx: "TX",
  evidence: "EVIDENCE",
};

const TONE_EDGE: Record<GardenTone, string> = {
  go: "border-l-go",
  hold: "border-l-hold",
  "no-go": "border-l-no-go",
  neutral: "border-l-border",
};

/**
 * LEDGER GARDEN — the garden as navigation.
 *
 * Start from an issuer, an account or a transaction and grow the graph
 * one read at a time: issuer → the assets it issues → who holds one →
 * what that holder has sent → what one transaction proves → a question
 * for the agent carrying the whole path. Each branch is read from
 * validated mainnet state when it is clicked, and says which ledger it
 * came from.
 */
export function GardenScene({ onUpgrade, onSignIn }: { onUpgrade: () => void; onSignIn: () => void }) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="32"
        kicker="RELATIONSHIPS · ISSUER → ASSET → HOLDER → TRANSACTION → EVIDENCE"
        title="LEDGER GARDEN"
        sub="Walk the ledger's relationships one read at a time. Every branch is grown from validated mainnet state."
        status="go"
        statusLabel="DESK PLAN"
      />
      <Gated feature="portfolios" onUpgrade={onUpgrade} onSignIn={onSignIn} className="min-h-0 flex-1">
        <GardenBody />
      </Gated>
    </div>
  );
}

/** What clicking a node reads. */
async function grow(node: GardenNode): Promise<GardenColumn | null> {
  switch (node.kind) {
    case "issuer":
    case "account": {
      const address = node.ref.address!;
      const [obligations, lines, txs] = await Promise.all([
        fetchIssuerObligations(address),
        fetchTrustLines(address),
        fetchWalletTransactions(address, 10),
      ]);
      return accountColumn(node.id, obligations, lines, txs);
    }
    case "asset": {
      const lines = await fetchTrustLines(node.ref.issuer!);
      return holdersColumn(node.id, node.ref.issuer!, node.ref.currency!, lines, lines.length);
    }
    case "tx": {
      const report = await readSettlement(node.ref.hash!);
      return evidenceColumn(node.id, report, settlementFindings(report));
    }
    case "evidence":
      return null;
  }
}

/** Exported for the harness; the scene wraps it in the plan gate. */
export function GardenBody({ initial }: { initial?: { columns: GardenColumn[]; path: string[] } } = {}) {
  const handOff = useHandoff();
  const [query, setQuery] = useState("");
  const [columns, setColumns] = useState<GardenColumn[]>(initial?.columns ?? []);
  const [path, setPath] = useState<string[]>(initial?.path ?? []);
  const [growing, setGrowing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A click supersedes any read still in flight from an earlier one.
  const turn = useRef(0);
  const canvas = useRef<HTMLDivElement>(null);

  // Follow the growth: on a narrow screen the newest branch is off to the right.
  useEffect(() => {
    const el = canvas.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [columns.length, growing]);

  const select = async (node: GardenNode, column: number, base = columns) => {
    const kept = base.slice(0, column + 1);
    const nextPath = [...path.slice(0, column), node.id];
    setColumns(kept);
    setPath(nextPath);
    setError(null);
    if (!node.expandable) return;
    const mine = ++turn.current;
    setGrowing(column + 1);
    try {
      const grown = await grow(node);
      if (mine !== turn.current || !grown) return;
      const withKind = grown.title === "ISSUER" ? kept.map((c, i) => (i === column ? markIssuer(c, node.id) : c)) : kept;
      setColumns([...withKind, grown]);
    } catch (caught) {
      if (mine !== turn.current) return;
      setError(caught instanceof Error ? caught.message : "That branch could not be read.");
    } finally {
      if (mine === turn.current) setGrowing(null);
    }
  };

  const start = (given?: string) => {
    const value = (given ?? query).trim();
    if (given !== undefined) setQuery(given);
    const kind = subjectKind(value);
    if (!kind) {
      setError("Paste an XRPL address (r…) or a 64-character transaction hash.");
      return;
    }
    const root = kind === "tx" ? txNode(value) : accountNode(value, false, "where this walk starts");
    const rootColumn: GardenColumn = { parentId: null, title: "START", nodes: [root], state: "YOUR INPUT" };
    setPath([]);
    void select(root, 0, [rootColumn]);
  };

  useClaimedSubject("garden", (subject) => start(subject.value));

  const layout = layoutGarden(columns, path);
  const pathNodes = path
    .map((id, c) => columns[c]?.nodes.find((node) => node.id === id))
    .filter((node): node is GardenNode => Boolean(node));
  const selected = pathNodes[pathNodes.length - 1];
  const { colWidth, colGap, header } = GEOMETRY;
  const canvasWidth = Math.max(layout.width, growing !== null ? (growing + 1) * colWidth + growing * colGap : 0);
  const canvasHeight = Math.max(layout.height, header + 60);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Panel label="START" className="shrink-0" bodyClassName="p-3">
        <Label htmlFor="garden-subject" className="text-[10px] tracking-wide">
          ISSUER, ACCOUNT OR TRANSACTION
        </Label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            id="garden-subject"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            placeholder="r… address or 64-character hash"
            spellCheck={false}
            className="min-w-0 flex-1 font-mono text-[11px]"
          />
          <Button className="shrink-0 gap-2" onClick={() => start()} disabled={growing !== null}>
            <NovaSearch size={14} />
            GROW
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-[11px] text-no-go">
            {error}
          </p>
        )}
      </Panel>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-4">
        <Panel label="GARDEN" className="relative min-h-0 lg:col-span-3" bodyClassName="min-h-0 p-0">
          <div ref={canvas} className="h-full min-h-0 overflow-auto p-3">
          {columns.length === 0 ? (
            <EmptyState
              icon={<NovaGrid size={16} />}
              title="NOTHING PLANTED"
              body="Start from an issuer, an account or a transaction. Each click reads validated mainnet state and grows the next branch: an issuer's assets, an asset's holders, an account's holdings and transactions, a transaction's evidence."
              action={
                <Button variant="outline" size="sm" onClick={() => start(EXAMPLE_ISSUER)}>
                  Start from Bitstamp&apos;s issuer
                </Button>
              }
            />
          ) : (
            <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
              <svg className="pointer-events-none absolute inset-0" width={canvasWidth} height={canvasHeight} aria-hidden="true">
                {layout.stems.map((stem) => (
                  <path
                    key={`${stem.column}:${stem.to}`}
                    d={stem.d}
                    fill="none"
                    className={stem.selected ? "text-go" : "text-border"}
                    stroke="currentColor"
                    strokeWidth={stem.selected ? 1.6 : 1}
                    strokeDasharray={stem.selected ? undefined : "2 3"}
                  />
                ))}
              </svg>

              {columns.map((column, c) => (
                <div key={`h${c}`} className="absolute" style={{ left: c * (colWidth + colGap), top: 0, width: colWidth }}>
                  <p className="stencil truncate text-[9px] tracking-[0.2em] text-foreground">{column.title}</p>
                  <p
                    className={cn(
                      "data-font truncate text-[8px] tracking-[0.12em]",
                      column.state.startsWith("NOT") ? "text-no-go" : "text-faint"
                    )}
                  >
                    {column.state}
                  </p>
                </div>
              ))}
              {layout.groups.map((g) => (
                <p
                  key={`g${g.column}:${g.text}`}
                  className="stencil absolute text-[7.5px] tracking-[0.24em] text-muted-foreground"
                  style={{ left: g.x, top: g.y - 8 }}
                >
                  {g.text}
                </p>
              ))}

              {layout.nodes.map((p) => (
                <button
                  key={`${p.column}:${p.node.id}`}
                  type="button"
                  onClick={() => void select(p.node, p.column)}
                  aria-pressed={p.selected}
                  title={p.node.detail}
                  className={cn(
                    "absolute flex flex-col justify-center border border-l-2 px-2 text-left transition-colors",
                    TONE_EDGE[p.node.tone],
                    p.selected ? "border-go/70 bg-go/10" : "border-border bg-background hover:border-foreground/40"
                  )}
                  style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="data-font min-w-0 flex-1 truncate text-[10.5px] text-foreground">{p.node.label}</span>
                    <span className="stencil shrink-0 text-[7px] tracking-[0.2em] text-faint">{KIND_LABEL[p.node.kind]}</span>
                  </span>
                  <span className="truncate text-[9px] text-muted-foreground">{p.node.detail}</span>
                </button>
              ))}

              {growing !== null && (
                <p
                  role="status"
                  className="stencil absolute animate-pulse text-[9px] tracking-[0.2em] text-go"
                  style={{ left: growing * (colWidth + colGap), top: header }}
                >
                  GROWING — READING THE LEDGER…
                </p>
              )}
            </div>
          )}
          </div>
        </Panel>

        <div className="flex min-h-0 flex-col gap-3">
          <Panel label="SELECTED" className="shrink-0" bodyClassName="p-3">
            {!selected ? (
              <p className="text-[11px] text-muted-foreground">Nothing selected yet.</p>
            ) : (
              <>
                <p className="stencil text-[8px] tracking-[0.22em] text-faint">{KIND_LABEL[selected.kind]}</p>
                <p className="data-font selectable mt-1 break-all text-[11px] text-foreground">
                  {selected.ref.hash ?? selected.ref.address ?? `${selected.label}`}
                </p>
                {selected.kind === "asset" && (
                  <p className="data-font selectable mt-0.5 break-all text-[9.5px] text-muted-foreground">
                    issued by {selected.ref.issuer}
                  </p>
                )}
                <p className="mt-2 text-[10.5px] leading-relaxed text-foreground/85">{selected.detail}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => handOff({ scene: "agent", from: "garden", value: askAiPrompt(pathNodes) })}
                  >
                    ASK AI ABOUT THIS PATH
                  </Button>
                  {(selected.kind === "tx" || selected.kind === "evidence") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handOff({ scene: "settlement", from: "garden", value: selected.ref.hash! })}
                    >
                      OPEN IN SETTLEMENT
                    </Button>
                  )}
                  {selected.kind === "issuer" && <InvestigateIssuerButton issuer={selected.ref.address!} from="garden" />}
                  {selected.kind === "asset" && <InvestigateIssuerButton issuer={selected.ref.issuer!} from="garden" />}
                  {(selected.kind === "account" || selected.kind === "issuer") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handOff({ scene: "provenance", from: "garden", value: selected.ref.address! })}
                    >
                      OPEN IN PROVENANCE
                    </Button>
                  )}
                </div>
              </>
            )}
          </Panel>

          <Panel label="PATH" className="min-h-0 flex-1" bodyClassName="min-h-0 overflow-y-auto p-3">
            {pathNodes.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">The path you walk is listed here, step by step.</p>
            ) : (
              <ol className="space-y-1.5">
                {pathNodes.map((node, i) => (
                  <li key={`${i}:${node.id}`} className="text-[10.5px] leading-snug">
                    <span className="stencil mr-1.5 text-[7.5px] tracking-[0.2em] text-faint">{KIND_LABEL[node.kind]}</span>
                    <span className="data-font text-foreground">{node.label}</span>
                    <span className="block text-[9.5px] text-muted-foreground">{node.detail}</span>
                  </li>
                ))}
              </ol>
            )}
            {columns.some((c) => c.note) && (
              <div className="mt-3 space-y-1.5 border-t border-border/50 pt-2.5">
                {columns.map((c, i) =>
                  c.note ? (
                    <p key={`n${i}`} className="text-[9.5px] leading-relaxed text-faint">
                      <span className="stencil mr-1 text-[7.5px] tracking-[0.2em] text-muted-foreground">{c.title}</span>
                      {c.note}
                    </p>
                  ) : null
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
