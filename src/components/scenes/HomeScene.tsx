import { DeskArrow } from "@/components/nova/DeskArrow";
import { DecisionCard } from "@/components/nova/DecisionCard";
import { LedgerInstrument } from "@/components/nova/LedgerInstrument";
import { FirstRunGuide } from "@/components/scenes/FirstRunGuide";
import { QuestionShowcase } from "@/components/scenes/QuestionShowcase";
import { Button } from "@/components/ui/button";
import { CAPABILITIES } from "@/lib/roadmap";
import { BRAND, copyrightLine } from "@/lib/brand";
import type { XrplState } from "@/lib/xrpl/useXRPL";

const TOOLS = [
  {
    number: "01",
    title: "Issuer authority",
    copy: "Flags, freeze rights and signing power.",
    scene: "authority",
  },
  {
    number: "02",
    title: "Order book",
    copy: "Quoted depth against what owners can fund.",
    scene: "book",
  },
  {
    number: "03",
    title: "Settlement",
    copy: "What was requested. What actually arrived.",
    scene: "settlement",
  },
  {
    number: "04",
    title: "Exposure analysis",
    copy: "Position risk and the available exit.",
    scene: "risk",
  },
  {
    number: "05",
    title: "Ledger & policy",
    copy: "Recorded decisions and versioned rules.",
    scene: "workstation",
  },
  {
    number: "06",
    title: "Ledger sync",
    copy: "Named public sources, compared directly.",
    scene: "network",
  },
] as const;

export function HomeScene({
  data,
  onNavigate,
  mode,
  modeChosen,
  onChooseMode,
}: {
  data: XrplState;
  onNavigate: (scene: string) => void;
  mode: "executive" | "analyst";
  modeChosen: boolean;
  onChooseMode: (mode: "executive" | "analyst") => void;
}) {
  const { ledger, connected, events, latencyMs } = data;
  return (
    <div className="desk-home h-full min-w-0 overflow-y-auto overflow-x-hidden">
      <div className="desk-page">
        <div className="desk-mast">
          <span>The Ledger Desk</span>
          <span>Research edition / {BRAND.version}</span>
          <span>XRPL · Read only</span>
        </div>
        <section className="desk-home-hero" aria-labelledby="desk-home-title">
          <div className="desk-home-intro">
            <p className="desk-kicker">
              Independent readings. Inspectable evidence.
            </p>
            <h1 id="desk-home-title">
              See what
              <br />
              the ledger
              <br />
              <em>really says.</em>
            </h1>
            <p className="desk-dek">
              The powers behind a token. The liquidity behind a quote. The
              evidence behind your next decision.
            </p>
            <div className="desk-actions">
              <Button size="lg" onClick={() => onNavigate("verify")}>
                Check a settlement <DeskArrow />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                onClick={() => onNavigate("authority")}
              >
                Investigate an issuer <span aria-hidden="true">→</span>
              </Button>
            </div>
            <p className="desk-fine">
              Never holds keys. Never signs. People decide.
            </p>
          </div>
          <LedgerInstrument onNavigate={onNavigate} />
        </section>
        <dl className="desk-telemetry" aria-label="Current connection readings">
          <div>
            <dt>Connection</dt>
            <dd>
              <span
                className="desk-connection-dot"
                data-connected={connected}
              />
              {connected ? "Connected" : "Reconnecting"}
            </dd>
          </div>
          <div>
            <dt>Validated ledger</dt>
            <dd>
              {ledger?.ledgerIndex.toLocaleString() ?? "Awaiting a reading"}
            </dd>
          </div>
          <div>
            <dt>Observed events</dt>
            <dd>
              {events.length.toLocaleString()} <small>in this window</small>
            </dd>
          </div>
          <div>
            <dt>Round-trip latency</dt>
            <dd>
              {connected && typeof latencyMs === "number"
                ? `${latencyMs} ms`
                : "Not available"}
            </dd>
          </div>
        </dl>
        <section
          className="desk-section"
          aria-labelledby="desk-questions-title"
        >
          <div className="desk-section-heading">
            <div>
              <p className="desk-kicker">01 / The questions that matter</p>
              <h2 id="desk-questions-title">From a reading to a reason.</h2>
            </div>
            <p>
              Three ways into the same investigation.
              <br />
              Every finding keeps its source.
            </p>
          </div>
          <QuestionShowcase connected={connected} onNavigate={onNavigate} />
        </section>
        <section
          className="desk-section"
          aria-label="Your most recent decision"
        >
          <DecisionCard onNavigate={onNavigate} />
        </section>
        <section className="desk-section" aria-labelledby="desk-tools-title">
          <div className="desk-section-heading">
            <div>
              <p className="desk-kicker">02 / Your instruments</p>
              <h2 id="desk-tools-title">Follow the next question.</h2>
            </div>
            <span className="desk-fine">Search every tool / Ctrl or ⌘ K</span>
          </div>
          <div className="desk-tool-grid">
            {TOOLS.map((tool) => (
              <button
                type="button"
                key={tool.scene}
                onClick={() => onNavigate(tool.scene)}
              >
                <span className="desk-tool-number">{tool.number}</span>
                <span>
                  <strong>{tool.title}</strong>
                  <span>{tool.copy}</span>
                </span>
                <DeskArrow />
              </button>
            ))}
          </div>
        </section>
        <section
          className="desk-section desk-onboarding"
          aria-label="Getting started"
        >
          <FirstRunGuide
            mode={mode}
            modeChosen={modeChosen}
            onChooseMode={onChooseMode}
            onNavigate={onNavigate}
          />
        </section>
        <footer className="desk-page-footer">
          <span>{copyrightLine()}</span>
          <span>
            {CAPABILITIES.filter((c) => c.maturity === "live").length} available
            capabilities / Read-only intelligence
          </span>
          <button
            className="desk-text-link"
            onClick={() => onNavigate("trust")}
          >
            Trust & methodology <DeskArrow />
          </button>
        </footer>
      </div>
    </div>
  );
}
