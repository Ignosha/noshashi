import { useMemo, useState } from "react";
import { DataRow, Eyebrow } from "@/components/nova/Panel";
import { Button } from "@/components/ui/button";
import { ANTHROPIC_MAX_TOKENS, CHAT_TEMPERATURE, HISTORY_TURNS } from "@/lib/agent/client";
import { HARD_RULES, buildStateBrief, buildSystemPrompt, type AgentMode } from "@/lib/agent/context";
import {
  aiUseToCsv,
  disclosedFields,
  type AiUseRecord,
  type DataBoundary,
} from "@/lib/agent/governance";
import { findProvider, isEndpointSafe, type AgentConfig } from "@/lib/agent/providers";
import { signContent, useLedger } from "@/lib/desk/ledger";
import { usePolicyStore } from "@/lib/desk/policyStore";
import { buildPolicyBrief } from "@/lib/agent/policyContext";
import { saveTextFile } from "@/lib/export";
import { useToast } from "@/lib/toast";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { cn } from "@/lib/utils";

const SHOWN = 50;

/**
 * The agent's governance record: its authority, its data boundary, the
 * settings and rules it runs under, the exact prompt it is given, and
 * every call made to a model. Each value is read from the configuration
 * in force or from calls that happened — none of it is descriptive copy.
 */
export function AgentGovernance({
  config,
  boundary,
  keyStored,
  mode,
  data,
  log,
}: {
  config: AgentConfig;
  boundary: DataBoundary;
  keyStored: boolean;
  mode: AgentMode;
  data: XrplState;
  log: { records: AiUseRecord[]; loaded: boolean; clear: () => Promise<void> };
}) {
  const { push } = useToast();
  const [showPrompt, setShowPrompt] = useState(false);
  const provider = findProvider(config.providerId);
  const safety = isEndpointSafe(config.baseUrl);

  const { entries } = useLedger();
  const { active } = usePolicyStore();
  const fields = useMemo(() => disclosedFields(buildStateBrief(data)), [data]);
  const prompt = useMemo(
    () => (showPrompt ? buildSystemPrompt(mode, data, boundary, buildPolicyBrief(active, entries[0] ?? null)) : ""),
    [showPrompt, mode, data, boundary, active, entries]
  );

  const counts = useMemo(() => {
    const c = { total: log.records.length, remote: 0, error: 0 };
    for (const r of log.records) {
      if (!r.onDevice) c.remote += 1;
      if (r.outcome === "error") c.error += 1;
    }
    return c;
  }, [log.records]);

  const exportLog = async () => {
    try {
      const csv = aiUseToCsv(log.records);
      const sig = await signContent(csv);
      const body = `${csv}\n# NOSHASHI AI use record\n# records=${log.records.length}\n# generated=${new Date().toISOString()}\n# sha256(body)=${sig}\n`;
      const dest = await saveTextFile(`noshashi-ai-use-${new Date().toISOString().slice(0, 10)}.csv`, body);
      push({ title: "AI USE RECORD EXPORTED", body: `${log.records.length} records written to ${dest}`, tone: "go" });
    } catch (error) {
      push({
        title: "EXPORT FAILED",
        body: error instanceof Error ? error.message : "Unable to write file",
        tone: "no-go",
      });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 p-4 xl:grid-cols-2">
      <section>
        <Eyebrow className="mb-2">AUTHORITY</Eyebrow>
        <DataRow label="ROLE" value="ADVISORY ONLY" tone="go" />
        <DataRow label="ISSUES VERDICTS" value="NO · DETERMINISTIC ENGINE" />
        <DataRow label="WRITES TO LEDGER" value="NO" />
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Model output is shown in the conversation and nowhere else. It is not read by the policy
          engine, the adjudication ledger or the evidence chain; a test fails the build if any of
          them imports the agent. The ledger holds the facts, the policy decides, a person acts.
        </p>
      </section>

      <section>
        <Eyebrow className="mb-2">DATA BOUNDARY</Eyebrow>
        <DataRow label="PROVIDER" value={provider.name} />
        <DataRow label="ENDPOINT" value={boundary.host} />
        <DataRow
          label="PROCESSED"
          value={boundary.onDevice ? "ON THIS DEVICE" : "REMOTE SERVICE"}
          tone={boundary.onDevice ? "go" : "hold"}
        />
        <DataRow
          label="TRANSPORT"
          value={safety.ok ? (boundary.onDevice ? "LOOPBACK" : "HTTPS ENFORCED") : "REFUSED"}
          tone={safety.ok ? "go" : "no-go"}
        />
        <DataRow
          label="API KEY"
          value={!provider.requiresKey ? "NOT REQUIRED" : keyStored ? "IN OS KEYRING" : "NOT SET"}
          tone={!provider.requiresKey || keyStored ? "default" : "hold"}
        />
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{boundary.statement}</p>
      </section>

      <section>
        <Eyebrow className="mb-2">MODEL SETTINGS IN FORCE</Eyebrow>
        <DataRow label="MODEL" value={config.model || "none selected"} tone={config.model ? "default" : "hold"} />
        <DataRow label="TEMPERATURE" value={CHAT_TEMPERATURE} />
        <DataRow label="EARLIER TURNS SENT" value={`last ${HISTORY_TURNS}`} />
        <DataRow
          label="OUTPUT CAP"
          value={provider.api === "anthropic" ? `${ANTHROPIC_MAX_TOKENS} tokens` : "runtime default"}
        />
        <DataRow label="MODE" value={mode.toUpperCase()} />
      </section>

      <section>
        <Eyebrow className="mb-2">RULES GIVEN TO THE MODEL</Eyebrow>
        <ol className="space-y-1.5">
          {HARD_RULES.map((rule, i) => (
            <li key={rule} className="flex gap-2 text-[10px] leading-snug text-foreground">
              <span className="mono-font text-muted-foreground">{i + 1}.</span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          These are instructions, not guarantees: a model can fail to follow them. Nothing that
          decides a verdict depends on it following them.
        </p>
      </section>

      <section className="xl:col-span-2">
        <Eyebrow className="mb-2">WHAT EVERY PROMPT CONTAINS</Eyebrow>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          The rules above,{" "}
          {mode === "compliance"
            ? "the policy engine's rule order and the domain registry"
            : "the console reference"}
          , the active institutional policy and the latest recorded verdict with its rule results, the
          last {HISTORY_TURNS} turns of this conversation, your question, and these live-state fields:
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {fields.map((f) => (
            <span
              key={f}
              className={cn(
                "mono-font border px-1.5 py-0.5 text-[9px]",
                f.startsWith("WALLET") || f === "HELD_CREDENTIALS"
                  ? "border-hold/50 text-hold"
                  : "border-border text-muted-foreground"
              )}
            >
              {f}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[9px] text-muted-foreground/80">
          Highlighted fields identify the loaded wallet.
        </p>
        <button
          onClick={() => setShowPrompt((v) => !v)}
          aria-expanded={showPrompt}
          className="stencil mt-3 text-[8px] tracking-[0.2em] text-foreground underline underline-offset-2"
        >
          {showPrompt ? "HIDE EXACT SYSTEM PROMPT" : "SHOW EXACT SYSTEM PROMPT"}
        </button>
        {showPrompt && (
          <>
            <p className="mono-font mt-2 text-[9px] text-muted-foreground">
              {prompt.length.toLocaleString()} characters · as it would be sent now
            </p>
            <pre className="mono-font selectable mt-1 max-h-[280px] overflow-auto whitespace-pre-wrap border border-border bg-background p-2.5 text-[9px] leading-relaxed text-muted-foreground">
              {prompt}
            </pre>
          </>
        )}
      </section>

      <section className="xl:col-span-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Eyebrow>
            AI USE RECORD · {counts.total.toLocaleString()} CALLS · {counts.remote.toLocaleString()} REMOTE ·{" "}
            {counts.error.toLocaleString()} FAILED
          </Eyebrow>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => void exportLog()} disabled={counts.total === 0}>
              EXPORT SIGNED CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={counts.total === 0}
              onClick={() =>
                void log.clear().then(() => push({ title: "AI USE RECORD CLEARED", tone: "hold" }))
              }
            >
              CLEAR
            </Button>
          </div>
        </div>
        <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
          One row per call to a model, kept on this device. It stores SHA-256 digests and sizes of what
          was sent and returned, never the text. Support answers from the built-in knowledge base are
          not model calls and are not recorded.
        </p>
        {!log.loaded ? (
          <p className="mono-font animate-pulse text-[10px] text-muted-foreground">LOADING…</p>
        ) : counts.total === 0 ? (
          <p className="mono-font text-[10px] text-muted-foreground">No model calls recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  {["TIME", "MODE", "MODEL", "WHERE", "SENT", "RETURNED", "OUTCOME", "PROMPT SHA-256"].map((h) => (
                    <th key={h} className="stencil px-2 py-1.5 text-[8px] font-medium tracking-[0.2em] text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.records.slice(0, SHOWN).map((r) => (
                  <tr key={`${r.at}-${r.promptDigest}`} className="border-b border-border/30">
                    <td className="mono-font px-2 py-1.5 text-[9px] text-muted-foreground">
                      {new Date(r.at).toLocaleString()}
                    </td>
                    <td className="mono-font px-2 py-1.5 text-[9px] text-muted-foreground">{r.mode}</td>
                    <td className="mono-font max-w-[140px] truncate px-2 py-1.5 text-[9px] text-foreground">{r.model}</td>
                    <td className={cn("mono-font px-2 py-1.5 text-[9px]", r.onDevice ? "text-go" : "text-hold")}>
                      {r.onDevice ? "device" : r.host}
                    </td>
                    <td className="mono-font px-2 py-1.5 text-[9px] tabular-nums text-muted-foreground">
                      {r.promptChars.toLocaleString()}
                    </td>
                    <td className="mono-font px-2 py-1.5 text-[9px] tabular-nums text-muted-foreground">
                      {r.responseChars.toLocaleString()}
                    </td>
                    <td
                      className={cn(
                        "mono-font px-2 py-1.5 text-[9px]",
                        r.outcome === "complete" ? "text-go" : r.outcome === "error" ? "text-no-go" : "text-hold"
                      )}
                    >
                      {r.outcome}
                    </td>
                    <td className="mono-font selectable px-2 py-1.5 text-[9px] text-muted-foreground">
                      {r.promptDigest.slice(0, 16)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {counts.total > SHOWN && (
              <p className="stencil mt-2 text-[8px] tracking-[0.18em] text-muted-foreground">
                SHOWING {SHOWN} MOST RECENT · EXPORT FOR ALL {counts.total.toLocaleString()}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
