jest.mock("@hrms/db", () => {
  const { createFakeDb } = require("./presenceFakes");
  const fake = createFakeDb();
  return {
    __fake: fake,
    prismaWithTenant: fake.db,
    prisma: fake.db,
    getTenantId: jest.fn(() => fake.state.tenant),
    runWithTenant: jest.fn((_t: string, _c: unknown, fn: () => unknown) =>
      fn(),
    ),
    getClientForDb: jest.fn(),
  };
});
jest.mock("@hrms/websocket", () => {
  const { createFakeRedis } = require("./presenceFakes");
  const redis = createFakeRedis();
  return { __redis: redis, getWebSocketRedis: () => redis.client };
});
jest.mock("@hrms/queue", () => {
  const queue = {
    add: jest.fn(async () => ({})),
    remove: jest.fn(async () => 1),
  };
  return { __queue: queue, getPresenceQueue: () => queue };
});
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../handlers/tenantSettings", () => ({
  getActiveSettings: jest.fn(async () => ({
    workStartHour: 9,
    workStartMinute: 0,
    fullDayMinHours: 8,
  })),
}));

import {
  clearMessage,
  expireIfCurrent,
  listPeople,
  markLastActive,
  ownPresence,
  resolveViewer,
  restoreStatus,
  setStatus,
  visiblePeople,
} from "../services/presence";
import {
  touchConnection,
  withoutDoNotDisturb,
} from "../services/presenceConnectivity";

const { __fake: fake } = jest.requireMock("@hrms/db");
const { __redis: redis } = jest.requireMock("@hrms/websocket");
const { __queue: queue } = jest.requireMock("@hrms/queue");

const T = "tenant-a";
const OTHER_T = "tenant-b";
const U1 = "aaaaaaaaaaaaaaaaaaaaaaa1";
const U2 = "aaaaaaaaaaaaaaaaaaaaaaa2";
const U3 = "aaaaaaaaaaaaaaaaaaaaaaa3";
const X1 = "bbbbbbbbbbbbbbbbbbbbbbb1"; // another organisation

const events = () => redis.published.map((p: any) => JSON.parse(p.message));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  fake.state.tenant = T;
  fake.state.users = [
    {
      id: U1,
      tenantId: T,
      username: "asha",
      first_name: "Asha",
      attendanceMode: "office",
    },
    {
      id: U2,
      tenantId: T,
      username: "bilal",
      first_name: "Bilal",
      attendanceMode: "remote",
    },
    { id: U3, tenantId: T, username: "chen", first_name: "Chen" },
    { id: X1, tenantId: OTHER_T, username: "xavier", first_name: "Xavier" },
  ];
  fake.state.teams = { [T]: [{ teamLeaderId: U1, members: [U2] }] };
  fake.state.presence = {};
  fake.state.wfh = {};
  redis.hashes.clear();
  redis.strings.clear();
  redis.published.length = 0;
});

describe("choosing a status", () => {
  it("stores it, tells watchers and survives a reload", async () => {
    const r = await setStatus(T, U1, {
      availability: "busy",
      message: "Quarterly report",
    });
    expect(r.changed).toBe(true);
    expect(r.presence).toMatchObject({
      availability: "busy",
      message: "Quarterly report",
      source: "manual",
      revision: 1,
    });

    // The event goes to the person's room in their own tenant only, and
    // carries presence fields — not the private "previous" or time zone.
    const [evt] = events();
    expect(evt.room).toBe(`px:${T}:${U1}`);
    expect(evt.payload).toMatchObject({ userId: U1, availability: "busy" });
    expect(evt.payload).not.toHaveProperty("previous");
    expect(evt.payload).not.toHaveProperty("timeZone");

    // A refresh (or signing in again) reads the same status back.
    expect((await ownPresence(T, U1)).availability).toBe("busy");
  });

  it("does nothing when the status hasn't changed", async () => {
    await setStatus(T, U1, { availability: "busy" });
    redis.published.length = 0;
    const r = await setStatus(T, U1, { availability: "busy" });
    expect(r.changed).toBe(false);
    expect(events()).toHaveLength(0);
  });

  it("sets and clears a message without touching the status", async () => {
    await setStatus(T, U1, { availability: "focusing", duration: "1h" });
    const withMsg = await setStatus(T, U1, { message: "Back at 3" });
    expect(withMsg.presence).toMatchObject({
      availability: "focusing",
      message: "Back at 3",
    });
    const cleared = await clearMessage(T, U1);
    expect(cleared.presence).toMatchObject({
      availability: "focusing",
      message: null,
    });
    expect(cleared.presence.expiresAt).toBe(withMsg.presence.expiresAt);
  });

  it("goes back to the previous status, then to Available", async () => {
    await setStatus(T, U1, { availability: "dnd" });
    await setStatus(T, U1, { availability: "meeting" });
    expect((await restoreStatus(T, U1)).presence.availability).toBe("dnd");
    expect((await restoreStatus(T, U1)).presence.availability).toBe(
      "available",
    );
  });

  it("keeps the Do Not Disturb flag used for chat pushes in step", async () => {
    await setStatus(T, U1, { availability: "dnd" });
    expect(await withoutDoNotDisturb(T, [U1, U2])).toEqual([U2]);
    await setStatus(T, U1, { availability: "available" });
    expect(await withoutDoNotDisturb(T, [U1, U2])).toEqual([U1, U2]);
  });

  it("the Do Not Disturb filter fails open if Redis is down", async () => {
    redis.client.mget.mockRejectedValueOnce(new Error("down"));
    expect(await withoutDoNotDisturb(T, [U1])).toEqual([U1]);
  });
});

describe("timed statuses", () => {
  it("schedules one expiry job for the new revision", async () => {
    await setStatus(T, U1, { availability: "lunch", duration: "30m" });
    expect(queue.add).toHaveBeenCalledWith(
      "expire",
      { tenantId: T, userId: U1, revision: 1 },
      expect.objectContaining({ jobId: `px-${T}-${U1}-1` }),
    );
    const delay = queue.add.mock.calls[0][2].delay;
    expect(delay).toBeGreaterThan(29 * 60_000);
    expect(delay).toBeLessThanOrEqual(30 * 60_000);
  });

  it("ends the status, restoring what was underneath, even with no tabs open", async () => {
    await setStatus(T, U1, { availability: "dnd", message: "Heads down" });
    await setStatus(T, U1, { availability: "lunch", duration: "30m" });
    const later = new Date(Date.now() + 31 * 60_000);
    redis.published.length = 0;

    expect(await expireIfCurrent(T, U1, 2, later)).toBe(true);
    const me = await ownPresence(T, U1, later);
    expect(me).toMatchObject({
      availability: "dnd",
      message: "Heads down",
      revision: 3,
    });
    expect(events()).toHaveLength(1);
    expect(await withoutDoNotDisturb(T, [U1])).toEqual([]);
  });

  it("an old job can't overwrite a newer choice", async () => {
    await setStatus(T, U1, { availability: "lunch", duration: "30m" }); // rev 1
    await setStatus(T, U1, { availability: "meeting", duration: "2h" }); // rev 2
    const later = new Date(Date.now() + 31 * 60_000);
    expect(await expireIfCurrent(T, U1, 1, later)).toBe(false);
    expect((await ownPresence(T, U1, later)).availability).toBe("meeting");
    // The superseded job is also removed from the queue.
    expect(queue.remove).toHaveBeenCalledWith(`px-${T}-${U1}-1`);
  });

  it("a duplicate run of the same job changes nothing", async () => {
    await setStatus(T, U1, { availability: "lunch", duration: "30m" });
    const later = new Date(Date.now() + 31 * 60_000);
    expect(await expireIfCurrent(T, U1, 1, later)).toBe(true);
    expect(await expireIfCurrent(T, U1, 1, later)).toBe(false);
  });

  it("an ended status reads as ended before the job has run", async () => {
    await setStatus(T, U1, { availability: "meeting", duration: "30m" });
    const later = new Date(Date.now() + 31 * 60_000);
    expect((await ownPresence(T, U1, later)).availability).toBe("available");
  });
});

describe("two devices at once", () => {
  it("both writes land in order; neither is lost or torn", async () => {
    await setStatus(T, U1, { availability: "available", message: "hi" }); // rev 1
    const [a, b] = await Promise.all([
      setStatus(T, U1, { availability: "busy" }),
      setStatus(T, U1, { availability: "focusing" }),
    ]);
    expect(a.changed && b.changed).toBe(true);
    const me = await ownPresence(T, U1);
    expect(me.revision).toBe(3);
    // The later write was recomputed on top of the earlier one.
    expect(["busy", "focusing"]).toContain(me.availability);
    expect(me.previous?.availability).toBe(
      me.availability === "busy" ? "focusing" : "busy",
    );
  });
});

describe("who can see whom", () => {
  it("a team member sees teammates but not the rest of the organisation", async () => {
    const viewer = await resolveViewer(T, U2, "employee");
    expect(viewer.orgWide).toBe(false);
    const seen = await visiblePeople(viewer, [U1, U2, U3, X1]);
    expect(seen.map((p) => p.id).sort()).toEqual([U1, U2]);
  });

  it("org-wide viewers still never see another organisation", async () => {
    const viewer = await resolveViewer(T, U3, "hr");
    expect(viewer.orgWide).toBe(true);
    const seen = await visiblePeople(viewer, [U1, U2, U3, X1, "not-an-id"]);
    expect(seen.map((p) => p.id).sort()).toEqual([U1, U2, U3]);
  });

  it("org-wide access comes from the permission, not from a role name", async () => {
    expect((await resolveViewer(T, U3, "manager")).orgWide).toBe(false);
    fake.state.users[2].permissions = ["Presence:view:all"];
    expect((await resolveViewer(T, U3, "manager")).orgWide).toBe(true);
  });
});

describe("people list", () => {
  it("filters by availability, counts every status and lists reachable people first", async () => {
    await touchConnection(T, U2, "sock-1", "active");
    await setStatus(T, U3, { availability: "busy" }); // offline though
    const viewer = await resolveViewer(T, U1, "admin");

    const all = await listPeople(viewer, {
      scope: "organisation",
      page: 1,
      limit: 25,
    });
    expect(all.people.map((p) => p.id)).toEqual([U2, U1, U3]);
    expect(all.counts).toMatchObject({ available: 1, offline: 2 });
    expect(all.people[0].presence.workMode).toBe("remote");

    const offline = await listPeople(viewer, {
      scope: "organisation",
      status: "offline",
      page: 1,
      limit: 25,
    });
    expect(offline.people.map((p) => p.id).sort()).toEqual([U1, U3]);
    // Busy is still what U3 chose, even while offline.
    expect(offline.people.find((p) => p.id === U3)!.presence.availability).toBe(
      "busy",
    );
  });

  it("the team scope only lists the viewer's teams", async () => {
    const viewer = await resolveViewer(T, U2, "employee");
    const r = await listPeople(viewer, { scope: "team", page: 1, limit: 25 });
    expect(r.people.map((p) => p.id).sort()).toEqual([U1, U2]);
  });

  it("shows when an offline person was last active", async () => {
    const at = new Date("2026-11-02T08:00:00.000Z");
    await markLastActive(T, U2, at);
    const viewer = await resolveViewer(T, U1, "admin");
    const r = await listPeople(viewer, { scope: "team", page: 1, limit: 25 });
    expect(r.people.find((p) => p.id === U2)!.presence.lastSeenAt).toBe(
      at.toISOString(),
    );
  });
});
