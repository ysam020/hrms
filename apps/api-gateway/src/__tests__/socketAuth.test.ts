import { EventEmitter } from "events";
import jwt from "jsonwebtoken";
import { enforceSocketAccess, resolveSocketUserId } from "../config/socketAuth";

// The handshake (and connected sockets) consult the
// authoritative account check. Allowed by default; denial tested below.
const mockResolveAccess = jest.fn();
jest.mock("../services/accountAccess", () => ({
  resolveAccountAccess: (...a: unknown[]) => mockResolveAccess(...a),
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

  it("keeps the socket open when the check itself errors (retried next interval)", async () => {
    const io = fakeIo();
    enforceSocketAccess(io, 60_000);
    const socket = fakeSocket();
    (io as any).emit("connection", socket);
    mockResolveAccess.mockRejectedValue(new Error("db blip"));
    const next = jest.fn();
    socket.middlewares[0](["chat:send", {}], next);
    await flush();
    expect(next).toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});
