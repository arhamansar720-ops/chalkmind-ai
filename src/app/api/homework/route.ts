import { z } from "zod";
import { getProvider } from "@/lib/ai";
import { generateStructured } from "@/lib/ai/structured";
import type { ContentPart } from "@/lib/ai/types";
import { homeworkSystemPrompt } from "@/lib/homework/prompt";
import { HOMEWORK_MODES, homeworkSolutionSchema } from "@/lib/homework/schema";
import { verifySolution } from "@/lib/homework/verify";
import { errorResponse, guardAIRequest, HttpError } from "@/lib/server/http";

export const maxDuration = 60;

const requestSchema = z.object({
  question: z.string().max(8000).default(""),
  /** Text extracted from an uploaded document. */
  attachmentText: z.string().max(20_000).default(""),
  attachmentName: z.string().max(120).default(""),
  subject: z.string().max(40).optional(),
  mode: z.enum(HOMEWORK_MODES).default("detailed"),
  image: z
    .string()
    .max(5_600_000)
    .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/i)
    .optional(),
});

/** POST /api/homework — structured, step-by-step solution plus an independent check where possible. */
export async function POST(req: Request) {
  try {
    const { input } = await guardAIRequest(req, requestSchema, { maxBytes: 7 * 1024 * 1024 });
    if (!input.question.trim() && !input.image && !input.attachmentText.trim()) {
      throw new HttpError(400, "bad_request", "Type a question, or attach an image or document.");
    }
    const provider = getProvider();

    const text = [
      input.question.trim() && `Question:\n${input.question.trim()}`,
      input.attachmentText.trim() && `Attached document (${input.attachmentName || "upload"}):\n"""${input.attachmentText.trim()}"""`,
      input.image && !input.question.trim() && "The problem is in the attached image. Read it carefully first.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const content: ContentPart[] = input.image
      ? [{ type: "image", dataUrl: input.image }, { type: "text", text }]
      : [{ type: "text", text }];

    const solution = await generateStructured(provider, homeworkSolutionSchema, {
      system: homeworkSystemPrompt(input.mode, input.subject),
      messages: [{ role: "user", content }],
      temperature: 0.2,
      maxTokens: 4000,
      effort: "medium",
      signal: req.signal,
    });
    const verification = verifySolution(solution);
    return Response.json({ solution, verification, model: input.image ? provider.visionModel : provider.model });
  } catch (err) {
    return errorResponse(err);
  }
}
