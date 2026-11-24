import { useState } from "react";
import { SceneHeader } from "../scenes/SceneHeader";
import { Panel, DataRow } from "../nova/Panel";
import type { PreflightPreview } from "../../lib/continuity/preview";
import type { SettlementResult } from "../../lib/continuity/settlement";

type Workspace = "preflight" | "policy" | "exposure" | "evidence";
const sections: { id: Workspace; title: string; description: string }[] = [
  { id: "preflight", title: "Transaction Preflight", description: "Review proposed transaction evidence" },
  { id: "policy", title: "Policy & Approvals", description: "Institutional rules and approval readiness" },
  { id: "exposure", title: "Exposure Watch", description: "Issuer and liquidity surveillance" },
  { id: "evidence", title: "Evidence Vault", description: "Decision records and verification" },
];

/**
 * Separate Continuity workspace surface, using existing Ledger Desk primitives.
 * No demo data, fake signed approvals, or transaction submission.
 * Parent app supplies independently collected read-only results.
 */
export function ContinuityWorkspace({
  preview = null,
  settlement = null,
  onRequestReview,
}: {
  preview?: PreflightPreview | null;
  settlement?: SettlementResult | null;
  onRequestReview?: () => void;
}) {
  const [active, setActive] = useState<Workspace>("preflight");
  const selected = sections.find((section) => section.id === active)!;
  const settlementLabel = settlement?.verdict === "GO" ? "Ledger checks passed" : settlement?.verdict;
  return (
    <div className="ledger-desktop flex h-full min-h-0 min-w-0 bg-background text-foreground">
      <aside aria-label="Continuity navigation" className="desk-sidebar hidden w-60 shrink-0 border-r border-border p-4 md:block">
        <div className="mb-6 border-b border-border pb-5">
          <p className="stencil text-[10px] text-muted-foreground">NOSHASHI LABS</p>
          <p className="display mt-2 text-2xl">Continuity</p>
          <p className="mono-font mt-1 text-[10px] text-muted-foreground">INSTITUTIONAL WORKSPACE</p>
        </div>
        <nav className="space-y-1">
          {sections.map((section) => (
            <button key={section.id} type="button" onClick={() => setActive(section.id)}
              aria-current={active === section.id ? "page" : undefined}
              className="desk-nav-row w-full border-b border-border/50 px-2 py-3 text-left text-xs hover:bg-muted"
            >
              {section.title}
            </button>
          ))}
        </nav>
        <p className="mono-font mt-8 border-t border-border pt-4 text-[10px] text-muted-foreground">
          READ ONLY · NO SIGNING OR SUBMISSION
        </p>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <SceneHeader index="01" kicker="NOSHASHI · CONTINUITY"
          title={selected.title}
          sub={selected.description + " · Read-only development workspace"}
          status="hold" statusLabel="Not authorized" />
        <nav aria-label="Continuity sections" className="flex gap-2 overflow-x-auto md:hidden">
          {sections.map(section => (
            <button key={section.id} type="button" onClick={() => setActive(section.id)}
              aria-current={active === section.id ? "page" : undefined}
              className="shrink-0 border border-border px-3 py-2 text-xs">{section.title}</button>
          ))}
        </nav>
        {active === "preflight" ? (
          <>
            <Panel label="Decision support" right={preview && (
              <span className={`mono-font text-xs ${preview.verdict === "NO-GO" ? "text-no-go" : "text-hold"}`}>
                {preview.verdict}
              </span>
            )}>
              <p className="text-lg font-medium">{preview ? "Preflight review" : "No transaction selected"}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {preview ? "Evidence requires further verification before any signing decision." :
                  "Connect a proposed transaction and validated evidence to begin review."}
              </p>
              <div className="mt-4 border-t border-border pt-3">
                <DataRow label="Signing authorization" value="Unavailable" tone="hold" />
                <DataRow label="Intent fingerprint" value={preview?.intentHash ?? "Not collected"} />
                  <DataRow label="Settlement evidence" value={settlementLabel ?? "Not collected"} />
              </div>
            </Panel>
            <div className="grid gap-3 lg:grid-cols-2">
              <Panel label="Evidence findings">
                {preview?.reasons.length ? (
                  <ul className="space-y-2 text-xs">
                    {preview.reasons.map((reason, i) => (
                      <li className="border-b border-border/50 pb-2 mono-font" key={i}>{reason}</li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">No verified preflight evidence provided.</p>}
              </Panel>
              <Panel label="Ledger settlement checks">
                {settlement && settlementLabel ? (
                  <div className="space-y-2">
                    <DataRow label="Evidence result" value={settlementLabel} tone={settlement.verdict === "NO-GO" ? "no-go" : settlement.verdict === "HOLD" ? "hold" : undefined} />
                    {settlement.reasons.map((reason, i) => <p className="mono-font text-xs" key={i}>{reason}</p>)}
                  </div>
                ) : <p className="text-xs text-muted-foreground">Validated XRPL settlement evidence has not been supplied.</p>}
              </Panel>
            </div>
          </>
        ) : (
          <Panel label={selected.title}>
            <p className="text-sm text-muted-foreground">
              This module is not connected in the separate Continuity build. No live state or approval history is represented here.
            </p>
            {active === "policy" && onRequestReview && (
              <button type="button" onClick={onRequestReview}
                className="desk-button mt-4 border border-border px-3 py-2 text-xs">
                Request manual review
              </button>
            )}
          </Panel>
        )}
      </main>
    </div>
  );
}
