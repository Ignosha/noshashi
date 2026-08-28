import { useEffect, useState, useCallback } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel } from "@/components/nova/Panel";
import { Signal } from "@/components/nova/Signal";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { NovaSat } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { readSync, syncFindings, type SyncReport } from "@/lib/net/sync";
import { cn } from "@/lib/utils";

/**
 * NetworkScene — free, ungated, and deliberately so.
 *
 * This is the one screen someone can use without an account, which makes it
 * the argument for the rest. It also has to be the most honest, because a
 * network status page is the easiest place in the product to assert
 * something nobody measured: one node's `server_info` under a NETWORK
 * heading is a claim about the whole ledger drawn from a single sample.
 *
 * So it queries four public nodes by name, shows what each one said, and
 * treats their disagreement as the reading. Where an operator declines to
 * publish a field, it says so rather than rendering a gap.
 */
export function NetworkScene() {
  const [report, setReport] = useState<SyncReport | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      setReport(await readSync());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const findings = report ? syncFindings(report) : [];

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="17"
        kicker="PUBLIC · MULTI-NODE · NO ACCOUNT NEEDED"
        title="LEDGER SYNC"
        sub="What four public XRPL nodes each report, and where they disagree. Free to use."
        status="go"
        statusLabel="OPEN"
      />

      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: "NODES ANSWERING",
            value: report ? `${report.reachableCount}/${report.nodes.length}` : "—",
            tone:
              report && report.reachableCount === 0
                ? ("no-go" as const)
                : report && report.reachableCount < report.nodes.length
                  ? ("hold" as const)
                  : ("default" as const),
            caveat: "queried from this machine",
          },
          {
            label: "LEDGER",
            value: report?.leaderSeq ? report.leaderSeq.toLocaleString() : "—",
            tone: "default" as const,
            caveat: "furthest-ahead node",
          },
          {
            label: "SPREAD",
            value: typeof report?.spread === "number" ? String(report.spread) : "—",
            tone:
              typeof report?.spread === "number" && report.spread > 2
                ? ("hold" as const)
                : ("default" as const),
            caveat: "ledgers between first and last",
          },
          {
            label: "FEE PRESSURE",
            value: report?.fee ? `${report.fee.pressure.toFixed(1)}x` : "—",
            tone:
              report?.fee && report.fee.pressure >= 10
                ? ("no-go" as const)
                : report?.fee && report.fee.pressure > 1
                  ? ("hold" as const)
                  : ("default" as const),
            caveat: "of the reference fee",
          },
        ].map((stat) => (
          <Panel key={stat.label} bodyClassName="p-3.5">
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              {stat.label}
            </p>
            <p
              className={cn(
                "data-font mt-1.5 text-[22px] font-[600] leading-none tabular-nums",
                stat.tone === "no-go"
                  ? "text-no-go"
                  : stat.tone === "hold"
                    ? "text-hold"
                    : "text-foreground"
              )}
            >
              {stat.value}
            </p>
            <p className="mono-font mt-1.5 text-[9px] leading-snug text-faint">
              {stat.caveat}
            </p>
          </Panel>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        <Panel
          label="NODES"
          className="min-h-0 lg:col-span-2"
          bodyClassName="min-h-0 overflow-y-auto p-0"
        >
          {(report?.nodes ?? []).map((node) => (
            <div key={node.url} className="border-b border-border/30 px-3.5 py-2.5">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "size-[6px] shrink-0 rounded-full",
                    node.reachable ? "bg-go" : "bg-no-go"
                  )}
                />
                <code className="text-[10.5px] text-muted-foreground">
                  {node.url.replace("wss://", "")}
                </code>
                {node.reachable && (
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-faint">
                    {node.roundTripMs?.toLocaleString()}ms
                  </span>
                )}
              </div>
              {node.reachable ? (
                <>
                  <p className="mono-font mt-1.5 text-[9px] tabular-nums text-faint">
                    LEDGER {node.ledgerSeq?.toLocaleString() ?? "—"}
                    {typeof node.ledgerAge === "number" && ` · ${node.ledgerAge}s OLD`}
                    {typeof report?.leaderSeq === "number" &&
                      typeof node.ledgerSeq === "number" &&
                      report.leaderSeq - node.ledgerSeq > 0 &&
                      ` · ${report.leaderSeq - node.ledgerSeq} BEHIND`}
                  </p>
                  <p className="mono-font mt-0.5 text-[9px] text-faint">
                    {node.version ? (
                      <>
                        rippled {node.version}
                        {node.serverState && ` · ${node.serverState}`}
                        {typeof node.peers === "number" && ` · ${node.peers} peers`}
                      </>
                    ) : (
                      <span className="italic">version not disclosed by operator</span>
                    )}
                  </p>
                </>
              ) : (
                <p className="mono-font mt-1.5 text-[9px] text-no-go">
                  {node.error ?? "no response"}
                </p>
              )}
            </div>
          ))}
          <div className="px-3.5 py-2.5">
            <p className="mono-font text-[9px] leading-relaxed text-faint">
              Times span DNS, TLS and the WebSocket upgrade as measured from
              this machine. They describe reachability from here, not the
              node's own speed.
            </p>
            <Button
              variant="outline"
              className="mt-2.5 w-full"
              onClick={() => void run()}
              disabled={busy}
            >
              {busy ? "QUERYING NODES…" : "QUERY AGAIN"}
            </Button>
          </div>
        </Panel>

        <Panel
          label="FINDINGS"
          className="relative min-h-0 lg:col-span-3"
          bodyClassName="min-h-0 overflow-y-auto p-0"
        >
          <PatternMark element="orbit" size={190} opacity={0.05} className="-right-10 -top-6" />
          {!report ? (
            <div className="flex h-full items-center justify-center p-8">
              <p className="mono-font text-[10px] tracking-[0.2em] text-faint">
                <NovaSat size={14} className="mr-2 inline" />
                QUERYING PUBLIC NODES…
              </p>
            </div>
          ) : (
            <>
              <div className="border-b border-border/50 px-4 py-3">
                <p className="mono-font text-[9px] tabular-nums text-faint">
                  READ {report.readAt.replace("T", " ").slice(0, 19)} UTC ·{" "}
                  {report.nodes.length} ENDPOINTS QUERIED
                </p>
              </div>
              {findings.map((f) => (
                <Signal
                  key={f.id}
                  severity={f.severity}
                  kicker={f.severity === "ok" ? "IN GOOD ORDER" : "OBSERVED"}
                  headline={f.title}
                  detail={f.detail}
                  action={f.action}
                  className="rounded-none border-b border-border/30"
                />
              ))}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
