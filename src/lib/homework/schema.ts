import { z } from "zod";

export const HOMEWORK_MODES = ["hint", "detailed", "simple"] as const;
export type HomeworkMode = (typeof HOMEWORK_MODES)[number];

/** A machine-checkable claim the model makes about its answer. We run it; the model can't. */
export const checkSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("substitute"),
    /** An equation in the problem's variables, e.g. "2*x + 4 = 10". */
    equation: z.string().min(3).max(240),
    /** The claimed solution, e.g. { "x": 3 }. */
    values: z.record(z.string().regex(/^[A-Za-z]\w{0,11}$/), z.number()),
  }),
  z.object({
    kind: z.literal("evaluate"),
    /** A numeric expression whose value is the answer, e.g. "sqrt(3^2 + 4^2)". */
    expression: z.string().min(1).max(240),
    expected: z.number(),
  }),
]);
export type Check = z.infer<typeof checkSchema>;

export const homeworkSolutionSchema = z.object({
  subject: z.string().max(40).default("General"),
  topic: z.string().max(80).default(""),
  restatement: z.string().min(1).max(1200),
  given: z.array(z.string().max(300)).max(12).default([]),
  method: z.string().max(1500).default(""),
  hint: z.string().max(800).default(""),
  steps: z
    .array(
      z.object({
        title: z.string().max(120),
        explanation: z.string().max(2500),
        work: z.string().max(1200).optional(),
      }),
    )
    .max(14)
    .default([]),
  finalAnswer: z.string().max(1500),
  verifyHow: z.string().max(1200).default(""),
  checks: z.array(checkSchema).max(4).default([]),
  practice: z.object({ question: z.string().max(800), answer: z.string().max(800) }).optional(),
  /** The model's own uncertainty, surfaced to the student. */
  caveat: z.string().max(400).optional(),
});
export type HomeworkSolution = z.infer<typeof homeworkSolutionSchema>;

export type Verification =
  | { status: "verified"; method: string; details: string[] }
  | { status: "failed"; method: string; details: string[] }
  | { status: "unverified"; reason: string };
