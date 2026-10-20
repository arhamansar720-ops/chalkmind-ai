import type { StudyRequest } from "./schema";

const DIFFICULTY = {
  intro: "introductory (first exposure; define terms, straightforward questions)",
  standard: "standard (typical class level)",
  challenging: "challenging (multi-step reasoning, application and transfer)",
};

const FORMAT_SPEC: Record<StudyRequest["format"], (n: number) => string> = {
  flashcards: (n) =>
    `{"kind":"flashcards","title":"...","cards":[{"front":"term or question","back":"concise answer or definition","topic":"sub-topic"}]} with exactly ${n} cards. Fronts are short; backs are 1-3 sentences.`,
  mcq: (n) =>
    `{"kind":"quiz","title":"...","questions":[{"type":"mcq","prompt":"...","choices":["...","...","...","..."],"answerIndex":0,"explanation":"why the answer is right and why a tempting wrong choice is wrong","topic":"sub-topic"}]} with exactly ${n} questions, 4 choices each. Vary the position of the correct answer. Wrong choices must be plausible misconceptions, not jokes.`,
  short: (n) =>
    `{"kind":"quiz","title":"...","questions":[{"type":"short","prompt":"...","sampleAnswer":"a model answer","rubric":"what a full-credit answer must include","explanation":"...","points":2,"topic":"sub-topic"}]} with exactly ${n} questions.`,
  exam: (n) =>
    `{"kind":"quiz","title":"Practice exam: ...","questions":[{"type":"mcq","prompt":"...","choices":["...","...","...","..."],"answerIndex":0,"explanation":"...","topic":"sub-topic"},{"type":"short","prompt":"...","sampleAnswer":"...","rubric":"...","explanation":"...","points":3,"topic":"sub-topic"}]} with exactly ${n} questions: about two-thirds "mcq" and one-third "short" (points 2-4), ordered from easier to harder. Every question uses the field "prompt" for its text.`,
  guide: () =>
    `{"kind":"guide","title":"...","markdown":"..."} — a study guide in Markdown: ## sections for each main idea, key definitions in bold, a worked example where relevant, common mistakes, and a short self-test at the end.`,
  terms: (n) =>
    `{"kind":"guide","title":"Key terms: ...","markdown":"..."} — a Markdown table with columns | Term | Meaning | Example | containing ${n} important terms, followed by a short paragraph on how the terms connect.`,
  summary: () =>
    `{"kind":"guide","title":"Summary: ...","markdown":"..."} — a concise Markdown summary: a one-paragraph overview, then ## sections with bullet points for the main ideas, and a final "Key takeaways" list.`,
  examples: (n) =>
    `{"kind":"guide","title":"Worked examples: ...","markdown":"..."} — ${Math.min(n, 6)} worked examples in Markdown, each with ### Problem, ### Solution (numbered steps with reasoning) and ### Check.`,
};

export function studySystemPrompt(req: StudyRequest): string {
  return `You create accurate study materials for students. Reply with ONE JSON object only.

Format:
${FORMAT_SPEC[req.format](req.count)}

Rules:
- Subject: ${req.subject}. Difficulty: ${DIFFICULTY[req.difficulty]}.
- Use Markdown in text; write math as $...$ (inline) or $$...$$ (display). Escape backslashes correctly for JSON.
- Be factually careful. If source material is provided, base everything on it and don't add claims it doesn't support.
- Tag each item with a short "topic" (the sub-topic it tests) when the format has that field.${req.focus.length ? `\n- Give extra emphasis to: ${req.focus.join("; ")}.` : ""}`;
}

export function studyUserPrompt(req: StudyRequest): string {
  const parts: string[] = [];
  if (req.topic.trim()) parts.push(`Topic: ${req.topic.trim()}`);
  if (req.sourceText.trim()) parts.push(`Source material${req.sourceLabel ? ` (${req.sourceLabel})` : ""}:\n"""${req.sourceText.trim()}"""`);
  return parts.join("\n\n") || "General review";
}

export function gradeSystemPrompt(subject: string): string {
  return `You grade students' short written answers fairly and kindly. Subject: ${subject}.
For each item, compare the student's answer with the sample answer and rubric. Award partial credit for partially correct reasoning; ignore spelling and grammar unless meaning is unclear. Do not reward answers that merely repeat the question.
Reply with ONE JSON object: {"results":[{"points": <number between 0 and that item's max points, halves allowed>, "feedback":"1-2 sentences: what was right and what was missing", "misconception":"the specific misunderstanding, only if there clearly is one"}]} with one result per item, in order.`;
}
