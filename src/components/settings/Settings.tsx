"use client";

import { useState } from "react";
import { Cloud, Cpu, Download, HardDrive, Mic, Trash2, User, Volume2 } from "lucide-react";
import { useHealth } from "@/lib/client/health";
import { useProfile } from "@/lib/client/profile";
import { store, useCollection } from "@/lib/store";
import { COLLECTIONS, type Profile } from "@/lib/store/types";
import { downloadText, relativeTime } from "@/lib/utils";
import { useVoiceOutput } from "@/lib/voice/hooks";
import { useAuth } from "@/components/shell/AuthProvider";
import { setTheme, useTheme } from "@/components/ThemeToggle";
import { Alert, Badge, Button, Card, ConfirmDialog, Field, Input, PageHeader, Segmented, Select } from "@/components/ui";
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

  const importGuest = async () => {
    const n = await auth.importGuestData();
    setCopyMsg(n ? `Uploaded ${n} item${n > 1 ? "s" : ""} from this device to your account.` : "Everything on this device was already in your account.");
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
          {auth.user ? (
            <>
              <p className="text-[13.5px] leading-relaxed text-ink-2">
                Signed in as <span className="font-medium">{auth.user.email}</span>. Your chats, whiteboards, study sets, documents and memory sync to your
                account, so they follow you to any device. Only you can read them.
              </p>
              <p className="mt-1.5 text-[12.5px] text-muted" aria-live="polite">
                {syncLabel(auth.sync)}
              </p>
              {auth.guestRecords > 0 && (
                <div className="mt-3 rounded-xl border border-accent bg-accent-soft p-3 text-[13px]">
                  <p className="text-ink">
                    This device has {auth.guestRecords} item{auth.guestRecords > 1 ? "s" : ""} saved from before you signed in.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="primary" onClick={() => void importGuest()}>
                      Upload to my account
                    </Button>
                    <Button size="sm" variant="ghost" onClick={auth.dismissGuestData}>
                      Not now
                    </Button>
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={auth.syncNow}>
                  Sync now
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void auth.signOut()}>
                  Sign out
                </Button>
              </div>
            </>
          ) : (
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              Everything is saved in this browser on this device. Clearing site data removes it.
              {auth.available && (
                <>
                  {" "}
                  <a href="/signin?next=/app/settings" className="font-medium text-accent hover:underline">
                    Sign in
                  </a>{" "}
                  to keep it in your account.
                </>
              )}
            </p>
          )}
          {copyMsg && <p className="mt-2 text-[13px] text-muted">{copyMsg}</p>}
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

function syncLabel(sync: ReturnType<typeof useAuth>["sync"]): string {
  if (!sync) return "Connecting…";
  if (sync.state === "syncing") return "Syncing…";
  if (sync.state === "offline") return `Offline — ${sync.pending} change${sync.pending === 1 ? "" : "s"} will sync when you're back online.`;
  if (sync.state === "error") return `${sync.message}${sync.pending ? ` ${sync.pending} change${sync.pending === 1 ? "" : "s"} waiting.` : ""}`;
  const when = sync.lastSync ? `Synced ${new Date(sync.lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Synced";
  return sync.localOnly ? `${when}. ${sync.localOnly} large item${sync.localOnly > 1 ? "s are" : " is"} kept on this device only.` : `${when}.`;
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
