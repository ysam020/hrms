import { EventEmitter } from "events";

// In-memory stand-in for the ioredis calls the middleware makes.
const store = new Map<string, string>();
const fakeRedis = {
  set: jest.fn(async (k: string, v: string, ...args: unknown[]) => {
    if (args.includes("NX") && store.has(k)) return null;
    store.set(k, v);
    return "OK";
  }),
  get: jest.fn(async (k: string) => store.get(k) ?? null),
  del: jest.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
};
jest.mock("@hrms/cache", () => ({ getRedisClient: () => fakeRedis }));
jest.mock("@hrms/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import { idempotency } from "../../middleware/idempotency";

type Res = EventEmitter & {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
  headersSent: boolean;
  status: (c: number) => Res;
  set: (k: string, v: string) => Res;
  json: (b: unknown) => Res;
};

function makeRes(): Res {
  const res = new EventEmitter() as Res;
  res.statusCode = 200;
  res.headers = {};
  res.headersSent = false;
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.set = (k, v) => {
    res.headers[k] = v;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    res.headersSent = true;
    res.emit("finish");
    return res;
  };
  return res;
}

function makeReq(over: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    "idempotency-key": "key_0123456789abcdef",
    ...((over.headers as Record<string, string>) ?? {}),
  };
  return {
    method: "POST",
    originalUrl: "/api/v1/add-leave",
    body: { from: "2026-11-03", to: "2026-11-05" },
    user: { userId: "u1", tenantId: "t1" },
    get: (h: string) => headers[h.toLowerCase()],
    ...over,
  } as any;
}

/** Run the middleware; if it calls next(), play the handler. */
async function run(
  req: any,
  handler?: (res: Res) => void,
): Promise<{ res: Res; handled: boolean }> {
  const res = makeRes();
  let handled = false;
  await new Promise<void>((resolve) => {
    const origJson = res.json;
    res.json = (b) => {
      const r = origJson(b);
      resolve();
      return r;
    };
    idempotency(req, res as any, () => {
      handled = true;
      if (handler) handler(res);
      else resolve();
    });
  });
  // let fire-and-forget redis writes settle
  await new Promise((r) => setImmediate(r));
  return { res, handled };
}

beforeEach(() => store.clear());

describe("idempotency middleware", () => {
  it("passes through requests without a key", async () => {
    const req = makeReq({ get: () => undefined });
    const { handled } = await run(req);
    expect(handled).toBe(true);
    expect(store.size).toBe(0);
  });

  it("ignores GET even with a key", async () => {
    const { handled } = await run(makeReq({ method: "GET" }));
    expect(handled).toBe(true);
    expect(store.size).toBe(0);
  });

  it("rejects malformed keys", async () => {
    const { res, handled } = await run(
      makeReq({ headers: { "idempotency-key": "short" } }),
    );
    expect(handled).toBe(false);
    expect(res.statusCode).toBe(400);
  });

  it("runs the handler once and replays the stored response", async () => {
    let calls = 0;
    const handler = (res: Res) => {
      calls++;
      res.status(201).json({ success: true, data: { id: "leave1" } });
    };
    const first = await run(makeReq(), handler);
    expect(first.res.statusCode).toBe(201);
    const second = await run(makeReq(), handler);
    expect(calls).toBe(1);
    expect(second.handled).toBe(false);
    expect(second.res.statusCode).toBe(201);
    expect(second.res.body).toEqual({ success: true, data: { id: "leave1" } });
    expect(second.res.headers["Idempotent-Replayed"]).toBe("true");
  });

  it("returns 409 while the first request is still running", async () => {
    // First request claims the key but never answers.
    const req1 = makeReq();
    idempotency(req1, makeRes() as any, () => {});
    await new Promise((r) => setImmediate(r));
    const { res, handled } = await run(makeReq());
    expect(handled).toBe(false);
    expect(res.statusCode).toBe(409);
    expect(res.headers["Retry-After"]).toBeDefined();
  });

  it("refuses the same key for a different request", async () => {
    await run(makeReq(), (res) => res.json({ success: true }));
    const { res } = await run(makeReq({ body: { from: "2026-12-01" } }));
    expect(res.statusCode).toBe(422);
  });

  it("releases the key after a server error so a retry runs", async () => {
    let calls = 0;
    await run(makeReq(), (res) => {
      calls++;
      res.status(503).json({ success: false });
    });
    expect(store.size).toBe(0);
    await run(makeReq(), (res) => {
      calls++;
      res.json({ success: true });
    });
    expect(calls).toBe(2);
  });

  it("scopes keys by tenant and user", async () => {
    let calls = 0;
    const handler = (res: Res) => {
      calls++;
      res.json({ success: true });
    };
    await run(makeReq(), handler);
    await run(makeReq({ user: { userId: "u2", tenantId: "t1" } }), handler);
    await run(makeReq({ user: { userId: "u1", tenantId: "t2" } }), handler);
    expect(calls).toBe(3);
  });

  it("only checks a request once across repeated guard mounts", async () => {
    const req = makeReq();
    let nexts = 0;
    const res = makeRes();
    await new Promise<void>((resolve) => {
      idempotency(req, res as any, () => {
        nexts++;
        // The next router mount runs the guard again for the same request.
        idempotency(req, res as any, () => {
          nexts++;
          resolve();
        });
      });
    });
    expect(nexts).toBe(2);
    expect(res.statusCode).toBe(200);
  });
});
