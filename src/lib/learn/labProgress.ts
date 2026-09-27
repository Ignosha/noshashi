/**
 * Lab progress and the review deck.
 *
 * Finishing a lab step puts its question into a deck, and the deck brings
 * it back on a widening schedule: a day later, then three days, a week,
 * sixteen days, five weeks. A right answer moves the card up a box and
 * pushes it further out; a wrong one sends it back to box 1 for tomorrow.
 * That is the Leitner system, and the reason it works is that each review
 * lands close to the point of forgetting, which is when recalling something
 * does the most to keep it.
 *
 * Everything here is pure and works on plain data, so the scene can store
 * it with useSetting and the tests can drive it with fixed clocks. Stored
 * progress is sanitised on the way in: a hand-edited or older settings
 * file must never be able to break the Learn screen.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Days until the next review for a card that has just reached each box (index 1..5). */
export const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35] as const;
export const TOP_BOX = 5;
/** A card at this box or higher counts as retained. */
export const RETAINED_BOX = 3;

export type Card = {
  box: number;
  /** When it is next due, epoch milliseconds. */
  due: number;
  reviews: number;
  lapses: number;
};

export type LabProgress = {
  v: 1;
  /** Step key ("lab/step") → when it was finished, epoch milliseconds. */
  done: Record<string, number>;
  cards: Record<string, Card>;
};

export const EMPTY_PROGRESS: LabProgress = { v: 1, done: {}, cards: {} };

export const stepKey = (labId: string, stepId: string) => `${labId}/${stepId}`;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Whatever was stored, return well-formed progress. Unknown or broken entries are dropped. */
export function sanitizeProgress(raw: unknown): LabProgress {
  if (!isRecord(raw)) return EMPTY_PROGRESS;
  const done: Record<string, number> = {};
  if (isRecord(raw.done)) {
    for (const [key, at] of Object.entries(raw.done)) if (finite(at)) done[key] = at;
  }
  const cards: Record<string, Card> = {};
  if (isRecord(raw.cards)) {
    for (const [key, c] of Object.entries(raw.cards)) {
      if (!isRecord(c) || !finite(c.box) || !finite(c.due)) continue;
      cards[key] = {
        box: Math.min(TOP_BOX, Math.max(1, Math.round(c.box))),
        due: c.due,
        reviews: finite(c.reviews) ? Math.max(0, Math.round(c.reviews)) : 0,
        lapses: finite(c.lapses) ? Math.max(0, Math.round(c.lapses)) : 0,
      };
    }
  }
  return { v: 1, done, cards };
}

const dueFor = (box: number, now: number) => now + INTERVAL_DAYS[box] * DAY_MS;

/**
 * A step answered correctly for the first time: mark it done and deal its
 * question into the deck, due tomorrow. Finishing it again changes nothing.
 */
export function completeStep(progress: LabProgress, key: string, now: number): LabProgress {
  if (progress.done[key] !== undefined) return progress;
  return {
    ...progress,
    done: { ...progress.done, [key]: now },
    cards: progress.cards[key] ? progress.cards : { ...progress.cards, [key]: { box: 1, due: dueFor(1, now), reviews: 0, lapses: 0 } },
  };
}

/** A review answered: up a box and further out when right, back to box 1 when wrong. */
export function recordReview(progress: LabProgress, key: string, correct: boolean, now: number): LabProgress {
  const card = progress.cards[key] ?? { box: 1, due: now, reviews: 0, lapses: 0 };
  const box = correct ? Math.min(TOP_BOX, card.box + 1) : 1;
  return {
    ...progress,
    cards: {
      ...progress.cards,
      [key]: { box, due: dueFor(box, now), reviews: card.reviews + 1, lapses: card.lapses + (correct ? 0 : 1) },
    },
  };
}

/** Cards due now, oldest-due first. Only keys still in `known` count, so a removed step never lingers. */
export function dueKeys(progress: LabProgress, now: number, known: ReadonlySet<string>): string[] {
  return Object.entries(progress.cards)
    .filter(([key, card]) => known.has(key) && card.due <= now)
    .sort((a, b) => a[1].due - b[1].due || a[0].localeCompare(b[0]))
    .map(([key]) => key);
}

/** When the next card falls due, if none is due now. */
export function nextDue(progress: LabProgress, known: ReadonlySet<string>): number | null {
  const dues = Object.entries(progress.cards)
    .filter(([key]) => known.has(key))
    .map(([, card]) => card.due);
  return dues.length ? Math.min(...dues) : null;
}

export type LabStatus = { done: number; total: number; complete: boolean; /** First unfinished step, or total when complete. */ next: number };

export function labStatus(lab: { id: string; steps: Array<{ id: string }> }, progress: LabProgress): LabStatus {
  const flags = lab.steps.map((s) => progress.done[stepKey(lab.id, s.id)] !== undefined);
  const done = flags.filter(Boolean).length;
  const next = flags.indexOf(false);
  return { done, total: lab.steps.length, complete: done === lab.steps.length, next: next === -1 ? lab.steps.length : next };
}

/** How much of the deck has stuck: cards in play, and those at the retained box or above. */
export function retention(progress: LabProgress, known: ReadonlySet<string>): { cards: number; retained: number; mastered: number } {
  const cards = Object.entries(progress.cards).filter(([key]) => known.has(key)).map(([, c]) => c);
  return {
    cards: cards.length,
    retained: cards.filter((c) => c.box >= RETAINED_BOX).length,
    mastered: cards.filter((c) => c.box >= TOP_BOX).length,
  };
}

/**
 * The options in a stable but varied order, so a review cannot be passed by
 * remembering "it was the first one". The order depends only on `seed`,
 * which the caller changes from one review to the next.
 */
export function shuffled(options: string[], answer: number, seed: string): { options: string[]; answer: number } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order.map((i) => options[i]), answer: order.indexOf(answer) };
}

/** "tomorrow", "in 3 days", "now". */
export function dueLabel(due: number, now: number): string {
  const days = Math.ceil((due - now) / DAY_MS);
  if (days <= 0) return "now";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
