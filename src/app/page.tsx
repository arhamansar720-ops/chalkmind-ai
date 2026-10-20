import Link from "next/link";
import { ArrowRight, BookOpenText, ChartNoAxesColumn, FileSearch, Layers, Lightbulb, Mic, PencilRuler, ShieldCheck, SquareFunction } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Blur, HeroDots, HeroTitle, MagnetLink, Reveal, Shiny, Sparks, Spotlight } from "@/components/Motion";

const STEPS = [
  { n: "01", title: "Ask it your way", body: "Type a question, say it out loud, or snap a photo of the problem. Attach your notes or a textbook PDF if you want answers grounded in them." },
  { n: "02", title: "Watch it unfold", body: "The tutor talks you through it while equations, diagrams and graphs appear on a real whiteboard — one step at a time, never a wall of text." },
  { n: "03", title: "Make it stick", body: "Turn the lesson into flashcards or a quiz, get graded with explanations, and come back to the topics that still feel shaky." },
];

export default function Landing() {
  return (
    <Sparks className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-transparent bg-bg/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Primary">
          <Link href="/" aria-label="Chalkmind home">
            <Logo />
          </Link>
          <div className="hidden items-center gap-7 text-[14px] text-ink-2 md:flex">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#models" className="hover:text-ink">Models & privacy</a>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/app/tutor" className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13.5px] font-medium text-bg transition-opacity hover:opacity-90">
              Open Chalkmind
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <HeroDots />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" aria-hidden />
          <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
            <Link href="/app/tutor" className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/90 py-1 pl-1 pr-3 text-[12.5px] text-ink-2 shadow-sm backdrop-blur hover:border-border-strong">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wider text-accent">NEW</span>
              <Shiny text="Voice tutoring on a live whiteboard" />
              <ArrowRight className="size-3.5" />
            </Link>
            <HeroTitle />
            <Reveal delay={0.35} distance={20}>
              <p className="mt-7 max-w-xl text-[17px] leading-[1.65] text-ink-2">
                Chalkmind is your personal AI tutor with an interactive whiteboard. Ask by voice or text and watch the explanation take shape, step by step — then practice until it clicks.
              </p>
            </Reveal>
            <Reveal delay={0.5} distance={20} className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
              <MagnetLink>
                <Link href="/app/tutor" className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-bg shadow-md transition-opacity hover:opacity-90">
                  Start learning <ArrowRight className="size-4" />
                </Link>
              </MagnetLink>
              <a href="#how" className="inline-flex h-12 items-center gap-1.5 rounded-full px-5 text-[15px] font-medium text-ink-2 hover:text-ink">
                How it works
              </a>
            </Reveal>
            <p className="eyebrow mt-7 flex flex-wrap justify-center gap-x-3 gap-y-1">
              <span>No account needed</span>
              <span aria-hidden>·</span>
              <span>Works with local models</span>
              <span aria-hidden>·</span>
              <span>Your notes stay on your device</span>
            </p>
          </div>
          <div className="relative px-4 pb-20 sm:px-6">
            <Reveal delay={0.2} distance={60}>
              <ProductPreview />
            </Reveal>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
          <p className="eyebrow">01 · How it works</p>
          <h2 className="mt-3 max-w-2xl text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[44px]">
            <Blur text="From “I don't get it” to “oh — I see.”" />
          </h2>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-muted">A tutor that shows its thinking, waits for your questions and remembers where the lesson is.</p>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.n}>
                <Reveal delay={i * 0.1} className="h-full">
                  <Spotlight className="h-full !p-6">
                    <p className="font-mono text-[12px] text-accent">{s.n}</p>
                    <h3 className="mt-6 text-[19px] font-semibold tracking-[-0.02em]">{s.title}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
                  </Spotlight>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-y border-border bg-surface/50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <p className="eyebrow">02 · Features</p>
            <h2 className="mt-3 max-w-2xl text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[44px]">
              <Blur text="One workspace for the whole study loop." />
            </h2>
            <div className="mt-12 grid gap-4 md:grid-cols-6">
              <Feature className="md:col-span-4" icon={PencilRuler} title="A whiteboard the tutor actually draws on">
                Equations rendered line by line with notes on what changed. Labeled diagrams for processes and cycles. Real plotted graphs, tables, geometry figures and highlights. Draw alongside it, undo anything, and pick up later exactly where you left off.
              </Feature>
              <Feature className="md:col-span-2" icon={Mic} title="Talk to it">
                Ask out loud and hear explanations read back. Interrupt any time. Typing always works too.
              </Feature>
              <Feature className="md:col-span-2" icon={SquareFunction} title="Homework, explained">
                Restate, plan, solve, check. Ask for just a hint first. Numeric answers are re-checked with a calculator when possible — and labeled honestly when they can&apos;t be.
              </Feature>
              <Feature className="md:col-span-2" icon={Layers} title="Flashcards & quizzes">
                Generate a deck or a practice exam from a topic, your notes or a PDF. Rate your confidence, get graded with explanations.
              </Feature>
              <Feature className="md:col-span-2" icon={FileSearch} title="Grounded in your materials">
                Upload a textbook chapter and the tutor answers from it first, citing the page — and tells you when it&apos;s using general knowledge instead.
              </Feature>
              <Feature className="md:col-span-3" icon={ChartNoAxesColumn} title="Progress from real activity">
                Sessions, quiz scores and topics to review — built only from what you&apos;ve done. No invented streaks. Review and delete your learning data any time.
              </Feature>
              <Feature className="md:col-span-3" icon={BookOpenText} title="A library that remembers">
                Every session, whiteboard, solution and study set is saved and searchable, so you can come back to a lesson next week and keep going.
              </Feature>
            </div>
          </div>
        </section>

        {/* Philosophy */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-28 md:grid-cols-2 md:items-center">
          <div>
            <p className="eyebrow">03 · Built to teach</p>
            <h2 className="mt-3 text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[44px]">
              <Blur text="Understanding over answers." />
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-muted">
              Copying an answer doesn&apos;t help on test day. Chalkmind explains the why behind each step, asks you questions back when you want it to, and holds back the answer when you ask for a hint.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {[
              ["“Don't tell me the answer yet.”", "Hint mode gives one useful nudge and lets you take the next step."],
              ["“Explain it more simply.”", "Simpler mode swaps jargon for everyday language and smaller steps."],
              ["“Quiz me on it.”", "Socratic mode guides with questions, one at a time."],
            ].map(([q, a], i) => (
              <li key={q}>
                <Reveal delay={i * 0.1} distance={24} className="flex gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <Lightbulb className="mt-0.5 size-5 shrink-0 text-accent" />
                  <div>
                    <p className="font-medium">{q}</p>
                    <p className="mt-1 text-[14px] text-muted">{a}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>

        {/* Models */}
        <section id="models" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <p className="eyebrow">04 · Models & privacy</p>
            <div className="mt-3 grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[44px]">
                  <Blur text="Your model. Your data." />
                </h2>
                <p className="mt-4 text-[16px] leading-relaxed text-muted">
                  Chalkmind works with hosted models from Groq, OpenAI, Anthropic and OpenRouter, or runs entirely on your own computer with Ollama. Hosted models are billed by their provider per use (some offer free tiers); local models cost nothing to run.
                </p>
              </div>
              <ul className="grid gap-3 text-[14.5px]">
                {[
                  [ShieldCheck, "API keys stay on the server — never in your browser."],
                  [ShieldCheck, "Sessions and notes are saved on your device by default. Optional sign-in syncs them to your own private account."],
                  [ShieldCheck, "Every drawing the AI makes is checked against a strict schema. It can't run code on your device."],
                  [ShieldCheck, "No fake answers: if no model is connected, Chalkmind says so instead of making something up."],
                ].map(([Icon, t], i) => {
                  const I = Icon as typeof ShieldCheck;
                  return (
                    <li key={i} className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
                      <I className="mt-0.5 size-4.5 shrink-0 text-success" />
                      <span className="text-ink-2">{t as string}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="bg-dotgrid mx-auto max-w-6xl rounded-[28px] border border-border bg-surface px-6 py-16 text-center shadow-md sm:py-20">
            <h2 className="mx-auto max-w-2xl text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[48px]">
              <Blur text="What are you trying to understand?" />
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[16px] text-muted">Ask your first question. The board is ready when you are.</p>
            <div className="mt-8 flex justify-center">
              <MagnetLink>
                <Link href="/app/tutor" className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-bg shadow-md transition-opacity hover:opacity-90">
                  Start learning <ArrowRight className="size-4" />
                </Link>
              </MagnetLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:px-6">
          <Logo />
          <p>Think it. See it. Understand it. · chalkmind.app</p>
          <div className="flex gap-5">
            <Link href="/app/tutor" className="hover:text-ink">Tutor</Link>
            <Link href="/app/study" className="hover:text-ink">Study</Link>
            <Link href="/app/settings" className="hover:text-ink">Settings</Link>
          </div>
        </div>
      </footer>
    </Sparks>
  );
}

function Feature({ icon: Icon, title, children, className }: { icon: typeof PencilRuler; title: string; children: React.ReactNode; className?: string }) {
  return (
    <Reveal distance={28} className={className}>
      <Spotlight className="h-full !p-6">
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon className="size-5" />
        </span>
        <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{children}</p>
      </Spotlight>
    </Reveal>
  );
}
