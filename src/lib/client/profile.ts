"use client";

import { useCallback, useMemo } from "react";
import { store, useCollection } from "../store";
import { DEFAULT_PROFILE, type Profile } from "../store/types";
import { reviewTopics } from "../learning/recommend";

export function useProfile() {
  const { items, loading } = useCollection("profile");
  const profile: Profile = useMemo(() => {
    const p = items.find((i) => i.id === "me");
    return p ? { ...DEFAULT_PROFILE, ...p, voice: { ...DEFAULT_PROFILE.voice, ...p.voice } } : DEFAULT_PROFILE;
  }, [items]);
  const update = useCallback(
    async (patch: Partial<Omit<Profile, "voice">> & { voice?: Partial<Profile["voice"]> }) => {
      const now = Date.now();
      const next: Profile = {
        ...profile,
        ...patch,
        voice: { ...profile.voice, ...(patch.voice ?? {}) },
        id: "me",
        title: "Profile",
        createdAt: profile.createdAt || now,
        updatedAt: now,
      };
      await store.put("profile", next);
    },
    [profile],
  );
  return { profile, loading, update };
}

/** Personalisation payload for AI requests — only when the student has it switched on. */
export function usePersonalization() {
  const { profile } = useProfile();
  const { items: signals } = useCollection("signals");
  return useMemo(() => {
    if (!profile.personalize) return { profile: undefined, topics: [] as string[] };
    const topics = reviewTopics(signals).map((t) => t.topic);
    return {
      profile: { style: profile.style, level: profile.level, reviewTopics: topics.slice(0, 6) },
      topics,
    };
  }, [profile, signals]);
}
