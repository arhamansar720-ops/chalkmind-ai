"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setAuthToken } from "@/lib/client/api";
import { getSupabase } from "@/lib/client/supabase";
import { setRepository } from "@/lib/store";
import { createCloudRepository } from "@/lib/store/cloud";
import { createLocalRepository } from "@/lib/store/local";

interface AuthState {
  /** Cloud sync is configured on this deployment. */
  available: boolean;
  user: { id: string; email?: string } | null;
  ready: boolean;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  available: false,
  user: null,
  ready: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Chooses where data lives: IndexedDB on this device by default, or the
 * student's own Supabase rows once they sign in with a magic link.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [user, setUser] = useState<AuthState["user"]>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    const apply = (session: { user: { id: string; email?: string }; access_token: string } | null) => {
      if (session) {
        setUser({ id: session.user.id, email: session.user.email });
        setAuthToken(session.access_token);
        setRepository(createCloudRepository(supabase, session.user.id));
      } else {
        setUser(null);
        setAuthToken(null);
        setRepository(createLocalRepository());
      }
      setReady(true);
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const signIn = useCallback(
    async (email: string) => {
      if (!supabase) throw new Error("Cloud sync isn't configured.");
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/app/settings` } });
      if (error) throw new Error(error.message);
    },
    [supabase],
  );
  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, [supabase]);

  const value = useMemo(() => ({ available: Boolean(supabase), user, ready, signIn, signOut }), [supabase, user, ready, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
