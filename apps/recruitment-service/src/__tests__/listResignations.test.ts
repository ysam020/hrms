import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { listResignations } from "../handlers/listResignations";

jest.mock("@hrms/db", () => ({
  prisma: {
    resignation: { findMany: jest.fn(), count: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = (prisma as any).resignation.findMany as jest.Mock;
const mockCount = (prisma as any).resignation.count as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const resignationRow = {
  id: "res-1",
  username: "john",
  reason: "personal",
  rejectionReason: null,
  resignationDate: "2024-03-01",
  submittedOn: new Date("2024-03-01"),
  lastWorkingDay: new Date("2024-03-31"),
  lastDate: "2024-03-31",
  status: "Submitted",
};

describe("listResignations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockFindMany.mockResolvedValue([resignationRow]);
    mockCount.mockResolvedValue(1);
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: [] };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await listResignations(makeCall({}), cb);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("lists resignations with default pagination", async () => {
    const cb = makeCallback();
    await listResignations(makeCall({ page: 1, limit: 10 }), cb);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, totalCount: 1 }),
    );
  });

  it("filters by userId when provided", async () => {
    const cb = makeCallback();
    await listResignations(makeCall({ userId: "john" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.userId).toBe("john");
  });

  it("filters by status when provided", async () => {
    const cb = makeCallback();
    await listResignations(makeCall({ status: "Submitted" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("Submitted");
  });

  it("caches the response", async () => {
    const cb = makeCallback();
    await listResignations(makeCall({}), cb);
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining("resignations:"),
      expect.any(Object),
      "resignation",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await listResignations(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
