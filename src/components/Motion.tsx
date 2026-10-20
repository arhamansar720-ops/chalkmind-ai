"use client";

// React Bits components (src/components/rb), wrapped to follow Chalkmind's
// tokens and light/dark theme. Every wrapper falls back to static content when
// the visitor prefers reduced motion.

import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import AnimatedContent from "./rb/AnimatedContent";
import BlurText from "./rb/BlurText";
import ClickSpark from "./rb/ClickSpark";
import CountUp from "./rb/CountUp";
import DotGrid from "./rb/DotGrid";
import Magnet from "./rb/Magnet";
import RotatingText from "./rb/RotatingText";
import ShinyText from "./rb/ShinyText";
import SplitText from "./rb/SplitText";
import SpotlightCard from "./rb/SpotlightCard";
import { useTheme } from "./ThemeToggle";

const ACCENT = { dark: "#8199ff", light: "#4263eb" };

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReduced, () => matchMedia(REDUCED).matches, () => false);
}

/** Interactive dot field behind the hero: dots swell toward the cursor, a click sends a shockwave. */
export function HeroDots() {
  const dark = useTheme() === "dark";
  const reduced = useReducedMotion();
  if (reduced) return <div className="bg-dotgrid absolute inset-0" aria-hidden />;
  return (
    <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(80%_70%_at_50%_30%,#000_35%,transparent)]" aria-hidden>
      <DotGrid
        key={dark ? "d" : "l"}
        dotSize={2.6}
        gap={22}
        baseColor={dark ? "#26262c" : "#d6d6cf"}
        activeColor={dark ? ACCENT.dark : ACCENT.light}
        proximity={130}
        shockRadius={240}
        shockStrength={4}
        glow={dark ? 0.6 : 0.2}
      />
    </div>
  );
}

export function HeroTitle() {
  const reduced = useReducedMotion();
  return (
    <h1 className="tracking-display mt-7 max-w-4xl text-[44px] font-semibold leading-[1.02] sm:text-[68px] lg:text-[80px]">
      {reduced ? (
        "Think it."
      ) : (
        <SplitText
          text="Think it."
          tag="span"
          className="inline-block"
          splitType="chars"
          delay={34}
          duration={0.7}
          from={{ opacity: 0, y: 40, filter: "blur(6px)" }}
          to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          threshold={0}
          rootMargin="0px"
        />
      )}{" "}
      <span className="relative inline-block">
        <span className="absolute -inset-x-2 inset-y-[0.12em] -rotate-1 rounded-[14px] bg-accent" aria-hidden />
        {reduced ? (
          <span className="relative text-accent-ink">See it.</span>
        ) : (
          <RotatingText
            texts={["See it.", "Hear it.", "Draw it."]}
            mainClassName="relative inline-flex text-accent-ink"
            splitLevelClassName="overflow-hidden pb-[0.08em]"
            staggerFrom="last"
            staggerDuration={0.02}
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            exit={{ y: "-120%" }}
            transition={{ type: "spring", damping: 28, stiffness: 380 }}
            rotationInterval={2600}
          />
        )}
      </span>
      <br />
      {reduced ? (
        <span className="text-muted">Understand it.</span>
      ) : (
        <BlurText text="Understand it." className="inline-flex justify-center text-muted" animateBy="words" direction="top" delay={160} stepDuration={0.35} />
      )}
    </h1>
  );
}

export function Blur({ text, className, delay = 40 }: { text: string; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className}>{text}</span>;
  return <BlurText text={text} className={className} animateBy="words" direction="top" delay={delay} stepDuration={0.3} />;
}

export function Shiny({ text, className }: { text: string; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className}>{text}</span>;
  return <ShinyText text={text} className={className} speed={3} color="var(--ink-2)" shineColor="var(--accent)" />;
}

export function Reveal({ children, delay = 0, distance = 36, className }: { children: ReactNode; delay?: number; distance?: number; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <AnimatedContent distance={distance} duration={0.85} ease="power3.out" initialOpacity={0} scale={0.98} threshold={0.12} delay={delay} className={className}>
      {children}
    </AnimatedContent>
  );
}

/** A card with a cursor-following spotlight, painted with Chalkmind's own surface and border. */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  const dark = useTheme() === "dark";
  const style = { "--spotlight-card-surface": "var(--surface)", "--spotlight-card-border": "var(--border)" } as CSSProperties;
  return (
    <SpotlightCard
      theme={dark ? "dark" : "light"}
      className={className}
      style={style}
      spotlightColor={dark ? "rgba(129,153,255,0.22)" : "rgba(66,99,235,0.12)"}
      intensity={dark ? 0.35 : 0.5}
      spotlightSize={300}
    >
      {children}
    </SpotlightCard>
  );
}

export function MagnetLink({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <Magnet padding={60} magnetStrength={3} maxOffset={12}>
      {children}
    </Magnet>
  );
}

export function Count({ to, className }: { to: number; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced || to === 0) return <span className={className}>{to}</span>;
  return <CountUp to={to} duration={1.2} separator="," className={className} />;
}

export function Sparks({ children, className = "" }: { children: ReactNode; className?: string }) {
  const dark = useTheme() === "dark";
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <ClickSpark sparkColor={dark ? ACCENT.dark : ACCENT.light} sparkSize={9} sparkRadius={18} sparkCount={8} duration={420} className={className}>
      {children}
    </ClickSpark>
  );
}
