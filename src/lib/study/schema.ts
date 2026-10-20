import { z } from "zod";

export const STUDY_FORMATS = [
  { id: "flashcards", label: "Flashcards", kind: "flashcards", blurb: "Flip, rate your confidence, review the hard ones." },
  { id: "mcq", label: "Multiple-choice quiz", kind: "quiz", blurb: "Answer, submit, see explanations." },
  { id: "short", label: "Short-answer questions", kind: "quiz", blurb: "Written answers, AI-graded with feedback." },
  { id: "exam", label: "Practice exam", kind: "quiz", blurb: "A mix of multiple-choice and written questions." },
  { id: "guide", label: "Study guide", kind: "guide", blurb: "Structured notes with key ideas and examples." },
  { id: "terms", label: "Key terms", kind: "guide", blurb: "A glossary of the vocabulary that matters." },
  { id: "summary", label: "Chapter summary", kind: "guide", blurb: "The main points, condensed." },
  { id: "examples", label: "Worked examples", kind: "guide", blurb: "Step-by-step solved problems." },
] as const;

export type StudyFormatId = (typeof STUDY_FORMATS)[number]["id"];
export const STUDY_FORMAT_IDS = STUDY_FORMATS.map((f) => f.id) as [StudyFormatId, ...StudyFormatId[]];

const topic = z.string().max(80).optional();

export const flashcardsSchema = z.object({
  kind: z.literal("flashcards"),
  title: z.string().max(120),
  cards: z
    .array(
      z.preprocess(
        (c) => (c && typeof c === "object" ? { ...c, front: (c as Record<string, unknown>).front ?? (c as Record<string, unknown>).term ?? (c as Record<string, unknown>).question, back: (c as Record<string, unknown>).back ?? (c as Record<string, unknown>).definition ?? (c as Record<string, unknown>).answer } : c),
        z.object({ front: z.string().min(1).max(400), back: z.string().min(1).max(800), topic }),
      ),
    )
    .min(1)
    .max(40),
});

/**
 * Models sometimes use near-miss field names ("question", "options",
 * "answer": "B"). Map those onto the schema rather than rejecting good content.
 */
export function normalizeQuestion(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const q = { ...(raw as Record<string, unknown>) };
  if (q.prompt === undefined && typeof q.question === "string") q.prompt = q.question;
  if (q.choices === undefined && Array.isArray(q.options)) q.choices = q.options;
  if (q.type === undefined) q.type = Array.isArray(q.choices) ? "mcq" : "short";
  if (q.type === "multiple_choice" || q.type === "multiple-choice") q.type = "mcq";
  if (q.type === "short_answer" || q.type === "short-answer" || q.type === "written") q.type = "short";
  if (q.type === "mcq" && q.answerIndex === undefined && Array.isArray(q.choices)) {
    const ans = q.answer ?? q.correct ?? q.correctAnswer;
    if (typeof ans === "number") q.answerIndex = ans;
    else if (typeof ans === "string") {
      const letter = /^[A-F]$/i.test(ans.trim()) ? ans.trim().toUpperCase().charCodeAt(0) - 65 : -1;
      const byText = (q.choices as unknown[]).findIndex((c) => typeof c === "string" && c.trim() === ans.trim());
      q.answerIndex = letter >= 0 ? letter : byText;
    }
  }
  if (typeof q.answerIndex === "string" && /^\d+$/.test(q.answerIndex)) q.answerIndex = Number(q.answerIndex);
  if (q.type === "short" && q.sampleAnswer === undefined && typeof q.answer === "string") q.sampleAnswer = q.answer;
  if (typeof q.points === "string" && /^\d+$/.test(q.points)) q.points = Number(q.points);
  return q;
}

export const mcqSchema = z
  .object({
    type: z.literal("mcq"),
    prompt: z.string().min(1).max(800),
    choices: z.array(z.string().min(1).max(300)).min(2).max(6),
    answerIndex: z.number().int().min(0).max(5),
    explanation: z.string().max(1200).default(""),
    topic,
  })
  .refine((q) => q.answerIndex < q.choices.length, { message: "answerIndex out of range", path: ["answerIndex"] });

export const shortSchema = z.object({
  type: z.literal("short"),
  prompt: z.string().min(1).max(800),
  sampleAnswer: z.string().min(1).max(1200),
  rubric: z.string().max(800).default(""),
  explanation: z.string().max(1200).default(""),
  points: z.number().int().min(1).max(10).default(2),
  topic,
});

export const quizSchema = z.object({
  kind: z.literal("quiz"),
  title: z.string().max(120),
  questions: z.array(z.preprocess(normalizeQuestion, z.union([mcqSchema, shortSchema]))).min(1).max(30),
});

export const guideSchema = z.object({
  kind: z.literal("guide"),
  title: z.string().max(120),
  markdown: z.string().min(1).max(30_000),
});

export const studyContentSchema = z.discriminatedUnion("kind", [flashcardsSchema, quizSchema, guideSchema]);
export type StudyContent = z.infer<typeof studyContentSchema>;
export type Flashcards = z.infer<typeof flashcardsSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type QuizQuestion = Quiz["questions"][number];
export type Guide = z.infer<typeof guideSchema>;

export const studyRequestSchema = z.object({
  format: z.enum(STUDY_FORMAT_IDS),
  subject: z.string().max(40).default("General"),
  difficulty: z.enum(["intro", "standard", "challenging"]).default("standard"),
  count: z.number().int().min(3).max(30).default(10),
  topic: z.string().max(300).default(""),
  /** Pasted notes or document text (already trimmed client-side). */
  sourceText: z.string().max(40_000).default(""),
  sourceLabel: z.string().max(120).default(""),
  /** Topics to emphasise, e.g. from the student's review list. */
  focus: z.array(z.string().max(80)).max(8).default([]),
});
export type StudyRequest = z.infer<typeof studyRequestSchema>;

export const gradeRequestSchema = z.object({
  subject: z.string().max(40).default("General"),
  items: z
    .array(
      z.object({
        prompt: z.string().max(800),
        sampleAnswer: z.string().max(1200),
        rubric: z.string().max(800).default(""),
        points: z.number().int().min(1).max(10),
        answer: z.string().max(3000),
      }),
    )
    .min(1)
    .max(20),
});

export const gradeResultSchema = z.object({
  results: z.array(
    z.object({
      points: z.number().min(0).max(10),
      feedback: z.string().max(800),
      misconception: z.string().max(200).optional(),
    }),
  ),
});
export type GradeResult = z.infer<typeof gradeResultSchema>;
