import { getProvider } from "@/lib/ai";
import { generateStructured } from "@/lib/ai/structured";
import { errorResponse, guardAIRequest, HttpError } from "@/lib/server/http";
import { studySystemPrompt, studyUserPrompt } from "@/lib/study/prompt";
import { STUDY_FORMATS, studyContentSchema, studyRequestSchema } from "@/lib/study/schema";

export const maxDuration = 60;

/** POST /api/study — generate one study-material format from a topic, notes or document text. */
export async function POST(req: Request) {
  try {
    const { input } = await guardAIRequest(req, studyRequestSchema, { maxBytes: 200 * 1024 });
    if (!input.topic.trim() && !input.sourceText.trim()) {
      throw new HttpError(400, "bad_request", "Enter a topic or paste some notes to study from.");
    }
    const provider = getProvider();
    const expectedKind = STUDY_FORMATS.find((f) => f.id === input.format)!.kind;
    const content = await generateStructured(provider, studyContentSchema, {
      system: studySystemPrompt(input),
      messages: [{ role: "user", content: studyUserPrompt(input) }],
      temperature: 0.5,
      maxTokens: 6000,
      effort: "low",
      signal: req.signal,
    });
    if (content.kind !== expectedKind) {
      throw new HttpError(502, "bad_response", "The AI returned a different kind of material than requested. Please try again.");
    }
    return Response.json({ content, model: provider.model });
  } catch (err) {
    return errorResponse(err);
  }
}
