import { useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, StatCell } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Gated } from "@/components/nova/Gated";
import { Signal } from "@/components/nova/Signal";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { NovaGrid, NovaSearch } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shortAddress, isValidAddress } from "@/lib/xrpl/client";
import { readAmm, ammFindings, type AmmReport } from "@/lib/desk/amm";
import { cn } from "@/lib/utils";

/**
 * AmmScene — who sets the price of trading against a pool.
 *
 * An AMM has no operator. Its fee is voted on by liquidity providers by
 * weight, and a separate auction slot sells a discounted fee for a day.
 * Explorers render the fee, which is the output. This renders the two things
 * that produce it: how much of the pool actually voted, and who is currently
 * trading against it more cheaply than everyone else.
 */
export function AmmScene({
  onUpgrade,
  onSignIn,
}: {
  onUpgrade: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="16"
        kicker="AMM GOVERNANCE · FEE VOTES · AUCTION SLOT"
        title="POOL GOVERNANCE"
        sub="Who votes the trading fee on an XRPL AMM, on what share of the liquidity, and who holds the discount right now."
        status="go"
        statusLabel="DESK PLAN"
      />
      <Gated
        feature="portfolios"
        onUpgrade={onUpgrade}
        onSignIn={onSignIn}
        className="min-h-0 flex-1"
      >
        <AmmBody />
      </Gated>
    </div>
  );
}

function AmmBody() {
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<AmmReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const account = query.trim();
    if (!account || busy) return;
    if (!isValidAddress(account)) {
      setError("That is not a valid XRPL address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setReport(await readAmm({ ammAccount: account }));
    } catch (caught) {
      setReport(null);
      setError(caught instanceof Error ? caught.message : "That pool could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const findings = report ? ammFindings(report) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {report && (
        <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            {
              label: "TRADING FEE",
              value: `${report.tradingFeePct.toFixed(3)}%`,
              tone: "default" as const,
              caveat: report.pair,
            },
            {
              label: "LIQUIDITY VOTING",
              value: `${(report.participation * 100).toFixed(2)}%`,
              tone:
                report.participation < 0.1 && report.votes.length > 0
                  ? ("no-go" as const)
                  : ("default" as const),
              caveat: `${report.votes.length} of 8 vote slots used`,
            },
            {
              label: "LARGEST VOTER",
              value: report.votes[0]
                ? `${(report.votes[0].weightOfCast * 100).toFixed(1)}%`
                : "—",
              tone:
                (report.votes[0]?.weightOfCast ?? 0) >= 0.5
                  ? ("no-go" as const)
                  : ("default" as const),
              caveat: report.votes[0] ? "of weight cast" : "no votes cast",
            },
            {
              label: "AUCTION SLOT",
              value: !report.auction
                ? "NONE"
                : report.auction.expired
                  ? "EXPIRED"
                  : `${report.auction.discountedFeePct.toFixed(3)}%`,
              tone:
                report.auction && !report.auction.expired
                  ? ("hold" as const)
                  : ("default" as const),
              caveat:
                report.auction && !report.auction.expired
                  ? "held — discount active"
                  : "everyone pays the same fee",
            },
          ].map((stat) => (
            <StatCell
              key={stat.label}
              label={stat.label}
              value={stat.value}
              caveat={stat.caveat}
              tone={stat.tone}
            />
          ))}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <Panel label="POOL" className="shrink-0">
            <Label htmlFor="amm" className="text-[10px] tracking-wide">
              AMM ACCOUNT
            </Label>
            <Input
              id="amm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="r…"
              spellCheck={false}
              className="mt-2 font-mono text-[12px]"
            />
            <Button className="mt-3 w-full gap-2" onClick={() => void run()} disabled={busy}>
              <NovaSearch size={14} />
              {busy ? "READING POOL GOVERNANCE…" : "READ POOL GOVERNANCE"}
            </Button>
            {error && <p className="mt-3 text-[11px] text-no-go">{error}</p>}
            <p className="mt-3 border-t border-border/50 pt-2.5 text-[10px] leading-relaxed text-faint">
              An AMM account is created by the protocol, not by a person — it
              is not an ordinary wallet. Vote weight is a share of{" "}
              <span className="text-muted-foreground">LP token supply</span>,
              so a pool where little of the supply has voted has its fee set by
              a fraction of its own liquidity.
            </p>
          </Panel>

          {report && report.votes.length > 0 && (
            <Panel
              label="FEE VOTES"
              className="min-h-0 flex-1"
              bodyClassName="min-h-0 overflow-y-auto p-0"
            >
              {report.votes.map((v) => {
                const controlling = v.weightOfCast >= 0.5;
                return (
                  <div key={v.account} className="border-b border-border/30 px-3.5 py-2">
                    <div className="flex items-baseline gap-2">
                      <code className="text-[10.5px] text-muted-foreground">
                        {shortAddress(v.account)}
                      </code>
                      <span className="ml-auto font-mono text-[10px] tabular-nums text-faint">
                        votes {v.votedFeePct.toFixed(3)}%
                      </span>
                      <span
                        className={cn(
                          "font-mono text-[11px] tabular-nums",
                          controlling ? "text-no-go" : "text-foreground"
                        )}
                      >
                        {(v.weightOfCast * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-[3px] w-full bg-border/60">
                      <div
                        className={cn("h-full", controlling ? "bg-no-go" : "bg-brand")}
                        style={{ width: `${Math.min(100, v.weightOfCast * 100)}%` }}
                      />
                    </div>
                    <p className="mono-font mt-1 text-[8.5px] tabular-nums text-faint">
                      {(v.weightOfSupply * 100).toFixed(3)}% OF LP SUPPLY
                    </p>
                  </div>
                );
              })}
              <div className="px-3.5 py-2.5">
                <p className="mono-font text-[9px] leading-snug text-faint">
                  Bars show share of weight <span className="text-muted-foreground">cast</span>.
                  The line beneath each is share of total LP supply — the gap
                  between them is the liquidity that did not vote.
                </p>
              </div>
            </Panel>
          )}
        </div>

        <Panel
          label="FINDINGS"
          className="relative min-h-0 lg:col-span-3"
          bodyClassName="min-h-0 overflow-y-auto p-0"
        >
          <PatternMark element="orbit" size={190} opacity={0.05} className="-right-10 -top-6" />
          {!report ? (
            <EmptyState
              icon={<NovaGrid size={16} />}
              title="NO POOL READ"
              body="Enter an AMM account. NOSHASHI reports who voted the trading fee and on what share of the liquidity, whether anyone currently holds the discounted auction slot, and whether either side of the pair is frozen."
            />
          ) : (
            <>
              <div className="border-b border-border/50 px-4 py-3">
                <p className="font-mono text-[10px] text-muted-foreground">
                  {report.pair}
                  <span className="ml-2 text-faint">{shortAddress(report.account)}</span>
                </p>
                <p className="mt-1 font-mono text-[9px] tabular-nums text-faint">
                  LEDGER {report.ledgerIndex.toLocaleString()} · CLOSED{" "}
                  {report.ledgerCloseTime.toISOString().replace("T", " ").slice(0, 16)} UTC
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
