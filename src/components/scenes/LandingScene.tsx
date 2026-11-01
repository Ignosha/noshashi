import { DeskArrow } from "@/components/nova/DeskArrow";
import { LedgerInstrument } from "@/components/nova/LedgerInstrument";
import { NovaLogo } from "@/components/nova/NovaLogo";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import type { XrplState } from "@/lib/xrpl/useXRPL";

export function LandingScene({
  data,
  onGetStarted,
  onNavigate,
}: {
  data: XrplState;
  onGetStarted: () => void;
  onNavigate: (scene: string) => void;
}) {
  return (
    <div className="desk-landing h-full overflow-y-auto bg-background">
      <div className="desk-page">
        <header className="desk-landing-header">
          <span className="flex items-center gap-3">
            <NovaLogo size={30} animated={false} />
            <span className="desk-wordmark">NOSHASHI</span>
          </span>
          <span className="desk-kicker">The Ledger Desk / {BRAND.version}</span>
          <button className="desk-text-link" onClick={onGetStarted}>
            Enter the desk <DeskArrow />
          </button>
        </header>
        <section className="desk-home-hero">
          <div className="desk-home-intro">
            <p className="desk-kicker">
              Read-only intelligence for the XRP Ledger
            </p>
            <h1>
              Intelligence.
              <br />
              <em>With evidence.</em>
            </h1>
            <p className="desk-dek">
              Inspect issuer controls, measure executable liquidity, and trace
              every answer to the ledger it came from.
            </p>
            <div className="desk-actions">
              <Button size="lg" onClick={onGetStarted}>
                Open the Ledger Desk <DeskArrow />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => onNavigate("verify")}
              >
                Run a settlement check
              </Button>
            </div>
            <p className="desk-fine">
              No wallet connection. No signing. No custody.
            </p>
          </div>
          <LedgerInstrument onNavigate={onNavigate} />
        </section>
        <div className="desk-welcome-facts">
          <div>
            <span>01 / Compliance</span>
            <h2>Can it move?</h2>
            <p>Inspect the controls and the rules behind a decision.</p>
          </div>
          <div>
            <span>02 / Liquidity</span>
            <h2>Can it actually exit?</h2>
            <p>Read funded depth alongside the quoted book.</p>
          </div>
          <div>
            <span>03 / Evidence</span>
            <h2>Can you prove why?</h2>
            <p>Inspect recorded decisions and verify their fingerprints.</p>
          </div>
        </div>
        <footer className="desk-page-footer">
          <span>
            {data.connected
              ? `Connected / Ledger ${data.ledger?.ledgerIndex.toLocaleString() ?? "awaiting validation"}`
              : "Connecting to public XRPL sources…"}
          </span>
          <span>A workstation for analysis. Your judgment stays yours.</span>
        </footer>
      </div>
    </div>
  );
}
