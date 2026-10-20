import { openDB, type IDBPDatabase } from "idb";
import { COLLECTIONS, type CollectionMap, type CollectionName, type Repository } from "./types";

/**
 * Local-first storage in the browser's IndexedDB. Data never leaves the
 * device. This is the guest store when accounts aren't configured or
 * the student isn't signed in.
 */
const DB_NAME = "chalkmind";
// 2: adds the "memories" store (the upgrade creates any missing stores).
const DB_VERSION = 2;

export function createLocalRepository(dbName = DB_NAME): Repository {
  let dbPromise: Promise<IDBPDatabase> | null = null;
  const db = () =>
    (dbPromise ??= openDB(dbName, DB_VERSION, {
      upgrade(database) {
        for (const name of COLLECTIONS) {
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: "id" });
        }
      },
    }));

  return {
    kind: "local",
    async list<K extends CollectionName>(name: K) {
      const all = (await (await db()).getAll(name)) as CollectionMap[K][];
      return all.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async get<K extends CollectionName>(name: K, id: string) {
      return (await (await db()).get(name, id)) as CollectionMap[K] | undefined;
    },
    async put<K extends CollectionName>(name: K, record: CollectionMap[K]) {
      await (await db()).put(name, structuredClone(record));
    },
    async delete<K extends CollectionName>(name: K, id: string) {
      await (await db()).delete(name, id);
    },
    async clear<K extends CollectionName>(name: K) {
      await (await db()).clear(name);
    },
  };
}
