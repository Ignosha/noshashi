import { useState } from "react";
import { SceneHeader } from "./SceneHeader";
import { Panel, Eyebrow } from "@/components/nova/Panel";
import { StatusDot } from "@/components/nova/StatusDot";
import { TRUST, type TrustStage } from "@/lib/trust/boundary";
import type { SceneId } from "@/App";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { cn } from "@/lib/utils";

/**
 * TRUST & SECURITY — the trust boundary, as an interactive pipeline.
 *
 * Every word on this screen comes from src/lib/trust/boundary.json, the
 * same file the website's /trust/ page is rendered from, and the claims
 * in it are checked against the code by src/lib/trust/__tests__/. The
 * only live element is the first stage: which ledger the app is reading
 * right now, from the connection it actually has.
 */
export function TrustScene({ data, onNavigate }: { data: XrplState; onNavigate?: (scene: SceneId) => void }) {
  const [openId, setOpenId] = useState<string>(TRUST.stages[0].id);
  const open = TRUST.stages.find((s) => s.id === openId) ?? TRUST.stages[0];

  return (
    // Every other scene pads itself and scrolls inside the clipped main
    // area; this one did neither, so it sat against the sidebar and
    // everything below the first screen could not be reached.
    <div className="h-full min-w-0 space-y-4 overflow-y-auto p-4">
      <SceneHeader
        kicker="READ-ONLY · NO CUSTODY · NO SIGNING · NO BROADCAST"
        title="TRUST & SECURITY"
        sub="What NOSHASHI touches, what it never does, and where your data goes. Each claim here is checked against the code by test."
        status="go"
        statusLabel="BOUNDARY TESTED"
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="list" aria-label="Boundaries">
        {TRUST.boundaries.map((b) => (
          <div key={b.id} role="listitem" className="border border-border p-2.5">
            <p className="stencil flex items-center gap-1.5 text-[9px] tracking-[0.22em] text-go">
              <StatusDot status="go" size={5} /> {b.label}
            </p>
            <p className="mt-1 text-[10.5px] leading-snug text-foreground">{b.claim}</p>
            <p className="mt-1 text-[9.5px] leading-snug text-muted-foreground">{b.basis}</p>
          </div>
        ))}
      </div>

      <Panel label="DATA PATH · XRPL MAINNET → CRYPTOGRAPHIC RECEIPT" bodyClassName="p-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ol className="space-y-0" aria-label="Stages, from the ledger to the receipt">
            {TRUST.stages.map((stage, i) => (
              <li key={stage.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(stage.id)}
                  aria-current={stage.id === open.id ? "step" : undefined}
                  className={cn(
                    "flex w-full items-start gap-2 border px-2.5 py-1.5 text-left transition-colors",
                    stage.id === open.id ? "border-foreground/50 bg-foreground/[0.04]" : "border-border hover:border-foreground/30"
                  )}
                >
                  <span className="data-font mt-px text-[9px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="stencil block text-[9.5px] tracking-[0.2em] text-foreground">{stage.label}</span>
                    <span className="block text-[9.5px] leading-snug text-muted-foreground">{stage.summary}</span>
                  </span>
                </button>
                {i < TRUST.stages.length - 1 && (
                  <p aria-hidden="true" className="data-font py-0.5 pl-4 text-[9px] leading-none text-muted-foreground/60">↓</p>
                )}
              </li>
            ))}
          </ol>

          <StageDetail stage={open} data={data} onNavigate={onNavigate} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel label="WHERE YOUR DATA GOES" bodyClassName="p-3">
          <dl className="space-y-2">
            {TRUST.dataFlows.map((f) => (
              <div key={f.party} className="border-b border-border/40 pb-1.5">
                <dt className="stencil text-[8.5px] tracking-[0.2em] text-foreground">{f.party.toUpperCase()}</dt>
                <dd className="text-[10px] leading-snug text-foreground/90">{f.what}</dd>
                <dd className="text-[9.5px] leading-snug text-muted-foreground">{f.why}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <div className="space-y-3">
          <Panel label="HUMAN OVERSIGHT" bodyClassName="p-3">
            <ul className="space-y-1.5">
              {TRUST.oversight.map((line) => (
                <li key={line} className="text-[10px] leading-snug text-foreground/90">— {line}</li>
              ))}
            </ul>
          </Panel>
          <Panel label="WHAT THIS DOES NOT CLAIM" bodyClassName="p-3">
            <ul className="space-y-1.5">
              {TRUST.limits.map((line) => (
                <li key={line} className="flex gap-1.5 text-[10px] leading-snug text-foreground/90">
                  <span className="mt-1"><StatusDot status="hold" size={5} /></span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel label="THE ONLY LEDGER COMMANDS NOSHASHI SENDS" bodyClassName="p-3">
        <p className="data-font text-[10px] leading-relaxed text-foreground">{TRUST.readCommands.join(" · ")}</p>
        <p className="mt-1.5 text-[9.5px] text-muted-foreground">
          Never sent: {TRUST.forbiddenCommands.join(", ")}. {TRUST.scope}
        </p>
      </Panel>
    </div>
  );
}

function StageDetail({ stage, data, onNavigate }: { stage: TrustStage; data: XrplState; onNavigate?: (scene: SceneId) => void }) {
  return (
    <div className="border border-border p-3" aria-live="polite">
      <Eyebrow>{stage.label}</Eyebrow>
      <p className="mt-1.5 text-[11px] leading-relaxed text-foreground">{stage.detail}</p>

      {(stage.id === "mainnet" || stage.id === "validated") && (
        <div className="mt-2.5 border-t border-border/50 pt-2">
          <p className="stencil text-[8px] tracking-[0.22em] text-muted-foreground">RIGHT NOW</p>
          {data.ledger ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-foreground">
              <StatusDot status={data.ledger.validated ? "go" : "hold"} size={6} />
              Reading ledger <span className="data-font">#{data.ledger.ledgerIndex.toLocaleString("en-US")}</span>
              {data.ledger.validated ? ", validated" : ", not yet validated"}
              {data.connected ? "" : " · live stream reconnecting"}
            </p>
          ) : (
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">{data.ledgerError ?? "Connecting to mainnet…"}</p>
          )}
        </div>
      )}

      <div className="mt-2.5 border-t border-border/50 pt-2">
        <p className="stencil text-[8px] tracking-[0.22em] text-muted-foreground">IMPLEMENTED IN</p>
        <ul className="mt-0.5">
          {stage.where.map((file) => (
            <li key={file} className="data-font selectable text-[10px] text-foreground/80">{file}</li>
          ))}
        </ul>
      </div>

      {onNavigate && (
        <button
          type="button"
          onClick={() => onNavigate(stage.scene)}
          className="stencil mt-3 border border-border px-2.5 py-1 text-[8px] tracking-[0.2em] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        >
          SEE IT IN THE APP →
        </button>
      )}
    </div>
  );
}
