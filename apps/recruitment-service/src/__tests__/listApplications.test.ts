import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { listApplications } from "../handlers/listApplications";

jest.mock("@hrms/db", () => ({
  prisma: {
    jobApplication: { findMany: jest.fn(), count: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = (prisma as any).jobApplication.findMany as jest.Mock;
const mockCount = (prisma as any).jobApplication.count as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("listApplications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockFindMany.mockResolvedValue([{ id: "app-1", name: "John Doe" }]);
    mockCount.mockResolvedValue(1);
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: [] };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await listApplications(makeCall({}), cb);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("lists applications with default pagination", async () => {
    const cb = makeCallback();
    await listApplications(makeCall({ page: 1, limit: 10 }), cb);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, total: 1 }),
    );
  });

  it("filters by jobTitleId when provided", async () => {
    const cb = makeCallback();
    await listApplications(makeCall({ jobTitleId: "j-1" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.jobTitleId).toBe("j-1");
  });

  it("filters by applicationStatus when provided", async () => {
    const cb = makeCallback();
    await listApplications(makeCall({ applicationStatus: "Shortlisted" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("Shortlisted");
  });

  it("skips status filter when 'all' provided", async () => {
    const cb = makeCallback();
    await listApplications(makeCall({ applicationStatus: "all" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
  });

  it("calculates totalPages correctly", async () => {
    mockCount.mockResolvedValue(15);
    const cb = makeCallback();
    await listApplications(makeCall({ page: 1, limit: 10 }), cb);
    expect(cb.mock.calls[0][1].totalPages).toBe(2);
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await listApplications(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
