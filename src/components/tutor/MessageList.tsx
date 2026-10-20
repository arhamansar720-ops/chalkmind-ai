"use client";

import { useEffect, useRef } from "react";
import { BookOpenText, Brain, Check, HelpCircle, Lightbulb, MessageCircleQuestion, Paperclip, Shapes, Sparkles, SquareFunction, Table2, Type, Waypoints, LineChart, Highlighter, ImageIcon } from "lucide-react";
import type { BoardAction } from "@/lib/board/schema";
import type { StoredMessage, StoredStep } from "@/lib/store/types";
import type { CheckAnswer } from "./TutorWorkspace";
import { Markdown } from "@/components/Markdown";
import { ErrorNotice } from "@/components/SetupNotice";
import { cn } from "@/lib/utils";

const ACTION_META: Record<BoardAction["type"], { label: string; icon: typeof Type }> = {
  add_text: { label: "note", icon: Type },
  add_equation: { label: "equation", icon: SquareFunction },
  add_shape: { label: "shape", icon: Shapes },
  add_arrow: { label: "arrow", icon: Waypoints },
  add_diagram: { label: "diagram", icon: Waypoints },
  add_graph: { label: "graph", icon: LineChart },
  add_table: { label: "table", icon: Table2 },
  highlight: { label: "highlight", icon: Highlighter },
  clear_board: { label: "cleared board", icon: Sparkles },
};

function summarizeActions(actions: BoardAction[]) {
  const counts = new Map<BoardAction["type"], number>();
  for (const a of actions) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  return [...counts.entries()];
}

export function MessageList({
  messages,
  streamingId,
  status,
  onFollowUp,
  onShowStep,
  onRetry,
  onCheck,
  className,
  emptyState,
  active = true,
}: {
  messages: StoredMessage[];
  streamingId: string | null;
  status: "idle" | "thinking" | "streaming";
  onFollowUp: (text: string) => void;
  onShowStep: (step: number) => void;
  onRetry: () => void;
  /** Set while the lesson is paused on a check-in. */
  onCheck?: (a: CheckAnswer) => void;
  className?: string;
  emptyState?: React.ReactNode;
  /** Re-scroll to the latest message when the list becomes visible (mobile tabs). */
  active?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  const lastLen = last ? (last.steps?.length ?? 0) + (last.followups?.length ?? 0) + last.content.length : 0;

  useEffect(() => {
    if (active) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, lastLen, active]);

  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-5", className)} aria-live="polite" aria-busy={status !== "idle"}>
      {messages.length === 0 && emptyState}
      <ol className="flex flex-col gap-5">
        {messages.map((m, i) => (
          <li key={m.id} className="animate-fade-up">
            {m.role === "user" ? (
              <div className="ml-8 flex flex-col items-end">
                <div className="max-w-full rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-[14.5px] leading-relaxed text-bg">
                  {m.attachments?.length ? (
                    <span className="mb-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[12px] opacity-75">
                      {m.attachments.map((a, j) => (
                        <span key={j} className="flex min-w-0 items-center gap-1">
                          {a.kind === "image" ? <ImageIcon className="size-3.5 shrink-0" /> : <Paperclip className="size-3.5 shrink-0" />}
                          <span className="max-w-[180px] truncate">{a.name}</span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    m.hadImage && (
                      <span className="mb-1 flex items-center gap-1 text-[12px] opacity-75">
                        <ImageIcon className="size-3.5" /> Image attached
                      </span>
                    )
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
            ) : (
              <AssistantMessage
                message={m}
                isLast={i === messages.length - 1}
                streaming={streamingId === m.id}
                status={status}
                onFollowUp={onFollowUp}
                onShowStep={onShowStep}
                onRetry={onRetry}
                onCheck={streamingId === m.id ? onCheck : undefined}
              />
            )}
          </li>
        ))}
      </ol>
      <div ref={endRef} />
    </div>
  );
}

function AssistantMessage({
  message: m,
  isLast,
  streaming,
  status,
  onFollowUp,
  onShowStep,
  onRetry,
  onCheck,
}: {
  message: StoredMessage;
  onCheck?: (a: CheckAnswer) => void;
  isLast: boolean;
  streaming: boolean;
  status: "idle" | "thinking" | "streaming";
  onFollowUp: (t: string) => void;
  onShowStep: (s: number) => void;
  onRetry: () => void;
}) {
  const steps = m.steps ?? [];
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-accent" aria-hidden>
        <Lightbulb className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="sr-only">Tutor:</p>
        {steps.length === 0 && streaming && (
          <p className="flex items-center gap-2 text-[13.5px] text-muted">
            <span className="flex gap-1" aria-hidden>
              <span className="size-1.5 animate-pulse rounded-full bg-muted" />
              <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
              <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
            </span>
            {status === "thinking" ? "Thinking it through…" : "Preparing the board…"}
          </p>
        )}
        {steps.length === 0 && !streaming && !m.error && m.content && <Markdown>{m.content}</Markdown>}
        <div className="flex flex-col gap-3">
          {steps.map((s, i) =>
            s.check ? (
              <CheckIn key={i} check={s.check} onCheck={onCheck} />
            ) : (
              <div key={i} className="animate-fade-up">
                <Markdown className="text-[14.5px]">{s.say}</Markdown>
                {s.actions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => s.boardStep !== undefined && onShowStep(s.boardStep)}
                    disabled={s.boardStep === undefined}
                    className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11.5px] text-muted transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none"
                    title="Show on board"
                  >
                    {summarizeActions(s.actions).map(([type, n]) => {
                      const meta = ACTION_META[type];
                      const Icon = meta.icon;
                      return (
                        <span key={type} className="inline-flex items-center gap-1">
                          <Icon className="size-3" aria-hidden />
                          {n > 1 ? `${n} ${meta.label}s` : meta.label}
                        </span>
                      );
                    })}
                    <span aria-hidden>· show</span>
                  </button>
                )}
              </div>
            ),
          )}
        </div>

        {m.remembered && m.remembered.length > 0 && (
          <a
            href="/app/settings#memory"
            className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11.5px] text-muted transition-colors hover:border-accent hover:text-accent"
            title="See and edit what the tutor remembers"
          >
            <Brain className="size-3 shrink-0" aria-hidden />
            <span className="truncate">Saved to memory: {m.remembered.join(" · ")}</span>
          </a>
        )}

        {m.citations && m.citations.length > 0 && (
          <div className="mt-3 rounded-xl border border-border bg-surface-2 px-3 py-2 text-[12px] text-ink-2">
            <span className="flex items-center gap-1.5 font-medium">
              <BookOpenText className="size-3.5" /> Searched your documents
            </span>
            <span className="mt-0.5 block text-muted">
              {m.citations.map((c) => `${c.source}${c.page ? `, ${c.unit === "slide" ? "slide" : "p."} ${c.page}` : ""}`).join(" · ")}
            </span>
          </div>
        )}

        {m.notices && m.notices.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[12px] text-muted">
            {m.notices.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
        )}

        {m.error && (
          <div className="mt-2">
            <ErrorNotice error={m.error} onRetry={isLast ? onRetry : undefined} />
          </div>
        )}

        {isLast && !streaming && m.followups && m.followups.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {m.followups.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onFollowUp(f)}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-left text-[12.5px] text-ink-2 shadow-sm transition-colors hover:border-accent hover:text-accent"
              >
                {f}
              </button>
            ))}
          </div>
        )}
        {isLast && !streaming && !m.error && steps.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {["Explain it more simply.", "Give me a practice problem like this.", "Can you give me a hint instead?"].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onFollowUp(q)}
                className="rounded-full px-2 py-1 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {q.replace(/\.$|\?$/, "")}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CheckIn({ check, onCheck }: { check: NonNullable<StoredStep["check"]>; onCheck?: (a: CheckAnswer) => void }) {
  const waiting = !check.answer && onCheck;
  return (
    <div className={cn("animate-fade-up rounded-2xl border px-3.5 py-3", waiting ? "border-accent bg-accent-soft" : "border-border bg-surface-2")}>
      <p className="flex items-start gap-2 text-[14px] font-medium text-ink">
        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <span>{check.question}</span>
      </p>
      {waiting ? (
        <>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onCheck({ kind: "yes" })}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-medium text-bg transition-opacity hover:opacity-90"
            >
              <Check className="size-3.5" /> Got it, keep going
            </button>
            <button
              type="button"
              onClick={() => onCheck({ kind: "no" })}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink"
            >
              <HelpCircle className="size-3.5" /> Not quite
            </button>
          </div>
          <p className="mt-2 text-[12px] text-muted">The lesson is paused. You can also type or say what&apos;s confusing.</p>
        </>
      ) : (
        check.answer && (
          <p className="mt-1 pl-6 text-[12px] text-muted">
            {check.answer === "yes" ? "You said you've got it." : check.answer === "no" ? "You asked for another explanation." : "You replied below."}
          </p>
        )
      )}
    </div>
  );
}
