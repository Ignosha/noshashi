import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { motion } from "framer-motion";
import { NovaLogo } from "@/components/nova/NovaLogo";
import { MagneticButton } from "@/components/nova/MagneticButton";
import { CountUp } from "@/components/nova/CountUp";
import { StatusDot } from "@/components/nova/StatusDot";
import { Panel, Eyebrow } from "@/components/nova/Panel";
import {
  NovaBolt,
  NovaCredit,
  NovaEye,
  NovaGrid,
  NovaSat,
  NovaShield,
  NovaTerminal,
  NovaVault,
} from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { CONCEPTS } from "@/lib/roadmap";
import { BRAND, CONTACT, copyrightLine } from "@/lib/brand";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

/** Scroll-triggered reveal, once, with a short upward drift. */
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
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

const AUDIENCES = [
  {
    id: "institutions",
    kicker: "FOR INSTITUTIONS",
    title: "Compliance that clears before the trade",
    icon: <NovaShield size={16} />,
    points: [
      "Adjudicate every settlement against your own rule set before it is signed — not after it settles.",
      "Hand an examiner a receipt lineage instead of a spreadsheet: each verdict hashed, timestamped and reproducible.",
      "No custody, no keys, no client assets ever touch this software. It reads and it rules; it never holds.",
      "Read-only regulator seats, a published verification SLA, and a white-labelled wallet under your own brand.",
    ],
  },
  {
    id: "builders",
    kicker: "FOR VENUES & BUILDERS",
    title: "One call between your checkout and a violation",
    icon: <NovaTerminal size={16} />,
    points: [
      "Ask the same question the console asks and get the same answer, with the same receipt attached.",
      "Map your venue to an XLS-80 permissioned domain and let the rule set — not your backend — carry the policy.",
      "Webhooks on credential revocation and domain drift, so eligibility changes reach you before your users do.",
      "Deterministic rules, so the same inputs always produce the same verdict in staging and in production.",
    ],
  },
  {
    id: "public",
    kicker: "FOR EVERYONE ELSE",
    title: "Know the answer before you send",
    icon: <NovaEye size={16} />,
    points: [
      "See GO, HOLD or NO-GO with the exact rule behind it — no rejected transaction, no burnt fee, no guessing.",
      "Prove one fact about yourself instead of disclosing an identity. Accredited. Of age. Not sanctioned.",
      "Carry your credentials between venues rather than re-running the same KYC at every door.",
      "Free forever for individuals, and the assistant runs on your own machine.",
    ],
  },
];

const STEPS = [
  {
    step: "01",
    title: "DESCRIBE",
    body: "Name the settlement — destination, amount, and the permissioned domain it is headed into.",
    icon: <NovaCredit size={18} />,
  },
  {
    step: "02",
    title: "ADJUDICATE",
    body: "The engine evaluates credentials, reserve, ceiling and governance in a fixed order, and returns the rule that decided it.",
    icon: <NovaGrid size={18} />,
  },
  {
    step: "03",
    title: "RECEIPT",
    body: "A canonical SHA-256 digest of the verdict — verifiable by anyone, readable by no one who should not read it.",
    icon: <NovaVault size={18} />,
  },
];

const TRUST = [
  { label: "MAINNET ONLY", detail: "No testnet path exists in this build." },
  { label: "ZERO EGRESS", detail: "No analytics, no telemetry, no crash reporting." },
  { label: "ON-DEVICE AI", detail: "The assistant never sends a prompt off the machine." },
  { label: "OS KEYCHAIN", detail: "Secrets held by the system, never by the app." },
  { label: "STRICT CSP", detail: "The webview may reach nothing we did not declare." },
  { label: "NO CUSTODY", detail: "It cannot sign, hold, or move an asset." },
];

/**
 * LandingScene — the front door.
 *
 * A full-viewport mission brief that states the objective, shows who it
 * is for, proves the link is live with real ledger numbers, and hands
 * over to the console. Separate from the in-console overview on purpose:
 * this one has to earn attention, not serve an operator mid-task.
 */
export function LandingScene({
  data,
  onGetStarted,
  onNavigate,
}: {
  data: XrplState;
  onGetStarted: () => void;
  onNavigate: (scene: string) => void;
}) {
  const { ledger, connected, events, successRate } = data;

  return (
    <div className="scanlines relative h-full w-full overflow-y-auto overflow-x-hidden bg-background text-foreground">
      {/* Board geometry, static — see the note in App.tsx. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <PatternMark element="orbital" size={720} opacity={0.04} className="-right-64 -top-52" />
        <PatternMark element="dots" size={280} opacity={0.05} className="bottom-10 left-10" />
      </div>

      <div className="relative z-10">
        {/* ── Top bar ──────────────────────────────────────────── */}
        <header
          data-tauri-drag-region
          className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-background/85 px-6 backdrop-blur"
        >
          <button
            onClick={onGetStarted}
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
            aria-label={`${BRAND.name} — enter console`}
          >
            <NovaLogo size={18} className="text-foreground" />
            <span className="display text-[13px] font-[800] tracking-[0.14em] text-foreground">
              {BRAND.name}
            </span>
          </button>

          <nav className="flex items-center gap-5">
            {[
              { label: "BUSINESS PLAN", scene: "revenue" },
              { label: "LEGAL", scene: "legal" },
              { label: "CONTACT", scene: "legal" },
            ].map((link) => (
              <button
                key={link.label}
                onClick={() => onNavigate(link.scene)}
                className="stencil text-[8px] tracking-[0.22em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {link.label}
              </button>
            ))}
            <Button size="sm" onClick={onGetStarted}>
              GET STARTED
            </Button>
          </nav>
        </header>

        <div className="mx-auto w-full max-w-[1120px] px-6">
          {/* ── Hero ───────────────────────────────────────────── */}
          <section className="relative overflow-hidden py-20">
            <PatternMark element="orbital" size={460} opacity={0.07} className="-right-32 -top-16" />
            <PatternMark element="dots" size={220} opacity={0.07} className="-left-20 bottom-4" />

            <motion.div
              className="relative flex flex-col items-start gap-6"
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1">
                <StatusDot status={connected ? "go" : "no-go"} size={5} pulse={connected} />
                <span className="stencil text-[8px] tracking-[0.26em] text-muted-foreground">
                  {connected ? "LIVE ON XRPL MAINNET" : "CONNECTING TO MAINNET"}
                </span>
              </div>

              <div className="flex items-center gap-6">
                <motion.div
                  initial={{ opacity: 0, scale: 0.7, rotate: -12 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ ...SPRING, delay: 0.15 }}
                >
                  <NovaLogo size={86} className="text-foreground" />
                </motion.div>
                <div>
                  <h1 className="display text-[60px] font-[900] leading-[0.86] tracking-[0.02em] text-foreground">
                    NOSHASHI
                  </h1>
                  <p className="stencil mt-3 text-[10px] tracking-[0.38em] text-muted-foreground">
                    {BRAND.tagline.toUpperCase()}
                  </p>
                </div>
              </div>

              <div className="max-w-[720px]">
                <Eyebrow>THE OBJECTIVE</Eyebrow>
                <p className="mt-3 text-[19px] leading-[1.55] text-foreground/90">
                  Make regulated value move on the XRP Ledger without anyone
                  guessing whether it is allowed to.
                </p>
                <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                  Compliance today is a report written after the fact. NOSHASHI turns
                  it into infrastructure that runs <em className="not-italic text-foreground">before</em> the
                  signature: every settlement adjudicated against a published rule
                  set, answered <span className="text-go">GO</span> /{" "}
                  <span className="text-hold">HOLD</span> /{" "}
                  <span className="text-no-go">NO-GO</span> with the exact rule that
                  decided it, and handed back with a receipt an auditor can verify
                  without ever seeing your identity.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <MagneticButton
                  onClick={onGetStarted}
                  className="group flex items-center gap-3 bg-primary px-7 py-3.5 text-primary-foreground"
                >
                  <NovaLogo size={16} animated={false} />
                  <span className="stencil text-[11px] font-semibold tracking-[0.2em]">
                    GET STARTED
                  </span>
                  <motion.span
                    className="text-[13px]"
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  >
                    →
                  </motion.span>
                </MagneticButton>

                <Button variant="outline" className="gap-2" onClick={() => onNavigate("revenue")}>
                  <NovaBolt size={14} />
                  SEE THE BUSINESS PLAN
                </Button>
                <Button variant="ghost" className="gap-2" onClick={() => onNavigate("agent")}>
                  <NovaEye size={14} />
                  TALK TO THE AGENT
                </Button>
              </div>

              <p className="stencil text-[8px] tracking-[0.24em] text-muted-foreground/60">
                FREE FOR INDIVIDUALS · NO ACCOUNT · NO WALLET CONNECTION REQUIRED
              </p>
            </motion.div>
          </section>

          {/* ── Live proof ─────────────────────────────────────── */}
          <Reveal>
            <div className="grid grid-cols-4 gap-3 border-y border-border py-5">
              {[
                { label: "VALIDATED LEDGER", value: ledger?.ledgerIndex ?? 0, icon: <NovaSat size={13} /> },
                { label: "TX OBSERVED LIVE", value: events.length, icon: <NovaBolt size={13} /> },
                { label: "STREAM SUCCESS", value: successRate, suffix: "%", icon: <NovaEye size={13} /> },
                { label: "SETTLEMENT DELAY", value: 0, suffix: "MS ADDED", icon: <NovaShield size={13} /> },
              ].map((stat) => (
                <div key={stat.label} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="stencil text-[8px] tracking-[0.22em] text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="data-font mt-1.5 text-[24px] font-[600] leading-none text-foreground">
                      <CountUp value={stat.value} />
                      {stat.suffix && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          {stat.suffix}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-muted-foreground/60">{stat.icon}</span>
                </div>
              ))}
            </div>
          </Reveal>

          {/* ── How it works ───────────────────────────────────── */}
          <section className="py-16">
            <Reveal>
              <Eyebrow>THE MECHANISM</Eyebrow>
              <h2 className="display mt-2 text-[26px] font-[700] text-foreground">
                THREE STEPS, NO SIGNATURE REQUIRED
              </h2>
              <p className="mt-3 max-w-[620px] text-[12.5px] leading-relaxed text-muted-foreground">
                Nothing here touches the ledger. The gate runs entirely on read
                operations, which is why it can run before a transaction exists.
              </p>
            </Reveal>

            <div className="relative mt-8 grid grid-cols-3 gap-4">
              <div className="pointer-events-none absolute left-0 right-0 top-[22px] hidden h-px bg-border md:block" />
              {STEPS.map((step, index) => (
                <Reveal key={step.step} delay={index * 0.1}>
                  <div className="relative">
                    <div className="relative z-10 mb-4 grid h-11 w-11 place-items-center rounded-md border border-border bg-background text-foreground">
                      {step.icon}
                    </div>
                    <p className="display text-[11px] font-[700] tracking-[0.24em] text-muted-foreground/50">
                      {step.step}
                    </p>
                    <p className="display mt-1 text-[15px] font-[700] tracking-[0.12em] text-foreground">
                      {step.title}
                    </p>
                    <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ── Audiences ──────────────────────────────────────── */}
          <section className="py-4">
            <Reveal>
              <Eyebrow>WHO THIS IS FOR</Eyebrow>
              <h2 className="display mt-2 text-[26px] font-[700] text-foreground">
                THREE VERY DIFFERENT PROBLEMS
              </h2>
            </Reveal>

            <div className="mt-8 space-y-3">
              {AUDIENCES.map((audience, index) => (
                <Reveal key={audience.id} delay={index * 0.08}>
                  <Panel className="hud-corner" bodyClassName="p-5">
                    <div className="grid grid-cols-[260px_1fr] gap-8">
                      <div>
                        <div className="mb-3 grid h-9 w-9 place-items-center rounded-md border border-border text-foreground">
                          {audience.icon}
                        </div>
                        <p className="stencil text-[8px] tracking-[0.26em] text-muted-foreground">
                          {audience.kicker}
                        </p>
                        <p className="display mt-2 text-[16px] font-[700] leading-tight text-foreground">
                          {audience.title}
                        </p>
                      </div>
                      <ul className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {audience.points.map((point) => (
                          <li key={point} className="flex gap-2.5">
                            <span className="mt-[7px] h-1 w-1 shrink-0 bg-go" />
                            <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                              {point}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Panel>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ── Trust ──────────────────────────────────────────── */}
          <section className="py-16">
            <Reveal>
              <Eyebrow>SECURITY POSTURE</Eyebrow>
              <h2 className="display mt-2 text-[26px] font-[700] text-foreground">
                THE SMALLEST POSSIBLE ATTACK SURFACE
              </h2>
              <p className="mt-3 max-w-[640px] text-[12.5px] leading-relaxed text-muted-foreground">
                The safest way to protect data is not to hold it. This build has no
                server, no account system, no session token and no key material —
                so there is nothing on our side to breach.
              </p>
            </Reveal>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {TRUST.map((item, index) => (
                <Reveal key={item.label} delay={index * 0.05}>
                  <div className="flex h-full gap-3 border border-border p-3.5">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 bg-go" />
                    <div>
                      <p className="stencil text-[9px] tracking-[0.2em] text-foreground">
                        {item.label}
                      </p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ── Differentiators ────────────────────────────────── */}
          <section className="pb-16">
            <Reveal>
              <Eyebrow>WHAT NOBODY HAS BUILT HERE</Eyebrow>
              <h2 className="display mt-2 text-[26px] font-[700] text-foreground">
                THE BETS THAT MAKE THIS DIFFERENT
              </h2>
            </Reveal>

            <div className="mt-6 grid grid-cols-4 gap-3">
              {CONCEPTS.slice(0, 4).map((concept, index) => (
                <Reveal key={concept.id} delay={index * 0.06}>
                  <Panel className="h-full" bodyClassName="p-4">
                    <p className="display text-[13px] font-[700] leading-tight text-foreground">
                      {concept.title}
                    </p>
                    <p className="mt-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
                      {concept.detail}
                    </p>
                  </Panel>
                </Reveal>
              ))}
            </div>

            <Reveal delay={0.1}>
              <button
                onClick={() => onNavigate("home")}
                className="stencil mt-4 text-[8px] tracking-[0.24em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                SEE ALL {CONCEPTS.length} CONCEPTS →
              </button>
            </Reveal>
          </section>

          {/* ── Final CTA ──────────────────────────────────────── */}
          <Reveal>
            <div className="relative overflow-hidden rounded-lg border border-border p-10 text-center">
              <PatternMark element="orbital" size={240} className="-bottom-16 -right-16" opacity={0.07} />
              <PatternMark element="hatch" size={200} className="-left-12 -top-12" opacity={0.07} />
              <div className="relative">
                <NovaLogo size={44} className="mx-auto text-foreground" />
                <h2 className="display mt-5 text-[26px] font-[800] leading-tight text-foreground">
                  RUN YOUR FIRST GATE CHECK
                </h2>
                <p className="mx-auto mt-3 max-w-[460px] text-[12px] leading-relaxed text-muted-foreground">
                  It reads mainnet, evaluates a real rule set, and returns a real
                  receipt. No signup, no wallet connection, nothing signed.
                </p>
                <div className="mt-6 flex items-center justify-center gap-3">
                  <MagneticButton
                    onClick={onGetStarted}
                    className="flex items-center gap-3 bg-primary px-7 py-3.5 text-primary-foreground"
                  >
                    <span className="stencil text-[11px] font-semibold tracking-[0.2em]">
                      GET STARTED
                    </span>
                    <span className="text-[13px]">→</span>
                  </MagneticButton>
                  <Button variant="outline" asChild>
                    <a href={`mailto:${CONTACT.sales}`}>TALK TO US</a>
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>

          {/* ── Footer ─────────────────────────────────────────── */}
          <footer className="mt-10 border-t border-border py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <NovaLogo size={15} animated={false} className="text-muted-foreground" />
                <span className="mono-font text-[9px] text-muted-foreground">
                  {copyrightLine()} · v{BRAND.version} · {BRAND.network}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {[
                  { label: "SUPPORT", href: `mailto:${CONTACT.support}` },
                  { label: "SECURITY", href: `mailto:${CONTACT.security}` },
                  { label: "INSTITUTIONS", href: `mailto:${CONTACT.sales}` },
                ].map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className={cn(
                      "stencil text-[8px] tracking-[0.2em] text-muted-foreground",
                      "underline-offset-4 transition-colors hover:text-foreground hover:underline"
                    )}
                  >
                    {link.label}
                  </a>
                ))}
                <button
                  onClick={() => onNavigate("legal")}
                  className="stencil text-[8px] tracking-[0.2em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  LEGAL & ACCESSIBILITY
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
