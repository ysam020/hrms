jest.mock("@hrms/db", () => {
  const { createFakeDb } = require("./presenceFakes");
  const fake = createFakeDb();
  return {
    __fake: fake,
    prismaWithTenant: fake.db,
    prisma: fake.db,
    getTenantId: jest.fn(() => fake.state.tenant),
    runWithTenant: jest.fn((t: string, _c: unknown, fn: () => unknown) => {
      fake.state.tenant = t; // the tenant comes from the socket's token
      return fn();
    }),
    getClientForDb: jest.fn(),
  };
});
jest.mock("@hrms/websocket", () => {
  const { createFakeRedis } = require("./presenceFakes");
  const redis = createFakeRedis();
  const listeners: ((channel: string, message: string) => void)[] = [];
  const subscriber = {
    subscribe: jest.fn(async () => 1),
    on: jest.fn((_e: string, fn: any) => listeners.push(fn)),
  };
  return {
    __redis: redis,
    __listeners: listeners,
    getWebSocketRedis: (type: string) =>
      type === "subscriber" ? subscriber : redis.client,
  };
});
jest.mock("@hrms/queue", () => ({
  getPresenceQueue: () => ({
    add: jest.fn(async () => ({})),
    remove: jest.fn(),
  }),
}));
// Presence updates are re-authorised per watcher before emit; the decision
// logic is covered in socketAuth.test.ts — here we assert the relay uses it.
jest.mock("../config/socketAuth", () => ({
  emitToRoomAuthorized: async (
    _io: unknown,
    room: string,
    event: string,
    payload: unknown,
  ) => {
    authorisedEmits.push({ room, event, payload });
    return 1;
  },
}));
const authorisedEmits: Array<{
  room: string;
  event: string;
  payload: unknown;
}> = [];
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../handlers/tenantSettings", () => ({
  getActiveSettings: jest.fn(async () => null),
}));

import {
  OFFLINE_GRACE_MS,
  setupPresenceSocket,
} from "../config/presenceSocket";
import { ownPresence, setStatus } from "../services/presence";

const { __fake: fake } = jest.requireMock("@hrms/db");
const { __redis: redis, __listeners: listeners } =
  jest.requireMock("@hrms/websocket");

const T = "tenant-a";
const OTHER_T = "tenant-b";
const U1 = "aaaaaaaaaaaaaaaaaaaaaaa1";
const U2 = "aaaaaaaaaaaaaaaaaaaaaaa2";
const U3 = "aaaaaaaaaaaaaaaaaaaaaaa3";
const X1 = "bbbbbbbbbbbbbbbbbbbbbbb1";

const flush = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
};
const events = () =>
  redis.published.map((p: any) => JSON.parse(p.message)) as {
    room: string;
    payload: any;
  }[];

let connect: (s: any) => void;
const emitted: { room: string; event: string; payload: any }[] = [];
const io: any = {
  on: jest.fn((_e: string, fn: any) => (connect = fn)),
  to: (room: string) => ({
    emit: (event: string, payload: any) =>
      emitted.push({ room, event, payload }),
  }),
};
setupPresenceSocket(io);

let n = 0;
function socketFor(userId: string, tenantId: string | null = T) {
  const handlers: Record<string, (...a: any[]) => any> = {};
  const socket: any = {
    id: `s${++n}`,
    userId,
    tenantId,
    dbName: tenantId ? `db_${tenantId}` : null,
    rooms: new Set<string>(),
    join: jest.fn((r: string) => socket.rooms.add(r)),
    leave: jest.fn((r: string) => socket.rooms.delete(r)),
    on: jest.fn((e: string, fn: any) => (handlers[e] = fn)),
  };
  connect(socket);
  return { socket, handlers };
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
  fake.state.tenant = T;
  fake.state.users = [
    { id: U1, tenantId: T, username: "asha", first_name: "Asha" },
    { id: U2, tenantId: T, username: "bilal", first_name: "Bilal" },
    { id: U3, tenantId: T, username: "chen", first_name: "Chen" },
    { id: X1, tenantId: OTHER_T, username: "xavier", first_name: "Xavier" },
  ];
  fake.state.teams = { [T]: [{ teamLeaderId: U1, members: [U2] }] };
  fake.state.memberships = [
    { tenantId: T, userId: U1, role: "employee" },
    { tenantId: T, userId: U2, role: "employee" },
  ];
  fake.state.presence = {};
  redis.hashes.clear();
  redis.strings.clear();
  redis.published.length = 0;
  emitted.length = 0;
});
afterEach(() => jest.useRealTimers());

describe("connectivity", () => {
  it("an active employee is online, announced once across tabs", async () => {
    socketFor(U1);
    await flush();
    socketFor(U1); // second tab
    await flush();
    const mine = events().filter((e) => e.room === `px:${T}:${U1}`);
    expect(mine).toHaveLength(1);
    expect(mine[0].payload).toMatchObject({
      connectivity: "online",
      status: "available",
    });
  });

  it("an inactive employee becomes idle (shown as Away), a manual Busy stays Busy", async () => {
    const { handlers } = socketFor(U1);
    await flush();
    handlers["presence:heartbeat"]({ state: "idle" });
    await flush();
    expect(events().at(-1)!.payload).toMatchObject({
      connectivity: "idle",
      status: "away",
      availability: "available",
    });

    await setStatus(T, U1, { availability: "busy" });
    expect(events().at(-1)!.payload).toMatchObject({
      connectivity: "idle",
      status: "busy",
    });
  });

  it("one idle tab doesn't make the person idle while another is active", async () => {
    const a = socketFor(U1);
    socketFor(U1);
    await flush();
    a.handlers["presence:heartbeat"]({ state: "idle" });
    await flush();
    expect(events().every((e) => e.payload.connectivity === "online")).toBe(
      true,
    );
  });

  it("a disconnected employee goes offline only after the grace period", async () => {
    const { handlers } = socketFor(U1);
    await flush();
    handlers.disconnect();
    await flush();
    await jest.advanceTimersByTimeAsync(OFFLINE_GRACE_MS - 1000);
    await flush();
    expect(events().at(-1)!.payload.connectivity).toBe("online");

    await jest.advanceTimersByTimeAsync(2000);
    await flush();
    expect(events().at(-1)!.payload).toMatchObject({
      connectivity: "offline",
      status: "offline",
    });
    expect(events().at(-1)!.payload.lastSeenAt).toEqual(expect.any(String));
  });

  it("a refresh or brief network drop never announces offline", async () => {
    const first = socketFor(U1);
    await flush();
    first.handlers.disconnect();
    await flush();
    socketFor(U1); // reconnect within the grace period
    await flush();
    await jest.advanceTimersByTimeAsync(OFFLINE_GRACE_MS + 1000);
    await flush();
    expect(events().map((e) => e.payload.connectivity)).toEqual(["online"]);
  });

  it("reconnecting doesn't replace a manual Do Not Disturb", async () => {
    await setStatus(T, U1, { availability: "dnd" });
    const first = socketFor(U1);
    await flush();
    first.handlers.disconnect();
    await flush();
    await jest.advanceTimersByTimeAsync(OFFLINE_GRACE_MS + 1000);
    await flush();
    socketFor(U1);
    await flush();
    expect(events().at(-1)!.payload).toMatchObject({
      connectivity: "online",
      availability: "dnd",
      status: "dnd",
    });
    expect((await ownPresence(T, U1)).availability).toBe("dnd");
  });

  it("ignores sockets without an organisation", () => {
    const { handlers } = socketFor(U1, null);
    expect(handlers["presence:watch"]).toBeUndefined();
  });
});

describe("watching", () => {
  it("joins rooms only for visible people in the socket's own tenant", async () => {
    const { socket, handlers } = socketFor(U2);
    await flush();
    const ack = jest.fn();
    await handlers["presence:watch"]({ userIds: [U1, U3, X1, "../etc"] }, ack);

    expect(ack).toHaveBeenCalledWith({
      ok: true,
      presence: [expect.objectContaining({ userId: U1 })],
    });
    expect([...socket.rooms].sort()).toEqual([
      `px:${T}:${U1}`,
      `px:${T}:${U2}`,
    ]);
    // Every room the socket ever joined is its own tenant's.
    for (const [r] of socket.join.mock.calls)
      expect(r.startsWith(`px:${T}:`)).toBe(true);
  });

  it("a newer watch replaces the old one but keeps the person's own room", async () => {
    fake.state.memberships.push({ tenantId: T, userId: U3, role: "hr" });
    const { socket, handlers } = socketFor(U3);
    await flush();
    await handlers["presence:watch"]({ userIds: [U1] }, jest.fn());
    await handlers["presence:watch"]({ userIds: [U2] }, jest.fn());
    expect([...socket.rooms].sort()).toEqual([
      `px:${T}:${U2}`,
      `px:${T}:${U3}`,
    ]);
  });

  it("rate-limits watch floods", async () => {
    const { handlers } = socketFor(U1);
    const ack = jest.fn();
    for (let i = 0; i < 31; i++)
      await handlers["presence:watch"]({ userIds: [] }, ack);
    expect(ack).toHaveBeenLastCalledWith({ ok: false, error: "rate_limited" });
  });

  it("relays events to the matching room on this worker only, through the per-watcher authorised emit", () => {
    authorisedEmits.length = 0;
    listeners[0](
      "socket:presence",
      JSON.stringify({ room: `px:${T}:${U1}`, payload: { a: 1 } }),
    );
    listeners[0](
      "socket:presence",
      JSON.stringify({ room: "everyone", payload: {} }),
    );
    listeners[0]("socket:broadcast", JSON.stringify({ room: `px:${T}:${U1}` }));
    expect(authorisedEmits).toEqual([
      { room: `px:${T}:${U1}`, event: "presence:update", payload: { a: 1 } },
    ]);
    // Never an unauthorised room-wide emit.
    expect(emitted.filter((e) => e.event === "presence:update")).toEqual([]);
  });
});
