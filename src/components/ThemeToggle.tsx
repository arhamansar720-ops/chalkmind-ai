"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { IconButton } from "./ui";

type Theme = "light" | "dark";

function current(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

export function setTheme(t: Theme | "system") {
  try {
    localStorage.setItem("cm-theme", t);
  } catch {
    /* storage may be unavailable */
  }
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, current, () => "light");
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <IconButton label={`Switch to ${next} theme`} onClick={() => setTheme(next)} className={className} size="sm">
      {theme === "dark" ? <Sun className="size-[17px]" /> : <Moon className="size-[17px]" />}
    </IconButton>
  );
}
