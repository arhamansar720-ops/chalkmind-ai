"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, FileText, Layers, ListChecks, MessagesSquare, MoreHorizontal, Pencil, Search, SquareFunction, Trash2 } from "lucide-react";
import { store, useCollection } from "@/lib/store";
import type { CollectionName } from "@/lib/store/types";
import { cn, now, relativeTime } from "@/lib/utils";
import { DocumentUpload } from "@/components/docs/DocumentUpload";
import { Badge, Button, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Select, Spinner } from "@/components/ui";

type ItemType = "session" | "homework" | "flashcards" | "quiz" | "guide" | "document";

interface LibraryItem {
  key: string;
  id: string;
  collection: CollectionName;
  type: ItemType;
  title: string;
  subtitle: string;
  updatedAt: number;
  createdAt: number;
  href: string | null;
}

const TYPE_META: Record<ItemType, { label: string; plural: string; icon: typeof FileText }> = {
  session: { label: "Tutor session", plural: "Sessions", icon: MessagesSquare },
  homework: { label: "Homework", plural: "Homework", icon: SquareFunction },
  flashcards: { label: "Flashcards", plural: "Flashcards", icon: Layers },
  quiz: { label: "Quiz", plural: "Quizzes", icon: ListChecks },
  guide: { label: "Guide", plural: "Guides", icon: BookOpen },
  document: { label: "Document", plural: "Documents", icon: FileText },
};

export function Library() {
  const params = useSearchParams();
  const router = useRouter();
  const sessions = useCollection("sessions");
  const homework = useCollection("homework");
  const materials = useCollection("materials");
  const documents = useCollection("documents");
  const loading = sessions.loading || homework.loading || materials.loading || documents.loading;

  const [query, setQuery] = useState("");
  const [type, setType] = useState<ItemType | "all">((params.get("type") as ItemType) || "all");
  const [sort, setSort] = useState<"recent" | "oldest" | "az">("recent");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<LibraryItem | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const items = useMemo<LibraryItem[]>(() => {
    const out: LibraryItem[] = [];
    for (const s of sessions.items) {
      const turns = s.messages.filter((m) => m.role === "user").length;
      const boardItems = (s.board?.elements ?? []).filter((e) => !(e as { isDeleted?: boolean }).isDeleted).length;
      out.push({
        key: `s:${s.id}`, id: s.id, collection: "sessions", type: "session", title: s.title,
        subtitle: [s.subject, `${turns} question${turns === 1 ? "" : "s"}`, boardItems ? "whiteboard saved" : null].filter(Boolean).join(" · "),
        updatedAt: s.updatedAt, createdAt: s.createdAt, href: `/app/tutor?s=${s.id}`,
      });
    }
    for (const h of homework.items) {
      out.push({ key: `h:${h.id}`, id: h.id, collection: "homework", type: "homework", title: h.title, subtitle: `${h.subject} · ${h.mode === "hint" ? "hint first" : h.mode}`, updatedAt: h.updatedAt, createdAt: h.createdAt, href: `/app/homework?id=${h.id}` });
    }
    for (const m of materials.items) {
      const t: ItemType = m.content.kind;
      const n = m.content.kind === "flashcards" ? `${m.content.cards.length} cards` : m.content.kind === "quiz" ? `${m.content.questions.length} questions` : "study guide";
      out.push({ key: `m:${m.id}`, id: m.id, collection: "materials", type: t, title: m.title, subtitle: `${m.subject} · ${n}`, updatedAt: m.updatedAt, createdAt: m.createdAt, href: `/app/study?id=${m.id}` });
    }
    for (const d of documents.items) {
      out.push({
        key: `d:${d.id}`, id: d.id, collection: "documents", type: "document", title: d.title,
        subtitle: `${d.mime === "application/pdf" ? `PDF · ${d.pageCount} pages` : "Text"} · ${Math.max(1, Math.round(d.size / 1024))} KB${d.embeddingModel ? " · semantic search" : ""}`,
        updatedAt: d.updatedAt, createdAt: d.createdAt, href: `/app/tutor?new=${d.id}&doc=${d.id}`,
      });
    }
    return out;
  }, [sessions.items, homework.items, materials.items, documents.items]);

  const counts = useMemo(() => {
    const c: Partial<Record<ItemType, number>> = {};
    for (const i of items) c[i.type] = (c[i.type] ?? 0) + 1;
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => (type === "all" || i.type === type) && (!q || i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q)))
      .sort((a, b) => (sort === "az" ? a.title.localeCompare(b.title) : sort === "oldest" ? a.createdAt - b.createdAt : b.updatedAt - a.updatedAt));
  }, [items, query, type, sort]);

  const rename = async (item: LibraryItem) => {
    const title = draft.trim().slice(0, 120);
    setRenaming(null);
    if (!title || title === item.title) return;
    const rec = await store.get(item.collection, item.id);
    if (rec) await store.put(item.collection, { ...rec, title, updatedAt: now() } as never);
  };

  const remove = async (item: LibraryItem) => {
    setPendingDelete(null);
    await store.delete(item.collection, item.id);
    if (item.collection === "documents") {
      // Detach the document from any session that cited it.
      for (const s of sessions.items.filter((x) => x.docIds.includes(item.id))) {
        await store.put("sessions", { ...s, docIds: s.docIds.filter((d) => d !== item.id) });
      }
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        eyebrow="My Library"
        title="Everything you've saved"
        description="Tutor sessions with their whiteboards, homework solutions, study sets and documents."
        actions={<DocumentUpload label="Upload document" />}
      />

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search library" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title or subject" className="pl-10" />
        </div>
        <div className="w-full sm:w-44">
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="recent">Recently updated</option>
            <option value="oldest">Oldest first</option>
            <option value="az">Name A–Z</option>
          </Select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by type">
        {(["all", "session", "homework", "flashcards", "quiz", "guide", "document"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={type === t}
            onClick={() => setType(t)}
            className={cn(
              "h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
              type === t ? "border-ink bg-ink text-bg" : "border-border bg-surface text-ink-2 hover:border-border-strong",
            )}
          >
            {t === "all" ? `All ${items.length}` : `${TYPE_META[t].plural} ${counts[t] ?? 0}`}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-5" />}
            title="Your library is empty"
            body="Start a tutoring session, solve a homework problem or generate flashcards — everything is saved here automatically."
            action={
              <Button variant="primary" onClick={() => router.push(`/app/tutor?new=${Date.now()}`)}>
                Start a session
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Nothing matches “{query}”.</p>
        ) : (
          <ul className="divide-y divide-border overflow-visible rounded-2xl border border-border bg-surface">
            {shown.map((item) => {
              const meta = TYPE_META[item.type];
              const Icon = meta.icon;
              return (
                <li key={item.key} className="relative flex items-center gap-3 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    {renaming === item.key ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void rename(item);
                        }}
                      >
                        <Input autoFocus aria-label="New name" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => void rename(item)} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} className="h-9" />
                      </form>
                    ) : item.href ? (
                      <Link href={item.href} className="block truncate text-[14px] font-medium hover:text-accent">
                        {item.title}
                      </Link>
                    ) : (
                      <span className="block truncate text-[14px] font-medium">{item.title}</span>
                    )}
                    <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                      <Badge className="py-0">{meta.label}</Badge>
                      {item.subtitle} · {relativeTime(item.updatedAt)}
                    </span>
                  </div>
                  <div className="relative">
                    <IconButton label={`Actions for ${item.title}`} size="sm" onClick={() => setMenu(menu === item.key ? null : item.key)} aria-expanded={menu === item.key}>
                      <MoreHorizontal className="size-4" />
                    </IconButton>
                    {menu === item.key && (
                      <div className="absolute right-0 top-9 z-20 w-40 rounded-xl border border-border bg-surface p-1 shadow-lg" role="menu" onMouseLeave={() => setMenu(null)}>
                        <button
                          role="menuitem"
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] hover:bg-surface-2"
                          onClick={() => {
                            setMenu(null);
                            setDraft(item.title);
                            setRenaming(item.key);
                          }}
                        >
                          <Pencil className="size-3.5" /> Rename
                        </button>
                        <button
                          role="menuitem"
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-danger hover:bg-danger-soft"
                          onClick={() => {
                            setMenu(null);
                            setPendingDelete(item);
                          }}
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete “${pendingDelete?.title ?? ""}”?`}
        body={pendingDelete?.type === "session" ? "The conversation and its whiteboard will be permanently deleted." : "This can't be undone."}
        onConfirm={() => pendingDelete && void remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
