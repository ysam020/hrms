import { FakeRedis, FakeRedisServer, connectionsFor } from "./fakes";

const srv = new FakeRedisServer();
let conns = connectionsFor(srv);
jest.mock("../connection", () => ({
  getWebSocketRedis: (type: "client" | "publisher" | "subscriber") =>
    conns[type],
}));
const mockInc = jest.fn();
jest.mock("@hrms/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  websocketPublishFailuresTotal: { inc: (...a: unknown[]) => mockInc(...a) },
}));

import {
  RedisNotificationPublisher,
  getNotificationPublisher,
} from "../RedisNotificationPublisher";
import { addMembership, heartbeat, nodeChannel } from "../SocketRegistry";

beforeEach(() => {
  srv.sets.clear();
  srv.strings.clear();
  srv.subs.clear();
  srv.down = false;
  conns = connectionsFor(srv);
  mockInc.mockReset();
});

async function gatewayNode(nodeId: string) {
  const sub = new FakeRedis(srv);
  await sub.subscribe(nodeChannel(nodeId));
  await heartbeat(conns.client as any, nodeId);
  const got: any[] = [];
  sub.on("message", (_c: string, m: string) => got.push(JSON.parse(m)));
  return got;
}

describe("RedisNotificationPublisher", () => {
  it("publishes once to every gateway node holding the person's sockets in that tenant", async () => {
    const n1 = await gatewayNode("n1");
    const n2 = await gatewayNode("n2");
    await addMembership(conns.client as any, "n1", "t1", "u1");
    await addMembership(conns.client as any, "n2", "t1", "u1");
    const ok = await new RedisNotificationPublisher().sendToUser(
      "u1",
      "notification",
      { id: 1 },
      { tenantId: "t1" },
    );
    await new Promise((r) => setImmediate(r));
    expect(ok).toBe(true);
    for (const got of [n1, n2])
      expect(got).toEqual([
        {
          v: 2,
          tenantId: "t1",
          userId: "u1",
          eventName: "notification",
          payload: { id: 1 },
        },
      ]);
  });

  it("returns false (offline) when no node holds a socket for that person in that tenant", async () => {
    await gatewayNode("n1");
    await addMembership(conns.client as any, "n1", "t2", "u1"); // other tenant only
    expect(
      await new RedisNotificationPublisher().sendToUser(
        "u1",
        "notification",
        {},
        { tenantId: "t1" },
      ),
    ).toBe(false);
  });

  it("returns false and counts the failure when Redis is unavailable", async () => {
    srv.down = true;
    expect(
      await new RedisNotificationPublisher().sendToUser(
        "u1",
        "notification",
        {},
        { tenantId: "t1" },
      ),
    ).toBe(false);
    expect(mockInc).toHaveBeenCalledWith({
      method: "sendToUser",
      service: expect.any(String),
    });
  });

  it("broadcast and sendNotification publish on the shared channels", async () => {
    const sub = new FakeRedis(srv);
    await sub.subscribe("socket:broadcast", "socket:notification");
    const got: string[] = [];
    sub.on("message", (c: string) => got.push(c));
    await getNotificationPublisher().broadcast("e", {});
    await getNotificationPublisher().sendNotification({});
    await new Promise((r) => setImmediate(r));
    expect(got.sort()).toEqual(["socket:broadcast", "socket:notification"]);
  });
});
