import { Request, Response } from "express";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

export async function getEmploymentTypeBreakdown(_req: Request, res: Response) {
  try {
    const where: any = { employeeStatus: "Active" };
    const [total, wfh] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.count({ where: { ...where, wfh: true } }),
    ]);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { wfhCount: wfh, officeCount: total - wfh, totalEmployees: total },
    });
  } catch (err) {
    logger.error("get-employment-type-breakdown error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { wfhCount: 0, officeCount: 0, totalEmployees: 0 },
    });
  }
}

export async function getEmployeeStatusDistribution(
  _req: Request,
  res: Response,
) {
  try {
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
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-employee-status-distribution error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getEmployeeDepartments(_req: Request, res: Response) {
  try {
    const groups = await prisma.user.groupBy({
      by: ["department"],
      where: { employeeStatus: "Active", NOT: { department: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
    const data = groups
      .filter((g: any) => g.department)
      .map((g: any) => ({ _id: g.department!, count: g._count.id }));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-employee-departments error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getEmployeeDesignations(_req: Request, res: Response) {
  try {
    const groups = await prisma.user.groupBy({
      by: ["designation"],
      where: { employeeStatus: "Active", NOT: { designation: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
    const data = groups
      .filter((g: any) => g.designation)
      .map((g: any) => ({ _id: g.designation!, count: g._count.id }));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-employee-designations error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getAgeDistribution(_req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      where: { NOT: { dob: null } },
      select: { dob: true },
    });
    const buckets: Record<string, number> = {
      "<25": 0,
      "25-34": 0,
      "35-44": 0,
      "45-54": 0,
      "55+": 0,
    };
    const now = new Date();
    for (const u of users) {
      if (!u.dob) continue;
      const age = now.getFullYear() - new Date(u.dob).getFullYear();
      if (age < 25) buckets["<25"]++;
      else if (age < 35) buckets["25-34"]++;
      else if (age < 45) buckets["35-44"]++;
      else if (age < 55) buckets["45-54"]++;
      else buckets["55+"]++;
    }
    const data = Object.entries(buckets).map(([_id, count]) => ({
      _id,
      count,
    }));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-age-distribution error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getJoiningData(_req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      where: { NOT: { joining_date: null } },
      select: { joining_date: true },
    });
    const counts: Record<string, number> = {};
    for (const u of users) {
      if (!u.joining_date) continue;
      const d = new Date(u.joining_date);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    const data = Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({ formattedDate: key, count }));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-joining-data error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getTenureDistribution(_req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      where: { employeeStatus: "Active", NOT: { joining_date: null } },
      select: { joining_date: true },
    });
    const buckets: Record<string, number> = {
      "<1 yr": 0,
      "1-2 yrs": 0,
      "2-3 yrs": 0,
      "3-5 yrs": 0,
      "5+ yrs": 0,
    };
    const now = new Date();
    for (const u of users) {
      if (!u.joining_date) continue;
      const years =
        (now.getTime() - new Date(u.joining_date).getTime()) /
        (365.25 * 24 * 3600 * 1000);
      if (years < 1) buckets["<1 yr"]++;
      else if (years < 2) buckets["1-2 yrs"]++;
      else if (years < 3) buckets["2-3 yrs"]++;
      else if (years < 5) buckets["3-5 yrs"]++;
      else buckets["5+ yrs"]++;
    }
    const data = Object.entries(buckets).map(([_id, count]) => ({
      _id,
      count,
    }));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-tenure-distribution error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getHeadcountGrowth(_req: Request, res: Response) {
  try {
    const months = 12;
    const users = await prisma.user.findMany({
      where: { NOT: { joining_date: null } },
      select: { joining_date: true },
    });
    const monthlyJoinings: Record<string, number> = {};
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyJoinings[key] = 0;
    }
    for (const u of users) {
      if (!u.joining_date) continue;
      const d = new Date(u.joining_date);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key in monthlyJoinings) monthlyJoinings[key]++;
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
    const data = Object.entries(monthlyJoinings)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, joinings]) => {
        cumulative += joinings;
        const [yr, mn] = key.split("-");
        return {
          monthName: monthNames[parseInt(mn) - 1],
          year: parseInt(yr),
          joinings,
          cumulativeHeadcount: cumulative,
        };
      });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-headcount-growth error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getLeaveApprovalRate(_req: Request, res: Response) {
  try {
    const [approved, pending, rejected, total] = await Promise.all([
      prisma.leaveApplication.count({ where: { status: "Approved" } }),
      prisma.leaveApplication.count({ where: { status: "Pending" } }),
      prisma.leaveApplication.count({ where: { status: "Rejected" } }),
      prisma.leaveApplication.count(),
    ]);
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { approvalRate, approved, pending, rejected, total },
    });
  } catch (err) {
    logger.error("get-leave-approval-rate error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { approvalRate: 0, approved: 0, pending: 0, rejected: 0, total: 0 },
    });
  }
}

export async function getLeaveTypeBreakdown(_req: Request, res: Response) {
  try {
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
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-leave-type-breakdown error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getMonthlyLeavePatterns(_req: Request, res: Response) {
  try {
    const leaves = await prisma.leaveApplication.findMany({
      where: { status: "Approved" },
      select: { from: true, leaveType: true, days: true },
    });
    const patterns: Record<string, number> = {};
    for (const l of leaves) {
      if (!l.from) continue;
      const key = l.from.substring(0, 7);
      patterns[key] = (patterns[key] || 0) + 1;
    }
    const data = Object.entries(patterns)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-monthly-leave-patterns error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getAttendanceTrends(_req: Request, res: Response) {
  try {
    const records = await prisma.attendanceRecord.findMany({
      select: { date: true, status: true, workingHours: true },
    });
    const monthly: Record<
      string,
      { total: number; present: number; hours: number }
    > = {};
    for (const r of records) {
      if (!r.date) continue;
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[key]) monthly[key] = { total: 0, present: 0, hours: 0 };
      monthly[key].total++;
      const s = (r.status || "").toLowerCase();
      if (s === "present" || s === "late" || s === "half day")
        monthly[key].present++;
      monthly[key].hours += r.workingHours ?? 0;
    }
    const data = Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, v]) => {
        const [year, month] = key.split("-").map(Number);
        return {
          _id: { year, month },
          attendanceRate:
            v.total > 0 ? Math.round((v.present / v.total) * 1000) / 10 : 0,
          avgWorkingHours:
            v.total > 0 ? Math.round((v.hours / v.total) * 100) / 100 : 0,
        };
      });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-attendance-trends error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getWorkingHoursDistribution(
  _req: Request,
  res: Response,
) {
  try {
    const records = await prisma.attendanceRecord.findMany({
      where: { NOT: { workingHours: null } },
      select: { workingHours: true },
    });
    const buckets: Record<string, number> = {
      "<4h": 0,
      "4-6h": 0,
      "6-8h": 0,
      "8-9h": 0,
      "9+h": 0,
    };
    for (const r of records) {
      const h = r.workingHours ?? 0;
      if (h < 4) buckets["<4h"]++;
      else if (h < 6) buckets["4-6h"]++;
      else if (h < 8) buckets["6-8h"]++;
      else if (h < 9) buckets["8-9h"]++;
      else buckets["9+h"]++;
    }
    const data = Object.entries(buckets).map(([_id, count]) => ({
      _id,
      count,
    }));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-working-hours-distribution error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getJobOpeningsByStatus(_req: Request, res: Response) {
  try {
    const groups = await prisma.jobOpening.groupBy({
      by: ["status"],
      _count: { id: true },
    });
    const data = groups.map((g: any) => ({
      _id: g.status || "Unknown",
      count: g._count.id,
    }));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-job-openings-by-status error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getApplicationsByJobRole(_req: Request, res: Response) {
  try {
    const jobs = await prisma.jobOpening.findMany({
      select: { jobTitle: true, status: true },
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
    for (const j of jobs) {
      const title = j.jobTitle || "Unknown";
      if (!byRole[title])
        byRole[title] = {
          jobTitle: title,
          totalApplications: 0,
          shortlisted: 0,
          interviewed: 0,
          hired: 0,
        };
      byRole[title].totalApplications++;
      const s = (j.status || "").toLowerCase();
      if (s === "shortlisted") byRole[title].shortlisted++;
      else if (s === "interviewed") byRole[title].interviewed++;
      else if (s === "hired" || s === "closed") byRole[title].hired++;
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: Object.values(byRole),
    });
  } catch (err) {
    logger.error("get-applications-by-job-role error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getHiringFunnel(_req: Request, res: Response) {
  try {
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
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        applied,
        shortlisted,
        interviewed,
        offered,
        hired,
        shortlistRate: pct(shortlisted, applied),
        interviewRate: pct(interviewed, shortlisted),
        offerRate: pct(offered, interviewed),
        hireRate: pct(hired, offered),
      },
    });
  } catch (err) {
    logger.error("get-hiring-funnel error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        applied: 0,
        shortlisted: 0,
        interviewed: 0,
        offered: 0,
        hired: 0,
        shortlistRate: 0,
        interviewRate: 0,
        offerRate: 0,
        hireRate: 0,
      },
    });
  }
}

export async function getHiringManagerPerformance(
  _req: Request,
  res: Response,
) {
  try {
    const jobs = await prisma.jobOpening.findMany({
      select: { hiringManager: true, status: true },
    });
    const byManager: Record<
      string,
      { totalJobs: number; activeJobs: number; closedJobs: number }
    > = {};
    for (const j of jobs) {
      if (!j.hiringManager) continue;
      if (!byManager[j.hiringManager])
        byManager[j.hiringManager] = {
          totalJobs: 0,
          activeJobs: 0,
          closedJobs: 0,
        };
      byManager[j.hiringManager].totalJobs++;
      const s = (j.status || "").toLowerCase();
      if (s === "closed" || s === "hired")
        byManager[j.hiringManager].closedJobs++;
      else byManager[j.hiringManager].activeJobs++;
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
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-hiring-manager-performance error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getSalaryDistributionByDepartment(
  _req: Request,
  res: Response,
) {
  try {
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
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-salary-distribution-by-department error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getCompensationBreakdown(_req: Request, res: Response) {
  try {
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
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        employeeCount: agg._count.id,
        avgBasicPay: Math.round(agg._avg.salaryBasicPay ?? 0),
        avgHRA: Math.round(agg._avg.salaryHra ?? 0),
        avgConveyance: Math.round(agg._avg.salaryConveyance ?? 0),
        avgPF: Math.round(agg._avg.salaryPf ?? 0),
        avgESI: Math.round(agg._avg.salaryEsi ?? 0),
        avgPT: Math.round(agg._avg.salaryPt ?? 0),
      },
    });
  } catch (err) {
    logger.error("get-compensation-breakdown error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        employeeCount: 0,
        avgBasicPay: 0,
        avgHRA: 0,
        avgConveyance: 0,
        avgPF: 0,
        avgESI: 0,
        avgPT: 0,
      },
    });
  }
}

export async function getAverageSalaryByDesignation(
  _req: Request,
  res: Response,
) {
  try {
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
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-average-salary-by-designation error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}

export async function getSalaryBands(_req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      where: { NOT: { salary: null } },
      select: { salary: true },
    });
    const bands = [
      { range: "<20K", min: 0, max: 20000 },
      { range: "20-40K", min: 20000, max: 40000 },
      { range: "40-60K", min: 40000, max: 60000 },
      { range: "60-100K", min: 60000, max: 100000 },
      { range: "100K+", min: 100000, max: Infinity },
    ];
    const data = bands.map((band) => {
      const inBand = users.filter(
        (u: any) => (u.salary ?? 0) >= band.min && (u.salary ?? 0) < band.max,
      );
      const avgSalary =
        inBand.length > 0
          ? Math.round(
              inBand.reduce((s: any, u: any) => s + (u.salary ?? 0), 0) /
                inBand.length,
            )
          : 0;
      return { range: band.range, count: inBand.length, avgSalary };
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err) {
    logger.error("get-salary-bands error:", { err });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
  }
}
