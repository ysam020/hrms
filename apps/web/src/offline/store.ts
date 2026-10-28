import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { diag } from "./diag";

// Offline persistence. One IndexedDB database, "praesto-offline", separate
// from Classic's "hrms_db" cache. Every record carries a `scope` — the
// signed-in tenant and user — and every read filters on it, so work saved by
// one person or organisation is never shown to, or sent as, another.
//
// Stores:
//   drafts     form drafts, keyed `${scope}|${formKey}`
//   mutations  the queued-operation log (see queue.ts)
//   uploads    resumable upload sessions (see uploads.ts)
//   files      the selected file's bytes, keyed by upload id
//   meta       small key/value facts (schema version, last sync)
//
// Version history (bump DB_VERSION and add a step to `upgrade` for changes):
//   1 — initial schema.

export const DB_NAME = "praesto-offline";
export const DB_VERSION = 1;
export const SCHEMA = 1;

export type Scope = string; // `${tenantId}:${userId}`

export interface DraftRecord {
  id: string;
  scope: Scope;
  formKey: string;
  data: unknown;
  /** The server version the draft started from, for edits. */
  baseVersion?: string;
  updatedAt: number;
  schema: number;
}

export type MutationStatus =
  | "queued" // waiting for a connection or its turn
  | "syncing"
  | "synced"
  | "retrying" // transient failure, will retry automatically
  | "attention" // needs the person: validation, permission, gave up retrying
  | "conflict" // the server copy changed since this edit began
  | "auth"; // paused until the person signs in again

export interface MutationRecord {
  id: string;
  scope: Scope;
  /** Stable name of the workflow, e.g. "leave.create". */
  kind: string;
  /** What the person sees in the pending list. Never the payload. */
  label: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  body: Record<string, unknown>;
  idempotencyKey: string;
  /** Sent as If-Match; the server refuses the write if the record changed. */
  ifMatch?: string;
  /** Upload ids whose final URL is written into `body[field]` before send. */
  uploads?: { uploadId: string; field: string }[];
  /** Mutation ids that must sync first. */
  dependsOn?: string[];
  status: MutationStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError?: { code: string; message: string };
  /** For conflicts: the server's current copy, as returned by the API. */
  serverCopy?: unknown;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
  schema: number;
}

export type UploadStatus =
  | "selected"
  | "waiting"
  | "uploading"
  | "paused"
  | "interrupted"
  | "verifying"
  | "completed"
  | "failed"
  | "needs-file"; // the bytes were lost (storage cleared); reselect

export interface UploadRecord {
  id: string;
  scope: Scope;
  status: UploadStatus;
  fileName: string;
  fileType: string;
  size: number;
  lastModified: number;
  folder: string;
  username: string;
  field: string;
  uploadId?: string;
  partSize?: number;
  partCount?: number;
  /** Part numbers the server has confirmed. */
  confirmedParts: number[];
  fileUrl?: string;
  error?: string;
  /** False when the bytes couldn't be persisted (quota): lost on reload. */
  persisted: boolean;
  createdAt: number;
  updatedAt: number;
  schema: number;
}

interface FileRecord {
  id: string;
  scope: Scope;
  blob: Blob;
}

interface MetaRecord {
  key: string;
  value: unknown;
}

interface OfflineDB extends DBSchema {
  drafts: { key: string; value: DraftRecord; indexes: { scope: string } };
  mutations: {
    key: string;
    value: MutationRecord;
    indexes: { scope: string };
  };
  uploads: { key: string; value: UploadRecord; indexes: { scope: string } };
  files: { key: string; value: FileRecord; indexes: { scope: string } };
  meta: { key: string; value: MetaRecord };
}

type StoreName = "drafts" | "mutations" | "uploads" | "files";
type ValueOf<S extends StoreName> = OfflineDB[S]["value"];

/** The operations the rest of the offline layer needs. */
export interface OfflineStore {
  readonly durable: boolean;
  get<S extends StoreName>(
    store: S,
    id: string,
  ): Promise<ValueOf<S> | undefined>;
  put<S extends StoreName>(store: S, value: ValueOf<S>): Promise<void>;
  delete(store: StoreName, id: string): Promise<void>;
  list<S extends StoreName>(store: S, scope: Scope): Promise<ValueOf<S>[]>;
  /** Every scope with records in `store` (to find work from other accounts). */
  scopes(store: StoreName): Promise<Scope[]>;
  clearScope(scope: Scope): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
  deleteMeta(key: string): Promise<void>;
}

const STORES: StoreName[] = ["drafts", "mutations", "uploads", "files"];

/** IndexedDB-backed store. */
class IdbStore implements OfflineStore {
  readonly durable = true;
  private db: IDBPDatabase<OfflineDB>;
  constructor(db: IDBPDatabase<OfflineDB>) {
    this.db = db;
  }
  get<S extends StoreName>(store: S, id: string) {
    return this.db.get(store, id) as Promise<ValueOf<S> | undefined>;
  }
  async put<S extends StoreName>(store: S, value: ValueOf<S>) {
    await this.db.put(store, value as never);
  }
  async delete(store: StoreName, id: string) {
    await this.db.delete(store, id);
  }
  list<S extends StoreName>(store: S, scope: Scope) {
    return this.db.getAllFromIndex(
      store as "drafts",
      "scope",
      scope,
    ) as Promise<ValueOf<S>[]>;
  }
  async scopes(store: StoreName) {
    const all = (await this.db.getAll(store)) as { scope: Scope }[];
    return [...new Set(all.map((r) => r.scope))];
  }
  async getMeta<T>(key: string) {
    return (await this.db.get("meta", key))?.value as T | undefined;
  }
  async setMeta(key: string, value: unknown) {
    await this.db.put("meta", { key, value });
  }
  async deleteMeta(key: string) {
    await this.db.delete("meta", key);
  }
  async clearScope(scope: Scope) {
    for (const s of STORES) {
      const tx = this.db.transaction(s, "readwrite");
      const ids = await tx.store.index("scope").getAllKeys(scope);
      await Promise.all(ids.map((id) => tx.store.delete(id)));
      await tx.done;
    }
  }
}

/** In-memory store: tests, and browsers without IndexedDB (not durable). */
export class MemoryStore implements OfflineStore {
  readonly durable: boolean = false;
  private data = new Map<StoreName, Map<string, { scope: Scope }>>(
    STORES.map((s) => [s, new Map()]),
  );
  // Records are copied so callers can't mutate stored state; file bytes are
  // kept by reference (Blobs are immutable, and IndexedDB stores them as-is).
  private copy<T>(store: StoreName, v: T): T {
    return store === "files" ? { ...v } : structuredClone(v);
  }
  async get<S extends StoreName>(store: S, id: string) {
    const v = this.data.get(store)!.get(id);
    return v ? (this.copy(store, v) as ValueOf<S>) : undefined;
  }
  async put<S extends StoreName>(store: S, value: ValueOf<S>) {
    this.data
      .get(store)!
      .set((value as { id: string }).id, this.copy(store, value));
  }
  async delete(store: StoreName, id: string) {
    this.data.get(store)!.delete(id);
  }
  async list<S extends StoreName>(store: S, scope: Scope) {
    return [...this.data.get(store)!.values()]
      .filter((v) => v.scope === scope)
      .map((v) => this.copy(store, v) as ValueOf<S>);
  }
  async scopes(store: StoreName) {
    return [
      ...new Set([...this.data.get(store)!.values()].map((v) => v.scope)),
    ];
  }
  private meta = new Map<string, unknown>();
  async getMeta<T>(key: string) {
    return structuredClone(this.meta.get(key)) as T | undefined;
  }
  async setMeta(key: string, value: unknown) {
    this.meta.set(key, structuredClone(value));
  }
  async deleteMeta(key: string) {
    this.meta.delete(key);
  }
  async clearScope(scope: Scope) {
    for (const m of this.data.values())
      for (const [k, v] of m) if (v.scope === scope) m.delete(k);
  }
}

let current: Promise<OfflineStore> | null = null;

/** The shared store: IndexedDB when available, memory otherwise. */
export function getStore(): Promise<OfflineStore> {
  if (!current) current = open();
  return current;
}

/** Replace the store (tests). */
export function setStore(store: OfflineStore) {
  current = Promise.resolve(store);
}

async function open(): Promise<OfflineStore> {
  if (typeof indexedDB === "undefined") {
    diag("storage.unavailable", { reason: "no-indexeddb" });
    return new MemoryStore();
  }
  try {
    const db = await openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          for (const s of STORES)
            db.createObjectStore(s, { keyPath: "id" }).createIndex(
              "scope",
              "scope",
            );
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
      blocking() {
        // A newer tab wants to upgrade the schema: step aside.
        db.close();
        current = null;
      },
    });
    return new IdbStore(db);
  } catch (err) {
    // Private browsing in some browsers, or storage disabled.
    diag("storage.unavailable", { reason: (err as Error)?.name });
    return new MemoryStore();
  }
}

/** True for the browser's "out of space" errors. */
export function isQuotaError(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

/**
 * Ask the browser to keep our storage when space runs low. Returns whether
 * storage is persistent; false means it may be evicted under pressure.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
