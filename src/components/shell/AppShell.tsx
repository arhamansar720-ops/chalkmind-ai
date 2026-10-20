"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Library,
  Menu,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  SquareFunction,
  X,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconButton } from "@/components/ui";
import { useCollection } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AuthProvider, useAuth } from "./AuthProvider";
import { RecentChats } from "./RecentChats";

const NAV = [
  { href: "/app/tutor", label: "AI Tutor", icon: MessagesSquare },
  { href: "/app/homework", label: "Homework Solver", icon: SquareFunction },
  { href: "/app/study", label: "Study Materials", icon: BookOpen },
  { href: "/app/library", label: "My Library", icon: Library },
  { href: "/app/progress", label: "Progress", icon: BarChart3 },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ShellInner>{children}</ShellInner>
    </AuthProvider>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [roomy, setRoomy] = useState(true);
  const pathname = usePathname();
  // The whiteboard needs width: on the tutor, fold the sidebar to a rail on
  // screens narrower than 1536px (without changing the saved preference).
  const autoCollapse = pathname.startsWith("/app/tutor") && !roomy;
  const isCollapsed = collapsed || autoCollapse;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1536px)");
    const apply = () => setRoomy(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore a per-device preference after hydration
      setCollapsed(localStorage.getItem("cm-sidebar") === "collapsed");
    } catch {
      /* ignore */
    }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close the drawer after navigating
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = () => {
    if (autoCollapse) {
      setRoomy(true);
      return;
    }
    setCollapsed((c) => {
      try {
        localStorage.setItem("cm-sidebar", c ? "open" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-surface/60 transition-[width] duration-200 md:flex",
          isCollapsed ? "w-[64px]" : "w-[248px]",
        )}
        aria-label="Main navigation"
      >
        <SidebarContent collapsed={isCollapsed} onToggle={toggle} />
      </aside>

      {/* Mobile drawer */}
      <div className={cn("fixed inset-0 z-40 md:hidden", mobileOpen ? "" : "pointer-events-none")} aria-hidden={!mobileOpen}>
        <div className={cn("absolute inset-0 bg-black/30 transition-opacity", mobileOpen ? "opacity-100" : "opacity-0")} onClick={() => setMobileOpen(false)} />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-border bg-surface shadow-lg transition-transform duration-200",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="Main navigation"
          inert={!mobileOpen}
        >
          <div className="absolute right-2 top-3">
            <IconButton label="Close menu" size="sm" onClick={() => setMobileOpen(false)}>
              <X className="size-4" />
            </IconButton>
          </div>
          <SidebarContent collapsed={false} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface/70 px-3 backdrop-blur md:hidden">
          <IconButton label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </IconButton>
          <Link href="/app/tutor" aria-label="Chalkmind home">
            <Logo />
          </Link>
          <ThemeToggle />
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { items: sessions } = useCollection("sessions");
  const { items: profiles } = useCollection("profile");
  const { user, available } = useAuth();
  const name = profiles[0]?.name?.trim();
  const recent = sessions;

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 items-center", collapsed ? "justify-center" : "justify-between px-4")}>
        {collapsed ? (
          <Link href="/" aria-label="Chalkmind home">
            <LogoMark />
          </Link>
        ) : (
          <Link href="/" aria-label="Chalkmind home" className="rounded-lg">
            <Logo />
          </Link>
        )}
        {onToggle && !collapsed && (
          <IconButton label="Collapse sidebar" size="sm" onClick={onToggle}>
            <PanelLeftClose className="size-4" />
          </IconButton>
        )}
      </div>

      <div className={cn("pb-2", collapsed ? "px-3" : "px-3")}>
        <button
          type="button"
          onClick={() => router.push(`/app/tutor?new=${Date.now()}`)}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-xl bg-ink text-[13.5px] font-medium text-bg shadow-sm transition-opacity hover:opacity-90",
            collapsed ? "justify-center" : "px-3",
          )}
          aria-label="New tutoring session"
          title="New session"
        >
          <Plus className="size-4" />
          {!collapsed && "New session"}
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg text-[13.5px] font-medium transition-colors",
                collapsed ? "justify-center" : "px-2.5",
                active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon className="size-[17px] shrink-0" aria-hidden />
              {collapsed ? <span className="sr-only">{label}</span> : label}
            </Link>
          );
        })}
      </nav>

      {!collapsed && recent.length > 0 && (
        <Suspense fallback={<div className="flex-1" />}>
          <RecentChats sessions={sessions} />
        </Suspense>
      )}
      {(collapsed || recent.length === 0) && <div className="flex-1" />}

      <div className={cn("border-t border-border p-3", collapsed && "flex flex-col items-center gap-2")}>
        {collapsed ? (
          <>
            <ThemeToggle />
            <Link href="/app/settings" aria-label="Settings" title="Settings" className="flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2">
              <Settings className="size-[17px]" />
            </Link>
            {onToggle && (
              <IconButton label="Expand sidebar" size="sm" onClick={onToggle}>
                <PanelLeftOpen className="size-4" />
              </IconButton>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/app/settings"
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2",
                pathname.startsWith("/app/settings") && "bg-surface-3",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
                {(name || user?.email || "S").slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{name || user?.name || "Student"}</span>
                <span className="block truncate text-[11px] text-muted">{user ? user.email : available ? "Saved on this device · sign in to sync" : "Saved on this device"}</span>
              </span>
              <Settings className="ml-auto size-4 shrink-0 text-muted" aria-label="Settings" />
            </Link>
            <ThemeToggle />
          </div>
        )}
      </div>
    </div>
  );
}
