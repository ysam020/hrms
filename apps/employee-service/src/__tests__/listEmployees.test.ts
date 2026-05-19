import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { listEmployees } from "../handlers/listEmployees";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindMany = prisma.user.findMany as jest.Mock;
const mockCount = prisma.user.count as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

describe("listEmployees", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns cached response on cache hit", async () => {
    const cached = {
      message: MESSAGES.EMPLOYEES_LISTED,
      status: status.OK,
      data: [],
      total: 0,
    };
    mockCacheGet.mockResolvedValue(cached);

    const cb = makeCallback();
    await listEmployees(makeCall({}), cb);

    expect(cb).toHaveBeenCalledWith(null, cached);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns paginated employee list with correct totals", async () => {
    const employees = [
      { id: "1", username: "john" },
      { id: "2", username: "jane" },
    ];
    mockFindMany.mockResolvedValue(employees);
    mockCount.mockResolvedValue(25);

    const cb = makeCallback();
    await listEmployees(makeCall({ page: 2, limit: 10 }), cb);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEES_LISTED,
      status: status.OK,
      data: employees,
      total: 25,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
  });

  it("applies department filter when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listEmployees(
      makeCall({ department: "Engineering" }),
      makeCallback(),
    );

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ department: "Engineering" }),
      }),
    );
  });

  it("applies employeeStatus filter when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listEmployees(makeCall({ employeeStatus: "Active" }), makeCallback());

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ employeeStatus: "Active" }),
      }),
    );
  });

  it("applies search filter across multiple fields", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listEmployees(makeCall({ search: "john" }), makeCallback());

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.where.OR).toEqual(
      expect.arrayContaining([
        { first_name: { contains: "john", mode: "insensitive" } },
        { email: { contains: "john", mode: "insensitive" } },
        { username: { contains: "john", mode: "insensitive" } },
      ]),
    );
  });

  it("defaults page=1 and limit=10 when not provided", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const cb = makeCallback();
    await listEmployees(makeCall({}), cb);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
    const result = cb.mock.calls[0][1];
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it("caches the result with employee key", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listEmployees(makeCall({}), makeCallback());

    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining("employees:"),
      expect.objectContaining({ status: status.OK }),
      "employee",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await listEmployees(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
