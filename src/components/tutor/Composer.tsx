"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, BookOpenText, ImagePlus, Mic, MicOff, Square, X } from "lucide-react";
import { TUTOR_MODES, type TutorMode } from "@/lib/tutor/protocol";
import { MODE_LABEL } from "@/lib/tutor/session";
import { cn, imageFileToDataUrl } from "@/lib/utils";
import { IconButton } from "@/components/ui";

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
  image: string | null;
  onImage: (dataUrl: string | null) => void;
  imageSupported: boolean;
  docCount: number;
  onOpenSources: () => void;
}

export function Composer(p: ComposerProps) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);
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
      if (!p.busy && !p.disabled && p.value.trim()) p.onSubmit();
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    try {
      p.onImage(await imageFileToDataUrl(file));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "That image couldn't be used.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="border-t border-border bg-surface/80 p-3 backdrop-blur">
      {(p.voice.error || imageError) && (
        <p role="alert" className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
          {p.voice.error || imageError}
        </p>
      )}
      <div
        className={cn(
          "rounded-2xl border bg-surface shadow-sm transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-[var(--accent-soft)]",
          p.voice.listening ? "border-accent" : "border-border",
        )}
      >
        {p.image && (
          <div className="flex items-center gap-2 px-3 pt-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
            <img src={p.image} alt="Attached image" className="h-14 w-auto rounded-lg border border-border object-cover" />
            <IconButton label="Remove image" size="sm" onClick={() => p.onImage(null)}>
              <X className="size-4" />
            </IconButton>
          </div>
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
          disabled={p.disabled}
          readOnly={p.voice.listening}
          placeholder={p.disabled ? p.disabledReason : p.voice.listening ? "Listening…" : "Ask a question, or say where you're stuck…"}
          className="block max-h-[180px] w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:outline-none disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pickImage(e.target.files?.[0])} />
          <IconButton
            label={p.imageSupported ? "Attach an image" : "The configured model can't read images"}
            size="sm"
            disabled={!p.imageSupported || p.disabled}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="size-4" />
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
              disabled={p.disabled || !p.value.trim()}
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
