"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw, Shuffle } from "lucide-react";
import type { Flashcards } from "@/lib/study/schema";
import type { StudyMaterial } from "@/lib/store/types";
import { store } from "@/lib/store";
import { Markdown } from "@/components/Markdown";
import { Badge, Button, IconButton, Segmented } from "@/components/ui";
import { cn } from "@/lib/utils";

type Confidence = "again" | "hard" | "good" | "easy";
const CONFIDENCE: { value: Confidence; label: string; key: string; className: string }[] = [
  { value: "again", label: "Again", key: "1", className: "hover:border-danger hover:text-danger" },
  { value: "hard", label: "Hard", key: "2", className: "hover:border-warning hover:text-warning" },
  { value: "good", label: "Good", key: "3", className: "hover:border-accent hover:text-accent" },
  { value: "easy", label: "Easy", key: "4", className: "hover:border-success hover:text-success" },
];

export function FlashcardDeck({ material, deck }: { material: StudyMaterial; deck: Flashcards }) {
  const [filter, setFilter] = useState<"all" | "difficult">("all");
  const [order, setOrder] = useState<number[]>(() => deck.cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const state = useMemo(() => material.cardState ?? {}, [material.cardState]);

  const visible = useMemo(
    () => order.filter((i) => filter === "all" || ["again", "hard"].includes(state[i]?.confidence ?? "")),
    [order, filter, state],
  );
  const current = visible[Math.min(pos, Math.max(0, visible.length - 1))];
  const card = current !== undefined ? deck.cards[current] : undefined;
  const reviewed = Object.keys(state).length;
  const difficult = Object.values(state).filter((s) => s.confidence === "again" || s.confidence === "hard").length;

  const go = (d: number) => {
    setFlipped(false);
    setPos((p) => Math.min(Math.max(0, p + d), Math.max(0, visible.length - 1)));
  };

  const rate = async (c: Confidence) => {
    if (current === undefined) return;
    const prev = state[current];
    const next: StudyMaterial = {
      ...material,
      cardState: { ...state, [current]: { confidence: c, reviewedAt: Date.now(), reviews: (prev?.reviews ?? 0) + 1 } },
      updatedAt: Date.now(),
    };
    await store.put("materials", next);
    setFlipped(false);
    if (filter === "all" || c === "again" || c === "hard") setPos((p) => Math.min(p + 1, Math.max(0, visible.length - 1)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (flipped) {
        const c = CONFIDENCE.find((x) => x.key === e.key);
        if (c) void rate(c.value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Cards to show"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPos(0);
            setFlipped(false);
          }}
          options={[
            { value: "all", label: `All ${deck.cards.length}` },
            { value: "difficult", label: `Difficult (${difficult})` },
          ]}
        />
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          {reviewed}/{deck.cards.length} rated
          <IconButton
            label="Shuffle"
            size="sm"
            onClick={() => {
              setOrder((o) => [...o].sort(() => Math.random() - 0.5));
              setPos(0);
              setFlipped(false);
            }}
          >
            <Shuffle className="size-4" />
          </IconButton>
        </div>
      </div>

      {!card ? (
        <div className="rounded-2xl border border-dashed border-border-strong p-10 text-center text-sm text-muted">
          {filter === "difficult" ? "No difficult cards — nice. Rate cards as Again or Hard to review them here." : "This deck is empty."}
        </div>
      ) : (
        <>
          <button
            type="button"
            className="flip-card block h-[300px] w-full text-left sm:h-[340px]"
            data-flipped={flipped}
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? "Show the front of the card" : "Flip to see the answer"}
          >
            <div className="flip-inner relative h-full w-full">
              <div className="flip-face absolute inset-0 flex flex-col rounded-3xl border border-border bg-surface p-6 shadow-md sm:p-8">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Card {Math.min(pos, visible.length - 1) + 1} of {visible.length}</span>
                  {card.topic && <Badge>{card.topic}</Badge>}
                </div>
                <div className="flex flex-1 items-center justify-center text-center">
                  <Markdown className="text-[19px] font-medium leading-snug sm:text-[22px]">{card.front}</Markdown>
                </div>
                <p className="text-center text-[12px] text-muted">Click or press Space to flip</p>
              </div>
              <div className="flip-face flip-back absolute inset-0 flex flex-col rounded-3xl border border-accent/30 bg-surface p-6 shadow-md sm:p-8">
                <span className="eyebrow">Answer</span>
                <div className="flex flex-1 items-center justify-center overflow-y-auto text-center">
                  <Markdown className="text-[16px] sm:text-[17px]">{card.back}</Markdown>
                </div>
              </div>
            </div>
          </button>

          <div className="flex items-center justify-between gap-2">
            <IconButton label="Previous card" onClick={() => go(-1)} disabled={pos === 0}>
              <ArrowLeft className="size-4" />
            </IconButton>
            {flipped ? (
              <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="How well did you know it?">
                {CONFIDENCE.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => void rate(c.value)}
                    className={cn(
                      "h-9 rounded-full border border-border bg-surface px-3.5 text-[13px] font-medium text-ink-2 transition-colors",
                      c.className,
                      state[current!]?.confidence === c.value && "border-ink text-ink",
                    )}
                  >
                    {c.label} <span className="ml-0.5 font-mono text-[10px] text-muted">{c.key}</span>
                  </button>
                ))}
              </div>
            ) : (
              <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => setFlipped(true)}>
                Show answer
              </Button>
            )}
            <IconButton label="Next card" onClick={() => go(1)} disabled={pos >= visible.length - 1}>
              <ArrowRight className="size-4" />
            </IconButton>
          </div>
        </>
      )}
    </div>
  );
}
