import "server-only";
import { z } from "zod";
import { COLLECTIONS, type CollectionName } from "../store/types";
import { db } from "./db";
import { HttpError } from "./http-error";

/** Vercel caps request bodies at 4.5 MB; leave headroom. */
export const MAX_RECORD_BYTES = 4 * 1024 * 1024;

export function collectionName(raw: string): CollectionName {
  if (!(COLLECTIONS as string[]).includes(raw)) throw new HttpError(404, "not_found", "Unknown collection.");
  return raw as CollectionName;
}

export const recordSchema = z
  .object({ id: z.string().min(1).max(120), updatedAt: z.number().finite().nonnegative() })
  .passthrough();
export type StoredRecord = z.infer<typeof recordSchema>;

export interface Change {
  collection: CollectionName;
  id: string;
  deleted: boolean;
  updatedAt: number;
  data: StoredRecord | null;
}

export async function listRecords(userId: string, collection: CollectionName): Promise<StoredRecord[]> {
  const rows = await db()<{ data: StoredRecord }[]>`
    select data from records where user_id = ${userId} and collection = ${collection} and not deleted order by updated_at desc`;
  return rows.map((r) => r.data);
}

export async function getRecord(userId: string, collection: CollectionName, id: string): Promise<StoredRecord | null> {
  const [row] = await db()<{ data: StoredRecord }[]>`
    select data from records where user_id = ${userId} and collection = ${collection} and id = ${id} and not deleted`;
  return row?.data ?? null;
}

/** Upsert, last write (by the record's updatedAt) wins. Returns false if a newer copy was kept. */
export async function putRecord(userId: string, collection: CollectionName, record: StoredRecord): Promise<boolean> {
  const rows = await db()`
    insert into records (user_id, collection, id, data, updated_at, deleted)
    values (${userId}, ${collection}, ${record.id}, ${db().json(record as never)}, ${Math.round(record.updatedAt)}, false)
    on conflict (user_id, collection, id) do update
      set data = excluded.data, updated_at = excluded.updated_at, deleted = false, synced_at = clock_timestamp()
      where records.updated_at <= excluded.updated_at
    returning 1`;
  return rows.length > 0;
}

/** Soft delete (a tombstone), so other devices learn about it on their next sync. */
export async function deleteRecord(userId: string, collection: CollectionName, id: string): Promise<void> {
  await db()`
    insert into records (user_id, collection, id, data, updated_at, deleted)
    values (${userId}, ${collection}, ${id}, '{}'::jsonb, ${Date.now()}, true)
    on conflict (user_id, collection, id) do update
      set data = '{}'::jsonb, updated_at = excluded.updated_at, deleted = true, synced_at = clock_timestamp()`;
}

export async function clearCollection(userId: string, collection: CollectionName): Promise<void> {
  await db()`
    update records set data = '{}'::jsonb, updated_at = ${Date.now()}, deleted = true, synced_at = clock_timestamp()
    where user_id = ${userId} and collection = ${collection} and not deleted`;
}

/** Everything that changed after `since` (server time, ISO), plus the cursor to use next. */
export async function changesSince(userId: string, since: string | null, limit = 500): Promise<{ changes: Change[]; cursor: string | null; more: boolean }> {
  const sql = db();
  const rows = await sql<{ collection: CollectionName; id: string; deleted: boolean; updated_at: string; data: StoredRecord; synced_at: Date }[]>`
    select collection, id, deleted, updated_at, data, synced_at from records
    where user_id = ${userId} ${since ? sql`and synced_at > ${new Date(since)}` : sql``}
    order by synced_at asc limit ${limit + 1}`;
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    changes: page.map((r) => ({ collection: r.collection, id: r.id, deleted: r.deleted, updatedAt: Number(r.updated_at), data: r.deleted ? null : r.data })),
    cursor: page.length ? page[page.length - 1].synced_at.toISOString() : since,
    more,
  };
}

