import { diag } from "./diag";
import { getScope, notify } from "./state";
import {
  getStore,
  isQuotaError,
  SCHEMA,
  type MutationRecord,
  type Scope,
} from "./store";

// The persistent queue of operations waiting for the server. IndexedDB is
// the source of truth: an operation is only removed after the server has
// acknowledged it (status "synced"), and is never silently dropped.

export type NewMutation = Pick<
  MutationRecord,
  "kind" | "label" | "method" | "url" | "body"
> &
  Partial<Pick<MutationRecord, "ifMatch" | "uploads" | "dependsOn">>;

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export class OfflineError extends Error {
  readonly code: "no-session" | "storage-full" | "storage-failed";
  constructor(message: string, code: OfflineError["code"]) {
    super(message);
    this.code = code;
  }
}

/** Build a mutation record (not yet stored). */
export function createMutation(
  m: NewMutation,
  scope: Scope,
  idempotencyKey = uid(),
): MutationRecord {
  const now = Date.now();
  return {
    id: uid(),
    scope,
    status: "queued",
    attempts: 0,
    nextAttemptAt: now,
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
    schema: SCHEMA,
    ...m,
  };
}

/** Persist a mutation for later delivery. Throws OfflineError on failure. */
export async function enqueue(record: MutationRecord): Promise<MutationRecord> {
  if (!record.scope || record.scope !== getScope())
    throw new OfflineError("Sign in to save this change.", "no-session");
  const store = await getStore();
  try {
    await store.put("mutations", record);
  } catch (err) {
    diag("queue.persist-failed", { quota: isQuotaError(err) });
    throw new OfflineError(
      isQuotaError(err)
        ? "This device is out of storage, so the change couldn’t be saved. Free up space and try again."
        : "The change couldn’t be saved on this device.",
      isQuotaError(err) ? "storage-full" : "storage-failed",
    );
  }
  diag("queue.enqueued", { kind: record.kind });
  notify();
  return record;
}

export async function updateMutation(
  id: string,
  patch: Partial<MutationRecord>,
): Promise<MutationRecord | undefined> {
  const store = await getStore();
  const cur = await store.get("mutations", id);
  if (!cur) return undefined;
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  await store.put("mutations", next);
  notify();
  return next;
}

/** The signed-in scope's operations, oldest first. */
export async function listMutations(
  scope = getScope(),
): Promise<MutationRecord[]> {
  if (!scope) return [];
  const store = await getStore();
  const all = await store.list("mutations", scope);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/** Remove an operation the person chose to discard. */
export async function discardMutation(id: string) {
  const store = await getStore();
  const cur = await store.get("mutations", id);
  if (!cur || cur.scope !== getScope()) return;
  await store.delete("mutations", id);
  diag("queue.discarded", { kind: cur.kind });
  notify();
}

/** Put an operation that needs attention back in line. */
export async function retryMutation(id: string) {
  await updateMutation(id, {
    status: "queued",
    attempts: 0,
    nextAttemptAt: Date.now(),
    lastError: undefined,
  });
}

/** Clear acknowledged operations older than `keepMs`. */
export async function pruneSynced(keepMs = 24 * 60 * 60 * 1000) {
  const scope = getScope();
  if (!scope) return;
  const store = await getStore();
  const cutoff = Date.now() - keepMs;
  for (const m of await store.list("mutations", scope))
    if (m.status === "synced" && (m.syncedAt ?? 0) < cutoff)
      await store.delete("mutations", m.id);
}

/**
 * Operations saved under a different account or organisation on this
 * device. They are never sent from this session; the person is told they
 * exist and can sign in as that account to send them.
 */
export async function otherScopesWithPendingWork(): Promise<number> {
  const scope = getScope();
  const store = await getStore();
  let count = 0;
  for (const s of await store.scopes("mutations")) {
    if (s === scope) continue;
    const ops = await store.list("mutations", s);
    count += ops.filter((m) => m.status !== "synced").length;
  }
  return count;
}
