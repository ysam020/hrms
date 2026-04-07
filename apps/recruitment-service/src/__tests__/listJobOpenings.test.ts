import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { listJobOpenings } from "../handlers/listJobOpenings";

jest.mock("@hrms/db", () => ({
  prisma: {
    jobOpening: { findMany: jest.fn(), count: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = (prisma as any).jobOpening.findMany as jest.Mock;
const mockCount = (prisma as any).jobOpening.count as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const jobRow = {
  id: "j-1",
  jobTitle: "Software Engineer",
  numberOfVacancies: 2,
  jobPostingDate: new Date("2024-01-01"),
  applicationDeadline: new Date("2024-03-01"),
  jobDescription: "SWE role",
  requiredSkills: "TypeScript",
  experience: 3,
  budget: [80000, 120000],
  department: "Engineering",
  hiringManager: "Alice",
  candidatesHired: 0,
  status: "open",
  createdBy: "admin",
  createdOn: new Date("2024-01-01"),
};

describe("listJobOpenings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockFindMany.mockResolvedValue([jobRow]);
    mockCount.mockResolvedValue(1);
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: [] };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await listJobOpenings(makeCall({}), cb);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("lists job openings with default pagination", async () => {
    const cb = makeCallback();
    await listJobOpenings(makeCall({ page: 1, limit: 10 }), cb);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, total: 1 }),
    );
  });

  it("filters by status when provided", async () => {
    const cb = makeCallback();
    await listJobOpenings(makeCall({ jobStatus: "open" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("open");
  });

  it("applies search filter", async () => {
    const cb = makeCallback();
    await listJobOpenings(makeCall({ search: "engineer" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
  });

  it("caches the response", async () => {
    const cb = makeCallback();
    await listJobOpenings(makeCall({}), cb);
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining("jobOpenings:"),
      expect.any(Object),
      "recruitment",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await listJobOpenings(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
