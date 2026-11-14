import data from "./retention-bank.json";
import { LESSONS, seedOf, type Progress, type Question } from "./academy";
export const CONTENT_VERSION = data.version;
export const TOPICS = {
  ledger: "Ledger basics",
  authority: "Account authority & security",
  issuer: "Issuer controls",
  payment: "Payments & invoices",
  liquidity: "Funded liquidity",
  policy: "NOSHASHI policy & evidence",
} as const;
export type Topic = keyof typeof TOPICS;
export type Concept = {
  id: string;
  lesson: string;
  title: string;
  topic: Topic;
  lab: string | null;
};
export type RecallQuestion = Question & {
  id: string;
  concept: string;
  topic: Topic;
  lesson: string;
  evidence?: string[][];
  wrongWhy: (string | null)[];
};
export const CONCEPTS = data.concepts as Concept[];
export const RECALL_BANK = data.questions as RecallQuestion[];
export const DAY = 86400000;
export const INTERVALS = [1, 3, 7, 21] as const;
export type RecallState = {
  introducedAt: number;
  dueAt: number;
  stage: number;
  attempts: number;
  correct: number;
  lastVariant: string | null;
  lastCorrect: boolean | null;
  laterAttempts: number;
  laterCorrect: number;
};
export type ReviewEvent = {
  concept: string;
  variant: string;
  at: number;
  correct: boolean;
  later: boolean;
};
export type Retention = {
  v: 1;
  concepts: Record<string, RecallState>;
  history: ReviewEvent[];
};
export const EMPTY_RETENTION: Retention = { v: 1, concepts: {}, history: [] };
const known = new Set(CONCEPTS.map((c) => c.id));
export function parseRetention(value: unknown): Retention {
  const raw = value as Partial<Retention> | null;
  const concepts: Retention["concepts"] = {};
  if (raw?.v !== 1 || !raw.concepts || typeof raw.concepts !== "object")
    return { v: 1, concepts, history: [] };
  for (const id of Object.keys(raw.concepts)) {
    const c = raw.concepts[id];
    if (
      !/^[a-z0-9-]{1,80}$/.test(id) ||
      !c ||
      ![
        c.introducedAt,
        c.dueAt,
        c.stage,
        c.attempts,
        c.correct,
        c.laterAttempts,
        c.laterCorrect,
      ].every(Number.isSafeInteger) ||
      c.introducedAt < 0 ||
      c.dueAt < 0 ||
      c.stage < 0 ||
      c.stage > 3 ||
      c.attempts < 0 ||
      c.correct < 0 ||
      c.correct > c.attempts ||
      c.laterCorrect < 0 ||
      c.laterCorrect > c.laterAttempts ||
      c.laterAttempts > c.attempts
    )
      continue;
    concepts[id] = {
      ...c,
      lastVariant: typeof c.lastVariant === "string" ? c.lastVariant : null,
      lastCorrect: typeof c.lastCorrect === "boolean" ? c.lastCorrect : null,
    };
  }
  const history = Array.isArray(raw.history)
    ? raw.history
        .filter(
          (e) =>
            e &&
            typeof e.concept === "string" &&
            /^[a-z0-9-]{1,80}$/.test(e.concept) &&
            typeof e.variant === "string" &&
            Number.isSafeInteger(e.at) &&
            e.at >= 0 &&
            e.at <= 8640000000000000 &&
            typeof e.correct === "boolean" &&
            typeof e.later === "boolean",
        )
        .slice(-400)
    : [];
  return { v: 1, concepts, history };
}
export function introduce(p: Retention, id: string, now: number): Retention {
  if (!known.has(id) || p.concepts[id]) return p;
  return {
    ...p,
    v: 1,
    concepts: {
      ...p.concepts,
      [id]: {
        introducedAt: now,
        dueAt: now + DAY,
        stage: 0,
        attempts: 0,
        correct: 0,
        lastVariant: null,
        lastCorrect: null,
        laterAttempts: 0,
        laterCorrect: 0,
      },
    },
  };
}
export function seedRetention(
  p: Retention,
  progress: Progress,
  now: number,
): Retention {
  return CONCEPTS.reduce((next, c) => {
    const old = progress.lessons[c.lesson];
    if (!old || (old.cardsSeen <= 0 && old.tries <= 0)) return next;
    const at = old.passedAt ? Date.parse(old.passedAt) : now;
    return introduce(next, c.id, Number.isFinite(at) && at <= now ? at : now);
  }, p);
}
export function recordRecall(
  p: Retention,
  q: RecallQuestion,
  picked: number,
  now: number,
): Retention {
  if (
    !Number.isInteger(picked) ||
    picked < 0 ||
    picked >= q.options.length ||
    !RECALL_BANK.some((x) => x.id === q.id)
  )
    return p;
  const base = introduce(p, q.concept, now);
  const previous = base.concepts[q.concept],
    right = picked === q.answer;
  const stage = right ? Math.min(previous.stage + 1, 3) : 0;
  const later = now - previous.introducedAt >= 7 * DAY;
  return {
    ...base,
    v: 1,
    history: [
      ...base.history,
      { concept: q.concept, variant: q.id, at: now, correct: right, later },
    ].slice(-400),
    concepts: {
      ...base.concepts,
      [q.concept]: {
        ...previous,
        stage,
        dueAt: now + INTERVALS[stage] * DAY,
        attempts: previous.attempts + 1,
        correct: previous.correct + Number(right),
        lastVariant: q.id,
        lastCorrect: right,
        laterAttempts: previous.laterAttempts + Number(later),
        laterCorrect: previous.laterCorrect + Number(later && right),
      },
    },
  };
}
/** A lesson/practice miss schedules recall without pretending it was a later review attempt. */
export function scheduleMiss(p: Retention, id: string, now: number): Retention {
  const base = introduce(p, id, now);
  if (!base.concepts[id]) return p;
  return {
    ...base,
    v: 1,
    concepts: {
      ...base.concepts,
      [id]: {
        ...base.concepts[id],
        stage: 0,
        dueAt: now + DAY,
        lastCorrect: false,
      },
    },
  };
}
export const dueConcepts = (p: Retention, now: number) =>
  CONCEPTS.filter((c) => p.concepts[c.id]?.dueAt <= now).sort(
    (a, b) => p.concepts[a.id].dueAt - p.concepts[b.id].dueAt,
  );
export function reviewQuestions(
  p: Retention,
  now: number,
  limit = 5,
): RecallQuestion[] {
  // Round-robin topic mixing; only introduced, due concepts enter a review.
  const due = dueConcepts(p, now);
  const mixed: Concept[] = [];
  const queues = Object.keys(TOPICS).map((topic) =>
    due.filter((c) => c.topic === topic),
  );
  while (queues.some((q) => q.length))
    for (const q of queues) {
      const c = q.shift();
      if (c) mixed.push(c);
    }
  return mixed.slice(0, limit).map((c) => {
    const pool = RECALL_BANK.filter((q) => q.concept === c.id);
    const prev = p.concepts[c.id].lastVariant;
    return pool[(pool.findIndex((q) => q.id === prev) + 1) % pool.length];
  });
}
function rotate<T>(items: T[], seed: number): T[] {
  if (!items.length) return [];
  const offset = (seed >>> 0) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}
export function buildPractice(seed: number, only?: Topic[]): RecallQuestion[] {
  const topics = only?.length
    ? (Object.keys(TOPICS).filter((t) => only.includes(t as Topic)) as Topic[])
    : (Object.keys(TOPICS) as Topic[]);
  const chosen: RecallQuestion[] = [];
  for (const topic of topics) {
    const pool = RECALL_BANK.filter((q) => q.topic === topic);
    const quota = only?.length
      ? Math.min(pool.length, Math.ceil(25 / topics.length))
      : topic === "payment"
        ? 5
        : 4;
    // Distinct concepts before second variants, with deterministic retake rotation.
    const concepts = rotate(
      CONCEPTS.filter((c) => c.topic === topic),
      seedOf(topic) ^ seed,
    );
    const rounds = concepts.map((c) =>
      rotate(
        pool.filter((q) => q.concept === c.id),
        seed,
      ),
    );
    const selected: RecallQuestion[] = [];
    while (selected.length < quota && rounds.some((r) => r.length))
      for (const r of rounds) {
        const q = r.shift();
        if (q && selected.length < quota) selected.push(q);
      }
    chosen.push(...selected);
  }
  return rotate(chosen, seed)
    .slice(0, 25)
    .map((q) => {
      const options = q.options.map((text, i) => ({
        text,
        why: q.wrongWhy[i],
        correct: i === q.answer,
      }));
      const order = rotate(options, seedOf(q.id) ^ seed);
      return {
        ...q,
        options: order.map((o) => o.text),
        wrongWhy: order.map((o) => o.why),
        answer: order.findIndex((o) => o.correct),
      };
    });
}
export function practiceScore(
  questions: RecallQuestion[],
  picked: Record<string, number>,
) {
  const correct = questions.filter((q) => picked[q.id] === q.answer).length;
  const percent = questions.length
    ? Math.round((correct / questions.length) * 100)
    : 0;
  const topics = Object.entries(TOPICS)
    .map(([id, label]) => {
      const qs = questions.filter((q) => q.topic === id);
      return {
        id: id as Topic,
        label,
        total: qs.length,
        correct: qs.filter((q) => picked[q.id] === q.answer).length,
      };
    })
    .filter((t) => t.total);
  return {
    correct,
    total: questions.length,
    percent,
    passed: percent >= 80,
    topics,
    missed: questions.filter((q) => picked[q.id] !== q.answer),
  };
}
export const lessonTitle = (id: string) =>
  LESSONS.find((l) => l.id === id)?.title ?? id;
