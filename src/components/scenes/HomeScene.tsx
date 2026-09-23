import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { useState } from "react";
import { motion } from "framer-motion";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { NovaLogo } from "@/components/nova/NovaLogo";
import { CountUp } from "@/components/nova/CountUp";
import { StatusDot } from "@/components/nova/StatusDot";
import {
  NovaBolt,
  NovaCredit,
  NovaEye,
  NovaGrid,
  NovaSat,
  NovaShield,
  NovaTerminal,
} from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CAPABILITIES, CONCEPTS, type Maturity } from "@/lib/roadmap";
import { BRAND, CONTACT, LINKS, copyrightLine } from "@/lib/brand";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

const RELAY_REGIONS = [
  { name: "AMERICAS", short: "US", x: 22, y: 40 },
  { name: "EUROPE", short: "EU", x: 47, y: 30 },
  { name: "ASIA PACIFIC", short: "AP", x: 78, y: 47 },
  { name: "OCEANIA", short: "OC", x: 86, y: 76 },
];

function RelayWorld({
  connected,
  eventCount,
  ledgerIndex,
}: {
  connected: boolean;
  eventCount: number;
  ledgerIndex: number;
}) {
  const pulseKey = `${ledgerIndex}-${eventCount}`;
  const relayNodes = [
    { short: "US", x: 22, y: 40 },
    { short: "EU", x: 47, y: 30 },
    { short: "AP", x: 78, y: 47 },
    { short: "OC", x: 86, y: 76 },
    { short: "CA", x: 30, y: 34 },
    { short: "ME", x: 59, y: 36 },
    { short: "IN", x: 69, y: 54 },
    { short: "BR", x: 31, y: 65 },
  ];
  return (
    <div className="relative overflow-hidden rounded-md border border-border/70 bg-background/35">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div>
          <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
            GLOBAL RELAY PULSE
          </p>
          <p className="mono-font mt-1 text-[9px] text-muted-foreground">
            {connected ? "LIVE CONNECTION FABRIC" : "RECONNECTING TO RELAY FABRIC"}
          </p>
        </div>
        <span className="flex items-center gap-1.5 mono-font text-[9px] text-muted-foreground">
          <StatusDot status={connected ? "go" : "hold"} size={5} pulse={connected} />
          {eventCount} EVENTS
        </span>
      </div>
      <svg
        viewBox="0 0 100 88"
        className="block h-[260px] w-full text-brand/30"
        role="img"
        aria-label="Illustrative XRPL relay regions and live event pulse"
      >
        <defs>
          <pattern id="world-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M5 0H0V5" fill="none" stroke="currentColor" strokeWidth=".12" opacity=".32" />
          </pattern>
          <radialGradient id="world-atmo" cx="50%" cy="45%" r="58%">
            <stop offset="0" stopColor="hsl(var(--brand))" stopOpacity=".18" />
            <stop offset=".7" stopColor="hsl(var(--brand))" stopOpacity=".04" />
            <stop offset="1" stopColor="hsl(var(--brand))" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="world-fade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".22" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="100" height="88" fill="url(#world-grid)" opacity=".6" />
        <rect width="100" height="88" fill="url(#world-atmo)" />
        <g fill="none" stroke="currentColor" strokeWidth=".12" opacity=".3">
          <ellipse cx="50" cy="43" rx="42" ry="13" />
          <ellipse cx="50" cy="43" rx="34" ry="25" />
          <path d="M8 43h84M14 30c20 6 52 6 72 0M14 56c20-6 52-6 72 0" />
        </g>
        <path
          d="M5 31 12 25 20 23 28 28 34 27 39 33 47 27 55 26 62 30 69 26 78 29 87 25 96 31V53L89 58 81 57 73 63 65 59 57 65 48 58 39 62 30 57 21 61 12 55 5 57Z"
          fill="url(#world-fade)"
          stroke="currentColor"
          strokeWidth=".22"
          opacity=".42"
        />
        <path d="M22 40C34 24 55 22 78 47M47 30C56 40 69 50 86 76M22 40C39 52 61 51 86 76M30 34C45 36 59 36 69 54M31 65C38 53 45 45 47 30M59 36C67 39 74 43 78 47" fill="none" stroke="currentColor" strokeWidth=".22" strokeDasharray="1.3 1.2" opacity=".7" />
        <path d="M22 40C34 24 55 22 78 47M47 30C56 40 69 50 86 76M31 65C42 62 57 55 69 54" fill="none" stroke="hsl(var(--telemetry))" strokeWidth=".32" strokeDasharray="1 3" opacity=".8">
          <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="2.4s" repeatCount="indefinite" />
        </path>
        {relayNodes.map((region, index) => (
          <g key={region.short}>
            <circle cx={region.x} cy={region.y} r="4.8" fill="currentColor" opacity=".1">
              {connected && (
                <animate attributeName="r" values="3;6;3" dur={`${2.8 + index * 0.4}s`} repeatCount="indefinite" />
              )}
            </circle>
            <circle cx={region.x} cy={region.y} r={index < 4 ? "1.45" : "1"} fill="hsl(var(--telemetry))">
              {connected && (
                <animate attributeName="opacity" values=".35;1;.35" dur={`${1.7 + index * 0.25}s`} repeatCount="indefinite" />
              )}
            </circle>
            <text x={region.x + 3} y={region.y - 2.5} fill="currentColor" fontSize="2.3" fontFamily="IBM Plex Mono, monospace">
              {region.short}
            </text>
          </g>
        ))}
        <g key={pulseKey}>
          <circle cx="50" cy="43" r="2" fill="hsl(var(--brand))" opacity=".9">
            {connected && <animate attributeName="r" values="1.5;5;1.5" dur="2.2s" repeatCount="indefinite" />}
            {connected && <animate attributeName="opacity" values=".9;0;.9" dur="2.2s" repeatCount="indefinite" />}
          </circle>
          <text x="53" y="42" fill="hsl(var(--foreground))" fontSize="2.4" fontFamily="IBM Plex Mono, monospace">VALIDATED</text>
          <text x="53" y="45" fill="currentColor" fontSize="2.1" fontFamily="IBM Plex Mono, monospace">XRPL FABRIC</text>
        </g>
        <g fill="currentColor" fontSize="1.8" fontFamily="IBM Plex Mono, monospace" opacity=".65">
          <text x="5" y="7">N 60°</text><text x="5" y="84">S 60°</text>
          <text x="14" y="82">01</text><text x="47" y="82">02</text><text x="80" y="82">03</text>
        </g>
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-3 py-2">
        <span className="mono-font text-[8px] tracking-[0.12em] text-muted-foreground">
          LEDGER {ledgerIndex ? ledgerIndex.toLocaleString() : "—"}
        </span>
        <span className="mono-font text-[8px] tracking-[0.12em] text-muted-foreground">
          RELAY NODES {relayNodes.length} · REGIONS {RELAY_REGIONS.length}
        </span>
      </div>
      <p className="px-3 pb-3 pt-2 text-[9px] leading-relaxed text-muted-foreground">
        Packet lanes represent live ledger-event cadence through the observed relay topology. This
        is not transaction geolocation: XRPL publishes ledger events and node responses, not physical origin.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/40 px-3 pb-3 pt-2 mono-font text-[8px] tracking-[0.1em] text-muted-foreground">
        <span><i className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--telemetry))]" />RELAY NODE</span>
        <span><i className="mr-1.5 inline-block h-px w-4 align-middle bg-[hsl(var(--telemetry))]" />EVENT LANE</span>
        <span><i className="mr-1.5 inline-block h-px w-4 align-middle border-t border-dashed border-brand" />SECONDARY ROUTE</span>
      </div>
    </div>
  );
}

const maturityTone: Record<Maturity, "go" | "hold" | "outline"> = {
  live: "go",
  building: "hold",
  planned: "outline",
};

const maturityLabel: Record<Maturity, string> = {
  live: "LIVE",
  building: "IN FLIGHT",
  planned: "PLANNED",
};

/** Reveal a section once as it scrolls into the viewport. */
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * HomeScene — what this is, what it does, and what it is going to be.
 *
 * The console's front door. It states the mission in one breath, proves
 * it with live numbers rather than claims, then lays out the capability
 * set and the differentiated bets behind it.
 */
export function HomeScene({
  data,
  onNavigate,
}: {
  data: XrplState;
  onNavigate: (scene: string) => void;
}) {
  const { ledger, connected, events, successRate } = data;
  const [filter, setFilter] = useState<"all" | Maturity>("all");

  const capabilities =
    filter === "all"
      ? CAPABILITIES
      : CAPABILITIES.filter((capability) => capability.maturity === filter);

  const liveCount = CAPABILITIES.filter((c) => c.maturity === "live").length;

  return (
    <div className="h-full min-w-0 overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1180px] px-6 pb-10 pt-8">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <PatternMark element="orbital" size={380} opacity={0.07} className="-right-24 -top-28" />
          <PatternMark element="hatch" size={140} opacity={0.06} className="-left-16 top-24" />

          <motion.div
            className="relative flex flex-col items-start gap-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1">
              <StatusDot status={connected ? "go" : "no-go"} size={5} pulse={connected} />
              <span className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
                {connected ? "CONNECTED · XRPL MAINNET" : "RECONNECTING TO MAINNET"}
              </span>
            </div>

            <div className="flex items-center gap-5">
              <motion.div
                initial={{ opacity: 0, scale: 0.85, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ ...SPRING, delay: 0.1 }}
              >
                <NovaLogo size={72} tone="color" />
              </motion.div>
              <div>
                <h1 className="display text-[46px] font-[900] leading-[0.9] tracking-[0.02em] text-foreground">
                  NOSHASHI
                </h1>
                <p className="stencil mt-2 text-[10px] tracking-[0.34em] text-muted-foreground">
                  {BRAND.tagline}
                </p>
              </div>
            </div>

            <p className="max-w-[680px] text-[15px] leading-relaxed text-foreground/85">
              Compliance on the XRP Ledger is a cost centre — a thing institutions
              survive rather than use. NOSHASHI turns it into infrastructure:
              every settlement is adjudicated <em className="not-italic text-foreground">before</em> it is
              signed, answered <span className="text-go">GO</span> /{" "}
              <span className="text-hold">HOLD</span> /{" "}
              <span className="text-no-go">NO-GO</span>, and handed back with a
              receipt an auditor can verify.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button className="gap-2" onClick={() => onNavigate("verify")}>
                <NovaShield size={14} />
                RUN A GATE CHECK
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => onNavigate("revenue")}>
                <NovaBolt size={14} />
                READ THE BUSINESS PLAN
              </Button>
              <Button variant="ghost" className="gap-2" onClick={() => onNavigate("agent")}>
                <NovaTerminal size={14} />
                ASK THE AGENT
              </Button>
            </div>
          </motion.div>

          {/* Live proof strip */}
          <Reveal delay={0.15} className="mt-8">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                {
                  label: "VALIDATED LEDGER",
                  value: ledger?.ledgerIndex ?? null,
                  icon: <NovaSat size={14} />,
                },
                {
                  label: "LIVE TX OBSERVED",
                  value: events.length,
                  icon: <NovaBolt size={14} />,
                },
                {
                  label: "STREAM SUCCESS",
                  value: successRate,
                  suffix: "%",
                  icon: <NovaEye size={14} />,
                },
                {
                  label: "CAPABILITIES LIVE",
                  value: liveCount,
                  icon: <NovaGrid size={14} />,
                },
              ].map((stat) => (
                <Panel key={stat.label} bodyClassName="p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground">
                        {stat.label}
                      </p>
                      <p className="data-font mt-1.5 text-[22px] font-[600] leading-none text-foreground">
                        {stat.value === null ? "—" : <CountUp value={stat.value} />}
                        {stat.suffix && stat.value !== null && (
                          <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">
                            {stat.suffix}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-muted-foreground/70">{stat.icon}</span>
                  </div>
                </Panel>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── Live network picture ────────────────────────────── */}
        <Reveal className="mt-10">
          <div className="grid gap-3 lg:grid-cols-[1.35fr_.65fr]">
            <Panel
              label="LIVE NETWORK PICTURE"
              right={
                <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
                  {data.history.length}/48 CLOSES
                </span>
              }
              bodyClassName="p-3"
            >
              <RelayWorld
                connected={connected}
                eventCount={events.length}
                ledgerIndex={ledger?.ledgerIndex ?? 0}
              />
            </Panel>
            <Panel label="EVENT VELOCITY" bodyClassName="p-3">
              <div className="flex h-full flex-col justify-between gap-4">
                <div>
                  <p className="data-font text-[34px] font-[600] leading-none text-foreground">
                    {events.length}
                  </p>
                  <p className="stencil mt-2 text-[8px] tracking-[0.22em] text-muted-foreground">
                    OBSERVED IN LIVE WINDOW
                  </p>
                </div>
                <div className="space-y-2">
                  <DataRow label="STREAM" value={connected ? "LOCKED" : "OFFLINE"} tone={connected ? "go" : "hold"} />
                  <DataRow label="SUCCESS" value={successRate === null ? "—" : `${successRate}%`} tone={successRate === null ? undefined : successRate > 95 ? "go" : "hold"} />
                  <DataRow label="LATEST" value={events[0]?.type ?? "WAITING"} />
                  <DataRow label="LEDGER" value={events[0]?.ledger?.toLocaleString() ?? "—"} />
                </div>
              </div>
            </Panel>
          </div>
        </Reveal>

        {/* ── Problem / answer ─────────────────────────────────── */}
        <Reveal className="mt-10">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel label="THE PROBLEM" corners bodyClassName="p-4">
              <div className="space-y-3">
                {[
                  "Compliance is checked after the fact, so the first signal that a transaction was ineligible is that it failed.",
                  "Every venue re-runs the same identity checks, and users re-disclose the same private data to each one.",
                  "Verification lives in private logs. Nobody outside the checking party can prove a check ever happened.",
                  "Assistants that could explain any of this ship your transaction context to a vendor's API.",
                ].map((line, index) => (
                  <div key={line} className="flex gap-3">
                    <span className="display shrink-0 text-[11px] font-[700] text-no-go/60">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                      {line}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel label="THE ANSWER" corners bodyClassName="p-4">
              <div className="space-y-3">
                {[
                  "Adjudicate before signing. The gate runs against the destination domain's rule set and returns the exact rule that decided it.",
                  "Prove one predicate, not an identity. Selective disclosure lets a venue learn eligibility and nothing else.",
                  "Hash every verdict. A canonical SHA-256 receipt makes the check verifiable without exposing the payload.",
                  "Run the analyst on-device. The model sees everything; the network sees nothing.",
                ].map((line, index) => (
                  <div key={line} className="flex gap-3">
                    <span className="display shrink-0 text-[11px] font-[700] text-go/70">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                      {line}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </Reveal>

        {/* ── Capabilities ─────────────────────────────────────── */}
        <Reveal className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Eyebrow>CAPABILITY MATRIX</Eyebrow>
              <h2 className="display mt-1.5 text-[20px] font-[700] text-foreground">
                WHAT THE CONSOLE DOES
              </h2>
            </div>
            <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
              <TabsList>
                <TabsTrigger value="all">ALL</TabsTrigger>
                <TabsTrigger value="live">LIVE</TabsTrigger>
                <TabsTrigger value="building">IN FLIGHT</TabsTrigger>
                <TabsTrigger value="planned">PLANNED</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="mt-3 h-px bg-border" />

          <motion.div layout className="mt-4 grid grid-cols-3 gap-3">
            {capabilities.map((capability, index) => (
              <motion.div
                key={capability.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: Math.min(0.25, index * 0.03) }}
              >
                <Panel
                  className="h-full"
                  bodyClassName="p-3.5"
                  interactive={Boolean(capability.scene)}
                  onClick={() => {
                    if (capability.scene) onNavigate(sceneIdFor(capability.scene));
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="mono-font min-w-0 text-[11.5px] leading-snug text-foreground">
                      {capability.title}
                    </p>
                    <Badge
                      variant={maturityTone[capability.maturity]}
                      className="shrink-0 text-[8px]"
                    >
                      {maturityLabel[capability.maturity]}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                    {capability.blurb}
                  </p>
                  {capability.scene && (
                    <p className="stencil mt-3 border-t border-border pt-2 text-[8px] tracking-[0.2em] text-muted-foreground/70">
                      → {capability.scene}
                    </p>
                  )}
                </Panel>
              </motion.div>
            ))}
          </motion.div>
        </Reveal>

        {/* ── Differentiated bets ──────────────────────────────── */}
        <Reveal className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Eyebrow>DIFFERENTIATED BETS</Eyebrow>
              <h2 className="display mt-1.5 text-[20px] font-[700] text-foreground">
                WHAT NOBODY HAS BUILT HERE
              </h2>
            </div>
            <span className="mono-font text-[9px] text-muted-foreground">
              {CONCEPTS.length} CONCEPTS
            </span>
          </div>
          <div className="mt-3 h-px bg-border" />

          <div className="mt-4 grid grid-cols-2 gap-3">
            {CONCEPTS.map((concept, index) => (
              <Reveal key={concept.id} delay={Math.min(0.2, index * 0.04)}>
                <Panel className="hud-corner h-full" bodyClassName="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="display text-[13px] font-[700] leading-tight text-foreground">
                      {concept.title}
                    </p>
                    <span className="mono-font shrink-0 rounded border border-border px-1.5 py-0.5 text-[8px] text-muted-foreground">
                      {concept.weight}
                    </span>
                  </div>
                  <p className="mt-2.5 border-l border-no-go/40 pl-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
                    <span className="stencil mr-1.5 text-[8px] tracking-[0.2em] text-no-go">
                      GAP
                    </span>
                    {concept.gap}
                  </p>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-foreground/80">
                    {concept.detail}
                  </p>
                </Panel>
              </Reveal>
            ))}
          </div>
        </Reveal>

        {/* ── Edge Lab handoff ─────────────────────────────────── */}
        <Reveal className="mt-10">
          <Panel label="XRPL EDGE LAB · EXPERIMENTAL" bodyClassName="p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-[680px]">
                <p className="display text-[17px] font-[700] text-foreground">
                  Test the question before you trust the answer.
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  The portable Edge Pack documents three read-only analyses: liquidity escape
                  paths, amendment drift and counterparty recovery dependencies. It is research
                  material, not an automated action path or a compliance conclusion.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <a
                  href="https://noshashi.app/downloads/xrpl-edge-pack/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-[10px] font-semibold tracking-[0.08em] text-primary-foreground transition-colors hover:bg-primary/85"
                >
                  OPEN EDGE PACK
                </a>
                <a
                  href="https://noshashi.app/docs/NOSHASHI_XRPL_Edge_Lab_Brief.pdf"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[10px] font-semibold tracking-[0.08em] text-foreground transition-colors hover:border-brand/50"
                >
                  READ PDF BRIEF
                </a>
              </div>
            </div>
          </Panel>
        </Reveal>

        {/* ── Standards & contact ──────────────────────────────── */}
        <Reveal className="mt-10">
          <div className="grid grid-cols-3 gap-3">
            <Panel label="BUILT ON" bodyClassName="p-3.5">
              <div className="space-y-2">
                {[
                  { label: "XLS-70 · Credentials", href: LINKS.xls70 },
                  { label: "XLS-80 · Permissioned Domains", href: LINKS.xls80 },
                  { label: "XRPL Developer Docs", href: LINKS.xrplDocs },
                ].map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-2 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <NovaCredit size={11} className="shrink-0" />
                    <span className="min-w-0 truncate underline-offset-2 hover:underline">
                      {link.label}
                    </span>
                  </a>
                ))}
              </div>
            </Panel>

            <Panel label="TALK TO US" bodyClassName="p-3.5">
              <div className="space-y-2">
                {[
                  { label: "Support", email: CONTACT.support },
                  { label: "Institutions", email: CONTACT.sales },
                  { label: "Security", email: CONTACT.security },
                ].map((route) => (
                  <a
                    key={route.email}
                    href={`mailto:${route.email}`}
                    className="flex items-center justify-between gap-2 text-[10.5px] transition-colors hover:text-foreground"
                  >
                    <span className="text-muted-foreground">{route.label}</span>
                    <span className="mono-font min-w-0 truncate text-foreground/80 underline-offset-2 hover:underline">
                      {route.email}
                    </span>
                  </a>
                ))}
              </div>
              <p className="mono-font mt-3 border-t border-border pt-2 text-[8px] text-muted-foreground/70">
                {CONTACT.hours} · REPLY WITHIN {CONTACT.responseTarget.toUpperCase()}
              </p>
            </Panel>

            <Panel label="POSITION" bodyClassName="relative p-3.5">
              <PatternMark element="orbit" size={130} className="-bottom-8 -right-8" opacity={0.08} />
              <p className="relative text-[10.5px] leading-relaxed text-muted-foreground">
                Mainnet only. No testnet path exists in this build — every reading
                on every screen is the real ledger, because compliance software
                that demos on a testnet has proven nothing.
              </p>
              <div className="relative mt-3 flex flex-wrap gap-1.5">
                {["MAINNET ONLY", "ZERO EGRESS", "AUDITABLE", "DARK BY DEFAULT"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="mono-font rounded border border-border px-1.5 py-0.5 text-[8px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  )
                )}
              </div>
            </Panel>
          </div>
        </Reveal>

        {/* ── Footer ───────────────────────────────────────────── */}
        <footer className="mt-10 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <NovaLogo size={16} animated={false} className="text-muted-foreground" />
              <span className="mono-font text-[9px] text-muted-foreground">
                {copyrightLine()} · v{BRAND.version} · {BRAND.network}
              </span>
            </div>
            <div className="flex items-center gap-4">
              {[
                { label: "LEGAL & ACCESSIBILITY", scene: "legal" },
                { label: "BUSINESS PLAN", scene: "revenue" },
                { label: "SUPPORT", scene: "agent" },
              ].map((link) => (
                <button
                  key={link.scene}
                  onClick={() => onNavigate(link.scene)}
                  className={cn(
                    "stencil text-[8px] tracking-[0.2em] text-muted-foreground",
                    "underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  )}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Map a human scene name in the capability data to a scene id. */
function sceneIdFor(scene: string): string {
  const map: Record<string, string> = {
    "Mission Control": "control",
    Verification: "verify",
    Credentials: "credentials",
    "Domain Grid": "domains",
    "Audit Trail": "history",
    "Exposure Analysis": "risk",
    "Ledger & Policy": "workstation",
    Agent: "agent",
  };
  return map[scene] ?? "control";
}
