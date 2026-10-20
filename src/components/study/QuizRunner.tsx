"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { ApiError, postJSON } from "@/lib/client/api";
import { useProfile } from "@/lib/client/profile";
import { gradeQuiz, type AnswerValue, type QuizGrade } from "@/lib/study/grading";
import type { Quiz } from "@/lib/study/schema";
import { newId, store } from "@/lib/store";
import type { StudyMaterial } from "@/lib/store/types";
import { Markdown } from "@/components/Markdown";
import { Alert, Badge, Button, Card, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

export function QuizRunner({ material, quiz }: { material: StudyMaterial; quiz: Quiz }) {
  const { profile } = useProfile();
  const empty = (): AnswerValue[] => quiz.questions.map((q) => (q.type === "mcq" ? { type: "mcq", choice: null } : { type: "short", text: "" }));
  const [answers, setAnswers] = useState<AnswerValue[]>(empty);
  const [grade, setGrade] = useState<QuizGrade | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [selfMarks, setSelfMarks] = useState<Record<number, boolean>>({});

  const answered = answers.filter((a) => (a.type === "mcq" ? a.choice !== null : a.text.trim())).length;

  const set = (i: number, v: AnswerValue) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)));

  const submit = async () => {
    setGrading(true);
    setGradeError(null);
    const shortQs = quiz.questions.map((q, i) => ({ q, i })).filter(({ q }) => q.type === "short");
    let shortResults: ({ points: number; feedback: string } | null)[] = [];
    const toGrade = shortQs.filter(({ i }) => {
      const a = answers[i];
      return a.type === "short" && a.text.trim();
    });
    if (toGrade.length) {
      try {
        const res = await postJSON<{ results: { points: number; feedback: string; misconception?: string }[] }>("/api/grade", {
          subject: material.subject,
          items: toGrade.map(({ q, i }) => {
            const sq = q as Extract<Quiz["questions"][number], { type: "short" }>;
            const a = answers[i] as { type: "short"; text: string };
            return { prompt: sq.prompt, sampleAnswer: sq.sampleAnswer, rubric: sq.rubric, points: sq.points, answer: a.text };
          }),
        });
        const byIndex = new Map(toGrade.map(({ i }, k) => [i, res.results[k]]));
        shortResults = shortQs.map(({ i }) => byIndex.get(i) ?? null);
      } catch (err) {
        setGradeError(
          `${err instanceof ApiError ? err.message : "Written answers couldn't be graded."} Compare your written answers with the model answers below and mark them yourself.`,
        );
        shortResults = shortQs.map(() => null);
      }
    }
    const g = gradeQuiz(quiz, answers, shortResults);
    setGrade(g);
    setGrading(false);

    const now = Date.now();
    await store.put("attempts", {
      id: newId("att"),
      title: material.title,
      materialId: material.id,
      subject: material.subject,
      score: g.score,
      total: g.total,
      answers: g.items.map((it) => {
        const q = quiz.questions[it.index];
        const a = answers[it.index];
        return {
          question: q.prompt.slice(0, 300),
          correct: it.correct,
          topic: q.topic,
          given: a.type === "mcq" ? (a.choice !== null && q.type === "mcq" ? q.choices[a.choice] : "") : a.text.slice(0, 500),
          points: it.points,
          max: it.max,
          aiGraded: it.aiGraded,
        };
      }),
      createdAt: now,
      updatedAt: now,
    });
    if (profile.personalize) {
      for (const topic of g.missedTopics) {
        await store.put("signals", { id: newId("sig"), title: topic, topic, subject: material.subject, kind: "quiz_miss", source: "quiz", note: material.title, createdAt: now, updatedAt: now });
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const retake = () => {
    setAnswers(empty());
    setGrade(null);
    setSelfMarks({});
    setGradeError(null);
  };

  const pendingCount = grade?.items.filter((i) => i.pending).length ?? 0;
  const selfCorrect = Object.entries(selfMarks).filter(([, v]) => v).length;

  return (
    <div className="flex flex-col gap-4">
      {grade && (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Your result</p>
              <p className="mt-1 text-4xl font-semibold tracking-[-0.04em]">
                {grade.percent}%{" "}
                <span className="text-base font-normal tracking-normal text-muted">
                  {grade.score} / {grade.total} points
                </span>
              </p>
              {pendingCount > 0 && (
                <p className="mt-1 text-[13px] text-muted">
                  {pendingCount} written answer{pendingCount > 1 ? "s" : ""} to self-mark{selfCorrect ? ` · you marked ${selfCorrect} correct` : ""}
                </p>
              )}
            </div>
            <Button icon={<RotateCcw className="size-4" />} onClick={retake}>
              Retake
            </Button>
          </div>
          {grade.missedTopics.length > 0 && (
            <p className="mt-4 text-[13.5px] text-ink-2">
              Worth reviewing: <span className="font-medium">{grade.missedTopics.join(", ")}</span>
              {profile.personalize && <span className="text-muted"> — added to your review list on the Progress page.</span>}
            </p>
          )}
        </Card>
      )}
      {gradeError && <Alert tone="warning">{gradeError}</Alert>}

      <ol className="flex flex-col gap-4">
        {quiz.questions.map((q, i) => {
          const item = grade?.items[i];
          const a = answers[i];
          return (
            <li key={i}>
              <Card className={cn("p-5", item && !item.pending && (item.correct ? "border-success/40" : "border-danger/40"))}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 font-mono text-[12px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <Markdown className="font-medium">{q.prompt}</Markdown>
                  </div>
                  {item && !item.pending && (item.correct ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Correct" /> : <XCircle className="size-5 shrink-0 text-danger" aria-label="Incorrect" />)}
                </div>
                {q.type === "mcq" ? (
                  <fieldset className="flex flex-col gap-1.5" disabled={Boolean(grade)}>
                    <legend className="sr-only">Choices for question {i + 1}</legend>
                    {q.choices.map((c, ci) => {
                      const chosen = a.type === "mcq" && a.choice === ci;
                      const isAnswer = ci === q.answerIndex;
                      return (
                        <label
                          key={ci}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 text-[14.5px] transition-colors",
                            !grade && (chosen ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"),
                            grade && isAnswer && "border-success bg-success-soft",
                            grade && chosen && !isAnswer && "border-danger bg-danger-soft",
                            grade && !chosen && !isAnswer && "border-border opacity-70",
                          )}
                        >
                          <input type="radio" name={`q${i}`} checked={chosen} onChange={() => set(i, { type: "mcq", choice: ci })} className="mt-1 accent-[var(--accent)]" />
                          <Markdown className="min-w-0 flex-1 text-[14.5px]">{c}</Markdown>
                        </label>
                      );
                    })}
                  </fieldset>
                ) : (
                  <>
                    <label htmlFor={`q${i}-answer`} className="sr-only">
                      Your answer to question {i + 1}
                    </label>
                    <Textarea
                      id={`q${i}-answer`}
                      value={a.type === "short" ? a.text : ""}
                      onChange={(e) => set(i, { type: "short", text: e.target.value })}
                      disabled={Boolean(grade)}
                      placeholder="Write your answer…"
                      className="min-h-20"
                    />
                    <p className="mt-1 text-right text-[11.5px] text-muted">{q.points} point{q.points > 1 ? "s" : ""}</p>
                  </>
                )}
                {item && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3 text-[13.5px]">
                    {q.type === "short" && (
                      <>
                        {item.aiGraded && (
                          <p>
                            <Badge tone="accent">AI-graded</Badge>{" "}
                            <span className="font-medium">
                              {item.points}/{item.max}
                            </span>{" "}
                            — {item.feedback}
                          </p>
                        )}
                        {!item.aiGraded && item.feedback && <p className="text-muted">{item.feedback}</p>}
                        <div className="rounded-xl bg-surface-2 px-3.5 py-2.5">
                          <p className="mb-1 text-[12px] font-semibold text-ink-2">Model answer</p>
                          <Markdown className="text-[13.5px]">{q.sampleAnswer}</Markdown>
                        </div>
                        {item.pending && (
                          <div className="flex items-center gap-2">
                            <span className="text-[12.5px] text-muted">Did you get it?</span>
                            <Button size="sm" variant={selfMarks[i] === true ? "primary" : "secondary"} onClick={() => setSelfMarks((m) => ({ ...m, [i]: true }))}>
                              Yes
                            </Button>
                            <Button size="sm" variant={selfMarks[i] === false ? "primary" : "secondary"} onClick={() => setSelfMarks((m) => ({ ...m, [i]: false }))}>
                              Not quite
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                    {q.explanation && <Markdown className="text-[13.5px] text-ink-2">{q.explanation}</Markdown>}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>

      {!grade && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 p-3 pl-4 shadow-lg backdrop-blur">
          <span className="text-[13px] text-muted">
            {answered} of {quiz.questions.length} answered
          </span>
          <Button variant="primary" loading={grading} onClick={() => void submit()} disabled={answered === 0}>
            {grading ? "Grading…" : "Submit answers"}
          </Button>
        </div>
      )}
    </div>
  );
}
