import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getLeaves } from "../handlers/getLeaves";

jest.mock("@hrms/db", () => ({
  prisma: {
    leaveApplication: { findMany: jest.fn(), count: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = (prisma as any).leaveApplication.findMany as jest.Mock;
const mockCount = (prisma as any).leaveApplication.count as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const leaveRecord = {
  id: "leave-1",
  username: "john",
  leaveType: "PL",
  from: "2024-03-04",
  to: "2024-03-05",
  days: 2,
  reason: "Personal",
  status: "Pending",
  approvedByUsername: "",
  appliedOn: "2024-03-01",
  sickLeave: false,
  medicalCertificate: "",
  approvedOn: "",
};

describe("getLeaves", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockFindMany.mockResolvedValue([leaveRecord]);
    mockCount.mockResolvedValue(1);
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: [] };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await getLeaves(makeCall({ userId: "john" }), cb);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("fetches all leaves when no filters provided", async () => {
    const cb = makeCallback();
    await getLeaves(makeCall({}), cb);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 10 }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, total: 1 }),
    );
  });

  it("filters by userId when provided", async () => {
    const cb = makeCallback();
    await getLeaves(makeCall({ userId: "john" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.username).toBe("john");
  });

  it("filters by status when provided and not 'all'", async () => {
    const cb = makeCallback();
    await getLeaves(makeCall({ status: "Pending" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("Pending");
  });

  it("does not filter by status when status is 'all'", async () => {
    const cb = makeCallback();
    await getLeaves(makeCall({ status: "all" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
  });

  it("applies pagination correctly", async () => {
    const cb = makeCallback();
    await getLeaves(makeCall({ page: 2, limit: 5 }), cb);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
  });

  it("caches the response", async () => {
    const cb = makeCallback();
    await getLeaves(makeCall({}), cb);
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getLeaves(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
