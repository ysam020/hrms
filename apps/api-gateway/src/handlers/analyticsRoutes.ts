import { Request, Response } from "express";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { cacheManager } from "@hrms/cache";
import { handleError } from "../utils/handleError";

export async function getEmploymentTypeBreakdown(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:employment-type`;
    const cached = await cacheManager.get<any>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Employment type breakdown retrieved",
        data: cached,
      });

    const where: any = { employeeStatus: "Active" };
    const [total, wfh] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.count({ where: { ...where, wfh: true } }),
    ]);
    const data = {
      wfhCount: wfh,
      officeCount: total - wfh,
      totalEmployees: total,
    };
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Employment type breakdown retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-employment-type-breakdown error:", { error });
    return handleError(res, error);
  }
}

export async function getEmployeeStatusDistribution(
  _req: Request,
  res: Response,
) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:employee-status`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Employee status distribution retrieved",
        data: cached,
      });

    const groups = await prisma.user.groupBy({
      by: ["employeeStatus"],
      _count: { id: true },
    });
    const data = groups
      .map((g: any) => ({
        _id: g.employeeStatus || "Unknown",
        count: g._count.id,
      }))
      .sort((a: any, b: any) => b.count - a.count);
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Employee status distribution retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-employee-status-distribution error:", { error });
    return handleError(res, error);
  }
}

export async function getEmployeeDepartments(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:employee-departments`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Employee departments retrieved",
        data: cached,
      });

    const groups = await prisma.user.groupBy({
      by: ["department"],
      where: { employeeStatus: "Active", NOT: { department: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
    const data = groups
      .filter((g: any) => g.department)
      .map((g: any) => ({ _id: g.department!, count: g._count.id }));
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Employee departments retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-employee-departments error:", { error });
    return handleError(res, error);
  }
}

export async function getEmployeeDesignations(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:employee-designations`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Employee designations retrieved",
        data: cached,
      });

    const groups = await prisma.user.groupBy({
      by: ["designation"],
      where: { employeeStatus: "Active", NOT: { designation: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
    const data = groups
      .filter((g: any) => g.designation)
      .map((g: any) => ({ _id: g.designation!, count: g._count.id }));
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Employee designations retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-employee-designations error:", { error });
    return handleError(res, error);
  }
}

export async function getAgeDistribution(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:age-distribution`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Age distribution retrieved",
        data: cached,
      });

    // aggregateRaw bypasses the tenant-scoping $extends middleware entirely —
    // unlike findMany/count/etc, it must be filtered by hand, and a missing
    // tenantId here would otherwise silently aggregate across every tenant.
    if (tenantId === "global") {
      logger.error("analytics error: no tenant context on request");
      return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
        message: "Internal Server Error",
      });
    }
    const tenantIdMatch = { tenantId: { $oid: tenantId } };
    const bucketResult = await (prisma.user as any).aggregateRaw({
      pipeline: [
        { $match: { ...tenantIdMatch, dob: { $ne: null } } },
        {
          $addFields: {
            joiningDateParsed: {
              $dateFromString: { dateString: "$dob", onError: null },
            },
          },
        },
        { $match: { joiningDateParsed: { $ne: null } } },
        {
          $addFields: {
            ageYears: {
              $subtract: [{ $year: "$$NOW" }, { $year: "$joiningDateParsed" }],
            },
          },
        },
        {
          $bucket: {
            groupBy: "$ageYears",
            boundaries: [0, 25, 35, 45, 55],
            default: "55+",
            output: { count: { $sum: 1 } },
          },
        },
      ],
    });
    const ageLabel: Record<string | number, string> = {
      0: "<25",
      25: "25-34",
      35: "35-44",
      45: "45-54",
      "55+": "55+",
    };
    const ageCount: Record<string, number> = {};
    for (const b of bucketResult as any[]) {
      ageCount[ageLabel[b._id] ?? String(b._id)] = b.count;
    }
    const data = ["<25", "25-34", "35-44", "45-54", "55+"].map((_id) => ({
      _id,
      count: ageCount[_id] ?? 0,
    }));
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Age distribution retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-age-distribution error:", { error });
    return handleError(res, error);
  }
}

export async function getJoiningData(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:joining-data`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Joining data retrieved",
        data: cached,
      });

    // aggregateRaw bypasses the tenant-scoping $extends middleware entirely —
    // unlike findMany/count/etc, it must be filtered by hand, and a missing
    // tenantId here would otherwise silently aggregate across every tenant.
    if (tenantId === "global") {
      logger.error("analytics error: no tenant context on request");
      return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
        message: "Internal Server Error",
      });
    }
    const tenantIdMatch = { tenantId: { $oid: tenantId } };
    const result = await (prisma.user as any).aggregateRaw({
      pipeline: [
        { $match: { ...tenantIdMatch, joining_date: { $ne: null } } },
        {
          $group: {
            _id: { $substr: ["$joining_date", 0, 7] },
            count: { $sum: 1 },
          },
        },
        { $match: { _id: { $ne: "" } } },
        { $sort: { _id: 1 } },
      ],
    });
    const data = (result as any[]).map((r: any) => ({
      formattedDate: r._id,
      count: r.count,
    }));
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Joining data retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-joining-data error:", { error });
    return handleError(res, error);
  }
}

export async function getTenureDistribution(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:tenure-distribution`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Tenure distribution retrieved",
        data: cached,
      });

    const YEAR_MS = 365.25 * 24 * 3600 * 1000;
    // aggregateRaw bypasses the tenant-scoping $extends middleware entirely —
    // unlike findMany/count/etc, it must be filtered by hand, and a missing
    // tenantId here would otherwise silently aggregate across every tenant.
    if (tenantId === "global") {
      logger.error("analytics error: no tenant context on request");
      return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
        message: "Internal Server Error",
      });
    }
    const tenantIdMatch = { tenantId: { $oid: tenantId } };
    const bucketResult = await (prisma.user as any).aggregateRaw({
      pipeline: [
        {
          $match: {
            ...tenantIdMatch,
            employeeStatus: "Active",
            joining_date: { $ne: null },
          },
        },
        {
          $addFields: {
            joiningDateParsed: {
              $dateFromString: { dateString: "$joining_date", onError: null },
            },
          },
        },
        { $match: { joiningDateParsed: { $ne: null } } },
        {
          $addFields: {
            tenureYears: {
              $divide: [
                { $subtract: ["$$NOW", "$joiningDateParsed"] },
                YEAR_MS,
              ],
            },
          },
        },
        {
          $bucket: {
            groupBy: "$tenureYears",
            boundaries: [0, 1, 2, 3, 5],
            default: "5+ yrs",
            output: { count: { $sum: 1 } },
          },
        },
      ],
    });
    const tenureLabel: Record<string | number, string> = {
      0: "<1 yr",
      1: "1-2 yrs",
      2: "2-3 yrs",
      3: "3-5 yrs",
      "5+ yrs": "5+ yrs",
    };
    const tenureCount: Record<string, number> = {};
    for (const b of bucketResult as any[]) {
      tenureCount[tenureLabel[b._id] ?? String(b._id)] = b.count;
    }
    const data = ["<1 yr", "1-2 yrs", "2-3 yrs", "3-5 yrs", "5+ yrs"].map(
      (_id) => ({
        _id,
        count: tenureCount[_id] ?? 0,
      }),
    );
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Tenure distribution retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-tenure-distribution error:", { error });
    return handleError(res, error);
  }
}

export async function getHeadcountGrowth(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:headcount-growth`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Headcount growth retrieved",
        data: cached,
      });

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const cutoff = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`;

    // aggregateRaw bypasses the tenant-scoping $extends middleware entirely —
    // unlike findMany/count/etc, it must be filtered by hand, and a missing
    // tenantId here would otherwise silently aggregate across every tenant.
    if (tenantId === "global") {
      logger.error("analytics error: no tenant context on request");
      return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
        message: "Internal Server Error",
      });
    }
    const tenantIdMatch = { tenantId: { $oid: tenantId } };
    const result = await (prisma.user as any).aggregateRaw({
      pipeline: [
        {
          $match: {
            ...tenantIdMatch,
            joining_date: { $ne: null, $gte: cutoff },
          },
        },
        {
          $group: {
            _id: { $substr: ["$joining_date", 0, 7] },
            joinings: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ],
    });
    const monthlyMap: Record<string, number> = {};
    for (const r of result as any[]) {
      if (r._id) monthlyMap[r._id] = r.joinings;
    }
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    let cumulative = 0;
    const data = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const joinings = monthlyMap[key] ?? 0;
      cumulative += joinings;
      return {
        monthName: monthNames[d.getMonth()],
        year: d.getFullYear(),
        joinings,
        cumulativeHeadcount: cumulative,
      };
    });
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Headcount growth retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-headcount-growth error:", { error });
    return handleError(res, error);
  }
}

export async function getLeaveApprovalRate(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:leave-approval-rate`;
    const cached = await cacheManager.get<any>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Leave approval rate retrieved",
        data: cached,
      });

    const [approved, pending, rejected, total] = await Promise.all([
      prisma.leaveApplication.count({ where: { status: "Approved" } }),
      prisma.leaveApplication.count({ where: { status: "Pending" } }),
      prisma.leaveApplication.count({ where: { status: "Rejected" } }),
      prisma.leaveApplication.count(),
    ]);
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    const data = { approvalRate, approved, pending, rejected, total };
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Leave approval rate retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-leave-approval-rate error:", { error });
    return handleError(res, error);
  }
}

export async function getLeaveTypeBreakdown(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:leave-type-breakdown`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Leave type breakdown retrieved",
        data: cached,
      });

    const groups = await prisma.leaveApplication.groupBy({
      by: ["leaveType"],
      _count: { id: true },
      _sum: { days: true },
    });
    const data = groups.map((g: any) => ({
      _id: g.leaveType,
      count: g._count.id,
      totalDays: Math.round(g._sum.days ?? 0),
    }));
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Leave type breakdown retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-leave-type-breakdown error:", { error });
    return handleError(res, error);
  }
}

export async function getMonthlyLeavePatterns(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:monthly-leave-patterns`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Monthly leave patterns retrieved",
        data: cached,
      });

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().split("T")[0];

    // aggregateRaw bypasses the tenant-scoping $extends middleware entirely —
    // unlike findMany/count/etc, it must be filtered by hand, and a missing
    // tenantId here would otherwise silently aggregate across every tenant.
    if (tenantId === "global") {
      logger.error("analytics error: no tenant context on request");
      return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
        message: "Internal Server Error",
      });
    }
    const tenantIdMatch = { tenantId: { $oid: tenantId } };
    const result = await (prisma.leaveApplication as any).aggregateRaw({
      pipeline: [
        {
          $match: {
            ...tenantIdMatch,
            status: "Approved",
            from: { $gte: twelveMonthsAgoStr },
          },
        },
        {
          $group: {
            _id: { $substr: ["$from", 0, 7] },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ],
    });
    const data = (result as any[]).map((r: any) => ({
      month: r._id,
      count: r.count,
    }));
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Monthly leave patterns retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-monthly-leave-patterns error:", { error });
    return handleError(res, error);
  }
}

export async function getAttendanceTrends(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:attendance-trends`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Attendance trends retrieved",
        data: cached,
      });

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    // aggregateRaw bypasses the tenant-scoping $extends middleware entirely —
    // unlike findMany/count/etc, it must be filtered by hand, and a missing
    // tenantId here would otherwise silently aggregate across every tenant.
    if (tenantId === "global") {
      logger.error("analytics error: no tenant context on request");
      return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
        message: "Internal Server Error",
      });
    }
    const tenantIdMatch = { tenantId: { $oid: tenantId } };
    const result = await (prisma.attendanceRecord as any).aggregateRaw({
      pipeline: [
        {
          $match: {
            ...tenantIdMatch,
            date: { $gte: { $date: twelveMonthsAgo.toISOString() } },
          },
        },
        {
          $group: {
            _id: { year: { $year: "$date" }, month: { $month: "$date" } },
            total: { $sum: 1 },
            present: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      { $toLower: { $ifNull: ["$status", ""] } },
                      ["present", "late", "half day"],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            hours: { $sum: { $ifNull: ["$workingHours", 0] } },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        { $limit: 12 },
      ],
    });
    const data = (result as any[]).map((r: any) => ({
      _id: { year: r._id.year, month: r._id.month },
      attendanceRate:
        r.total > 0 ? Math.round((r.present / r.total) * 1000) / 10 : 0,
      avgWorkingHours:
        r.total > 0 ? Math.round((r.hours / r.total) * 100) / 100 : 0,
    }));
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Attendance trends retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-attendance-trends error:", { error });
    return handleError(res, error);
  }
}

export async function getWorkingHoursDistribution(
  _req: Request,
  res: Response,
) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:working-hours-distribution`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Working hours distribution retrieved",
        data: cached,
      });

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    // aggregateRaw bypasses the tenant-scoping $extends middleware entirely —
    // unlike findMany/count/etc, it must be filtered by hand, and a missing
    // tenantId here would otherwise silently aggregate across every tenant.
    if (tenantId === "global") {
      logger.error("analytics error: no tenant context on request");
      return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
        message: "Internal Server Error",
      });
    }
    const tenantIdMatch = { tenantId: { $oid: tenantId } };
    const bucketResult = await (prisma.attendanceRecord as any).aggregateRaw({
      pipeline: [
        {
          $match: {
            ...tenantIdMatch,
            date: { $gte: { $date: twelveMonthsAgo.toISOString() } },
            workingHours: { $ne: null },
          },
        },
        {
          $bucket: {
            groupBy: "$workingHours",
            boundaries: [0, 4, 6, 8, 9],
            default: "9+h",
            output: { count: { $sum: 1 } },
          },
        },
      ],
    });
    const hoursLabel: Record<string | number, string> = {
      0: "<4h",
      4: "4-6h",
      6: "6-8h",
      8: "8-9h",
      "9+h": "9+h",
    };
    const hoursCount: Record<string, number> = {};
    for (const b of bucketResult as any[]) {
      hoursCount[hoursLabel[b._id] ?? String(b._id)] = b.count;
    }
    const data = ["<4h", "4-6h", "6-8h", "8-9h", "9+h"].map((_id) => ({
      _id,
      count: hoursCount[_id] ?? 0,
    }));
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Working hours distribution retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-working-hours-distribution error:", { error });
    return handleError(res, error);
  }
}

export async function getJobOpeningsByStatus(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:job-openings-by-status`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Job openings by status retrieved",
        data: cached,
      });

    const groups = await prisma.jobOpening.groupBy({
      by: ["status"],
      _count: { id: true },
    });
    const data = groups.map((g: any) => ({
      _id: g.status || "Unknown",
      count: g._count.id,
    }));
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Job openings by status retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-job-openings-by-status error:", { error });
    return handleError(res, error);
  }
}

export async function getApplicationsByJobRole(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:applications-by-job-role`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Applications by job role retrieved",
        data: cached,
      });

    const groups: any[] = await (prisma.jobOpening.groupBy as any)({
      by: ["jobTitle", "status"],
      _count: { _all: true },
    });
    const byRole: Record<
      string,
      {
        jobTitle: string;
        totalApplications: number;
        shortlisted: number;
        interviewed: number;
        hired: number;
      }
    > = {};
    for (const g of groups) {
      const title = g.jobTitle || "Unknown";
      if (!byRole[title])
        byRole[title] = {
          jobTitle: title,
          totalApplications: 0,
          shortlisted: 0,
          interviewed: 0,
          hired: 0,
        };
      byRole[title].totalApplications += g._count._all;
      const s = (g.status || "").toLowerCase();
      if (s === "shortlisted") byRole[title].shortlisted += g._count._all;
      else if (s === "interviewed") byRole[title].interviewed += g._count._all;
      else if (s === "hired" || s === "closed")
        byRole[title].hired += g._count._all;
    }
    const data = Object.values(byRole);
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Applications by job role retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-applications-by-job-role error:", { error });
    return handleError(res, error);
  }
}

export async function getHiringFunnel(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:hiring-funnel`;
    const cached = await cacheManager.get<any>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Hiring funnel retrieved",
        data: cached,
      });

    const [applied, shortlisted, interviewed, offered, hired] =
      await Promise.all([
        prisma.jobOpening.count(),
        prisma.jobOpening.count({
          where: { status: { in: ["shortlisted", "Shortlisted"] } },
        }),
        prisma.jobOpening.count({
          where: { status: { in: ["interviewed", "Interviewed"] } },
        }),
        prisma.jobOpening.count({
          where: { status: { in: ["offered", "Offered"] } },
        }),
        prisma.jobOpening.count({
          where: { status: { in: ["hired", "Hired", "closed", "Closed"] } },
        }),
      ]);
    const pct = (n: number, d: number) =>
      d > 0 ? Math.round((n / d) * 100) : 0;
    const data = {
      applied,
      shortlisted,
      interviewed,
      offered,
      hired,
      shortlistRate: pct(shortlisted, applied),
      interviewRate: pct(interviewed, shortlisted),
      offerRate: pct(offered, interviewed),
      hireRate: pct(hired, offered),
    };
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Hiring funnel retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-hiring-funnel error:", { error });
    return handleError(res, error);
  }
}

export async function getHiringManagerPerformance(
  _req: Request,
  res: Response,
) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:hiring-manager-performance`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Hiring manager performance retrieved",
        data: cached,
      });

    const groups: any[] = await (prisma.jobOpening.groupBy as any)({
      by: ["hiringManager", "status"],
      _count: { _all: true },
    });
    const byManager: Record<
      string,
      { totalJobs: number; activeJobs: number; closedJobs: number }
    > = {};
    for (const g of groups) {
      if (!g.hiringManager) continue;
      if (!byManager[g.hiringManager])
        byManager[g.hiringManager] = {
          totalJobs: 0,
          activeJobs: 0,
          closedJobs: 0,
        };
      byManager[g.hiringManager].totalJobs += g._count._all;
      const s = (g.status || "").toLowerCase();
      if (s === "closed" || s === "hired")
        byManager[g.hiringManager].closedJobs += g._count._all;
      else byManager[g.hiringManager].activeJobs += g._count._all;
    }
    const data = Object.entries(byManager).map(([hiringManager, stats]) => ({
      hiringManager,
      totalJobs: stats.totalJobs,
      activeJobs: stats.activeJobs,
      closedJobs: stats.closedJobs,
      successRate:
        stats.totalJobs > 0
          ? Math.round((stats.closedJobs / stats.totalJobs) * 100)
          : 0,
    }));
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Hiring manager performance retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-hiring-manager-performance error:", { error });
    return handleError(res, error);
  }
}

export async function getSalaryDistributionByDepartment(
  _req: Request,
  res: Response,
) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:salary-distribution-by-dept`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Salary distribution by department retrieved",
        data: cached,
      });

    const groups = await prisma.user.groupBy({
      by: ["department"],
      where: { NOT: [{ department: null }, { salary: null }] },
      _min: { salary: true },
      _max: { salary: true },
      _avg: { salary: true },
      _count: { id: true },
    });
    const data = groups
      .filter((g: any) => g.department)
      .map((g: any) => ({
        department: g.department!,
        minSalary: g._min.salary ?? 0,
        maxSalary: g._max.salary ?? 0,
        avgSalary: Math.round(g._avg.salary ?? 0),
        employeeCount: g._count.id,
      }));
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Salary distribution by department retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-salary-distribution-by-department error:", { error });
    return handleError(res, error);
  }
}

export async function getCompensationBreakdown(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:compensation-breakdown`;
    const cached = await cacheManager.get<any>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Compensation breakdown retrieved",
        data: cached,
      });

    const agg = await prisma.user.aggregate({
      where: { NOT: { salary: null } },
      _avg: {
        salaryBasicPay: true,
        salaryHra: true,
        salaryConveyance: true,
        salaryPf: true,
        salaryEsi: true,
        salaryPt: true,
      },
      _count: { id: true },
    });
    const data = {
      employeeCount: agg._count.id,
      avgBasicPay: Math.round(agg._avg.salaryBasicPay ?? 0),
      avgHRA: Math.round(agg._avg.salaryHra ?? 0),
      avgConveyance: Math.round(agg._avg.salaryConveyance ?? 0),
      avgPF: Math.round(agg._avg.salaryPf ?? 0),
      avgESI: Math.round(agg._avg.salaryEsi ?? 0),
      avgPT: Math.round(agg._avg.salaryPt ?? 0),
    };
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Compensation breakdown retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-compensation-breakdown error:", { error });
    return handleError(res, error);
  }
}

export async function getAverageSalaryByDesignation(
  _req: Request,
  res: Response,
) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:avg-salary-by-designation`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Average salary by designation retrieved",
        data: cached,
      });

    const groups = await prisma.user.groupBy({
      by: ["designation"],
      where: { NOT: [{ designation: null }, { salary: null }] },
      _avg: { salary: true },
      _min: { salary: true },
      _max: { salary: true },
      _count: { id: true },
    });
    const data = groups
      .filter((g: any) => g.designation)
      .map((g: any) => ({
        designation: g.designation!,
        avgSalary: Math.round(g._avg.salary ?? 0),
        minSalary: g._min.salary ?? 0,
        maxSalary: g._max.salary ?? 0,
        employeeCount: g._count.id,
      }))
      .sort((a: any, b: any) => b.avgSalary - a.avgSalary);
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Average salary by designation retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-average-salary-by-designation error:", { error });
    return handleError(res, error);
  }
}

export async function getSalaryBands(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:salary-bands`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Salary bands retrieved",
        data: cached,
      });

    // aggregateRaw bypasses the tenant-scoping $extends middleware entirely —
    // unlike findMany/count/etc, it must be filtered by hand, and a missing
    // tenantId here would otherwise silently aggregate across every tenant.
    if (tenantId === "global") {
      logger.error("analytics error: no tenant context on request");
      return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
        message: "Internal Server Error",
      });
    }
    const tenantIdMatch = { tenantId: { $oid: tenantId } };
    const bucketResult = await (prisma.user as any).aggregateRaw({
      pipeline: [
        { $match: { ...tenantIdMatch, salary: { $ne: null } } },
        {
          $bucket: {
            groupBy: "$salary",
            boundaries: [0, 20000, 40000, 60000, 100000],
            default: "100K+",
            output: { count: { $sum: 1 }, avgSalary: { $avg: "$salary" } },
          },
        },
      ],
    });
    const labelMap: Record<string, string> = {
      "0": "<20K",
      "20000": "20-40K",
      "40000": "40-60K",
      "60000": "60-100K",
      "100K+": "100K+",
    };
    const data = (bucketResult as any[]).map((b: any) => ({
      range: labelMap[String(b._id)] ?? String(b._id),
      count: b.count,
      avgSalary: Math.round(b.avgSalary ?? 0),
    }));
    await cacheManager.set(cacheKey, data, "analytics");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Salary bands retrieved",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-salary-bands error:", { error });
    return handleError(res, error);
  }
}
