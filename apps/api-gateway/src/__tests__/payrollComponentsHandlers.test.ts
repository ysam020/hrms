import { prismaWithTenant as prisma } from "@hrms/db";
import { listSalaryComponents } from "../handlers/payrollComponents";

jest.mock("@hrms/db", () => {
  const _db = {
    salaryComponentDefinition: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  return { prisma: _db, prismaWithTenant: _db };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: { SUCCESS: 200, FORBIDDEN: 403 },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../utils/user", () => ({
  isSuperUser: jest.fn().mockResolvedValue(false),
}));

const mockFindFirst = (prisma as any).salaryComponentDefinition
  .findFirst as jest.Mock;
const mockFindMany = (prisma as any).salaryComponentDefinition
  .findMany as jest.Mock;
const mockUpsert = (prisma as any).salaryComponentDefinition
  .upsert as jest.Mock;

const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "u1", tenantId: "t1", tenantRole: "admin" },
    body: {},
    query: {},
    params: {},
    ...overrides,
  }) as any;
const makeRes = () => ({ json: jest.fn() }) as any;

describe("listSalaryComponents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsert.mockResolvedValue({});
    mockFindMany.mockResolvedValue([]);
  });

  it("seeds the six standard components on first read for a tenant with none configured", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = makeRes();
    await listSalaryComponents(makeReq(), res);

    expect(mockUpsert).toHaveBeenCalledTimes(6);
    const codes = mockUpsert.mock.calls.map(
      (call) => call[0].create.code,
    );
    expect(codes.sort()).toEqual(
      ["BASIC", "CONVEYANCE", "ESI", "HRA", "PF", "PT"].sort(),
    );

    const pfCall = mockUpsert.mock.calls.find(
      (call) => call[0].create.code === "PF",
    );
    expect(pfCall[0]).toEqual(
      expect.objectContaining({
        where: { tenantId_code: { tenantId: "t1", code: "PF" } },
      }),
    );
    expect(pfCall[0].create).toEqual(
      expect.objectContaining({
        tenantId: "t1",
        createdBy: "u1",
        calcType: "percent_of_basic",
        percentOf: "basic",
        percentValue: 12,
        isStatutory: true,
      }),
    );

    const esiCall = mockUpsert.mock.calls.find(
      (call) => call[0].create.code === "ESI",
    );
    expect(esiCall[0].create).toEqual(
      expect.objectContaining({
        percentOf: "gross",
        percentValue: 1.75, // matches calcStatutoryDeductions' authoritative default
        isStatutory: true,
      }),
    );

    const ptCall = mockUpsert.mock.calls.find(
      (call) => call[0].create.code === "PT",
    );
    expect(ptCall[0].create).toEqual(
      expect.objectContaining({
        calcType: "fixed",
        percentValue: 200,
        isStatutory: true,
      }),
    );
  });

  it("does not re-seed when the tenant already has at least one configured component", async () => {
    mockFindFirst.mockResolvedValue({ id: "existing-1" });
    const res = makeRes();
    await listSalaryComponents(makeReq(), res);

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns FORBIDDEN when the request has no active tenant", async () => {
    const res = makeRes();
    await listSalaryComponents(makeReq({ user: { userId: "u1" } }), res);

    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
