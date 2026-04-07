import { prisma } from "@hrms/db";
import { listPolicies } from "../handlers/listPolicies";

jest.mock("@hrms/db", () => ({
  prisma: {
    policy: { findMany: jest.fn(), count: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = (prisma as any).policy.findMany as jest.Mock;
const mockCount = (prisma as any).policy.count as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const policyRow = {
  id: "p-1",
  policyName: "Leave Policy",
  content: "Content here",
  policyType: "HR",
  status: "active",
  createdOn: new Date("2024-01-01T12:00:00Z"),
  lastUpdatedOn: new Date("2024-02-01T12:00:00Z"),
};

describe("listPolicies", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindMany.mockResolvedValue([policyRow]);
    mockCount.mockResolvedValue(1);
  });

  it("lists policies with default pagination", async () => {
    const cb = makeCallback();
    await listPolicies(makeCall({ page: 1, limit: 10 }), cb);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, total: 1 }),
    );
  });

  it("maps policyName to title in response", async () => {
    const cb = makeCallback();
    await listPolicies(makeCall({}), cb);
    const policy = cb.mock.calls[0][1].data[0];
    expect(policy.title).toBe("Leave Policy");
    expect(policy.category).toBe("HR");
  });

  it("calculates totalPages correctly", async () => {
    mockCount.mockResolvedValue(20);
    const cb = makeCallback();
    await listPolicies(makeCall({ page: 1, limit: 10 }), cb);
    expect(cb.mock.calls[0][1].totalPages).toBe(2);
  });

  it("excludes deleted policies", async () => {
    const cb = makeCallback();
    await listPolicies(makeCall({}), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "deleted" });
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await listPolicies(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
