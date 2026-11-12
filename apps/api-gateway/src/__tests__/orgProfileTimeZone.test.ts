// PUT/GET /tenants/org-profile — the organisation's time zone (reminders,
// due dates and working hours are computed in it).

jest.mock("@hrms/db", () => {
  const _db = { tenant: { findUnique: jest.fn(), update: jest.fn() } };
  return { prisma: _db, prismaWithTenant: _db };
});

jest.mock("@hrms/common", () => {
  const actual = jest.requireActual("@hrms/common");
  return {
    ...actual,
    apiResponse: jest.fn((res: any, status: number, data: any) =>
      res.json({ status, ...data }),
    ),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock("@hrms/notifications", () => ({ notify: jest.fn() }));
jest.mock("../handlers/salary", () => ({ seedSalaryFromHire: jest.fn() }));
jest.mock("../handlers/payment", () => ({
  fetchPaymentMethod: jest.fn(),
  getRazorpay: jest.fn(),
}));
jest.mock("../services/userAccess", () => ({
  invalidateUserAccess: jest.fn(),
  loadUserAccess: jest.fn(),
  scopeToTenant: jest.fn((a: unknown) => a),
}));

import { prisma } from "@hrms/db";
import { loadUserAccess } from "../services/userAccess";
import { getOrgProfile, updateOrgProfile } from "../handlers/tenant";

const db = prisma as any;
const mockAccess = loadUserAccess as jest.Mock;
const res = () => ({ json: jest.fn() }) as any;
const req = (body: Record<string, unknown> = {}) =>
  ({ user: { userId: "u1", tenantId: "t1" }, body }) as any;

describe("org profile time zone", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue({
      isSuperUser: false,
      permissions: ["Organisation:edit_company_info"],
    });
    db.tenant.update.mockImplementation(async ({ data }: any) => ({
      name: "Acme",
      timeZone: data.timeZone ?? null,
    }));
  });

  it("returns the stored zone with the profile", async () => {
    db.tenant.findUnique.mockResolvedValue({
      name: "Acme",
      timeZone: "Europe/London",
    });
    const r = res();
    await getOrgProfile(req(), r);
    expect(db.tenant.findUnique.mock.calls[0][0].select.timeZone).toBe(true);
    expect(r.json.mock.calls[0][0].data.orgProfile.timeZone).toBe(
      "Europe/London",
    );
  });

  it("saves a valid IANA zone", async () => {
    const r = res();
    await updateOrgProfile(req({ timeZone: "America/New_York" }), r);
    expect(db.tenant.update.mock.calls[0][0].data.timeZone).toBe(
      "America/New_York",
    );
    expect(r.json.mock.calls[0][0].status).toBe(200);
  });

  it.each(["", null])("clears back to the default with %p", async (tz) => {
    await updateOrgProfile(req({ timeZone: tz }), res());
    expect(db.tenant.update.mock.calls[0][0].data.timeZone).toBeNull();
  });

  it.each(["Mars/Olympus", "IST", 42])(
    "rejects %p with 400 and writes nothing",
    async (tz) => {
      const r = res();
      await updateOrgProfile(req({ timeZone: tz }), r);
      expect(r.json.mock.calls[0][0].status).toBe(400);
      expect(db.tenant.update).not.toHaveBeenCalled();
    },
  );

  it("leaves the zone alone when the request doesn't mention it", async () => {
    await updateOrgProfile(req({ website: "https://acme.example" }), res());
    expect(db.tenant.update.mock.calls[0][0].data).not.toHaveProperty(
      "timeZone",
    );
  });

  it("still requires the company-info permission", async () => {
    mockAccess.mockResolvedValue({ isSuperUser: false, permissions: [] });
    const r = res();
    await updateOrgProfile(req({ timeZone: "UTC" }), r);
    expect(r.json.mock.calls[0][0].status).toBe(403);
    expect(db.tenant.update).not.toHaveBeenCalled();
  });
});
