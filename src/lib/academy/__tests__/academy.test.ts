import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BANK,
  EMPTY_PROGRESS,
  EXAM,
  GLOSSARY,
  LESSONS,
  LEVELS,
  buildExam,
  canonical,
  certificateCode,
  certificateRecord,
  eligible,
  nextLesson,
  parseProgress,
  recordExam,
  recordFromLink,
  recordQuiz,
  scoreExam,
  sectionOrder,
  shortCode,
  shuffleQuestion,
  verifyLink,
} from "../academy";
import { LABS } from "@/lib/learn/labs";
import { TESTNET_LAB } from "../testnetLab";
import videos from "../../../../site/learn/videos/videos.json";

/** The website's knowledge check, read from the script the page runs. */
function siteArray(name: string): unknown[] {
  const src = readFileSync("site/assets/inline/0638015dada599397a3f.js", "utf8");
  const start = src.indexOf(`var ${name} = [`) + name.length + 7;
  let depth = 0;
  let i = start;
  for (; i < src.length; i += 1) {
    if (src[i] === "[") depth += 1;
    else if (src[i] === "]" && --depth === 0) break;
  }
  return new Function(`return ${src.slice(start, i + 1)}`)() as unknown[];
}

describe("course content", () => {
  it("puts every lesson in a level and gives every level lessons", () => {
    const levels = new Set(LEVELS.map((l) => l.id));
    for (const l of LESSONS) expect(levels.has(l.level), l.id).toBe(true);
    for (const level of LEVELS) expect(LESSONS.some((l) => l.level === level.id), level.id).toBe(true);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });

  it("keeps cards short enough to read in one breath", () => {
    for (const l of LESSONS) {
      expect(l.cards.length, l.id).toBeGreaterThanOrEqual(3);
      for (const c of l.cards) expect(c.text.split(/\s+/).length, `${l.id} ${c.title}`).toBeLessThanOrEqual(60);
    }
  });

  it("gives every lesson goals, a key idea and a valid three-question check", () => {
    for (const l of LESSONS) {
      expect(l.goals.length, l.id).toBeGreaterThan(0);
      expect(l.keyIdea.length, l.id).toBeGreaterThan(10);
      expect(l.quiz.length, l.id).toBe(3);
      for (const q of l.quiz) {
        expect(new Set(q.options).size, q.question).toBe(q.options.length);
        expect(q.answer >= 0 && q.answer < q.options.length, q.question).toBe(true);
        expect(q.why.length, q.question).toBeGreaterThan(15);
      }
    }
  });

  it("defines every key word in the word list", () => {
    for (const l of LESSONS) for (const w of l.words) expect(GLOSSARY[w], `${l.id}: ${w}`).toBeTruthy();
  });

  it("links only to labs and videos that exist", () => {
    const labIds = new Set([...LABS, TESTNET_LAB].map((l) => l.id));
    const videoIds = new Set(videos.map((v) => v.id));
    for (const l of LESSONS) {
      for (const lab of l.labs) expect(labIds.has(lab), `${l.id} → ${lab}`).toBe(true);
      if (l.video) expect(videoIds.has(l.video), `${l.id} → ${l.video}`).toBe(true);
    }
  });

  it("points each lesson at a section of the website course that exists", () => {
    const page = readFileSync("site/learn/index.html", "utf8");
    for (const l of LESSONS) {
      const anchor = l.source.split("#")[1];
      if (anchor) expect(page.includes(`id="${anchor}"`), `${l.id} → ${l.source}`).toBe(true);
    }
  });
});

describe("the shared question bank and word list", () => {
  it("is the website's knowledge check, question for question", () => {
    const site = (siteArray("Q") as unknown[][]).filter((x) => x.length >= 4);
    expect(BANK.length).toBe(site.length);
    BANK.forEach((q, i) => {
      expect(q.question).toBe(site[i][0]);
      expect(q.options).toEqual(site[i][1]);
      expect(q.answer).toBe(site[i][2]);
      expect(q.why).toBe(site[i][3]);
    });
  });

  it("is the website's word list, term for term", () => {
    const site = siteArray("V") as string[][];
    expect(Object.keys(GLOSSARY).length).toBe(site.length);
    for (const [term, meaning] of site) expect(GLOSSARY[term]).toBe(meaning);
  });
});

describe("study styles", () => {
  const lesson = LESSONS.find((l) => l.video && l.labs.length)!;

  it("leads with what the learner asked for, and hides nothing", () => {
    expect(sectionOrder("watch", lesson)[0]).toBe("video");
    expect(sectionOrder("do", lesson)[0]).toBe("labs");
    expect(sectionOrder("read", lesson)[0]).toBe("cards");
    for (const style of ["watch", "listen", "read", "do", "mix"] as const) {
      expect(new Set(sectionOrder(style, lesson))).toEqual(new Set(["video", "cards", "words", "quiz", "labs"]));
    }
  });

  it("leaves out a video or labs a lesson does not have", () => {
    const bare = { video: null, labs: [] };
    expect(sectionOrder("watch", bare)).toEqual(["cards", "words", "quiz"]);
  });
});

describe("shuffling", () => {
  it("moves the answer with its option", () => {
    const q = LESSONS[0].quiz[0];
    for (let seed = 1; seed < 50; seed += 1) {
      const s = shuffleQuestion(q, seed);
      expect(s.options[s.answer]).toBe(q.options[q.answer]);
      expect([...s.options].sort()).toEqual([...q.options].sort());
    }
  });

  it("does not leave the right answer first every time", () => {
    const positions = new Set(Array.from({ length: 20 }, (_, i) => shuffleQuestion(LESSONS[0].quiz[0], i + 1).answer));
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe("progress", () => {
  const now = "2026-10-27T15:00:00.000Z";

  it("passes a lesson at two right answers and remembers the misses", () => {
    const l = LESSONS[0];
    const right = l.quiz.map((q) => q.answer);
    const twoRight = [right[0], right[1], (right[2] + 1) % l.quiz[2].options.length];
    const p = recordQuiz(EMPTY_PROGRESS, l.id, twoRight, now);
    expect(p.lessons[l.id].best).toBe(2);
    expect(p.lessons[l.id].passedAt).toBe(now);
    expect(p.missed).toEqual([`${l.id}/2`]);
    const fixed = recordQuiz(p, l.id, right, now);
    expect(fixed.missed).toEqual([]);
    expect(nextLesson(fixed)?.id).toBe(LESSONS[1].id);
  });

  it("does not pass a lesson at one right answer", () => {
    const l = LESSONS[0];
    const wrong = l.quiz.map((q) => (q.answer + 1) % q.options.length);
    wrong[0] = l.quiz[0].answer;
    expect(recordQuiz(EMPTY_PROGRESS, l.id, wrong, now).lessons[l.id].passedAt).toBeUndefined();
  });

  it("survives whatever storage hands back", () => {
    expect(parseProgress(null)).toEqual(EMPTY_PROGRESS);
    expect(parseProgress("not json")).toEqual(EMPTY_PROGRESS);
    expect(parseProgress('{"v":2}')).toEqual(EMPTY_PROGRESS);
    expect(parseProgress('{"v":1,"access":{"textSize":2}}').access.textSize).toBe(2);
  });
});

describe("the final exam", () => {
  it("draws the configured number of distinct questions from every round", () => {
    const exam = buildExam(12345);
    expect(exam.length).toBe(EXAM.questions);
    expect(new Set(exam.map((q) => q.question)).size).toBe(exam.length);
    expect(new Set(exam.map((q) => q.round))).toEqual(new Set(BANK.map((q) => q.round)));
  });

  it("is the same exam for the same seed and a different one for another", () => {
    expect(buildExam(7).map((q) => q.question)).toEqual(buildExam(7).map((q) => q.question));
    expect(buildExam(7).map((q) => q.question)).not.toEqual(buildExam(8).map((q) => q.question));
  });

  it("passes at the configured percentage", () => {
    const exam = buildExam(1);
    const right = exam.map((q) => q.answer);
    expect(scoreExam(exam, right).percent).toBe(100);
    const twenty = right.map((a, i) => (i < 20 ? a : (a + 1) % exam[i].options.length));
    expect(scoreExam(exam, twenty)).toMatchObject({ correct: 20, percent: 80, passed: true });
    const nineteen = right.map((a, i) => (i < 19 ? a : (a + 1) % exam[i].options.length));
    expect(scoreExam(exam, nineteen).passed).toBe(false);
  });
});

describe("certificate of completion", () => {
  const now = "2026-10-27T15:00:00.000Z";
  const finished = () => {
    let p = EMPTY_PROGRESS;
    for (const l of LESSONS) p = recordQuiz(p, l.id, l.quiz.map((q) => q.answer), now);
    return recordExam(p, 88, now);
  };

  it("needs every lesson and the exam", () => {
    expect(eligible(EMPTY_PROGRESS).ok).toBe(false);
    expect(eligible(recordExam(EMPTY_PROGRESS, 100, now)).ok).toBe(false);
    expect(eligible(finished()).ok).toBe(true);
  });

  it("gives the same record the same code, and any change a different one", async () => {
    const record = certificateRecord("  Ada   Lovelace ", finished(), { done: 7, total: LABS.length }, "2026-10-27");
    expect(record.name).toBe("Ada Lovelace");
    const code = await certificateCode(record);
    expect(code).toMatch(/^[0-9A-F]{64}$/);
    expect(await certificateCode({ ...record })).toBe(code);
    expect(await certificateCode({ ...record, exam_percent: 89 })).not.toBe(code);
    expect(shortCode(code)).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
  });

  it("carries its record in a link the website can read back", async () => {
    const record = certificateRecord("Zoë Müller", finished(), { done: 3, total: 18 }, "2026-10-27");
    const link = verifyLink(record);
    expect(link.startsWith("https://www.noshashi.app/academy/certificate/#")).toBe(true);
    const back = recordFromLink(link.split("#")[1]);
    expect(back).toEqual(record);
    expect(canonical(back)).toBe(canonical(record));
    expect(recordFromLink("#garbage")).toBeNull();
  });
});

describe("the testnet lab", () => {
  it("has one well-formed step per recorded testnet payment", () => {
    expect(TESTNET_LAB.steps.length).toBeGreaterThanOrEqual(5);
    for (const step of TESTNET_LAB.steps) {
      expect(new Set(step.check.options).size, step.id).toBe(step.check.options.length);
      expect(step.copy?.[0].value, step.id).toMatch(/^[0-9A-F]{64}$/);
    }
  });

  it("states exactly what the recording says each check decided", async () => {
    const { TESTNET } = await import("../testnetLab");
    expect(TESTNET.network).toBe("testnet");
    for (const c of TESTNET.cases) {
      const step = TESTNET_LAB.steps.find((s) => s.id === c.id)!;
      expect(step.lookFor).toContain(c.status);
      expect(step.lookFor).toContain(c.reason_code);
      expect(c.sources.length, c.id).toBe(2);
    }
    const status = Object.fromEntries(TESTNET.cases.map((c) => [c.id, c.status]));
    expect(status).toMatchObject({ paid: "VERIFIED", "wrong-tag": "REJECTED", underpaid: "REJECTED", overpaid: "HOLD", partial: "REJECTED" });
  });
});
