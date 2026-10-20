"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, Download, FileText, Layers, ListChecks, Printer, Sparkles } from "lucide-react";
import { ApiError, postJSON } from "@/lib/client/api";
import { documentText } from "@/lib/client/documents";
import { useHealth } from "@/lib/client/health";
import { usePersonalization } from "@/lib/client/profile";
import { STUDY_FORMATS, type StudyContent, type StudyFormatId } from "@/lib/study/schema";
import { newId, store, useCollection, useRecord } from "@/lib/store";
import type { StudyMaterial } from "@/lib/store/types";
import { SUBJECTS } from "@/lib/tutor/protocol";
import { cn, downloadText, relativeTime, slugify } from "@/lib/utils";
import { DocumentUpload } from "@/components/docs/DocumentUpload";
import { Markdown } from "@/components/Markdown";
import { ErrorNotice, SetupNotice } from "@/components/SetupNotice";
import { Badge, Button, Card, Field, Input, PageHeader, Segmented, Select, Spinner, Textarea } from "@/components/ui";
import { FlashcardDeck } from "./Flashcards";
import { QuizRunner } from "./QuizRunner";

type Source = "topic" | "notes" | "document";
const KIND_ICON = { flashcards: Layers, quiz: ListChecks, guide: BookOpen } as const;

export function StudyMaterials() {
  const params = useSearchParams();
  const openId = params.get("id");
  const { record: material, loading } = useRecord("materials", openId);
  if (openId) {
    if (loading) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
    if (!material)
      return (
        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <p className="font-semibold">That study set wasn&apos;t found.</p>
          <Link className="mt-2 inline-block text-sm text-accent" href="/app/study">Back to Study Materials</Link>
        </div>
      );
    return <MaterialViewer material={material} />;
  }
  return <Generator />;
}

function Generator() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: health, loading: healthLoading } = useHealth();
  const { topics: reviewTopics } = usePersonalization();
  const { items: docs } = useCollection("documents");
  const { items: materials } = useCollection("materials");

  const [source, setSource] = useState<Source>("topic");
  const [topic, setTopic] = useState(params.get("topic") ?? "");
  const [notes, setNotes] = useState("");
  const [docId, setDocId] = useState("");
  const [subject, setSubject] = useState(params.get("subject") ?? "General");
  const [difficulty, setDifficulty] = useState<"intro" | "standard" | "challenging">("standard");
  const [count, setCount] = useState(8);
  const [format, setFormat] = useState<StudyFormatId>((params.get("format") as StudyFormatId) || "flashcards");
  const [useFocus, setUseFocus] = useState(params.get("focus") === "review");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string; hint?: string } | null>(null);
  const autoRan = useRef(false);

  const formatMeta = STUDY_FORMATS.find((f) => f.id === format)!;
  const showCount = !["guide", "summary"].includes(format);

  const generate = async () => {
    if (busy) return;
    let sourceText = "";
    let sourceLabel = "";
    if (source === "notes") {
      sourceText = notes.trim();
      sourceLabel = "Your notes";
      if (!sourceText) return setError({ message: "Paste some notes to study from." });
    } else if (source === "document") {
      const doc = docs.find((d) => d.id === docId);
      if (!doc) return setError({ message: "Choose or upload a document first." });
      sourceText = documentText(doc, 36_000);
      sourceLabel = doc.title;
    } else if (!topic.trim()) {
      return setError({ message: "Enter a topic to study." });
    }
    setBusy(true);
    setError(null);
    try {
      const res = await postJSON<{ content: StudyContent }>("/api/study", {
        format,
        subject,
        difficulty,
        count,
        topic: source === "topic" ? topic : topic || "",
        sourceText,
        sourceLabel,
        focus: useFocus ? reviewTopics.slice(0, 6) : [],
      });
      const now = Date.now();
      const rec: StudyMaterial = {
        id: newId("mat"),
        title: res.content.title || topic || sourceLabel || formatMeta.label,
        subject,
        difficulty,
        sourceLabel: source === "topic" ? `Topic: ${topic}` : sourceLabel,
        content: res.content,
        createdAt: now,
        updatedAt: now,
      };
      await store.put("materials", rec);
      router.push(`/app/study?id=${rec.id}`);
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError("unknown", "Something went wrong.");
      setError({ code: e.code, message: e.message, hint: e.hint });
    } finally {
      setBusy(false);
    }
  };

  // "Practice this" links from the Progress page start generating right away.
  useEffect(() => {
    if (autoRan.current || params.get("auto") !== "1" || !health?.ai.configured || !topic) return;
    autoRan.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [health]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        eyebrow="Study Materials"
        title="Turn anything into practice"
        description="Start from a topic, your own notes, or a document. Pick one format — you can always make another."
      />

      {!healthLoading && !health?.ai.configured ? (
        <div className="mt-7">
          <SetupNotice health={health} />
        </div>
      ) : (
        <Card className="mt-7 p-5 sm:p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <Segmented
                label="Study from"
                value={source}
                onChange={setSource}
                options={[
                  { value: "topic", label: "A topic" },
                  { value: "notes", label: "My notes" },
                  { value: "document", label: "A document" },
                ]}
              />
              {source === "topic" && (
                <Input aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Cellular respiration, the French Revolution, solving quadratic equations" />
              )}
              {source === "notes" && (
                <Textarea aria-label="Your notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste class notes, a textbook section or an article…" className="min-h-40" maxLength={40000} />
              )}
              {source === "document" && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="flex-1">
                    <Select aria-label="Document" value={docId} onChange={(e) => setDocId(e.target.value)}>
                      <option value="">{docs.length ? "Choose a document…" : "No documents yet — upload one"}</option>
                      {docs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <DocumentUpload onUploaded={(d) => setDocId(d.id)} />
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-2">Format</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="radiogroup" aria-label="Format">
                {STUDY_FORMATS.map((f) => {
                  const Icon = KIND_ICON[f.kind];
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={format === f.id}
                      onClick={() => setFormat(f.id)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                        format === f.id ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong",
                      )}
                    >
                      <Icon className={cn("size-4", format === f.id ? "text-accent" : "text-muted")} />
                      <span className="text-[13.5px] font-medium">{f.label}</span>
                      <span className="text-[11.5px] leading-snug text-muted">{f.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Subject" htmlFor="st-subject">
                <Select id="st-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
                  {SUBJECTS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Difficulty" htmlFor="st-diff">
                <Select id="st-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                  <option value="intro">Introductory</option>
                  <option value="standard">Standard</option>
                  <option value="challenging">Challenging</option>
                </Select>
              </Field>
              {showCount && (
                <Field label={`How many: ${count}`} htmlFor="st-count">
                  <input id="st-count" type="range" min={3} max={format === "examples" ? 6 : 25} value={Math.min(count, format === "examples" ? 6 : 25)} onChange={(e) => setCount(Number(e.target.value))} className="h-11 accent-[var(--accent)]" />
                </Field>
              )}
            </div>

            {reviewTopics.length > 0 && (
              <label className="flex items-start gap-2.5 text-[13.5px]">
                <input type="checkbox" checked={useFocus} onChange={(e) => setUseFocus(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
                <span>
                  Emphasise my review topics <span className="text-muted">({reviewTopics.slice(0, 4).join(", ")})</span>
                </span>
              </label>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              {busy && <span className="text-[13px] text-muted">Writing your {formatMeta.label.toLowerCase()}…</span>}
              <Button variant="primary" size="lg" loading={busy} icon={<Sparkles className="size-4" />} onClick={() => void generate()}>
                Generate
              </Button>
            </div>
            {error && <ErrorNotice error={error} onRetry={error.code && error.code !== "bad_request" ? () => void generate() : undefined} />}
          </div>
        </Card>
      )}

      <section className="mt-12">
        <h2 className="eyebrow mb-3">Your study sets</h2>
        {materials.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet. Generated flashcards, quizzes and guides are saved here and in My Library.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {materials.slice(0, 8).map((m) => {
              const Icon = KIND_ICON[m.content.kind];
              return (
                <li key={m.id}>
                  <Link href={`/app/study?id=${m.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 hover:border-border-strong">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">{m.title}</span>
                      <span className="text-[12px] text-muted">
                        {m.subject} · {relativeTime(m.updatedAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function MaterialViewer({ material }: { material: StudyMaterial }) {
  const c = material.content;
  const kindLabel = c.kind === "flashcards" ? `${c.cards.length} flashcards` : c.kind === "quiz" ? `${c.questions.length} questions` : "Guide";
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/app/study" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Study Materials
      </Link>
      <PageHeader
        title={material.title}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{material.subject}</Badge>
            <Badge>{kindLabel}</Badge>
            <Badge>{material.difficulty}</Badge>
            <span className="text-[12.5px]">
              <FileText className="mr-1 inline size-3.5 align-[-2px]" />
              {material.sourceLabel}
            </span>
          </span>
        }
        actions={
          c.kind === "guide" ? (
            <>
              <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadText(`${slugify(material.title)}.md`, `# ${c.title}\n\n${c.markdown}`)}>
                Export .md
              </Button>
              <Button size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()}>
                Print / PDF
              </Button>
            </>
          ) : undefined
        }
      />
      <div className="mt-7">
        {c.kind === "flashcards" && <FlashcardDeck material={material} deck={c} />}
        {c.kind === "quiz" && <QuizRunner material={material} quiz={c} />}
        {c.kind === "guide" && (
          <Card className="p-6 sm:p-8 print:border-0 print:shadow-none">
            <Markdown>{c.markdown}</Markdown>
          </Card>
        )}
      </div>
      <p className="mt-6 text-[12px] text-muted">Generated by AI — double-check anything you&apos;ll be graded on.</p>
    </div>
  );
}
