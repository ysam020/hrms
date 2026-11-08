import type { Response } from "express";

const offer = { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() };
const applicationStageEvent = { findMany: jest.fn() };

jest.mock("@hrms/db", () => ({
  prismaWithTenant: {
    offer: {
      findMany: (...a: unknown[]) => offer.findMany(...a),
      findFirst: (...a: unknown[]) => offer.findFirst(...a),
      update: (...a: unknown[]) => offer.update(...a),
    },
    applicationStageEvent: {
      findMany: (...a: unknown[]) => applicationStageEvent.findMany(...a),
    },
  },
}));
jest.mock("@hrms/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const isSuperUser = jest.fn();
jest.mock("../utils/user", () => ({
  isSuperUser: (...a: unknown[]) => isSuperUser(...a),
}));

import {
  listOffers,
  updateOfferStatus,
  listApplicationStageEvents,
} from "../handlers/applicationStages";

const TENANT = "65f000000000000000000001";
const res = () => {
  const r = {} as Response & { statusCode: number; body: any };
  r.status = jest.fn((c: number) => {
    r.statusCode = c;
    return r;
  }) as any;
  r.json = jest.fn((b: unknown) => {
    r.body = b;
    return r;
  }) as any;
  return r;
};
const req = (tenantRole: string, extra: object = {}) =>
  ({
    user: { userId: "u1", tenantId: TENANT, tenantRole },
    params: { id: "app-or-offer" },
    body: {},
    ...extra,
  }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  isSuperUser.mockResolvedValue(false);
});

describe.each([
  ["listOffers", listOffers],
  ["listApplicationStageEvents", listApplicationStageEvents],
  ["updateOfferStatus", updateOfferStatus],
])("%s", (_name, handler) => {
  it.each(["employee", "manager", "", "EMPLOYEE"])(
    "refuses tenant role %p and touches no data",
    async (role) => {
      const r = res();
      await handler(req(role, { body: { status: "Accepted" } }), r);
      expect(r.statusCode).toBe(403);
      expect(offer.findMany).not.toHaveBeenCalled();
      expect(offer.findFirst).not.toHaveBeenCalled();
      expect(offer.update).not.toHaveBeenCalled();
      expect(applicationStageEvent.findMany).not.toHaveBeenCalled();
    },
  );

  it("refuses a caller with no active tenant", async () => {
    const r = res();
    const q = req("owner");
    q.user.tenantId = null;
    await handler(q, r);
    expect(r.statusCode).toBe(403);
    expect(offer.findMany).not.toHaveBeenCalled();
  });
});

describe("authorized callers", () => {
  it.each(["owner", "admin", "hr"])("%s can list offers", async (role) => {
    offer.findMany.mockResolvedValue([{ id: "o1", offeredCTC: 1 }]);
    const r = res();
    await listOffers(req(role), r);
    expect(r.statusCode).toBe(200);
    expect(offer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, applicationId: "app-or-offer" },
      }),
    );
  });

  it("a superuser without an HR role can list offers", async () => {
    isSuperUser.mockResolvedValue(true);
    offer.findMany.mockResolvedValue([]);
    const r = res();
    await listOffers(req("employee"), r);
    expect(r.statusCode).toBe(200);
  });

  it("scopes the offer lookup to the caller's tenant before updating", async () => {
    offer.findFirst.mockResolvedValue(null);
    const r = res();
    await updateOfferStatus(req("hr", { body: { status: "Sent" } }), r);
    expect(offer.findFirst).toHaveBeenCalledWith({
      where: { id: "app-or-offer", tenantId: TENANT },
    });
    expect(r.statusCode).toBe(404);
    expect(offer.update).not.toHaveBeenCalled();
  });
});
