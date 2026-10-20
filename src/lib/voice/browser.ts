"use client";

import type { RecognitionErrorCode, VoiceInput, VoiceInputHandlers, VoiceOutput } from "./types";

/* Minimal typings for the (still prefixed in Chrome) Web Speech recognition API. */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function mapError(err: string): RecognitionErrorCode {
  switch (err) {
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed";
    case "no-speech":
      return "no-speech";
    case "audio-capture":
      return "audio-capture";
    case "network":
      return "network";
    case "language-not-supported":
      return "language";
    case "aborted":
      return "aborted";
    default:
      return "unknown";
  }
}

export function createBrowserVoiceInput(): VoiceInput {
  const Ctor = recognitionCtor();
  let rec: SpeechRecognitionLike | null = null;
  return {
    supported: Boolean(Ctor),
    start(handlers: VoiceInputHandlers, lang?: string) {
      if (!Ctor) {
        handlers.onError("unsupported");
        handlers.onEnd();
        return;
      }
      rec?.abort();
      const r = new Ctor();
      rec = r;
      r.lang = lang || navigator.language || "en-US";
      r.continuous = false;
      r.interimResults = true;
      let finalText = "";
      r.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText += res[0].transcript;
          else interim += res[0].transcript;
        }
        handlers.onInterim((finalText + interim).trim());
      };
      r.onerror = (e) => handlers.onError(mapError(e.error));
      r.onend = () => {
        if (rec === r) rec = null;
        if (finalText.trim()) handlers.onFinal(finalText.trim());
        handlers.onEnd();
      };
      try {
        r.start();
      } catch {
        handlers.onError("unknown");
        handlers.onEnd();
      }
    },
    stop() {
      rec?.stop();
    },
    abort() {
      rec?.abort();
      rec = null;
    },
  };
}

export function createBrowserVoiceOutput(): VoiceOutput {
  const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  let generation = 0;
  return {
    supported: Boolean(synth),
    speak(text, opts = {}) {
      if (!synth || !text.trim()) return Promise.resolve();
      const gen = generation;
      return new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        const voice = opts.voiceURI ? synth.getVoices().find((v) => v.voiceURI === opts.voiceURI) : undefined;
        if (voice) u.voice = voice;
        u.rate = opts.rate ?? 1;
        u.onstart = () => gen === generation && opts.onStart?.();
        u.onend = () => resolve();
        u.onerror = () => resolve();
        synth.speak(u);
      });
    },
    cancel() {
      generation++;
      synth?.cancel();
    },
    voices() {
      if (!synth) return [];
      return synth.getVoices().map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, local: v.localService }));
    },
  };
}
