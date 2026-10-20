import { describe, expect, it } from "vitest";
import { verifySolution, runCheck } from "@/lib/homework/verify";
import { homeworkSolutionSchema } from "@/lib/homework/schema";
import { isSafeExpression, safeEvaluate } from "@/lib/math/safe";
import { gradeQuiz } from "@/lib/study/grading";
import { flashcardsSchema, quizSchema, studyContentSchema } from "@/lib/study/schema";
import { activeDays, quizStats, reviewTopics } from "@/lib/learning/recommend";
import type { LearningSignal, QuizAttempt } from "@/lib/store/types";

const solution = (checks: unknown[]) => homeworkSolutionSchema.parse({ restatement: "Solve", finalAnswer: "x = 3", checks });

describe("homework verification", () => {
  it("verifies by substitution", () => {
    const v = verifySolution(solution([{ kind: "substitute", equation: "2*x + 4 = 10", values: { x: 3 } }]));
    expect(v.status).toBe("verified");
  });
  it("catches wrong answers", () => {
    const v = verifySolution(solution([{ kind: "substitute", equation: "2*x + 4 = 10", values: { x: 4 } }]));
    expect(v.status).toBe("failed");
    expect(runCheck({ kind: "evaluate", expression: "sqrt(3^2+4^2)", expected: 6 }).ok).toBe(false);
  });
  it("recomputes numeric answers", () => {
    expect(runCheck({ kind: "evaluate", expression: "12^2 / (2*9.8)", expected: 7.3469 }).ok).toBe(true);
  });
  it("never claims verification without a check", () => {
    expect(verifySolution(solution([])).status).toBe("unverified");
    expect(verifySolution(solution([{ kind: "substitute", equation: "no equals sign", values: { x: 1 } }])).status).toBe("unverified");
  });
  it("blocks dangerous expressions", () => {
    for (const e of ["import({}, {override:true})", "evaluate('1+1')", "parse('x')", "createUnit('foo')"]) {
      expect(() => safeEvaluate(e), e).toThrow();
    }
    expect(isSafeExpression("x.constructor['prototype']")).toBe(false);
    expect(isSafeExpression("`rm -rf`")).toBe(false);
    expect(safeEvaluate("2^10")).toBe(1024);
  });
});

describe("quiz grading", () => {
  const quiz = quizSchema.parse({
    kind: "quiz",
    title: "t",
    questions: [
      { type: "mcq", prompt: "2+2?", choices: ["3", "4"], answerIndex: 1, topic: "addition" },
      { type: "mcq", prompt: "3*3?", choices: ["9", "6"], answerIndex: 0, topic: "multiplication" },
      { type: "short", prompt: "Why?", sampleAnswer: "Because", points: 2, topic: "reasoning" },
    ],
  });

  it("grades multiple choice deterministically and merges AI short-answer grades", () => {
    const g = gradeQuiz(quiz, [{ type: "mcq", choice: 1 }, { type: "mcq", choice: 1 }, { type: "short", text: "because" }], [{ points: 1.5, feedback: "Mostly right" }]);
    expect(g.items.map((i) => i.correct)).toEqual([true, false, true]);
    expect(g.score).toBe(2.5);
    expect(g.total).toBe(4);
    expect(g.missedTopics).toEqual(["multiplication"]);
    expect(g.items[2].aiGraded).toBe(true);
  });

  it("marks short answers pending (not wrong) when the grader is unavailable", () => {
    const g = gradeQuiz(quiz, [{ type: "mcq", choice: 1 }, { type: "mcq", choice: 0 }, { type: "short", text: "my answer" }], [null]);
    expect(g.items[2].pending).toBe(true);
    expect(g.total).toBe(2);
    expect(g.percent).toBe(100);
  });

  it("clamps AI points to the question maximum", () => {
    const g = gradeQuiz(quiz, [{ type: "mcq", choice: null }, { type: "mcq", choice: null }, { type: "short", text: "x" }], [{ points: 99, feedback: "" }]);
    expect(g.items[2].points).toBe(2);
  });
});

describe("study content schema", () => {
  it("normalizes common field-name variants", () => {
    const q = quizSchema.parse({
      kind: "quiz",
      title: "t",
      questions: [
        { type: "multiple_choice", question: "Q?", options: ["a", "b", "c"], answer: "B" },
        { question: "Explain", answer: "Model answer" },
      ],
    });
    expect(q.questions[0]).toMatchObject({ type: "mcq", prompt: "Q?", answerIndex: 1 });
    expect(q.questions[1]).toMatchObject({ type: "short", sampleAnswer: "Model answer" });
    const f = flashcardsSchema.parse({ kind: "flashcards", title: "t", cards: [{ term: "Mitosis", definition: "Cell division" }] });
    expect(f.cards[0]).toMatchObject({ front: "Mitosis", back: "Cell division" });
  });
  it("rejects out-of-range answers", () => {
    expect(studyContentSchema.safeParse({ kind: "quiz", title: "t", questions: [{ type: "mcq", prompt: "Q", choices: ["a", "b"], answerIndex: 5 }] }).success).toBe(false);
  });
});

const sig = (kind: LearningSignal["kind"], topic: string, daysAgo = 0, now = 1_000 * 86_400_000): LearningSignal => ({
  id: Math.random().toString(),
  title: topic,
  topic,
  kind,
  source: "quiz",
  createdAt: now - daysAgo * 86_400_000,
  updatedAt: now - daysAgo * 86_400_000,
});

describe("review recommendations", () => {
  const now = 1_000 * 86_400_000;
  it("ranks topics from saved signals only", () => {
    expect(reviewTopics([], now)).toEqual([]);
    const r = reviewTopics([sig("quiz_miss", "Linear equations"), sig("quiz_miss", "linear  equations"), sig("misconception", "Fractions"), sig("struggle", "Old topic", 120)], now);
    expect(r.map((t) => t.topic)).toEqual(["Linear equations", "Fractions"]);
    expect(r[0].reasons[0]).toContain("×2");
  });
  it("a later 'mastered' signal clears a topic", () => {
    const r = reviewTopics([sig("quiz_miss", "Fractions", 2), sig("mastered", "fractions", 1)], now);
    expect(r).toEqual([]);
  });
  it("computes quiz stats and active days from real records", () => {
    const att = (subject: string, score: number, total: number) => ({ subject, score, total }) as QuizAttempt;
    expect(quizStats([att("Biology", 3, 4), att("Biology", 1, 4), att("History", 2, 2)])).toEqual([
      { subject: "Biology", attempts: 2, average: 50, best: 75 },
      { subject: "History", attempts: 1, average: 100, best: 100 },
    ]);
    const d = new Date(2026, 9, 19, 10).getTime();
    expect(activeDays([d, d + 3_600_000, d - 86_400_000])).toHaveLength(2);
  });
});
