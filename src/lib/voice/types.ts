/**
 * Voice is split into two small interfaces so the browser implementations
 * (Web Speech API) can later be replaced by a streaming, full-duplex
 * provider without touching the tutor UI.
 *
 * Note: browser speech recognition is turn-based (listen → final transcript)
 * and quality varies by browser; it is not a low-latency duplex voice model.
 */

export type RecognitionErrorCode =
  | "not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "unsupported"
  | "language"
  | "aborted"
  | "unknown";

export interface VoiceInputHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: RecognitionErrorCode) => void;
  onEnd: () => void;
}

export interface VoiceInput {
  readonly supported: boolean;
  start(handlers: VoiceInputHandlers, lang?: string): void;
  stop(): void;
  abort(): void;
}

export interface VoiceOutput {
  readonly supported: boolean;
  /** Queue text to be spoken. Resolves when this utterance finishes (or is cancelled). */
  speak(text: string, opts?: { voiceURI?: string; rate?: number; onStart?: () => void }): Promise<void>;
  /** Stop speaking immediately and clear the queue. */
  cancel(): void;
  voices(): { uri: string; name: string; lang: string; local: boolean }[];
}

export const RECOGNITION_MESSAGES: Record<RecognitionErrorCode, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings, or keep typing.",
  "no-speech": "I didn't hear anything. Tap the mic and try again.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs a network connection in this browser.",
  unsupported: "Voice input isn't supported in this browser. Chrome, Edge and Safari support it — you can always type.",
  language: "Speech recognition doesn't support your language setting.",
  aborted: "",
  unknown: "Voice input stopped unexpectedly. Try again or type your question.",
};
