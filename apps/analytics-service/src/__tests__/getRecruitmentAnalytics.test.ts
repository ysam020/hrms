import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getRecruitmentAnalytics } from "../handlers/getRecruitmentAnalytics";

jest.mock("@hrms/db", () => ({
  prisma: {
    jobApplication: { findMany: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = (prisma as any).jobApplication.findMany as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("getRecruitmentAnalytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: [], total: 0 };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await getRecruitmentAnalytics(makeCall({}), cb);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("groups applications by status", async () => {
    mockFindMany.mockResolvedValue([
      { status: "Applied" },
      { status: "Applied" },
      { status: "Hired" },
    ]);
    const cb = makeCallback();
    await getRecruitmentAnalytics(makeCall({}), cb);
    const { data, total } = cb.mock.calls[0][1];
    expect(total).toBe(3);
    const applied = data.find((d: any) => d.label === "Applied");
    const hired = data.find((d: any) => d.label === "Hired");
    expect(applied.value).toBe(2);
    expect(hired.value).toBe(1);
  });

  it("caches the response", async () => {
    mockFindMany.mockResolvedValue([]);
    const cb = makeCallback();
    await getRecruitmentAnalytics(makeCall({}), cb);
    expect(mockCacheSet).toHaveBeenCalledWith(
      "analytics:recruitment",
      expect.any(Object),
      "analytics",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getRecruitmentAnalytics(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
