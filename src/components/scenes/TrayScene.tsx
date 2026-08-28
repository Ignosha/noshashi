import { useMemo } from "react";
import { motion } from "framer-motion";
import { NovaLogo } from "@/components/nova/NovaLogo";
import { StatusDot } from "@/components/nova/StatusDot";
import { Sparkline } from "@/components/nova/Charts";
import { CountUp } from "@/components/nova/CountUp";
import { NovaSat, NovaShield, NovaTerminal } from "@/components/nova/NovaIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/nova/Kbd";
import { shortAddress } from "@/lib/xrpl/client";
import { timeAgo } from "@/lib/format";
import { DOMAIN_REGISTRY, VERDICT_COPY, evaluatePolicy } from "@/lib/policy";
import { isTauri } from "@/lib/env";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import type { Status } from "@/lib/xrpl/types";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

const verdictText: Record<Status, string> = {
  go: "text-go",
  hold: "text-hold",
  "no-go": "text-no-go",
};

/**
 * TrayScene — the macOS menu bar HUD.
 *
 * Rendered in a 380×560 panel anchored under the tray icon. It answers
 * exactly one question at a glance — can this wallet settle right now —
 * and gets out of the way. Everything deeper opens the full console.
 */
export function TrayScene({ data }: { data: XrplState }) {
  const { ledger, account, credentials, server, connected, events, history, latencyMs } =
    data;

  const gate = useMemo(
    () =>
      evaluatePolicy({
        account,
        credentials,
        domain: DOMAIN_REGISTRY[0],
        amountXrp: 0,
      }),
    [account, credentials]
  );

  const linkStatus: Status = connected ? "go" : "no-go";
  const passed = gate.checks.filter((check) => check.passed).length;

  const openConsole = async () => {
    if (!isTauri) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_console_window");
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <header
        data-tauri-drag-region
        className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5"
      >
        <div className="flex items-center gap-2">
          <NovaLogo size={16} className="text-foreground" />
          <span className="display text-[11px] font-[700] tracking-[0.14em] text-foreground">
            NOSHASHI
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? "go" : "no-go"} className="text-[8px]">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connected ? "bg-go animate-pulse" : "bg-no-go"
              )}
            />
            {connected ? "MAINNET" : "OFFLINE"}
          </Badge>
        </div>
      </header>

      {/* Verdict — the one thing this panel exists to say */}
      <motion.div
        className="shrink-0 border-b border-border px-3 py-4 text-center"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
      >
        <p className="stencil text-[8px] tracking-[0.28em] text-muted-foreground">
          {DOMAIN_REGISTRY[0].code} SETTLEMENT GATE
        </p>
        <p
          className={cn(
            "display stamp-in mt-1.5 text-[30px] font-[900] leading-none",
            verdictText[gate.verdict]
          )}
        >
          {VERDICT_COPY[gate.verdict].title}
        </p>
        <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
          {passed}/{gate.checks.length} rules passing
        </p>
      </motion.div>

      {/* Wallet */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border">
          <NovaShield size={13} className="text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mono-font truncate text-[10px] text-foreground">
            {account ? shortAddress(account.address) : "NO WALLET"}
          </p>
          <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
            {account?.domain ?? "No domain attestation"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="data-font text-[13px] font-[600] leading-none tabular-nums text-foreground">
            <CountUp value={account ? Number(account.balanceXrp) : 0} decimals={2} />
          </p>
          <p className="stencil mt-0.5 text-[7px] tracking-[0.2em] text-muted-foreground">
            XRP
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid shrink-0 grid-cols-3 border-b border-border">
        {[
          { label: "LEDGER", value: ledger ? ledger.ledgerIndex.toLocaleString() : "———" },
          { label: "FEE", value: ledger ? ledger.baseFeeXrp : "———" },
          { label: "LATENCY", value: `${latencyMs}ms` },
        ].map((stat, index) => (
          <div
            key={stat.label}
            className={cn("px-3 py-2", index < 2 && "border-r border-border")}
          >
            <p className="stencil text-[7px] tracking-[0.2em] text-muted-foreground">
              {stat.label}
            </p>
            <p className="mono-font mt-1 truncate text-[10px] tabular-nums text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Cadence */}
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="stencil text-[7px] tracking-[0.22em] text-muted-foreground">
            LEDGER CADENCE
          </span>
          <NovaSat size={11} className="text-muted-foreground" />
        </div>
        <Sparkline
          values={history.map((tick) => tick.txnCount)}
          height={30}
          className="mt-1.5"
          tone={linkStatus === "go" ? "go" : "no-go"}
        />
      </div>

      {/* Stream */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="stencil text-[7px] tracking-[0.22em] text-muted-foreground">
            LIVE STREAM
          </span>
          <StatusDot status={linkStatus} size={5} pulse={connected} />
        </div>
        {events.length === 0 ? (
          <p className="mono-font animate-pulse px-3 py-4 text-[9px] text-muted-foreground">
            AWAITING VALIDATED TRANSACTIONS…
          </p>
        ) : (
          events.slice(0, 8).map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-2 border-b border-border/25 px-3 py-1"
            >
              <span
                className={cn(
                  "h-1 w-1 shrink-0",
                  event.result === "tesSUCCESS" ? "bg-go" : "bg-no-go"
                )}
              />
              <span className="mono-font w-[92px] shrink-0 truncate text-[9px] text-foreground/75">
                {event.type}
              </span>
              <span className="mono-font min-w-0 flex-1 truncate text-[9px] text-muted-foreground">
                {shortAddress(event.account)}
              </span>
              <span className="mono-font shrink-0 text-[8px] tabular-nums text-muted-foreground/60">
                {timeAgo(event.at)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 border-t border-border p-2.5">
        <Button size="sm" className="w-full gap-1.5" onClick={() => void openConsole()}>
          <NovaTerminal size={12} />
          OPEN MISSION CONTROL
        </Button>
        <div className="mt-2 flex items-center justify-between px-0.5">
          <span className="mono-font text-[8px] text-muted-foreground">
            {server ? `NET ${server.networkId}` : "NET —"}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd keys="mod+shift+x" />
            <span className="stencil text-[7px] tracking-[0.18em] text-muted-foreground">
              TOGGLE
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
