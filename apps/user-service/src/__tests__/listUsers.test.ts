import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { listUsers } from "../handlers/listUsers";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findMany: jest.fn(), count: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = prisma.user.findMany as jest.Mock;
const mockCount = prisma.user.count as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const userRow = {
  id: "u1",
  email: "john@test.com",
  username: "john",
  role: ["HR"],
  first_name: "John",
  last_name: "Doe",
  mobile: "9876543210",
  department: "HR",
  designation: "Manager",
  employeeStatus: "Active",
  employee_photo: null,
  createdAt: new Date("2024-01-01"),
};

describe("listUsers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockFindMany.mockResolvedValue([userRow]);
    mockCount.mockResolvedValue(1);
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: [] };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await listUsers(makeCall({}), cb);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("fetches users with default pagination", async () => {
    const cb = makeCallback();
    await listUsers(makeCall({ page: 1, limit: 10 }), cb);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, total: 1 }),
    );
  });

  it("applies search filter when provided", async () => {
    const cb = makeCallback();
    await listUsers(makeCall({ search: "john" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
  });

  it("filters by role when provided", async () => {
    const cb = makeCallback();
    await listUsers(makeCall({ role: "HR" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.role).toEqual({ has: "HR" });
  });

  it("filters by department when provided", async () => {
    const cb = makeCallback();
    await listUsers(makeCall({ department: "Engineering" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.department).toBe("Engineering");
  });

  it("maps role array to comma-separated string in response", async () => {
    const cb = makeCallback();
    await listUsers(makeCall({}), cb);
    const user = cb.mock.calls[0][1].data[0];
    expect(user.role).toBe("HR");
  });

  it("computes correct totalPages", async () => {
    mockCount.mockResolvedValue(25);
    const cb = makeCallback();
    await listUsers(makeCall({ page: 1, limit: 10 }), cb);
    expect(cb.mock.calls[0][1].totalPages).toBe(3);
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await listUsers(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
