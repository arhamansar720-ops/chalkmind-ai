"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { UNAUTHORIZED_EVENT } from "@/lib/client/api";
import { authApi, type AccountUser, type AuthInfo } from "@/lib/client/auth";
import { notifyChanged, setRepository } from "@/lib/store";
import { createLocalRepository } from "@/lib/store/local";
import { createSyncedRepository, type SyncedRepository, type SyncStatus } from "@/lib/store/synced";
import { COLLECTIONS } from "@/lib/store/types";

interface AuthState {
  /** This deployment has accounts. */
  available: boolean;
  required: boolean;
  user: AccountUser | null;
  ready: boolean;
  sync: SyncStatus | null;
  syncNow: () => void;
  signOut: () => Promise<void>;
  /** Records saved on this device before signing in (offered for upload once). */
  guestRecords: number;
  importGuestData: () => Promise<number>;
  dismissGuestData: () => void;
}

const AuthContext = createContext<AuthState>({
  available: false,
  required: false,
  user: null,
  ready: true,
  sync: null,
  syncNow: () => {},
  signOut: async () => {},
  guestRecords: 0,
  importGuestData: async () => 0,
  dismissGuestData: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const importedKey = (uid: string) => `cm-guest-imported-${uid}`;

function toSignIn() {
  const next = `${location.pathname}${location.search}`;
  // A full load (not router.push) so no in-memory state from the old session survives.
  location.replace(`/signin?next=${encodeURIComponent(next)}`);
}

/**
 * Decides where data lives. Signed in: a per-account IndexedDB cache synced
 * with the server. Otherwise (accounts off): this device's IndexedDB only.
 * Children render only once that's settled, so nothing is written to the
 * wrong place while the session is being checked.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [guestRecords, setGuestRecords] = useState(0);
  const repoRef = useRef<SyncedRepository | null>(null);

  const deactivate = useCallback(() => {
    repoRef.current?.dispose();
    repoRef.current = null;
    setSync(null);
    setRepository(createLocalRepository());
  }, []);

  const activate = useCallback(
    (user: AccountUser) => {
      repoRef.current?.dispose();
      const repo = createSyncedRepository(user.id, {
        onStatus: setSync,
        onChanged: notifyChanged,
        onSignedOut: () => window.dispatchEvent(new Event(UNAUTHORIZED_EVENT)),
      });
      repoRef.current = repo;
      setRepository(repo);
      void repo.syncNow();
      // Offer this device's pre-account data once.
      let asked = false;
      try {
        asked = localStorage.getItem(importedKey(user.id)) === "1";
      } catch {
        /* storage blocked */
      }
      if (!asked) {
        const guest = createLocalRepository();
        void Promise.all(COLLECTIONS.filter((c) => c !== "profile").map((c) => guest.list(c).then((l) => l.length)))
          .then((counts) => setGuestRecords(counts.reduce((a, b) => a + b, 0)))
          .catch(() => setGuestRecords(0));
      }
    },
    [],
  );

  /** Apply the server's answer to "who is signed in?" (null: the server couldn't be reached). */
  const apply = useCallback(
    (me: AuthInfo | null) => {
      if (!me) {
        // Can't reach the server: keep working from this device.
        setInfo((i) => i ?? { user: null, accounts: false, required: false, inviteRequired: false });
      } else {
        setInfo(me);
        if (me.user) activate(me.user);
        else {
          deactivate();
          if (me.required) return toSignIn();
        }
      }
      setReady(true);
    },
    [activate, deactivate],
  );

  useEffect(() => {
    const check = () => authApi.me().then(apply, () => apply(null));
    void check();
    window.addEventListener(UNAUTHORIZED_EVENT, check);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, check);
      repoRef.current?.dispose();
    };
  }, [apply]);

  const signOut = useCallback(async () => {
    await authApi.signOut().catch(() => undefined);
    deactivate();
    setInfo((i) => (i ? { ...i, user: null } : i));
    if (info?.required) toSignIn();
  }, [deactivate, info?.required]);

  const user = info?.user ?? null;
  const importGuestData = useCallback(async () => {
    if (!repoRef.current || !user) return 0;
    const n = await repoRef.current.importFrom(createLocalRepository());
    try {
      localStorage.setItem(importedKey(user.id), "1");
    } catch {
      /* ignore */
    }
    setGuestRecords(0);
    return n;
  }, [user]);
  const dismissGuestData = useCallback(() => {
    if (user) {
      try {
        localStorage.setItem(importedKey(user.id), "1");
      } catch {
        /* ignore */
      }
    }
    setGuestRecords(0);
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({
      available: Boolean(info?.accounts),
      required: Boolean(info?.required),
      user,
      ready,
      sync,
      syncNow: () => void repoRef.current?.syncNow(),
      signOut,
      guestRecords,
      importGuestData,
      dismissGuestData,
    }),
    [info, user, ready, sync, signOut, guestRecords, importGuestData, dismissGuestData],
  );

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg text-[13px] text-muted" role="status">
        Loading your workspace…
      </div>
    );
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
