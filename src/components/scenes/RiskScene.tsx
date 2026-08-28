import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Gated } from "@/components/nova/Gated";
import { CountUp } from "@/components/nova/CountUp";
import { Signal } from "@/components/nova/Signal";
import { Meter } from "@/components/nova/Charts";
import { NovaBolt, NovaGrid, NovaShield, NovaVault } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shortAddress } from "@/lib/xrpl/client";
import { useIssuerRisk } from "@/lib/desk/useRisk";
import { useExitLiquidity } from "@/lib/desk/useLiquidity";
import { EXIT_COPY } from "@/lib/desk/liquidity";
import {
  analyseConcentration,
  analyseTravelRule,
  concentrationFindings,
  issuerFindings,
  TRAVEL_RULE_PRESETS,
  type Finding,
  type Severity,
} from "@/lib/desk/risk";
import { useBilling } from "@/lib/billing/useEntitlements";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

const tone: Record<Severity, string> = {
  critical: "text-no-go",
  warn: "text-hold",
  info: "text-muted-foreground",
  ok: "text-go",
};
const dot: Record<Severity, string> = {
  critical: "bg-no-go",
  warn: "bg-hold",
  info: "bg-muted-foreground",
  ok: "bg-go",
};

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={SPRING}
      className={cn(
        // inset-row rather than a second bordered box: the left rule already
        // carries severity, so a full frame adds nothing but a rectangle.
        "inset-row border-l-2 p-3",
        finding.severity === "critical" && "border-l-no-go",
        finding.severity === "warn" && "border-l-hold",
        finding.severity === "ok" && "border-l-go",
        finding.severity === "info" && "border-l-muted-foreground"
      )}
    >
      <p className={cn("text-[11.5px] font-medium", tone[finding.severity])}>
        {finding.title}
      </p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
        {finding.detail}
      </p>
      {finding.action && (
        <p className="mono-font mt-1.5 border-t border-border/40 pt-1.5 text-[9px] text-foreground/70">
          → {finding.action}
        </p>
      )}
    </motion.div>
  );
}

/**
 * RiskScene — the three institutional exposures XRPL leaves unmeasured.
 *
 * Issuer freeze rights, Travel Rule reach, and counterparty
 * concentration. Each is read from validated ledger state, and where a
 * number depends on an operator input the input is on screen rather
 * than hidden in an assumption.
 */
export function RiskScene({
  data,
  onUpgrade,
  onSignIn,
}: {
  data: XrplState;
  onUpgrade: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-3 p-4">
      <SceneHeader
        index="13"
        kicker="INSTITUTIONAL RISK · ISSUED CURRENCY · FATF R.16"
        title="EXPOSURE ANALYSIS"
        sub="Freeze rights, Travel Rule reach and counterparty concentration — read from the ledger, not estimated."
        status="go"
        statusLabel="DESK PLAN"
      />
      <Gated
        feature="portfolios"
        onUpgrade={onUpgrade}
        onSignIn={onSignIn}
        className="min-h-0 flex-1"
      >
        <RiskBody data={data} onUpgrade={onUpgrade} />
      </Gated>
    </div>
  );
}

function RiskBody({
  data,
  onUpgrade,
}: {
  data: XrplState;
  onUpgrade: () => void;
}) {
  const { has } = useBilling();
  const [tab, setTab] = useState<
    "issuers" | "exit" | "travel" | "concentration"
  >("issuers");
  const [rate, setRate] = useState("2.40");
  const [preset, setPreset] = useState(0);

  const address = data.account?.address;
  const { lines, exposures, loading, error, reload } = useIssuerRisk(address);

  // The market half. Joined to the compliance half above by assessExit:
  // freeze rights say whether an issuer *may* immobilise a balance, the
  // book says whether anyone would buy it if they didn't.
  const liq = useExitLiquidity(exposures);
  const trappedCount = liq.assessments.filter((a) => a.verdict === "trapped").length;

  const issuerResults = useMemo(() => issuerFindings(exposures), [exposures]);

  const travel = useMemo(() => {
    const chosen = TRAVEL_RULE_PRESETS[preset];
    return analyseTravelRule(data.transactions, {
      thresholdFiat: chosen.thresholdFiat,
      currency: chosen.currency,
      xrpRate: Number(rate) || 0,
    });
  }, [data.transactions, preset, rate]);

  const concentration = useMemo(
    () => analyseConcentration(data.transactions),
    [data.transactions]
  );
  const concentrationResults = useMemo(
    () => concentrationFindings(concentration),
    [concentration]
  );

  const frozenCount = exposures.filter((e) => e.severity === "critical").length;
  const freezableValue = exposures
    .filter((e) => !e.posture.noFreeze && !e.posture.globalFreeze)
    .reduce((sum, e) => sum + e.balance, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Headline exposure */}
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "ISSUED POSITIONS", value: lines.filter((l) => l.balance > 0).length, tone: "default" as const },
          { label: "IMMOBILISED", value: frozenCount, tone: frozenCount > 0 ? ("no-go" as const) : ("default" as const) },
          { label: "FREEZABLE VALUE", value: freezableValue, tone: "hold" as const, dp: 2 },
          { label: "COUNTERPARTY HHI", value: concentration.hhi, tone: concentration.hhi > 2500 ? ("no-go" as const) : ("default" as const) },
        ].map((stat) => (
          <Panel key={stat.label} bodyClassName="p-3">
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              {stat.label}
            </p>
            <p
              className={cn(
                "data-font mt-1.5 text-[22px] font-[600] leading-none",
                stat.tone === "no-go" ? "text-no-go" : stat.tone === "hold" ? "text-hold" : "text-foreground"
              )}
            >
              <CountUp value={stat.value} decimals={stat.dp ?? 0} />
            </p>
          </Panel>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-5 gap-3">
        <Panel
          label={
            tab === "issuers"
              ? "ISSUER & FREEZE EXPOSURE"
              : tab === "travel"
                ? "TRAVEL RULE SCOPE"
                : "COUNTERPARTY CONCENTRATION"
          }
          corners
          className="col-span-3 min-h-0"
          bodyClassName="min-h-0 overflow-y-auto p-0"
          right={
            <div className="flex items-center gap-2">
              <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                <TabsList>
                  <TabsTrigger value="issuers">ISSUERS</TabsTrigger>
                  <TabsTrigger value="exit">
                    EXIT
                    {trappedCount > 0 && (
                      <span className="ml-1.5 bg-no-go px-1 text-[9px] font-bold text-background">
                        {trappedCount}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="travel">TRAVEL RULE</TabsTrigger>
                  <TabsTrigger value="concentration">BOOK</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
                {loading ? "READING…" : "RESCAN"}
              </Button>
            </div>
          }
        >
          {tab === "issuers" && (
            <div>
              {error ? (
                <EmptyState icon={<NovaShield size={16} />} title="TRUST LINES UNREADABLE" body={error} />
              ) : exposures.length === 0 ? (
                <EmptyState
                  icon={<NovaVault size={16} />}
                  title={loading ? "READING TRUST LINES…" : "NO ISSUED POSITIONS"}
                  body="This account holds no issued-currency balances, so it carries no freeze exposure. Only XRP itself is held, which no issuer can immobilise."
                />
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b border-border">
                      {["", "ISSUER", "CURRENCY", "BALANCE", "FREEZE POSTURE"].map((h, i) => (
                        <th key={i} className="stencil px-3 py-2 text-[8px] font-medium tracking-[0.2em] text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exposures.map((e) => (
                      <tr key={e.issuer} className="border-b border-border/30 hover:bg-secondary/40">
                        <td className="px-3 py-2"><span className={cn("block h-1.5 w-1.5", dot[e.severity])} /></td>
                        <td className="mono-font selectable px-3 py-2 text-[10px] text-foreground">
                          {e.domain ?? shortAddress(e.issuer)}
                        </td>
                        <td className="mono-font px-3 py-2 text-[10px] text-muted-foreground">
                          {e.currencies.join(", ")}
                        </td>
                        <td className="mono-font px-3 py-2 text-[10px] tabular-nums text-foreground">
                          {e.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className={cn("px-3 py-2 text-[10px] leading-snug", tone[e.severity])}>
                          {e.headline}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}


          {tab === "exit" && (
            <div className="flex flex-col">
              <div className="border-b border-border/60 px-4 py-2.5 text-[10px] leading-relaxed text-faint">
                Every position walked against the live XRPL DEX bid side and
                its AMM pool, then joined to the issuer&rsquo;s freeze rights.
                A balance is only an asset if the issuer cannot immobilise it{" "}
                <em>and</em> somebody will buy it.
                {liq.omitted > 0 && (
                  <span className="mt-1 block text-hold">
                    Showing the {liq.assessments.length} largest positions;{" "}
                    {liq.omitted} more not read this pass.
                  </span>
                )}
                {liq.error && <span className="mt-1 block text-hold">{liq.error}</span>}
              </div>

              {liq.loading && liq.assessments.length === 0 ? (
                <div className="divide-y divide-border/40">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="animate-pulse px-4 py-4">
                      <div className="h-3 w-1/3 bg-muted" />
                      <div className="mt-2 h-2 w-2/3 bg-muted/60" />
                    </div>
                  ))}
                </div>
              ) : liq.assessments.length === 0 ? (
                <EmptyState
                  icon={<NovaVault size={16} />}
                  title="NO ISSUED POSITIONS"
                  body="This account holds no issued-currency balances, so there is no exit to assess. Load a wallet holding issued assets."
                />
              ) : (
                <div className="divide-y divide-border/40">
                  {liq.assessments.map((a) => (
                    <Signal
                      key={`${a.currency}:${a.issuer}`}
                      severity={a.severity}
                      headline={a.headline}
                      detail={a.detail}
                      action={a.action}
                      magnitude={`${a.position.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })} ${a.currency}`}
                      confidence={
                        a.verdict === "trapped"
                          ? "HIGH"
                          : a.verdict === "constrained"
                            ? "MEDIUM"
                            : "HIGH"
                      }
                      source={`DEX BOOK · ${shortAddress(a.issuer)}`}
                      kicker={EXIT_COPY[a.verdict].label}
                      className="rounded-none border-b border-border/30"
                    >
                      <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[10px] tabular-nums text-faint">
                        <span>
                          BID DEPTH{" "}
                          <span className="text-muted-foreground">
                            {a.depthBid.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                            {a.currency}
                          </span>
                        </span>
                        {a.depthRatio !== undefined && (
                          <span>
                            POSITION / BOOK{" "}
                            <span className="text-muted-foreground">
                              {(a.depthRatio * 100).toFixed(1)}%
                            </span>
                          </span>
                        )}
                        {a.spreadBps !== undefined && (
                          <span>
                            SPREAD{" "}
                            <span className="text-muted-foreground">
                              {Math.round(a.spreadBps)} bps
                            </span>
                          </span>
                        )}
                        {a.fill?.slippageBps !== undefined && (
                          <span>
                            FULL-EXIT SLIPPAGE{" "}
                            <span className="text-muted-foreground">
                              {Math.round(a.fill.slippageBps)} bps
                            </span>
                          </span>
                        )}
                        {a.ammDepthXrp !== undefined && (
                          <span>
                            AMM POOL{" "}
                            <span className={a.ammFrozen ? "text-no-go" : "text-muted-foreground"}>
                              {a.ammDepthXrp.toLocaleString(undefined, { maximumFractionDigits: 0 })} XRP
                              {a.ammFrozen ? " · FROZEN" : ""}
                            </span>
                          </span>
                        )}
                      </div>
                    </Signal>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "travel" && (
            <div className="p-3">
              {!has("compliance_api") ? (
                <EmptyState
                  icon={<NovaGrid size={16} />}
                  title="TRAVEL RULE REQUIRES INSTITUTION"
                  body="FATF Recommendation 16 scoping is part of the Institution plan, alongside the Compliance API and regulator seats."
                  action={<Button size="sm" onClick={onUpgrade}>SEE PLANS</Button>}
                />
              ) : travel.inScope.length === 0 ? (
                <EmptyState
                  icon={<NovaShield size={16} />}
                  title="NO TRANSFERS IN SCOPE"
                  body={`No transfer in the queried window reaches the ${TRAVEL_RULE_PRESETS[preset].thresholdFiat.toLocaleString()} ${TRAVEL_RULE_PRESETS[preset].currency} threshold at the reference rate you set.`}
                />
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      {["DIR", "COUNTERPARTY", "AMOUNT", "FIAT", "DATA"].map((h, i) => (
                        <th key={i} className="stencil pb-2 text-[8px] font-medium tracking-[0.2em] text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {travel.inScope.slice(0, 40).map((hit) => (
                      <tr key={hit.hash} className="border-b border-border/30">
                        <td className="mono-font py-2 text-[10px] text-muted-foreground">
                          {hit.direction === "in" ? "↓" : "↑"}
                        </td>
                        <td className="mono-font py-2 text-[10px] text-foreground/80">
                          {shortAddress(hit.counterparty)}
                        </td>
                        <td className="mono-font py-2 text-[10px] tabular-nums text-foreground">
                          {hit.amountXrp.toLocaleString(undefined, { maximumFractionDigits: 2 })} XRP
                        </td>
                        <td className="mono-font py-2 text-[10px] tabular-nums text-muted-foreground">
                          {hit.amountFiat.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2">
                          <Badge variant={hit.counterpartyUnknown ? "no-go" : "go"} className="text-[8px]">
                            {hit.counterpartyUnknown ? "MISSING" : "HELD"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "concentration" && (
            <div className="p-3">
              {concentration.counterparties.length === 0 ? (
                <EmptyState
                  icon={<NovaGrid size={16} />}
                  title="NO SETTLEMENT VOLUME"
                  body="No value transfers in the queried window, so there is no counterparty book to concentrate."
                />
              ) : (
                <div className="space-y-2">
                  {concentration.counterparties.slice(0, 12).map((party) => (
                    <div key={party.address} className="inset-row p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="mono-font selectable truncate text-[10px] text-foreground">
                          {shortAddress(party.address)}
                        </span>
                        <span className="mono-font shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {party.transfers} tx · {party.volumeXrp.toLocaleString(undefined, { maximumFractionDigits: 0 })} XRP
                        </span>
                      </div>
                      <Meter
                        label="SHARE OF VOLUME"
                        value={party.sharePct}
                        tone={party.sharePct >= 25 ? "no-go" : party.sharePct >= 10 ? "hold" : "default"}
                        className="mt-2"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* Findings + controls */}
        <div className="col-span-2 flex min-h-0 flex-col gap-3">
          {tab === "travel" && has("compliance_api") && (
            <Panel label="THRESHOLD" corners className="shrink-0">
              <Eyebrow className="mb-1.5">JURISDICTION</Eyebrow>
              <div className="flex flex-wrap gap-1">
                {TRAVEL_RULE_PRESETS.map((p, i) => (
                  <button
                    key={p.label}
                    onClick={() => setPreset(i)}
                    className={cn(
                      "mono-font border px-2 py-1 text-[9px] transition-colors",
                      preset === i
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground/40"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <Label htmlFor="xrp-rate">REFERENCE XRP RATE</Label>
                <Input
                  id="xrp-rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  inputMode="decimal"
                  className="mono-font mt-1.5 text-[11px]"
                />
                <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">
                  There is no price feed in this build — supply the rate your
                  compliance function already uses, so the threshold matches
                  your own books rather than a third party's.
                </p>
              </div>
              <div className="mt-3">
                <DataRow
                  label="THRESHOLD"
                  value={`${TRAVEL_RULE_PRESETS[preset].thresholdFiat.toLocaleString()} ${TRAVEL_RULE_PRESETS[preset].currency}`}
                />
                <DataRow
                  label="= XRP"
                  value={Number.isFinite(travel.thresholdXrp) ? travel.thresholdXrp.toFixed(2) : "—"}
                />
                <DataRow label="IN SCOPE" value={travel.inScope.length} tone={travel.inScope.length > 0 ? "hold" : "go"} />
                <DataRow label="DATA MISSING" value={travel.unresolved} tone={travel.unresolved > 0 ? "no-go" : "go"} />
              </div>
            </Panel>
          )}

          <Panel label="FINDINGS" className="min-h-0 flex-1" bodyClassName="overflow-y-auto p-3">
            <div className="space-y-2">
              {(tab === "concentration" ? concentrationResults : issuerResults).map((f) => (
                <FindingRow key={f.id} finding={f} />
              ))}
              {tab === "travel" && has("compliance_api") && travel.unresolved > 0 && (
                <FindingRow
                  finding={{
                    id: "tr-missing",
                    severity: "critical",
                    title: `${travel.unresolved} in-scope transfer${travel.unresolved === 1 ? "" : "s"} without counterparty data`,
                    detail:
                      "FATF Recommendation 16 obliges the originating institution to transmit originator and beneficiary information alongside these transfers. The ledger carries no such payload, so it must travel out of band.",
                    action: "Resolve the counterparty VASP and record the payload before settling further volume.",
                  }}
                />
              )}
              {(tab === "concentration" ? concentrationResults : issuerResults).length === 0 &&
                tab !== "travel" && (
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    Nothing to report on this view.
                  </p>
                )}
            </div>
          </Panel>

          <Panel label="WHAT THIS MEASURES" className="shrink-0">
            {[
              { icon: <NovaVault size={11} />, text: "Issuer flags decide whether an issued balance can be frozen out from under you." },
              { icon: <NovaShield size={11} />, text: "FATF R.16 scoping: which transfers legally require originator and beneficiary data." },
              { icon: <NovaBolt size={11} />, text: "HHI concentration: how much of the book rests on one counterparty failing." },
            ].map((row) => (
              <div key={row.text} className="flex gap-2 border-b border-border/30 py-1.5 last:border-0">
                <span className="mt-0.5 shrink-0 text-muted-foreground">{row.icon}</span>
                <span className="text-[10px] leading-snug text-muted-foreground">{row.text}</span>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
