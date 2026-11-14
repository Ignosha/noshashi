import { useEffect, useMemo, useRef, useState } from "react";
import { canSpeak, speak, stopSpeaking } from "@/lib/academy/speech";
import { Button } from "@/components/ui/button";
import { useLocal } from "./useLocal";
import { parseProgress, EMPTY_PROGRESS } from "@/lib/academy/academy";
import {
  CONCEPTS,
  CONTENT_VERSION,
  EMPTY_RETENTION,
  RECALL_BANK,
  TOPICS,
  buildPractice,
  dueConcepts,
  introduce,
  lessonTitle,
  parseRetention,
  practiceScore,
  recordRecall,
  scheduleMiss,
  reviewQuestions,
  seedRetention,
  type RecallQuestion,
  type Topic,
} from "@/lib/academy/retention";

export function useRetention() {
  const [stored, save] = useLocal<unknown>(
    "academy.retention.v1",
    EMPTY_RETENTION,
  );
  const p = useMemo(() => parseRetention(stored), [stored]);
  return [p, save] as const;
}
export function useIntroduceLesson(id: string) {
  const [p, save] = useRetention();
  useEffect(() => {
    const concept = CONCEPTS.find((c) => c.lesson === id);
    if (concept && !p.concepts[concept.id])
      save(introduce(p, concept.id, Date.now()));
  }, [id, p, save]);
}
export function RetentionSeed() {
  const [p, save] = useRetention();
  const [old] = useLocal("academy.progress", EMPTY_PROGRESS);
  useEffect(() => {
    const next = seedRetention(
      p,
      parseProgress(JSON.stringify(old)),
      Date.now(),
    );
    if (next !== p) save(next);
  }, [p, old, save]);
  return null;
}
export function EvidenceTable({ rows }: { rows: string[][] }) {
  return (
    <div
      className="learning-table"
      role="region"
      aria-label="Question evidence"
      tabIndex={0}
    >
      <table>
        <caption>SIMULATED TRAINING EVIDENCE</caption>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a}>
              <th scope="row">{a}</th>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function RecallCard({
  q,
  picked,
  onPick,
  checked,
  onCheck,
}: {
  q: RecallQuestion;
  picked: number | undefined;
  onPick: (i: number) => void;
  checked: boolean;
  onCheck?: () => void;
}) {
  const heading = useRef<HTMLLegendElement>(null);
  useEffect(() => {
    heading.current?.focus();
    return () => stopSpeaking();
  }, [q.id]);
  return (
    <div className="learning-question" data-question-id={q.id}>
      {canSpeak() && (
        <button
          type="button"
          className="learning-back"
          onClick={() =>
            speak(q.question + ". " + q.options.join(". "), 1, () => {})
          }
        >
          READ QUESTION ALOUD
        </button>
      )}
      {q.evidence && <EvidenceTable rows={q.evidence} />}
      <fieldset>
        <legend ref={heading} tabIndex={-1}>
          {q.question}
        </legend>
        {q.options.map((option, i) => (
          <label key={option}>
            <input
              type="radio"
              name={"recall-" + q.id}
              checked={picked === i}
              disabled={checked}
              onChange={() => onPick(i)}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
      {onCheck && !checked && (
        <Button disabled={picked === undefined} onClick={onCheck}>
          CHECK ANSWER
        </Button>
      )}
      {checked && (
        <div className="learning-feedback" role="status">
          <strong>
            {picked === q.answer
              ? "Supported by the evidence."
              : "Not yet. Here is what to inspect."}
          </strong>
          <p>{q.why}</p>
          {picked !== undefined && picked !== q.answer && (
            <p>
              <strong>Why that choice fails: </strong>
              {q.wrongWhy[picked]}
            </p>
          )}
          <p>
            <strong>Supported answer: </strong>
            {q.options[q.answer]}
          </p>
        </div>
      )}
    </div>
  );
}

type ReviewRun = {
  v: 1;
  ids: string[];
  at: number;
  answers: Record<string, { picked: number; checked: boolean }>;
};
function parseReview(x: unknown): ReviewRun | null {
  const r = x as ReviewRun;
  if (
    !r ||
    r.v !== 1 ||
    !Array.isArray(r.ids) ||
    r.ids.length > 5 ||
    !r.ids.every((id) => RECALL_BANK.some((q) => q.id === id)) ||
    !Number.isInteger(r.at) ||
    r.at < 0 ||
    r.at > r.ids.length ||
    !r.answers ||
    typeof r.answers !== "object"
  )
    return null;
  return r;
}
export function SpacedReview() {
  const [retention, save] = useRetention();
  const [stored, setStored] = useLocal<unknown>(
    "academy.review-session.v1",
    null,
  );
  const resume = parseReview(stored);
  const [run, setRunState] = useState<ReviewRun>(() =>
    resume && resume.at < resume.ids.length
      ? resume
      : {
          v: 1,
          ids: reviewQuestions(retention, Date.now()).map((q) => q.id),
          at: 0,
          answers: {},
        },
  );
  const setRun = (next: ReviewRun) => {
    setRunState(next);
    setStored(next);
  };
  const q = RECALL_BANK.find((q) => q.id === run.ids[run.at]);
  const answer = q ? run.answers[q.id] : undefined;
  const needs = CONCEPTS.filter(
    (c) => retention.concepts[c.id]?.lastCorrect === false,
  );
  const later = Object.values(retention.concepts).reduce(
    (a, c) => ({
      attempts: a.attempts + c.laterAttempts,
      correct: a.correct + c.laterCorrect,
    }),
    { attempts: 0, correct: 0 },
  );
  return (
    <section className="learning-session">
      <p className="academy-eyebrow">REVIEW DUE / ABOUT 3 MINUTES</p>
      <h2>Bring one idea back.</h2>
      <p>
        Up to five questions. No countdown or streak to protect. Pause whenever
        you need; this session stays on this device.
      </p>
      {q ? (
        <>
          <p className="learning-step">
            QUESTION {run.at + 1} OF {run.ids.length} · {TOPICS[q.topic]}
          </p>
          <RecallCard
            q={q}
            picked={answer?.picked}
            checked={answer?.checked === true}
            onPick={(picked) =>
              setRun({
                ...run,
                answers: { ...run.answers, [q.id]: { picked, checked: false } },
              })
            }
            onCheck={() => {
              if (answer?.picked === undefined || answer.checked) return;
              save(recordRecall(retention, q, answer.picked, Date.now()));
              setRun({
                ...run,
                answers: {
                  ...run.answers,
                  [q.id]: { ...answer, checked: true },
                },
              });
            }}
          />
          {answer?.checked && (
            <>
              <p className="learning-note">
                {answer.picked === q.answer
                  ? "Next review follows the 1, 3, 7, 21-day schedule."
                  : "This concept returns tomorrow. Missing a question is useful information, not a penalty."}
              </p>
              <Button onClick={() => setRun({ ...run, at: run.at + 1 })}>
                {run.at + 1 === run.ids.length
                  ? "FINISH REVIEW"
                  : "NEXT QUESTION"}
              </Button>
            </>
          )}
        </>
      ) : (
        <>
          <h3>
            {run.ids.length
              ? "Review complete. You can stop here."
              : "Nothing due right now."}
          </h3>
          <p>
            Review dates are reminders, not deadlines. Introduced concepts
            return after 1, 3, 7 and 21 days; a missed concept returns sooner.
          </p>
          {dueConcepts(retention, Date.now()).length > 0 && (
            <Button
              onClick={() =>
                setRun({
                  v: 1,
                  ids: reviewQuestions(retention, Date.now()).map((q) => q.id),
                  at: 0,
                  answers: {},
                })
              }
            >
              START ANOTHER SHORT REVIEW
            </Button>
          )}
        </>
      )}
      <details className="learning-details">
        <summary>Needs review · {needs.length} concepts</summary>
        <ul>
          {needs.map((c) => (
            <li key={c.id}>
              <a href={"?lesson=" + c.lesson}>{c.title}</a> ·{" "}
              {c.lab && <a href={"?case=" + c.lab}>related case</a>}
            </li>
          ))}
        </ul>
        <p>
          First-attempt performance on reviews at least seven days after
          introduction: {later.correct}/{later.attempts}.{" "}
          {later.attempts
            ? "Different variants test application, not option position."
            : "No week-later observations yet."}
        </p>
        <p>Results stay on this device.</p>
        <h3>Recent first-attempt reviews</h3>
        <ul>
          {retention.history
            .slice(-5)
            .reverse()
            .map((event, i) => (
              <li key={event.at + "-" + i}>
                {new Date(event.at).toISOString().slice(0, 10)} ·{" "}
                {CONCEPTS.find((c) => c.id === event.concept)?.title ??
                  event.concept}{" "}
                · {event.correct ? "Supported" : "Needs review"}
                {event.later ? " · week-later review" : ""}
              </li>
            ))}
        </ul>
      </details>
    </section>
  );
}

type PracticeRun = {
  v: 1;
  version: string;
  seed: number;
  mode: "practice" | "exam";
  at: number;
  picked: Record<string, number>;
  checked: string[];
  flags: string[];
  topics?: Topic[];
  submitted: boolean;
  deadline: number | null;
};
function parseRun(raw: unknown): PracticeRun | null {
  const r = raw as PracticeRun;
  if (
    !r ||
    r.v !== 1 ||
    r.version !== CONTENT_VERSION ||
    !Number.isSafeInteger(r.seed) ||
    !["practice", "exam"].includes(r.mode) ||
    !Number.isInteger(r.at) ||
    r.at < 0 ||
    r.at > 24 ||
    !r.picked ||
    typeof r.picked !== "object" ||
    !Array.isArray(r.checked) ||
    !Array.isArray(r.flags) ||
    r.checked.length > 25 ||
    r.flags.length > 25 ||
    typeof r.submitted !== "boolean" ||
    (r.topics &&
      (!Array.isArray(r.topics) || !r.topics.every((t) => t in TOPICS))) ||
    !(r.deadline === null || Number.isFinite(r.deadline))
  )
    return null;
  return r;
}
export function PracticeTest() {
  const [retention, saveRetention] = useRetention();
  const [stored, save] = useLocal<unknown>("academy.practice.v1", null);
  const [run, setRunState] = useState<PracticeRun | null>(() =>
    parseRun(stored),
  );
  const [mode, setMode] = useState<"practice" | "exam">("practice");
  const [timed, setTimed] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const questions = useMemo(
    () => (run ? buildPractice(run.seed, run.topics) : []),
    [run?.seed, run?.topics],
  );
  const setRun = (next: PracticeRun) => {
    setRunState(next);
    save(next);
  };
  useEffect(() => {
    if (!run?.deadline || run.submitted) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run?.deadline, run?.submitted]);
  const start = (topics?: Topic[]) => {
    setClock(Date.now());
    const seed = typeof globalThis.crypto?.getRandomValues === "function"
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Date.now() >>> 0;
    setRun({
      v: 1,
      version: CONTENT_VERSION,
      seed,
      mode: run?.mode ?? mode,
      at: 0,
      picked: {},
      checked: [],
      flags: [],
      topics,
      submitted: false,
      deadline: timed ? Date.now() + 30 * 60 * 1000 : null,
    });
  };
  if (!run)
    return (
      <section className="learning-session">
        <p className="academy-eyebrow">PRACTICE TEST / PREPARATION ONLY</p>
        <h2>Apply what you remember.</h2>
        <p>
          25 questions across six topics. Target: 80%. Unlimited retakes. This
          preparation test does not replace the existing final check or award a
          certificate.
        </p>
        <fieldset>
          <legend>Feedback mode</legend>
          {(["practice", "exam"] as const).map((m) => (
            <label key={m}>
              <input
                type="radio"
                name="test-mode"
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              {m === "practice"
                ? "Practice — feedback after Check answer"
                : "Exam — answers hidden until final submission"}
            </label>
          ))}
        </fieldset>
        <label>
          <input
            type="checkbox"
            checked={timed}
            onChange={(e) => setTimed(e.target.checked)}
          />
          Optional 30-minute guide timer — can be turned off; no automatic
          submission
        </label>
        <p className="learning-note">
          Your answers, flags and place save on this device. An active guide
          timer keeps elapsed time across refresh. No account required.
        </p>
        <Button onClick={() => start()}>START 25-QUESTION TEST</Button>
      </section>
    );
  const score = practiceScore(questions, run.picked);
  const q = questions[run.at];
  if (run.submitted)
    return (
      <section className="learning-session">
        <p className="academy-eyebrow">
          PREPARATION RESULT / NOT CERTIFICATION
        </p>
        <h2>
          {score.percent}% · {score.correct}/{score.total}
        </h2>
        <p>
          {score.passed
            ? "Practice target reached."
            : "Below the 80% practice target. Pick one weak topic next."}{" "}
          Existing course progress and earned certificates have not changed.
        </p>
        <table className="learning-score">
          <thead>
            <tr>
              <th>Topic</th>
              <th>Correct</th>
            </tr>
          </thead>
          <tbody>
            {score.topics.map((t) => (
              <tr key={t.id}>
                <td>{t.label}</td>
                <td>
                  {t.correct}/{t.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="learning-actions">
          <Button onClick={() => start()}>RETAKE FULL TEST</Button>
          <Button
            variant="outline"
            disabled={!score.missed.length}
            onClick={() =>
              start([...new Set(score.missed.map((q) => q.topic))])
            }
          >
            RETRY WEAK TOPICS
          </Button>
        </div>
        <p>
          Weak-topic drills can contain fewer than 25 questions. Full retakes
          always contain 25.
        </p>
        <h3>Review answers &amp; missed concepts</h3>
        {questions.map((item) => (
          <details className="learning-details" key={item.id}>
            <summary>
              {run.picked[item.id] === item.answer ? "Correct" : "Needs review"}{" "}
              · {lessonTitle(item.lesson)}
            </summary>
            <RecallCard
              q={item}
              picked={run.picked[item.id]}
              checked
              onPick={() => {}}
            />
            <a href={"?lesson=" + item.lesson}>Review the lesson</a>
            {CONCEPTS.find((c) => c.id === item.concept)?.lab && (
              <>
                {" "}
                ·{" "}
                <a
                  href={
                    "?case=" + CONCEPTS.find((c) => c.id === item.concept)!.lab
                  }
                >
                  Try its analyst case
                </a>
              </>
            )}
          </details>
        ))}
      </section>
    );
  if (!q)
    return (
      <p>
        Saved test is unavailable.{" "}
        <Button onClick={() => start()}>START A NEW TEST</Button>
      </p>
    );
  const checked = run.mode === "practice" && run.checked.includes(q.id);
  const unanswered = questions.filter(
    (q) => run.picked[q.id] === undefined,
  ).length;
  const seconds = run.deadline
    ? Math.max(0, Math.ceil((run.deadline - clock) / 1000))
    : null;
  return (
    <section className="learning-session">
      <p className="academy-eyebrow">
        {run.topics ? "WEAK-TOPIC DRILL" : "25-QUESTION PREPARATION"} /{" "}
        {run.mode.toUpperCase()} MODE
      </p>
      <h2>One question at a time.</h2>
      <p className="learning-step">
        QUESTION {run.at + 1} OF {questions.length} · {TOPICS[q.topic]}
      </p>
      {seconds !== null && (
        <p>
          Guide timer: {Math.floor(seconds / 60)}:
          {String(seconds % 60).padStart(2, "0")}.{" "}
          {seconds === 0 ? "Time guide reached; you may continue." : ""}{" "}
          <button onClick={() => setRun({ ...run, deadline: null })}>
            Turn timer off
          </button>
        </p>
      )}
      <RecallCard
        q={q}
        picked={run.picked[q.id]}
        checked={checked}
        onPick={(i) => setRun({ ...run, picked: { ...run.picked, [q.id]: i } })}
        onCheck={
          run.mode === "practice"
            ? () => {
                if (run.picked[q.id] !== q.answer)
                  saveRetention(scheduleMiss(retention, q.concept, Date.now()));
                setRun({ ...run, checked: [...run.checked, q.id] });
              }
            : undefined
        }
      />
      <div className="learning-actions">
        <Button
          variant="outline"
          disabled={!run.at}
          onClick={() => setRun({ ...run, at: run.at - 1 })}
        >
          PREVIOUS
        </Button>
        <Button
          variant="outline"
          aria-pressed={run.flags.includes(q.id)}
          onClick={() =>
            setRun({
              ...run,
              flags: run.flags.includes(q.id)
                ? run.flags.filter((id) => id !== q.id)
                : [...run.flags, q.id],
            })
          }
        >
          {run.flags.includes(q.id) ? "UNFLAG" : "FLAG FOR REVIEW"}
        </Button>
        {run.at < questions.length - 1 && (
          <Button
            disabled={run.mode === "practice" && !checked}
            onClick={() => setRun({ ...run, at: run.at + 1 })}
          >
            NEXT QUESTION
          </Button>
        )}
      </div>
      <details className="learning-details">
        <summary>
          Review navigation · {unanswered} unanswered · {run.flags.length}{" "}
          flagged
        </summary>
        <div className="learning-grid-nav">
          {questions.map((item, i) => (
            <button
              key={item.id}
              aria-current={i === run.at ? "step" : undefined}
              onClick={() => setRun({ ...run, at: i })}
            >
              {i + 1}
              {run.flags.includes(item.id) ? " ⚑" : ""} ·{" "}
              {run.picked[item.id] === undefined ? "Unanswered" : "Answered"}
            </button>
          ))}
        </div>
      </details>
      <button type="button" onClick={() => setRunState(null)}>
        New test settings (current attempt resumes on refresh until replaced)
      </button>
      <p>
        Pause any time. Returning to Practice test restores this attempt.
        Feedback stays hidden in exam mode until submission.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          saveRetention(
            score.missed.reduce(
              (next, q) => scheduleMiss(next, q.concept, Date.now()),
              retention,
            ),
          );
          setRun({ ...run, submitted: true });
        }}
      >
        SUBMIT TEST ({unanswered} UNANSWERED)
      </Button>
    </section>
  );
}
