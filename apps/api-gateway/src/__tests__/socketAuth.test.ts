import { EventEmitter } from "events";
import jwt from "jsonwebtoken";
import {
  enforceSocketAccess,
  resolveSocketUserId,
  authorizeSocketDelivery,
  startAccountRevocationListener,
  emitToRoomAuthorized,
  SENSITIVE_SOCKET_EVENTS,
  DELIVERY_MAX_AGE_MS,
} from "../config/socketAuth";

// The handshake (and connected sockets) consult the
// authoritative account check. Allowed by default; denial tested below.
const mockResolveAccess = jest.fn();
const mockInvalidateUser = jest.fn();
const mockInvalidateTenant = jest.fn();
const mockFlush = jest.fn(() => 3);
jest.mock("../services/accountAccess", () => ({
  resolveAccountAccess: (...a: unknown[]) => mockResolveAccess(...a),
  invalidateAccountAccess: (...a: unknown[]) => mockInvalidateUser(...a),
  invalidateTenantAccess: (...a: unknown[]) => mockInvalidateTenant(...a),
  flushAccountAccessDecisions: () => mockFlush(),
}));
// Capture the revocation subscriber's callbacks.
const revocation: { onMessage?: (r: any) => void; onResync?: () => void } = {};
jest.mock("@hrms/cache", () => ({
  subscribeAccountRevocations: (onMessage: any, onResync: any) => {
    revocation.onMessage = onMessage;
    revocation.onResync = onResync;
    return async () => undefined;
  },
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const ALLOWED = {
  ok: true,
  tenantRole: "employee",
  dbName: null,
  employeeStatus: "Active",
};
beforeEach(() => mockResolveAccess.mockReset().mockResolvedValue(ALLOWED));

describe("resolveSocketUserId", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, ACCESS_JWT_TOKEN: "test-jwt-secret" };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("returns userId/tenantId/dbName for a valid token", async () => {
    const token = jwt.sign(
      { userId: "u1", tenantId: "t1", dbName: "tenant_db" },
      "test-jwt-secret",
      { algorithm: "HS256" },
    );
    await expect(resolveSocketUserId(token)).resolves.toEqual({
      userId: "u1",
      tenantId: "t1",
      dbName: "tenant_db",
    });
  });

  it("defaults tenantId and dbName to null when absent from the payload", async () => {
    const token = jwt.sign({ userId: "u1" }, "test-jwt-secret", {
      algorithm: "HS256",
    });
    await expect(resolveSocketUserId(token)).resolves.toEqual({
      userId: "u1",
      tenantId: null,
      dbName: null,
    });
  });

  it("returns null when the payload has no userId", async () => {
    const token = jwt.sign({ tenantId: "t1" }, "test-jwt-secret", {
      algorithm: "HS256",
    });
    await expect(resolveSocketUserId(token)).resolves.toBeNull();
  });

  it("returns null for a token signed with the wrong secret", async () => {
    const token = jwt.sign({ userId: "u1" }, "wrong-secret", {
      algorithm: "HS256",
    });
    await expect(resolveSocketUserId(token)).resolves.toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = jwt.sign({ userId: "u1" }, "test-jwt-secret", {
      algorithm: "HS256",
      expiresIn: -10,
    });
    await expect(resolveSocketUserId(token)).resolves.toBeNull();
  });

  it("returns null for a malformed token", async () => {
    await expect(resolveSocketUserId("not-a-jwt")).resolves.toBeNull();
  });

  it("rejects a token signed with a different algorithm (alg confusion)", async () => {
    // algorithms: ["HS256"] pins verification — a token signed with, say,
    // "none" or a mismatched alg must not be accepted.
    const token = jwt.sign({ userId: "u1" }, "test-jwt-secret", {
      algorithm: "HS384",
    });
    await expect(resolveSocketUserId(token)).resolves.toBeNull();
  });
});

describe("resolveSocketUserId — account check at handshake", () => {
  beforeEach(() => {
    process.env.ACCESS_JWT_TOKEN = "test-jwt-secret";
  });

  it("refuses a valid token for a terminated / removed person", async () => {
    mockResolveAccess.mockResolvedValue({
      ok: false,
      reason: "blocked_status",
    });
    const token = jwt.sign(
      { userId: "u1", tenantId: "t1" },
      "test-jwt-secret",
      {
        algorithm: "HS256",
      },
    );
    await expect(resolveSocketUserId(token)).resolves.toBeNull();
    expect(mockResolveAccess).toHaveBeenCalledWith("u1", "t1");
  });
});

describe("enforceSocketAccess — connected sockets are re-validated", () => {
  function fakeIo() {
    const io = new EventEmitter();
    return io as unknown as { on: any; emit: any };
  }
  function fakeSocket(userId = "u1", tenantId = "t1") {
    const s: any = new EventEmitter();
    s.userId = userId;
    s.tenantId = tenantId;
    s.middlewares = [] as any[];
    s.use = (fn: any) => s.middlewares.push(fn);
    s.disconnect = jest.fn();
    const emit = s.emit.bind(s);
    s.sent = [] as string[];
    s.emit = (ev: string, ...a: any[]) => {
      s.sent.push(ev);
      return emit(ev, ...a);
    };
    return s;
  }
  const flush = () => new Promise((r) => setImmediate(r));

  afterEach(() => jest.useRealTimers());

  it("closes the socket on the next interval after the person is terminated", async () => {
    jest.useFakeTimers({ doNotFake: ["setImmediate"] });
    const io = fakeIo();
    enforceSocketAccess(io, 60_000);
    const socket = fakeSocket();
    (io as any).emit("connection", socket);

    jest.advanceTimersByTime(60_000);
    await flush();
    expect(socket.disconnect).not.toHaveBeenCalled(); // still allowed

    mockResolveAccess.mockResolvedValue({
      ok: false,
      reason: "blocked_status",
    });
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(socket.sent).toContain("session-expired");
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("drops an incoming event from a revoked socket instead of dispatching it", async () => {
    const io = fakeIo();
    enforceSocketAccess(io, 60_000);
    const socket = fakeSocket();
    (io as any).emit("connection", socket);
    mockResolveAccess.mockResolvedValue({ ok: false, reason: "no_membership" });
    const next = jest.fn();
    socket.middlewares[0](["chat:send", {}], next);
    await flush();
    expect(next).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("lets events through for an allowed person, and stops checking after disconnect", async () => {
    jest.useFakeTimers({ doNotFake: ["setImmediate"] });
    const io = fakeIo();
    enforceSocketAccess(io, 60_000);
    const socket = fakeSocket();
    (io as any).emit("connection", socket);
    const next = jest.fn();
    socket.middlewares[0](["chat:send", {}], next);
    await flush();
    expect(next).toHaveBeenCalled();

    socket.emit("disconnect");
    const calls = mockResolveAccess.mock.calls.length;
    jest.advanceTimersByTime(180_000);
    await flush();
    expect(mockResolveAccess.mock.calls.length).toBe(calls);
  });

  it("keeps the socket open when the check itself errors (retried next interval) — non-sensitive event passes", async () => {
    const io = fakeIo();
    enforceSocketAccess(io, 60_000);
    const socket = fakeSocket();
    (io as any).emit("connection", socket);
    mockResolveAccess.mockRejectedValue(new Error("db blip"));
    const next = jest.fn();
    socket.middlewares[0](["chat:typing", {}], next);
    await flush();
    expect(next).toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  // Sensitive operations use a FRESH decision and fail closed.
  it("checks sensitive events with a fresh decision and keystroke events with a bounded-age decision", async () => {
    const io = fakeIo();
    enforceSocketAccess(io, 60_000);
    const socket = fakeSocket();
    (io as any).emit("connection", socket);
    socket.middlewares[0](["chat:send", {}], jest.fn());
    socket.middlewares[0](["chat:typing", {}], jest.fn());
    await flush();
    expect(mockResolveAccess).toHaveBeenCalledWith("u1", "t1", {
      maxAgeMs: 0,
    });
    // Keystroke-rate events: a decision at most DELIVERY_MAX_AGE_MS old (a
    // terminated person's typing indicator stops within that bound).
    expect(mockResolveAccess).toHaveBeenCalledWith("u1", "t1", {
      maxAgeMs: DELIVERY_MAX_AGE_MS,
    });
    for (const e of ["chat:send", "chat:join", "chat:read", "presence:watch"])
      expect(SENSITIVE_SOCKET_EVENTS.has(e)).toBe(true);
    expect(SENSITIVE_SOCKET_EVENTS.has("chat:typing")).toBe(false);
  });

  it("refuses a sensitive event when the check is unavailable, without closing the socket", async () => {
    const io = fakeIo();
    enforceSocketAccess(io, 60_000);
    const socket = fakeSocket();
    (io as any).emit("connection", socket);
    mockResolveAccess.mockRejectedValue(new Error("db down"));
    const next = jest.fn();
    socket.middlewares[0](["chat:send", {}], next);
    await flush();
    expect(next).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.sent).toContain("chat:error");
  });
});

describe("authorizeSocketDelivery", () => {
  it("allows, denies, or reports unavailable — using a decision at most DELIVERY_MAX_AGE_MS old", async () => {
    await expect(authorizeSocketDelivery("u1", "t1")).resolves.toBe("allow");
    expect(mockResolveAccess).toHaveBeenCalledWith("u1", "t1", {
      maxAgeMs: DELIVERY_MAX_AGE_MS,
    });
    mockResolveAccess.mockResolvedValue({
      ok: false,
      reason: "blocked_status",
    });
    await expect(authorizeSocketDelivery("u1", "t1")).resolves.toBe("deny");
    mockResolveAccess.mockRejectedValue(
      Object.assign(new Error("x"), { name: "AccountAccessUnavailableError" }),
    );
    await expect(authorizeSocketDelivery("u1", "t1")).resolves.toBe(
      "unavailable",
    );
  });
});

describe("startAccountRevocationListener", () => {
  const sock = (userId: string, tenantId: string | null) => ({
    userId,
    tenantId,
  });
  const flush = () => new Promise((r) => setImmediate(r));
  function setup(sockets: any[]) {
    const adapter = { revokeLocal: jest.fn(() => 1) };
    const io = {
      sockets: { sockets: new Map(sockets.map((s, i) => [String(i), s])) },
    };
    startAccountRevocationListener(adapter as any, io as any);
    return adapter;
  }

  it("a person's revocation drops the cached decision, re-checks fresh, and closes only that person's sockets", async () => {
    const adapter = setup([sock("u1", "t1"), sock("u2", "t1")]);
    mockResolveAccess.mockResolvedValue({
      ok: false,
      reason: "blocked_status",
    });
    revocation.onMessage!({ userId: "u1", reason: "test", at: 1 });
    await flush();
    expect(mockInvalidateUser).toHaveBeenCalledWith("u1");
    expect(mockResolveAccess).toHaveBeenCalledWith("u1", "t1", { maxAgeMs: 0 });
    expect(adapter.revokeLocal).toHaveBeenCalledTimes(1);
    expect(adapter.revokeLocal).toHaveBeenCalledWith("u1", "t1");
  });

  it("does not close a session in an organisation the person still belongs to", async () => {
    const adapter = setup([sock("u1", "t1"), sock("u1", "t2")]);
    mockResolveAccess.mockImplementation(async (_u: string, t: string) =>
      t === "t1" ? { ok: false, reason: "no_membership" } : ALLOWED,
    );
    revocation.onMessage!({
      userId: "u1",
      tenantId: "t1",
      reason: "test",
      at: 1,
    });
    await flush();
    expect(adapter.revokeLocal).toHaveBeenCalledWith("u1", "t1");
    expect(adapter.revokeLocal).not.toHaveBeenCalledWith("u1", "t2");
  });

  it("a tenant-wide revocation re-checks every local member of that tenant", async () => {
    const adapter = setup([
      sock("u1", "t1"),
      sock("u2", "t1"),
      sock("u3", "t2"),
    ]);
    mockResolveAccess.mockResolvedValue({
      ok: false,
      reason: "tenant_inactive",
    });
    revocation.onMessage!({ tenantId: "t1", reason: "suspended", at: 1 });
    await flush();
    expect(mockInvalidateTenant).toHaveBeenCalledWith("t1");
    expect(adapter.revokeLocal).toHaveBeenCalledWith("u1", "t1");
    expect(adapter.revokeLocal).toHaveBeenCalledWith("u2", "t1");
    expect(adapter.revokeLocal).not.toHaveBeenCalledWith("u3", "t2");
  });

  it("closes when the fresh check is unavailable (a revocation was announced: fail closed)", async () => {
    const adapter = setup([sock("u1", "t1")]);
    mockResolveAccess.mockRejectedValue(new Error("db down"));
    revocation.onMessage!({ userId: "u1", reason: "test", at: 1 });
    await flush();
    expect(adapter.revokeLocal).toHaveBeenCalledWith("u1", "t1");
  });

  it("flushes every cached decision when the subscriber reconnects (missed revocations)", () => {
    setup([]);
    revocation.onResync!();
    expect(mockFlush).toHaveBeenCalled();
  });
});

describe("emitToRoomAuthorized (presence updates)", () => {
  function roomIo(
    members: Array<{ id: string; userId: string; tenantId: string }>,
  ) {
    const sockets = new Map<string, any>();
    for (const m of members) {
      sockets.set(m.id, {
        ...m,
        sent: [] as string[],
        emit(ev: string) {
          this.sent.push(ev);
        },
        disconnect: jest.fn(),
      });
    }
    return {
      io: {
        sockets: {
          sockets,
          adapter: {
            rooms: new Map([["px:t1:w", new Set(members.map((m) => m.id))]]),
          },
        },
      },
      sockets,
    };
  }

  it("emits only to allowed watchers; closes denied ones; uses the bounded-age decision", async () => {
    const { io, sockets } = roomIo([
      { id: "a", userId: "ok", tenantId: "t1" },
      { id: "b", userId: "gone", tenantId: "t1" },
      { id: "c", userId: "ok", tenantId: "t1" },
    ]);
    mockResolveAccess.mockImplementation(async (u: string) =>
      u === "gone" ? { ok: false, reason: "blocked_status" } : ALLOWED,
    );
    const n = await emitToRoomAuthorized(
      io as any,
      "px:t1:w",
      "presence:update",
      {},
    );
    expect(n).toBe(2);
    expect(sockets.get("a").sent).toEqual(["presence:update"]);
    expect(sockets.get("c").sent).toEqual(["presence:update"]);
    expect(sockets.get("b").sent).toEqual(["session-expired"]);
    expect(sockets.get("b").disconnect).toHaveBeenCalledWith(true);
    expect(mockResolveAccess).toHaveBeenCalledWith("ok", "t1", {
      maxAgeMs: DELIVERY_MAX_AGE_MS,
    });
    expect(mockResolveAccess).toHaveBeenCalledTimes(2); // once per person, not per socket
  });

  it("skips (without closing) when the check is unavailable; empty room is a no-op", async () => {
    const { io, sockets } = roomIo([{ id: "a", userId: "u", tenantId: "t1" }]);
    mockResolveAccess.mockRejectedValue(new Error("db down"));
    expect(
      await emitToRoomAuthorized(io as any, "px:t1:w", "presence:update", {}),
    ).toBe(0);
    expect(sockets.get("a").sent).toEqual([]);
    expect(sockets.get("a").disconnect).not.toHaveBeenCalled();
    expect(
      await emitToRoomAuthorized(io as any, "px:none", "presence:update", {}),
    ).toBe(0);
  });
});
