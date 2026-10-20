# Chalkmind

**Think it. See it. Understand it.** — your personal AI tutor with an interactive whiteboard.

Chalkmind is an AI learning workspace: students ask by voice or text, the tutor explains out loud and works through it on a real whiteboard step by step, and the lesson turns into practice (flashcards, quizzes, study guides) with progress built from what they've actually done.

Target domain: `chalkmind.app`.

---

## Features

| Area | What works |
| --- | --- |
| **AI Whiteboard Tutor** (`/app/tutor`) | Streaming tutor replies split into steps; each step's board actions render live on an [Excalidraw](https://excalidraw.com) board (equations via MathJax, notes, shapes, labeled geometry, arrows, flow/cycle/tree/hub diagrams, plotted graphs, tables, highlights, clear). Follow-ups keep context (the tutor sees what it drew, by id). Modes: Explain · Hints only · Simpler · Socratic. Undo/redo, zoom-to-fit, clear (with confirmation), export image, free drawing. Sessions + board state autosave and resume. |
| **Voice** | Browser Web Speech API: mic input with interim transcript, auto-send, read-aloud replies synced to board steps, speaking indicator, stop-speaking, barge-in (talking interrupts), clear errors for denied/unsupported mic. Text always works. |
| **Homework Solver** (`/app/homework`) | Text, photo (vision model) or PDF/TXT input. Structured solution: restatement → givens → method → steps → answer → how to check → practice question. Hint-first mode reveals steps one at a time. Numeric answers are **independently re-checked** with a sandboxed calculator (substitution / recomputation); otherwise labeled "Not independently verified". "Explain it on the whiteboard" hand-off. |
| **Study Materials** (`/app/study`) | From a topic, pasted notes or an uploaded document: flashcards, multiple-choice quiz, short-answer, practice exam, study guide, key terms, summary, worked examples. Flashcards flip (click/Space), confidence rating (1–4), "difficult" review filter, shuffle. Quizzes: answer → submit → MCQ graded deterministically, written answers AI-graded (labeled) with model answers; self-marking fallback if the grader is unavailable. Guides export to `.md` / print-to-PDF. |
| **Documents & attachments** | Attach PDF, Word (.docx), PowerPoint (.pptx — slides + speaker notes), TXT/MD and up to 4 images per question from the composer's paperclip (or paste / drag-and-drop). Documents ≤ 15 MB, ≤ 400 pages. Text is extracted server-side (not stored there), chunked per page/slide in the browser, searched with BM25 — blended with embeddings when an embeddings provider is configured. Files attached to a question also stay as session "Sources"; answers cite document + page or slide and separate general knowledge. |
| **My Library** (`/app/library`) | Sessions (with whiteboards), homework, flashcards, quizzes, guides, documents — search, type filters, sort, open/resume, rename, delete (with confirmation). |
| **Progress** (`/app/progress`) | Real counts only (sessions, questions, homework, quizzes, active days), quiz performance by subject, subjects studied, **topics to review** ranked from saved learning signals (quiz misses, tutor-observed misconceptions, bookmarks; "Got it" clears), one-click targeted practice or re-explanation, study planner + goals (create/edit/complete/delete). Thoughtful empty state for new students. |
| **Settings** (`/app/settings`) | Name/level/explanation style, personalization on/off, view & delete each learning signal, voice + rate, AI model status (no secrets), theme, export all data (JSON), delete all data, optional cloud sign-in. |
| **Landing** (`/`) | Product story, workspace preview, how it works, features, teaching philosophy, models & privacy. |

---

## Quick start

Requirements: Node 20+ (tested on Node 26), npm.

```bash
npm install
cp .env.example .env.local   # then add an AI provider (see below)
npm run dev                   # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Checks:

```bash
npm run lint        # ESLint (Next + React Compiler rules)
npm run typecheck   # tsc --noEmit
npm test            # Vitest (92 tests)
npm run check       # all three
```

`npm install` also copies Excalidraw's fonts into `public/excalidraw/` (postinstall) so the board doesn't load fonts from a CDN.

---

## Configuring an AI model

All AI calls go through server routes (`src/app/api/*`) and a provider adapter (`src/lib/ai`). Keys are read from server env only and never reach the browser (`/api/health` exposes only provider name, model ids and feature flags).

**Fastest (hosted, free tier):** create a key at [console.groq.com](https://console.groq.com/keys):

```env
AI_PROVIDER=groq
AI_API_KEY=gsk_...
```

**Fully local and free:** install [Ollama](https://ollama.com), `ollama pull qwen3`, then:

```env
AI_PROVIDER=ollama
AI_MODEL=qwen3
```

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `groq` · `openai` · `anthropic` · `openrouter` · `ollama` · `openai-compatible`. Auto-detected from `GROQ_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` if unset. |
| `AI_API_KEY` | Provider key (or the provider-specific variable above). Not needed for Ollama. |
| `AI_MODEL` | Model id. Defaults: groq `openai/gpt-oss-120b`, openai `gpt-5-mini`, anthropic `claude-haiku-5-5`, openrouter `openai/gpt-oss-120b`, ollama `qwen3`. |
| `AI_VISION_MODEL` | Model for image input. Defaults: groq `qwen/qwen3.8-27b`; openai/anthropic = `AI_MODEL`; others none. `none` disables image input. |
| `AI_BASE_URL` | Override the API base URL (required for `openai-compatible`, e.g. LM Studio / vLLM). |
| `AI_MAX_OUTPUT_TOKENS` | Output cap per request (default 4096). |
| `EMBEDDINGS_PROVIDER`, `EMBEDDINGS_MODEL`, `EMBEDDINGS_API_KEY`, `EMBEDDINGS_BASE_URL` | Optional semantic document search (`ollama` → `nomic-embed-text`, or `openai`). Without it, keyword search is used. |
| `RATE_LIMIT_PER_MINUTE` | AI requests per client per minute, per server instance (default 20). |
| `DATABASE_URL` | Optional Postgres for accounts, synced chat history and memory (Render: the External Database URL). Run `npm run db:migrate` once. |
| `REQUIRE_AUTH` | `true` = the app and every AI route require a signed-in account (needs `DATABASE_URL`; recommended for public deployments). |
| `SIGNUP_CODE` | Invite code required to create an account. Unset = open sign-up. |
| `CHALKMIND_DEBUG_AI` | Dev only: logs invalid structured AI replies (may include student input). |

### Costs — be explicit with students

Chalkmind itself has no paid dependencies. Inference is the cost:

- **Ollama (local):** free to run; quality/speed depend on the student's computer.
- **Groq:** free tier with rate limits; usage beyond it is billed per token.
- **OpenAI / Anthropic / OpenRouter:** billed per token by the provider.

The app never advertises unlimited free AI. If no model is configured, AI features show a setup screen — **there are no hard-coded or fake answers anywhere**.

### What works without AI credentials

Landing page, app shell, Library (browse/rename/delete), Progress (planner, goals, saved stats), Settings, flashcard review and quiz retakes of already-generated sets, document upload + text extraction, data export/delete, and free drawing on the whiteboard. The tutor, homework solver, study generator and short-answer grading require a configured model.

---

## Data, auth and security

**Default: local-first.** Everything is stored in the browser's IndexedDB (`src/lib/store/local.ts`). No account, nothing leaves the device except the AI requests themselves.

**Accounts + sync (Postgres).** Set `DATABASE_URL` and apply the schema once:

```bash
DATABASE_URL=postgres://… npm run db:migrate
```

`render.yaml` is a Render Blueprint for the database (Basic-256mb, Virginia, Postgres 16). Accounts are email + password (scrypt, per-user salt); sessions are random tokens in an `HttpOnly; Secure; SameSite=Lax` cookie and only their SHA-256 is stored; failed sign-ins are throttled per email and per IP in the database; `SIGNUP_CODE` makes sign-up invite-only. Every record lives in one `records` table keyed by `(user_id, collection, id)` and every query is scoped to the session's user, so one account can never read another's data. In the browser each account gets its own IndexedDB cache; writes go to an outbox that syncs to `/api/data` (last write wins on `updatedAt`, deletes are tombstones) and changes from other devices are pulled on load, focus, reconnect and every minute. On first sign-in, data saved on that device before the account existed can be uploaded once. There's no email provider, so there's no self-service password reset.

**Memory.** With memory on (Settings → Memory, default on), the tutor may emit `remember` lines for durable facts the student states (grade, goals, learning preferences, recurring difficulties). The server drops anything that looks like contact details, credentials, addresses or health information before it reaches the browser. Finished lessons get a 2–3 sentence recap (`POST /api/summarize`). Each question sends the ~20 most relevant facts and up to 4 relevant recaps; the prompt forbids inventing shared history. Students can edit or delete any fact, or forget everything.

**Security measures in place**

- Provider keys are server-only; the public config endpoint is tested to never include secrets.
- The AI never sends code or coordinates to the board — only actions matching a strict Zod schema (`src/lib/board/schema.ts`), validated on the server *and* again in the browser. Unknown or malformed actions are dropped and reported ("N board items skipped"). Graph functions use a whitelisted grammar evaluated by a locked-down mathjs instance (`import`, `evaluate`, `parse`, `createUnit`, … disabled).
- Markdown is rendered without raw HTML; images must be base64 data URLs of image types.
- AI routes: JSON schema validation, request-size limits (tutor/homework 7 MB incl. image, study 200 KB, grade 120 KB, embed 260 KB), per-client rate limiting, optional auth (`REQUIRE_AUTH`).
- Uploads: 15 MB max, type sniffing (`%PDF` / ZIP magic bytes + Office part names, text), decompressed-size cap against zip bombs (DOCX/PPTX are read as XML text only, nothing executed), page cap, clear errors for empty, scanned, encrypted, corrupted or unsupported files. Files are processed in memory and not stored on the server.
- Logs record error codes only, never request bodies.

**Production checklist:** set `DATABASE_URL`, `REQUIRE_AUTH=true` and `SIGNUP_CODE` for public deployments; put a shared rate limiter (e.g. Upstash/Redis) in front of `/api/*` if you run multiple instances (the built-in limiter is per-instance memory); configure provider-side spend limits.

---

## Architecture

```
src/
  app/                      routes (App Router, Next 16, Cache Components)
    page.tsx                landing
    app/{tutor,homework,study,library,progress,settings}
    api/{tutor,homework,study,grade,embed,documents/extract,health}
  lib/
    ai/                     provider abstraction
      config.ts             env → provider config (+ public summary)
      providers/            openai-compatible.ts (Groq/OpenAI/OpenRouter/Ollama/custom), anthropic.ts
      structured.ts         JSON generation with one validation-repair retry
      json-stream.ts, sse.ts  streaming parsers (NDJSON, SSE, <think> stripping)
    board/                  whiteboard pipeline
      schema.ts             strict action schema (Zod)
      layout.ts             pure layout engine: actions → Excalidraw skeletons
      render.ts             applies skeletons to the live scene (undoable)
      math-svg.ts, graph.ts, text.ts   MathJax SVG, safe plotting, TeX→Unicode
    tutor/                  protocol (model lines ↔ browser events), prompt, session helpers
    homework/, study/       schemas, prompts, verification, grading
    docs/                   chunking + BM25/hybrid retrieval
    learning/               review recommendations from saved signals
    store/                  Repository interface; IndexedDB + synced (outbox) repositories; React hooks
    server/                 auth (scrypt, cookie sessions), Postgres records, request guards
    voice/                  VoiceInput/VoiceOutput interfaces + Web Speech implementations
  components/               UI (tutor, homework, study, library, progress, settings, landing, ui kit)
db/migrations/              Postgres schema (npm run db:migrate); render.yaml = Render Blueprint
tests/                      Vitest suites
```

**Tutor pipeline.** Student message → `POST /api/tutor` → provider streams NDJSON lines (`title`, `say`, `board`, `check`, `remember`, `followups`, `signal`) → server extracts objects incrementally, validates each line and every board action → streams typed events to the browser → the workspace plays steps in order: show/speak the `say`, then render that step's actions one by one (layout → MathJax → `convertToExcalidrawElements` → `updateScene` with `CaptureUpdateAction.IMMEDIATELY`, so everything the AI draws is undoable) → follow-up chips. Each element carries `customData` (`cm` id, kind, summary, step), so the next request tells the model exactly what is on the board — derived from the live scene, so it stays correct after the student edits, deletes or undoes.

**Voice is modular.** `VoiceInput`/`VoiceOutput` interfaces (`src/lib/voice/types.ts`) are implemented with the browser Web Speech API. This is turn-based recognition and on-device TTS — it is *not* a low-latency full-duplex voice model; a real-time provider can be added behind the same interfaces.

**Design.** Light "paper & ink" theme (warm neutral, near-black type, one chalk-blue accent) with a graphite dark theme; Geist Sans/Mono, mono eyebrows, pill controls, dot-grid board texture. Responsive: on phones the tutor switches between Board and Chat tabs with the composer always available and live captions over the board. Respects `prefers-reduced-motion` (no step pacing or animated scrolling).

---

## Tests and checks performed

`npm run check` passes: ESLint clean, TypeScript clean, **118 Vitest tests** (7 of them need `TEST_DATABASE_URL`):

- board action validation (all types, tolerance rules, safe expression grammar, limits) and the layout engine
- tutor protocol parsing (chunked NDJSON, fences, truncation, malicious actions dropped server- and client-side)
- provider adapters with mocked streams (OpenAI-compatible, Anthropic), vision routing, error mapping, missing credentials, config never exposing secrets
- API routes: not-configured → 503 setup error, malformed/oversized → 400/413, validated streaming, provider failure → error event, `REQUIRE_AUTH` → 401 without calling the model, rate limiting, document upload edge cases (empty, unsupported, corrupted PDF)
- homework verification (pass, fail, unverifiable; sandboxed math blocks `import`/`evaluate`/…), quiz grading (MCQ, AI-graded, pending, clamping), study schema normalization
- persistence: IndexedDB repository round-trip incl. board state; sync engine (push, pull, local edits win, outbox survives reload, guest import)
- accounts against a real Postgres (`TEST_DATABASE_URL=… npm test`): sign-up/in/out, hashes only, invite code, throttling, cross-site block, per-user isolation, last-write-wins, tombstones, `REQUIRE_AUTH` gating
- memory: privacy filter, de-duplication, cap, relevance selection, prompt inclusion only when on
- session context building, board index derivation, retrieval (chunking, BM25, hybrid), review recommendations

`npm run build` succeeds. Manually verified in the browser against a real model (Groq `openai/gpt-oss-120b`): tutor lessons with equations, graphs and diagrams; contextual follow-ups that highlight earlier steps; session save/resume; clear + undo; homework (hint-first, verified answer); practice exam with AI grading; flashcards with confidence; library; progress; settings; desktop and phone layouts; light/dark.

## Known limitations / not yet done

- **Voice was not tested with a physical microphone** in this environment; the code paths, permission errors and fallbacks are implemented per the Web Speech API. Browser speech recognition availability varies (Chrome/Edge/Safari; not Firefox).
- Scanned (image-only) PDFs aren't OCR'd; users are told to use the Homework Solver's image upload instead.
- Without `DATABASE_URL`, everything (including memory) is per device.
- No password reset by email (no email provider).
- The built-in rate limiter is per server instance (see production checklist).
- Board layout is a top-to-bottom lesson column; the tutor can't place items at arbitrary positions (by design — models are unreliable with coordinates).
