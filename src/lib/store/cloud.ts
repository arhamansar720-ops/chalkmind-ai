import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectionMap, CollectionName, Repository } from "./types";

/**
 * Supabase-backed storage (optional cloud sync). Each collection is a table
 * `cm_<name>` with columns (id, user_id, title, data jsonb, created_at,
 * updated_at). Row-level security (supabase/migrations) restricts every row
 * to `auth.uid() = user_id`, so the anon key in the browser can only ever
 * read or write the signed-in student's own records.
 */
export const tableFor = (name: CollectionName) => `cm_${name}`;

export function createCloudRepository(client: SupabaseClient, userId: string): Repository {
  const table = (name: CollectionName) => client.from(tableFor(name));
  const fail = (op: string, error: { message: string } | null) => {
    if (error) throw new Error(`Cloud sync ${op} failed: ${error.message}`);
  };

  return {
    kind: "cloud",
    async list<K extends CollectionName>(name: K) {
      const { data, error } = await table(name).select("data").eq("user_id", userId).order("updated_at", { ascending: false });
      fail("list", error);
      return (data ?? []).map((row) => row.data as CollectionMap[K]);
    },
    async get<K extends CollectionName>(name: K, id: string) {
      const { data, error } = await table(name).select("data").eq("user_id", userId).eq("id", id).maybeSingle();
      fail("get", error);
      return (data?.data as CollectionMap[K] | undefined) ?? undefined;
    },
    async put<K extends CollectionName>(name: K, record: CollectionMap[K]) {
      const { error } = await table(name).upsert({
        id: record.id,
        user_id: userId,
        title: record.title,
        data: record,
        created_at: new Date(record.createdAt || Date.now()).toISOString(),
        updated_at: new Date(record.updatedAt || Date.now()).toISOString(),
      });
      fail("save", error);
    },
    async delete<K extends CollectionName>(name: K, id: string) {
      const { error } = await table(name).delete().eq("user_id", userId).eq("id", id);
      fail("delete", error);
    },
    async clear<K extends CollectionName>(name: K) {
      const { error } = await table(name).delete().eq("user_id", userId);
      fail("clear", error);
    },
  };
}
