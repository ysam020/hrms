import { beforeEach, describe, expect, it, vi } from "vitest";

// Resumable uploads against a fake multipart server: interruption, resume
// from server-confirmed parts, expired sessions, lost bytes and re-selection.

vi.mock("@next/lib/api", () => ({
  apiClient: { request: vi.fn(), post: vi.fn(), get: vi.fn() },
}));

import { MemoryStore, setStore } from "@next/offline/store";
import {
  createUpload,
  getUpload,
  reattachFile,
  runUpload,
  setUploadApi,
} from "@next/offline/uploads";
import { markReachable, setBrowserOnline, setScope } from "@next/offline/state";

const MB = 1024 * 1024;
const PART = 5 * MB;

/** A minimal S3-multipart-like server. */
function fakeServer() {
  const server = {
    sessions: new Map<string, { size: number; parts: Map<number, number> }>(),
    puts: [] as number[],
    failPartOnce: new Set<number>(),
    offlineAtPart: 0,
    completed: 0,
  };
  let n = 0;
  const http = (status: number) =>
    Object.assign(new Error(String(status)), {
      response: { status, data: {} },
    });
  setUploadApi({
    async post(url, data: any) {
      if (url.endsWith("/start")) {
        const id = `up${++n}`;
        server.sessions.set(id, { size: data.size, parts: new Map() });
        return {
          data: {
            data: {
              uploadId: id,
              partSize: PART,
              partCount: Math.ceil(data.size / PART),
            },
          },
        };
      }
      const s = server.sessions.get(data.uploadId);
      if (!s) throw http(404);
      if (url.endsWith("/part-url"))
        return {
          data: { data: { url: `${data.uploadId}|${data.partNumber}` } },
        };
      if (url.endsWith("/complete")) {
        const total = [...s.parts.values()].reduce((a, b) => a + b, 0);
        if (total !== s.size) throw http(409);
        server.completed++;
        return {
          data: { data: { fileUrl: `https://bucket/${data.uploadId}` } },
        };
      }
      return { data: {} };
    },
    async get(url) {
      const id = decodeURIComponent(url.split("/")[3]);
      const s = server.sessions.get(id);
      if (!s) throw http(404);
      return {
        data: {
          data: {
            parts: [...s.parts.entries()].map(([partNumber, size]) => ({
              partNumber,
              size,
            })),
          },
        },
      };
    },
    async putPart(url, body) {
      const [id, part] = url.split("|");
      const p = Number(part);
      if (server.offlineAtPart === p) throw new Error("Network Error");
      if (server.failPartOnce.delete(p)) throw http(500);
      server.puts.push(p);
      server.sessions.get(id)!.parts.set(p, body.size);
    },
  });
  return server;
}

const file = (size: number, name = "certificate.pdf") =>
  new File([new Uint8Array(size)], name, {
    type: "application/pdf",
    lastModified: 1_700_000_000_000,
  });
const target = {
  folder: "leave",
  username: "asha",
  field: "medicalCertificate",
};

beforeEach(() => {
  setStore(new MemoryStore());
  setScope("t1:u1");
  setBrowserOnline(true);
  markReachable(true);
});

describe("resumable uploads", () => {
  it("uploads every part and completes only after server verification", async () => {
    const server = fakeServer();
    const rec = await createUpload(file(12 * MB), target);
    const done = await runUpload(rec.id);
    expect(done.status).toBe("completed");
    expect(done.fileUrl).toBe("https://bucket/up1");
    expect(server.puts).toEqual([1, 2, 3]);
    expect(server.completed).toBe(1);
  });

  it("resumes from the parts the server confirmed after an interruption", async () => {
    const server = fakeServer();
    const rec = await createUpload(file(12 * MB), target);
    server.offlineAtPart = 2;
    const cut = await runUpload(rec.id);
    expect(cut.status).toBe("interrupted");
    expect(server.puts).toEqual([1]);
    server.offlineAtPart = 0;
    const done = await runUpload(rec.id);
    expect(done.status).toBe("completed");
    // Part 1 was not sent again.
    expect(server.puts).toEqual([1, 2, 3]);
  });

  it("retries a part that failed with a server error", async () => {
    const server = fakeServer();
    server.failPartOnce.add(2);
    const rec = await createUpload(file(12 * MB), target);
    const done = await runUpload(rec.id);
    expect(done.status).toBe("completed");
    expect(server.puts).toEqual([1, 2, 3]);
  });

  it("starts a new session when the old one expired", async () => {
    const server = fakeServer();
    const rec = await createUpload(file(8 * MB), target);
    server.offlineAtPart = 2;
    await runUpload(rec.id);
    server.sessions.clear(); // expired on the server
    server.offlineAtPart = 0;
    const done = await runUpload(rec.id);
    expect(done.status).toBe("completed");
    expect(done.fileUrl).toBe("https://bucket/up2");
  });

  it("waits while offline without sending anything", async () => {
    const server = fakeServer();
    const rec = await createUpload(file(1 * MB), target);
    setBrowserOnline(false);
    const r = await runUpload(rec.id);
    expect(r.status).toBe("waiting");
    expect(server.puts).toEqual([]);
  });

  it("asks for the file again when its stored bytes are gone, and checks it", async () => {
    fakeServer();
    // Behaves like IndexedDB: bytes live only in the store.
    class DurableStore extends MemoryStore {
      readonly durable = true;
    }
    const store = new DurableStore();
    setStore(store);
    const rec = await createUpload(file(1 * MB), target);
    await store.delete("files", rec.id); // e.g. site data cleared
    const r = await runUpload(rec.id);
    expect(r.status).toBe("needs-file");
    await expect(reattachFile(rec.id, file(2 * MB))).rejects.toThrow(
      /same file/,
    );
    await reattachFile(rec.id, file(1 * MB));
    expect((await getUpload(rec.id))?.status).toBe("selected");
    expect((await runUpload(rec.id)).status).toBe("completed");
  });

  it("rejects files over the limit before storing anything", async () => {
    await expect(createUpload(file(16 * MB), target)).rejects.toThrow(/15 MB/);
  });

  it("keeps uploads private to the signed-in scope", async () => {
    fakeServer();
    const rec = await createUpload(file(1 * MB), target);
    setScope("t2:u9");
    expect(await getUpload(rec.id)).toBeUndefined();
    await expect(runUpload(rec.id)).rejects.toThrow();
  });
});
