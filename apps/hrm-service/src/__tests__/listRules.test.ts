import { prisma } from "@hrms/db";
import { listRules } from "../handlers/listRules";

jest.mock("@hrms/db", () => {
  const _db = {
    rule: { findMany: jest.fn(), count: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = (prisma as any).rule.findMany as jest.Mock;
const mockCount = (prisma as any).rule.count as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("listRules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindMany.mockResolvedValue([{ id: "r-1", name: "Rule A" }]);
    mockCount.mockResolvedValue(1);
  });

  it("lists rules with default pagination", async () => {
    const cb = makeCallback();
    await listRules(makeCall({ page: 1, limit: 10 }), cb);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, total: 1 }),
    );
  });

  it("filters by category when provided", async () => {
    const cb = makeCallback();
    await listRules(makeCall({ category: "hr" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.category).toBe("hr");
  });

  it("filters by ruleStatus when provided", async () => {
    const cb = makeCallback();
    await listRules(makeCall({ ruleStatus: "active" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("active");
  });

  it("calculates totalPages correctly", async () => {
    mockCount.mockResolvedValue(25);
    const cb = makeCallback();
    await listRules(makeCall({ page: 1, limit: 10 }), cb);
    expect(cb.mock.calls[0][1].totalPages).toBe(3);
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await listRules(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
