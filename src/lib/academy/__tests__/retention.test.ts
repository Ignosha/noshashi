import { describe, it, expect } from "vitest";
import {
  CONCEPTS,
  RECALL_BANK,
  EMPTY_RETENTION,
  DAY,
  buildPractice,
  dueConcepts,
  introduce,
  parseRetention,
  practiceScore,
  recordRecall,
  reviewQuestions,
  scheduleMiss,
  seedRetention,
} from "../retention";
import { EMPTY_PROGRESS, eligible, parseProgress } from "../academy";
import { ANALYST_CASES, gradeCase } from "../analystCases";
const now = Date.UTC(2026, 10, 14),
  q = RECALL_BANK.find((q) => q.concept === "delivered-amount")!;
describe("retention without focus penalties", () => {
  it("has stable concepts for all 21 lessons and complete valid variants", () => {
    expect(CONCEPTS).toHaveLength(21);
    expect(new Set(RECALL_BANK.map((q) => q.id)).size).toBe(RECALL_BANK.length);
    for (const c of CONCEPTS) {
      const variants = RECALL_BANK.filter((q) => q.concept === c.id);
      expect(variants.length).toBeGreaterThanOrEqual(2);
      for (const q of variants) {
        expect(q.answer).toBeLessThan(q.options.length);
        expect(q.wrongWhy.length).toBe(q.options.length);
        q.wrongWhy.forEach((why, i) => {
          if (i !== q.answer) expect(why?.length).toBeGreaterThan(15);
        });
      }
    }
  });
  it("starts at one day and follows 3,7,21 days after successful recall", () => {
    let p = introduce(EMPTY_RETENTION, q.concept, now);
    expect(p.concepts[q.concept].dueAt).toBe(now + DAY);
    let t = now + DAY;
    for (const days of [3, 7, 21, 21]) {
      p = recordRecall(p, q, q.answer, t);
      expect(p.concepts[q.concept].dueAt).toBe(t + days * DAY);
      t += days * DAY;
    }
  });
  it("brings a miss back tomorrow, uses another variant and counts only first attempts at least a week later", () => {
    let p = introduce(EMPTY_RETENTION, q.concept, now);
    p = recordRecall(p, q, (q.answer + 1) % q.options.length, now + 8 * DAY);
    expect(p.concepts[q.concept]).toMatchObject({
      stage: 0,
      laterAttempts: 1,
      laterCorrect: 0,
      lastCorrect: false,
    });
    expect(p.concepts[q.concept].dueAt).toBe(now + 9 * DAY);
    const next = reviewQuestions(p, now + 9 * DAY)[0];
    expect(next.id).not.toBe(q.id);
    expect(next.concept).toBe(q.concept);
    p = recordRecall(p, next, next.answer, now + 9 * DAY);
    expect(p.concepts[q.concept].laterCorrect).toBe(1);
  });
  it("mixes only introduced due topics, limits a short session and never makes overdue work a failure", () => {
    let p = EMPTY_RETENTION;
    for (const c of CONCEPTS.slice(0, 12)) p = introduce(p, c.id, now);
    expect(reviewQuestions(p, now)).toEqual([]);
    const batch = reviewQuestions(p, now + 40 * DAY);
    expect(batch).toHaveLength(5);
    expect(new Set(batch.map((q) => q.topic)).size).toBeGreaterThan(1);
    expect(dueConcepts(p, now + 40 * DAY)).toHaveLength(12);
    expect(Object.values(p.concepts).every((c) => c.attempts === 0)).toBe(true);
  });
  it("schedules lesson/practice misses without claiming they were week-later review attempts", () => {
    const p = scheduleMiss(EMPTY_RETENTION, q.concept, now);
    expect(p.concepts[q.concept]).toMatchObject({
      attempts: 0,
      laterAttempts: 0,
      lastCorrect: false,
      dueAt: now + DAY,
    });
  });
  it("preserves course/certificate records while seeding review and tolerates corrupt local data", () => {
    const old = parseProgress(
      JSON.stringify({
        ...EMPTY_PROGRESS,
        lessons: {
          a11: {
            cardsSeen: 2,
            best: 3,
            tries: 1,
            passedAt: new Date(now).toISOString(),
          },
        },
        certificate: { record: { earned: "legacy" }, code: "keep-me" },
      }),
    );
    const saved = JSON.stringify(old);
    const before = eligible(old);
    const p = seedRetention(EMPTY_RETENTION, old, now);
    expect(p.concepts["delivered-amount"]).toBeTruthy();
    expect(JSON.stringify(old)).toBe(saved);
    expect(eligible(old)).toEqual(before);
    expect(parseRetention({ v: 9 })).toEqual(EMPTY_RETENTION);
    expect(parseRetention({ v: 1, concepts: { fake: { dueAt: 0 } } })).toEqual(
      EMPTY_RETENTION,
    );
  });
});
describe("balanced practice preparation", () => {
  it("builds 25 unique questions with all six topics and repeatable resume ordering", () => {
    for (let seed = 0; seed < 30; seed++) {
      const qs = buildPractice(seed);
      expect(qs).toHaveLength(25);
      expect(new Set(qs.map((q) => q.id)).size).toBe(25);
      expect(new Set(qs.map((q) => q.topic)).size).toBe(6);
      expect(qs.filter((q) => q.topic === "payment")).toHaveLength(5);
      expect(buildPractice(seed)).toEqual(qs);
    }
    expect(buildPractice(1)).not.toEqual(buildPractice(2));
  });
  it("keeps answers and wrong-answer explanations aligned after rotation and scores 80%", () => {
    const qs = buildPractice(84);
    const picked = Object.fromEntries(
      qs.slice(0, 20).map((q) => [q.id, q.answer]),
    );
    const score = practiceScore(qs, picked);
    expect(score).toMatchObject({
      correct: 20,
      total: 25,
      percent: 80,
      passed: true,
    });
    expect(score.missed).toHaveLength(5);
    expect(score.topics.reduce((n, t) => n + t.correct, 0)).toBe(20);
    for (const q of qs) {
      expect(q.wrongWhy[q.answer]).toBeNull();
      const canonical = RECALL_BANK.find((x) => x.id === q.id)!;
      expect(q.options[q.answer]).toBe(canonical.options[canonical.answer]);
    }
  });
  it("preserves future concept records and bounded review history during a course rollback", () => {
    const current = introduce(EMPTY_RETENTION, "delivered-amount", now);
    const future = {
      ...current,
      concepts: {
        ...current.concepts,
        "future-concept": { ...current.concepts["delivered-amount"] },
      },
      history: [
        {
          concept: "future-concept",
          variant: "future/v1",
          at: now,
          correct: true,
          later: false,
        },
      ],
    };
    const parsed = parseRetention(future);
    expect(parsed.concepts["future-concept"]).toEqual(
      future.concepts["future-concept"],
    );
    expect(parsed.history).toEqual(future.history);
    expect(
      dueConcepts(parsed, now + DAY).some((c) => c.id === "future-concept"),
    ).toBe(false);
  });
  it("offers weak-topic drills without inventing duplicate full tests", () => {
    const qs = buildPractice(14, ["liquidity"]);
    expect(qs.length).toBeLessThan(25);
    expect(qs.every((q) => q.topic === "liquidity")).toBe(true);
  });
});
describe("analyst evidence decisions", () => {
  it("cannot pass a case by navigation or verdict alone", () => {
    for (const c of ANALYST_CASES) {
      expect(gradeCase(c, [], c.answer)).toBe(false);
      expect(gradeCase(c, c.required, (c.answer + 1) % c.choices.length)).toBe(
        false,
      );
      expect(gradeCase(c, c.required, c.answer)).toBe(true);
      expect(c.hints).toHaveLength(3);
      expect(c.teachback.length).toBeGreaterThan(100);
    }
  });
});
