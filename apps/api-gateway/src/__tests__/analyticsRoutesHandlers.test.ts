import { prisma } from "@hrms/db";
import {
  getEmploymentTypeBreakdown,
  getEmployeeStatusDistribution,
  getAgeDistribution,
  getAttendanceTrends,
  getLeaveApprovalRate,
  getLeaveTypeBreakdown,
  getApplicationsByJobRole,
  getHiringFunnel,
  getHiringManagerPerformance,
  getSalaryBands,
  getCompensationBreakdown,
  getSalaryDistributionByDepartment,
} from "../handlers/analyticsRoutes";

jest.mock("@hrms/db", () => {
  const _db = {
    user: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    leaveApplication: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    attendanceRecord: {
      findMany: jest.fn(),
      aggregateRaw: jest.fn(),
    },
    jobOpening: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    salaryStructure: {
      findMany: jest.fn(),
      aggregateRaw: jest.fn(),
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

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { cacheManager } from "@hrms/cache";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

const mockGet = cacheManager.get as jest.Mock;
const mockSet = cacheManager.set as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;

const mockUserCount = prisma.user.count as jest.Mock;
const mockUserGroupBy = prisma.user.groupBy as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockUserAggregate = prisma.user.aggregate as jest.Mock;
const mockLeaveCount = prisma.leaveApplication.count as jest.Mock;
const mockLeaveGroupBy = prisma.leaveApplication.groupBy as jest.Mock;
const mockLeaveFindMany = prisma.leaveApplication.findMany as jest.Mock;
const mockAttendanceFindMany = prisma.attendanceRecord.findMany as jest.Mock;
const mockJobCount = prisma.jobOpening.count as jest.Mock;
const mockJobGroupBy = prisma.jobOpening.groupBy as jest.Mock;
const mockStructureFindMany = (prisma as any).salaryStructure
  .findMany as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = () => ({ query: {}, params: {}, body: {} }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue(null); // cache miss by default
  mockSet.mockResolvedValue(undefined);
});

// ─── getEmploymentTypeBreakdown ──────────────────────────────────────────────

describe("getEmploymentTypeBreakdown", () => {
  it("returns cached data without hitting the DB", async () => {
    const cached = { wfhCount: 5, officeCount: 10, totalEmployees: 15 };
    mockGet.mockResolvedValue(cached);
    const res = makeRes();
    await getEmploymentTypeBreakdown(makeReq(), res);
    expect(mockUserCount).not.toHaveBeenCalled();
    expect(mockApiResponse).toHaveBeenCalledWith(res, RESPONSE_STATUS.SUCCESS, {
      message: "Employment type breakdown retrieved",
      data: cached,
    });
  });

  it("queries DB on cache miss and returns computed counts", async () => {
    mockUserCount.mockResolvedValueOnce(20).mockResolvedValueOnce(5);
    const res = makeRes();
    await getEmploymentTypeBreakdown(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(res, RESPONSE_STATUS.SUCCESS, {
      message: "Employment type breakdown retrieved",
      data: { wfhCount: 5, officeCount: 15, totalEmployees: 20 },
    });
    expect(mockSet).toHaveBeenCalled();
  });

  it("returns 500 on DB error", async () => {
    mockUserCount.mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getEmploymentTypeBreakdown(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      {
        message: "Internal Server Error",
      },
    );
  });
});

// ─── getEmployeeStatusDistribution ──────────────────────────────────────────

describe("getEmployeeStatusDistribution", () => {
  it("returns cached data without hitting the DB", async () => {
    const cached = [{ _id: "Active", count: 50 }];
    mockGet.mockResolvedValue(cached);
    const res = makeRes();
    await getEmployeeStatusDistribution(makeReq(), res);
    expect(mockUserGroupBy).not.toHaveBeenCalled();
    expect(mockApiResponse).toHaveBeenCalledWith(res, RESPONSE_STATUS.SUCCESS, {
      message: "Employee status distribution retrieved",
      data: cached,
    });
  });

  it("maps groupBy result to {_id, count} sorted by count desc", async () => {
    mockUserGroupBy.mockResolvedValue([
      { employeeStatus: "Active", _count: { id: 40 } },
      { employeeStatus: "Inactive", _count: { id: 10 } },
    ]);
    const res = makeRes();
    await getEmployeeStatusDistribution(makeReq(), res);
    const call = mockApiResponse.mock.calls[0];
    expect(call[2].data[0]).toEqual({ _id: "Active", count: 40 });
    expect(call[2].data[1]).toEqual({ _id: "Inactive", count: 10 });
  });

  it("returns 500 on DB error", async () => {
    mockUserGroupBy.mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getEmployeeStatusDistribution(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      {
        message: "Internal Server Error",
      },
    );
  });
});

// ─── getAgeDistribution ──────────────────────────────────────────────────────

describe("getAgeDistribution", () => {
  it("buckets users into the correct age ranges", async () => {
    // aggregateRaw returns MongoDB $bucket output: _id is the bucket boundary
    (prisma.user as any).aggregateRaw = jest.fn().mockResolvedValue([
      { _id: 0, count: 1 }, // <25
      { _id: 25, count: 2 }, // 25-34
      { _id: 35, count: 1 }, // 35-44
      { _id: "55+", count: 1 }, // 55+ (default bucket)
    ]);
    const res = makeRes();
    await getAgeDistribution(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    const byBucket = Object.fromEntries(data.map((d: any) => [d._id, d.count]));
    expect(byBucket["<25"]).toBe(1);
    expect(byBucket["25-34"]).toBe(2);
    expect(byBucket["35-44"]).toBe(1);
    expect(byBucket["55+"]).toBe(1);
    expect(byBucket["45-54"]).toBe(0); // empty bucket still present
  });

  it("returns all buckets with zero count when aggregateRaw returns empty", async () => {
    (prisma.user as any).aggregateRaw = jest.fn().mockResolvedValue([]);
    const res = makeRes();
    await getAgeDistribution(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    expect(data).toHaveLength(5);
    expect(data.every((d: any) => d.count === 0)).toBe(true);
  });

  it("returns 500 on DB error", async () => {
    (prisma.user as any).aggregateRaw = jest
      .fn()
      .mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getAgeDistribution(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      {
        message: "Internal Server Error",
      },
    );
  });
});

// ─── getAttendanceTrends ─────────────────────────────────────────────────────

describe("getAttendanceTrends", () => {
  it("returns cached data without querying DB", async () => {
    mockGet.mockResolvedValue([
      { _id: { year: 2025, month: 1 }, attendanceRate: 90 },
    ]);
    const res = makeRes();
    await getAttendanceTrends(makeReq(), res);
    expect(
      (prisma.attendanceRecord as any).aggregateRaw,
    ).not.toHaveBeenCalled();
  });

  it("calculates attendanceRate correctly from aggregateRaw result", async () => {
    // aggregateRaw returns MongoDB $group output: total, present, hours per month
    (prisma.attendanceRecord as any).aggregateRaw = jest
      .fn()
      .mockResolvedValue([
        { _id: { year: 2025, month: 1 }, total: 3, present: 2, hours: 15 },
      ]);
    const res = makeRes();
    await getAttendanceTrends(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    const jan = data.find((d: any) => d._id.month === 1);
    expect(jan).toBeDefined();
    // 2 present out of 3 total = 66.7%
    expect(jan.attendanceRate).toBeCloseTo(66.7, 0);
    expect(jan.avgWorkingHours).toBeCloseTo(5, 0);
  });

  it("returns 500 on DB error", async () => {
    (prisma.attendanceRecord as any).aggregateRaw = jest
      .fn()
      .mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getAttendanceTrends(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      {
        message: "Internal Server Error",
      },
    );
  });
});

// ─── getLeaveApprovalRate ────────────────────────────────────────────────────

describe("getLeaveApprovalRate", () => {
  it("computes approvalRate as percentage of approved/total", async () => {
    mockLeaveCount
      .mockResolvedValueOnce(80) // approved
      .mockResolvedValueOnce(10) // pending
      .mockResolvedValueOnce(10) // rejected
      .mockResolvedValueOnce(100); // total
    const res = makeRes();
    await getLeaveApprovalRate(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    expect(data.approvalRate).toBe(80);
    expect(data.total).toBe(100);
  });

  it("returns zero rates when total is 0", async () => {
    mockLeaveCount.mockResolvedValue(0);
    const res = makeRes();
    await getLeaveApprovalRate(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    expect(data.approvalRate).toBe(0);
  });

  it("returns 500 on DB error", async () => {
    mockLeaveCount.mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getLeaveApprovalRate(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      {
        message: "Internal Server Error",
      },
    );
  });
});

// ─── getLeaveTypeBreakdown ───────────────────────────────────────────────────

describe("getLeaveTypeBreakdown", () => {
  it("maps groupBy result with rounded totalDays", async () => {
    mockLeaveGroupBy.mockResolvedValue([
      { leaveType: "PL", _count: { id: 30 }, _sum: { days: 45.7 } },
      { leaveType: "LWP", _count: { id: 5 }, _sum: { days: 5 } },
    ]);
    const res = makeRes();
    await getLeaveTypeBreakdown(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    const pl = data.find((d: any) => d._id === "PL");
    expect(pl.count).toBe(30);
    expect(pl.totalDays).toBe(46);
  });

  it("returns 500 on DB error", async () => {
    mockLeaveGroupBy.mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getLeaveTypeBreakdown(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      {
        message: "Internal Server Error",
      },
    );
  });
});

// ─── getApplicationsByJobRole ────────────────────────────────────────────────

describe("getApplicationsByJobRole", () => {
  it("aggregates status counts per jobTitle", async () => {
    mockJobGroupBy.mockResolvedValue([
      { jobTitle: "Engineer", status: "shortlisted", _count: { _all: 5 } },
      { jobTitle: "Engineer", status: "hired", _count: { _all: 3 } },
      { jobTitle: "Designer", status: "interviewed", _count: { _all: 2 } },
    ]);
    const res = makeRes();
    await getApplicationsByJobRole(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    const eng = data.find((d: any) => d.jobTitle === "Engineer");
    expect(eng.totalApplications).toBe(8);
    expect(eng.shortlisted).toBe(5);
    expect(eng.hired).toBe(3);
    const des = data.find((d: any) => d.jobTitle === "Designer");
    expect(des.interviewed).toBe(2);
  });

  it("returns 500 on DB error", async () => {
    mockJobGroupBy.mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getApplicationsByJobRole(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      {
        message: "Internal Server Error",
      },
    );
  });
});

// ─── getHiringFunnel ─────────────────────────────────────────────────────────

describe("getHiringFunnel", () => {
  it("computes funnel rates correctly", async () => {
    mockJobCount
      .mockResolvedValueOnce(100) // applied
      .mockResolvedValueOnce(50) // shortlisted
      .mockResolvedValueOnce(25) // interviewed
      .mockResolvedValueOnce(10) // offered
      .mockResolvedValueOnce(8); // hired
    const res = makeRes();
    await getHiringFunnel(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    expect(data.applied).toBe(100);
    expect(data.shortlistRate).toBe(50);
    expect(data.interviewRate).toBe(50);
    expect(data.offerRate).toBe(40);
    expect(data.hireRate).toBe(80);
  });

  it("returns 500 on DB error", async () => {
    mockJobCount.mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getHiringFunnel(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      {
        message: "Internal Server Error",
      },
    );
  });
});

// ─── getHiringManagerPerformance ─────────────────────────────────────────────

describe("getHiringManagerPerformance", () => {
  it("computes successRate per manager", async () => {
    mockJobGroupBy.mockResolvedValue([
      { hiringManager: "alice", status: "closed", _count: { _all: 4 } },
      { hiringManager: "alice", status: "open", _count: { _all: 6 } },
    ]);
    const res = makeRes();
    await getHiringManagerPerformance(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    const alice = data.find((d: any) => d.hiringManager === "alice");
    expect(alice.totalJobs).toBe(10);
    expect(alice.closedJobs).toBe(4);
    expect(alice.successRate).toBe(40);
  });

  it("skips entries with null hiringManager", async () => {
    mockJobGroupBy.mockResolvedValue([
      { hiringManager: null, status: "open", _count: { _all: 3 } },
    ]);
    const res = makeRes();
    await getHiringManagerPerformance(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    expect(data).toHaveLength(0);
  });

  it("returns 500 on DB error", async () => {
    mockJobGroupBy.mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getHiringManagerPerformance(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      {
        message: "Internal Server Error",
      },
    );
  });
});

// ─── getSalaryBands ───────────────────────────────────────────────────────────

describe("getSalaryBands", () => {
  it("maps aggregateRaw result with label lookup", async () => {
    const aggregateRawMock = jest.fn().mockResolvedValue([
      { _id: 0, count: 10, avgSalary: 15000 },
      { _id: 20000, count: 20, avgSalary: 30000 },
      { _id: "100K+", count: 5, avgSalary: 150000 },
    ]);
    (prisma as any).salaryStructure.aggregateRaw = aggregateRawMock;

    const res = makeRes();
    await getSalaryBands(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    const low = data.find((d: any) => d.range === "<20K");
    const mid = data.find((d: any) => d.range === "20-40K");
    const high = data.find((d: any) => d.range === "100K+");
    expect(low.count).toBe(10);
    expect(mid.avgSalary).toBe(30000);
    expect(high.count).toBe(5);
  });

  it("returns 500 when aggregateRaw throws", async () => {
    (prisma as any).salaryStructure.aggregateRaw = jest
      .fn()
      .mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getSalaryBands(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      {
        message: "Internal Server Error",
      },
    );
  });
});

// ─── getCompensationBreakdown ─────────────────────────────────────────────────

describe("getCompensationBreakdown", () => {
  it("rounds avg salary components and returns employeeCount", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "u1" }]);
    mockStructureFindMany.mockResolvedValue([
      {
        userId: "u1",
        basicPay: 20000.6,
        hra: 5000.1,
        conveyance: 1500,
        pf: 2400,
        esi: 750,
        pt: 200,
      },
    ]);
    const res = makeRes();
    await getCompensationBreakdown(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    expect(data.employeeCount).toBe(1);
    expect(data.avgBasicPay).toBe(20001);
    expect(data.avgHRA).toBe(5000);
  });

  it("returns 500 on DB error", async () => {
    mockUserFindMany.mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getCompensationBreakdown(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      {
        message: "Internal Server Error",
      },
    );
  });
});

// ─── getSalaryDistributionByDepartment ───────────────────────────────────────

describe("getSalaryDistributionByDepartment", () => {
  it("groups by department and computes min/max/avg salary stats", async () => {
    mockUserFindMany.mockResolvedValue([
      { id: "u1", department: "Engineering" },
      { id: "u2", department: "Engineering" },
    ]);
    mockStructureFindMany.mockResolvedValue([
      { userId: "u1", grossEarnings: 80000 },
      { userId: "u2", grossEarnings: 90000 },
    ]);
    const res = makeRes();
    await getSalaryDistributionByDepartment(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    expect(data[0].department).toBe("Engineering");
    expect(data[0].minSalary).toBe(80000);
    expect(data[0].maxSalary).toBe(90000);
    expect(data[0].avgSalary).toBe(85000);
    expect(data[0].employeeCount).toBe(2);
  });

  it("skips a user with no salary structure and one with a null department", async () => {
    mockUserFindMany.mockResolvedValue([
      { id: "u1", department: null },
      { id: "u2", department: "Sales" },
    ]);
    // u2 has no SalaryStructure row at all.
    mockStructureFindMany.mockResolvedValue([]);
    const res = makeRes();
    await getSalaryDistributionByDepartment(makeReq(), res);
    const { data } = mockApiResponse.mock.calls[0][2];
    expect(data).toHaveLength(0);
  });

  it("returns 500 on DB error", async () => {
    mockUserFindMany.mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getSalaryDistributionByDepartment(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      {
        message: "Internal Server Error",
      },
    );
  });
});
