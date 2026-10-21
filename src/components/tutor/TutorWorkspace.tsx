"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookmarkPlus, Check, CheckCircle2, Hourglass, MessagesSquare, PencilRuler, Shuffle, Volume2, VolumeX } from "lucide-react";
import { boardIndexFromElements, emptyCursor, type Cursor, type RegisteredItem } from "@/lib/board/layout";
import { clearScene, cursorForScene, renderActions, snapshotScene, type BoardHandle } from "@/lib/board/render";
import { ApiError, streamTutor } from "@/lib/client/api";
import { attachmentKind, ingestDocument, leadExcerpts, retrieveExcerpts, type Excerpt } from "@/lib/client/documents";
import type { ComposerAttachment } from "./Composer";
import { MAX_IMAGES } from "@/lib/tutor/protocol";
import { useHealth } from "@/lib/client/health";
import { usePersonalization, useProfile } from "@/lib/client/profile";
import { newId, store } from "@/lib/store";
import type { StoredMessage, TutorSession } from "@/lib/store/types";
import type { TutorEvent, TutorMode, TutorRequest } from "@/lib/tutor/protocol";
import { assistantContextText, createSession, historyForRequest, mergeBoardIndex, STARTER_PROMPTS } from "@/lib/tutor/session";
import { cn, imageFileToDataUrl, speakableText } from "@/lib/utils";
import { useVoiceInput, useVoiceOutput } from "@/lib/voice/hooks";
import { Blur, Reveal } from "@/components/Motion";
import { boardDelay, drawSpeed, readingDelay, stepPause } from "@/lib/tutor/pace";
import { formatCountdown, useCountdown } from "@/lib/client/countdown";
import { Badge, Button, ConfirmDialog, IconButton, Spinner } from "@/components/ui";
import { SetupNotice } from "@/components/SetupNotice";
import { Board } from "./Board";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { SourcesPanel } from "./SourcesPanel";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function titleFrom(text: string) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").slice(0, 7).join(" ");
  return words.length > 56 ? `${words.slice(0, 56)}…` : words || "New session";
}

interface Turn {
  cursor: Cursor;
  registered: RegisteredItem[];
  cleared: boolean;
  speech: Promise<void>;
  fast: boolean;
  mute: boolean;
  /** The student cut the reply short at a check-in; skip whatever is left of it. */
  stopped: boolean;
  /** Question to ask once this turn has wrapped up (from a check-in answer). */
  next?: { text: string; checkIn?: string };
}

interface AskOptions {
  /** The message answers this check-in question; the tutor judges whether the student understood. */
  checkIn?: string;
  /** The student spoke this message, so keep the conversation going by voice. */
  viaVoice?: boolean;
}

/** How the student answered a mid-lesson check-in. */
export type CheckAnswer = { kind: "yes" } | { kind: "no" } | { kind: "reply"; text: string };

export function TutorWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const sid = params.get("s");
  const fresh = params.get("new");
  const seedQuestion = params.get("q");
  const seedDoc = params.get("doc");

  const { data: health, loading: healthLoading } = useHealth();
  const { profile, update: updateProfile } = useProfile();
  const personalization = usePersonalization();
  const aiReady = Boolean(health?.ai.configured);

  const [session, setSession] = useState<TutorSession | null>(null);
  const sessionRef = useRef<TutorSession | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [status, setStatus] = useState<"idle" | "thinking" | "streaming">("idle");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"board" | "chat">("chat");
  const [boardEmpty, setBoardEmpty] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [flagged, setFlagged] = useState<"review" | "mastered" | null>(null);

  const boardRef = useRef<BoardHandle | null>(null);
  const [boardReady, setBoardReady] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const turnRef = useRef<Turn | null>(null);
  const checkRef = useRef<((a: CheckAnswer) => void) | null>(null);
  const [checking, setChecking] = useState(false);
  const askRef = useRef<(text: string, opts?: AskOptions) => Promise<void>>(async () => {});
  /** A closing check-in question the student hasn't answered yet; their next message answers it. */
  const pendingCheckRef = useRef<string | null>(null);
  /** The student is talking to the tutor; listen again after it asks them something. */
  const voiceTurnRef = useRef(false);
  const listenRef = useRef<() => void>(() => {});
  const [cooldownUntil, setCooldownState] = useState<number | null>(null);
  const cooldownRef = useRef<number | null>(null);
  const setCooldownUntil = useCallback((until: number) => {
    cooldownRef.current = until;
    setCooldownState(until);
  }, []);
  const cooldownLeft = useCountdown(cooldownUntil);
  const [fallback, setFallback] = useState<{ from: string; to: string; until: number } | null>(null);
  const fallbackLeft = useCountdown(fallback?.until);
  const autoIdRef = useRef(0);
  const stepRef = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seededRef = useRef<string | null>(null);

  const voiceOut = useVoiceOutput();
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const commit = useCallback((next: TutorSession) => {
    sessionRef.current = next;
    setSession(next);
  }, []);
  const mutate = useCallback(
    (fn: (s: TutorSession) => TutorSession) => {
      if (sessionRef.current) commit(fn(sessionRef.current));
    },
    [commit],
  );

  /* ------------------------------------------------------------ loading */
  useEffect(() => {
    let alive = true;
    if (sid && sessionRef.current?.id === sid) return;
    (async () => {
      if (sid) {
        const s = await store.get("sessions", sid);
        if (!alive) return;
        if (!s) {
          setNotFound(true);
          return;
        }
        setNotFound(false);
        autoIdRef.current = s.autoId ?? 0;
        stepRef.current = s.stepCounter ?? 0;
        commit(s);
        const hasBoard = Boolean(s.board?.elements?.some((e) => !(e as { isDeleted?: boolean }).isDeleted));
        setBoardEmpty(!hasBoard);
        setTab(hasBoard ? "board" : "chat");
      } else {
        const s = createSession(newId("ses"));
        if (seedDoc) s.docIds = [seedDoc];
        autoIdRef.current = 0;
        stepRef.current = 0;
        setNotFound(false);
        commit(s);
        setBoardEmpty(true);
        setTab("chat");
      }
      setFlagged(null);
      setSavedAt(null);
    })();
    return () => {
      alive = false;
    };
  }, [sid, fresh, seedDoc, commit]);

  /* -------------------------------------------------------- persistence */
  const persist = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    const board = boardRef.current ? snapshotScene(boardRef.current) : s.board;
    const hasContent = s.messages.length > 0 || (board?.elements.length ?? 0) > 0;
    if (!hasContent) return;
    const next: TutorSession = {
      ...s,
      board,
      boardIndex: boardRef.current ? boardIndexFromElements(boardRef.current.api.getSceneElements()) : s.boardIndex,
      autoId: autoIdRef.current,
      stepCounter: stepRef.current,
      title: s.title === "New session" && s.messages.length === 0 ? "Whiteboard sketch" : s.title,
      updatedAt: Date.now(),
    };
    commit(next);
    await store.put("sessions", next);
    setSavedAt(Date.now());
    if (new URLSearchParams(location.search).get("s") !== next.id) {
      router.replace(`/app/tutor?s=${next.id}`, { scroll: false });
    }
  }, [commit, router]);

  const onSceneChange = useCallback(() => {
    const h = boardRef.current;
    if (h) setBoardEmpty(h.api.getSceneElements().length === 0);
    if (busyRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(), 1200);
  }, [persist]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    abortRef.current?.abort();
    checkRef.current?.({ kind: "yes" });
  }, []);

  /* ------------------------------------------------------------ asking */
  const updateMessage = useCallback(
    (id: string, fn: (m: StoredMessage) => StoredMessage) => mutate((s) => ({ ...s, messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) })),
    [mutate],
  );

  const ask = useCallback(
    async (raw: string, opts: AskOptions = {}) => {
      const text = raw.trim();
      const s = sessionRef.current;
      if (!text || !s || busyRef.current) return;
      if (cooldownRef.current && cooldownRef.current > Date.now()) return;
      busyRef.current = true;
      pendingCheckRef.current = null;
      voiceTurnRef.current = Boolean(opts.viaVoice);
      voiceOut.stop();
      const animate = !prefersReducedMotion();
      const pace = profile.pace ?? "normal";

      const imgs = attachments.flatMap((a) => (a.kind === "image" ? [a.dataUrl] : []));
      const newDocIds = attachments.flatMap((a) => (a.kind === "document" && a.status === "ready" && a.docId ? [a.docId] : []));
      const sent = attachments.filter((a) => a.kind === "image" || a.status === "ready").map((a) => ({ name: a.name, kind: a.kind }));
      const userMsg: StoredMessage = {
        id: newId("m"),
        role: "user",
        content: text,
        hadImage: imgs.length > 0,
        ...(sent.length ? { attachments: sent } : {}),
        createdAt: Date.now(),
      };
      const aId = newId("m");
      const aMsg: StoredMessage = { id: aId, role: "assistant", content: "", steps: [], followups: [], notices: [], createdAt: Date.now() + 1 };
      const prior = s.messages;
      mutate((x) => ({
        ...x,
        title: x.title === "New session" || x.title === "Whiteboard sketch" ? titleFrom(text) : x.title,
        messages: [...x.messages, userMsg, aMsg],
        updatedAt: Date.now(),
      }));
      setInput("");
      setAttachments([]);
      setAttachError(null);
      setBusy(true);
      setStatus("thinking");
      setStreamingId(aId);

      let citations: StoredMessage["citations"];
      let excerpts: TutorRequest["excerpts"] = [];
      const docIds = [...new Set([...s.docIds, ...newDocIds])];
      if (docIds.length) {
        try {
          const lastTutor = [...prior].reverse().find((m) => m.role === "assistant")?.content ?? "";
          const r = await retrieveExcerpts(docIds, `${text} ${lastTutor.slice(0, 300)}`);
          // Files attached with this question are about this question: always include their opening.
          const lead = newDocIds.length ? await leadExcerpts(newDocIds) : [];
          const key = (e: Excerpt) => `${e.source}#${e.page}#${e.text.slice(0, 40)}`;
          const merged = new Map<string, Excerpt>();
          for (const e of [...lead, ...r.excerpts]) if (!merged.has(key(e))) merged.set(key(e), e);
          excerpts = [...merged.values()].slice(0, 8);
          const seen = new Set<string>();
          citations = excerpts
            .map((e) => ({ source: e.source, page: e.page, ...(e.unit ? { unit: e.unit } : {}) }))
            .filter((c) => {
              const k = `${c.source}#${c.page}`;
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
          if (excerpts.length === 0) {
            updateMessage(aId, (m) => ({ ...m, notices: [...(m.notices ?? []), "No matching passages were found in your attached documents."] }));
          }
        } catch {
          updateMessage(aId, (m) => ({ ...m, notices: [...(m.notices ?? []), "Couldn't search your documents for this question."] }));
        }
      }

      const req: TutorRequest = {
        messages: historyForRequest([...prior, userMsg]),
        board: boardRef.current ? boardIndexFromElements(boardRef.current.api.getSceneElements()) : s.boardIndex,
        mode: s.mode,
        subject: s.subject,
        profile: personalization.profile,
        excerpts,
        images: imgs,
        ...(opts.checkIn && (s.mode === "explain" || s.mode === "simpler") ? { checkIn: { question: opts.checkIn.slice(0, 300) } } : {}),
      };

      const turn: Turn = {
        cursor: boardRef.current ? cursorForScene(boardRef.current) : emptyCursor(),
        registered: [],
        cleared: false,
        speech: Promise.resolve(),
        fast: false,
        mute: !profile.voice.autoSpeak,
        stopped: false,
      };
      turnRef.current = turn;
      const controller = new AbortController();
      abortRef.current = controller;
      let switchedToBoard = false;

      // Event types in arrival order, so a check-in can tell whether lesson steps follow it.
      const arrived: TutorEvent["type"][] = [];
      let streamEnded = false;
      const handle = async (ev: TutorEvent, index: number) => {
        if (turn.stopped) return;
        switch (ev.type) {
          case "thinking":
            setStatus((st) => (st === "idle" ? st : "thinking"));
            break;
          case "title":
            mutate((x) => ({ ...x, title: ev.title, subject: x.subject ?? ev.subject }));
            break;
          case "say": {
            setStatus("streaming");
            if (!turn.fast) {
              await turn.speech;
              // Leave a beat between steps so each one can sink in.
              if (sessionRef.current?.messages.find((m) => m.id === aId)?.steps?.length) await sleep(stepPause(pace));
            }
            if (!turn.mute && !turn.fast) {
              turn.speech = voiceOut.speak(speakableText(ev.text), { voiceURI: profile.voice.uri, rate: profile.voice.rate });
            } else if (!turn.fast) {
              // Voice off: hold the next step back until this one has been read.
              turn.speech = sleep(readingDelay(ev.text, pace));
            }
            updateMessage(aId, (m) => ({ ...m, steps: [...(m.steps ?? []), { say: ev.text, actions: [] }] }));
            break;
          }
          case "board": {
            if (ev.rejected.length) {
              if (process.env.NODE_ENV !== "production") console.debug("[chalkmind] rejected board actions", ev.rejected);
              const kinds = [...new Set(ev.rejected.map((r) => r.type.replace(/^add_/, "")))].join(", ");
              const n = ev.rejected.length;
              updateMessage(aId, (m) => ({
                ...m,
                notices: [...(m.notices ?? []), `${n} board item${n > 1 ? "s" : ""} (${kinds}) ${n > 1 ? "were" : "was"} skipped because ${n > 1 ? "they" : "it"} didn't pass validation.`],
              }));
            }
            if (ev.actions.length === 0) break;
            const h = boardRef.current;
            if (!h) {
              updateMessage(aId, (m) => ({ ...m, notices: [...(m.notices ?? []), "The whiteboard isn't available, so this step is shown as text only."] }));
              break;
            }
            if (!switchedToBoard) {
              switchedToBoard = true;
              setTab("board");
            }
            const step = ++stepRef.current;
            updateMessage(aId, (m) => {
              const steps = [...(m.steps ?? [])];
              if (steps.length === 0) steps.push({ say: "", actions: [] });
              steps[steps.length - 1] = { ...steps[steps.length - 1], boardStep: step };
              return { ...m, steps };
            });
            for (const action of ev.actions) {
              try {
                const res = await renderActions(h, [action], {
                  cursor: turn.cursor,
                  autoId: () => `item${++autoIdRef.current}`,
                  step,
                  animate: animate && !turn.fast,
                  // Drawing is the lesson itself, so it follows the student's setting rather than reduced motion.
                  handwriting: profile.drawAnimation !== false,
                  ...(profile.drawAnimation !== false && !turn.fast ? { draw: { speed: drawSpeed(pace), skip: () => turn.fast || turn.stopped } } : {}),
                });
                turn.cursor = res.cursor;
                if (res.cleared) {
                  turn.cleared = true;
                  turn.registered = [];
                }
                turn.registered.push(...res.registered);
                updateMessage(aId, (m) => {
                  const steps = [...(m.steps ?? [])];
                  const last = steps[steps.length - 1];
                  steps[steps.length - 1] = { ...last, actions: [...last.actions, action] };
                  return { ...m, steps, notices: res.warnings.length ? [...(m.notices ?? []), ...res.warnings] : m.notices };
                });
              } catch {
                updateMessage(aId, (m) => ({ ...m, notices: [...(m.notices ?? []), `Couldn't draw a ${action.type.replace("add_", "")} on the board.`] }));
              }
              setBoardEmpty(h.api.getSceneElements().length === 0);
              if (!turn.fast) await sleep(animate ? boardDelay(pace) : boardDelay(pace) / 2);
            }
            break;
          }
          case "check": {
            // Only explain/simpler lessons pause; skip check-ins once the student hit Stop.
            if (turn.fast || (s.mode !== "explain" && s.mode !== "simpler")) break;
            await turn.speech;
            if (streamEnded && !arrived.slice(index + 1).some((t) => t === "say" || t === "board")) {
              // Nothing left to pause before: show it as the closing question; the student's next message answers it.
              if (!turn.mute) turn.speech = voiceOut.speak(speakableText(ev.question), { voiceURI: profile.voice.uri, rate: profile.voice.rate });
              updateMessage(aId, (m) => ({ ...m, steps: [...(m.steps ?? []), { say: ev.question, actions: [] }] }));
              pendingCheckRef.current = ev.question;
              break;
            }
            const lastSay = [...(sessionRef.current?.messages.find((m) => m.id === aId)?.steps ?? [])].reverse().find((st) => st.say)?.say ?? "";
            updateMessage(aId, (m) => ({ ...m, steps: [...(m.steps ?? []), { say: "", actions: [], check: { question: ev.question } }] }));
            if (!turn.mute) turn.speech = voiceOut.speak(speakableText(ev.question), { voiceURI: profile.voice.uri, rate: profile.voice.rate });
            setChecking(true);
            if (voiceTurnRef.current && !turn.mute) void turn.speech.then(() => checkRef.current && listenRef.current());
            const answer = await new Promise<CheckAnswer>((resolve) => {
              checkRef.current = resolve;
            });
            checkRef.current = null;
            setChecking(false);
            updateMessage(aId, (m) => {
              const steps = [...(m.steps ?? [])];
              const i = steps.findLastIndex((st) => st.check && !st.check.answer);
              if (i >= 0) steps[i] = { ...steps[i], check: { ...steps[i].check!, answer: answer.kind } };
              return { ...m, steps };
            });
            if (answer.kind === "yes") break;
            // Drop the rest of this reply and take the student's answer as the next question.
            turn.stopped = true;
            voiceOut.stop();
            controller.abort();
            turn.next = {
              text:
                answer.kind === "reply"
                  ? answer.text
                  : lastSay
                    ? `I don't quite get this part yet: "${lastSay.slice(0, 300).trim()}" Can you explain it a different way?`
                    : "I don't quite get this part yet. Can you explain it a different way?",
              checkIn: ev.question,
            };
            break;
          }
          case "verdict":
            updateMessage(aId, (m) => ({ ...m, verdict: { understood: ev.understood, note: ev.note } }));
            break;
          case "fallback":
            setFallback({ from: ev.from, to: ev.to, until: Date.now() + ev.retryAfterSec * 1000 });
            updateMessage(aId, (m) => ({ ...m, servedBy: ev.to }));
            break;
          case "followups":
            updateMessage(aId, (m) => ({ ...m, followups: ev.items }));
            break;
          case "signal":
            if (profile.personalize) {
              const now = Date.now();
              void store.put("signals", {
                id: newId("sig"),
                title: ev.topic,
                topic: ev.topic,
                kind: ev.kind,
                note: ev.note,
                subject: sessionRef.current?.subject,
                source: "tutor",
                createdAt: now,
                updatedAt: now,
              });
            }
            break;
          case "notice":
            updateMessage(aId, (m) => ({ ...m, notices: [...(m.notices ?? []), ev.message] }));
            break;
          case "error": {
            const retryAt = ev.code === "rate_limited" && ev.retryAfterSec ? Date.now() + ev.retryAfterSec * 1000 : undefined;
            if (retryAt) setCooldownUntil(retryAt);
            updateMessage(aId, (m) => ({ ...m, error: { code: ev.code, message: ev.message, hint: ev.hint, ...(retryAt ? { retryAt } : {}) } }));
            break;
          }
          default:
            break;
        }
      };

      let chain: Promise<void> = Promise.resolve();
      try {
        await streamTutor(req, (ev) => {
          const index = arrived.push(ev.type) - 1;
          chain = chain.then(() => handle(ev, index)).catch(() => undefined);
        }, controller.signal);
      } catch (err) {
        const e = err instanceof ApiError ? err : new ApiError("unknown", "Something went wrong.");
        if (e.code === "aborted" && turn.stopped) {
          // Cut short at a check-in: nothing to report.
        } else if (e.code === "aborted") {
          updateMessage(aId, (m) => ({ ...m, notices: [...(m.notices ?? []), "Stopped."] }));
        } else {
          const retryAt = e.code === "rate_limited" ? Date.now() + (e.retryAfterSec ?? 30) * 1000 : undefined;
          if (retryAt) setCooldownUntil(retryAt);
          updateMessage(aId, (m) => ({ ...m, error: { code: e.code, message: e.message, hint: e.hint, ...(retryAt ? { retryAt } : {}) } }));
        }
      }
      streamEnded = true;
      await chain;

      const finalMsg = sessionRef.current?.messages.find((m) => m.id === aId);
      if (finalMsg) {
        const hasSteps = (finalMsg.steps ?? []).some((st) => st.say || st.actions.length);
        updateMessage(aId, (m) => ({
          ...m,
          content: hasSteps ? assistantContextText(m, turn.registered) : "",
          citations,
          error: m.error ?? (!hasSteps && !controller.signal.aborted ? { code: "empty", message: "The tutor didn't return an answer. Try rephrasing or asking again." } : undefined),
        }));
      }
      mutate((x) => ({ ...x, boardIndex: mergeBoardIndex(x.boardIndex, turn.registered, turn.cleared) }));
      busyRef.current = false;
      setBusy(false);
      setStatus("idle");
      setStreamingId(null);
      abortRef.current = null;
      await persist();
      if (turn.next) void askRef.current(turn.next.text, { checkIn: turn.next.checkIn, viaVoice: voiceTurnRef.current });
      else if (pendingCheckRef.current && voiceTurnRef.current && !turn.mute) {
        // The reply ended on a question: listen for the spoken answer.
        void turn.speech.then(() => pendingCheckRef.current && !busyRef.current && listenRef.current());
      }
    },
    [attachments, mutate, personalization.profile, persist, profile, setCooldownUntil, updateMessage, voiceOut],
  );

  /* Auto-send a question handed over from the Homework Solver. */
  useEffect(() => {
    if (!seedQuestion || !session || !boardReady || !aiReady || seededRef.current === session.id) return;
    if (session.messages.length > 0) return;
    seededRef.current = session.id;
    void Promise.resolve().then(() => ask(seedQuestion));
  }, [seedQuestion, session, boardReady, aiReady, ask]);

  useEffect(() => {
    askRef.current = ask;
  }, [ask]);

  /* ------------------------------------------------------- attachments */
  const addFiles = async (files: File[]) => {
    setAttachError(null);
    const visionOk = Boolean(health?.ai.configured && health.ai.visionModel);
    let images = attachments.filter((a) => a.kind === "image").length;
    const problems: string[] = [];
    for (const file of files) {
      const kind = attachmentKind(file);
      const id = newId("att");
      if (kind === "image") {
        if (!visionOk) {
          problems.push("The connected model can't read images.");
          continue;
        }
        if (images >= MAX_IMAGES) {
          problems.push(`You can attach up to ${MAX_IMAGES} images per question.`);
          continue;
        }
        images++;
        try {
          const dataUrl = await imageFileToDataUrl(file);
          setAttachments((list) => [...list, { id, kind: "image", name: file.name || "Image", dataUrl }]);
        } catch (err) {
          images--;
          problems.push(`${file.name}: ${err instanceof Error ? err.message : "couldn't be used."}`);
        }
      } else if (kind === "document") {
        setAttachments((list) => [...list, { id, kind: "document", name: file.name, status: "uploading" }]);
        ingestDocument(file, { embeddings: Boolean(health?.embeddings.configured) })
          .then((doc) => {
            setAttachments((list) => list.map((a) => (a.id === id ? { ...a, status: "ready" as const, docId: doc.id } : a)));
            // Attached files stay available as sources for the rest of the session.
            mutate((x) => (x.docIds.includes(doc.id) ? x : { ...x, docIds: [...x.docIds, doc.id] }));
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : "Couldn't read this file.";
            setAttachments((list) => list.map((a) => (a.id === id ? { ...a, status: "error" as const, error: msg } : a)));
          });
      } else {
        problems.push(`${file.name}: unsupported file type. Attach a PDF, Word, PowerPoint, text file or image.`);
      }
    }
    if (problems.length) setAttachError([...new Set(problems)].join(" "));
  };

  /** Answer a pending check-in, or ask normally when the lesson isn't paused. */
  const submit = useCallback(
    (text: string, viaVoice = false) => {
      const hasFiles = attachments.some((a) => a.kind === "image" || a.status === "ready");
      const t = text.trim() || (hasFiles && !checkRef.current ? "Can you help me understand what I attached?" : "");
      if (!t) return;
      if (checkRef.current) {
        setInput("");
        voiceTurnRef.current = viaVoice;
        checkRef.current({ kind: "reply", text: t });
      } else void ask(t, { checkIn: pendingCheckRef.current ?? undefined, viaVoice });
    },
    [ask, attachments],
  );
  const answerCheck = useCallback((a: CheckAnswer) => checkRef.current?.(a), []);

  /* ------------------------------------------------------------- voice */
  const voiceIn = useVoiceInput(
    useCallback(
      (text: string) => {
        if (profile.voice.autoSend) submit(text, true);
        else setInput((v) => (v ? `${v} ${text}` : text));
      },
      [submit, profile.voice.autoSend],
    ),
  );
  useEffect(() => {
    listenRef.current = () => {
      if (!voiceIn.listening && profile.voice.autoSend) voiceIn.start();
    };
  }, [voiceIn, profile.voice.autoSend]);
  const toggleMic = () => {
    if (voiceIn.listening) voiceIn.stop();
    else {
      voiceOut.stop(); // barge-in: talking interrupts the tutor
      if (turnRef.current) turnRef.current.mute = true;
      voiceIn.start();
    }
  };

  const stopGenerating = () => {
    if (turnRef.current) turnRef.current.fast = true;
    checkRef.current?.({ kind: "yes" });
    voiceOut.stop();
    abortRef.current?.abort();
  };
  const stopSpeaking = () => {
    if (turnRef.current) turnRef.current.mute = true;
    voiceOut.stop();
  };

  /* ------------------------------------------------------------- board */
  const onBoardReady = useCallback((h: BoardHandle | null) => {
    boardRef.current = h;
    setBoardReady(Boolean(h));
  }, []);

  const doClear = () => {
    setConfirmClear(false);
    const h = boardRef.current;
    if (!h) return;
    clearScene(h);
    setBoardEmpty(true);
    mutate((x) => ({ ...x, boardIndex: [] }));
    void persist();
  };

  const showStep = (step: number) => {
    const h = boardRef.current;
    if (!h) return;
    const els = h.api.getSceneElements().filter((e) => e.customData?.cmStep === step);
    if (els.length) {
      setTab("board");
      h.api.scrollToContent(els, { animate: !prefersReducedMotion(), duration: 350 });
    }
  };

  const retry = () => {
    const s = sessionRef.current;
    if (!s) return;
    const lastUser = [...s.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const idx = s.messages.lastIndexOf(lastUser);
    commit({ ...s, messages: s.messages.slice(0, idx) });
    void ask(lastUser.content);
  };

  const flag = async (kind: "review" | "mastered") => {
    const s = sessionRef.current;
    if (!s || s.messages.length === 0) return;
    const now = Date.now();
    await store.put("signals", {
      id: newId("sig"),
      title: s.title,
      topic: s.title,
      subject: s.subject,
      kind: kind === "review" ? "review_flag" : "mastered",
      source: "student",
      createdAt: now,
      updatedAt: now,
    });
    setFlagged(kind);
  };

  const setMode = (mode: TutorMode) => mutate((x) => ({ ...x, mode }));

  const docCount = session?.docIds.length ?? 0;
  const emptyState = useMemo(
    () => (
      <div className="flex flex-col items-start gap-4 pb-4">
        <div>
          <p className="eyebrow mb-2">New session</p>
          <h2 className="text-xl font-semibold tracking-[-0.025em]">
            <Blur text="What do you want to understand?" delay={60} />
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">Type or speak a question. The tutor explains out loud and works through it on the board, step by step. Ask follow-ups any time.</p>
        </div>
        <div className="flex flex-col gap-1.5 self-stretch">
          {STARTER_PROMPTS.map((p, i) => (
            <Reveal key={p} delay={0.15 + i * 0.07} distance={14}>
              <button
                type="button"
                disabled={!aiReady}
                onClick={() => void ask(p)}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left text-[13.5px] text-ink-2 shadow-sm transition-colors hover:border-accent hover:text-ink disabled:opacity-50"
              >
                {p}
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    ),
    [aiReady, ask],
  );

  if (notFound) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold">Session not found</h1>
          <p className="mt-1 text-sm text-muted">It may have been deleted, or it&apos;s saved on another device.</p>
          <Button className="mt-4" variant="primary" onClick={() => router.push(`/app/tutor?new=${Date.now()}`)}>
            Start a new session
          </Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading session" />
      </div>
    );
  }

  const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant");
  const liveCaption = busy ? lastAssistant?.steps?.[lastAssistant.steps.length - 1]?.say : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface/70 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-[14px] font-semibold tracking-tight">{session.title}</h1>
          {session.subject && (
            <span className="hidden sm:block">
              <Badge>{session.subject}</Badge>
            </span>
          )}
          {savedAt && !busy && (
            <span className="hidden items-center gap-1 text-[11.5px] text-muted md:inline-flex">
              <Check className="size-3" /> Saved
            </span>
          )}
        </div>
        <div className="flex rounded-full border border-border bg-surface-2 p-0.5 lg:hidden" role="tablist" aria-label="Workspace view">
          {(["board", "chat"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium", tab === t ? "bg-surface text-ink shadow-sm" : "text-muted")}
            >
              {t === "board" ? <PencilRuler className="size-3.5" /> : <MessagesSquare className="size-3.5" />}
              {t === "board" ? "Board" : "Chat"}
            </button>
          ))}
        </div>
        {voiceOut.speaking && (
          <button
            type="button"
            onClick={stopSpeaking}
            className="flex h-8 items-center gap-2 rounded-full bg-accent-soft px-3 text-[12.5px] font-medium text-accent"
            aria-label="Stop speaking"
          >
            <span className="flex h-3 items-end gap-0.5" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="speaking-bar w-0.5 rounded-full bg-accent" style={{ height: 12, animationDelay: `${i * 0.12}s` }} />
              ))}
            </span>
            <span className="hidden sm:inline">Stop speaking</span>
          </button>
        )}
        {voiceOut.supported && (
          <IconButton
            label={profile.voice.autoSpeak ? "Voice replies on — turn off" : "Read replies aloud"}
            size="sm"
            active={profile.voice.autoSpeak}
            onClick={() => {
              if (profile.voice.autoSpeak) stopSpeaking();
              void updateProfile({ voice: { autoSpeak: !profile.voice.autoSpeak } });
            }}
          >
            {profile.voice.autoSpeak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </IconButton>
        )}
        {session.messages.length > 0 && (
          <>
            <IconButton label={flagged === "review" ? "Added to your review list" : "Mark this topic for review"} size="sm" active={flagged === "review"} onClick={() => void flag("review")}>
              <BookmarkPlus className="size-4" />
            </IconButton>
            <IconButton label={flagged === "mastered" ? "Marked as understood" : "I understand this now"} size="sm" active={flagged === "mastered"} onClick={() => void flag("mastered")}>
              <CheckCircle2 className="size-4" />
            </IconButton>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Board */}
        <section aria-label="Whiteboard" className={cn("relative min-h-0 flex-1 lg:flex", tab === "board" ? "flex" : "hidden")}>
          <Board
            key={session.id}
            initial={session.board}
            onReady={onBoardReady}
            onSceneChange={onSceneChange}
            onEmptyChange={setBoardEmpty}
            onClear={() => setConfirmClear(true)}
            busy={busy}
            isEmpty={boardEmpty}
            className="flex-1"
          />
          {liveCaption && (
            <div className="pointer-events-none absolute inset-x-3 bottom-16 z-10 flex justify-center lg:hidden">
              <p className="max-w-md rounded-2xl bg-ink/90 px-4 py-2.5 text-center text-[13.5px] leading-snug text-bg shadow-lg">{speakableText(liveCaption)}</p>
            </div>
          )}
        </section>

        {/* Conversation */}
        <aside
          aria-label="Conversation"
          className={cn("flex min-h-0 flex-col border-border bg-bg lg:w-[360px] lg:flex-none lg:shrink-0 lg:border-l xl:w-[400px] 2xl:w-[440px]", tab === "chat" ? "flex-1" : "shrink-0")}
        >
          <div className={cn("flex min-h-0 flex-1 flex-col", tab === "board" && "max-lg:hidden")}>
            {!healthLoading && !aiReady ? (
              <div className="flex-1 overflow-y-auto p-4">
                <SetupNotice health={health} />
              </div>
            ) : (
              <MessageList
                messages={session.messages}
                streamingId={streamingId}
                status={status}
                onFollowUp={(t) => void ask(t)}
                onShowStep={showStep}
                onCheck={checking ? answerCheck : undefined}
                onRetry={retry}
                emptyState={emptyState}
                active={wide || tab === "chat"}
              />
            )}
          </div>
          {sourcesOpen && (
            <SourcesPanel
              selected={session.docIds}
              onChange={(ids) => {
                mutate((x) => ({ ...x, docIds: ids }));
                if (sessionRef.current?.messages.length) void persist();
              }}
              onClose={() => setSourcesOpen(false)}
            />
          )}
          {cooldownLeft > 0 ? (
            <p role="status" className="mx-3 mb-1 flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
              <Hourglass className="size-3.5 shrink-0" aria-hidden />
              <span>
                Every model is at its usage limit. You can ask again in <strong className="tabular-nums">{formatCountdown(cooldownLeft)}</strong>.
              </span>
            </p>
          ) : (
            fallback &&
            fallbackLeft > 0 && (
              <p role="status" className="mx-3 mb-1 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-[12px] text-muted">
                <Shuffle className="size-3.5 shrink-0" aria-hidden />
                <span>
                  Using <span className="font-medium text-ink-2">{fallback.to}</span> while {fallback.from} is at its limit — back in{" "}
                  <span className="tabular-nums">{formatCountdown(fallbackLeft)}</span>.
                </span>
              </p>
            )
          )}
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => submit(input)}
            onStop={stopGenerating}
            busy={busy && !checking}
            disabled={!aiReady || cooldownLeft > 0}
            disabledReason={
              cooldownLeft > 0 ? `Usage limit reached — back in ${formatCountdown(cooldownLeft)}` : healthLoading ? "Connecting…" : "Connect an AI model to start (see setup above)"
            }
            mode={session.mode}
            onModeChange={setMode}
            voice={{ supported: voiceIn.supported, listening: voiceIn.listening, interim: voiceIn.interim, error: voiceIn.error, onToggle: toggleMic }}
            attachments={attachments}
            onAddFiles={(files) => void addFiles(files)}
            onRemoveAttachment={(id) => setAttachments((list) => list.filter((a) => a.id !== id))}
            attachError={attachError}
            docCount={docCount}
            onOpenSources={() => setSourcesOpen((o) => !o)}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear the whiteboard?"
        body="Everything on the board will be removed. You can bring it back with Undo."
        confirmLabel="Clear board"
        onConfirm={doClear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
