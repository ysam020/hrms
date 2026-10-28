import { beforeEach, describe, expect, it, vi } from "vitest";

// The offline queue and sync coordinator, against an in-memory store and a
// fake transport. Covers ordering, failure classification, retry limits,
// session/tenant isolation and idempotency keys.

vi.mock("@next/lib/api", () => ({
  apiClient: { request: vi.fn(), post: vi.fn(), get: vi.fn() },
}));

import {
  MemoryStore,
  setStore,
  type MutationRecord,
} from "@next/offline/store";
import {
  createMutation,
  discardMutation,
  enqueue,
  listMutations,
  otherScopesWithPendingWork,
  retryMutation,
} from "@next/offline/queue";
import {
  backoff,
  classify,
  MAX_AUTO_ATTEMPTS,
  resumeAfterSignIn,
  setTransport,
  syncNow,
  type TransportRequest,
} from "@next/offline/sync";
import { markReachable, setBrowserOnline, setScope } from "@next/offline/state";

const A = "tenantA:user1";
const B = "tenantB:user1";
const leave = (from: string) => ({
  kind: "leave.create",
  label: `Leave from ${from}`,
  method: "POST" as const,
  url: "/add-leave",
  body: { from, to: from, reason: "Family function" },
});

const httpError = (status: number, data: unknown = {}, headers = {}) =>
  Object.assign(new Error(`HTTP ${status}`), {
    response: { status, data, headers },
  });
const networkError = () => new Error("Network Error");

let sent: TransportRequest[];
let respond: (r: TransportRequest) => Promise<{ data: unknown }>;

beforeEach(() => {
  setStore(new MemoryStore());
  setScope(A);
  setBrowserOnline(true);
  markReachable(true);
  sent = [];
  respond = async () => ({ data: { success: true } });
  setTransport(async (r) => {
    sent.push(r);
    return respond(r);
  });
});

async function queue(n = 1, scope = A) {
  const ops: MutationRecord[] = [];
  for (let i = 0; i < n; i++) {
    const m = createMutation(leave(`2026-11-0${i + 1}`), scope);
    m.createdAt += i; // deterministic order
    ops.push(await enqueue(m));
  }
  return ops;
}

describe("offline queue", () => {
  it("persists operations and sends them in order with their keys", async () => {
    const [a, b] = await queue(2);
    const res = await syncNow();
    expect(res.synced).toBe(2);
    expect(sent.map((s) => s.data)).toEqual([a.body, b.body]);
    expect(sent[0].headers["Idempotency-Key"]).toBe(a.idempotencyKey);
    expect(sent[1].headers["Idempotency-Key"]).toBe(b.idempotencyKey);
    const ops = await listMutations();
    expect(ops.every((o) => o.status === "synced")).toBe(true);
  });

  it("keeps the same idempotency key across retries", async () => {
    const [op] = await queue();
    respond = async () => {
      throw httpError(503);
    };
    await syncNow();
    respond = async () => ({ data: {} });
    await retryMutation(op.id);
    await syncNow();
    expect(sent).toHaveLength(2);
    expect(sent[0].headers["Idempotency-Key"]).toBe(
      sent[1].headers["Idempotency-Key"],
    );
  });

  it("stops at a network failure and leaves the rest queued", async () => {
    await queue(3);
    respond = async () => {
      throw networkError();
    };
    const res = await syncNow();
    expect(res.stoppedBy).toBe("offline");
    expect(sent).toHaveLength(1);
    const ops = await listMutations();
    expect(ops.map((o) => o.status)).toEqual(["queued", "queued", "queued"]);
  });

  it("does nothing while the browser is offline", async () => {
    await queue();
    setBrowserOnline(false);
    const res = await syncNow();
    expect(res.stoppedBy).toBe("offline");
    expect(sent).toHaveLength(0);
  });

  it("schedules transient failures with backoff, then gives up", async () => {
    const [op] = await queue();
    respond = async () => {
      throw httpError(500);
    };
    await syncNow();
    let cur = (await listMutations())[0];
    expect(cur.status).toBe("retrying");
    expect(cur.nextAttemptAt).toBeGreaterThan(Date.now());
    // Not due yet: not resent.
    await syncNow();
    expect(sent).toHaveLength(1);
    // Exhaust the automatic attempts.
    for (let i = 1; i < MAX_AUTO_ATTEMPTS; i++) {
      const { updateMutation } = await import("@next/offline/queue");
      await updateMutation(op.id, { nextAttemptAt: 0 });
      await syncNow();
    }
    cur = (await listMutations())[0];
    expect(cur.status).toBe("attention");
    expect(cur.lastError?.code).toBe("gave-up");
    expect(sent).toHaveLength(MAX_AUTO_ATTEMPTS);
  });

  it("honours Retry-After on 429", async () => {
    await queue();
    respond = async () => {
      throw httpError(429, {}, { "retry-after": "30" });
    };
    const before = Date.now();
    await syncNow();
    const op = (await listMutations())[0];
    expect(op.nextAttemptAt - before).toBeGreaterThanOrEqual(30_000);
  });

  it("marks validation errors for attention without retrying", async () => {
    await queue(2);
    respond = async (r) => {
      if ((r.data as any).from === "2026-11-01")
        throw httpError(400, { message: "Leave overlaps an existing request" });
      return { data: {} };
    };
    await syncNow();
    const [first, second] = await listMutations();
    expect(first.status).toBe("attention");
    expect(first.lastError?.message).toBe("Leave overlaps an existing request");
    // An independent later operation still goes through.
    expect(second.status).toBe("synced");
  });

  it("pauses everything on an expired session and resumes after sign-in", async () => {
    await queue(2);
    respond = async () => {
      throw httpError(401);
    };
    const res = await syncNow();
    expect(res.stoppedBy).toBe("auth");
    expect(sent).toHaveLength(1);
    let ops = await listMutations();
    expect(ops.map((o) => o.status)).toEqual(["auth", "queued"]);
    respond = async () => ({ data: {} });
    await resumeAfterSignIn();
    await syncNow();
    ops = await listMutations();
    expect(ops.every((o) => o.status === "synced")).toBe(true);
  });

  it("never sends another account's or organisation's operations", async () => {
    await queue(1, A);
    setScope(B);
    await queue(1, B);
    await syncNow();
    expect(sent).toHaveLength(1);
    expect(await otherScopesWithPendingWork()).toBe(1);
    // A's work is untouched and invisible to B.
    expect((await listMutations()).every((o) => o.scope === B)).toBe(true);
    setScope(A);
    expect((await listMutations())[0].status).toBe("queued");
  });

  it("refuses to queue work for a scope that isn't signed in", async () => {
    await expect(
      enqueue(createMutation(leave("2026-11-01"), B)),
    ).rejects.toThrow(/Sign in/);
    setScope(null);
    await expect(
      enqueue(createMutation(leave("2026-11-01"), A)),
    ).rejects.toThrow();
  });

  it("waits for dependencies", async () => {
    const [a] = await queue();
    const b = await enqueue({
      ...createMutation(leave("2026-11-09"), A),
      dependsOn: [a.id],
      createdAt: a.createdAt - 10, // even if older
    });
    respond = async (r) => {
      if ((r.data as any).from === "2026-11-01") throw httpError(503);
      return { data: {} };
    };
    await syncNow();
    const ops = await listMutations();
    expect(ops.find((o) => o.id === b.id)?.status).toBe("queued");
  });

  it("records conflicts with the server's copy", async () => {
    await enqueue({
      ...createMutation(
        {
          kind: "announcement.edit",
          label: "Edit “Town hall”",
          method: "PUT",
          url: "/edit-hr-activity/a1",
          body: { title: "Moved" },
          ifMatch: "2026-10-01T00:00:00.000Z",
        },
        A,
      ),
    });
    respond = async () => {
      throw httpError(409, {
        code: "VERSION_CONFLICT",
        data: { title: "Town hall (rescheduled)" },
      });
    };
    await syncNow();
    expect(sent[0].headers["If-Match"]).toBe("2026-10-01T00:00:00.000Z");
    const op = (await listMutations())[0];
    expect(op.status).toBe("conflict");
    expect(op.serverCopy).toEqual({ title: "Town hall (rescheduled)" });
    // The local edit is preserved.
    expect(op.body).toEqual({ title: "Moved" });
  });

  it("lets the person discard an operation, but only their own", async () => {
    const [op] = await queue();
    setScope(B);
    await discardMutation(op.id);
    setScope(A);
    expect(await listMutations()).toHaveLength(1);
    await discardMutation(op.id);
    expect(await listMutations()).toHaveLength(0);
  });
});

describe("classification", () => {
  it("maps responses to the right outcome", () => {
    expect(classify(networkError()).kind).toBe("network");
    expect(classify(httpError(401)).kind).toBe("auth");
    expect(classify(httpError(403)).kind).toBe("attention");
    expect(classify(httpError(422)).kind).toBe("attention");
    expect(classify(httpError(500)).kind).toBe("retry");
    expect(classify(httpError(408)).kind).toBe("retry");
    expect(
      classify(httpError(409, { code: "IDEMPOTENCY_IN_PROGRESS" })).kind,
    ).toBe("retry");
    expect(classify(httpError(409, { code: "VERSION_CONFLICT" })).kind).toBe(
      "conflict",
    );
    expect(classify(httpError(409, { message: "Overlaps" })).kind).toBe(
      "attention",
    );
  });

  it("backs off exponentially with jitter and a ceiling", () => {
    expect(backoff(0, () => 0.5)).toBe(2000);
    expect(backoff(3, () => 0.5)).toBe(16000);
    expect(backoff(20, () => 0.5)).toBe(300000);
    expect(backoff(2, () => 0)).toBe(4000);
    expect(backoff(2, () => 0.999)).toBeLessThan(12000);
  });
});
