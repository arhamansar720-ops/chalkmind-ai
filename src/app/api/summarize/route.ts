import { z } from "zod";
import { complete, getProvider } from "@/lib/ai";
import { errorResponse, guardAIRequest } from "@/lib/server/http";

export const maxDuration = 30;

const schema = z.object({
  title: z.string().max(120),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(2)
    .max(30),
});

const SYSTEM = `You write a 2-3 sentence recap of a tutoring session for the tutor's own notes, so it can pick up later.
Cover: the topic, what the student now understands, and anything they still found hard (be specific: a step, a concept).
Third person ("The student…"). Plain text, no lists, under 70 words. Don't add anything that isn't in the conversation.`;

/** POST /api/summarize — short recap of a finished lesson, used as memory in later sessions. */
export async function POST(req: Request) {
  try {
    const { input } = await guardAIRequest(req, schema, { maxBytes: 160 * 1024 });
    const transcript = input.messages.map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content.slice(0, 1500)}`).join("\n\n");
    const { text } = await complete(getProvider(), {
      system: SYSTEM,
      messages: [{ role: "user", content: `Session: ${input.title}\n\n${transcript}` }],
      temperature: 0.2,
      maxTokens: 220,
      effort: "low",
      signal: req.signal,
    });
    const summary = text.replace(/\s+/g, " ").trim().slice(0, 500);
    return Response.json({ summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
