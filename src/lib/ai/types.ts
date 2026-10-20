export type Role = "user" | "assistant";

export type ContentPart =
  | { type: "text"; text: string }
  /** Base64 data URL (data:image/png;base64,...). Only sent to vision-capable models. */
  | { type: "image"; dataUrl: string };

export interface ChatMessage {
  role: Role;
  content: string | ContentPart[];
}

export interface GenerateRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider for a single JSON object when it supports a JSON mode. */
  json?: boolean;
  /** Route to the configured vision model (required when messages contain images). */
  vision?: boolean;
  /** Reasoning budget for reasoning models that accept one (ignored elsewhere). */
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}

export type StreamChunk =
  | { type: "text"; text: string }
  /** The model is reasoning; content is not exposed. */
  | { type: "thinking" }
  | { type: "done"; finishReason: "stop" | "length" | "other" };

export interface AIProvider {
  readonly id: ProviderId;
  readonly model: string;
  readonly visionModel: string | null;
  stream(req: GenerateRequest): AsyncGenerator<StreamChunk>;
}

export type ProviderId = "groq" | "openai" | "openrouter" | "anthropic" | "ollama" | "openai-compatible";

export function hasImages(messages: ChatMessage[]): boolean {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image"));
}

export function textOf(content: ChatMessage["content"]): string {
  return typeof content === "string"
    ? content
    : content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
}
