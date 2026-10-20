"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { AlertCircle, ArrowUp, BookOpenText, FileText, Loader2, Mic, MicOff, Paperclip, Presentation, Square, X } from "lucide-react";
import { TUTOR_MODES, type TutorMode } from "@/lib/tutor/protocol";
import { MODE_LABEL } from "@/lib/tutor/session";
import { ACCEPTED_DOCS, ACCEPTED_IMAGES } from "@/lib/client/documents";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui";

export type ComposerAttachment =
  | { id: string; kind: "image"; name: string; dataUrl: string }
  | { id: string; kind: "document"; name: string; status: "uploading" | "ready" | "error"; docId?: string; error?: string };

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  disabledReason?: string;
  mode: TutorMode;
  onModeChange: (m: TutorMode) => void;
  voice: {
    supported: boolean;
    listening: boolean;
    interim: string;
    error: string | null;
    onToggle: () => void;
  };
  attachments: ComposerAttachment[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  /** Problem with the last files picked (unsupported type, too many images…). */
  attachError: string | null;
  docCount: number;
  onOpenSources: () => void;
}

export function Composer(p: ComposerProps) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const uploading = p.attachments.some((a) => a.kind === "document" && a.status === "uploading");
  const canSend = !p.disabled && !uploading && (Boolean(p.value.trim()) || p.attachments.some((a) => a.kind === "image" || a.status === "ready"));
  const shown = p.voice.listening && p.voice.interim ? p.voice.interim : p.value;

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [shown]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!p.busy && canSend) p.onSubmit();
    }
  };

  const pickFiles = (list: FileList | null | undefined) => {
    const files = Array.from(list ?? []);
    if (files.length) p.onAddFiles(files);
    if (fileRef.current) fileRef.current.value = "";
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      p.onAddFiles(files);
    }
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (!p.disabled) pickFiles(e.dataTransfer.files);
  };

  return (
    <div className="border-t border-border bg-surface/80 p-3 backdrop-blur">
      {(p.voice.error || p.attachError) && (
        <p role="alert" className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
          {p.voice.error || p.attachError}
        </p>
      )}
      <div
        className={cn(
          "rounded-2xl border bg-surface shadow-sm transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-[var(--accent-soft)]",
          p.voice.listening || dragging ? "border-accent" : "border-border",
          dragging && "ring-4 ring-[var(--accent-soft)]",
        )}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {p.attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-3 pt-3" aria-label="Attachments">
            {p.attachments.map((a) => (
              <li key={a.id}>
                <AttachmentChip a={a} onRemove={() => p.onRemoveAttachment(a.id)} />
              </li>
            ))}
          </ul>
        )}
        <label htmlFor="tutor-input" className="sr-only">
          Ask the tutor
        </label>
        <textarea
          id="tutor-input"
          data-focus-ring="parent"
          ref={ta}
          rows={1}
          value={shown}
          onChange={(e) => p.onChange(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          disabled={p.disabled}
          readOnly={p.voice.listening}
          placeholder={p.disabled ? p.disabledReason : p.voice.listening ? "Listening…" : dragging ? "Drop files to attach…" : "Ask a question, or say where you're stuck…"}
          className="block max-h-[180px] w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:outline-none disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={`${ACCEPTED_DOCS},${ACCEPTED_IMAGES}`}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => pickFiles(e.target.files)}
          />
          <IconButton label="Attach files (PDF, Word, PowerPoint, images)" size="sm" disabled={p.disabled} onClick={() => fileRef.current?.click()}>
            <Paperclip className="size-4" />
          </IconButton>
          <button
            type="button"
            onClick={p.onOpenSources}
            disabled={p.disabled}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-colors disabled:opacity-40",
              p.docCount ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2",
            )}
            aria-label={p.docCount ? `${p.docCount} document source${p.docCount > 1 ? "s" : ""} attached` : "Attach documents"}
          >
            <BookOpenText className="size-4" />
            <span className="hidden sm:inline">{p.docCount ? `${p.docCount} source${p.docCount > 1 ? "s" : ""}` : "Sources"}</span>
          </button>
          <label className="sr-only" htmlFor="tutor-mode">
            Teaching mode
          </label>
          <select
            id="tutor-mode"
            value={p.mode}
            onChange={(e) => p.onModeChange(e.target.value as TutorMode)}
            className="h-8 min-w-0 max-w-[124px] cursor-pointer truncate rounded-full bg-transparent px-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 focus:outline-none"
          >
            {TUTOR_MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          {p.voice.supported ? (
            <IconButton
              label={p.voice.listening ? "Stop listening" : "Speak your question"}
              size="sm"
              onClick={p.voice.onToggle}
              disabled={p.disabled}
              className={cn(p.voice.listening && "animate-pulse-ring bg-accent text-accent-ink hover:bg-accent hover:text-accent-ink")}
            >
              {p.voice.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </IconButton>
          ) : (
            <IconButton label="Voice input isn't supported in this browser — type instead" size="sm" disabled>
              <MicOff className="size-4" />
            </IconButton>
          )}
          {p.busy ? (
            <IconButton label="Stop generating" size="sm" onClick={p.onStop} className="bg-ink text-bg hover:bg-ink hover:text-bg hover:opacity-90">
              <Square className="size-3.5 fill-current" />
            </IconButton>
          ) : (
            <IconButton
              label="Send"
              size="sm"
              onClick={p.onSubmit}
              disabled={!canSend}
              className="bg-ink text-bg hover:bg-ink hover:text-bg hover:opacity-90"
            >
              <ArrowUp className="size-4" />
            </IconButton>
          )}
        </div>
      </div>
      <p className="mt-1.5 hidden px-1 text-[11px] text-muted sm:block">Enter to send · Shift+Enter for a new line · AI can make mistakes — check important answers.</p>
    </div>
  );
}

function AttachmentChip({ a, onRemove }: { a: ComposerAttachment; onRemove: () => void }) {
  if (a.kind === "image") {
    return (
      <span className="relative block">
        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
        <img src={a.dataUrl} alt={a.name} className="h-14 w-auto max-w-[120px] rounded-lg border border-border object-cover" />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${a.name}`}
          className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm hover:text-ink"
        >
          <X className="size-3" />
        </button>
      </span>
    );
  }
  const Icon = a.status === "uploading" ? Loader2 : a.status === "error" ? AlertCircle : /\.pptx$/i.test(a.name) ? Presentation : FileText;
  return (
    <span
      className={cn(
        "flex h-14 max-w-[220px] items-center gap-2 rounded-lg border bg-surface-2 py-1 pl-2.5 pr-1.5 text-[12.5px]",
        a.status === "error" ? "border-warning text-warning" : "border-border text-ink-2",
      )}
      title={a.error ?? a.name}
    >
      <Icon className={cn("size-4 shrink-0", a.status === "uploading" && "animate-spin", a.status === "ready" && "text-accent")} aria-hidden />
      <span className="min-w-0">
        <span className="block truncate font-medium">{a.name}</span>
        <span className="block truncate text-[11px] text-muted">{a.status === "uploading" ? "Reading…" : a.status === "error" ? a.error : "Ready"}</span>
      </span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${a.name}`} className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink">
        <X className="size-3.5" />
      </button>
    </span>
  );
}
