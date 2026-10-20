"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserVoiceInput, createBrowserVoiceOutput } from "./browser";
import { RECOGNITION_MESSAGES, type VoiceInput, type VoiceOutput } from "./types";

export function useVoiceInput(onFinal: (text: string) => void, provider?: VoiceInput) {
  const [supported, setSupported] = useState(false);
  const input = useMemo(() => provider ?? (typeof window !== "undefined" ? createBrowserVoiceInput() : null), [provider]);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef(onFinal);
  useEffect(() => {
    finalRef.current = onFinal;
  }, [onFinal]);
  useEffect(() => {
    // Feature detection must run after hydration to avoid a server/client mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(Boolean(input?.supported));
    return () => input?.abort();
  }, [input]);

  const start = useCallback(() => {
    if (!input) return;
    setError(null);
    setInterim("");
    setListening(true);
    input.start({
      onInterim: setInterim,
      onFinal: (t) => finalRef.current(t),
      onError: (code) => {
        const msg = RECOGNITION_MESSAGES[code];
        if (msg) setError(msg);
      },
      onEnd: () => {
        setListening(false);
        setInterim("");
      },
    });
  }, [input]);

  const stop = useCallback(() => input?.stop(), [input]);
  const cancel = useCallback(() => {
    input?.abort();
    setListening(false);
    setInterim("");
  }, [input]);

  return { supported, listening, interim, error, start, stop, cancel, clearError: () => setError(null) };
}

export function useVoiceOutput(provider?: VoiceOutput) {
  const output = useMemo(() => provider ?? (typeof window !== "undefined" ? createBrowserVoiceOutput() : null), [provider]);
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<ReturnType<VoiceOutput["voices"]>>([]);
  const pending = useRef(0);

  useEffect(() => {
    if (!output?.supported) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(true);
    const refresh = () => setVoices(output.voices());
    refresh();
    window.speechSynthesis?.addEventListener?.("voiceschanged", refresh);
    return () => {
      window.speechSynthesis?.removeEventListener?.("voiceschanged", refresh);
      output.cancel();
    };
  }, [output]);

  const speak = useCallback(
    async (text: string, opts?: { voiceURI?: string; rate?: number }) => {
      if (!output?.supported) return;
      pending.current++;
      setSpeaking(true);
      try {
        await output.speak(text, opts);
      } finally {
        pending.current = Math.max(0, pending.current - 1);
        if (pending.current === 0) setSpeaking(false);
      }
    },
    [output],
  );

  const stop = useCallback(() => {
    output?.cancel();
    pending.current = 0;
    setSpeaking(false);
  }, [output]);

  return { supported, speaking, voices, speak, stop };
}
