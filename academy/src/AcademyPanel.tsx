import { useEffect, useMemo, useRef, useState } from "react";
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-700.css";
import { Panel } from "@/components/nova/Panel";
import { Button } from "@/components/ui/button";
import { useLocal } from "./useLocal";
import { openExternal } from "@/lib/external";
import { saveTextFile } from "@/lib/export";
import { cn } from "@/lib/utils";
import { ALL_LABS as LABS, labById } from "./labs";
import { labStatus, sanitizeProgress } from "@/lib/learn/labProgress";
import {
  EMPTY_PROGRESS,
  EXAM,
  GLOSSARY,
  LESSONS,
  LEVELS,
  STUDY_STYLES,
  buildExam,
  certificateCode,
  certificateHtml,
  certificateRecord,
  eligible,
  lessonById,
  lessonPassed,
  lessonsIn,
  levelSummary,
  nextLesson,
  overall,
  parseProgress,
  recordCardsSeen,
  recordExam,
  recordQuiz,
  scoreExam,
  sectionOrder,
  seedOf,
  shortCode,
  shuffleQuestion,
  verifyLink,
  type Access,
  type BankQuestion,
  type Card,
  type Lesson,
  type Progress,
  type Question,
  type Section,
  type StudyStyle,
} from "@/lib/academy/academy";
import { canSpeak, speak, stopSpeaking } from "@/lib/academy/speech";
import videos from "../../site/learn/videos/videos.json";

/**
 * AcademyPanel — the NOSHASHI course, inside the app.
 *
 * Built for people who learn in short bursts. One idea per card, one
 * question at a time, a progress line that always says how close the end
 * is, and nothing timed. The learner says how they learn best (watch,
 * listen, read or do) and each lesson leads with that; nothing is hidden
 * for any style. Text size, spacing, a typeface designed for low vision,
 * high contrast, read-aloud and break reminders are on the first screen
 * and in settings, not buried.
 *
 * Labs are the real app: a lesson's PRACTICE step opens its lab, which
 * hands real mainnet values to the real screens.
 */

const SITE = "https://www.noshashi.app";
const VIDEO = new Map(videos.map((v) => [v.id, v]));
// Captions ship inside the app, a few kilobytes each, so they work without
// asking the website for anything but the video itself.
const CAPTIONS = import.meta.glob("../../site/learn/videos/*.vtt", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const captionsFor = (id: string) => CAPTIONS[`../../site/learn/videos/${id}.vtt`] ?? null;

type View =
  | { kind: "home" }
  | { kind: "setup" }
  | { kind: "lesson"; id: string }
  | { kind: "exam" }
  | { kind: "certificate" }
  | { kind: "words" }
  | { kind: "review" };

let remembered: View = { kind: "home" };

const KIND_LABEL: Record<Card["kind"], string> = {
  idea: "THE IDEA",
  example: "REAL EXAMPLE",
  analogy: "THINK OF IT LIKE",
  warning: "WATCH OUT",
  try: "TRY IT",
};

const SECTION_LABEL: Record<Section, string> = {
  video: "Watch",
  cards: "Learn",
  words: "Key words",
  quiz: "Check",
  labs: "Practise",
};

export function useAcademy() {
  const [stored, store] = useLocal<unknown>("academy.progress", EMPTY_PROGRESS);
  const progress = useMemo(() => parseProgress(JSON.stringify(stored ?? null)), [stored]);
  return [progress, store as (next: Progress) => void] as const;
}

function accessStyle(a: Access): React.CSSProperties {
  return {
    zoom: [1, 1.15, 1.3, 1.5][a.textSize],
    fontFamily: a.legibleFont ? '"Atkinson Hyperlegible", system-ui, sans-serif' : undefined,
    letterSpacing: a.spacing ? "0.03em" : undefined,
    wordSpacing: a.spacing ? "0.12em" : undefined,
    lineHeight: a.spacing ? 1.85 : undefined,
  };
}

export function AcademyPanel({ onOpenLab }: { onOpenLab: (labId: string) => void }) {
  const [progress, setProgress] = useAcademy();
  const [labStored] = useLocal<unknown>("academy.labs", null);
  const labProgress = useMemo(() => sanitizeProgress(labStored), [labStored]);
  const labsDone = LABS.filter((l) => labStatus(l, labProgress).complete).length;
  // A first visit opens on setup and stays there until START is pressed,
  // so choosing a style does not whisk the learner past the reading settings.
  const [view, setViewState] = useState<View>(progress.style ? remembered : { kind: "setup" });
  const setView = (next: View) => {
    stopSpeaking();
    remembered = next;
    setViewState(next);
  };
  const a = progress.access;
  const effective: View = view;

  useEffect(() => () => stopSpeaking(), []);

  return (
    <Panel
      label={
        effective.kind === "lesson"
          ? `COURSE · ${lessonById(effective.id)?.title.toUpperCase() ?? ""}`
          : effective.kind === "exam"
            ? "COURSE · FINAL CHECK"
            : effective.kind === "certificate"
              ? "COURSE · CERTIFICATE"
              : "NOSHASHI ACADEMY"
      }
      right={
        effective.kind !== "setup" && (
          <button
            type="button"
            onClick={() => setView({ kind: "setup" })}
            className="font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
          >
            HOW I LEARN · READING
          </button>
        )
      }
      className="lg:col-span-3 lg:min-h-0"
      bodyClassName="lg:min-h-0 lg:overflow-y-auto"
    >
      <div
        style={accessStyle(a)}
        className={cn("academy", a.highContrast && "academy-contrast", a.reduceMotion && "academy-still")}
        data-reduce-motion={a.reduceMotion || undefined}
      >
        <BreakReminder minutes={a.breakMinutes} />
        {effective.kind === "setup" && <Setup progress={progress} setProgress={setProgress} onDone={() => setView({ kind: "home" })} />}
        {effective.kind === "home" && <Home progress={progress} labsDone={labsDone} setView={setView} />}
        {effective.kind === "lesson" && (
          <LessonPlayer
            key={effective.id}
            lesson={lessonById(effective.id)!}
            progress={progress}
            setProgress={setProgress}
            labProgress={labProgress}
            onOpenLab={onOpenLab}
            onHome={() => setView({ kind: "home" })}
            onNext={(id) => setView(id ? { kind: "lesson", id } : { kind: "home" })}
          />
        )}
        {effective.kind === "exam" && <Exam progress={progress} setProgress={setProgress} onHome={() => setView({ kind: "home" })} />}
        {effective.kind === "certificate" && (
          <CertificateView progress={progress} setProgress={setProgress} labsDone={labsDone} onHome={() => setView({ kind: "home" })} />
        )}
        {effective.kind === "words" && <Words rate={a.rate} onHome={() => setView({ kind: "home" })} />}
        {effective.kind === "review" && <Review progress={progress} setProgress={setProgress} onHome={() => setView({ kind: "home" })} />}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces shared by every view                                         */
/* ------------------------------------------------------------------ */

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value} of ${max}`}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ReadAloud({ text, rate, auto = false }: { text: string; rate: number; auto?: boolean }) {
  const [speaking, setSpeaking] = useState(false);
  const available = canSpeak();
  useEffect(() => {
    if (auto && available) {
      setSpeaking(true);
      speak(text, rate, () => setSpeaking(false));
    }
    return () => stopSpeaking();
  }, [text, auto, rate, available]);
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
        } else {
          setSpeaking(true);
          speak(text, rate, () => setSpeaking(false));
        }
      }}
      aria-pressed={speaking}
      className="rounded-[3px] border border-border/70 px-2 py-1 font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground hover:border-brand/60 hover:text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
    >
      {speaking ? "■ STOP" : "▶ READ ALOUD"}
    </button>
  );
}

function BreakReminder({ minutes }: { minutes: number }) {
  const [due, setDue] = useState(false);
  useEffect(() => {
    if (!minutes) return;
    const t = window.setTimeout(() => setDue(true), minutes * 60_000);
    return () => window.clearTimeout(t);
  }, [minutes, due]);
  if (!due) return null;
  return (
    <div role="status" className="mb-3 flex items-center gap-3 rounded-[4px] border border-brand/40 bg-brand/10 px-3 py-2 text-[12px]">
      <span className="flex-1">You have been learning for {minutes} minutes. A two-minute break helps it stick. Stand up, look away from the screen, breathe.</span>
      <Button size="sm" variant="outline" onClick={() => setDue(false)}>
        I'M BACK
      </Button>
    </div>
  );
}

function Back({ onClick, label = "COURSE MAP" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 self-start font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
    >
      ← {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* First run and settings: how I learn, and reading comfort            */
/* ------------------------------------------------------------------ */

function Setup({ progress, setProgress, onDone }: { progress: Progress; setProgress: (p: Progress) => void; onDone: () => void }) {
  const a = progress.access;
  const setA = (patch: Partial<Access>) => setProgress({ ...progress, access: { ...a, ...patch } });
  const toggle = (key: keyof Access, label: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-2.5 py-1.5">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]" checked={!!a[key]} onChange={(e) => setA({ [key]: e.target.checked } as Partial<Access>)} />
      <span>
        <span className="block text-[12.5px] text-foreground">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[16px] font-semibold text-foreground">Welcome to the NOSHASHI course</h2>
        <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-muted-foreground">
          {LESSONS.length} short lessons in {LEVELS.length} levels, about {LESSONS.reduce((n, l) => n + l.minutes, 0)} minutes in all. Every lesson is a few
          small cards, a three-question check you can retry as often as you like, and practice on the real app. Finish every lesson and the final check
          for a certificate of completion.
        </p>
      </div>

      <fieldset>
        <legend className="text-[13px] font-semibold text-foreground">How do you learn best?</legend>
        <p className="text-[11px] text-muted-foreground">Each lesson will start with this. You still get everything else, and you can change it any time.</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STUDY_STYLES.map((s) => (
            <label
              key={s.id}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-[4px] border px-3 py-2.5",
                progress.style === s.id ? "border-brand/60 bg-brand/10" : "border-border/70 hover:border-brand/40"
              )}
            >
              <input
                type="radio"
                name="study-style"
                className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]"
                checked={progress.style === s.id}
                onChange={() => setProgress({ ...progress, style: s.id as StudyStyle, access: s.id === "listen" ? { ...a, autoRead: true } : a })}
              />
              <span>
                <span className="block text-[12.5px] font-medium text-foreground">{s.label}</span>
                <span className="block text-[11px] text-muted-foreground">{s.blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[13px] font-semibold text-foreground">Make reading comfortable</legend>
        <div className="mt-2 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Text size">
          <span className="text-[12px] text-foreground">Text size</span>
          {(["Normal", "Large", "Larger", "Largest"] as const).map((label, i) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={a.textSize === i}
              onClick={() => setA({ textSize: i as Access["textSize"] })}
              className={cn(
                "rounded-[3px] border px-2.5 py-1 text-[11.5px]",
                a.textSize === i ? "border-brand/60 bg-brand/10 text-brand" : "border-border/70 text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2">
          {toggle("legibleFont", "Easier-to-read letters", "Atkinson Hyperlegible, a typeface made for people with low vision.")}
          {toggle("spacing", "More space between lines and words", "Helps if letters seem to crowd or swim.")}
          {toggle("highContrast", "High contrast", "Stronger text and borders.")}
          {toggle("reduceMotion", "No movement", "Nothing slides or animates.")}
          {toggle("autoRead", "Read each card aloud", canSpeak() ? "Uses your computer's own voice. Nothing is sent anywhere." : "Your system has no built-in voice here; cards stay on screen.")}
          {toggle("focusMode", "Focus mode", "Shows only the card you are on.")}
        </div>
        {canSpeak() && (
          <label className="mt-2 flex items-center gap-3 text-[12px] text-foreground">
            Reading speed
            <input type="range" min={0.6} max={1.4} step={0.1} value={a.rate} onChange={(e) => setA({ rate: Number(e.target.value) })} aria-valuetext={`${a.rate.toFixed(1)} times`} />
            <span className="font-mono text-[11px] text-muted-foreground">{a.rate.toFixed(1)}×</span>
          </label>
        )}
        <label className="mt-2 flex items-center gap-3 text-[12px] text-foreground">
          Remind me to take a break
          <select
            value={a.breakMinutes}
            onChange={(e) => setA({ breakMinutes: Number(e.target.value) as Access["breakMinutes"] })}
            className="rounded-[3px] border border-border/70 bg-transparent px-2 py-1 text-[12px]"
          >
            <option value={0}>Never</option>
            <option value={10}>Every 10 minutes</option>
            <option value={15}>Every 15 minutes</option>
            <option value={20}>Every 20 minutes</option>
            <option value={30}>Every 30 minutes</option>
          </select>
        </label>
      </fieldset>

      <div>
        <Button onClick={onDone} disabled={!progress.style}>
          {progress.style ? "START LEARNING →" : "PICK HOW YOU LEARN TO START"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Course map                                                          */
/* ------------------------------------------------------------------ */

function Home({ progress, labsDone, setView }: { progress: Progress; labsDone: number; setView: (v: View) => void }) {
  const all = overall(progress);
  const next = nextLesson(progress);
  const ready = eligible(progress);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">Your progress</h2>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {all.passed}/{all.total} LESSONS · {labsDone}/{LABS.length} LABS · FINAL CHECK {progress.exam.passedAt ? `PASSED ${progress.exam.best}%` : progress.exam.tries ? `BEST ${progress.exam.best}%` : "NOT YET"}
          </span>
        </div>
        <Bar value={all.passed} max={all.total} label="Lessons passed" />
        <div className="mt-1 flex flex-wrap gap-2">
          {next ? (
            <Button onClick={() => setView({ kind: "lesson", id: next.id })}>
              {all.passed ? "CONTINUE" : "START"}: {next.title} →
            </Button>
          ) : (
            !progress.exam.passedAt && <Button onClick={() => setView({ kind: "exam" })}>TAKE THE FINAL CHECK →</Button>
          )}
          {progress.missed.length > 0 && (
            <Button variant="outline" onClick={() => setView({ kind: "review" })}>
              REVIEW {progress.missed.length} MISSED
            </Button>
          )}
          <Button variant="outline" onClick={() => setView({ kind: "words" })}>
            WORD LIST
          </Button>
          {ready.ok && (
            <Button variant="outline" onClick={() => setView({ kind: "certificate" })}>
              MY CERTIFICATE
            </Button>
          )}
        </div>
      </div>

      {LEVELS.map((level) => {
        const s = levelSummary(progress, level.id);
        return (
          <section key={level.id} aria-labelledby={`lvl-${level.id}`} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2 border-t border-border/50 pt-3">
              <h3 id={`lvl-${level.id}`} className="text-[13px] font-semibold text-foreground">
                Level {level.n} · {level.title}
              </h3>
              <span className="ml-auto font-mono text-[10.5px] text-faint">
                {s.passed}/{s.total} · ~{s.minutes} MIN
              </span>
            </div>
            <p className="text-[11.5px] text-muted-foreground">{level.blurb}</p>
            <ol className="mt-1 flex flex-col gap-1">
              {lessonsIn(level.id).map((l) => {
                const done = lessonPassed(progress, l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setView({ kind: "lesson", id: l.id })}
                      className="inset-row flex w-full items-center gap-2.5 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                    >
                      <span aria-hidden className={cn("w-4 text-center font-mono text-[12px]", done ? "text-go" : "text-faint")}>
                        {done ? "✓" : "○"}
                      </span>
                      <span className="flex-1 text-[12.5px] text-foreground">{l.title}</span>
                      <span className="sr-only">{done ? "passed" : "not passed yet"}</span>
                      {l.video && <span className="font-mono text-[10px] tracking-[0.1em] text-faint">VIDEO</span>}
                      {l.labs.length > 0 && <span className="font-mono text-[10px] tracking-[0.1em] text-faint">LAB</span>}
                      <span className="font-mono text-[10.5px] text-faint">{l.minutes} MIN</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      <section className="flex flex-col gap-1.5 border-t border-border/50 pt-3">
        <h3 className="text-[13px] font-semibold text-foreground">Final check and certificate</h3>
        <p className="text-[11.5px] text-muted-foreground">
          {EXAM.questions} questions drawn from the whole course, one at a time, no timer. {EXAM.passPercent}% passes, and you can take it again. Pass every
          lesson and the final check for a certificate of completion.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setView({ kind: "exam" })}>
            {progress.exam.tries ? "TAKE THE FINAL CHECK AGAIN" : "TAKE THE FINAL CHECK"}
          </Button>
          <Button variant="outline" disabled={!ready.ok} onClick={() => setView({ kind: "certificate" })}>
            {ready.ok ? "GET MY CERTIFICATE" : `CERTIFICATE: ${ready.missing.length} LESSON${ready.missing.length === 1 ? "" : "S"}${ready.examPassed ? "" : " AND THE FINAL CHECK"} TO GO`}
          </Button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A lesson                                                            */
/* ------------------------------------------------------------------ */

function LessonPlayer({
  lesson,
  progress,
  setProgress,
  labProgress,
  onOpenLab,
  onHome,
  onNext,
}: {
  lesson: Lesson;
  progress: Progress;
  setProgress: (p: Progress) => void;
  labProgress: ReturnType<typeof sanitizeProgress>;
  onOpenLab: (id: string) => void;
  onHome: () => void;
  onNext: (id: string | null) => void;
}) {
  const style = progress.style ?? "mix";
  const sections = sectionOrder(style, lesson);
  const [at, setAt] = useState(0);
  const section = sections[at];
  const level = LEVELS.find((l) => l.id === lesson.level)!;
  const index = LESSONS.findIndex((l) => l.id === lesson.id);
  const following = LESSONS[index + 1] ?? null;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the section heading so screen readers announce the change.
  useEffect(() => {
    headingRef.current?.focus();
  }, [at]);

  return (
    <div className="flex flex-col gap-3">
      <Back onClick={onHome} />
      <div>
        <p className="font-mono text-[10.5px] tracking-[0.1em] text-faint">
          LEVEL {level.n} · LESSON {index + 1} OF {LESSONS.length} · ABOUT {lesson.minutes} MIN
        </p>
        <h2 className="mt-0.5 text-[17px] font-semibold text-foreground">{lesson.title}</h2>
        {!progress.access.focusMode && (
          <ul className="mt-1.5 flex flex-col gap-0.5" aria-label="By the end of this lesson">
            {lesson.goals.map((g) => (
              <li key={g} className="text-[12px] text-muted-foreground">
                ☐ {g}
              </li>
            ))}
          </ul>
        )}
      </div>

      <nav aria-label="Lesson steps" className="flex flex-wrap gap-1.5">
        {sections.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setAt(i)}
            aria-current={i === at ? "step" : undefined}
            className={cn(
              "rounded-[3px] border px-2.5 py-1 font-mono text-[10.5px] tracking-[0.1em]",
              i === at ? "border-brand/60 bg-brand/10 text-brand" : "border-border/70 text-muted-foreground hover:text-foreground"
            )}
          >
            {i + 1}. {SECTION_LABEL[s].toUpperCase()}
          </button>
        ))}
      </nav>

      <h3 ref={headingRef} tabIndex={-1} className="text-[13px] font-semibold text-foreground focus:outline-none">
        Step {at + 1} of {sections.length}: {SECTION_LABEL[section]}
      </h3>

      {section === "video" && lesson.video && <LessonVideo id={lesson.video} />}
      {section === "cards" && (
        <Cards
          lesson={lesson}
          access={progress.access}
          onSeen={(n) => setProgress(recordCardsSeen(progress, lesson.id, n))}
          onDone={() => setAt(Math.min(at + 1, sections.length - 1))}
        />
      )}
      {section === "words" && <WordList words={lesson.words} rate={progress.access.rate} />}
      {section === "quiz" && (
        <LessonQuiz
          lesson={lesson}
          progress={progress}
          onScore={(picked) => setProgress(recordQuiz(progress, lesson.id, picked, new Date().toISOString()))}
        />
      )}
      {section === "labs" && <LessonLabs lesson={lesson} labProgress={labProgress} onOpenLab={onOpenLab} />}

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
        {at > 0 && (
          <Button variant="outline" onClick={() => setAt(at - 1)}>
            ← BACK
          </Button>
        )}
        {at < sections.length - 1 ? (
          <Button onClick={() => setAt(at + 1)}>NEXT: {SECTION_LABEL[sections[at + 1]].toUpperCase()} →</Button>
        ) : (
          <Button onClick={() => onNext(following?.id ?? null)}>{following ? `NEXT LESSON: ${following.title} →` : "BACK TO THE COURSE MAP"}</Button>
        )}
      </div>

      <div className="rounded-[4px] border-l-2 border-brand bg-brand/5 px-3 py-2">
        <p className="font-mono text-[10px] tracking-[0.12em] text-brand">REMEMBER THIS</p>
        <p className="mt-0.5 text-[12.5px] text-foreground">{lesson.keyIdea}</p>
      </div>
    </div>
  );
}

function Cards({ lesson, access, onSeen, onDone }: { lesson: Lesson; access: Access; onSeen: (n: number) => void; onDone: () => void }) {
  const [i, setI] = useState(0);
  const card = lesson.cards[i];
  const last = i === lesson.cards.length - 1;
  useEffect(() => {
    onSeen(i + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);
  return (
    <div className="flex flex-col gap-3">
      <Bar value={i + 1} max={lesson.cards.length} label="Cards read" />
      <article aria-live="polite" className={cn("rounded-[4px] border px-4 py-3.5", card.kind === "warning" ? "border-hold/50" : "border-border/70")}>
        <div className="flex items-center gap-2">
          <p className={cn("font-mono text-[10px] tracking-[0.12em]", card.kind === "warning" ? "text-hold" : "text-telemetry")}>
            {KIND_LABEL[card.kind]} · CARD {i + 1} OF {lesson.cards.length}
          </p>
          <span className="ml-auto">
            <ReadAloud text={`${card.title}. ${card.text}`} rate={access.rate} auto={access.autoRead} />
          </span>
        </div>
        <h4 className="mt-1.5 text-[14px] font-semibold text-foreground">{card.title}</h4>
        <p className="mt-1 max-w-[64ch] text-[13px] leading-relaxed text-foreground/90">{card.text}</p>
      </article>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={i === 0} onClick={() => setI(i - 1)}>
          ← PREVIOUS CARD
        </Button>
        {last ? (
          <Button size="sm" onClick={onDone}>
            DONE READING ✓
          </Button>
        ) : (
          <Button size="sm" onClick={() => setI(i + 1)}>
            NEXT CARD →
          </Button>
        )}
      </div>
    </div>
  );
}

function LessonVideo({ id }: { id: string }) {
  const meta = VIDEO.get(id)!;
  const vtt = captionsFor(id);
  const track = useMemo(() => (vtt ? URL.createObjectURL(new Blob([vtt], { type: "text/vtt" })) : null), [vtt]);
  useEffect(() => () => (track ? URL.revokeObjectURL(track) : undefined), [track]);
  const [showText, setShowText] = useState(false);
  const transcript = useMemo(
    () =>
      (vtt ?? "")
        .split(/\r?\n\r?\n/)
        .map((block) => block.split(/\r?\n/).filter((line) => line && !line.includes("-->") && line !== "WEBVTT" && !/^\d+$/.test(line)).join(" "))
        .filter(Boolean),
    [vtt]
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-muted-foreground">
        {meta.title} · {Math.floor(meta.secs / 60)}:{String(meta.secs % 60).padStart(2, "0")} · captions on. {meta.blurb}
      </p>
      <video controls preload="metadata" poster={`${SITE}/learn/videos/${id}.jpg`} className="w-full max-w-[720px] rounded-[4px] border border-border/60 bg-black" aria-label={meta.title}>
        <source src={`${SITE}/learn/videos/${id}.mp4`} type="video/mp4" />
        {track && <track kind="captions" src={track} srcLang="en" label="English" default />}
      </video>
      <p className="text-[11px] text-faint">
        The video plays from noshashi.app, so it needs an internet connection. The words are below if it will not play.
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={() => setShowText(!showText)} aria-expanded={showText}>
          {showText ? "HIDE THE WORDS" : "READ THE WORDS INSTEAD"}
        </Button>
        <Button variant="link" size="sm" onClick={() => void openExternal(`${SITE}/learn/videos/${id}.mp4`)}>
          Open in browser
        </Button>
      </div>
      {showText && (
        <div className="max-w-[70ch] rounded-[4px] border border-border/60 px-3 py-2 text-[12.5px] leading-relaxed text-foreground/90">
          {transcript.map((t, n) => (
            <p key={n} className="mt-1">
              {t}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function WordList({ words, rate }: { words: string[]; rate: number }) {
  return (
    <dl className="flex flex-col gap-2">
      {words.map((w) => (
        <div key={w} className="rounded-[4px] border border-border/60 px-3 py-2">
          <div className="flex items-center gap-2">
            <dt className="text-[13px] font-semibold text-foreground">{w}</dt>
            <span className="ml-auto">
              <ReadAloud text={`${w}. ${GLOSSARY[w]}`} rate={rate} />
            </span>
          </div>
          <dd className="mt-0.5 text-[12.5px] text-muted-foreground">{GLOSSARY[w]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One question at a time, the answer explained right away, right or wrong. */
function QuestionCard({
  q,
  n,
  of,
  picked,
  onPick,
  reveal,
}: {
  q: Question;
  n: number;
  of: number;
  picked: number | undefined;
  onPick: (i: number) => void;
  reveal: boolean;
}) {
  const answered = picked !== undefined;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[13.5px] font-semibold text-foreground">
        <span className="font-mono text-[10.5px] tracking-[0.1em] text-faint">
          QUESTION {n} OF {of}
        </span>
        <span className="mt-1 block">{q.question}</span>
      </legend>
      {q.options.map((o, i) => {
        const right = i === q.answer;
        const chosen = picked === i;
        return (
          <label
            key={o}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-[4px] border px-3 py-2 text-[12.5px]",
              reveal && answered && right && "border-go/60 bg-go/10",
              reveal && chosen && !right && "border-no-go/60 bg-no-go/10",
              !(reveal && answered) && (chosen ? "border-brand/60 bg-brand/10" : "border-border/70 hover:border-brand/40")
            )}
          >
            <input
              type="radio"
              name={`q-${n}-${q.question}`}
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]"
              checked={chosen}
              disabled={reveal && answered}
              onChange={() => onPick(i)}
            />
            <span className="flex-1">{o}</span>
            {reveal && answered && right && <span className="font-mono text-[10.5px] text-go">✓ RIGHT ANSWER</span>}
            {reveal && chosen && !right && <span className="font-mono text-[10.5px] text-no-go">✗ YOUR ANSWER</span>}
          </label>
        );
      })}
      <div aria-live="polite">
        {reveal && answered && (
          <p className={cn("rounded-[4px] px-3 py-2 text-[12.5px]", picked === q.answer ? "bg-go/10 text-foreground" : "bg-hold/10 text-foreground")}>
            <strong>{picked === q.answer ? "Yes! " : "Not quite. "}</strong>
            {q.why}
          </p>
        )}
      </div>
    </fieldset>
  );
}

function LessonQuiz({ lesson, progress, onScore }: { lesson: Lesson; progress: Progress; onScore: (picked: number[]) => void }) {
  const tries = progress.lessons[lesson.id]?.tries ?? 0;
  const [attempt, setAttempt] = useState(tries);
  const questions = useMemo(() => lesson.quiz.map((q, i) => shuffleQuestion(q, seedOf(`${lesson.id}/${i}/${attempt}`))), [lesson, attempt]);
  const [picked, setPicked] = useState<number[]>([]);
  const [at, setAt] = useState(0);
  const [finished, setFinished] = useState(false);
  const correct = questions.filter((q, i) => picked[i] === q.answer).length;
  const passed = correct >= EXAM.lessonPassCorrect;

  const finish = () => {
    // Store answers in the course's own option order, which the scorer reads.
    const original = questions.map((q, i) => lesson.quiz[i].options.indexOf(q.options[picked[i]]));
    onScore(original);
    setFinished(true);
  };

  if (finished) {
    return (
      <div className="flex flex-col gap-2" role="status">
        <p className="text-[15px] font-semibold text-foreground">
          {correct} of {questions.length} right. {passed ? "Lesson passed ✓" : `You need ${EXAM.lessonPassCorrect} to pass. Have another go: it is not timed and there is no limit.`}
        </p>
        <div className="flex gap-2">
          <Button
            variant={passed ? "outline" : "default"}
            onClick={() => {
              setAttempt(attempt + 1);
              setPicked([]);
              setAt(0);
              setFinished(false);
            }}
          >
            TRY AGAIN
          </Button>
        </div>
      </div>
    );
  }

  const q = questions[at];
  return (
    <div className="flex flex-col gap-3">
      <Bar value={at + (picked[at] !== undefined ? 1 : 0)} max={questions.length} label="Questions answered" />
      <QuestionCard q={q} n={at + 1} of={questions.length} picked={picked[at]} onPick={(i) => setPicked(Object.assign([...picked], { [at]: i }))} reveal />
      <div className="flex gap-2">
        {at < questions.length - 1 ? (
          <Button disabled={picked[at] === undefined} onClick={() => setAt(at + 1)}>
            NEXT QUESTION →
          </Button>
        ) : (
          <Button disabled={picked[at] === undefined} onClick={finish}>
            SEE MY SCORE
          </Button>
        )}
      </div>
    </div>
  );
}

function LessonLabs({ lesson, labProgress, onOpenLab }: { lesson: Lesson; labProgress: ReturnType<typeof sanitizeProgress>; onOpenLab: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-muted-foreground">
        Labs use the real app with real XRP Ledger addresses filled in for you. Each step tells you where to go and what to look for, then asks one
        question.
      </p>
      {lesson.labs.map((id) => {
        const lab = labById(id);
        if (!lab) return null;
        const status = labStatus(lab, labProgress);
        return (
          <div key={id} className="flex items-start gap-3 rounded-[4px] border border-border/70 px-3 py-2.5">
            <div className="flex-1">
              <p className="text-[12.5px] font-medium text-foreground">
                {lab.title} {status.complete && <span className="font-mono text-[10.5px] text-go">✓ DONE</span>}
              </p>
              <p className="text-[11.5px] text-muted-foreground">{lab.outcome}</p>
              <p className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-faint">
                {lab.steps.length} STEPS · ~{lab.minutes} MIN{lab.requires ? " · NEEDS A PAID PLAN" : " · FREE"}
              </p>
            </div>
            <Button size="sm" onClick={() => onOpenLab(id)}>
              {status.complete ? "OPEN AGAIN" : "START LAB"} →
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Review, final check, certificate, word list                         */
/* ------------------------------------------------------------------ */

function Review({ progress, setProgress, onHome }: { progress: Progress; setProgress: (p: Progress) => void; onHome: () => void }) {
  const items = progress.missed
    .map((key) => {
      const [id, n] = key.split("/");
      const lesson = lessonById(id);
      return lesson ? { key, lesson, q: shuffleQuestion(lesson.quiz[Number(n)], seedOf(key)) } : null;
    })
    .filter(Boolean) as Array<{ key: string; lesson: Lesson; q: Question }>;
  const [picked, setPicked] = useState<Record<string, number>>({});
  if (!items.length) {
    return (
      <div>
        <Back onClick={onHome} />
        <p className="text-[13px] text-foreground">Nothing to review. Every question you missed, you have since got right.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Back onClick={onHome} />
      <p className="text-[12.5px] text-muted-foreground">Questions you missed, asked again. Get one right and it leaves this list.</p>
      {items.map(({ key, lesson, q }, i) => (
        <div key={key}>
          <p className="mb-1 font-mono text-[10px] tracking-[0.1em] text-faint">FROM: {lesson.title.toUpperCase()}</p>
          <QuestionCard
            q={q}
            n={i + 1}
            of={items.length}
            picked={picked[key]}
            reveal
            onPick={(choice) => {
              setPicked({ ...picked, [key]: choice });
              if (choice === q.answer) setProgress({ ...progress, missed: progress.missed.filter((k) => k !== key) });
            }}
          />
        </div>
      ))}
    </div>
  );
}

function Exam({ progress, setProgress, onHome }: { progress: Progress; setProgress: (p: Progress) => void; onHome: () => void }) {
  const [seed] = useState(() => seedOf(`${Date.now()}`));
  const questions: BankQuestion[] = useMemo(() => buildExam(seed), [seed]);
  const [picked, setPicked] = useState<number[]>([]);
  const [at, setAt] = useState(0);
  const [result, setResult] = useState<ReturnType<typeof scoreExam> | null>(null);

  if (result) {
    const wrong = questions.map((q, i) => ({ q, p: picked[i] })).filter(({ q, p }) => p !== q.answer);
    return (
      <div className="flex flex-col gap-3">
        <Back onClick={onHome} />
        <div role="status">
          <p className="text-[17px] font-semibold text-foreground">
            {result.correct} of {result.total} · {result.percent}%
          </p>
          <p className="text-[13px] text-foreground">
            {result.passed
              ? "You passed the final check ✓"
              : `${EXAM.passPercent}% passes. Read the explanations below, then try again: you get a new mix of questions each time.`}
          </p>
        </div>
        {wrong.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-[13px] font-semibold text-foreground">The ones to look at again</h3>
            {wrong.map(({ q, p }, i) => (
              <QuestionCard key={q.question} q={q} n={i + 1} of={wrong.length} picked={p} onPick={() => undefined} reveal />
            ))}
          </div>
        )}
      </div>
    );
  }

  const q = questions[at];
  const answered = picked.filter((p) => p !== undefined).length;
  return (
    <div className="flex flex-col gap-3">
      <Back onClick={onHome} />
      <p className="text-[12px] text-muted-foreground">
        {questions.length} questions, no timer. Answers are checked at the end. You can go back and change any answer.
      </p>
      <Bar value={answered} max={questions.length} label="Questions answered" />
      <QuestionCard q={q} n={at + 1} of={questions.length} picked={picked[at]} reveal={false} onPick={(i) => setPicked(Object.assign([...picked], { [at]: i }))} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={at === 0} onClick={() => setAt(at - 1)}>
          ← PREVIOUS
        </Button>
        {at < questions.length - 1 ? (
          <Button onClick={() => setAt(at + 1)}>NEXT →</Button>
        ) : (
          <Button
            disabled={answered < questions.length}
            onClick={() => {
              const r = scoreExam(questions, picked);
              setResult(r);
              setProgress(recordExam(progress, r.percent, new Date().toISOString()));
            }}
          >
            {answered < questions.length ? `${questions.length - answered} STILL TO ANSWER` : "FINISH AND SEE MY SCORE"}
          </Button>
        )}
      </div>
    </div>
  );
}

function CertificateView({
  progress,
  setProgress,
  labsDone,
  onHome,
}: {
  progress: Progress;
  setProgress: (p: Progress) => void;
  labsDone: number;
  onHome: () => void;
}) {
  const ready = eligible(progress);
  const [name, setName] = useState(progress.certificate?.record.name ?? "");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const cert = progress.certificate;

  const issue = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const record = certificateRecord(name, progress, { done: labsDone, total: LABS.length }, new Date().toISOString().slice(0, 10));
    setProgress({ ...progress, certificate: { record, code: await certificateCode(record) } });
    setBusy(false);
  };

  if (!ready.ok) {
    return (
      <div>
        <Back onClick={onHome} />
        <p className="text-[13px] text-foreground">
          Not yet: {ready.missing.length} lesson{ready.missing.length === 1 ? "" : "s"} to pass{ready.examPassed ? "" : ", and the final check"}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Back onClick={onHome} />
      {!cert ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="cert-name" className="text-[13px] font-semibold text-foreground">
            Your name as it should appear on the certificate
          </label>
          <input
            id="cert-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
            className="max-w-[420px] rounded-[3px] border border-border/70 bg-transparent px-3 py-2 text-[14px]"
          />
          <p className="text-[11px] text-muted-foreground">Your name stays on this computer. It is part of the certificate's code, so it cannot be changed afterwards.</p>
          <div>
            <Button disabled={!name.trim() || busy} onClick={() => void issue()}>
              {busy ? "MAKING IT…" : "MAKE MY CERTIFICATE"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <article className="academy-certificate rounded-[6px] border-2 border-brand/60 px-6 py-6 text-center" aria-label="Certificate of completion">
            <p className="font-mono text-[11px] tracking-[0.2em] text-brand">NOSHASHI ACADEMY</p>
            <h2 className="mt-2 text-[22px] font-semibold text-foreground">Certificate of Completion</h2>
            <p className="mt-3 text-[13px] text-muted-foreground">This certifies that</p>
            <p className="mt-1 text-[24px] font-semibold text-foreground">{cert.record.name}</p>
            <p className="mt-2 text-[13px] text-muted-foreground">
              completed the NOSHASHI course on the XRP Ledger and the NOSHASHI app: {cert.record.lessons_passed} of {cert.record.lessons_total} lessons passed,
              final check {cert.record.exam_percent}%, {cert.record.labs_completed} of {cert.record.labs_total} hands-on labs completed.
            </p>
            <p className="mt-3 text-[13px] text-foreground">Completed on {cert.record.completed_on}</p>
            <p className="mt-3 font-mono text-[13px] tracking-[0.12em] text-foreground">CODE {shortCode(cert.code)}</p>
            <p className="mt-1 break-all font-mono text-[9.5px] text-faint">SHA-256 {cert.code}</p>
            <p className="mx-auto mt-4 max-w-[60ch] text-[10.5px] leading-relaxed text-faint">
              A record of a completed self-paced course. It is not a professional licence, an accreditation, a regulatory qualification or an offer of
              employment. Anyone can check it: the code is a fingerprint of exactly what this certificate states.
            </p>
          </article>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                void saveTextFile(`noshashi-certificate-${shortCode(cert.code)}.html`, certificateHtml(cert.record, cert.code), "text/html").then(
                  (where) => setSaved(where),
                  () => setSaved(null)
                );
              }}
            >
              SAVE MY CERTIFICATE
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              PRINT
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(verifyLink(cert.record)).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "COPIED" : "COPY THE CHECK LINK"}
            </Button>
          </div>
          {saved && (
            <p role="status" className="text-[11.5px] text-go">
              Saved to {saved}. Open it in a browser to print it or save it as a PDF.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            The check link opens noshashi.app/academy/certificate/, which recomputes the code from what the certificate states. Nothing is stored on any
            server.
          </p>
        </>
      )}
    </div>
  );
}

function Words({ rate, onHome }: { rate: number; onHome: () => void }) {
  const [q, setQ] = useState("");
  const terms = Object.keys(GLOSSARY).filter((t) => !q || `${t} ${GLOSSARY[t]}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-3">
      <Back onClick={onHome} />
      <label className="flex flex-col gap-1 text-[12px] text-foreground">
        Search {Object.keys(GLOSSARY).length} words
        <input value={q} onChange={(e) => setQ(e.target.value)} className="max-w-[360px] rounded-[3px] border border-border/70 bg-transparent px-3 py-1.5 text-[13px]" />
      </label>
      <p aria-live="polite" className="sr-only">
        {terms.length} words shown
      </p>
      <WordList words={terms} rate={rate} />
    </div>
  );
}
