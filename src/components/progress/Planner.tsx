"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import { newId, store, useCollection } from "@/lib/store";
import type { StudyTask } from "@/lib/store/types";
import { cn, now } from "@/lib/utils";
import { Badge, Button, Card, ConfirmDialog, IconButton, Input } from "@/components/ui";

function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dueLabel(due?: string) {
  if (!due) return null;
  const today = todayISO();
  if (due === today) return { text: "Today", tone: "accent" as const };
  const t = new Date(`${due}T00:00:00`);
  const diff = Math.round((t.getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
  if (diff < 0) return { text: `Overdue · ${t.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, tone: "danger" as const };
  if (diff === 1) return { text: "Tomorrow", tone: "neutral" as const };
  return { text: t.toLocaleDateString(undefined, { weekday: diff < 7 ? "short" : undefined, month: "short", day: "numeric" }), tone: "neutral" as const };
}

export function Planner({ kind }: { kind: "task" | "goal" }) {
  const { items } = useCollection("tasks");
  const list = useMemo(
    () =>
      items
        .filter((t) => t.kind === kind)
        .sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? "9999").localeCompare(b.due ?? "9999") || b.createdAt - a.createdAt),
    [items, kind],
  );
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<StudyTask | null>(null);
  const [showDone, setShowDone] = useState(false);

  const add = async () => {
    const t = title.trim();
    if (!t) return;
    const ts = now();
    await store.put("tasks", { id: newId("task"), title: t.slice(0, 160), due: due || undefined, done: false, kind, createdAt: ts, updatedAt: ts });
    setTitle("");
    setDue("");
  };
  const update = (t: StudyTask, patch: Partial<StudyTask>) => store.put("tasks", { ...t, ...patch, updatedAt: now() });

  const open = list.filter((t) => !t.done);
  const done = list.filter((t) => t.done);
  const visible = showDone ? list : open;
  const isGoal = kind === "goal";

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          {isGoal ? <Target className="size-4 text-accent" /> : <CalendarDays className="size-4 text-accent" />}
          {isGoal ? "Study goals" : "Study plan"}
        </h2>
        {done.length > 0 && (
          <button type="button" onClick={() => setShowDone((s) => !s)} className="text-[12px] text-muted hover:text-ink">
            {showDone ? "Hide completed" : `Show completed (${done.length})`}
          </button>
        )}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          aria-label={isGoal ? "New goal" : "New task"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isGoal ? "e.g. Feel confident with derivatives before the midterm" : "e.g. Review chapter 4 flashcards"}
          className="h-10"
        />
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Input aria-label={isGoal ? "Target date" : "Due date"} type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-10" />
          </div>
          <Button type="submit" variant="primary" icon={<Plus className="size-4" />} disabled={!title.trim()}>
            Add
          </Button>
        </div>
      </form>

      {visible.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">{isGoal ? "Set a goal to keep your studying pointed somewhere." : "No tasks yet. Add what you plan to study and when."}</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {visible.map((t) => {
            const d = dueLabel(t.due);
            return (
              <li key={t.id} className="group flex items-center gap-3 border-t border-border py-2.5 first:border-t-0">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={t.done ? `Mark “${t.title}” as not done` : `Mark “${t.title}” as done`}
                  onClick={() => void update(t, { done: !t.done })}
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                    t.done ? "border-success bg-success text-white" : "border-border-strong hover:border-accent",
                  )}
                >
                  {t.done && <Check className="size-3.5" />}
                </button>
                {editing === t.id ? (
                  <form
                    className="flex flex-1 flex-wrap gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editTitle.trim()) void update(t, { title: editTitle.trim().slice(0, 160), due: editDue || undefined });
                      setEditing(null);
                    }}
                  >
                    <Input aria-label="Edit title" autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-9 min-w-40 flex-1" />
                    <Input aria-label="Edit date" type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="h-9 w-[150px]" />
                    <IconButton label="Save" size="sm" type="submit">
                      <Check className="size-4" />
                    </IconButton>
                    <IconButton label="Cancel" size="sm" onClick={() => setEditing(null)}>
                      <X className="size-4" />
                    </IconButton>
                  </form>
                ) : (
                  <>
                    <span className={cn("min-w-0 flex-1 text-[14px]", t.done && "text-muted line-through")}>{t.title}</span>
                    {d && <Badge tone={t.done ? "neutral" : d.tone}>{d.text}</Badge>}
                    <span className="flex opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      <IconButton
                        label={`Edit “${t.title}”`}
                        size="sm"
                        onClick={() => {
                          setEditing(t.id);
                          setEditTitle(t.title);
                          setEditDue(t.due ?? "");
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </IconButton>
                      <IconButton label={`Delete “${t.title}”`} size="sm" onClick={() => setPendingDelete(t)}>
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete “${pendingDelete?.title ?? ""}”?`}
        onConfirm={() => {
          if (pendingDelete) void store.delete("tasks", pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  );
}
