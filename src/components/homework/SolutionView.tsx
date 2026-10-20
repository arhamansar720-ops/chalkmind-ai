"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Eye, Lightbulb, PencilRuler, ShieldQuestion } from "lucide-react";
import type { HomeworkMode, HomeworkSolution, Verification } from "@/lib/homework/schema";
import { Markdown } from "@/components/Markdown";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export function VerificationBadge({ v }: { v: Verification }) {
  if (v.status === "verified")
    return (
      <Badge tone="success">
        <CheckCircle2 className="size-3" /> Checked: {v.method.toLowerCase()}
      </Badge>
    );
  if (v.status === "failed")
    return (
      <Badge tone="danger">
        <AlertTriangle className="size-3" /> Automatic check failed
      </Badge>
    );
  return (
    <Badge>
      <ShieldQuestion className="size-3" /> Not independently verified
    </Badge>
  );
}

export function SolutionView({
  solution,
  verification,
  mode,
  onWhiteboard,
}: {
  solution: HomeworkSolution;
  verification: Verification;
  mode: HomeworkMode;
  onWhiteboard: () => void;
}) {
  const hintFirst = mode === "hint";
  const [revealed, setRevealed] = useState(hintFirst ? 0 : solution.steps.length);
  const [answerShown, setAnswerShown] = useState(!hintFirst);
  const [practiceShown, setPracticeShown] = useState(false);
  const allStepsShown = revealed >= solution.steps.length;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="accent">{solution.subject}</Badge>
          {solution.topic && <Badge>{solution.topic}</Badge>}
          <VerificationBadge v={verification} />
        </div>
        <Section title="What the question is asking">
          <Markdown>{solution.restatement}</Markdown>
        </Section>
        {solution.given.length > 0 && (
          <Section title="What we know">
            <ul className="prose-cm list-disc pl-5">
              {solution.given.map((g, i) => (
                <li key={i}>
                  <Markdown className="inline">{g}</Markdown>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {solution.method && (
          <Section title="Method">
            <Markdown>{solution.method}</Markdown>
          </Section>
        )}
        {solution.caveat && (
          <p className="mt-4 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13.5px] text-warning">
            <AlertTriangle className="mr-1.5 inline size-4 align-[-3px]" />
            {solution.caveat}
          </p>
        )}
      </Card>

      {hintFirst && solution.hint && (
        <Card className="border-accent/30 bg-accent-soft p-5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-accent">
            <Lightbulb className="size-4" /> Hint
          </p>
          <Markdown>{solution.hint}</Markdown>
          <p className="mt-3 text-[13px] text-muted">Try the next step yourself, then reveal the steps one at a time to check your work.</p>
        </Card>
      )}

      {solution.steps.length > 0 && (
        <Card className="p-5 sm:p-6">
          <h3 className="eyebrow mb-4">Step by step</h3>
          <ol className="flex flex-col gap-5">
            {solution.steps.slice(0, revealed).map((s, i) => (
              <li key={i} className="animate-fade-up flex gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[12px] font-semibold text-ink-2">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold tracking-tight">{s.title}</p>
                  <Markdown className="mt-1 text-[14.5px] text-ink-2">{s.explanation}</Markdown>
                  {s.work && (
                    <div className="mt-2 rounded-xl border border-border bg-surface-2 px-4 py-2.5">
                      <Markdown>{s.work}</Markdown>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {!allStepsShown && (
            <Button className="mt-5" variant="secondary" icon={<ChevronDown className="size-4" />} onClick={() => setRevealed((r) => r + 1)}>
              {revealed === 0 ? "Show the first step" : `Show step ${revealed + 1} of ${solution.steps.length}`}
            </Button>
          )}
        </Card>
      )}

      <Card className={cn("p-5 sm:p-6", answerShown && "border-success/30")}>
        <h3 className="eyebrow mb-2">Final answer</h3>
        {answerShown ? (
          <Markdown className="text-[16px] font-medium">{solution.finalAnswer}</Markdown>
        ) : (
          <Button variant="secondary" icon={<Eye className="size-4" />} onClick={() => setAnswerShown(true)}>
            Reveal the answer
          </Button>
        )}
        {answerShown && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-1 text-[13px] font-semibold">How to check it</p>
            {solution.verifyHow && <Markdown className="text-[14px] text-ink-2">{solution.verifyHow}</Markdown>}
            <div className="mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
              {verification.status === "unverified" ? (
                <p>{verification.reason}</p>
              ) : (
                <>
                  <p className="font-medium">
                    {verification.status === "verified" ? "Chalkmind re-checked this with its own calculator:" : "Chalkmind's own calculation disagrees — treat this answer with caution:"}
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {verification.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      {solution.practice && (
        <Card className="p-5 sm:p-6">
          <h3 className="eyebrow mb-2 flex items-center gap-1.5">
            <CircleHelp className="size-3.5" /> Try one yourself
          </h3>
          <Markdown>{solution.practice.question}</Markdown>
          <button type="button" onClick={() => setPracticeShown((s) => !s)} className="mt-3 text-[13px] font-medium text-accent underline-offset-2 hover:underline">
            {practiceShown ? "Hide answer" : "Show answer"}
          </button>
          {practiceShown && <Markdown className="mt-2 text-ink-2">{solution.practice.answer}</Markdown>}
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<PencilRuler className="size-4" />} onClick={onWhiteboard}>
          Explain it on the whiteboard
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="mb-1.5 text-[13px] font-semibold text-ink-2">{title}</h3>
      {children}
    </section>
  );
}
