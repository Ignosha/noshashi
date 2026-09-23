import { useMemo } from "react";
import { Panel, Eyebrow } from "@/components/nova/Panel";
import { StatusDot } from "@/components/nova/StatusDot";
import { useAuth } from "@/lib/auth/useAuth";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useLedger } from "@/lib/desk/ledger";
import { deriveAlerts, usePortfolio } from "@/lib/desk/portfolio";
import { useStoredDrift } from "@/lib/desk/watch";
import { controlRoom, type ControlRoom as Room, type ControlRoomInput, type Figure } from "@/lib/desk/controlRoom";
import { useCaseStore } from "@/lib/org/useCaseStore";
import { useOrg } from "@/lib/org/useOrg";
import { useHandoff } from "@/lib/nav/handoff";
import { shortAddress } from "@/lib/xrpl/client";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { cn } from "@/lib/utils";

/**
 * NOSHASHI / CONTROL ROOM — the institution's state at a glance, built only
 * from records the app holds. A figure whose source is unavailable says so
 * and why; nothing here is a placeholder or an estimate.
 */
export function ControlRoom({ data }: { data: XrplState }) {
  const { user } = useAuth();
  const { has } = useBilling();
  if (!user) return <ControlRoomBody data={data} portfolio={{ unavailable: "Sign in to include your portfolio's live exposure." }} />;
  if (!has("portfolios")) return <ControlRoomBody data={data} portfolio={{ unavailable: "Portfolio exposure is part of the Desk plan." }} />;
  return <WithPortfolio data={data} />;
}

function WithPortfolio({ data }: { data: XrplState }) {
  const { snapshots, error } = usePortfolio();
  const alerts = useMemo(() => deriveAlerts(snapshots), [snapshots]);
  return <ControlRoomBody data={data} portfolio={error ? { unavailable: `Portfolio could not be read: ${error}` } : { snapshots, alerts }} />;
}

function ControlRoomBody({ data, portfolio }: { data: XrplState; portfolio: ControlRoomInput["portfolio"] }) {
  const { entries } = useLedger();
  const drift = useStoredDrift();
  const cases = useCaseStore();
  const org = useOrg();
  const handOff = useHandoff();
  const orgExceptions = org.state.status === "ready" && org.selectedId !== null ? org.data?.exceptions ?? null : null;

  const room: Room = useMemo(
    () =>
      controlRoom({
        now: Date.now(),
        portfolio,
        entries,
        drift: drift.alerts,
        watchedIssuers: drift.issuers,
        cases: cases.cases,
        orgExceptions,
      }),
    [portfolio, entries, drift.alerts, drift.issuers, cases.cases, orgExceptions]
  );

  const ledger = data.ledger;
  const scope = cases.scope === "organization" ? `ORGANIZATION · ${(cases.organizationName ?? "").toUpperCase()}` : "THIS WORKSTATION";

  return (
    <Panel bodyClassName="p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>NOSHASHI / CONTROL ROOM</Eyebrow>
        <span className="stencil text-[7.5px] tracking-[0.2em] text-muted-foreground">{scope} · RECORDED AND LIVE DATA ONLY</span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Tile label="XRPL MAINNET">
          {ledger ? (
            <>
              <p className="data-font text-[15px] text-foreground">#{ledger.ledgerIndex.toLocaleString("en-US")}</p>
              <p className="stencil mt-0.5 flex items-center gap-1 text-[8px] tracking-[0.2em] text-go">
                <StatusDot status={ledger.validated ? "go" : "hold"} size={5} /> {ledger.validated ? "VALIDATED" : "NOT VALIDATED"}
              </p>
            </>
          ) : (
            <Unavailable reason={data.ledgerError ?? "Connecting to mainnet…"} />
          )}
        </Tile>
        <Tile label="ACTIVE EXPOSURE">
          <FigureView figure={room.exposure} render={(v) => (
            <>
              <p className="data-font text-[15px] text-foreground">{v.xrp.toLocaleString("en-US", { maximumFractionDigits: 2 })} <span className="text-[9px] text-muted-foreground">XRP</span></p>
              <p className="text-[8.5px] text-muted-foreground">across {v.wallets} portfolio wallet{v.wallets === 1 ? "" : "s"} · live balances · no fiat price feed</p>
            </>
          )} />
        </Tile>
        <Tile label="MONITORED ENTITIES">
          <p className="data-font text-[15px] text-foreground">{room.monitored.total ?? room.monitored.issuers}</p>
          <p className="text-[8.5px] text-muted-foreground">
            {room.monitored.wallets === null ? "portfolio not included · " : `${room.monitored.wallets} wallet${room.monitored.wallets === 1 ? "" : "s"} · `}
            {room.monitored.issuers} watched issuer{room.monitored.issuers === 1 ? "" : "s"}
          </p>
        </Tile>
        <Tile label="POLICY EXCEPTIONS">
          <p className="data-font text-[15px] text-hold">{room.exceptions.recorded30d}</p>
          <p className="text-[8.5px] text-muted-foreground">
            recorded verdicts, 30 days{room.exceptions.pendingOrg !== null ? ` · ${room.exceptions.pendingOrg} awaiting decision` : ""}
          </p>
        </Tile>
        <Tile label="CRITICAL">
          <p className={cn("data-font text-[15px]", room.critical ? "text-no-go" : "text-foreground")}>{room.critical}</p>
          <p className="text-[8.5px] text-muted-foreground">live alerts + NO-GO verdicts (30 days)</p>
        </Tile>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[3fr_2fr]">
        <div>
          <Eyebrow className="mb-1.5">LIVE INTELLIGENCE</Eyebrow>
          {room.feed.length === 0 ? (
            <p className="text-[9.5px] leading-relaxed text-muted-foreground">
              Nothing to report from the sources in use: issuer watch, portfolio alerts, recorded verdicts
              {orgExceptions ? " and organization exceptions" : ""}. Start the issuer watch in Ledger &amp; Policy → WATCH to
              be told when an issuer's controls change.
            </p>
          ) : (
            <ul className="space-y-1">
              {room.feed.slice(0, 8).map((f) => (
                <li key={f.id} className="flex items-start gap-1.5 border-b border-border/30 pb-1">
                  <span className="mt-1"><StatusDot status={f.severity === "critical" ? "no-go" : f.severity === "warn" ? "hold" : "go"} size={5} /></span>
                  <div className="min-w-0">
                    <p className="text-[10px] text-foreground">{f.title}</p>
                    <p className="truncate text-[9px] text-muted-foreground">
                      {f.subject ? `${shortAddress(f.subject)} · ` : ""}{f.body}
                    </p>
                    <p className="stencil text-[7px] tracking-[0.2em] text-muted-foreground/70">
                      {SOURCE_LABEL[f.source]}{f.at ? ` · ${f.at.slice(0, 16).replace("T", " ")} UTC` : " · NOW"}
                    </p>
                  </div>
                </li>
              ))}
              {room.feed.length > 8 && <p className="text-[9px] text-muted-foreground">+{room.feed.length - 8} more</p>}
            </ul>
          )}
        </div>

        <div>
          <Eyebrow className="mb-1.5">INVESTIGATION QUEUE</Eyebrow>
          <p className="data-font text-[13px] text-foreground">
            {String(room.queue.high).padStart(2, "0")} <span className="stencil text-[8px] tracking-[0.2em] text-no-go">HIGH PRIORITY</span>
            <span className="text-[9px] text-muted-foreground"> · {room.queue.open} open</span>
          </p>
          {room.queue.items.length === 0 ? (
            <p className="mt-1 text-[9.5px] text-muted-foreground">No open investigations. Open one from any verdict.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {room.queue.items.slice(0, 5).map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2 border-b border-border/30 pb-1">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] text-foreground">{q.title}</p>
                    <p className="stencil text-[7.5px] tracking-[0.18em] text-muted-foreground">
                      <span className={q.priority === "high" ? "text-no-go" : q.priority === "medium" ? "text-hold" : ""}>{q.priority.toUpperCase()}</span> · {q.status.toUpperCase()} · {q.linked} VERDICT{q.linked === 1 ? "" : "S"}
                    </p>
                  </div>
                  <button
                    onClick={() => handOff({ scene: "workstation", from: "control", as: "investigation", value: q.id })}
                    className="stencil shrink-0 border border-border px-2 py-1 text-[7.5px] tracking-[0.2em] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                  >
                    OPEN INVESTIGATION
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[8.5px] leading-snug text-muted-foreground">
            Cases are opened and prioritised by people. The AI can be asked about a case but cannot create, change or close one.
          </p>
        </div>
      </div>
    </Panel>
  );
}

const SOURCE_LABEL = {
  "issuer-watch": "ISSUER WATCH",
  portfolio: "PORTFOLIO · LIVE",
  verdict: "RECORDED VERDICT",
  exception: "ORGANIZATION EXCEPTION",
} as const;

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border border-border p-2">
      <p className="stencil mb-1 text-[7.5px] tracking-[0.22em] text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <>
      <p className="data-font text-[15px] text-muted-foreground">—</p>
      <p className="text-[8.5px] leading-snug text-muted-foreground">{reason}</p>
    </>
  );
}

function FigureView<T>({ figure, render }: { figure: Figure<T>; render: (v: T) => React.ReactNode }) {
  if (figure.state === "unavailable") return <Unavailable reason={figure.reason} />;
  return (
    <>
      {render(figure.value)}
      {figure.note && <p className="text-[8.5px] text-hold">{figure.note}</p>}
    </>
  );
}
