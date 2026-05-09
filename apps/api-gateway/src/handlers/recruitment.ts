import { Request, Response } from "express";
import { recruitmentClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS, grpcToHttpStatus } from "@hrms/common";

async function resolveUsername(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  return user?.username ?? null;
}

async function isSuperUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true },
  });
  return user?.isSuperUser === true;
}

export async function viewJobOpenings(req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "listJobOpenings", {
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
      jobStatus: req.query.status || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function viewJobOpening(req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "getJobOpening", {
      id: req.params.id,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function addJobOpening(req: Request, res: Response) {
  try {
    const {
      jobTitle,
      jobDescription,
      requiredSkills,
      experience,
      hiringManager,
      applicationDeadline,
      budget,
      numberOfVacancies,
      jobStatus,
      createdBy,
    } = req.body;
    const response = await grpcCall(recruitmentClient, "createJobOpening", {
      jobTitle: jobTitle || "",
      jobDescription: jobDescription || "",
      requiredSkills: requiredSkills || "",
      experience: String(experience || "0"),
      hiringManager: hiringManager || "",
      applicationDeadline: applicationDeadline || "",
      budget: Array.isArray(budget) ? budget.map(Number) : [],
      numberOfVacancies: parseInt(String(numberOfVacancies || "0")) || 0,
      jobStatus: jobStatus || "Open",
      createdBy: createdBy || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function editJobOpening(req: Request, res: Response) {
  try {
    const {
      jobTitle,
      jobDescription,
      requiredSkills,
      experience,
      hiringManager,
      applicationDeadline,
      budget,
      numberOfVacancies,
      jobStatus,
    } = req.body;
    const response = await grpcCall(recruitmentClient, "updateJobOpening", {
      id: req.params._id,
      jobTitle: jobTitle || "",
      jobDescription: jobDescription || "",
      requiredSkills: requiredSkills || "",
      experience: String(experience || "0"),
      hiringManager: hiringManager || "",
      applicationDeadline: applicationDeadline || "",
      budget: Array.isArray(budget) ? budget.map(Number) : [],
      numberOfVacancies: parseInt(String(numberOfVacancies || "0")) || 0,
      jobStatus: jobStatus || "Open",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function deleteJobOpening(req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "deleteJobOpening", {
      id: req.params._id,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function publicCareers(_req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "listJobOpenings", {
      page: 1,
      limit: 100,
      jobStatus: "Open",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function getJobTitles(_req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "listJobOpenings", {
      page: 1,
      limit: 1000,
      jobStatus: "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function applyForJob(req: Request, res: Response) {
  try {
    const { name, mobile, email, aadharNo, jobTitleId, resume } = req.body;
    const response = await grpcCall(recruitmentClient, "applyForJob", {
      jobTitleId: jobTitleId || "",
      name: name || "",
      email: email || "",
      mobile: mobile || "",
      resume: resume || "",
      aadharNo: aadharNo || "",
    });
    const resp = response as any;
    return apiResponse(res, grpcToHttpStatus(resp.status), resp);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function viewApplications(req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "listApplications", {
      jobTitleId: req.params.id,
      applicationStatus: req.query.status || "",
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function updateCandidateStatus(req: Request, res: Response) {
  try {
    const { id, status, remarks } = req.body;
    const response = await grpcCall(
      recruitmentClient,
      "updateApplicationStatus",
      {
        id: id || "",
        status: status || "",
        remarks: remarks || "",
      },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function hireCandidate(req: Request, res: Response) {
  try {
    const { id, remarks } = req.body;
    const response = await grpcCall(
      recruitmentClient,
      "updateApplicationStatus",
      {
        id: id || "",
        status: "Hired",
        remarks: remarks || "",
      },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function rejectApplication(req: Request, res: Response) {
  try {
    const { id, remarks } = req.body;
    const response = await grpcCall(
      recruitmentClient,
      "updateApplicationStatus",
      {
        id: id || "",
        status: "Rejected",
        remarks: remarks || "",
      },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function addResignation(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { reason, lastDate, resignationDate } = req.body;
    const response = await grpcCall(recruitmentClient, "submitResignation", {
      username: user!.userId,
      reason: reason || "",
      lastDate: lastDate || "",
      resignationDate: resignationDate || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function viewResignations(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const superUser = await isSuperUser(user!.userId);
    let username: string;

    if (superUser && req.query.username) {
      username = String(req.query.username);
    } else {
      // Non-superusers can only view their own resignation
      username = (await resolveUsername(user!.userId)) ?? "";
    }

    const response = await grpcCall(recruitmentClient, "listResignations", {
      page: parseInt(String(req.query.page || "1")),
      limit: Math.min(parseInt(String(req.query.limit || "10")), 100),
      username,
      status: String(req.query.status || ""),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    logger.error("GET /view-resignations error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function approveResignation(req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "approveResignation", {
      id: req.params._id,
      status: "Approved",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function rejectResignation(req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "rejectResignation", {
      id: req.params._id,
      status: "Rejected",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function withdrawResignation(req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "rejectResignation", {
      id: req.params._id,
      status: "Withdrawn",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function jobOpeningsInsights(_req: Request, res: Response) {
  try {
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
      prisma.jobApplication.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
    ]);

    // Overview
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
    const averageApplicationsPerJob =
      totalJobOpenings > 0
        ? Math.round(totalApplications / totalJobOpenings)
        : 0;

    // Applications by status
    const applicationsByStatus: Record<string, number> = {};
    for (const g of appStatusGroups) {
      applicationsByStatus[g.status] = g._count.id;
    }

    // Top performing jobs
    const topPerformingJobs = jobs
      .map((j) => ({
        jobTitle: j.jobTitle,
        totalApplications: j._count.applications,
        hired: j.candidatesHired,
        hiringRate:
          j._count.applications > 0
            ? Math.round((j.candidatesHired / j._count.applications) * 100)
            : 0,
      }))
      .sort((a, b) => b.totalApplications - a.totalApplications)
      .slice(0, 8);

    // Experience requirements
    const expValues = jobs.map((j) => j.experience || 0);
    const avgExp =
      expValues.length > 0
        ? parseFloat(
            (expValues.reduce((s, v) => s + v, 0) / expValues.length).toFixed(
              1,
            ),
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
    const mostCommonRange =
      Object.entries(expBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";

    // Budget analysis
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
    const totalBudgetAllocation = parseFloat(
      budgetValues.reduce((s, v) => s + v, 0).toFixed(2),
    );
    const budgetRanges: Record<string, number> = {
      "< 5L": 0,
      "5-10L": 0,
      "10-20L": 0,
      "20L+": 0,
    };
    for (const bv of budgetValues) {
      if (bv < 5) budgetRanges["< 5L"]++;
      else if (bv < 10) budgetRanges["5-10L"]++;
      else if (bv < 20) budgetRanges["10-20L"]++;
      else budgetRanges["20L+"]++;
    }

    // Deadlines
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
    const overdueJobs = jobs.filter(
      (j) =>
        j.applicationDeadline < now && !["Closed", "Hired"].includes(j.status),
    ).length;
    const activeDaysToDeadline = jobs
      .filter(
        (j) =>
          ["Active", "Open"].includes(j.status) && j.applicationDeadline >= now,
      )
      .map((j) =>
        Math.ceil(
          (j.applicationDeadline.getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );
    const averageDaysToDeadline =
      activeDaysToDeadline.length > 0
        ? Math.round(
            activeDaysToDeadline.reduce((s, v) => s + v, 0) /
              activeDaysToDeadline.length,
          )
        : 0;

    // Hiring managers
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
    const topPerformers = Object.entries(managerMap)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.totalHired - a.totalHired)
      .slice(0, 5);

    // Monthly trends (last 6 months)
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

    // Actionable insights
    const actionableInsights: {
      type: string;
      title: string;
      message: string;
      priority: string;
      action: string;
    }[] = [];
    if (overdueJobs > 0) {
      actionableInsights.push({
        type: "warning",
        title: `${overdueJobs} Overdue Job Posting${overdueJobs > 1 ? "s" : ""}`,
        message: `${overdueJobs} job opening${overdueJobs > 1 ? "s have" : " has"} passed the application deadline. Consider updating the status.`,
        priority: "high",
        action: "Update Status",
      });
    }
    const pendingApps = applicationsByStatus["Applied"] || 0;
    if (pendingApps > 10) {
      actionableInsights.push({
        type: "info",
        title: "Applications Pending Review",
        message: `${pendingApps} applications are pending review.`,
        priority: "medium",
        action: "Review Applications",
      });
    }
    if (deadlinesThisWeek > 0) {
      actionableInsights.push({
        type: "warning",
        title: `${deadlinesThisWeek} Closing This Week`,
        message: `${deadlinesThisWeek} job opening${deadlinesThisWeek > 1 ? "s are" : " is"} closing within the next 7 days.`,
        priority: "low",
        action: "Review Openings",
      });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Job opening insights fetched",
      data: {
        overview: {
          activeJobOpenings,
          totalJobOpenings,
          totalApplications,
          hiringSuccessRate,
          averageApplicationsPerJob,
        },
        applications: { applicationsByStatus, totalApplications },
        topPerformingJobs,
        experienceRequirements: {
          averageExperience: avgExp,
          mostCommonRange,
          breakdown: expBreakdown,
        },
        budgetAnalysis: {
          averageBudget: avgBudget,
          totalBudgetAllocation,
          budgetRanges,
        },
        deadlines: {
          deadlinesThisWeek,
          deadlinesThisMonth,
          overdueJobs,
          averageDaysToDeadline,
        },
        hiringManagers: { topPerformers },
        trends: {
          monthlyJobPostings,
          monthlyApplications: [],
          monthlyHirings: [],
        },
        actionableInsights,
        lastUpdated: now.toISOString(),
      },
    });
  } catch (err: any) {
    logger.error("job-openings-insights error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function scheduleInterview(req: Request, res: Response) {
  try {
    const {
      _id,
      roundNumber = 1,
      interviewDateTime,
      interviewStartTime,
      interviewEndTime,
      interviewer,
    } = req.body;
    const app = await prisma.jobApplication.findUnique({ where: { id: _id } });
    if (!app)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Application not found",
      });

    const interviews = Array.isArray(app.interviews)
      ? (app.interviews as any[])
      : [];
    interviews.push({
      roundNumber,
      interviewDate: interviewDateTime,
      interviewStartTime,
      interviewEndTime,
      interviewer,
      interviewConducted: false,
    });

    await prisma.jobApplication.update({
      where: { id: _id },
      data: { interviews, status: `Round ${roundNumber} Scheduled` },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Interview scheduled successfully",
    });
  } catch (err: any) {
    logger.error("schedule-interview error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function rescheduleInterview(req: Request, res: Response) {
  try {
    const {
      _id,
      roundNumber = 1,
      interviewDateTime,
      interviewStartTime,
      interviewEndTime,
      interviewer,
    } = req.body;
    const app = await prisma.jobApplication.findUnique({ where: { id: _id } });
    if (!app)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Application not found",
      });

    const interviews = Array.isArray(app.interviews)
      ? (app.interviews as any[])
      : [];
    interviews.push({
      roundNumber,
      interviewDate: interviewDateTime,
      interviewStartTime,
      interviewEndTime,
      interviewer,
      interviewConducted: false,
    });

    await prisma.jobApplication.update({
      where: { id: _id },
      data: { interviews, status: `Round ${roundNumber} Rescheduled` },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Interview rescheduled successfully",
    });
  } catch (err: any) {
    logger.error("reschedule-interview error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function reassignInterviewer(req: Request, res: Response) {
  try {
    const { _id, interviewRound, interviewer } = req.body;
    const app = await prisma.jobApplication.findUnique({ where: { id: _id } });
    if (!app)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Application not found",
      });

    const interviews = Array.isArray(app.interviews)
      ? (app.interviews as any[])
      : [];
    const round = interviews.find((i: any) => i.roundNumber === interviewRound);
    if (!round)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: `Interview round ${interviewRound} not found`,
      });

    round.interviewer = interviewer;
    await prisma.jobApplication.update({
      where: { id: _id },
      data: { interviews },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Interviewer reassigned successfully",
    });
  } catch (err: any) {
    logger.error("reassign-interviewer error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function getInterviewerList(_req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      where: { OR: [{ role: { has: "HR" } }, { role: { has: "Manager" } }] },
      select: {
        id: true,
        username: true,
        first_name: true,
        last_name: true,
        email: true,
      },
    });
    const data = users.map((u: any) => ({
      id: u.id,
      username: u.username,
      name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username,
      email: u.email || "",
    }));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (err: any) {
    logger.error("get-interviewer-list error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function updateResignation(req: Request, res: Response) {
  try {
    const { status: updateType, value } = req.body;
    const resignation = await prisma.resignation.findUnique({
      where: { id: String(req.params._id) },
    });
    if (!resignation)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Resignation not found",
      });

    const updateData: any = { lastUpdatedOn: new Date() };
    if (updateType === "Assets Returned") updateData.assetsReturned = value;
    else if (updateType === "FnF Done") updateData.fnfDone = value;

    const updated = await prisma.resignation.update({
      where: { id: String(req.params._id) },
      data: updateData,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Resignation updated successfully",
      data: updated,
    });
  } catch (err: any) {
    logger.error("update-resignation error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function addExitFeedback(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (!dbUser)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    const resignation = await prisma.resignation.findFirst({
      where: { username: dbUser.username, status: "Approved" },
    });
    if (!resignation)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "You must have an approved resignation to submit exit feedback",
      });
    if (resignation.overallJobSatisfaction > 0)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Exit feedback has already been submitted",
      });

    const {
      overall_job_satisfaction,
      quality_of_communication,
      support_from_manager,
      appreciation_for_work,
      collaboration_within_the_team,
      overall_company_culture,
      suggestions,
    } = req.body;

    const updated = await prisma.resignation.update({
      where: { id: resignation.id },
      data: {
        overallJobSatisfaction: overall_job_satisfaction || 0,
        qualityOfCommunication: quality_of_communication || "",
        supportFromManager: support_from_manager || "",
        appreciationForWork: appreciation_for_work || "",
        collaborationWithinTheTeam: collaboration_within_the_team || "",
        overallCompanyCulture: overall_company_culture || "",
        suggestions: suggestions || "",
        feedbackSubmittedOn: new Date(),
        lastUpdatedOn: new Date(),
      },
    });
    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Exit feedback submitted successfully",
      data: updated,
    });
  } catch (err: any) {
    logger.error("add-exit-feedback error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function resignationInsights(_req: Request, res: Response) {
  try {
    const [total, submitted, approved, rejected, withdrawn] = await Promise.all(
      [
        prisma.resignation.count(),
        prisma.resignation.count({ where: { status: "Submitted" } }),
        prisma.resignation.count({ where: { status: "Approved" } }),
        prisma.resignation.count({ where: { status: "Rejected" } }),
        prisma.resignation.count({ where: { status: "Withdrawn" } }),
      ],
    );

    const processedTotal = approved + rejected;
    const approvalRate =
      processedTotal > 0 ? Math.round((approved / processedTotal) * 100) : 0;

    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const upcomingDepartures = await prisma.resignation.findMany({
      where: {
        status: "Approved",
        lastWorkingDay: { lte: nextMonth, gte: new Date() },
      },
      select: { username: true, lastWorkingDay: true },
      orderBy: { lastWorkingDay: "asc" },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Resignation insights fetched",
      data: {
        overview: {
          total,
          submitted,
          approved,
          rejected,
          withdrawn,
          approvalRate,
        },
        upcomingDepartures: upcomingDepartures.map((r: any) => ({
          username: r.username,
          lastWorkingDay: r.lastWorkingDay,
        })),
      },
    });
  } catch (err: any) {
    logger.error("resignation-insights error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}
