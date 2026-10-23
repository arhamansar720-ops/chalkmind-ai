import type { BoardAction } from "../board/schema";
import type { TutorMode } from "../tutor/protocol";
import type { HomeworkSolution, Verification } from "../homework/schema";
import type { StudyContent } from "../study/schema";
import type { LessonPace } from "../tutor/pace";

export interface BaseRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface BoardItem {
  id: string;
  kind: string;
  summary: string;
}

export interface StoredStep {
  say: string;
  actions: BoardAction[];
  /** Board step number (element customData.cmStep), for "show on board". */
  boardStep?: number;
  /** A comprehension check-in where the lesson paused, and how the student answered. */
  check?: { question: string; answer?: "yes" | "no" | "reply" };
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  /** Text used as conversation context for the model. */
  content: string;
  steps?: StoredStep[];
  followups?: string[];
  notices?: string[];
  hadImage?: boolean;
  /** Facts the tutor saved to memory during this reply. */
  remembered?: string[];
  /** Files attached to this (user) message, for display. */
  attachments?: { name: string; kind: "image" | "document" }[];
  citations?: { source: string; page?: number; unit?: "slide" }[];
  /** The tutor's judgement of a check-in answer this reply responds to. */
  verdict?: { understood: boolean; note?: string };
  /** Set when a fallback model answered because the main one was rate-limited. */
  servedBy?: string;
  /** `retryAt`: when a rate-limited request can be sent again (ms timestamp). */
  error?: { code: string; message: string; hint?: string; retryAt?: number };
  createdAt: number;
}

export interface BoardSnapshot {
  elements: unknown[];
  files: Record<string, unknown>;
}

export interface TutorSession extends BaseRecord {
  subject?: string;
  mode: TutorMode;
  messages: StoredMessage[];
  board: BoardSnapshot | null;
  boardIndex: BoardItem[];
  docIds: string[];
  autoId: number;
  stepCounter?: number;
  /** Short recap of this lesson, recalled in later sessions (memory). */
  summary?: { text: string; messageCount: number; at: number };
}

export type MemoryKind = "about" | "goal" | "preference" | "struggle";

/** Something the student told the tutor that's worth remembering across sessions. */
export interface MemoryFact extends BaseRecord {
  fact: string;
  kind: MemoryKind;
  source: "tutor" | "student";
  sessionId?: string;
}

export interface HomeworkRecord extends BaseRecord {
  question: string;
  subject: string;
  mode: "hint" | "detailed" | "simple";
  hadImage: boolean;
  solution: HomeworkSolution;
  verification: Verification;
}

export interface StudyMaterial extends BaseRecord {
  subject: string;
  difficulty: "intro" | "standard" | "challenging";
  sourceLabel: string;
  content: StudyContent;
  /** Flashcard confidence by card index. */
  cardState?: Record<string, { confidence: "again" | "hard" | "good" | "easy"; reviewedAt: number; reviews: number }>;
}

export interface QuizAttempt extends BaseRecord {
  materialId: string;
  subject: string;
  score: number;
  total: number;
  answers: { question: string; correct: boolean; topic?: string; given: string; points: number; max: number; aiGraded: boolean }[];
}

export interface DocumentChunk {
  id: string;
  page?: number;
  text: string;
  embedding?: number[];
}

export interface DocumentRecord extends BaseRecord {
  name: string;
  size: number;
  mime: string;
  pageCount: number;
  charCount: number;
  chunks: DocumentChunk[];
  embeddingModel?: string;
}

export interface StudyTask extends BaseRecord {
  due?: string; // yyyy-mm-dd
  done: boolean;
  subject?: string;
  notes?: string;
  kind: "task" | "goal";
}

export type SignalKind = "struggle" | "misconception" | "mastered" | "quiz_miss" | "review_flag";

export interface LearningSignal extends BaseRecord {
  kind: SignalKind;
  topic: string;
  subject?: string;
  note?: string;
  source: "tutor" | "quiz" | "homework" | "student";
}

export interface Profile extends BaseRecord {
  name?: string;
  level?: string;
  style: "balanced" | "concise" | "detailed" | "visual" | "step-by-step";
  personalize: boolean;
  voice: { uri?: string; rate: number; autoSpeak: boolean; autoSend: boolean };
  /** How quickly tutor replies unfold on screen. */
  pace?: LessonPace;
  /** Remember facts and past lessons across sessions (default on). */
  memory?: boolean;
  /** Custom instructions: what the tutor should know about the student. */
  aboutMe?: string;
  /** Custom instructions: how the student wants the tutor to talk to them. */
  responseStyle?: string;
  /** Draw board content stroke by stroke (default on, even with reduced motion). */
  drawAnimation?: boolean;
}

export interface CollectionMap {
  sessions: TutorSession;
  homework: HomeworkRecord;
  materials: StudyMaterial;
  attempts: QuizAttempt;
  documents: DocumentRecord;
  tasks: StudyTask;
  signals: LearningSignal;
  profile: Profile;
  memories: MemoryFact;
}

export type CollectionName = keyof CollectionMap;

export const COLLECTIONS: CollectionName[] = [
  "sessions",
  "homework",
  "materials",
  "attempts",
  "documents",
  "tasks",
  "signals",
  "profile",
  "memories",
];

export interface Repository {
  readonly kind: "local" | "cloud";
  list<K extends CollectionName>(name: K): Promise<CollectionMap[K][]>;
  get<K extends CollectionName>(name: K, id: string): Promise<CollectionMap[K] | undefined>;
  put<K extends CollectionName>(name: K, record: CollectionMap[K]): Promise<void>;
  delete<K extends CollectionName>(name: K, id: string): Promise<void>;
  clear<K extends CollectionName>(name: K): Promise<void>;
}

export const DEFAULT_PROFILE: Profile = {
  id: "me",
  title: "Profile",
  createdAt: 0,
  updatedAt: 0,
  style: "balanced",
  personalize: true,
  voice: { rate: 1, autoSpeak: true, autoSend: true },
  pace: "normal",
};
