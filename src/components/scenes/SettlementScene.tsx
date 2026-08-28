import * as React from "react";
import { useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Gated } from "@/components/nova/Gated";
import { Signal } from "@/components/nova/Signal";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { NovaCredit, NovaSearch } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shortAddress } from "@/lib/xrpl/client";
import {
  readSettlement,
  settlementFindings,
  formatAmount,
  type SettlementReport,
} from "@/lib/desk/settlement";
import { cn } from "@/lib/utils";
import { TraceButton } from "@/lib/nav/handoff";

/**
 * SettlementScene — what a transaction actually moved.
 *
 * The whole screen is built around one comparison: requested against
 * delivered. They are shown adjacent and the same size, because the entire
 * failure mode this tool exists to prevent is someone reading the first
 * number and acting on it. The success code is deliberately not given
 * prominence — on the dangerous case it says tesSUCCESS, and a large green
 * SUCCESS badge over a 0.4% delivery would be this product arguing against
 * itself.
 */
export function SettlementScene({
  onUpgrade,
  onSignIn,
}: {
  onUpgrade: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="18"
        kicker="SETTLEMENT FORENSICS · REQUESTED VS DELIVERED"
        title="SETTLEMENT"
        sub="What a transaction actually moved, as opposed to what it asked to move."
        status="go"
        statusLabel="DESK PLAN"
      />
      <Gated
        feature="portfolios"
        onUpgrade={onUpgrade}
        onSignIn={onSignIn}
        className="min-h-0 flex-1"
      >
        <SettlementBody />
      </Gated>
    </div>
  );
}

function SettlementBody() {
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<SettlementReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const hash = query.trim();
    if (!hash || busy) return;
    if (!/^[0-9A-Fa-f]{64}$/.test(hash)) {
      setError("A transaction hash is 64 hexadecimal characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setReport(await readSettlement(hash));
    } catch (caught) {
      setReport(null);
      setError(caught instanceof Error ? caught.message : "That transaction could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const findings = report ? settlementFindings(report) : [];
  const short =
    report?.deliveredFraction !== undefined && report.deliveredFraction < 0.999999;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Requested and delivered, adjacent and equal in weight. */}
      {report?.transactionType === "Payment" && (
        <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-2">
          <Panel bodyClassName="p-3.5">
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              REQUESTED
            </p>
            <p className="data-font mt-1.5 break-all text-[20px] font-[600] leading-tight tabular-nums text-muted-foreground">
              {report.requested ? formatAmount(report.requested) : "—"}
            </p>
            <p className="mono-font mt-1.5 text-[9px] leading-snug text-faint">
              what the sender asked to deliver
            </p>
          </Panel>
          <Panel bodyClassName="p-3.5">
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              DELIVERED
            </p>
            <p
              className={cn(
                "data-font mt-1.5 break-all text-[20px] font-[600] leading-tight tabular-nums",
                short ? "text-no-go" : "text-foreground"
              )}
            >
              {report.deliveredUnavailable
                ? "NOT RECORDED"
                : report.delivered
                  ? formatAmount(report.delivered)
                  : "—"}
            </p>
            <p
              className={cn(
                "mono-font mt-1.5 text-[9px] leading-snug",
                short ? "text-no-go" : "text-faint"
              )}
            >
              {report.deliveredFraction !== undefined
                ? `${(report.deliveredFraction * 100).toFixed(4)}% of requested — this is what arrived`
                : "what actually arrived"}
            </p>
          </Panel>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <Panel label="TRANSACTION" className="shrink-0">
            <Label htmlFor="tx" className="text-[10px] tracking-wide">
              TRANSACTION HASH
            </Label>
            <Input
              id="tx"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="64 hex characters"
              spellCheck={false}
              className="mt-2 font-mono text-[11px]"
            />
            <Button className="mt-3 w-full gap-2" onClick={() => void run()} disabled={busy}>
              <NovaSearch size={14} />
              {busy ? "READING SETTLEMENT…" : "READ SETTLEMENT"}
            </Button>
            {error && <p className="mt-3 text-[11px] text-no-go">{error}</p>}
            <p className="mt-3 border-t border-border/50 pt-2.5 text-[10px] leading-relaxed text-faint">
              A payment can return{" "}
              <span className="text-muted-foreground">tesSUCCESS</span> having
              delivered a fraction of what it asked for. The success code and
              the requested amount are both true and neither tells you what you
              received — only{" "}
              <span className="text-muted-foreground">delivered_amount</span>{" "}
              does.
            </p>
          </Panel>

          {report && (
            <Panel label="RECORD" bodyClassName="p-0">
              {([
                ["TYPE", report.transactionType],
                ["RESULT", report.result],
                ["VALIDATED", report.validated ? "yes" : "NOT YET"],
                ["LEDGER", report.ledgerIndex?.toLocaleString() ?? "—"],
                [
                  "FROM",
                  <span className="inline-flex items-center gap-1.5">
                    {shortAddress(report.account)}
                    <TraceButton
                      value={report.account}
                      to="provenance"
                      from="settlement"
                      as="sender"
                    />
                  </span>,
                ],
                [
                  "TO",
                  report.destination ? (
                    <span className="inline-flex items-center gap-1.5">
                      {shortAddress(report.destination)}
                      <TraceButton
                        value={report.destination}
                        to="provenance"
                        from="settlement"
                        as="destination"
                      />
                    </span>
                  ) : (
                    "—"
                  ),
                ],
                [
                  "FEE BURNED",
                  `${(report.feeDrops / 1_000_000).toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })} XRP`,
                ],
                ["PARTIAL FLAG", report.partialFlagSet ? "SET" : "not set"],
              ] as Array<[string, React.ReactNode]>).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline gap-3 border-b border-border/30 px-3.5 py-1.5 last:border-0"
                >
                  <span className="stencil text-[8px] tracking-[0.2em] text-faint">
                    {label}
                  </span>
                  <span
                    className={cn(
                      "ml-auto font-mono text-[10.5px] tabular-nums",
                      (label === "VALIDATED" && !report.validated) ||
                        (label === "PARTIAL FLAG" && report.partialFlagSet)
                        ? "text-no-go"
                        : "text-muted-foreground"
                    )}
                  >
                    {value}
                  </span>
                </div>
              ))}
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
              icon={<NovaCredit size={16} />}
              title="NO TRANSACTION READ"
              body="Paste a transaction hash. NOSHASHI reports what it actually delivered rather than what it requested, whether it is validated, and whether crediting the stated amount would over-credit you."
            />
          ) : (
            <>
              <div className="border-b border-border/50 px-4 py-3">
                <p className="break-all font-mono text-[9.5px] text-faint">{report.hash}</p>
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
