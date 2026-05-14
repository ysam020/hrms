import { Request, Response } from "express";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:14b";

// ── Data fetchers (mirror the existing insights handlers) ──────────────────

async function fetchAttendanceData(period: string) {
  const now = new Date();
  let startDate: Date;
  let endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
  );

  switch (period) {
    case "last_month":
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case "quarter":
      startDate = new Date(
        now.getFullYear(),
        Math.floor(now.getMonth() / 3) * 3,
        1,
      );
      break;
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const [records, users] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: {
        userId: true,
        date: true,
        status: true,
        workingHours: true,
        isCorrected: true,
        timeIn: true,
      },
    }),
    prisma.user.findMany({
      where: { employeeStatus: "Active" },
      select: { id: true, username: true, department: true, designation: true },
    }),
  ]);

  const userDeptMap = new Map<string, string>(
    users.map(
      (u: any) => [u.id, u.department || "Unknown"] as [string, string],
    ),
  );
  const userNameMap = new Map<string, string>(
    users.map((u: any) => [u.id, u.username] as [string, string]),
  );

  const total = records.length;
  const presentCount = records.filter(
    (r: any) => r.status === "Present" || r.status === "Late",
  ).length;
  const halfDayCount = records.filter(
    (r: any) => r.status === "Half Day",
  ).length;
  const correctedCount = records.filter((r: any) => r.isCorrected).length;
  const lateCount = records.filter((r: any) => r.status === "Late").length;
  const withHours = records.filter(
    (r: any) => r.workingHours != null && r.workingHours > 0,
  );
  const avgWorkingHours =
    withHours.length > 0
      ? Math.round(
          (withHours.reduce((s: any, r: any) => s + (r.workingHours || 0), 0) /
            withHours.length) *
            100,
        ) / 100
      : 0;

  const overallAttendanceRate =
    total > 0 ? Math.round(((presentCount + halfDayCount) / total) * 100) : 0;
  const correctionRate =
    total > 0 ? Math.round((correctedCount / total) * 100) : 0;
  const lateArrivalRate = total > 0 ? Math.round((lateCount / total) * 100) : 0;

  // Per-employee risk
  const byEmployee = new Map<string, typeof records>();
  for (const r of records) {
    if (!byEmployee.has(r.userId)) byEmployee.set(r.userId, []);
    byEmployee.get(r.userId)!.push(r);
  }
  const employeeRiskAssessment = Array.from(byEmployee.entries())
    .map(([userId, recs]) => {
      const t = recs.length;
      const p = recs.filter(
        (r: any) =>
          r.status === "Present" ||
          r.status === "Late" ||
          r.status === "Half Day",
      ).length;
      const attendanceRate = t > 0 ? Math.round((p / t) * 100) : 0;
      const hoursRecs = recs.filter((r: any) => r.workingHours);
      const avgHours =
        hoursRecs.length > 0
          ? Math.round(
              (hoursRecs.reduce(
                (s: any, r: any) => s + (r.workingHours || 0),
                0,
              ) /
                hoursRecs.length) *
                100,
            ) / 100
          : 0;
      const corrFreq =
        t > 0
          ? Math.round(
              (recs.filter((r: any) => r.isCorrected).length / t) * 100,
            )
          : 0;
      const riskScore =
        Math.round(
          ((100 - attendanceRate) * 0.5 +
            corrFreq * 0.3 +
            Math.max(0, 8 - avgHours) * 2.5) *
            10,
        ) / 10;
      return {
        username: userNameMap.get(userId) || userId,
        department: userDeptMap.get(userId) || "Unknown",
        attendanceRate,
        avgWorkingHours: avgHours,
        correctionFrequency: corrFreq,
        riskScore,
        riskLevel: riskScore > 30 ? "High" : riskScore > 15 ? "Medium" : "Low",
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);

  const highRiskCount = employeeRiskAssessment.filter(
    (e) => e.riskLevel === "High",
  ).length;
  const mediumRiskCount = employeeRiskAssessment.filter(
    (e) => e.riskLevel === "Medium",
  ).length;

  // Department performance
  const byDept = new Map<string, typeof records>();
  for (const r of records) {
    const dept = userDeptMap.get(r.userId) || "Unknown";
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept)!.push(r);
  }
  const teamPerformance = Array.from(byDept.entries())
    .map(([department, recs]) => {
      const t = recs.length;
      const p = recs.filter(
        (r: any) =>
          r.status === "Present" ||
          r.status === "Late" ||
          r.status === "Half Day",
      ).length;
      const hoursRecs = recs.filter((r: any) => r.workingHours);
      return {
        department,
        employeeCount: new Set(recs.map((r: any) => r.userId)).size,
        attendanceRate: t > 0 ? Math.round((p / t) * 100) : 0,
        avgWorkingHours:
          hoursRecs.length > 0
            ? Math.round(
                (hoursRecs.reduce(
                  (s: any, r: any) => s + (r.workingHours || 0),
                  0,
                ) /
                  hoursRecs.length) *
                  100,
              ) / 100
            : 0,
        correctionRate:
          t > 0
            ? Math.round(
                (recs.filter((r: any) => r.isCorrected).length / t) * 100,
              )
            : 0,
        lateArrivalRate:
          t > 0
            ? Math.round(
                (recs.filter((r: any) => r.status === "Late").length / t) * 100,
              )
            : 0,
      };
    })
    .sort((a, b) => b.attendanceRate - a.attendanceRate);

  // Weekly trends
  const weekMap = new Map<number, { present: number; total: number }>();
  for (const r of records) {
    const d = new Date(r.date);
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(
      ((d.getTime() - startOfYear.getTime()) / 86400000 +
        startOfYear.getDay() +
        1) /
        7,
    );
    if (!weekMap.has(week)) weekMap.set(week, { present: 0, total: 0 });
    const w = weekMap.get(week)!;
    w.total++;
    if (
      r.status === "Present" ||
      r.status === "Late" ||
      r.status === "Half Day"
    )
      w.present++;
  }
  const weeklyTrends = Array.from(weekMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([week, { present, total: wt }]) => ({
      week,
      attendanceRate: wt > 0 ? Math.round((present / wt) * 100) : 0,
    }));
  const last2 = weeklyTrends.slice(-2);
  const trendDirection =
    last2.length === 2
      ? last2[1].attendanceRate - last2[0].attendanceRate > 5
        ? "improving"
        : last2[1].attendanceRate - last2[0].attendanceRate < -5
          ? "declining"
          : "stable"
      : "stable";

  // Peak check-in hours
  const hourMap = new Map<number, number>();
  for (const r of records) {
    if (r.timeIn) {
      const hour = parseInt(r.timeIn.split(":")[0]);
      if (!isNaN(hour)) hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
    }
  }
  const peakHours = Array.from(hourMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hour, count]) => ({ hour, count }));

  return {
    period,
    reportingWindow: { startDate, endDate },
    totalRecords: total,
    activeEmployees: users.length,
    primaryMetrics: {
      overallAttendanceRate,
      averageWorkingHours: avgWorkingHours,
      correctionRate,
      lateArrivalRate,
      statusDistribution: {
        present: presentCount,
        halfDay: halfDayCount,
        late: lateCount,
        absent: records.filter(
          (r: any) =>
            !r.status || r.status === "Absent" || r.status === "Leave",
        ).length,
        weekOff: records.filter((r: any) => r.status === "Week Off").length,
        holiday: records.filter((r: any) => r.status === "Holiday").length,
      },
    },
    riskSummary: {
      highRiskEmployees: highRiskCount,
      mediumRiskEmployees: mediumRiskCount,
      lowRiskEmployees:
        employeeRiskAssessment.length - highRiskCount - mediumRiskCount,
      topAtRiskEmployees: employeeRiskAssessment.slice(0, 5),
    },
    teamPerformance,
    trendAnalysis: { weeklyTrends, trendDirection },
    peakArrivalHours: peakHours,
  };
}

async function fetchEmployeeData() {
  const [
    active,
    resigned,
    terminated,
    absconded,
    total,
    deptGroups,
    designationGroups,
    recentJoinees,
  ] = await Promise.all([
    prisma.user.count({ where: { employeeStatus: "Active" } }),
    prisma.user.count({ where: { employeeStatus: "Resigned" } }),
    prisma.user.count({ where: { employeeStatus: "Terminated" } }),
    prisma.user.count({ where: { employeeStatus: "Absconded" } }),
    prisma.user.count(),
    prisma.user.groupBy({
      by: ["department"],
      where: { department: { not: null }, employeeStatus: "Active" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.user.groupBy({
      by: ["designation"],
      where: { designation: { not: null }, employeeStatus: "Active" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.user.count({
      where: {
        employeeStatus: "Active",
        joining_date: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
    }),
  ]);

  return {
    overview: {
      totalEmployees: total,
      activeEmployees: active,
      resignedEmployees: resigned,
      terminatedEmployees: terminated,
      abscondedEmployees: absconded,
      attritionRate:
        total > 0
          ? Math.round(((resigned + terminated + absconded) / total) * 100)
          : 0,
      recentJoinees_last90Days: recentJoinees,
    },
    departmentBreakdown: deptGroups
      .filter((g: any) => g.department)
      .map((g: any) => ({ department: g.department, count: g._count.id })),
    topDesignations: designationGroups
      .filter((g: any) => g.designation)
      .slice(0, 10)
      .map((g: any) => ({ designation: g.designation, count: g._count.id })),
  };
}

async function fetchKycData() {
  const [rows, deptRows] = await Promise.all([
    prisma.user.aggregateRaw({
      pipeline: [
        {
          $group: {
            _id: null,
            approved: {
              $sum: { $cond: [{ $eq: ["$kyc_approval", "Approved"] }, 1, 0] },
            },
            pending: {
              $sum: { $cond: [{ $eq: ["$kyc_approval", "Pending"] }, 1, 0] },
            },
            rejected: {
              $sum: { $cond: [{ $eq: ["$kyc_approval", "Rejected"] }, 1, 0] },
            },
            total: { $sum: 1 },
          },
        },
      ],
    }) as unknown as Promise<any[]>,
    prisma.user.aggregateRaw({
      pipeline: [
        {
          $group: {
            _id: { dept: "$department", status: "$kyc_approval" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.dept": 1 } },
      ],
    }) as unknown as Promise<any[]>,
  ]);

  const stats = (rows as any[])[0] ?? {
    approved: 0,
    pending: 0,
    rejected: 0,
    total: 0,
  };
  const completionRate =
    stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;

  // Build department breakdown
  const deptMap: Record<
    string,
    { approved: number; pending: number; rejected: number }
  > = {};
  for (const row of deptRows as any[]) {
    const dept = row._id?.dept || "Unknown";
    const status = row._id?.status || "Unknown";
    if (!deptMap[dept])
      deptMap[dept] = { approved: 0, pending: 0, rejected: 0 };
    if (status === "Approved") deptMap[dept].approved += row.count;
    else if (status === "Pending") deptMap[dept].pending += row.count;
    else if (status === "Rejected") deptMap[dept].rejected += row.count;
  }

  return {
    overview: {
      totalEmployees: stats.total,
      approvedKyc: stats.approved,
      pendingKyc: stats.pending,
      rejectedKyc: stats.rejected,
      completionRate,
    },
    departmentBreakdown: Object.entries(deptMap).map(
      ([department, counts]) => ({
        department,
        ...counts,
        completionRate:
          counts.approved + counts.pending + counts.rejected > 0
            ? Math.round(
                (counts.approved /
                  (counts.approved + counts.pending + counts.rejected)) *
                  100,
              )
            : 0,
      }),
    ),
  };
}

async function fetchRecruitmentData() {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [jobs, appStatusGroups] = await Promise.all([
    prisma.jobOpening.findMany({
      where: { deletedOn: null },
      include: { _count: { select: { applications: true } } },
    }),
    prisma.jobApplication.groupBy({ by: ["status"], _count: { id: true } }),
  ]);

  const totalJobOpenings = jobs.length;
  const activeJobOpenings = jobs.filter((j) =>
    ["Active", "Open"].includes(j.status),
  ).length;
  const totalApplications = appStatusGroups.reduce(
    (sum, g) => sum + g._count.id,
    0,
  );
  const totalCandidatesHired = jobs.reduce(
    (sum, j) => sum + (j.candidatesHired || 0),
    0,
  );
  const hiringSuccessRate =
    totalApplications > 0
      ? Math.round((totalCandidatesHired / totalApplications) * 100)
      : 0;

  const applicationsByStatus: Record<string, number> = {};
  for (const g of appStatusGroups) applicationsByStatus[g.status] = g._count.id;

  const topPerformingJobs = jobs
    .map((j) => ({
      jobTitle: j.jobTitle,
      department: (j as any).department || "N/A",
      totalApplications: j._count.applications,
      hired: j.candidatesHired,
      status: j.status,
      hiringRate:
        j._count.applications > 0
          ? Math.round((j.candidatesHired / j._count.applications) * 100)
          : 0,
    }))
    .sort((a, b) => b.totalApplications - a.totalApplications)
    .slice(0, 8);

  const expValues = jobs.map((j) => j.experience || 0);
  const avgExp =
    expValues.length > 0
      ? parseFloat(
          (expValues.reduce((s, v) => s + v, 0) / expValues.length).toFixed(1),
        )
      : 0;
  const expBreakdown: Record<string, number> = {
    "0-2 years": 0,
    "2-5 years": 0,
    "5-8 years": 0,
    "8+ years": 0,
  };
  for (const exp of expValues) {
    if (exp < 2) expBreakdown["0-2 years"]++;
    else if (exp < 5) expBreakdown["2-5 years"]++;
    else if (exp < 8) expBreakdown["5-8 years"]++;
    else expBreakdown["8+ years"]++;
  }

  const budgetValues = jobs
    .map((j) => {
      const b = j.budget ?? [];
      if (b.length === 0) return null;
      return b.length === 1 ? b[0] : (b[0] + b[1]) / 2;
    })
    .filter((v): v is number => v !== null);
  const avgBudget =
    budgetValues.length > 0
      ? parseFloat(
          (
            budgetValues.reduce((s, v) => s + v, 0) / budgetValues.length
          ).toFixed(2),
        )
      : 0;

  const overdueJobs = jobs.filter(
    (j) =>
      j.applicationDeadline < now && !["Closed", "Hired"].includes(j.status),
  ).length;
  const deadlinesThisWeek = jobs.filter(
    (j) =>
      j.applicationDeadline >= now &&
      j.applicationDeadline <= weekFromNow &&
      ["Active", "Open"].includes(j.status),
  ).length;
  const deadlinesThisMonth = jobs.filter(
    (j) =>
      j.applicationDeadline >= now &&
      j.applicationDeadline <= monthFromNow &&
      ["Active", "Open"].includes(j.status),
  ).length;

  const managerMap: Record<
    string,
    { totalJobs: number; activeJobs: number; totalHired: number }
  > = {};
  for (const j of jobs) {
    const mgr = j.hiringManager || "Unknown";
    if (!managerMap[mgr])
      managerMap[mgr] = { totalJobs: 0, activeJobs: 0, totalHired: 0 };
    managerMap[mgr].totalJobs++;
    if (["Active", "Open"].includes(j.status)) managerMap[mgr].activeJobs++;
    managerMap[mgr].totalHired += j.candidatesHired || 0;
  }

  const monthlyPostingMap = jobs
    .filter((j) => j.jobPostingDate && j.jobPostingDate >= sixMonthsAgo)
    .reduce((acc: Record<string, number>, j) => {
      const key = j.jobPostingDate!.toISOString().slice(0, 7);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  const monthlyJobPostings = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - (5 - i));
    const key = d.toISOString().slice(0, 7);
    return {
      month: d.toLocaleString("default", { month: "short", year: "2-digit" }),
      count: monthlyPostingMap[key] || 0,
    };
  });

  return {
    overview: {
      totalJobOpenings,
      activeJobOpenings,
      closedOrFilledJobs: totalJobOpenings - activeJobOpenings,
      totalApplications,
      totalCandidatesHired,
      hiringSuccessRate,
      averageApplicationsPerJob:
        totalJobOpenings > 0
          ? Math.round(totalApplications / totalJobOpenings)
          : 0,
    },
    applicationsByStatus,
    topPerformingJobs,
    experienceRequirements: {
      averageExperience: avgExp,
      breakdown: expBreakdown,
    },
    budgetAnalysis: {
      averageBudget: avgBudget,
      totalBudgetAllocation: parseFloat(
        budgetValues.reduce((s, v) => s + v, 0).toFixed(2),
      ),
    },
    deadlines: {
      overdueJobs,
      deadlinesThisWeek,
      deadlinesThisMonth,
    },
    hiringManagers: Object.entries(managerMap)
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.totalHired - a.totalHired)
      .slice(0, 5),
    monthlyJobPostings,
  };
}

async function fetchResignationData() {
  const [total, submitted, approved, rejected, withdrawn] = await Promise.all([
    prisma.resignation.count(),
    prisma.resignation.count({ where: { status: "Submitted" } }),
    prisma.resignation.count({ where: { status: "Approved" } }),
    prisma.resignation.count({ where: { status: "Rejected" } }),
    prisma.resignation.count({ where: { status: "Withdrawn" } }),
  ]);

  const processedTotal = approved + rejected;
  const approvalRate =
    processedTotal > 0 ? Math.round((approved / processedTotal) * 100) : 0;

  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [upcomingDepartures, allResignations] = await Promise.all([
    prisma.resignation.findMany({
      where: {
        status: "Approved",
        lastWorkingDay: { lte: nextMonth, gte: new Date() },
      },
      select: { userId: true, lastWorkingDay: true },
      orderBy: { lastWorkingDay: "asc" },
    }),
    prisma.resignation.findMany({
      select: {
        status: true,
        lastUpdatedOn: true,
        lastWorkingDay: true,
      },
      orderBy: { lastUpdatedOn: "desc" },
      take: 100,
    }),
  ]);

  // Monthly trend (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const monthlyMap: Record<string, number> = {};
  for (const r of allResignations) {
    if (r.lastUpdatedOn && new Date(r.lastUpdatedOn) >= sixMonthsAgo) {
      const key = new Date(r.lastUpdatedOn).toISOString().slice(0, 7);
      monthlyMap[key] = (monthlyMap[key] || 0) + 1;
    }
  }
  const now = new Date();
  const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - (5 - i));
    const key = d.toISOString().slice(0, 7);
    return {
      month: d.toLocaleString("default", { month: "short", year: "2-digit" }),
      count: monthlyMap[key] || 0,
    };
  });

  return {
    overview: {
      total,
      submitted,
      approved,
      rejected,
      withdrawn,
      approvalRate,
      pendingReview: submitted,
    },
    upcomingDepartures: upcomingDepartures.map((r: any) => ({
      userId: r.userId,
      lastWorkingDay: r.lastWorkingDay,
    })),
    monthlyTrend,
    processingMetrics: {
      totalProcessed: approved + rejected,
      approvalRate,
      rejectionRate:
        processedTotal > 0 ? Math.round((rejected / processedTotal) * 100) : 0,
    },
  };
}

// ── Module-specific system prompts ────────────────────────────────────────

const MODULE_PROMPTS: Record<string, string> = {
  attendance: `You are a senior HR analytics expert specializing in workforce attendance management. You have been given comprehensive attendance data for an organization covering metrics across employees, departments, and time periods.

Analyze this data deeply and produce a detailed, comprehensive report covering:
- The overall health of attendance across the organization with specific percentages
- Department-wise comparison: which departments lead and lag, and by how much
- Employee risk analysis: patterns in high-risk employees, common characteristics
- Trend direction and what it signals for the coming period
- Late arrival patterns and their operational impact
- Attendance correction rates and what they indicate about system usage vs. manual intervention
- Any anomalies or outliers that stand out in the data`,

  "employee-kyc": `You are a senior HR compliance specialist with expertise in employee verification and regulatory compliance. You have been given detailed KYC (Know Your Customer) verification data covering the organization's entire workforce.

Analyze this data comprehensively and produce a detailed report covering:
- Overall KYC compliance health: completion rate, pending backlog severity
- Department-wise compliance gaps: which departments need urgent action
- Risk assessment: what the pending and rejected KYC records mean for legal/regulatory exposure
- Volume analysis: scale of the problem and realistic remediation timeline
- Patterns in rejection reasons (inferred from data)
- Recommended prioritization for clearing the backlog`,

  "employee-management": `You are a senior HR business partner and workforce planning expert. You have been given comprehensive employee data covering headcount, status distribution, department breakdown, and recent joining trends.

Analyze this data in depth and produce a detailed workforce insights report covering:
- Organizational health: active vs. inactive employee ratios and what they signal
- Attrition analysis: the scale and composition of employee departures
- Departmental distribution: team size imbalances, over/understaffed areas
- Designation and role distribution insights
- Recent hiring momentum: what the last 90-day joining data reveals
- Workforce stability assessment and areas of concern
- Strategic recommendations for workforce planning`,

  recruitment: `You are a senior talent acquisition strategist and HR analytics expert. You have been given comprehensive recruitment pipeline data covering job openings, applications, hiring performance, budgets, and deadlines.

Analyze this data thoroughly and produce a detailed recruitment insights report covering:
- Pipeline efficiency: conversion rates from application to hire, bottlenecks
- Hiring velocity: job posting trends, time sensitivity of open roles
- Budget analysis: spend patterns, cost implications of open headcount
- Hiring manager performance: who is most effective and who needs support
- Application funnel health: pending reviews, application-to-interview-to-hire rates
- Deadline urgency: overdue postings and near-term closures that need action
- Experience requirement trends and what they reveal about the talent strategy
- Month-over-month momentum: acceleration or deceleration in hiring activity`,

  resignation: `You are a senior HR retention specialist and organizational health expert. You have been given comprehensive resignation data covering status distribution, approval trends, upcoming departures, and monthly patterns.

Analyze this data in depth and produce a detailed attrition and retention report covering:
- Attrition magnitude and urgency: how many people are leaving and the current backlog
- Approval pipeline: the efficiency and pattern of processing resignations
- Upcoming headcount impact: the operational risk from imminent departures
- Monthly trend: is attrition accelerating, decelerating, or stable
- Approval vs. rejection rate analysis: what it reveals about how resignations are handled
- Pending review backlog: urgency of unprocessed submissions
- Business continuity risks from the data
- Retention and succession planning recommendations`,
};

const RESPONSE_FORMAT = `

Based on the data provided, generate a comprehensive and detailed analysis in this exact JSON format:
{
  "summary": "A thorough 4-5 sentence executive overview covering the current state, key headline metrics, the most critical finding, and overall organizational health assessment.",
  "patterns": [
    "Pattern 1 with specific numbers from the data",
    "Pattern 2 with specific numbers from the data",
    "Pattern 3 with specific numbers from the data",
    "Pattern 4 with specific numbers from the data",
    "Pattern 5 with specific numbers from the data"
  ],
  "risks": [
    "Risk 1: specific concern with data-backed severity explanation",
    "Risk 2: specific concern with data-backed severity explanation",
    "Risk 3: specific concern with data-backed severity explanation"
  ],
  "recommendations": [
    "Recommendation 1: specific, actionable step with rationale tied to the data",
    "Recommendation 2: specific, actionable step with rationale tied to the data",
    "Recommendation 3: specific, actionable step with rationale tied to the data",
    "Recommendation 4: specific, actionable step with rationale tied to the data",
    "Recommendation 5: specific, actionable step with rationale tied to the data"
  ]
}

Requirements:
- Every item must reference actual numbers, percentages, or names from the data — no vague generalities
- patterns: identify 5-7 meaningful trends, comparisons, or distributions visible in the data
- risks: identify 2-4 genuine concerns backed by specific data points; use empty array [] only if data truly shows no risks
- recommendations: provide 4-6 concrete, prioritized actions HR managers should take
- summary: must include the single most important metric and the single most urgent finding
- Return ONLY the JSON object — no markdown, no explanation, no extra text`;

// ── Main handler ──────────────────────────────────────────────────────────

export async function generateInsights(req: Request, res: Response) {
  const { module, period } = req.body;

  if (!module || typeof module !== "string") {
    return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
      message: "module is required",
    });
  }

  const modulePrompt = MODULE_PROMPTS[module];
  if (!modulePrompt) {
    return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
      message: `Unknown module: ${module}`,
    });
  }

  let data: any;
  try {
    switch (module) {
      case "attendance":
        data = await fetchAttendanceData(period || "current_month");
        break;
      case "employee-management":
        data = await fetchEmployeeData();
        break;
      case "employee-kyc":
        data = await fetchKycData();
        break;
      case "recruitment":
        data = await fetchRecruitmentData();
        break;
      case "resignation":
        data = await fetchResignationData();
        break;
    }
  } catch (error: unknown) {
    logger.error("AI insights data fetch error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Failed to fetch module data",
    });
  }

  // Switch to SSE after all validation and data-fetching succeed
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (payload: object) =>
    res.write(`data: ${JSON.stringify(payload)}\n\n`);

  const systemPrompt = modulePrompt + RESPONSE_FORMAT;

  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Here is the complete ${module} data to analyze:\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
        stream: true,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!ollamaRes.ok || !ollamaRes.body)
      throw new Error(`Ollama HTTP ${ollamaRes.status}`);

    const reader = ollamaRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          const token: string = chunk.message?.content ?? "";
          if (token) send({ token });
          if (chunk.done) {
            send({ done: true });
            res.end();
            return;
          }
        } catch {
          // malformed chunk — skip
        }
      }
    }

    send({ done: true });
    res.end();
  } catch (error: unknown) {
    const err = error as Record<string, any>;
    const isTimeout =
      err.name === "TimeoutError" ||
      err.name === "AbortError" ||
      err.cause?.code === "UND_ERR_CONNECT_ERR";

    logger.error("AI insights Ollama error:", { error });
    send({
      error: isTimeout
        ? "AI service is unavailable. Please ensure Ollama is running."
        : "Failed to generate insights. Please try again.",
    });
    res.end();
  }
}
