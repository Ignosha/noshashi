import course from "./course.json";
import questionBank from "./questions.json";
import glossaryList from "./glossary.json";

/**
 * NOSHASHI Academy — the rules of the course, kept free of any screen so
 * the desktop app and the website score a learner the same way.
 *
 * A lesson is a handful of short cards, a video when one exists, the labs
 * that practise it on the real app, and a three-question check. Two right
 * answers pass the lesson, and it can be retried as often as needed: the
 * check is there to show what stuck, not to catch anyone out. The final
 * exam draws from the website's knowledge check, every round represented,
 * and passes at 80%. Passing every lesson and the exam earns a certificate
 * of completion whose code is a SHA-256 fingerprint of what it states, so
 * anyone can re-check it.
 */

export type CardKind = "idea" | "example" | "analogy" | "warning" | "try";
export type Card = { kind: CardKind; title: string; text: string };
export type Question = { question: string; options: string[]; answer: number; why: string };
export type Lesson = {
  id: string;
  level: string;
  title: string;
  minutes: number;
  source: string;
  video: string | null;
  goals: string[];
  cards: Card[];
  words: string[];
  keyIdea: string;
  labs: string[];
  quiz: Question[];
};
export type Level = { id: string; n: number; title: string; blurb: string };
export type BankQuestion = Question & { round: string };

export const COURSE_VERSION: string = course.version;
export const LEVELS: Level[] = course.levels;
export const LESSONS: Lesson[] = course.lessons as Lesson[];
export const EXAM = course.exam;
export const BANK: BankQuestion[] = questionBank;
export const GLOSSARY: Record<string, string> = Object.fromEntries(glossaryList.map((g) => [g.term, g.meaning]));

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);
export const lessonsIn = (level: string) => LESSONS.filter((l) => l.level === level);

/* ------------------------------------------------------------------ */
/* How a learner studies                                               */
/* ------------------------------------------------------------------ */

/** How the learner said they learn best. */
export type StudyStyle = "watch" | "listen" | "read" | "do" | "mix";

export const STUDY_STYLES: Array<{ id: StudyStyle; label: string; blurb: string }> = [
  { id: "watch", label: "Watch", blurb: "Video first, then short cards." },
  { id: "listen", label: "Listen", blurb: "Every card is read aloud to you." },
  { id: "read", label: "Read", blurb: "Cards and key words first, at your own pace." },
  { id: "do", label: "Do", blurb: "Try it in the app first, then read why." },
  { id: "mix", label: "A bit of everything", blurb: "Cards, then video, then practice." },
];

export type Section = "video" | "cards" | "words" | "quiz" | "labs";

/**
 * The order a lesson's parts are shown in. Nothing is hidden for any
 * style: a learner who prefers listening still gets the cards on screen,
 * they are just read aloud as well.
 */
export function sectionOrder(style: StudyStyle, lesson: Pick<Lesson, "video" | "labs">): Section[] {
  const order: Record<StudyStyle, Section[]> = {
    watch: ["video", "cards", "words", "quiz", "labs"],
    listen: ["cards", "video", "words", "quiz", "labs"],
    read: ["cards", "words", "quiz", "video", "labs"],
    do: ["labs", "cards", "quiz", "video", "words"],
    mix: ["cards", "video", "words", "quiz", "labs"],
  };
  return order[style].filter((s) => (s === "video" ? !!lesson.video : s === "labs" ? lesson.labs.length > 0 : true));
}

/** Reading comfort and access settings. Defaults change nothing. */
export type Access = {
  /** 0 normal, 1 large, 2 larger, 3 largest. */
  textSize: 0 | 1 | 2 | 3;
  /** More space between lines and letters. */
  spacing: boolean;
  /** Atkinson Hyperlegible, a typeface designed for low vision. */
  legibleFont: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  /** Read each card aloud when it appears. */
  autoRead: boolean;
  /** Speech rate for read-aloud, 0.6 to 1.4. */
  rate: number;
  /** Show one card at a time with nothing else on screen. */
  focusMode: boolean;
  /** Suggest a short break after this many minutes; 0 for never. */
  breakMinutes: 0 | 10 | 15 | 20 | 30;
};

export const DEFAULT_ACCESS: Access = {
  textSize: 0,
  spacing: false,
  legibleFont: false,
  highContrast: false,
  reduceMotion: false,
  autoRead: false,
  rate: 1,
  focusMode: false,
  breakMinutes: 0,
};

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export type LessonProgress = { cardsSeen: number; best: number; tries: number; passedAt?: string };
export type ExamProgress = { best: number; tries: number; passedAt?: string };
export type Certificate = { record: CertificateRecord; code: string };

export type Progress = {
  v: 1;
  style: StudyStyle | null;
  access: Access;
  lessons: Record<string, LessonProgress>;
  exam: ExamProgress;
  certificate: Certificate | null;
  /** Questions answered wrong, by "lesson/index", to bring back in review. */
  missed: string[];
};

export const EMPTY_PROGRESS: Progress = {
  v: 1,
  style: null,
  access: DEFAULT_ACCESS,
  lessons: {},
  exam: { best: 0, tries: 0 },
  certificate: null,
  missed: [],
};

/** Parse stored progress, tolerating anything a browser might hand back. */
export function parseProgress(raw: string | null): Progress {
  if (!raw) return EMPTY_PROGRESS;
  try {
    const p = JSON.parse(raw) as Partial<Progress>;
    if (p.v !== 1) return EMPTY_PROGRESS;
    return {
      ...EMPTY_PROGRESS,
      ...p,
      access: { ...DEFAULT_ACCESS, ...(p.access ?? {}) },
      exam: { ...EMPTY_PROGRESS.exam, ...(p.exam ?? {}) },
      lessons: p.lessons ?? {},
      missed: Array.isArray(p.missed) ? p.missed : [],
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export const lessonPassed = (p: Progress, id: string) => (p.lessons[id]?.best ?? 0) >= EXAM.lessonPassCorrect;

/** Record a lesson check. Keeps the best score and the questions missed. */
export function recordQuiz(p: Progress, lessonId: string, picked: number[], now: string): Progress {
  const lesson = lessonById(lessonId);
  if (!lesson) return p;
  const correct = lesson.quiz.filter((q, i) => picked[i] === q.answer).length;
  const prev = p.lessons[lessonId] ?? { cardsSeen: 0, best: 0, tries: 0 };
  const passed = correct >= EXAM.lessonPassCorrect;
  const keys = lesson.quiz.map((_, i) => `${lessonId}/${i}`);
  const wrong = keys.filter((_, i) => picked[i] !== lesson.quiz[i].answer);
  return {
    ...p,
    lessons: {
      ...p.lessons,
      [lessonId]: {
        ...prev,
        best: Math.max(prev.best, correct),
        tries: prev.tries + 1,
        passedAt: prev.passedAt ?? (passed ? now : undefined),
      },
    },
    missed: [...p.missed.filter((k) => !keys.includes(k)), ...wrong],
  };
}

export function recordCardsSeen(p: Progress, lessonId: string, seen: number): Progress {
  const prev = p.lessons[lessonId] ?? { cardsSeen: 0, best: 0, tries: 0 };
  if (seen <= prev.cardsSeen) return p;
  return { ...p, lessons: { ...p.lessons, [lessonId]: { ...prev, cardsSeen: seen } } };
}

export function levelSummary(p: Progress, level: string) {
  const ls = lessonsIn(level);
  const passed = ls.filter((l) => lessonPassed(p, l.id)).length;
  return { passed, total: ls.length, minutes: ls.reduce((n, l) => n + l.minutes, 0) };
}

export function overall(p: Progress) {
  const passed = LESSONS.filter((l) => lessonPassed(p, l.id)).length;
  return { passed, total: LESSONS.length, percent: Math.round((passed / LESSONS.length) * 100) };
}

/** The first lesson not yet passed, in course order. */
export const nextLesson = (p: Progress) => LESSONS.find((l) => !lessonPassed(p, l.id)) ?? null;

/* ------------------------------------------------------------------ */
/* Shuffling, so the right answer is not always in the same place      */
/* ------------------------------------------------------------------ */

/** A small seeded generator (mulberry32): the same seed gives the same order. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shuffled<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The question with its options in a seeded order, and the answer moved with them. */
export function shuffleQuestion<Q extends Question>(q: Q, seed: number): Q {
  const order = shuffled(q.options.map((_, i) => i), seed);
  return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

/* ------------------------------------------------------------------ */
/* The final exam                                                      */
/* ------------------------------------------------------------------ */

/**
 * Draw the exam: every round of the bank represented in proportion to its
 * size, the questions and their options shuffled by `seed`.
 */
export function buildExam(seed: number, size: number = EXAM.questions): BankQuestion[] {
  const rounds = [...new Set(BANK.map((q) => q.round))];
  const picked: BankQuestion[] = [];
  const quotas = rounds.map((round) => {
    const pool = BANK.filter((q) => q.round === round);
    return { round, pool, quota: Math.floor((pool.length / BANK.length) * size) };
  });
  // Hand out what rounding left over to the largest rounds first.
  let left = size - quotas.reduce((n, q) => n + q.quota, 0);
  for (const q of [...quotas].sort((a, b) => b.pool.length - a.pool.length)) {
    if (left <= 0) break;
    q.quota += 1;
    left -= 1;
  }
  quotas.forEach(({ round, pool, quota }) => {
    picked.push(...shuffled(pool, seed ^ seedOf(round)).slice(0, quota));
  });
  return shuffled(picked, seed).map((q, i) => shuffleQuestion(q, seed + i + 1));
}

export function scoreExam(questions: Question[], picked: number[]) {
  const correct = questions.filter((q, i) => picked[i] === q.answer).length;
  const percent = Math.round((correct / questions.length) * 100);
  return { correct, total: questions.length, percent, passed: percent >= EXAM.passPercent };
}

export function recordExam(p: Progress, percent: number, now: string): Progress {
  return {
    ...p,
    exam: {
      best: Math.max(p.exam.best, percent),
      tries: p.exam.tries + 1,
      passedAt: p.exam.passedAt ?? (percent >= EXAM.passPercent ? now : undefined),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Certificate of completion                                           */
/* ------------------------------------------------------------------ */

export const CERTIFICATE_SCHEMA = "noshashi.academy-certificate/1";

/**
 * What the certificate states, and nothing else. It is a record of a
 * completed self-paced course. It is not a licence, an accreditation, a
 * regulatory qualification or an offer of employment, and it says so.
 */
export type CertificateRecord = {
  schema: string;
  course: string;
  name: string;
  completed_on: string;
  lessons_passed: number;
  lessons_total: number;
  exam_percent: number;
  labs_completed: number;
  labs_total: number;
};

export function eligible(p: Progress) {
  const lessons = overall(p);
  const missing = LESSONS.filter((l) => !lessonPassed(p, l.id)).map((l) => l.id);
  return { ok: missing.length === 0 && !!p.exam.passedAt, missing, examPassed: !!p.exam.passedAt, lessons };
}

export function certificateRecord(
  name: string,
  p: Progress,
  labs: { done: number; total: number },
  completedOn: string
): CertificateRecord {
  return {
    schema: CERTIFICATE_SCHEMA,
    course: COURSE_VERSION,
    name: name.trim().replace(/\s+/g, " "),
    completed_on: completedOn,
    lessons_passed: overall(p).passed,
    lessons_total: LESSONS.length,
    exam_percent: p.exam.best,
    labs_completed: labs.done,
    labs_total: labs.total,
  };
}

/** Canonical JSON: keys sorted, no whitespace, so the same record always hashes the same. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function certificateCode(record: CertificateRecord): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(record));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** The code people read aloud or type: the first 16 hex characters in groups of four. */
export const shortCode = (code: string) => code.slice(0, 16).match(/.{4}/g)!.join("-");

/** A link that carries the record, so the website can recompute the code with no server. */
export function verifyLink(record: CertificateRecord, base = "https://www.noshashi.app"): string {
  const json = canonical(record);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${base}/academy/certificate/#${b64}`;
}

export function recordFromLink(fragment: string): CertificateRecord | null {
  try {
    const s = fragment.replace(/^#/, "").replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(s + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const r = JSON.parse(new TextDecoder().decode(bytes)) as CertificateRecord;
    return r.schema === CERTIFICATE_SCHEMA ? r : null;
  } catch {
    return null;
  }
}
