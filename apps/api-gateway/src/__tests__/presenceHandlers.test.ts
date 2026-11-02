jest.mock("@hrms/db", () => ({ getTenantId: jest.fn(() => "tenant-a") }));
jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: { SUCCESS: 200, BAD_REQUEST: 400, FORBIDDEN: 403 },
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock("../utils/handleError", () => ({
  handleError: jest.fn((res: any) => res.json({ status: 500 })),
}));
jest.mock("../services/presenceConnectivity", () => ({ HEARTBEAT_MS: 25_000 }));
jest.mock("../services/presence", () => ({
  setStatus: jest.fn(async () => ({
    presence: { availability: "busy" },
    changed: true,
  })),
  ownPresence: jest.fn(async () => ({ availability: "available" })),
  resolveViewer: jest.fn(),
  listPeople: jest.fn(async () => ({
    people: [],
    counts: {},
    total: 0,
    truncated: false,
  })),
  visiblePeople: jest.fn(async () => []),
  viewsFor: jest.fn(async () => new Map()),
  restoreStatus: jest.fn(),
  clearMessage: jest.fn(),
}));

import * as svc from "../services/presence";
import {
  getMyPresence,
  getPresencePeople,
  idleAfterSeconds,
  updateMyPresence,
} from "../handlers/presence";

const req = (extra: any = {}) =>
  ({
    body: {},
    query: {},
    user: { userId: "user-1", tenantId: "tenant-a", tenantRole: "employee" },
    ...extra,
  }) as any;
const res = () => {
  const r: any = {};
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

it("changes only the signed-in person's status, with a cleaned message", async () => {
  const r = res();
  await updateMyPresence(
    req({
      body: { availability: "busy", message: "  On a call\n", duration: "1h" },
    }),
    r,
  );
  expect(svc.setStatus).toHaveBeenCalledWith("tenant-a", "user-1", {
    availability: "busy",
    message: "On a call",
    duration: "1h",
    timeZone: undefined,
  });
  expect(r.json.mock.calls[0][0]).toMatchObject({ status: 200 });
});

it("refuses the organisation-wide list without org-wide access", async () => {
  (svc.resolveViewer as jest.Mock).mockResolvedValue({
    orgWide: false,
    teammates: new Set(["u2"]),
  });
  const r = res();
  await getPresencePeople(
    req({ query: { scope: "organisation", page: 1, limit: 25 } }),
    r,
  );
  expect(r.json.mock.calls[0][0].status).toBe(403);
  expect(svc.listPeople).not.toHaveBeenCalled();
});

it("lists the team and says which scopes the caller has", async () => {
  (svc.resolveViewer as jest.Mock).mockResolvedValue({
    orgWide: false,
    teammates: new Set(["u2"]),
  });
  const r = res();
  await getPresencePeople(
    req({ query: { scope: "team", page: 1, limit: 25 } }),
    r,
  );
  expect(r.json.mock.calls[0][0].data.scopes).toEqual({
    team: true,
    organisation: false,
  });
});

it("returns the client settings with the person's own status", async () => {
  const r = res();
  await getMyPresence(req(), r);
  expect(r.json.mock.calls[0][0].data.config).toEqual({
    idleAfterSeconds: 300,
    heartbeatSeconds: 25,
  });
});

it("reads the idle threshold from the environment within bounds", () => {
  process.env.PRESENCE_IDLE_SECONDS = "600";
  expect(idleAfterSeconds()).toBe(600);
  process.env.PRESENCE_IDLE_SECONDS = "5";
  expect(idleAfterSeconds()).toBe(300);
  delete process.env.PRESENCE_IDLE_SECONDS;
});
