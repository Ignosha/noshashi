import { useMemo, useState } from "react";
import type { SceneId } from "@/App";
import { Panel } from "@/components/nova/Panel";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/lib/billing/useEntitlements";
import { useHandoff } from "@/lib/nav/handoff";
import { useSetting } from "@/lib/store";
import { LABS, allSteps, labById, type Lab, type LabStep } from "@/lib/learn/labs";
import {
  EMPTY_PROGRESS,
  completeStep,
  dueKeys,
  dueLabel,
  labStatus,
  nextDue,
  recordReview,
  retention,
  sanitizeProgress,
  shuffled,
  stepKey,
  type LabProgress,
} from "@/lib/learn/labProgress";
import { cn } from "@/lib/utils";

/**
 * LabsPanel — hands-on labs and the review deck.
 *
 * "Take me there" leaves this screen, so where the learner was has to
 * survive the trip: the open lab and step live at module level, which lasts
 * for the session (coming back from Check an Address lands on the same
 * step) without persisting a half-finished screen across launches. Progress
 * itself is a setting, because that is what the review deck is built on.
 */

/*
 * The step is always explicit. Deriving it from progress ("the first
 * unfinished step") would jump to the next step the moment an answer is
 * marked right, before the learner has read why it was right.
 */
type View = { kind: "list" } | { kind: "lab"; id: string; step: number } | { kind: "review" };

let remembered: View = { kind: "list" };

const SCREEN: Partial<Record<SceneId, string>> = {
  safeshop: "CHECK AN ADDRESS",
  nft: "TOKEN RIGHTS",
  claims: "INBOX",
  verify: "VERIFICATION",
  network: "LEDGER SYNC",
  agent: "NOSHX",
  treasury: "CONTROL SURFACE",
};

const screenName = (scene: SceneId) => SCREEN[scene] ?? scene.toUpperCase();
const KNOWN = new Set(allSteps().map((s) => s.key));

export function useLabProgress() {
  const [stored, store] = useSetting<unknown>("learn.labs", EMPTY_PROGRESS);
  const progress = useMemo(() => sanitizeProgress(stored), [stored]);
  return [progress, store as (next: LabProgress) => void] as const;
}

/** Cards due now, for the badge on the Learn chooser. */
export const dueCount = (progress: LabProgress) => dueKeys(progress, Date.now(), KNOWN).length;

export function LabsPanel({
  progress,
  setProgress,
  onNavigate,
}: {
  progress: LabProgress;
  setProgress: (next: LabProgress) => void;
  onNavigate?: (scene: SceneId) => void;
}) {
  const [view, setViewState] = useState<View>(remembered);
  const setView = (next: View) => {
    remembered = next;
    setViewState(next);
  };

  const lab = view.kind === "lab" ? labById(view.id) : undefined;
  const open = (id: string) => {
    const target = labById(id);
    if (target) setView({ kind: "lab", id, step: labStatus(target, progress).next });
  };

  return (
    <Panel label={view.kind === "review" ? "REVIEW" : lab ? `LAB · ${lab.title.toUpperCase()}` : "LABS"} className="lg:col-span-3 lg:min-h-0" bodyClassName="lg:min-h-0 lg:overflow-y-auto">
      {view.kind === "review" ? (
        <Review progress={progress} setProgress={setProgress} onDone={() => setView({ kind: "list" })} onNavigate={onNavigate} />
      ) : lab && view.kind === "lab" ? (
        <LabRun
          lab={lab}
          step={view.step}
          progress={progress}
          setProgress={setProgress}
          onStep={(step) => setView({ kind: "lab", id: lab.id, step })}
          onBack={() => setView({ kind: "list" })}
          onNext={open}
          onNavigate={onNavigate}
        />
      ) : (
        <LabList progress={progress} onOpen={open} onReview={() => setView({ kind: "review" })} />
      )}
    </Panel>
  );
}

/* ── The list ─────────────────────────────────────────────────────── */

function LabList({ progress, onOpen, onReview }: { progress: LabProgress; onOpen: (id: string) => void; onReview: () => void }) {
  const { has } = useBilling();
  const now = Date.now();
  const due = dueKeys(progress, now, KNOWN).length;
  const kept = retention(progress, KNOWN);
  const complete = LABS.filter((l) => labStatus(l, progress).complete).length;
  const upcoming = nextDue(progress, KNOWN);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Each lab sends you to the real screen with a real mainnet address or token filled in, tells you what to look for,
        and asks one question about what you saw. Every question you get right comes back for review a day later, then
        after 3, 7, 16 and 35 days, so what you learn stays learned.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "LABS DONE", value: `${complete}/${LABS.length}` },
          { label: "IN YOUR DECK", value: String(kept.cards) },
          { label: "RETAINED", value: String(kept.retained), hint: "Answered right at 3 and 7 days" },
          { label: "DUE NOW", value: String(due) },
        ].map((s) => (
          <div key={s.label} className="inset-row px-3 py-2" title={s.hint}>
            <p className="font-mono text-[10.5px] tracking-[0.1em] text-faint">{s.label}</p>
            <p className="mt-0.5 font-mono text-[15px] tabular-nums text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onReview} disabled={due === 0}>
          {due > 0 ? `REVIEW ${due} QUESTION${due === 1 ? "" : "S"}` : "NOTHING TO REVIEW"}
        </Button>
        {due === 0 && upcoming !== null && (
          <span className="font-mono text-[10.5px] tracking-[0.1em] text-faint">NEXT REVIEW {dueLabel(upcoming, now).toUpperCase()}</span>
        )}
        {kept.cards === 0 && (
          <span className="text-[11px] text-muted-foreground">Finish a step and its question joins your deck.</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {LABS.map((l) => {
          const st = labStatus(l, progress);
          const locked = l.requires ? !has(l.requires) : false;
          return (
            <button key={l.id} onClick={() => onOpen(l.id)} className="inset-row w-full px-3.5 py-3 text-left transition-colors hover:border-brand/50">
              <div className="flex items-baseline gap-2">
                <span className={cn("text-[12.5px] font-medium", st.complete ? "text-go" : "text-foreground")}>{l.title}</span>
                {locked && <span className="rounded-[3px] border border-hold/50 px-1.5 font-mono text-[10px] tracking-[0.1em] text-hold">NEEDS PRO</span>}
                <span className="ml-auto shrink-0 font-mono text-[10.5px] text-faint">
                  {st.complete ? "DONE" : st.done > 0 ? `${st.done}/${st.total} STEPS` : `${l.minutes} MIN`}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{l.outcome}</p>
              <div className="mt-2 flex gap-1" aria-hidden>
                {l.steps.map((s) => (
                  <span key={s.id} className={cn("h-1 flex-1 rounded-full", progress.done[stepKey(l.id, s.id)] !== undefined ? "bg-brand" : "bg-border")} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── One lab ──────────────────────────────────────────────────────── */

function LabRun({
  lab,
  step: requested,
  progress,
  setProgress,
  onStep,
  onBack,
  onNext,
  onNavigate,
}: {
  lab: Lab;
  step: number;
  progress: LabProgress;
  setProgress: (p: LabProgress) => void;
  onStep: (step: number) => void;
  onBack: () => void;
  onNext: (id: string) => void;
  onNavigate?: (scene: SceneId) => void;
}) {
  const { has } = useBilling();
  const status = labStatus(lab, progress);
  const index = Math.min(requested, lab.steps.length);
  const locked = lab.requires ? !has(lab.requires) : false;
  const nextLab = LABS[LABS.indexOf(lab) + 1];

  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground hover:text-brand">
          ← ALL LABS
        </button>
        <span className="ml-auto font-mono text-[10.5px] text-faint">
          {status.done}/{status.total} STEPS
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">{lab.outcome}</p>
      {(lab.note || locked) && (
        <p className="font-mono text-[10.5px] tracking-[0.1em] text-hold">
          {locked ? "CONTROL SURFACE NEEDS A PRO PLAN. YOU CAN STILL ANSWER FROM THE RECORDED FACTS BELOW." : lab.note?.toUpperCase()}
        </p>
      )}
      <div className="flex gap-1">
        {lab.steps.map((s, i) => {
          const done = progress.done[stepKey(lab.id, s.id)] !== undefined;
          const reachable = done || i <= status.next;
          return (
            <button
              key={s.id}
              disabled={!reachable}
              onClick={() => onStep(i)}
              aria-label={`Step ${i + 1}`}
              aria-current={i === index ? "step" : undefined}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors disabled:cursor-not-allowed",
                i === index ? "bg-brand" : done ? "bg-brand/50" : "bg-border"
              )}
            />
          );
        })}
      </div>
    </div>
  );

  if (index >= lab.steps.length) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="inset-row px-4 py-4">
          <p className="font-mono text-[10.5px] tracking-[0.14em] text-go">LAB COMPLETE</p>
          <p className="mt-1.5 text-[13px] font-medium text-foreground">{lab.title}</p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {lab.steps.length} question{lab.steps.length === 1 ? "" : "s"} joined your review deck. The first review comes
            round tomorrow; each right answer spaces the next one further out.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {nextLab && (
              <Button size="sm" onClick={() => onNext(nextLab.id)}>
                NEXT LAB: {nextLab.title.toUpperCase()}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onStep(0)}>
              GO THROUGH IT AGAIN
            </Button>
            <Button size="sm" variant="ghost" onClick={onBack}>
              ALL LABS
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const step = lab.steps[index];
  const key = stepKey(lab.id, step.id);
  return (
    <div className="flex flex-col gap-4">
      {header}
      <StepCard
        key={key}
        step={step}
        stepKeyValue={key}
        position={`STEP ${index + 1} OF ${lab.steps.length}`}
        done={progress.done[key] !== undefined}
        onNavigate={onNavigate}
        onCorrect={() => setProgress(completeStep(progress, key, Date.now()))}
        onContinue={() => onStep(index + 1)}
        continueLabel={index + 1 < lab.steps.length ? "NEXT STEP →" : "FINISH LAB →"}
      />
    </div>
  );
}

function GoThere({ step, onNavigate }: { step: LabStep; onNavigate?: (scene: SceneId) => void }) {
  const handOff = useHandoff();
  const [copied, setCopied] = useState(false);
  const go = () => (step.subject ? handOff({ scene: step.scene, value: step.subject, from: "learn", as: step.subjectLabel, view: step.view }) : onNavigate?.(step.scene));
  const copy = async () => {
    if (!step.subject) return;
    try {
      await navigator.clipboard.writeText(step.subject);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (permissions); the value is on screen to select by hand.
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {step.subject && (
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-[10.5px] tracking-[0.1em] text-faint">{(step.subjectLabel ?? "VALUE").toUpperCase()}</span>
          <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-telemetry" title={step.subject}>
            {step.subject}
          </code>
          <button onClick={() => void copy()} className="shrink-0 font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground hover:text-brand">
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>
      )}
      <div>
        <Button size="sm" variant="outline" onClick={go}>
          TAKE ME TO {screenName(step.scene)} →
        </Button>
      </div>
    </div>
  );
}

function StepCard({
  step,
  stepKeyValue,
  position,
  done,
  onNavigate,
  onCorrect,
  onContinue,
  continueLabel,
}: {
  step: LabStep;
  stepKeyValue: string;
  position: string;
  done: boolean;
  onNavigate?: (scene: SceneId) => void;
  onCorrect: () => void;
  onContinue: () => void;
  continueLabel: string;
}) {
  const q = useMemo(() => shuffled(step.check.options, step.check.answer, stepKeyValue), [step, stepKeyValue]);
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked !== null && picked === q.answer;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-mono text-[10.5px] tracking-[0.14em] text-telemetry">{position} · {screenName(step.scene)}</p>
        <p className="mt-1.5 text-[13.5px] font-medium text-foreground">{step.task}</p>
      </div>

      <GoThere step={step} onNavigate={onNavigate} />

      <div>
        <p className="font-mono text-[10.5px] tracking-[0.1em] text-faint">LOOK FOR</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{step.lookFor}</p>
      </div>

      <div className="border-t border-border/60 pt-3">
        <p className="font-mono text-[10.5px] tracking-[0.1em] text-faint">CHECKPOINT{done ? " · ANSWERED BEFORE" : ""}</p>
        <p className="mt-1 text-[12.5px] font-medium text-foreground">{step.check.question}</p>
        <Options options={q.options} answer={q.answer} picked={picked} onPick={(i) => {
          if (picked !== null && picked === q.answer) return;
          setPicked(i);
          if (i === q.answer) onCorrect();
        }} />
        {picked !== null && (
          <div className="mt-2.5">
            {right ? (
              <>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-go">Right. </span>
                  {step.check.why}
                </p>
                <Button size="sm" className="mt-2.5" onClick={onContinue}>
                  {continueLabel}
                </Button>
              </>
            ) : (
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-no-go">Not quite. </span>
                Go back to {screenName(step.scene)}, look again, then pick another answer.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Options({
  options,
  answer,
  picked,
  onPick,
  reveal = false,
}: {
  options: string[];
  answer: number;
  picked: number | null;
  onPick: (i: number) => void;
  /** Mark the right answer once one has been picked, even a wrong one (reviews). */
  reveal?: boolean;
}) {
  const settled = picked !== null && (picked === answer || reveal);
  return (
    <div className="mt-2 flex flex-col gap-1.5" role="radiogroup">
      {options.map((option, i) => {
        const chosen = picked === i;
        const isRight = i === answer;
        return (
          <button
            key={option}
            role="radio"
            aria-checked={chosen}
            disabled={settled}
            onClick={() => onPick(i)}
            className={cn(
              "inset-row w-full px-3 py-2 text-left text-[11.5px] leading-snug transition-colors disabled:cursor-default",
              chosen && isRight && "border-go/60 bg-go/10 text-foreground",
              chosen && !isRight && "border-no-go/60 bg-no-go/10 text-foreground",
              !chosen && settled && isRight && "border-go/40 text-foreground",
              !chosen && !settled && "hover:border-brand/50"
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/* ── Review ───────────────────────────────────────────────────────── */

function Review({
  progress,
  setProgress,
  onDone,
  onNavigate,
}: {
  progress: LabProgress;
  setProgress: (p: LabProgress) => void;
  onDone: () => void;
  onNavigate?: (scene: SceneId) => void;
}) {
  // The queue is fixed when the review starts, so answering a card (which
  // moves its due date) does not reshuffle the cards still to come.
  const [queue] = useState(() => dueKeys(progress, Date.now(), KNOWN));
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const steps = useMemo(() => new Map(allSteps().map((s) => [s.key, s])), []);

  const key = queue[at];
  const entry = key ? steps.get(key) : undefined;
  const reviews = key ? progress.cards[key]?.reviews ?? 0 : 0;
  // Seeded by the answer count at the start of this card, so the order holds while it is on screen.
  const [seedReviews, setSeedReviews] = useState(reviews);
  const q = useMemo(
    () => (entry ? shuffled(entry.step.check.options, entry.step.check.answer, `${key}#${seedReviews}`) : null),
    [entry, key, seedReviews]
  );

  if (!entry || !q) {
    const upcoming = nextDue(progress, KNOWN);
    return (
      <div className="flex flex-col gap-3">
        <p className="font-mono text-[10.5px] tracking-[0.14em] text-go">REVIEW DONE</p>
        <p className="text-[13px] font-medium text-foreground">
          {queue.length === 0 ? "Nothing is due." : `${score} of ${queue.length} right.`}
        </p>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Questions you got right are spaced further out; the ones you missed come back tomorrow.
          {upcoming !== null && ` Next review ${dueLabel(upcoming, Date.now())}.`}
        </p>
        <div>
          <Button size="sm" onClick={onDone}>
            BACK TO LABS
          </Button>
        </div>
      </div>
    );
  }

  const answered = picked !== null;
  const right = picked === q.answer;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button onClick={onDone} className="font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground hover:text-brand">
          ← ALL LABS
        </button>
        <span className="ml-auto font-mono text-[10.5px] tabular-nums text-faint">
          {at + 1}/{queue.length}
        </span>
      </div>
      <p className="font-mono text-[10.5px] tracking-[0.14em] text-telemetry">
        FROM {entry.lab.title.toUpperCase()} · {screenName(entry.step.scene)}
      </p>
      <p className="text-[13px] font-medium text-foreground">{entry.step.check.question}</p>
      <Options
        options={q.options}
        answer={q.answer}
        picked={picked}
        reveal
        onPick={(i) => {
          if (answered) return;
          setPicked(i);
          const correct = i === q.answer;
          if (correct) setScore((s) => s + 1);
          setProgress(recordReview(progress, key, correct, Date.now()));
        }}
      />
      {answered && (
        <div className="flex flex-col gap-2.5">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            <span className={cn("font-medium", right ? "text-go" : "text-no-go")}>{right ? "Right. " : "Not this time. "}</span>
            {entry.step.check.why}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                const nextKey = queue[at + 1];
                setPicked(null);
                setSeedReviews(nextKey ? progress.cards[nextKey]?.reviews ?? 0 : 0);
                setAt(at + 1);
              }}
            >
              {at + 1 < queue.length ? "NEXT QUESTION →" : "FINISH REVIEW"}
            </Button>
            {!right && <GoThere step={entry.step} onNavigate={onNavigate} />}
          </div>
        </div>
      )}
    </div>
  );
}
