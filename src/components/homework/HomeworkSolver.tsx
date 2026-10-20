"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, ImagePlus, Sparkles, X } from "lucide-react";
import { ApiError, postForm, postJSON } from "@/lib/client/api";
import { ACCEPTED_DOCS } from "@/lib/client/documents";
import { useHealth } from "@/lib/client/health";
import type { HomeworkMode, HomeworkSolution, Verification } from "@/lib/homework/schema";
import { newId, store, useCollection, useRecord } from "@/lib/store";
import type { HomeworkRecord } from "@/lib/store/types";
import { SUBJECTS } from "@/lib/tutor/protocol";
import { imageFileToDataUrl, relativeTime } from "@/lib/utils";
import { ErrorNotice, SetupNotice } from "@/components/SetupNotice";
import { Badge, Button, Card, IconButton, PageHeader, Segmented, Select, Spinner, Textarea } from "@/components/ui";
import { SolutionView, VerificationBadge } from "./SolutionView";

const MODES: { value: HomeworkMode; label: string }[] = [
  { value: "hint", label: "Hint first" },
  { value: "detailed", label: "Detailed" },
  { value: "simple", label: "Simpler" },
];

export function HomeworkSolver() {
  const params = useSearchParams();
  const router = useRouter();
  const openId = params.get("id");
  const { record: opened } = useRecord("homework", openId);
  const { items: history } = useCollection("homework");
  const { data: health, loading: healthLoading } = useHealth();

  const [question, setQuestion] = useState("");
  const [subject, setSubject] = useState("Auto");
  const [mode, setMode] = useState<HomeworkMode>("detailed");
  const [image, setImage] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string; hint?: string } | null>(null);
  const [result, setResult] = useState<HomeworkRecord | null>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const [fileBusy, setFileBusy] = useState(false);

  const shown = openId ? (opened ?? null) : result;
  const visionOk = Boolean(health?.ai.configured && health.ai.visionModel);

  useEffect(() => {
    if (!openId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the draft when opening a saved solution
    setError(null);
  }, [openId]);

  const solve = async () => {
    if (busy) return;
    if (!question.trim() && !image && !attachment) {
      setError({ message: "Type a question, or attach a photo or document of the problem." });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await postJSON<{ solution: HomeworkSolution; verification: Verification }>("/api/homework", {
        question,
        subject: subject === "Auto" ? undefined : subject,
        mode,
        ...(image ? { image } : {}),
        ...(attachment ? { attachmentText: attachment.text.slice(0, 20_000), attachmentName: attachment.name } : {}),
      });
      const now = Date.now();
      const rec: HomeworkRecord = {
        id: newId("hw"),
        title: (question.trim() || res.solution.restatement).replace(/\s+/g, " ").slice(0, 80),
        question: question.trim() || (attachment ? `From ${attachment.name}` : "From an image"),
        subject: res.solution.subject,
        mode,
        hadImage: Boolean(image),
        solution: res.solution,
        verification: res.verification,
        createdAt: now,
        updatedAt: now,
      };
      await store.put("homework", rec);
      setResult(rec);
      if (openId) router.replace("/app/homework", { scroll: false });
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError("unknown", "Something went wrong.");
      setError({ code: e.code, message: e.message, hint: e.hint });
    } finally {
      setBusy(false);
    }
  };

  const onImage = async (file?: File) => {
    if (!file) return;
    try {
      setImage(await imageFileToDataUrl(file));
      setError(null);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "That image couldn't be used." });
    } finally {
      if (imgInput.current) imgInput.current.value = "";
    }
  };

  const onDoc = async (file?: File) => {
    if (!file) return;
    setFileBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await postForm<{ name: string; pages: { page: number; text: string }[] }>("/api/documents/extract", form);
      setAttachment({ name: res.name, text: res.pages.map((p) => p.text).join("\n\n") });
      setError(null);
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "That file couldn't be read." });
    } finally {
      setFileBusy(false);
      if (docInput.current) docInput.current.value = "";
    }
  };

  const toWhiteboard = (rec: HomeworkRecord) => {
    const q = `Explain this problem visually, step by step on the board: ${rec.question === "From an image" ? rec.solution.restatement : rec.question}\n\nThe answer I was given is: ${rec.solution.finalAnswer}`.slice(0, 1800);
    router.push(`/app/tutor?new=${Date.now()}&q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        eyebrow="Homework Solver"
        title="Work through a problem"
        description="Paste a question, snap a photo, or upload a worksheet. You get the method and every step — or just a hint first."
      />

      <div className="mt-7">
        {!healthLoading && !health?.ai.configured ? (
          <SetupNotice health={health} />
        ) : (
          <Card className="p-4 sm:p-5">
            <label htmlFor="hw-question" className="sr-only">
              Your question
            </label>
            <Textarea
              id="hw-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. A ball is thrown upward at 12 m/s. How high does it go?  ·  Solve 2x² − 8 = 0  ·  Why did the Roman Republic fall?"
              className="min-h-28 border-0 px-1 shadow-none focus:ring-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void solve();
              }}
            />
            {(image || attachment) && (
              <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
                {image && (
                  <span className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 p-1.5 pr-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                    <img src={image} alt="Attached problem" className="h-12 w-auto rounded-lg object-cover" />
                    <IconButton label="Remove image" size="sm" onClick={() => setImage(null)}>
                      <X className="size-4" />
                    </IconButton>
                  </span>
                )}
                {attachment && (
                  <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1 text-[12.5px]">
                    <FileText className="size-3.5" /> {attachment.name}
                    <IconButton label="Remove document" size="sm" onClick={() => setAttachment(null)}>
                      <X className="size-3.5" />
                    </IconButton>
                  </span>
                )}
              </div>
            )}
            <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-1">
                <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onImage(e.target.files?.[0])} />
                <input ref={docInput} type="file" accept={ACCEPTED_DOCS} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onDoc(e.target.files?.[0])} />
                <IconButton label={visionOk ? "Attach a photo of the problem" : "The configured model can't read images"} disabled={!visionOk} onClick={() => imgInput.current?.click()}>
                  <ImagePlus className="size-[18px]" />
                </IconButton>
                <IconButton label="Attach a PDF or text file" onClick={() => docInput.current?.click()} disabled={fileBusy}>
                  {fileBusy ? <Spinner /> : <FileText className="size-[18px]" />}
                </IconButton>
                <div className="w-40">
                  <label htmlFor="hw-subject" className="sr-only">
                    Subject
                  </label>
                  <Select id="hw-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 text-[13.5px]">
                    <option value="Auto">Any subject</option>
                    {SUBJECTS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="flex flex-1 items-center justify-between gap-3 sm:justify-end">
                <Segmented label="Explanation style" value={mode} onChange={setMode} options={MODES} size="sm" />
                <Button variant="primary" loading={busy} icon={<Sparkles className="size-4" />} onClick={() => void solve()}>
                  {busy ? "Solving…" : "Solve"}
                </Button>
              </div>
            </div>
          </Card>
        )}
        {error && (
          <div className="mt-3">
            <ErrorNotice error={error} onRetry={error.code && error.code !== "bad_request" ? () => void solve() : undefined} />
          </div>
        )}
      </div>

      {busy && (
        <div className="mt-8 flex items-center gap-3 text-sm text-muted" role="status">
          <Spinner /> Reading the problem and working it out…
        </div>
      )}

      {shown && !busy && (
        <div className="mt-8">
          {openId && (
            <p className="mb-3 text-[13px] text-muted">
              Saved {relativeTime(shown.createdAt)} · <span className="text-ink-2">{shown.question}</span>
            </p>
          )}
          <SolutionView key={shown.id} solution={shown.solution} verification={shown.verification} mode={shown.mode} onWhiteboard={() => toWhiteboard(shown)} />
        </div>
      )}

      {history.length > 0 && (
        <section className="mt-12">
          <h2 className="eyebrow mb-3">Recent solutions</h2>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {history.slice(0, 6).map((h) => (
              <li key={h.id}>
                <Link href={`/app/homework?id=${h.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{h.title}</span>
                    <span className="text-[12px] text-muted">
                      {h.subject} · {relativeTime(h.createdAt)}
                    </span>
                  </span>
                  <span className="hidden sm:block">
                    <VerificationBadge v={h.verification} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {history.length > 6 && (
            <Link href="/app/library?type=homework" className="mt-2 inline-block text-[13px] text-accent">
              See all in My Library →
            </Link>
          )}
        </section>
      )}
      {history.length === 0 && !shown && !busy && (
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {[
            ["Hint first", "Get a nudge, then reveal steps one at a time."],
            ["Shows the method", "Every step explains why, not just what."],
            ["Honest checks", "Numeric answers are re-checked with a calculator when possible."],
          ].map(([t, b]) => (
            <div key={t} className="rounded-2xl border border-border bg-surface/60 p-4">
              <Badge tone="accent">{t}</Badge>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{b}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
