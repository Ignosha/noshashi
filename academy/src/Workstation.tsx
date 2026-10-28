import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { screenName, type Lab, type LabStep } from "@/lib/learn/labs";
import { labStatus, stepKey, type LabProgress } from "@/lib/learn/labProgress";
import { objectivesFor, recordEvent, resetLab, results, sanitizeLog, type ObjectiveLog } from "@/lib/academy/workstation";
import { FROM_ACADEMY, isWorkstationEvent, type OpenScreen } from "@/lib/training/protocol";
import { Bench, Checkpoint, Values } from "./Labs";
import { useLocal } from "./useLocal";
import { useOnline } from "./useOnline";

/**
 * The lab workstation — NOSHASHI itself, inside the Academy.
 *
 * Like a Packet Tracer activity: the real tool on the left (NOSHASHI's
 * training copy, built from NOSHASHI's own source by
 * academy/vite.workstation.config.mts), the instructions on the right, and
 * CHECK RESULTS to see which objectives are met. Every screen opens; paid
 * screens read only the labs' own addresses (src/lib/training/guard.ts).
 * Nothing needs NOSHASHI installed.
 */

const FRAME_SRC = `${import.meta.env.BASE_URL}workstation/index.html`;

export function WorkstationLab({
  lab,
  progress,
  onDone,
  onBack,
}: {
  lab: Lab;
  progress: LabProgress;
  onDone: (key: string) => void;
  onBack: () => void;
}) {
  const [at, setAt] = useState(() => Math.min(labStatus(lab, progress).next, lab.steps.length - 1));
  const step = lab.steps[at];
  const key = stepKey(lab.id, step.id);
  const [stored, store] = useLocal<unknown>("academy.workstation", null);
  const log = sanitizeLog(stored);
  const logRef = useRef<ObjectiveLog>(log);
  logRef.current = log;
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const online = useOnline();
  const score = useMemo(() => results(lab, log, progress), [lab, log, progress]);

  const open = useCallback((target: LabStep) => {
    const message: OpenScreen = {
      source: FROM_ACADEMY,
      type: "open",
      scene: target.scene,
      ...(target.subject ? { value: target.subject, as: target.subjectLabel, view: target.view } : {}),
    };
    frame.current?.contentWindow?.postMessage(message, window.location.origin);
    setBlocked(null);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin) return;
      const data = event.data;
      if (!isWorkstationEvent(data)) return;
      if (data.type === "ready") setReady(true);
      else if (data.type === "blocked") setBlocked(data.value);
      else {
        if (data.type === "scene") setScreen(data.scene);
        const next = recordEvent(logRef.current, lab, data.type === "scene" ? { type: "scene", scene: data.scene } : { type: "read", values: data.values }, Date.now());
        if (next !== logRef.current) store(next);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [lab, store]);

  // The workstation opens on the step's screen the first time it is ready.
  const opened = useRef(false);
  useEffect(() => {
    if (ready && !opened.current) {
      opened.current = true;
      open(step);
    }
  }, [ready, open, step]);

  const met = log[key] ?? {};
  const objectives = objectivesFor(step);
  const isMet = (id: string) => (id === "answer" ? !!progress.done[key] : !!met[id as "open" | "read"]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ws-title" className="safe-area fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 px-4 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.14em] text-faint">LAB WORKSTATION · NOSHASHI TRAINING COPY</p>
          <h2 id="ws-title" className="truncate text-[14px] font-semibold">
            {lab.title}
          </h2>
        </div>
        <div className="flex items-center gap-2" aria-live="polite">
          <span className="font-mono text-[11px] text-muted-foreground">COMPLETION</span>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-border/60" aria-hidden>
            <span className="block h-full bg-brand" style={{ width: `${score.percent}%` }} />
          </span>
          <span className="font-mono text-[12px] text-foreground">{score.percent}%</span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" aria-expanded={panelOpen} aria-controls="ws-instructions" onClick={() => setPanelOpen(!panelOpen)}>
            {panelOpen ? "HIDE INSTRUCTIONS" : "SHOW INSTRUCTIONS"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowResults(true)}>
            CHECK RESULTS
          </Button>
          <Button size="sm" onClick={onBack}>
            EXIT LAB
          </Button>
        </div>
      </header>

      {!online && (
        <p role="status" className="border-b border-hold/40 bg-hold/10 px-4 py-1.5 text-[12px]">
          You are offline. The workstation's screens open, but cannot read the ledger until you reconnect. Each step shows its recorded reading instead.
        </p>
      )}

      {/* On a phone the instructions come first and the page scrolls; side by side from md up. */}
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto md:grid md:overflow-hidden", panelOpen ? "md:grid-cols-[minmax(0,1fr)_380px]" : "md:grid-cols-1")}>
        <section aria-label="NOSHASHI workstation" className="relative order-2 flex min-h-[75vh] shrink-0 flex-col md:order-none md:min-h-0 md:shrink">
          <iframe
            ref={frame}
            src={FRAME_SRC}
            title="NOSHASHI lab workstation: the real NOSHASHI console, training copy"
            className="h-full min-h-[70vh] w-full flex-1 border-0 bg-background md:min-h-0"
          />
          {!ready && (
            <p className="pointer-events-none absolute inset-x-0 top-6 text-center font-mono text-[11px] tracking-[0.12em] text-faint">
              STARTING THE WORKSTATION…
            </p>
          )}
        </section>

        {panelOpen && (
          <aside id="ws-instructions" aria-label="Instructions" className="order-1 flex shrink-0 flex-col gap-3 border-border/60 px-4 py-3 md:order-none md:min-h-0 md:shrink md:overflow-y-auto md:border-l">
            <nav aria-label="Steps" className="flex flex-wrap gap-1.5">
              {lab.steps.map((s, i) => {
                const done = !!progress.done[stepKey(lab.id, s.id)];
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-current={i === at ? "step" : undefined}
                    onClick={() => setAt(i)}
                    className={cn(
                      "min-w-9 rounded-[3px] border px-2 py-1 font-mono text-[11px]",
                      i === at ? "border-brand/60 bg-brand/10 text-brand" : "border-border/70 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {done ? "✓ " : ""}
                    {i + 1}
                  </button>
                );
              })}
            </nav>

            <p className="font-mono text-[10.5px] tracking-[0.1em] text-faint">
              STEP {at + 1} OF {lab.steps.length}
            </p>
            <h3 className="text-[14px] font-semibold">{step.task}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => open(step)} disabled={!ready}>
                OPEN {screenName(step.scene)} ON THE WORKSTATION
              </Button>
              {screen && <span className="font-mono text-[10.5px] text-faint">SHOWING: {screenName(screen as LabStep["scene"])}</span>}
            </div>
            {step.subject && <p className="text-[11.5px] text-muted-foreground">The button opens the screen with the value below already filled in.</p>}
            <Values step={step} />

            <section aria-labelledby="ws-objectives">
              <h4 id="ws-objectives" className="font-mono text-[10.5px] tracking-[0.12em] text-faint">
                OBJECTIVES
              </h4>
              <ul className="mt-1 flex flex-col gap-1" aria-live="polite">
                {objectives.map((o) => {
                  const done = isMet(o.id);
                  return (
                    <li key={o.id} className="flex items-start gap-2 text-[12.5px]">
                      <span aria-hidden className={cn("w-4 font-mono", done ? "text-go" : "text-faint")}>
                        {done ? "✓" : "○"}
                      </span>
                      <span className={done ? "text-foreground" : "text-muted-foreground"}>
                        {o.label}
                        <span className="sr-only">{done ? ": done" : ": not done yet"}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {blocked && (
              <p role="alert" className="rounded-[4px] border border-hold/50 bg-hold/10 px-3 py-2 text-[12px]">
                The workstation did not read <code className="break-all font-mono">{blocked}</code>. Paid screens here read only the labs' own addresses and what
                they link to. Press OPEN above to load the lab's value.
              </p>
            )}

            <details className="rounded-[4px] border border-border/70 px-3 py-2 text-[12.5px]">
              <summary className="cursor-pointer text-muted-foreground">Hint: what to look for</summary>
              <p className="mt-1.5 text-foreground">{step.lookFor}</p>
            </details>

            {!online && <Bench lab={lab} step={step} />}

            <Checkpoint key={key} step={step} seed={key} done={!!progress.done[key]} onRight={() => onDone(key)} />

            <div className="flex gap-2 pb-2">
              <Button variant="outline" disabled={at === 0} onClick={() => setAt(at - 1)}>
                ← PREVIOUS
              </Button>
              {at < lab.steps.length - 1 ? (
                <Button onClick={() => setAt(at + 1)}>NEXT STEP →</Button>
              ) : (
                <Button onClick={() => setShowResults(true)}>CHECK RESULTS</Button>
              )}
            </div>
          </aside>
        )}
      </div>

      {showResults && (
        <ResultsSheet
          lab={lab}
          score={score}
          onClose={() => setShowResults(false)}
          onReset={() => store(resetLab(logRef.current, lab))}
          onFinish={onBack}
        />
      )}
    </div>
  );
}

function ResultsSheet({
  lab,
  score,
  onClose,
  onReset,
  onFinish,
}: {
  lab: Lab;
  score: ReturnType<typeof results>;
  onClose: () => void;
  onReset: () => void;
  onFinish: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  const complete = score.met === score.total;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="ws-results" className="w-full max-w-[640px] rounded-[6px] border border-border bg-card p-5">
        <h3 id="ws-results" className="text-[15px] font-semibold">
          Results: {lab.title}
        </h3>
        <p className="mt-1 text-[13px]" aria-live="polite">
          {score.met} of {score.total} objectives met · <strong>{score.percent}%</strong>
          {complete ? " · Lab complete." : ""}
        </p>
        <table className="mt-3 w-full border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-border/70 font-mono text-[10.5px] tracking-[0.1em] text-faint">
              <th scope="col" className="py-1.5 pr-2 font-normal">STEP</th>
              <th scope="col" className="py-1.5 pr-2 font-normal">OBJECTIVE</th>
              <th scope="col" className="py-1.5 font-normal">RESULT</th>
            </tr>
          </thead>
          <tbody>
            {score.items.map((item) => (
              <tr key={`${item.step.id}:${item.objective.id}`} className="border-b border-border/40">
                <td className="py-1.5 pr-2 font-mono text-faint">{item.index + 1}</td>
                <td className="py-1.5 pr-2">{item.objective.label}</td>
                <td className={cn("py-1.5 font-mono text-[11px]", item.met ? "text-go" : "text-muted-foreground")}>{item.met ? "✓ MET" : "NOT YET"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          Opening a screen and reading a value count when the workstation does them on the live ledger. Answers count when they are right, and they also
          count towards your certificate.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button ref={close} onClick={onClose}>
            BACK TO THE LAB
          </Button>
          <Button variant="outline" onClick={onReset}>
            RESET THIS LAB'S OBJECTIVES
          </Button>
          {complete && (
            <Button variant="outline" onClick={onFinish}>
              FINISH LAB
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
