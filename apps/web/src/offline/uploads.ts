import { apiClient } from "@next/lib/api";
import { diag } from "./diag";
import {
  getConnectivity,
  getScope,
  markReachable,
  notify,
  setBusy,
} from "./state";
import { getStore, isQuotaError, SCHEMA, type UploadRecord } from "./store";

// Resumable file uploads over the gateway's S3 multipart endpoints
// (apps/api-gateway/src/handlers/resumableUpload.ts).
//
// The selected file's bytes are kept in IndexedDB until the server confirms
// the upload, so an upload survives a reload or a lost connection. Progress
// is never assumed: every run starts by asking the server which parts it
// holds, sends only the rest, and asks the server to verify and assemble the
// file. Only then is the upload "completed" and its URL used.
//
// Parts are S3's minimum of 5 MB, so a resume re-sends at most the part that
// was in flight. Files are limited to 15 MB, the app's existing limit.

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const PART_ATTEMPTS = 3;

export interface UploadApi {
  post(url: string, data: unknown): Promise<{ data: any }>;
  get(url: string): Promise<{ data: any }>;
  /** PUT one part to a presigned URL. */
  putPart(url: string, body: Blob): Promise<void>;
}

const defaultApi: UploadApi = {
  post: (url, data) => apiClient.post(url, data),
  get: (url) => apiClient.get(url),
  async putPart(url, body) {
    // Straight to S3 with the presigned URL: no cookies, no app headers.
    const res = await fetch(url, { method: "PUT", body, credentials: "omit" });
    if (!res.ok) {
      const err = new Error(`Part upload failed (${res.status})`) as Error & {
        response?: { status: number };
      };
      err.response = { status: res.status };
      throw err;
    }
  },
};
let api: UploadApi = defaultApi;

/** Replace the network layer (tests). */
export function setUploadApi(next: UploadApi) {
  api = next;
}

// Bytes that couldn't be persisted (storage full) live here until reload.
const memoryFiles = new Map<string, Blob>();

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export interface UploadTarget {
  folder: string;
  username: string;
  field: string;
}

/** Record a selected file for upload. Nothing is sent yet. */
export async function createUpload(
  file: File,
  target: UploadTarget,
): Promise<UploadRecord> {
  const scope = getScope();
  if (!scope) throw new Error("Sign in to attach files.");
  if (file.size === 0) throw new Error("This file is empty.");
  if (file.size > MAX_UPLOAD_BYTES)
    throw new Error(`“${file.name}” is larger than 15 MB.`);
  const store = await getStore();
  const now = Date.now();
  const rec: UploadRecord = {
    id: uid(),
    scope,
    status: "selected",
    fileName: file.name,
    fileType: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified,
    ...target,
    confirmedParts: [],
    persisted: store.durable,
    createdAt: now,
    updatedAt: now,
    schema: SCHEMA,
  };
  try {
    await store.put("files", { id: rec.id, scope, blob: file });
  } catch (err) {
    // Out of space: keep the upload usable for this session and say so.
    diag("upload.persist-failed", { quota: isQuotaError(err) });
    memoryFiles.set(rec.id, file);
    rec.persisted = false;
  }
  if (!store.durable) memoryFiles.set(rec.id, file);
  await store.put("uploads", rec);
  notify();
  return rec;
}

export async function getUpload(id: string) {
  const rec = await (await getStore()).get("uploads", id);
  return rec && rec.scope === getScope() ? rec : undefined;
}

async function save(rec: UploadRecord, patch: Partial<UploadRecord>) {
  Object.assign(rec, patch, { updatedAt: Date.now() });
  await (await getStore()).put("uploads", rec);
  notify();
  return rec;
}

async function bytesOf(rec: UploadRecord): Promise<Blob | null> {
  const mem = memoryFiles.get(rec.id);
  if (mem) return mem;
  const stored = await (await getStore()).get("files", rec.id);
  return stored?.blob ?? null;
}

/**
 * Give the upload its file again (after the stored copy was lost). The file
 * must match what was originally chosen.
 */
export async function reattachFile(id: string, file: File) {
  const rec = await getUpload(id);
  if (!rec) throw new Error("This upload no longer exists.");
  if (
    file.name !== rec.fileName ||
    file.size !== rec.size ||
    file.lastModified !== rec.lastModified
  )
    throw new Error(
      `Choose the same file you picked before (“${rec.fileName}”).`,
    );
  try {
    await (await getStore()).put("files", { id, scope: rec.scope, blob: file });
  } catch {
    memoryFiles.set(id, file);
  }
  await save(rec, { status: "selected", error: undefined });
}

const running = new Map<string, Promise<UploadRecord>>();

/** Upload (or resume) one file. Concurrent calls share the same run. */
export function runUpload(id: string): Promise<UploadRecord> {
  let p = running.get(id);
  if (!p) {
    setBusy(`upload:${id}`, true);
    p = run(id).finally(() => {
      running.delete(id);
      setBusy(`upload:${id}`, false);
    });
    running.set(id, p);
  }
  return p;
}

async function run(id: string, verifyRound = 0): Promise<UploadRecord> {
  const rec = await getUpload(id);
  if (!rec) throw new Error("This upload no longer exists.");
  if (rec.status === "completed") return rec;

  const blob = await bytesOf(rec);
  if (!blob)
    return save(rec, {
      status: "needs-file",
      error: `Choose “${rec.fileName}” again to finish uploading it.`,
    });
  if (getConnectivity() === "offline") return save(rec, { status: "waiting" });

  try {
    // 1. A server session (a fresh one if the old one expired).
    let parts: number[] | null = null;
    if (rec.uploadId) {
      parts = await confirmed(rec).catch((err) => {
        if (err?.response?.status === 404) return null;
        throw err;
      });
      if (parts === null) {
        diag("upload.session-expired");
        await save(rec, { uploadId: undefined, confirmedParts: [] });
      } else if (parts.length) {
        diag("upload.resume", { confirmed: parts.length });
      }
    }
    if (!rec.uploadId) {
      const res = await api.post("/upload/multipart/start", {
        fileName: rec.fileName,
        fileType: rec.fileType,
        size: rec.size,
        folder: rec.folder,
        username: rec.username,
        formikField: rec.field,
      });
      const d = res.data?.data ?? {};
      await save(rec, {
        uploadId: d.uploadId,
        partSize: d.partSize,
        partCount: d.partCount,
        confirmedParts: [],
      });
      parts = [];
    }
    await save(rec, { status: "uploading", confirmedParts: parts ?? [] });

    // 2. The parts the server doesn't have yet.
    const partSize = rec.partSize!;
    for (let n = 1; n <= rec.partCount!; n++) {
      if (rec.confirmedParts.includes(n)) continue;
      const chunk = blob.slice((n - 1) * partSize, n * partSize);
      await sendPart(rec, n, chunk);
      await save(rec, { confirmedParts: [...rec.confirmedParts, n] });
    }

    // 3. The server checks every part and assembles the file.
    await save(rec, { status: "verifying" });
    const done = await api
      .post("/upload/multipart/complete", { uploadId: rec.uploadId })
      .catch(async (err) => {
        if (err?.response?.status !== 409) throw err;
        // Something went missing: resync with the server and try again.
        await save(rec, { confirmedParts: await confirmed(rec) });
        return null;
      });
    if (!done) {
      if (verifyRound >= 2)
        return save(rec, {
          status: "failed",
          error:
            "The server couldn’t verify this file. Try uploading it again.",
        });
      return run(id, verifyRound + 1);
    }
    markReachable(true);
    const url = done.data?.data?.fileUrl;
    await (await getStore()).delete("files", rec.id);
    memoryFiles.delete(rec.id);
    diag("upload.completed", { parts: rec.partCount });
    return save(rec, { status: "completed", fileUrl: url, error: undefined });
  } catch (err: any) {
    if (!err?.response) {
      markReachable(false);
      diag("upload.interrupted");
      return save(rec, { status: "interrupted" });
    }
    const status = err.response.status;
    const message =
      err.response.data?.message ||
      (status === 401
        ? "Sign in again to finish this upload."
        : "The file couldn’t be uploaded.");
    diag("upload.failed", { status });
    return save(rec, { status: "failed", error: message });
  }
}

async function confirmed(rec: UploadRecord): Promise<number[]> {
  const res = await api.get(
    `/upload/multipart/${encodeURIComponent(rec.uploadId!)}/parts`,
  );
  const parts: { partNumber: number }[] = res.data?.data?.parts ?? [];
  return parts.map((p) => p.partNumber);
}

async function sendPart(rec: UploadRecord, n: number, chunk: Blob) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < PART_ATTEMPTS; attempt++) {
    try {
      // Presigned URLs expire, so get a fresh one for every attempt.
      const res = await api.post("/upload/multipart/part-url", {
        uploadId: rec.uploadId,
        partNumber: n,
      });
      await api.putPart(res.data?.data?.url, chunk);
      return;
    } catch (err: any) {
      lastErr = err;
      // Offline or a client error: retrying this part now won't help.
      if (!err?.response || err.response.status < 500) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

/** Forget an upload and its stored bytes (and the server session). */
export async function discardUpload(id: string) {
  const rec = await getUpload(id);
  if (!rec) return;
  if (rec.uploadId && rec.status !== "completed")
    await api
      .post("/upload/multipart/abort", { uploadId: rec.uploadId })
      .catch(() => {});
  const store = await getStore();
  await store.delete("files", id);
  await store.delete("uploads", id);
  memoryFiles.delete(id);
  notify();
}
