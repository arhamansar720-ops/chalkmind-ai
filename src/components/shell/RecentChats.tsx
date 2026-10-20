"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Check, Pencil, Search, Trash2, X } from "lucide-react";
import { store } from "@/lib/store";
import type { TutorSession } from "@/lib/store/types";
import { cn, relativeTime } from "@/lib/utils";

const SHOWN = 30;
/** Event-handler timestamps (kept out of the component body for the React Compiler). */
const now = () => Date.now();

/** Sidebar chat history: search, rename and delete tutor sessions. */
export function RecentChats({ sessions }: { sessions: TutorSession[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("s");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const matches = q
    ? sessions.filter((s) => s.title.toLowerCase().includes(q) || s.messages.some((m) => m.role === "user" && m.content.toLowerCase().includes(q)))
    : sessions;
  const shown = matches.slice(0, SHOWN);

  const rename = async (s: TutorSession) => {
    const title = draft.trim().slice(0, 80);
    setEditing(null);
    if (title && title !== s.title) await store.put("sessions", { ...s, title, updatedAt: now() });
  };
  const remove = async (s: TutorSession) => {
    setConfirming(null);
    await store.delete("sessions", s.id);
    if (current === s.id) router.push(`/app/tutor?new=${now()}`);
  };

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col px-3">
      <p className="eyebrow px-2.5 pb-1.5">Recent chats</p>
      {sessions.length > 6 && (
        <label className="mb-1.5 flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2 text-[12.5px] focus-within:border-accent">
          <Search className="size-3.5 shrink-0 text-muted" aria-hidden />
          <span className="sr-only">Search chats</span>
          <input
            data-focus-ring="parent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="min-w-0 flex-1 bg-transparent text-ink placeholder:text-muted focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-muted hover:text-ink">
              <X className="size-3.5" />
            </button>
          )}
        </label>
      )}
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-2">
        {shown.map((s) => (
          <li key={s.id} className="group relative">
            {editing === s.id ? (
              <form
                className="flex items-center gap-1 rounded-lg bg-surface-2 px-1.5 py-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  void rename(s);
                }}
              >
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                  onBlur={() => void rename(s)}
                  aria-label="Chat name"
                  maxLength={80}
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface px-1.5 py-1 text-[13px] focus:border-accent"
                />
                <button type="submit" aria-label="Save name" className="flex size-6 items-center justify-center rounded-md text-muted hover:text-ink">
                  <Check className="size-3.5" />
                </button>
              </form>
            ) : confirming === s.id ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[12.5px] text-danger">
                <span className="min-w-0 flex-1 truncate">Delete this chat?</span>
                <button type="button" onClick={() => void remove(s)} className="font-semibold hover:underline">
                  Delete
                </button>
                <button type="button" onClick={() => setConfirming(null)} className="text-ink-2 hover:underline">
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <Link
                  href={`/app/tutor?s=${s.id}`}
                  aria-current={current === s.id ? "page" : undefined}
                  className={cn(
                    "flex flex-col rounded-lg px-2.5 py-1.5 pr-14 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink",
                    current === s.id && "bg-surface-3 text-ink",
                  )}
                >
                  <span className="truncate">{s.title || "Untitled session"}</span>
                  <span className="text-[11px] text-muted">{relativeTime(s.updatedAt)}</span>
                </Link>
                <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={`Rename ${s.title}`}
                    onClick={() => {
                      setDraft(s.title);
                      setEditing(s.id);
                    }}
                    className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${s.title}`}
                    onClick={() => setConfirming(s.id)}
                    className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
        {q && matches.length === 0 && <li className="px-2.5 py-2 text-[12.5px] text-muted">No chats match “{query}”.</li>}
        {matches.length > SHOWN && (
          <li>
            <Link href="/app/library" className="block px-2.5 py-1.5 text-[12.5px] text-accent hover:underline">
              All {matches.length} chats in Library →
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
