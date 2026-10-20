import "server-only";
import { complete } from "./index";
import type { AIProvider, ChatMessage, ContentPart } from "./types";

// When the vision model is a different (usually smaller) model than the main
// one, images are read in a separate short call and the main model teaches
// from that transcription. That keeps the strong model doing the teaching and
// fits free tiers whose vision models allow only a small output budget.

const SYSTEM = `You transcribe images for a tutor who cannot see them.
For each image, in order, write "Image N:" then:
- every piece of text and math exactly as written (use LaTeX in $...$ for math), keeping line breaks for worked steps;
- a brief description of any diagram, graph, table or figure (labels, values, axes, what connects to what);
- if handwriting or a region is unreadable, say so — never guess.
Do not solve, explain or add anything else. At most 150 words per image.`;

/** True when images must be transcribed by a separate vision model first. */
export function needsTranscription(provider: AIProvider): boolean {
  return Boolean(provider.visionModel) && provider.visionModel !== provider.model;
}

export async function transcribeImages(provider: AIProvider, images: string[], signal?: AbortSignal): Promise<string> {
  const content: ContentPart[] = [
    ...images.map((dataUrl) => ({ type: "image" as const, dataUrl })),
    { type: "text", text: images.length > 1 ? `Transcribe these ${images.length} images.` : "Transcribe this image." },
  ];
  const { text } = await complete(provider, {
    system: SYSTEM,
    messages: [{ role: "user", content }],
    vision: true,
    temperature: 0.1,
    maxTokens: Math.min(900, 220 * images.length + 120),
    effort: "none",
    signal,
  });
  return text.trim();
}

/** Text the main model sees in place of the images. */
export function transcriptNote(count: number, transcript: string): string {
  const what = count > 1 ? `${count} images` : "an image";
  return transcript
    ? `[The student attached ${what}. A vision model transcribed ${count > 1 ? "them" : "it"} for you:\n${transcript}\n— Refer to it as "your image"; if something important is marked unreadable, ask the student to type it.]`
    : `[The student attached ${what}, but it couldn't be read. Ask them to type the problem.]`;
}

/** Replace the images in the last user message with their transcription. */
export function inlineTranscript(messages: ChatMessage[], count: number, transcript: string): ChatMessage[] {
  const out = [...messages];
  const last = out[out.length - 1];
  if (!last || last.role !== "user") return out;
  const text = typeof last.content === "string" ? last.content : last.content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");
  out[out.length - 1] = { role: "user", content: `${transcriptNote(count, transcript)}\n\n${text}` };
  return out;
}
