import { z } from "zod";
import { validateBoardActions, type BoardAction } from "../board/schema";

/* ---------------------------------------------------------------- request */

export const TUTOR_MODES = ["explain", "hint", "simpler", "socratic"] as const;
export type TutorMode = (typeof TUTOR_MODES)[number];

export const SUBJECTS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "History",
  "English",
  "Geography",
  "Computer Science",
  "Economics",
  "General",
] as const;

const MAX_IMAGE_CHARS = 5_600_000; // ≈ 4 MB of base64, across all images
export const MAX_IMAGES = 4;
const imageDataUrl = z
  .string()
  .max(MAX_IMAGE_CHARS)
  .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/i, "image must be a base64 PNG, JPEG, WEBP or GIF data URL");

export const tutorRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(12_000),
      }),
    )
    .min(1)
    .max(40),
  /** What the tutor has already drawn (ids it can refer to). */
  board: z
    .array(z.object({ id: z.string().max(80), kind: z.string().max(30), summary: z.string().max(120) }))
    .max(120)
    .default([]),
  mode: z.enum(TUTOR_MODES).default("explain"),
  subject: z.string().max(40).optional(),
  profile: z
    .object({
      style: z.enum(["balanced", "concise", "detailed", "visual", "step-by-step"]).default("balanced"),
      level: z.string().max(40).optional(),
      reviewTopics: z.array(z.string().max(80)).max(8).default([]),
    })
    .optional(),
  excerpts: z
    .array(
      z.object({
        source: z.string().max(120),
        page: z.number().int().positive().optional(),
        unit: z.literal("slide").optional(),
        text: z.string().max(2000),
      }),
    )
    .max(8)
    .default([]),
  /** Optional image attached to the latest user message (legacy single-image field). */
  image: imageDataUrl.optional(),
  /** Images attached to the latest user message. */
  images: z.array(imageDataUrl).max(MAX_IMAGES).default([]),
}).refine((r) => (r.image?.length ?? 0) + r.images.reduce((n, i) => n + i.length, 0) <= MAX_IMAGE_CHARS, {
  message: "Attached images are too large in total. Attach fewer or smaller images.",
  path: ["images"],
});

/** All images on the latest user message (legacy `image` first). */
export function requestImages(r: Pick<TutorRequest, "image" | "images">): string[] {
  return [...(r.image ? [r.image] : []), ...r.images].slice(0, MAX_IMAGES);
}
export type TutorRequest = z.infer<typeof tutorRequestSchema>;

/* ------------------------------------------------------- model output lines */

const modelSay = z.object({ t: z.literal("say"), text: z.string().min(1).max(4000) });
const modelBoard = z.object({ t: z.literal("board"), actions: z.array(z.unknown()).max(40) });
const modelFollowups = z.object({ t: z.literal("followups"), items: z.array(z.string().min(1).max(140)).max(4) });
const modelTitle = z.object({ t: z.literal("title"), text: z.string().min(1).max(80), subject: z.string().max(40).optional() });
const modelSignal = z.object({
  t: z.literal("signal"),
  kind: z.enum(["struggle", "misconception", "mastered"]),
  topic: z.string().min(1).max(80),
  note: z.string().max(200).optional(),
});
const modelCheck = z.object({ t: z.literal("check"), question: z.string().min(1).max(300) });
const modelLine = z.discriminatedUnion("t", [modelSay, modelBoard, modelFollowups, modelTitle, modelSignal, modelCheck]);

/* ------------------------------------------------------ server → browser */

export type TutorEvent =
  | { type: "meta"; provider: string; model: string }
  | { type: "thinking" }
  | { type: "title"; title: string; subject?: string }
  | { type: "say"; text: string }
  | { type: "board"; actions: BoardAction[]; rejected: { type: string; reason: string }[] }
  | { type: "followups"; items: string[] }
  /** Pause point: the lesson waits until the student says whether they follow. */
  | { type: "check"; question: string }
  | { type: "signal"; kind: "struggle" | "misconception" | "mastered"; topic: string; note?: string }
  | { type: "notice"; message: string }
  | { type: "error"; code: string; message: string; hint?: string }
  | { type: "done"; truncated: boolean };

/**
 * Validate one object the model emitted and convert it to browser events.
 * Unknown shapes are reported, not passed through. Tolerates a few common
 * model deviations (e.g. `type` instead of `t`, a wrapping {steps:[...]}).
 */
export function modelObjectToEvents(raw: unknown): TutorEvent[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.steps)) {
    return obj.steps.flatMap((s) => modelObjectToEvents(s)).concat(
      Array.isArray(obj.followups) ? modelObjectToEvents({ t: "followups", items: obj.followups }) : [],
    );
  }
  // {"say": "...", "board": [...]} step shape
  if (obj.t === undefined && obj.type === undefined && (typeof obj.say === "string" || Array.isArray(obj.board))) {
    const out: TutorEvent[] = [];
    if (typeof obj.say === "string") out.push(...modelObjectToEvents({ t: "say", text: obj.say }));
    if (Array.isArray(obj.board)) out.push(...modelObjectToEvents({ t: "board", actions: obj.board }));
    return out;
  }
  const normalized = obj.t === undefined && typeof obj.type === "string" ? { ...obj, t: obj.type } : obj;

  const parsed = modelLine.safeParse(normalized);
  if (!parsed.success) {
    // A bare board action outside a "board" line.
    if (typeof obj.type === "string" && obj.type.startsWith("add_")) {
      return modelObjectToEvents({ t: "board", actions: [obj] });
    }
    return [{ type: "notice", message: "Skipped a malformed part of the tutor's reply." }];
  }
  const line = parsed.data;
  switch (line.t) {
    case "say":
      return [{ type: "say", text: line.text }];
    case "board": {
      const { actions, rejected } = validateBoardActions(line.actions);
      return [{ type: "board", actions, rejected: rejected.map(({ type, reason }) => ({ type, reason })) }];
    }
    case "followups":
      return [{ type: "followups", items: line.items }];
    case "title":
      return [{ type: "title", title: line.text, subject: line.subject }];
    case "signal":
      return [{ type: "signal", kind: line.kind, topic: line.topic, note: line.note }];
    case "check":
      return [{ type: "check", question: line.question }];
  }
}

export const tutorEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("meta"), provider: z.string(), model: z.string() }),
  z.object({ type: z.literal("thinking") }),
  z.object({ type: z.literal("title"), title: z.string(), subject: z.string().optional() }),
  z.object({ type: z.literal("say"), text: z.string() }),
  z.object({
    type: z.literal("board"),
    actions: z.array(z.unknown()),
    rejected: z.array(z.object({ type: z.string(), reason: z.string() })),
  }),
  z.object({ type: z.literal("followups"), items: z.array(z.string()) }),
  z.object({ type: z.literal("check"), question: z.string() }),
  z.object({ type: z.literal("signal"), kind: z.enum(["struggle", "misconception", "mastered"]), topic: z.string(), note: z.string().optional() }),
  z.object({ type: z.literal("notice"), message: z.string() }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string(), hint: z.string().optional() }),
  z.object({ type: z.literal("done"), truncated: z.boolean() }),
]);

/** Browser-side parse of one NDJSON event line. Board actions are re-validated (defence in depth). */
export function parseTutorEvent(line: string): TutorEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }
  const parsed = tutorEventSchema.safeParse(json);
  if (!parsed.success) return null;
  const ev = parsed.data;
  if (ev.type === "board") {
    const { actions, rejected } = validateBoardActions(ev.actions);
    return { type: "board", actions, rejected: [...ev.rejected, ...rejected.map(({ type, reason }) => ({ type, reason }))] };
  }
  return ev as TutorEvent;
}
