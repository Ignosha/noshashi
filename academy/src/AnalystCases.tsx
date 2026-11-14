import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ANALYST_CASES,
  CASE_VERSION,
  gradeCase,
  type CaseRecord,
} from "@/lib/academy/analystCases";
import { FROM_ACADEMY, isWorkstationEvent } from "@/lib/training/protocol";
import { BENCHES, type BenchResult } from "./benches";
import { useLocal } from "./useLocal";
export function CaseList({ open }: { open: (id: string) => void }) {
  return (
    <section className="learning-cases">
      <p className="academy-eyebrow">
        FOUR GUIDED ANALYST CASES / RECORDED EXERCISES FIRST
      </p>
      <h2>Make one supported decision.</h2>
      <p>
        Short, stable training cases work without a public node. Each ends with
        evidence, a decision and a 30-second teach-back.
      </p>
      <ol>
        {ANALYST_CASES.map((c) => (
          <li key={c.id}>
            <button onClick={() => open(c.id)}>{c.title} →</button>
            <p>{c.task}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
export function AnalystCaseView({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const c = ANALYST_CASES.find((c) => c.id === id)!;
  const [all, save] = useLocal<Record<string, CaseRecord>>(
    "academy.analyst-cases.v1",
    {},
  );
  const candidate = all?.[id];
  const prior =
    candidate?.version === CASE_VERSION &&
    Array.isArray(candidate.evidence) &&
    candidate.evidence.every((key) => c.rows.some((row) => row.id === key)) &&
    Number.isInteger(candidate.decision) &&
    candidate.decision >= -1 &&
    candidate.decision < c.choices.length &&
    Number.isSafeInteger(candidate.attempts) &&
    candidate.attempts >= 0 &&
    typeof candidate.teachback === "string" &&
    typeof candidate.compared === "boolean" &&
    typeof candidate.firstCorrect === "boolean" &&
    typeof candidate.submitted === "boolean"
      ? candidate
      : null;
  const [evidence, setEvidence] = useState<string[]>(prior?.evidence ?? []);
  const [decision, setDecision] = useState<number | undefined>(
    prior && prior.decision >= 0 ? prior.decision : undefined,
  );
  const [attempts, setAttempts] = useState(prior?.attempts ?? 0);
  const [firstCorrect, setFirstCorrect] = useState(
    prior?.firstCorrect ?? false,
  );
  const [submitted, setSubmitted] = useState(prior?.submitted === true);
  const [teachback, setTeachback] = useState(prior?.teachback ?? "");
  const [compared, setCompared] = useState(prior?.compared ?? false);
  const [hint, setHint] = useState(0);
  const [live, setLive] = useState<BenchResult | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFrame, setShowFrame] = useState(false);
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!showFrame) return;
    const listener = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        !isWorkstationEvent(event.data)
      )
        return;
      if (event.data.type === "ready") {
        setReady(true);
        frame.current?.contentWindow?.postMessage(
          {
            source: FROM_ACADEMY,
            type: "open",
            scene: c.scene,
            ...(c.subject ? { value: c.subject } : {}),
          },
          location.origin,
        );
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [showFrame, c]);
  const right = decision !== undefined && gradeCase(c, evidence, decision);
  const persist = (patch: Partial<CaseRecord>) =>
    save({
      ...all,
      [id]: {
        ...all[id],
        version: CASE_VERSION,
        evidence,
        decision: decision ?? -1,
        attempts,
        firstCorrect,
        teachback,
        compared,
        submitted,
        ...patch,
      },
    });
  const readLive = async () => {
    setReading(true);
    setError(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const bench = BENCHES[c.scene];
      if (!bench) throw new Error("No single-input reader");
      const value = await Promise.race([
        bench.run(c.subject),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), 12000);
        }),
      ]);
      if (mounted.current) {
        setLive(value);
        setReadAt(new Date().toISOString());
      }
    } catch {
      if (mounted.current) {
        setLive(null);
        setError(
          "Fresh lookup unavailable or timed out. The versioned recorded exercise below is unchanged and can still be completed. Retry manually when ready.",
        );
      }
    } finally {
      clearTimeout(timer);
      if (mounted.current) setReading(false);
    }
  };
  return (
    <section className="learning-case">
      <button className="learning-back" onClick={onBack}>
        ← ALL LABS
      </button>
      <p className="academy-eyebrow">
        ANALYST CASE / {CASE_VERSION} / SIMULATED TRAINING DATA
      </p>
      <h2>{c.title}</h2>
      <p>{c.brief}</p>
      <div className="learning-case-grid">
        <aside id="case-brief" className="learning-case-brief">
          <h3>Your task</h3>
          <p>{c.task}</p>
          <h3>Sample input</h3>
          <code>{c.sample}</code>
          <h3>Definition of done</h3>
          <p>{c.done}</p>
          <p className="learning-note">
            Opening a product screen is navigation practice. It does not
            complete this case.
          </p>
          <Button
            variant="outline"
            onClick={() => setHint(Math.min(hint + 1, c.hints.length))}
            disabled={hint === c.hints.length}
          >
            HINT {Math.min(hint + 1, c.hints.length)} OF {c.hints.length}
          </Button>
          {c.hints.slice(0, hint).map((h) => (
            <p className="learning-hint" key={h}>
              {h}
            </p>
          ))}
          <a href={"?lesson=" + c.lesson}>Read the matching lesson →</a>
          <a className="learning-return" href="#case-evidence">
            Return to current task ↓
          </a>
        </aside>
        <div id="case-evidence">
          <p className="learning-note">
            STABLE RECORDED EXERCISE · SIMULATED · {CASE_VERSION}. Values below
            are not live mainnet data. Optional product/live views use different
            public examples and never change the expected answers.
          </p>
          <fieldset>
            <legend>1. Select the evidence supporting your decision</legend>
            <div className="learning-evidence">
              {c.rows.map((row) => (
                <label key={row.id}>
                  <input
                    type="checkbox"
                    checked={evidence.includes(row.id)}
                    disabled={submitted}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...evidence, row.id]
                        : evidence.filter((x) => x !== row.id);
                      setEvidence(next);
                      save({
                        ...all,
                        [id]: {
                          version: CASE_VERSION,
                          evidence: next,
                          decision: decision ?? -1,
                          attempts,
                          firstCorrect,
                          teachback,
                          compared,
                          submitted,
                        },
                      });
                    }}
                  />
                  <span>
                    <strong>{row.label}</strong>
                    <span>{row.value}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset id="case-decision">
            <legend>2. Make a supported decision</legend>
            {c.choices.map((choice, i) => (
              <label key={choice}>
                <input
                  type="radio"
                  name={"case-" + id}
                  checked={decision === i}
                  disabled={submitted}
                  onChange={() => {
                    setDecision(i);
                    persist({ decision: i });
                  }}
                />
                {choice}
              </label>
            ))}
          </fieldset>
          {!submitted && (
            <Button
              disabled={decision === undefined || !evidence.length}
              onClick={() => {
                const first = attempts ? firstCorrect : right;
                setFirstCorrect(first);
                setAttempts(attempts + 1);
                setSubmitted(true);
                persist({
                  attempts: attempts + 1,
                  firstCorrect: first,
                  submitted: true,
                });
              }}
            >
              CHECK CASE
            </Button>
          )}
          {submitted && (
            <div className="learning-feedback" role="status">
              <h3>
                {right
                  ? "Evidence and decision supported."
                  : "Not yet: review the selected evidence and decision."}
              </h3>
              <p>{c.explanation}</p>
              {!right && (
                <p>
                  Check these evidence fields:{" "}
                  {c.required
                    .filter((key) => !evidence.includes(key))
                    .map((key) => c.rows.find((row) => row.id === key)?.label)
                    .join(", ") ||
                    "All required fields selected; review your decision and remove unrelated fields."}
                </p>
              )}
              {!right && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSubmitted(false);
                    setCompared(false);
                    persist({ submitted: false, compared: false });
                  }}
                >
                  TRY THE CASE AGAIN
                </Button>
              )}
            </div>
          )}
          {submitted && (
            <section className="learning-teachback">
              <h3>3. A 30-second handoff</h3>
              <p>
                In your own words: what happened, which evidence supports it,
                what remains unknown and what should happen next? No countdown.
                A written attempt is required before the model appears.
              </p>
              <label htmlFor="teachback">
                Your explanation
                <textarea
                  id="teachback"
                  rows={4}
                  maxLength={2000}
                  value={teachback}
                  onChange={(e) => {
                    setTeachback(e.target.value);
                    persist({ teachback: e.target.value, compared: false });
                    setCompared(false);
                  }}
                />
              </label>
              <Button
                disabled={teachback.trim().split(/\s+/).length < 8}
                variant="outline"
                onClick={() => {
                  setCompared(true);
                  persist({
                    compared: true,
                    ...(right ? { completedAt: Date.now() } : {}),
                  });
                }}
              >
                COMPARE MY EXPLANATION
              </Button>
              {compared && (
                <div className="learning-feedback">
                  <strong>Model explanation</strong>
                  <p>{c.teachback}</p>
                  <p>
                    {right
                      ? "Case completed. Your evidence selection and decision were checked; the written explanation is a self-review, not automated semantic grading."
                      : "Compare this handoff, then retry the evidence and decision before completing."}
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
      <details className="learning-details">
        <summary>
          Optional: explore the NOSHASHI product screen or a fresh public
          reading
        </summary>
        <p>
          These views are separate from the simulated assessment above. No keys,
          wallets, real funds or account required. Live reads may reach public
          nodes and infrastructure logs.
        </p>
        <div className="learning-actions">
          <Button variant="outline" onClick={() => setShowFrame(!showFrame)}>
            {showFrame ? "HIDE WORKSTATION" : "OPEN PRODUCT SCREEN"}
          </Button>
          <Button
            variant="outline"
            disabled={reading}
            onClick={() => void readLive()}
          >
            {reading ? "READING PUBLIC NODE…" : "TRY FRESH MAINNET READING"}
          </Button>
        </div>
        {error && <p role="status">{error}</p>}
        {live && (
          <div className="learning-feedback">
            <strong>FRESH XRPL MAINNET READING · {live.headline}</strong>
            <p>
              Retrieved: {readAt}. Source: NOSHASHI shared public XRPL reader.
              This is not the graded case.
            </p>
            {live.rows.map(([label, value]) => (
              <p key={label}>
                {label}: {value}
              </p>
            ))}
            {live.findings.map((f) => (
              <p key={f.id}>
                {f.title}: {f.detail}
              </p>
            ))}
          </div>
        )}
        {showFrame && (
          <>
            <p role="status">
              {ready
                ? "Training workstation ready."
                : "Starting training workstation…"}
            </p>
            <div className="learning-live-grid">
              <aside>
                <h3>Current task</h3>
                <p>{c.task}</p>
                <p>{c.done}</p>
                <a href="#case-evidence">Return to the recorded assessment</a>
              </aside>
              <iframe
                ref={frame}
                title={"NOSHASHI training workstation — " + c.title}
                src={`${import.meta.env.BASE_URL}workstation/index.html`}
                className="learning-frame"
              />
            </div>
          </>
        )}
      </details>
      <nav
        className="learning-mobile-taskbar"
        aria-label="Current analyst task"
      >
        <a href="#case-brief">Task brief</a>
        <a href="#case-evidence">Evidence</a>
        <a href="#case-decision">Decision</a>
      </nav>
    </section>
  );
}
