import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusDot } from "@/components/nova/StatusDot";
import { observerActions, sweep, useObserver, OBSERVER_INTERVALS } from "@/lib/agent/useObserver";
import { observationPrompt, type Observation } from "@/lib/agent/observer";
import { investigateIssuer, investigationPrompt } from "@/lib/agent/investigate";
import { isValidAddress, shortAddress } from "@/lib/xrpl/client";
import { useSetting } from "@/lib/store";
import { cn } from "@/lib/utils";

const TONE: Record<Observation["severity"], "no-go" | "hold" | "go"> = { critical: "no-go", warn: "hold", info: "go" };
const utc = (iso: string) => iso.replace("T", " ").replace(/\.\d+Z$/, " UTC");

/**
 * OBSERVER — the agent's first role, in the Agent scene.
 *
 * What it watches, when it last read, and what changed. Every observation
 * came from comparing two validated readings; "Ask the agent" hands the
 * observation and its evidence to the Analyst as one grounded question.
 * The one-click issuer investigation lives here too, because it is the
 * same move in the other direction: evidence first, then the question.
 */
export function ObserverPanel({ onAsk }: { onAsk: (prompt: string) => void }) {
  const s = useObserver();
  const [configured] = useSetting("wallet.address", "");
  const [address, setAddress] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [issuer, setIssuer] = useState("");
  const [investigating, setInvestigating] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);

  const add = async (a: string) => {
    setAddError(await observerActions.addWallet(a));
    if (a === address) setAddress("");
  };

  const investigate = async () => {
    const a = issuer.trim();
    if (!isValidAddress(a)) return setInvError("That is not an XRPL address (r…).");
    setInvestigating(true);
    setInvError(null);
    try {
      onAsk(investigationPrompt(await investigateIssuer(a)));
    } catch (error) {
      setInvError(error instanceof Error ? error.message : "The issuer could not be read.");
    } finally {
      setInvestigating(false);
    }
  };

  const serious = s.log.filter((o) => o.severity !== "info").length;

  return (
    <div className="grid min-h-0 grid-cols-1 gap-4 p-3 xl:grid-cols-5">
      <div className="space-y-4 xl:col-span-2">
        <section>
          <div className="flex items-center justify-between">
            <p className="stencil text-[9px] tracking-[0.2em] text-foreground">WATCHING</p>
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <input type="checkbox" checked={s.enabled} onChange={(e) => void observerActions.setEnabled(e.target.checked)} />
              Observe in the background
            </label>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Reads each wallet from validated mainnet on an interval, whatever screen is open, and records what changed:
            freezes, balances, credentials, and the powers of every issuer the wallet holds. The detection is fixed rules,
            not a model. Readings stay on this device.
          </p>
          <div className="mt-2 flex gap-1.5">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="r… wallet to watch" spellCheck={false} className="h-8 min-w-0 flex-1 font-mono text-[11px]" />
            <Button size="sm" onClick={() => void add(address.trim())}>WATCH</Button>
          </div>
          {configured && isValidAddress(configured) && !s.wallets.includes(configured) && (
            <button type="button" onClick={() => void add(configured)} className="mt-1 text-[10px] text-muted-foreground underline underline-offset-2">
              Watch your configured wallet ({shortAddress(configured)})
            </button>
          )}
          {addError && <p className="mt-1 text-[10px] text-no-go">{addError}</p>}
          <ul className="mt-2 space-y-1">
            {s.wallets.map((w) => {
              const r = s.readings[w];
              return (
                <li key={w} className="flex items-center justify-between gap-2 border-b border-border/40 pb-1">
                  <span className="min-w-0">
                    <span className="data-font selectable block truncate text-[10.5px] text-foreground">{w}</span>
                    <span className="mono-font text-[9px] text-muted-foreground">
                      {r ? `${r.funded ? `${r.balanceXrp.toLocaleString("en-US")} XRP · ${r.lines.length} lines · ${r.credentials.length} credentials` : "not funded"} · read ${utc(r.readAt)}` : "baseline not read yet"}
                    </span>
                  </span>
                  <button type="button" onClick={() => void observerActions.removeWallet(w)} className="stencil shrink-0 text-[8px] tracking-[0.18em] text-muted-foreground hover:text-foreground">REMOVE</button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select aria-label="Observer interval" value={s.intervalMs} onChange={(e) => void observerActions.setInterval(Number(e.target.value))} className="mono-font h-7 rounded border border-border bg-background px-1 text-[10px] text-foreground">
              {OBSERVER_INTERVALS.map((i) => <option key={i.ms} value={i.ms}>Every {i.label}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={s.sweeping || !s.wallets.length} onClick={() => void sweep()}>
              {s.sweeping ? "READING…" : "READ NOW"}
            </Button>
            <span className="mono-font text-[9px] text-muted-foreground">
              {s.lastSweep ? `Last read ${utc(s.lastSweep)}` : "Not read yet"}
            </span>
          </div>
          {s.error && <p className="mt-1 text-[10px] text-hold">{s.error}</p>}
        </section>

        <section className="border-t border-border/50 pt-3">
          <p className="stencil text-[9px] tracking-[0.2em] text-foreground">INVESTIGATE AN ISSUER</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            One click reads the issuer's authority certificate and outstanding obligations from validated state, then hands
            every finding to the agent as one question. The engines decide what is true; the agent explains it.
          </p>
          <div className="mt-2 flex gap-1.5">
            <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="r… issuer" spellCheck={false} className="h-8 min-w-0 flex-1 font-mono text-[11px]" />
            <Button size="sm" disabled={investigating} onClick={() => void investigate()}>{investigating ? "READING…" : "INVESTIGATE"}</Button>
          </div>
          {invError && <p className="mt-1 text-[10px] text-no-go">{invError}</p>}
        </section>
      </div>

      <section className="min-h-0 xl:col-span-3">
        <div className="flex items-center justify-between">
          <p className="stencil text-[9px] tracking-[0.2em] text-foreground">
            OBSERVATIONS · {s.log.length}{serious ? ` · ${serious} NEED ATTENTION` : ""}
          </p>
          {s.log.length > 0 && (
            <button type="button" onClick={() => void observerActions.clearLog()} className="stencil text-[8px] tracking-[0.18em] text-muted-foreground hover:text-foreground">CLEAR</button>
          )}
        </div>
        {s.log.length === 0 ? (
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
            {s.wallets.length === 0
              ? "Nothing is watched yet. Add a wallet: its first reading is the baseline, and every later reading is compared with the one before it."
              : "No change between readings so far. Observations appear here when a later reading differs from the one before it."}
          </p>
        ) : (
          <ol className="mt-2 space-y-2">
            {s.log.map((o) => (
              <li key={o.id} className="border border-border p-2">
                <p className="flex items-center gap-1.5">
                  <StatusDot status={TONE[o.severity]} size={6} />
                  <span className={cn("stencil text-[8px] tracking-[0.2em]", o.severity === "critical" ? "text-no-go" : o.severity === "warn" ? "text-hold" : "text-muted-foreground")}>
                    {o.severity.toUpperCase()}
                  </span>
                  <span className="mono-font text-[9px] text-muted-foreground">{utc(o.at)}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-foreground">{o.headline}</p>
                <p className="text-[10px] leading-snug text-muted-foreground">{o.detail}</p>
                <p className="mono-font selectable mt-0.5 break-all text-[9px] text-muted-foreground">
                  {o.evidence.field}: {o.evidence.from} → {o.evidence.to} · {o.evidence.subject}
                </p>
                <Button size="sm" variant="outline" className="mt-1.5" onClick={() => onAsk(observationPrompt(o))}>ASK THE AGENT</Button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
