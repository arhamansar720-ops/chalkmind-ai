import type { Quiz, QuizQuestion } from "./schema";

export type AnswerValue = { type: "mcq"; choice: number | null } | { type: "short"; text: string };

export interface GradedItem {
  index: number;
  correct: boolean;
  points: number;
  max: number;
  feedback?: string;
  aiGraded: boolean;
  /** Short answers that couldn't be graded (e.g. AI unavailable) — the student self-checks. */
  pending?: boolean;
}

export interface QuizGrade {
  items: GradedItem[];
  score: number;
  total: number;
  percent: number;
  missedTopics: string[];
}

/** Deterministic grading of multiple-choice questions. */
export function gradeMcq(q: Extract<QuizQuestion, { type: "mcq" }>, choice: number | null): GradedItem & { index: -1 } {
  const correct = choice === q.answerIndex;
  return { index: -1, correct, points: correct ? 1 : 0, max: 1, aiGraded: false };
}

/**
 * Combine MCQ grades (computed here) with short-answer grades (from the AI
 * grader, or `null` when it wasn't available) into one result.
 */
export function gradeQuiz(
  quiz: Quiz,
  answers: AnswerValue[],
  shortResults: ({ points: number; feedback: string } | null)[] = [],
): QuizGrade {
  let shortIdx = 0;
  const items: GradedItem[] = quiz.questions.map((q, index) => {
    const a = answers[index];
    if (q.type === "mcq") {
      const g = gradeMcq(q, a?.type === "mcq" ? a.choice : null);
      return { ...g, index };
    }
    const r = shortResults[shortIdx++] ?? null;
    const given = a?.type === "short" ? a.text.trim() : "";
    if (!given) return { index, correct: false, points: 0, max: q.points, aiGraded: false, feedback: "No answer given." };
    if (!r) return { index, correct: false, points: 0, max: q.points, aiGraded: false, pending: true };
    const points = Math.max(0, Math.min(q.points, Math.round(r.points * 2) / 2));
    return { index, correct: points >= q.points * 0.7, points, max: q.points, feedback: r.feedback, aiGraded: true };
  });
  const graded = items.filter((i) => !i.pending);
  const score = graded.reduce((s, i) => s + i.points, 0);
  const total = graded.reduce((s, i) => s + i.max, 0);
  const missedTopics = [
    ...new Set(
      items
        .filter((i) => !i.pending && !i.correct)
        .map((i) => quiz.questions[i.index].topic?.trim())
        .filter((t): t is string => Boolean(t)),
    ),
  ];
  return { items, score, total, percent: total ? Math.round((score / total) * 100) : 0, missedTopics };
}
