import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { useState } from "react";
import { motion } from "framer-motion";
import { Panel, Eyebrow } from "@/components/nova/Panel";
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
                <NovaLogo size={72} className="text-foreground" />
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
                  value: ledger?.ledgerIndex ?? 0,
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
                        <CountUp value={stat.value} />
                        {stat.suffix && (
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
