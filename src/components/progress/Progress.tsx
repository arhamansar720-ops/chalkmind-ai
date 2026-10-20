"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, CheckCircle2, ListChecks, MessagesSquare, SquareFunction, Sparkles } from "lucide-react";
import { activeDays, quizStats, reviewTopics } from "@/lib/learning/recommend";
import { useProfile } from "@/lib/client/profile";
import { newId, store, useCollection } from "@/lib/store";
import { now, relativeTime } from "@/lib/utils";
import { Badge, Button, Card, PageHeader, Spinner } from "@/components/ui";
import { Planner } from "./Planner";
import { Count } from "@/components/Motion";

export function Progress() {
  const router = useRouter();
  const { profile } = useProfile();
  const sessions = useCollection("sessions");
  const homework = useCollection("homework");
  const materials = useCollection("materials");
  const attempts = useCollection("attempts");
  const signals = useCollection("signals");
  const loading = sessions.loading || homework.loading || materials.loading || attempts.loading || signals.loading;

  const questions = useMemo(() => sessions.items.reduce((n, s) => n + s.messages.filter((m) => m.role === "user").length, 0), [sessions.items]);
  const review = useMemo(() => reviewTopics(signals.items), [signals.items]);
  const stats = useMemo(() => quizStats(attempts.items), [attempts.items]);
  const days = useMemo(() => {
    const ts = [
      ...sessions.items.flatMap((s) => s.messages.filter((m) => m.role === "user").map((m) => m.createdAt)),
      ...homework.items.map((h) => h.createdAt),
      ...materials.items.map((m) => m.createdAt),
      ...attempts.items.map((a) => a.createdAt),
    ];
    const cutoff = now() - 14 * 86_400_000;
    return activeDays(ts.filter((t) => t >= cutoff)).length;
  }, [sessions.items, homework.items, materials.items, attempts.items]);
  const subjects = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of [...sessions.items, ...homework.items, ...materials.items]) {
      const subj = (s as { subject?: string }).subject;
      if (subj) m.set(subj, (m.get(subj) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [sessions.items, homework.items, materials.items]);

  const isNew = !loading && sessions.items.length + homework.items.length + materials.items.length + attempts.items.length === 0;
  const avg = attempts.items.length ? Math.round(attempts.items.reduce((s, a) => s + (a.total ? a.score / a.total : 0), 0) / attempts.items.length * 100) : null;

  const markUnderstood = async (topic: string, subject?: string) => {
    const ts = now();
    await store.put("signals", { id: newId("sig"), title: topic, topic, subject, kind: "mastered", source: "student", createdAt: ts, updatedAt: ts });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        eyebrow="Progress"
        title={profile.name ? `Welcome back, ${profile.name.split(" ")[0]}` : "Your progress"}
        description="Everything here comes from what you've actually done in Chalkmind — nothing is estimated."
        actions={
          <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => router.push(`/app/tutor?new=${Date.now()}`)}>
            New session
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : isNew ? (
        <>
          <Card className="bg-dotgrid mt-8 p-6 sm:p-10">
            <p className="eyebrow">Getting started</p>
            <h2 className="mt-2 max-w-lg text-2xl font-semibold tracking-[-0.03em]">Your dashboard fills in as you learn.</h2>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
              Start with a question you&apos;re curious or stuck on. Sessions, quiz scores and topics to review will show up here.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { href: `/app/tutor?new=start`, icon: MessagesSquare, title: "Ask the tutor", body: "Watch an explanation unfold on the whiteboard." },
                { href: "/app/homework", icon: SquareFunction, title: "Solve a problem", body: "Get the method step by step, or just a hint." },
                { href: "/app/study", icon: BookOpen, title: "Make flashcards", body: "From a topic, your notes or a PDF." },
              ].map(({ href, icon: Icon, title, body }) => (
                <Link key={title} href={href} className="group rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent">
                  <Icon className="size-5 text-accent" />
                  <p className="mt-3 text-[14.5px] font-semibold">{title}</p>
                  <p className="mt-1 text-[13px] text-muted">{body}</p>
                  <ArrowRight className="mt-3 size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              ))}
            </div>
          </Card>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Planner kind="task" />
            <Planner kind="goal" />
          </div>
        </>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Tutor sessions" value={sessions.items.length} detail={`${questions} question${questions === 1 ? "" : "s"} asked`} />
            <Stat label="Homework solved" value={homework.items.length} detail={`${homework.items.filter((h) => h.verification.status === "verified").length} auto-checked`} />
            <Stat label="Quizzes taken" value={attempts.items.length} detail={avg !== null ? `${avg}% average` : "No quizzes yet"} />
            <Stat label="Active days" value={days} detail="in the last 14 days" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col gap-6">
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold tracking-tight">Topics to review</h2>
                  {!profile.personalize && <Badge>Personalization off</Badge>}
                </div>
                {review.length === 0 ? (
                  <p className="text-[13px] leading-relaxed text-muted">
                    {profile.personalize
                      ? "Nothing flagged. Topics appear here when you miss quiz questions, the tutor notices a misconception, or you bookmark a session for review."
                      : "Turn on personalization in Settings to track topics to review."}
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {review.map((t) => (
                      <li key={t.topic} className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 xl:flex-row xl:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-medium">
                            {t.topic} {t.subject && <span className="text-[12px] font-normal text-muted">· {t.subject}</span>}
                          </p>
                          <p className="text-[12px] text-muted">{t.reasons.join(" · ")}</p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() =>
                              router.push(`/app/study?topic=${encodeURIComponent(t.topic)}&subject=${encodeURIComponent(t.subject ?? "General")}&format=mcq&focus=review&auto=1`)
                            }
                          >
                            Practice
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              router.push(`/app/tutor?new=${Date.now()}&q=${encodeURIComponent(`I've been struggling with ${t.topic}. Can you explain it a different way and give me a couple of practice problems at my level?`)}`)
                            }
                          >
                            Re-explain
                          </Button>
                          <Button size="sm" variant="ghost" icon={<CheckCircle2 className="size-3.5" />} onClick={() => void markUnderstood(t.topic, t.subject)} aria-label={`Mark ${t.topic} as understood`}>
                            Got it
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold tracking-tight">Recent sessions</h2>
                  <Link href="/app/library?type=session" className="text-[12.5px] text-accent">
                    All sessions
                  </Link>
                </div>
                {sessions.items.length === 0 ? (
                  <p className="text-[13px] text-muted">No tutor sessions yet.</p>
                ) : (
                  <ul className="flex flex-col">
                    {sessions.items.slice(0, 5).map((s) => (
                      <li key={s.id} className="border-t border-border first:border-t-0">
                        <Link href={`/app/tutor?s=${s.id}`} className="flex items-center gap-3 py-2.5 hover:text-accent">
                          <MessagesSquare className="size-4 shrink-0 text-muted" />
                          <span className="min-w-0 flex-1 truncate text-[14px]">{s.title}</span>
                          <span className="shrink-0 text-[12px] text-muted">{relativeTime(s.updatedAt)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Planner kind="task" />
            </div>

            <div className="flex flex-col gap-6">
              <Card className="p-5">
                <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Quiz performance</h2>
                {stats.length === 0 ? (
                  <p className="text-[13px] text-muted">
                    Take a quiz in <Link href="/app/study" className="text-accent">Study Materials</Link> to see scores here.
                  </p>
                ) : (
                  <>
                    <ul className="flex flex-col gap-3">
                      {stats.map((s) => (
                        <li key={s.subject}>
                          <div className="mb-1 flex justify-between text-[13px]">
                            <span className="font-medium">{s.subject}</span>
                            <span className="text-muted">
                              {s.average}% avg · {s.attempts} quiz{s.attempts > 1 ? "zes" : ""}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${s.subject} average ${s.average}%`}>
                            <div className="h-full rounded-full bg-accent" style={{ width: `${s.average}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                    <ul className="mt-4 flex flex-col border-t border-border pt-3">
                      {attempts.items.slice(0, 5).map((a) => (
                        <li key={a.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                          <ListChecks className="size-3.5 shrink-0 text-muted" />
                          <Link href={`/app/study?id=${a.materialId}`} className="min-w-0 flex-1 truncate hover:text-accent">
                            {a.title}
                          </Link>
                          <span className="font-mono text-[12px]">{a.total ? Math.round((a.score / a.total) * 100) : 0}%</span>
                          <span className="text-[11.5px] text-muted">{relativeTime(a.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>

              <Card className="p-5">
                <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Subjects studied</h2>
                {subjects.length === 0 ? (
                  <p className="text-[13px] text-muted">Subjects appear as you study.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {subjects.map(([s, n]) => (
                      <Badge key={s} className="px-2.5 py-1 text-[12.5px]">
                        {s} <span className="text-muted">{n}</span>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[13px]">
                  <span className="text-muted">Saved study sets</span>
                  <Link href="/app/library" className="font-medium text-accent">
                    {materials.items.length} in library
                  </Link>
                </div>
              </Card>

              <Planner kind="goal" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <Card className="p-4">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.04em]">
        <Count to={value} />
      </p>
      <p className="mt-1.5 text-[12px] text-muted">{detail}</p>
    </Card>
  );
}
