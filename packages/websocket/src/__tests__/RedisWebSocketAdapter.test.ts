/**
 * The adapter's per-process semantics (multi-socket rooms,
 * registration lifecycle, delivery-time authorisation, revocation, legacy
 * compatibility, Redis outage). Cross-process behaviour with real Redis and
 * two gateway processes: integration/socketMultiDevice.it.test.ts.
 */
import { FakeIo, FakeRedisServer, connectionsFor, settle } from "./fakes";

const srv = new FakeRedisServer();
let conns = connectionsFor(srv);
jest.mock("../connection", () => ({
  getWebSocketRedis: (type: "client" | "publisher" | "subscriber") =>
    conns[type],
  closeWebSocketRedisConnections: jest.fn().mockResolvedValue(undefined),
}));
const mockPublishFailures = { inc: jest.fn() };
jest.mock("@hrms/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  websocketPublishFailuresTotal: {
    inc: (...a: unknown[]) => mockPublishFailures.inc(...a),
  },
}));

import { RedisWebSocketAdapter } from "../RedisWebSocketAdapter";
import { userKey, nodeChannel, aliveKey } from "../SocketRegistry";

function setup(
  authorize?: (
    u: string,
    t: string | null,
  ) => Promise<"allow" | "deny" | "unavailable">,
) {
  const io = new FakeIo();
  const adapter = new RedisWebSocketAdapter(io as any, {
    authorizeDelivery: authorize,
  });
  return { io, adapter };
}
const pings = (s: any, ev = "ev") =>
  s.emitted
    .filter(([e]: [string]) => e === ev)
    .map(([, p]: [string, any]) => p);

beforeEach(() => {
  srv.sets.clear();
  srv.strings.clear();
  srv.hashes.clear();
  srv.subs.clear();
  srv.down = false;
  conns = connectionsFor(srv);
  jest.clearAllMocks();
});

describe("RedisWebSocketAdapter", () => {
  it("subscribes to its own node channel (plus legacy, broadcast, notification)", async () => {
    const { adapter } = setup();
    await settle();
    const channels = [...srv.subs.keys()];
    expect(channels).toEqual(
      expect.arrayContaining([
        nodeChannel(adapter.nodeId),
        `socket:worker-${process.pid}`,
        "socket:broadcast",
        "socket:notification",
      ]),
    );
    await adapter.cleanup();
  });

  it("every socket of a user on this process receives a targeted event exactly once", async () => {
    const { io, adapter } = setup();
    const [a, b, c] = [io.connect("u1"), io.connect("u1"), io.connect("u1")];
    await settle();
    expect(
      await adapter.sendToUser("u1", "ev", { n: 1 }, { tenantId: "t1" }),
    ).toBe(true);
    for (const s of [a, b, c]) expect(pings(s)).toEqual([{ n: 1 }]);
    await adapter.cleanup();
  });

  it("closing one socket keeps the others receiving and keeps the registration; the last one deregisters", async () => {
    const { io, adapter } = setup();
    const a = io.connect("u1");
    const b = io.connect("u1");
    await settle();
    expect(await conns.client.smembers(userKey("t1", "u1"))).toEqual([
      adapter.nodeId,
    ]);
    a.disconnect(); // the older tab
    await settle();
    expect(await conns.client.smembers(userKey("t1", "u1"))).toEqual([
      adapter.nodeId,
    ]);
    await adapter.sendToUser("u1", "ev", { n: 2 }, { tenantId: "t1" });
    expect(pings(b)).toEqual([{ n: 2 }]);
    b.disconnect();
    await settle();
    expect(await conns.client.smembers(userKey("t1", "u1"))).toEqual([]);
    expect(await adapter.sendToUser("u1", "ev", {}, { tenantId: "t1" })).toBe(
      false,
    );
    await adapter.cleanup();
  });

  it("is tenant-scoped: an event for tenant t1 never reaches the same person's t2 socket", async () => {
    const { io, adapter } = setup();
    const inT1 = io.connect("u1", "t1");
    const inT2 = io.connect("u1", "t2");
    await settle();
    await adapter.sendToUser("u1", "ev", "for-t1", { tenantId: "t1" });
    expect(pings(inT1)).toEqual(["for-t1"]);
    expect(pings(inT2)).toEqual([]);
    await adapter.cleanup();
  });

  it("delivers a v2 node-channel message from another process to the local room once", async () => {
    const { io, adapter } = setup();
    const a = io.connect("u1");
    await settle();
    const other = connectionsFor(srv).publisher;
    await other.publish(
      nodeChannel(adapter.nodeId),
      JSON.stringify({
        v: 2,
        tenantId: "t1",
        userId: "u1",
        eventName: "ev",
        payload: "remote",
      }),
    );
    await settle();
    expect(pings(a)).toEqual(["remote"]);
    await adapter.cleanup();
  });

  it("authorises at delivery: a denied person gets nothing and their sockets are closed; others unaffected", async () => {
    const { io, adapter } = setup(async (u) =>
      u === "bad" ? "deny" : "allow",
    );
    const bad1 = io.connect("bad");
    const bad2 = io.connect("bad");
    const good = io.connect("good");
    await settle();
    expect(await adapter.sendToUser("bad", "ev", "x", { tenantId: "t1" })).toBe(
      false,
    );
    for (const s of [bad1, bad2]) {
      expect(pings(s)).toEqual([]);
      expect(pings(s, "session-expired")).toHaveLength(1);
      expect(s.connected).toBe(false);
    }
    expect(
      await adapter.sendToUser("good", "ev", "y", { tenantId: "t1" }),
    ).toBe(true);
    expect(pings(good)).toEqual(["y"]);
    await adapter.cleanup();
  });

  it("an unavailable authorisation drops the message (fail closed) without closing the socket", async () => {
    const { io, adapter } = setup(async () => "unavailable");
    const a = io.connect("u1");
    await settle();
    expect(await adapter.sendToUser("u1", "ev", "x", { tenantId: "t1" })).toBe(
      false,
    );
    expect(pings(a)).toEqual([]);
    expect(a.connected).toBe(true);
    await adapter.cleanup();
  });

  it("platform broadcasts reach only authorised people", async () => {
    const { io, adapter } = setup(async (u) =>
      u === "bad" ? "deny" : "allow",
    );
    const bad = io.connect("bad");
    const good = io.connect("good");
    await settle();
    await connectionsFor(srv).publisher.publish(
      "socket:notification",
      JSON.stringify({ notification: { title: "hi" } }),
    );
    await settle();
    expect(pings(good, "notification")).toEqual([{ title: "hi" }]);
    expect(pings(bad, "notification")).toEqual([]);
    await adapter.cleanup();
  });

  it("legacy (pre-v2) per-PID messages are still delivered during a rolling deploy, after authorisation", async () => {
    const { io, adapter } = setup();
    const a = io.connect("u1", "t1");
    await settle();
    expect(await conns.client.hget("user:sockets", "u1")).toBe(
      `${process.pid}:${a.id}`,
    );
    await connectionsFor(srv).publisher.publish(
      `socket:worker-${process.pid}`,
      JSON.stringify({ userId: "u1", eventName: "ev", payload: "legacy" }),
    );
    await settle();
    expect(pings(a)).toEqual(["legacy"]);
    await adapter.cleanup();
  });

  it("Redis outage: same-process delivery still works; registration is restored by resync", async () => {
    const { io, adapter } = setup();
    const a = io.connect("u1");
    await settle();
    srv.sets.clear(); // e.g. swept while this process was cut off
    srv.down = true;
    expect(
      await adapter.sendToUser("u1", "ev", "local", { tenantId: "t1" }),
    ).toBe(true);
    expect(pings(a)).toEqual(["local"]);
    expect(mockPublishFailures.inc).toHaveBeenCalled();
    srv.down = false;
    expect(await adapter.resync("test")).toBe(1);
    expect(await conns.client.smembers(userKey("t1", "u1"))).toEqual([
      adapter.nodeId,
    ]);
    await adapter.cleanup();
  });

  it("resync removes registrations left behind when a last socket closed during a Redis outage", async () => {
    const { io, adapter } = setup();
    const a = io.connect("u1");
    const b = io.connect("u2");
    await settle();
    srv.down = true;
    a.disconnect(); // deregistration fails: Redis unreachable
    await settle();
    srv.down = false;
    expect(await conns.client.smembers(userKey("t1", "u1"))).toEqual([
      adapter.nodeId,
    ]); // stale
    await adapter.resync("test");
    expect(await conns.client.smembers(userKey("t1", "u1"))).toEqual([]);
    expect(await conns.client.smembers(userKey("t1", "u2"))).toEqual([
      adapter.nodeId,
    ]);
    expect(await adapter.sendToUser("u1", "ev", {}, { tenantId: "t1" })).toBe(
      false,
    );
    void b;
    await adapter.cleanup();
  });

  it("revokeLocal closes one person's sockets, or a whole tenant's", async () => {
    const { io, adapter } = setup();
    const u1t1 = io.connect("u1", "t1");
    const u1t2 = io.connect("u1", "t2");
    const u2t1 = io.connect("u2", "t1");
    await settle();
    expect(adapter.revokeLocal("u1", "t1")).toBe(1);
    expect(u1t1.connected).toBe(false);
    expect(u1t2.connected).toBe(true);
    expect(adapter.revokeLocal(undefined, "t1")).toBe(1);
    expect(u2t1.connected).toBe(false);
    expect(adapter.revokeLocal("u1", undefined)).toBe(1);
    expect(u1t2.connected).toBe(false);
    await adapter.cleanup();
  });

  it("graceful cleanup deregisters this process everywhere", async () => {
    const { io, adapter } = setup();
    io.connect("u1");
    await settle();
    expect(await conns.client.exists(aliveKey(adapter.nodeId))).toBe(1);
    await adapter.cleanup();
    expect(await conns.client.smembers(userKey("t1", "u1"))).toEqual([]);
    expect(await conns.client.exists(aliveKey(adapter.nodeId))).toBe(0);
  });
});
