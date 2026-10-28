import { apiClient } from "@next/lib/api";
import { diag } from "./diag";
import { listMutations, updateMutation } from "./queue";
import { getConnectivity, getScope, markReachable, notify } from "./state";
import { getStore, type MutationRecord } from "./store";
import { runUpload } from "./uploads";

// The synchronisation coordinator. It replays the signed-in scope's queued
// operations one at a time, oldest first, through the app's own API client —
// so the in-memory access token, refresh and CSRF handling are exactly the
// online path's, and no credential is ever stored with a queued operation.
//
// It runs when the app starts, when the tab becomes visible, when the
// connection comes back, when Background Sync wakes the app, and when the
// person presses Retry. Each run stops at the first sign that continuing is
// unsafe (offline, session expired).

export interface TransportRequest {
  method: MutationRecord["method"];
  url: string;
  data: unknown;
  headers: Record<string, string>;
}
export type Transport = (r: TransportRequest) => Promise<{ data: unknown }>;

let transport: Transport = (r) => apiClient.request(r);

/** Replace the transport (tests). */
export function setTransport(t: Transport) {
  transport = t;
}

export const MAX_AUTO_ATTEMPTS = 8;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;

/** Exponential backoff with ±50% jitter. */
export function backoff(attempt: number, random = Math.random) {
  const base = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.round(base * (0.5 + random()));
}

export type Failure =
  | { kind: "network" }
  | { kind: "retry"; afterMs?: number }
  | { kind: "auth" }
  | { kind: "conflict"; serverCopy?: unknown }
  | { kind: "attention"; code: string; message: string };

/** Decide what a failed request means for its queued operation. */
export function classify(err: any): Failure {
  const res = err?.response;
  if (!res) return { kind: "network" };
  const status: number = res.status;
  const body = res.data ?? {};
  const retryAfter = Number(res.headers?.["retry-after"]);
  const afterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined;
  if (status === 401) return { kind: "auth" };
  if (status === 409 && body.code === "IDEMPOTENCY_IN_PROGRESS")
    return { kind: "retry", afterMs: afterMs ?? 3000 };
  if (status === 409 && body.code === "VERSION_CONFLICT")
    return { kind: "conflict", serverCopy: body.data };
  if (status === 429) return { kind: "retry", afterMs };
  if (status === 408 || status >= 500) return { kind: "retry", afterMs };
  if (status === 402)
    return {
      kind: "attention",
      code: "subscription",
      message: "Your organisation’s subscription needs attention.",
    };
  if (status === 403)
    return {
      kind: "attention",
      code: "forbidden",
      message: body.message || "You don’t have permission to do this.",
    };
  return {
    kind: "attention",
    code: status === 400 || status === 422 ? "invalid" : `http-${status}`,
    message: body.message || "The server couldn’t accept this change.",
  };
}

let running: Promise<SyncResult> | null = null;
export interface SyncResult {
  synced: number;
  remaining: number;
  stoppedBy?: "offline" | "auth" | "no-session";
}

/** Run one pass over the queue. Concurrent calls share the same pass. */
export function syncNow(): Promise<SyncResult> {
  if (!running)
    running = pass().finally(() => {
      running = null;
    });
  return running;
}

async function pass(): Promise<SyncResult> {
  const scope = getScope();
  if (!scope) return { synced: 0, remaining: 0, stoppedBy: "no-session" };
  if (getConnectivity() === "offline")
    return { synced: 0, remaining: 0, stoppedBy: "offline" };

  const ops = await listMutations(scope);
  const syncedIds = new Set(
    ops.filter((o) => o.status === "synced").map((o) => o.id),
  );
  let synced = 0;
  let stoppedBy: SyncResult["stoppedBy"];

  for (const op of ops) {
    if (!["queued", "retrying"].includes(op.status)) continue;
    if (op.nextAttemptAt > Date.now()) continue;
    // Ownership is re-checked per operation: the session may have changed
    // while an earlier request was in flight.
    if (op.scope !== getScope()) {
      stoppedBy = "no-session";
      break;
    }
    if (op.dependsOn?.some((d) => !syncedIds.has(d))) continue;

    const outcome = await deliver(op);
    if (outcome === "synced") {
      synced++;
      syncedIds.add(op.id);
    } else if (outcome === "stop-offline") {
      stoppedBy = "offline";
      break;
    } else if (outcome === "stop-auth") {
      stoppedBy = "auth";
      break;
    }
  }

  const remaining = (await listMutations(scope)).filter(
    (o) => o.status !== "synced",
  ).length;
  if (synced || stoppedBy) diag("sync.pass", { synced, remaining, stoppedBy });
  return { synced, remaining, stoppedBy };
}

type Outcome = "synced" | "failed" | "stop-offline" | "stop-auth";

async function deliver(op: MutationRecord): Promise<Outcome> {
  await updateMutation(op.id, { status: "syncing" });

  // Files first: the operation is sent with the URLs of uploads the server
  // has confirmed, never with a file that's still on its way.
  const body = { ...op.body };
  for (const u of op.uploads ?? []) {
    const result = await runUpload(u.uploadId);
    if (result.status !== "completed" || !result.fileUrl) {
      const offline = result.status === "interrupted";
      await updateMutation(op.id, {
        status: offline ? "queued" : "attention",
        lastError: offline
          ? undefined
          : {
              code: "upload",
              message:
                result.error || "An attached file needs attention first.",
            },
      });
      return offline ? "stop-offline" : "failed";
    }
    body[u.field] = result.fileUrl;
  }

  const headers: Record<string, string> = {
    "Idempotency-Key": op.idempotencyKey,
  };
  if (op.ifMatch) headers["If-Match"] = op.ifMatch;

  try {
    await transport({
      method: op.method,
      url: op.url,
      data: body,
      headers,
    });
    markReachable(true);
    await updateMutation(op.id, {
      status: "synced",
      syncedAt: Date.now(),
      lastError: undefined,
      // Keep only what the person needs to see; not the server payload.
      serverCopy: undefined,
    });
    diag("sync.delivered", { kind: op.kind, attempts: op.attempts + 1 });
    return "synced";
  } catch (err) {
    const f = classify(err);
    const attempts = op.attempts + 1;
    if (f.kind === "network") {
      markReachable(false);
      await updateMutation(op.id, { status: "queued", attempts });
      return "stop-offline";
    }
    if (f.kind === "auth") {
      // The session ended: pause everything until the person signs in again.
      await updateMutation(op.id, {
        status: "auth",
        lastError: {
          code: "auth",
          message: "Sign in again to send this change.",
        },
      });
      diag("sync.paused-auth", { kind: op.kind });
      return "stop-auth";
    }
    if (f.kind === "conflict") {
      await updateMutation(op.id, {
        status: "conflict",
        serverCopy: f.serverCopy,
        lastError: {
          code: "conflict",
          message: "Someone else changed this since you started editing.",
        },
      });
      diag("sync.conflict", { kind: op.kind });
      return "failed";
    }
    if (f.kind === "retry") {
      if (attempts >= MAX_AUTO_ATTEMPTS) {
        await updateMutation(op.id, {
          status: "attention",
          attempts,
          lastError: {
            code: "gave-up",
            message: "The server kept failing. Try again later.",
          },
        });
        diag("sync.gave-up", { kind: op.kind, attempts });
        return "failed";
      }
      await updateMutation(op.id, {
        status: "retrying",
        attempts,
        nextAttemptAt: Date.now() + (f.afterMs ?? backoff(attempts)),
        lastError: { code: "retry", message: "Server busy; will retry." },
      });
      return "failed";
    }
    await updateMutation(op.id, {
      status: "attention",
      attempts,
      lastError: { code: f.code, message: f.message },
    });
    diag("sync.rejected", { kind: op.kind, code: f.code });
    return "failed";
  }
}

/**
 * After the person signs in again: operations paused for authentication go
 * back in line (the server re-checks their permission when they're sent).
 */
export async function resumeAfterSignIn() {
  for (const op of await listMutations())
    if (op.status === "auth")
      await updateMutation(op.id, {
        status: "queued",
        lastError: undefined,
        nextAttemptAt: Date.now(),
      });
}

/** Earliest time a retrying operation wants another attempt, if any. */
export async function nextRetryAt(): Promise<number | null> {
  const due = (await listMutations())
    .filter((o) => o.status === "retrying" || o.status === "queued")
    .map((o) => o.nextAttemptAt);
  return due.length ? Math.min(...due) : null;
}

/** Remove the operation's local file copies once nothing needs them. */
export async function cleanupUploads() {
  const scope = getScope();
  if (!scope) return;
  const store = await getStore();
  const ops = await listMutations(scope);
  const needed = new Set(
    ops
      .filter((o) => o.status !== "synced")
      .flatMap((o) => (o.uploads ?? []).map((u) => u.uploadId)),
  );
  for (const u of await store.list("uploads", scope))
    if (u.status === "completed" && !needed.has(u.id)) {
      await store.delete("files", u.id);
    }
  notify();
}
