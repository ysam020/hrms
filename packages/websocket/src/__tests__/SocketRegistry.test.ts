import { FakeRedis, FakeRedisServer } from "./fakes";
import {
  addMembership,
  removeMembership,
  heartbeat,
  sweepDeadNodes,
  publishToNodes,
  userKey,
  nodeUsersKey,
  aliveKey,
  nodeChannel,
  NODES_KEY,
  newNodeId,
} from "../SocketRegistry";

const asRedis = (r: FakeRedis) => r as any;

describe("SocketRegistry", () => {
  let srv: FakeRedisServer;
  let r: FakeRedis;
  beforeEach(() => {
    srv = new FakeRedisServer();
    r = new FakeRedis(srv);
  });

  it("node ids are unique per process boot (PID reuse can't collide)", () => {
    expect(newNodeId()).not.toBe(newNodeId());
    expect(newNodeId()).toMatch(new RegExp(`:${process.pid}:[0-9a-f]{8}$`));
  });

  it("membership is a set per (tenant, user) with a reverse index per node; idempotent", async () => {
    await addMembership(asRedis(r), "n1", "t1", "u1");
    await addMembership(asRedis(r), "n1", "t1", "u1");
    await addMembership(asRedis(r), "n2", "t1", "u1");
    expect((await r.smembers(userKey("t1", "u1"))).sort()).toEqual([
      "n1",
      "n2",
    ]);
    expect(await r.smembers(nodeUsersKey("n1"))).toEqual(["t1:u1"]);
    await removeMembership(asRedis(r), "n1", "t1", "u1");
    expect(await r.smembers(userKey("t1", "u1"))).toEqual(["n2"]);
  });

  it("keys are tenant-scoped: the same user in two tenants has independent sets", async () => {
    await addMembership(asRedis(r), "n1", "t1", "u1");
    await addMembership(asRedis(r), "n2", "t2", "u1");
    expect(await r.smembers(userKey("t1", "u1"))).toEqual(["n1"]);
    expect(await r.smembers(userKey("t2", "u1"))).toEqual(["n2"]);
    expect(userKey(null, "u1")).toBe("ws:v2:u:-:u1");
  });

  it("sweep removes every membership of a node whose alive key is gone, never a live node or itself", async () => {
    await heartbeat(asRedis(r), "live");
    await heartbeat(asRedis(r), "self");
    await r.sadd(NODES_KEY, "dead");
    for (const n of ["live", "dead", "self"]) {
      await addMembership(asRedis(r), n, "t1", "u1");
      await addMembership(asRedis(r), n, "t1", "u2");
    }
    const res = await sweepDeadNodes(asRedis(r), "self");
    expect(res).toEqual({ sweptNodes: 1, removedMemberships: 2 });
    expect((await r.smembers(userKey("t1", "u1"))).sort()).toEqual([
      "live",
      "self",
    ]);
    expect(await r.smembers(NODES_KEY)).not.toContain("dead");
    expect(await r.exists(nodeUsersKey("dead"))).toBe(0);
    // A second concurrent/repeated sweep is a no-op.
    expect(await sweepDeadNodes(asRedis(r), "self")).toEqual({
      sweptNodes: 0,
      removedMemberships: 0,
    });
  });

  it("publishes once per member node, skips the caller, and counts only nodes that received it", async () => {
    const sub1 = new FakeRedis(srv);
    await sub1.subscribe(nodeChannel("n1"));
    const got: string[] = [];
    sub1.on("message", (_c: string, m: string) => got.push(m));
    await heartbeat(asRedis(r), "n1");
    await heartbeat(asRedis(r), "self");
    await addMembership(asRedis(r), "n1", "t1", "u1");
    await addMembership(asRedis(r), "self", "t1", "u1");
    const reached = await publishToNodes(
      asRedis(r),
      asRedis(r),
      "t1",
      "u1",
      "ev",
      { a: 1 },
      "self",
    );
    await new Promise((res) => setImmediate(res));
    expect(reached).toBe(1);
    expect(got.map((m) => JSON.parse(m))).toEqual([
      {
        v: 2,
        tenantId: "t1",
        userId: "u1",
        eventName: "ev",
        payload: { a: 1 },
      },
    ]);
  });

  it("lazily prunes a member with no subscriber only when its alive key is gone", async () => {
    await addMembership(asRedis(r), "crashed", "t1", "u1");
    await addMembership(asRedis(r), "restarting", "t1", "u1");
    await heartbeat(asRedis(r), "restarting"); // alive but not subscribed (yet)
    expect(
      await publishToNodes(asRedis(r), asRedis(r), "t1", "u1", "ev", {}),
    ).toBe(0);
    expect(await r.smembers(userKey("t1", "u1"))).toEqual(["restarting"]);
    expect(await r.exists(aliveKey("restarting"))).toBe(1);
  });
});
