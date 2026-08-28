import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { SceneHeader } from "./SceneHeader";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { CountUp } from "@/components/nova/CountUp";
import { Meter, RingGauge, Sparkline } from "@/components/nova/Charts";
import { StatusDot } from "@/components/nova/StatusDot";
import { EmptyState } from "@/components/nova/EmptyState";
import {
  NovaBolt,
  NovaFlare,
  NovaSat,
  NovaShield,
  NovaTerminal,
} from "@/components/nova/NovaIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUptime, shortAddress } from "@/lib/xrpl/client";
import { timeAgo, truncateMiddle } from "@/lib/format";
import { DOMAIN_REGISTRY, evaluatePolicy, reserveRequirementXrp } from "@/lib/policy";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import type { Status } from "@/lib/xrpl/types";
import { cn } from "@/lib/utils";
import { staggerChild, staggerParent } from "@/lib/motion";

/**
 * Readout — the top telemetry strip.
 * A large animated numeral over a stencil label, with an inline trend.
 */
function Readout({
  label,
  value,
  suffix,
  icon,
  trend,
  tone = "default",
}: {
  label: string;
  value: number | string;
  suffix?: string;
  icon: React.ReactNode;
  trend?: number[];
  tone?: "default" | "go" | "hold" | "no-go";
}) {
  return (
    <motion.div variants={staggerChild}>
      <Panel className="h-full" bodyClassName="p-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
              {label}
            </p>
            <p className="data-font mt-1.5 text-[22px] font-[600] leading-none text-foreground">
              {typeof value === "number" ? <CountUp value={value} /> : value}
              {suffix && (
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  {suffix}
                </span>
              )}
            </p>
          </div>
          <span className="shrink-0 text-muted-foreground/70">{icon}</span>
        </div>
        {trend && trend.length > 1 && (
          <Sparkline
            values={trend}
            height={26}
            tone={tone}
            className="mt-2.5"
            showMarker={false}
          />
        )}
      </Panel>
    </motion.div>
  );
}

export function MissionControlScene({
  data,
  onOpenVerification,
}: {
  data: XrplState;
  onOpenVerification: () => void;
}) {
  const {
    ledger,
    account,
    credentials,
    server,
    connected,
    ledgerError,
    events,
    history,
    latencyMs,
    successRate,
  } = data;

  const status: Status = ledgerError ? "hold" : connected ? "go" : "no-go";

  const txnSeries = history.map((tick) => tick.txnCount);
  const feeSeries = history.map((tick) => tick.baseFeeXrp * 1_000_000);

  /** Live gate verdict against the wallet's default settlement domain. */
  const gate = useMemo(() => {
    const domain = DOMAIN_REGISTRY[0];
    return evaluatePolicy({
      account,
      credentials,
      domain,
      amountXrp: 0,
    });
  }, [account, credentials]);

  const reserve = reserveRequirementXrp(account?.ownerCount ?? 0);
  const balance = account ? Number(account.balanceXrp) : 0;
  const spendable = Math.max(0, balance - reserve);
  const blockingFailures = gate.checks.filter(
    (check) => check.severity === "block" && !check.passed
  ).length;

  const avgTxn =
    txnSeries.length > 0
      ? Math.round(txnSeries.reduce((sum, value) => sum + value, 0) / txnSeries.length)
      : 0;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <SceneHeader
        index="01"
        kicker="LIVE TELEMETRY · XRPL MAINNET"
        title="MISSION CONTROL"
        sub="Every validated ledger, credential and settlement path the compliance layer is watching, in real time."
        status={status}
        statusLabel={ledgerError ? "DEGRADED" : connected ? "ONLINE" : "OFFLINE"}
        right={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onOpenVerification}>
            <NovaShield size={13} />
            RUN GATE CHECK
          </Button>
        }
      />

      {/* Telemetry strip */}
      <motion.div
        className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4"
        variants={staggerParent(0.05)}
        initial="hidden"
        animate="show"
      >
        <Readout
          label="VALIDATED LEDGER"
          value={ledger?.ledgerIndex ?? 0}
          icon={<NovaFlare size={15} />}
        />
        <Readout
          label="LEDGER THROUGHPUT"
          value={ledger?.txnCount ?? avgTxn}
          suffix="TX"
          icon={<NovaBolt size={15} />}
          trend={txnSeries}
        />
        <Readout
          label="OPEN LEDGER FEE"
          value={ledger ? `${ledger.openLedgerFeeXrp}` : "—"}
          suffix="XRP"
          icon={<NovaTerminal size={15} />}
          trend={feeSeries}
          tone={
            ledger && Number(ledger.openLedgerFeeXrp) > Number(ledger.baseFeeXrp) * 5
              ? "hold"
              : "default"
          }
        />
        <Readout
          label="RPC LATENCY"
          value={latencyMs}
          suffix="MS"
          icon={<NovaSat size={15} />}
          tone={latencyMs > 800 ? "hold" : "go"}
        />
      </motion.div>

      <div className="grid min-h-0 flex-1 grid-cols-5 gap-3">
        {/* Left — network telemetry.
            Scrolls rather than compressing: the stream is live primary data
            and a flex-1 panel in a short window collapses to its own header,
            which is what happened when the coverage meters started stacking. */}
        <div className="col-span-3 flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Panel
            label="LEDGER CADENCE"
            corners
            className="shrink-0"
            right={
              <span className="flex items-center gap-2">
                <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
                  {history.length}/48 CLOSES
                </span>
                <StatusDot status={status} size={5} pulse={connected} />
              </span>
            }
          >
            <div className="relative">
              <PatternMark element="orbital" size={130} className="-right-8 -top-10" opacity={0.08} />
              {history.length < 2 ? (
                <div className="flex h-[74px] items-center">
                  <p className="mono-font animate-pulse text-[10px] text-muted-foreground">
                    LISTENING FOR LEDGER CLOSES…
                  </p>
                </div>
              ) : (
                <>
                  <Sparkline
                    values={txnSeries}
                    height={62}
                    tone="default"
                    interactive
                    label="TX / CLOSE"
                    format={(v) => `${Math.round(v)} TX`}
                    labelAt={(i) =>
                      history[i]
                        ? `LGR ${history[i].index.toLocaleString()} · ${history[i].closeTime}`
                        : ""
                    }
                  />
                  <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2">
                    <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
                      AVG {avgTxn} TX · PEAK {Math.max(0, ...txnSeries)} TX
                    </span>
                    <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
                      LAST CLOSE {history[history.length - 1]?.closeTime ?? "—"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </Panel>

          <Panel
            label="COMPLIANCE COVERAGE"
            className="shrink-0"
            right={
              <Badge variant={blockingFailures === 0 ? "go" : "no-go"}>
                {blockingFailures === 0
                  ? "ALL RULES PASS"
                  : `${blockingFailures} BLOCKING`}
              </Badge>
            }
          >
            <div className="grid grid-cols-[auto_1fr] items-center gap-5">
              <div className="flex gap-3">
                <RingGauge
                  value={successRate}
                  label="TX OK"
                  tone={successRate > 90 ? "go" : successRate > 70 ? "hold" : "no-go"}
                />
                <RingGauge
                  value={
                    gate.checks.length === 0
                      ? 0
                      : (gate.checks.filter((check) => check.passed).length /
                          gate.checks.length) *
                        100
                  }
                  label="POLICY"
                  tone={gate.verdict === "no-go" ? "no-go" : gate.verdict === "hold" ? "hold" : "go"}
                />
              </div>

              {/* Meters stack below xl: two columns of a truncating label in
                  a narrow panel produced "CREDENTIAL COV…", which tells the
                  operator nothing. */}
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
                <Meter
                  label="CREDENTIAL COVERAGE"
                  value={
                    DOMAIN_REGISTRY[0].requirements.length === 0
                      ? 100
                      : (DOMAIN_REGISTRY[0].requirements.filter((requirement) =>
                          credentials.some(
                            (credential) =>
                              credential.credentialType.toUpperCase() === requirement &&
                              credential.accepted &&
                              !credential.revoked
                          )
                        ).length /
                          DOMAIN_REGISTRY[0].requirements.length) *
                        100
                  }
                  tone={credentials.length > 0 ? "go" : "no-go"}
                />
                <Meter
                  label="RESERVE HEADROOM"
                  value={balance > 0 ? Math.min(100, (spendable / balance) * 100) : 0}
                  tone="default"
                />
                <Meter
                  label="DOMAIN ENFORCEMENT"
                  value={connected ? 100 : 0}
                  tone={connected ? "go" : "no-go"}
                />
                <Meter
                  label="NODE LOAD FACTOR"
                  value={server ? Math.min(100, 100 / Math.max(1, server.loadFactor)) : 0}
                  tone={
                    server && server.loadFactor > 4
                      ? "hold"
                      : server
                        ? "go"
                        : "no-go"
                  }
                />
              </div>
            </div>
          </Panel>

          <Panel
            label="LIVE LEDGER STREAM"
            className="min-h-[220px] flex-1 shrink-0"
            bodyClassName="p-0"
            right={
              <Badge variant={connected ? "go" : "no-go"}>
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    connected ? "bg-go animate-pulse" : "bg-no-go"
                  )}
                />
                {connected ? "STREAMING" : "RECONNECTING"}
              </Badge>
            }
          >
            {events.length === 0 ? (
              <EmptyState
                icon={<NovaSat size={16} />}
                title="NO VALIDATED TRAFFIC YET"
                body="The mainnet subscription is open. Rows appear the moment a transaction validates."
              />
            ) : (
              <div className="h-full overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b border-border">
                      {["TYPE", "ACCOUNT", "RESULT", "AMOUNT", "LEDGER", "AGE"].map(
                        (heading) => (
                          <th
                            key={heading}
                            className="stencil px-3 py-1.5 text-[8px] font-medium tracking-[0.2em] text-muted-foreground"
                          >
                            {heading}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {events.slice(0, 24).map((event) => (
                        <motion.tr
                          key={event.id}
                          layout
                          // A new row flashes in the brand colour and fades.
                          // Plain white was off-palette drift; blue is the
                          // signal hue, so the flash means "this just arrived"
                          // in the same language as the rest of the console.
                          initial={{ opacity: 0, backgroundColor: "hsl(217 91% 60% / 0.16)" }}
                          animate={{ opacity: 1, backgroundColor: "hsl(217 91% 60% / 0)" }}
                          transition={{ duration: 0.5 }}
                          className="border-b border-border/30 transition-colors hover:bg-secondary/40"
                        >
                          <td className="mono-font px-3 py-1 text-[9px] text-foreground/80">
                            {event.type}
                          </td>
                          <td className="mono-font px-3 py-1 text-[9px] text-muted-foreground">
                            {shortAddress(event.account)}
                          </td>
                          <td
                            className={cn(
                              "mono-font px-3 py-1 text-[9px]",
                              event.result === "tesSUCCESS" ? "text-go" : "text-no-go"
                            )}
                          >
                            {event.result}
                          </td>
                          <td className="mono-font px-3 py-1 text-[9px] tabular-nums text-foreground/70">
                            {event.amountXrp ? `${event.amountXrp} XRP` : "—"}
                          </td>
                          <td className="mono-font px-3 py-1 text-[9px] tabular-nums text-muted-foreground">
                            {event.ledger || "—"}
                          </td>
                          <td className="mono-font px-3 py-1 text-[9px] tabular-nums text-muted-foreground/70">
                            {timeAgo(event.at)}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* Right — wallet gate and policy.
            The column scrolls rather than compressing its children: at 768px
            of height the rule set was squeezed to a bare header, which is the
            one panel on this screen carrying the verdict. Secondary panels
            (NETWORK) scroll out of view instead. */}
        <div className="col-span-2 flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Panel label="WALLET GATE" corners className="shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-md border border-border">
                <NovaFlare size={20} className="text-foreground" />
                <span
                  className={cn(
                    "absolute -bottom-px -right-px h-1.5 w-1.5",
                    gate.verdict === "go"
                      ? "bg-go"
                      : gate.verdict === "hold"
                        ? "bg-hold"
                        : "bg-no-go"
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mono-font selectable truncate text-[11px] text-foreground">
                  {account ? account.address : "NO WALLET LOADED"}
                </p>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                  {account?.unfunded
                    ? "Address valid — not yet funded on mainnet"
                    : (account?.domain ?? "No domain attestation published")}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
              {[
                { label: "BALANCE", value: account ? Number(account.balanceXrp) : 0, dp: 2 },
                { label: "SPENDABLE", value: spendable, dp: 2 },
                { label: "OWNERS", value: account?.ownerCount ?? 0, dp: 0 },
              ].map((stat) => (
                // min-w-0 so a long balance shrinks its column instead of
                // overflowing into the next one; the figure scales with the
                // container rather than colliding with its neighbour.
                <div key={stat.label} className="min-w-0">
                  <p className="stencil truncate text-[7px] tracking-[0.2em] text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="data-font mt-0.5 truncate text-[clamp(11px,1.35vw,15px)] font-[600] leading-none tabular-nums text-foreground">
                    <CountUp value={stat.value} decimals={stat.dp} />
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            label="POLICY RULE SET"
            className="min-h-[210px] flex-1 shrink-0"
            bodyClassName="overflow-y-auto p-3"
            right={
              <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
                {gate.checks.filter((check) => check.passed).length}/{gate.checks.length}
              </span>
            }
          >
            <Eyebrow className="mb-2">
              EVALUATED AGAINST {DOMAIN_REGISTRY[0].code}
            </Eyebrow>
            <div className="space-y-0">
              {gate.checks.map((check) => (
                <div
                  key={check.id}
                  className="flex items-start gap-2 border-b border-border/30 py-1.5 last:border-0"
                >
                  <span
                    className={cn(
                      "mt-1 h-1.5 w-1.5 shrink-0",
                      check.passed
                        ? "bg-go"
                        : check.severity === "block"
                          ? "bg-no-go"
                          : "bg-hold"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="mono-font truncate text-[9px] text-foreground/85">
                      {check.id}
                    </p>
                    {!check.passed && (
                      <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                        {check.detail}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "stencil shrink-0 text-[8px] tracking-[0.18em]",
                      check.passed
                        ? "text-go"
                        : check.severity === "block"
                          ? "text-no-go"
                          : "text-hold"
                    )}
                  >
                    {check.passed ? "PASS" : check.severity === "block" ? "FAIL" : "WARN"}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel label="NETWORK" className="shrink-0">
            <div className="relative">
              <PatternMark element="dots" size={90} opacity={0.08} className="-right-4 -top-6" />
              <DataRow label="NODE STATE" value={server?.serverState ?? "···"} />
              <DataRow
                label="LEDGER HASH"
                value={ledger ? truncateMiddle(ledger.ledgerHash, 6, 6) : "···"}
              />
              <DataRow label="PEERS" value={server?.peers ?? "···"} />
              <DataRow
                label="TXN QUEUE"
                value={ledger ? ledger.queueSize : "···"}
                tone={ledger && ledger.queueSize > 20 ? "hold" : "default"}
              />
              <DataRow
                label="REFERENCE FEE"
                value={ledger ? `${ledger.baseFeeXrp} XRP` : "···"}
              />
              <DataRow
                label="UPTIME"
                value={server ? formatUptime(server.uptimeSeconds) : "···"}
              />
              {ledgerError && (
                <DataRow label="LINK" value={ledgerError} tone="no-go" />
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
