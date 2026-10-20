import { getProvider } from "@/lib/ai";
import { generateStructured } from "@/lib/ai/structured";
import { errorResponse, guardAIRequest, HttpError } from "@/lib/server/http";
import { gradeSystemPrompt } from "@/lib/study/prompt";
import { gradeRequestSchema, gradeResultSchema } from "@/lib/study/schema";

export const maxDuration = 60;

/** POST /api/grade — AI grading for short written answers (multiple choice is graded in the browser). */
export async function POST(req: Request) {
  try {
    const { input } = await guardAIRequest(req, gradeRequestSchema, { maxBytes: 120 * 1024 });
    const provider = getProvider();
    const items = input.items
      .map(
        (it, i) =>
          `Item ${i + 1} (max ${it.points} points)\nQuestion: ${it.prompt}\nSample answer: ${it.sampleAnswer}\nRubric: ${it.rubric || "(none)"}\nStudent's answer: """${it.answer || "(blank)"}"""`,
      )
      .join("\n\n");
    const graded = await generateStructured(provider, gradeResultSchema, {
      system: gradeSystemPrompt(input.subject),
      messages: [{ role: "user", content: items }],
      temperature: 0,
      maxTokens: 2500,
      effort: "low",
      signal: req.signal,
    });
    if (graded.results.length !== input.items.length) {
      throw new HttpError(502, "bad_response", "The grader returned the wrong number of results. Please try again.");
    }
    const results = graded.results.map((r, i) => ({ ...r, points: Math.min(r.points, input.items[i].points) }));
    return Response.json({ results, model: provider.model });
  } catch (err) {
    return errorResponse(err);
  }
}
