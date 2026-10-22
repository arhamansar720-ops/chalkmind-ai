"use client";

import { useState } from "react";
import { ClipboardCopy, Cloud, Cpu, Download, HardDrive, Mic, Sparkles, Trash2, User, Volume2 } from "lucide-react";
import { clip, IMPORT_PROMPT, MAX_INSTRUCTION_CHARS, splitImportedProfile } from "@/lib/learning/custom-instructions";
import { useHealth } from "@/lib/client/health";
import { useProfile } from "@/lib/client/profile";
import { store, useCollection } from "@/lib/store";
import { createLocalRepository } from "@/lib/store/local";
import { COLLECTIONS, type Profile } from "@/lib/store/types";
import { downloadText, relativeTime } from "@/lib/utils";
import { useVoiceOutput } from "@/lib/voice/hooks";
import { useAuth } from "@/components/shell/AuthProvider";
import { setTheme, useTheme } from "@/components/ThemeToggle";
import { Alert, Badge, Button, Card, ConfirmDialog, Field, Input, PageHeader, Segmented, Select, Textarea } from "@/components/ui";
import { LESSON_PACES } from "@/lib/tutor/pace";

const STYLES: { value: Profile["style"]; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "concise", label: "Concise" },
  { value: "detailed", label: "Detailed" },
  { value: "visual", label: "Visual" },
  { value: "step-by-step", label: "Step by step" },
];

export function Settings() {
  const { profile, update } = useProfile();
  const { data: health } = useHealth();
  const signals = useCollection("signals");
  const voice = useVoiceOutput();
  const auth = useAuth();
  const theme = useTheme();
  const [confirm, setConfirm] = useState<"signals" | "all" | null>(null);
  const [email, setEmail] = useState("");
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const exportAll = async () => {
    const data: Record<string, unknown> = {};
    for (const c of COLLECTIONS) data[c] = await store.list(c);
    downloadText(`chalkmind-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2), "application/json");
  };

  const deleteAll = async () => {
    for (const c of COLLECTIONS) await store.clear(c);
    setConfirm(null);
  };

  const copyLocalToCloud = async () => {
    const local = createLocalRepository();
    let n = 0;
    for (const c of COLLECTIONS) {
      for (const rec of await local.list(c)) {
        await store.put(c, rec as never);
        n++;
      }
    }
    setCopyMsg(n ? `Copied ${n} item${n > 1 ? "s" : ""} from this device to your account.` : "There was nothing on this device to copy.");
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader eyebrow="Settings" title="Settings" description="Your profile, how the tutor teaches, voice, and where your data lives." />

      <div className="mt-8 flex flex-col gap-6">
        <Section icon={User} title="Profile">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name (optional)" htmlFor="pf-name">
              <Input key={`name-${profile.createdAt}`} id="pf-name" defaultValue={profile.name ?? ""} onBlur={(e) => void update({ name: e.target.value.trim().slice(0, 60) || undefined })} placeholder="What should Chalkmind call you?" />
            </Field>
            <Field label="Level (optional)" htmlFor="pf-level" hint="Helps the tutor pitch explanations, e.g. “Grade 9”, “AP Chemistry”, “first-year university”.">
              <Input key={`level-${profile.createdAt}`} id="pf-level" defaultValue={profile.level ?? ""} onBlur={(e) => void update({ level: e.target.value.trim().slice(0, 40) || undefined })} placeholder="e.g. Grade 10" />
            </Field>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-[13px] font-medium text-ink-2">Preferred explanation style</p>
            <div className="flex flex-wrap gap-1.5">
              {STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={profile.style === s.value}
                  onClick={() => void update({ style: s.value })}
                  className={`h-8 rounded-full border px-3 text-[13px] font-medium ${profile.style === s.value ? "border-accent bg-accent-soft text-accent" : "border-border text-ink-2 hover:border-border-strong"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-[13px] font-medium text-ink-2">Lesson pace</p>
            <div className="flex flex-wrap gap-1.5">
              {LESSON_PACES.map((p) => {
                const on = (profile.pace ?? "normal") === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => void update({ pace: p.value })}
                    className={`h-8 rounded-full border px-3 text-[13px] font-medium ${on ? "border-accent bg-accent-soft text-accent" : "border-border text-ink-2 hover:border-border-strong"}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[12px] text-muted">How long each step stays up before the next one appears and the board keeps drawing. With voice on, the tutor also waits for each spoken step.</p>
          </div>
          <label className="mt-4 flex items-start gap-3">
            <input type="checkbox" checked={profile.drawAnimation ?? true} onChange={(e) => void update({ drawAnimation: e.target.checked })} className="mt-1 size-4 accent-[var(--accent)]" />
            <span className="text-[14px]">
              <span className="font-medium">Write on the board stroke by stroke</span>
              <span className="mt-0.5 block text-[13px] text-muted">The tutor writes out each line, equation and diagram as you watch. Turn off to have it appear at once.</span>
            </span>
          </label>
        </Section>

        <Section icon={Sparkles} title="Custom instructions">
          <CustomInstructions key={`ci-${profile.createdAt}`} profile={profile} onSave={update} />
        </Section>

        <Section icon={Cpu} title="Personalization">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={profile.personalize} onChange={(e) => void update({ personalize: e.target.checked })} className="mt-1 size-4 accent-[var(--accent)]" />
            <span className="text-[14px]">
              <span className="font-medium">Use my study history to personalize tutoring</span>
              <span className="mt-0.5 block text-[13px] text-muted">
                When on, Chalkmind saves learning signals — quiz questions you missed, misconceptions the tutor noticed, topics you bookmarked — and uses them to suggest review topics and tailor practice. Nothing is inferred about your ability; only these specific events are stored.
              </span>
            </span>
          </label>
          <div className="mt-4 rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-[13px] font-medium">Saved learning signals ({signals.items.length})</p>
              {signals.items.length > 0 && (
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirm("signals")}>
                  Delete all
                </Button>
              )}
            </div>
            {signals.items.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-muted">None saved.</p>
            ) : (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                {signals.items.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                    <Badge tone={s.kind === "mastered" ? "success" : s.kind === "misconception" ? "warning" : "neutral"}>{s.kind.replace("_", " ")}</Badge>
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {s.topic}
                      {s.note && <span className="text-muted"> — {s.note}</span>}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-muted">{relativeTime(s.createdAt)}</span>
                    <button type="button" aria-label={`Delete signal about ${s.topic}`} onClick={() => void store.delete("signals", s.id)} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section icon={Volume2} title="Voice">
          {!voice.supported && <Alert tone="warning">This browser doesn&apos;t support speech output. Voice replies are unavailable; everything works by text.</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tutor voice" htmlFor="vc-voice">
              <Select id="vc-voice" value={profile.voice.uri ?? ""} onChange={(e) => void update({ voice: { uri: e.target.value || undefined } })} disabled={!voice.supported}>
                <option value="">System default</option>
                {voice.voices
                  .filter((v) => v.lang.startsWith((typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2)) || v.lang.startsWith("en"))
                  .map((v) => (
                    <option key={v.uri} value={v.uri}>
                      {v.name} ({v.lang}){v.local ? "" : " · online"}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label={`Speaking rate: ${profile.voice.rate.toFixed(1)}×`} htmlFor="vc-rate">
              <input id="vc-rate" type="range" min={0.6} max={1.6} step={0.1} value={profile.voice.rate} onChange={(e) => void update({ voice: { rate: Number(e.target.value) } })} className="h-11 accent-[var(--accent)]" />
            </Field>
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            <label className="flex items-center gap-3 text-[14px]">
              <input type="checkbox" checked={profile.voice.autoSpeak} onChange={(e) => void update({ voice: { autoSpeak: e.target.checked } })} className="size-4 accent-[var(--accent)]" />
              Read tutor replies aloud
            </label>
            <label className="flex items-center gap-3 text-[14px]">
              <input type="checkbox" checked={profile.voice.autoSend} onChange={(e) => void update({ voice: { autoSend: e.target.checked } })} className="size-4 accent-[var(--accent)]" />
              Send spoken questions automatically when I stop talking
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button size="sm" icon={<Mic className="size-3.5" />} disabled={!voice.supported} onClick={() => void voice.speak("Hi! I'm your Chalkmind tutor. Ask me anything.", { voiceURI: profile.voice.uri, rate: profile.voice.rate })}>
              Test voice
            </Button>
            <p className="text-[12px] text-muted">Uses your browser&apos;s built-in speech engine — quality depends on your browser and OS voices.</p>
          </div>
        </Section>

        <Section icon={Cpu} title="AI model">
          {!health ? (
            <p className="text-[13px] text-muted">Checking…</p>
          ) : health.ai.configured ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13.5px]">
              <dt className="text-muted">Provider</dt>
              <dd>
                {health.ai.label} {health.ai.local && <Badge tone="success">runs locally</Badge>}
              </dd>
              <dt className="text-muted">Model</dt>
              <dd className="font-mono text-[12.5px]">{health.ai.model}</dd>
              <dt className="text-muted">Images</dt>
              <dd>{health.ai.visionModel ? <span className="font-mono text-[12.5px]">{health.ai.visionModel}</span> : "Not available with this configuration"}</dd>
              <dt className="text-muted">Document search</dt>
              <dd>{health.embeddings.configured ? `Keyword + embeddings (${health.embeddings.model})` : "Keyword search (no embeddings model configured)"}</dd>
              <dt className="text-muted">Cost</dt>
              <dd>{health.ai.pricing}</dd>
            </dl>
          ) : (
            <Alert tone="warning" title="No AI model connected">
              {health.ai.reason} Set {health.ai.missing.join(", ")} in <code>.env.local</code>. Keys stay on the server and are never sent to the browser.
            </Alert>
          )}
        </Section>

        <Section icon={HardDrive} title="Appearance">
          <Segmented
            label="Theme"
            value={theme}
            onChange={(t) => setTheme(t)}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
          <button type="button" className="ml-3 text-[12.5px] text-muted hover:text-ink" onClick={() => setTheme("system")}>
            Match system
          </button>
        </Section>

        <Section icon={Cloud} title="Your data">
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            {auth.user ? (
              <>
                Synced to your account <span className="font-medium">{auth.user.email}</span>. Only you can read your records.
              </>
            ) : (
              <>Everything is saved in this browser on this device. Clearing site data removes it.</>
            )}
          </p>
          {auth.available && !auth.user && (
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={async (e) => {
                e.preventDefault();
                setAuthMsg(null);
                try {
                  await auth.signIn(email.trim());
                  setAuthMsg("Check your email for a sign-in link.");
                } catch (err) {
                  setAuthMsg(err instanceof Error ? err.message : "Couldn't send the link.");
                }
              }}
            >
              <Input type="email" required aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" className="h-10 flex-1" />
              <Button type="submit" variant="primary">
                Email me a sign-in link
              </Button>
            </form>
          )}
          {authMsg && <p className="mt-2 text-[13px] text-muted">{authMsg}</p>}
          {auth.user && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void copyLocalToCloud()}>
                Copy this device&apos;s data to my account
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void auth.signOut()}>
                Sign out
              </Button>
            </div>
          )}
          {copyMsg && <p className="mt-2 text-[13px] text-muted">{copyMsg}</p>}
          {!auth.available && <p className="mt-2 text-[12.5px] text-muted">Cloud sync isn&apos;t configured on this deployment (see README → Supabase).</p>}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => void exportAll()}>
              Export all data (JSON)
            </Button>
            <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirm("all")}>
              Delete all my data
            </Button>
          </div>
        </Section>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "all" ? "Delete all your Chalkmind data?" : "Delete all learning signals?"}
        body={
          confirm === "all"
            ? "Sessions, whiteboards, homework, study sets, documents, quiz results, tasks and your profile will be permanently deleted from " + (auth.user ? "your account." : "this device.")
            : "Review recommendations will reset. Your sessions and study sets are kept."
        }
        confirmLabel={confirm === "all" ? "Delete everything" : "Delete signals"}
        onConfirm={() => (confirm === "all" ? void deleteAll() : void store.clear("signals").then(() => setConfirm(null)))}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <Icon className="size-4 text-muted" /> {title}
      </h2>
      {children}
    </Card>
  );
}

type SaveProfile = ReturnType<typeof useProfile>["update"];

/** "What should the tutor know about you / how should it talk to you", plus importing from ChatGPT. */
function CustomInstructions({ profile, onSave }: { profile: Profile; onSave: SaveProfile }) {
  const [about, setAbout] = useState(profile.aboutMe ?? "");
  const [style, setStyle] = useState(profile.responseStyle ?? "");
  const [importOpen, setImportOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const save = (patch: { aboutMe?: string; responseStyle?: string }) => void onSave(patch).then(() => setMsg("Saved. The tutor uses this from your next question."));

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
      setMsg("Prompt copied. Paste it into ChatGPT, then paste its answer below.");
    } catch {
      setMsg("Couldn't copy automatically — select the prompt text and copy it.");
    }
  };

  const applyImport = () => {
    const { about: a, style: s } = splitImportedProfile(pasted);
    const nextAbout = clip([about.trim(), a].filter(Boolean).join("\n\n"));
    const nextStyle = clip([style.trim(), s].filter(Boolean).join("\n\n"));
    setAbout(nextAbout);
    setStyle(nextStyle);
    setPasted("");
    setImportOpen(false);
    save({ aboutMe: nextAbout || undefined, responseStyle: nextStyle || undefined });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        Tell the tutor about yourself and how you like to be talked to, like custom instructions in ChatGPT. It uses this in every lesson to pick examples and match your style.
      </p>
      <Field label="What should the tutor know about you?" htmlFor="ci-about" hint={`${about.length}/${MAX_INSTRUCTION_CHARS}`}>
        <Textarea
          id="ci-about"
          value={about}
          maxLength={MAX_INSTRUCTION_CHARS}
          onChange={(e) => setAbout(e.target.value)}
          onBlur={() => about !== (profile.aboutMe ?? "") && save({ aboutMe: about.trim() || undefined })}
          placeholder="e.g. I'm in Grade 10 and want to get an A in chemistry. I play basketball and like examples from sports. Fractions still confuse me."
          rows={4}
        />
      </Field>
      <Field label="How should the tutor talk to you?" htmlFor="ci-style" hint={`${style.length}/${MAX_INSTRUCTION_CHARS}`}>
        <Textarea
          id="ci-style"
          value={style}
          maxLength={MAX_INSTRUCTION_CHARS}
          onChange={(e) => setStyle(e.target.value)}
          onBlur={() => style !== (profile.responseStyle ?? "") && save({ responseStyle: style.trim() || undefined })}
          placeholder="e.g. Be casual and funny, keep it short, use real-life examples, and quiz me a lot. Explain in simple English."
          rows={4}
        />
      </Field>

      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[13.5px] font-medium">Bring over what ChatGPT knows about you</p>
            <p className="mt-0.5 text-[12.5px] text-muted">Works with ChatGPT, Gemini, Claude or any assistant that remembers you.</p>
          </div>
          {!importOpen && (
            <Button size="sm" onClick={() => setImportOpen(true)}>
              Import
            </Button>
          )}
        </div>
        {importOpen && (
          <ol className="mt-3 flex list-decimal flex-col gap-3 pl-5 text-[13px] text-ink-2">
            <li>
              Copy this prompt and send it to ChatGPT:
              <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface p-2.5 font-sans text-[12px] leading-relaxed text-muted">{IMPORT_PROMPT}</pre>
              <Button size="sm" className="mt-2" icon={<ClipboardCopy className="size-3.5" />} onClick={() => void copyPrompt()}>
                Copy prompt
              </Button>
            </li>
            <li>
              Paste ChatGPT&apos;s answer here. You can also paste your ChatGPT custom instructions or memories.
              <Textarea
                aria-label="ChatGPT's answer"
                value={pasted}
                onChange={(e) => setPasted(e.target.value.slice(0, 6000))}
                placeholder="About me: …&#10;How to talk to me: …"
                rows={5}
                className="mt-1.5"
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="primary" disabled={!pasted.trim()} onClick={applyImport}>
                  Add to my instructions
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setImportOpen(false)}>
                  Cancel
                </Button>
              </div>
            </li>
          </ol>
        )}
      </div>
      {msg && <p className="text-[12.5px] text-muted" role="status">{msg}</p>}
    </div>
  );
}
