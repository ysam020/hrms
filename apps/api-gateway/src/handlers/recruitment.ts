import { Request, Response } from "express";
import dayjs from "dayjs";
import { recruitment } from "@hrms/proto";
import { recruitmentClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS, grpcToHttpStatus } from "@hrms/common";
import { cacheManager } from "@hrms/cache";
import { handleError, handleActionError } from "../utils/handleError";
import { parsePagination, PAGINATION } from "../utils/pagination";
import { isSuperUser } from "../utils/user";
import { actOnApprovalForEntity, isPrivileged } from "./approvalChains";
import { getActiveSettings, SETTINGS_DEFAULTS } from "./tenantSettings";

export async function viewJobOpenings(req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "listJobOpenings", {
      ...parsePagination(req.query),
      jobStatus: req.query.status || "",
      search: req.query.search || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function viewJobOpening(req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "getJobOpening", {
      id: req.params.id,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
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
      pipelineTemplateId,
      visibility,
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
      jobStatus: jobStatus || "Active",
      createdBy: createdBy || "",
      pipelineTemplateId: pipelineTemplateId || "",
      visibility: visibility || "external",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
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
      pipelineTemplateId,
      visibility,
    } = req.body;
    const grpcPayload: Record<string, any> = {
      id: req.params._id,
      jobTitle: jobTitle || "",
      jobDescription: jobDescription || "",
      requiredSkills: requiredSkills || "",
      experience: String(experience || "0"),
      hiringManager: hiringManager || "",
      applicationDeadline: applicationDeadline || "",
      budget: Array.isArray(budget) ? budget.map(Number) : [],
      numberOfVacancies: parseInt(String(numberOfVacancies || "0")) || 0,
    };
    if (jobStatus) grpcPayload.jobStatus = jobStatus;
    if (pipelineTemplateId) grpcPayload.pipelineTemplateId = pipelineTemplateId;
    if (visibility) grpcPayload.visibility = visibility;
    const response = await grpcCall(
      recruitmentClient,
      "updateJobOpening",
      grpcPayload,
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function deleteJobOpening(req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "deleteJobOpening", {
      id: req.params._id,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function publicCareers(req: Request, res: Response) {
  try {
    // "Open" was never a real status value — job openings are stored with
    // status "Active"/"Expired"/"Deleted" (see listJobOpenings.ts's status
    // normalization) — so this always returned zero results. Default to
    // "Active" but still honor an explicit ?status= from the caller.
    const response = await grpcCall(recruitmentClient, "listJobOpenings", {
      page: 1,
      limit: 100,
      jobStatus: (req.query.status as string) || "Active",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function publicJobOpening(req: Request, res: Response) {
  try {
    const response: any = await grpcCall(recruitmentClient, "getJobOpening", {
      id: req.params.id,
    });
    // Never expose a non-Active opening (expired/deleted) on the public
    // apply page even if a stale/guessed link is used.
    if (response?.data?.status && response.data.status !== "Active") {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "This job opening is no longer accepting applications.",
      });
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function getJobTitles(_req: Request, res: Response) {
  try {
    const response = await grpcCall(recruitmentClient, "listJobOpenings", {
      page: 1,
      limit: PAGINATION.ALL_RECORDS_LIMIT,
      jobStatus: "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function applyForJob(req: Request, res: Response) {
  try {
    const { name, mobile, email, aadharNo, jobTitleId, jobTitle, resume } =
      req.body;
    const response = await grpcCall(recruitmentClient, "applyForJob", {
      jobTitleId: jobTitleId || jobTitle || "",
      name: name || "",
      email: email || "",
      mobile: mobile || "",
      resume: resume || "",
      aadharNo: aadharNo || "",
    });
    const resp = response as any;
    return apiResponse(res, grpcToHttpStatus(resp.status), resp);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function viewApplications(req: Request, res: Response) {
  try {
    const response = (await grpcCall(recruitmentClient, "listApplications", {
      jobTitleId: req.params.id,
      applicationStatus: req.query.status || "",
      search: req.query.search || "",
      // No pagination UI on this list — fetch a large batch by default
      // instead of the standard small page size (mirrors user.ts/attendance.ts).
      ...parsePagination(
        req.query,
        PAGINATION.DEFAULT_LIMIT_LARGE,
        PAGINATION.MAX_LIMIT_LARGE,
      ),
    })) as { data?: any[] };

    // Proto strips interviews/aadharNo/reason — fetch them directly and merge
    const ids: string[] = (response.data ?? [])
      .map((a: any) => a.id)
      .filter(Boolean);
    if (ids.length > 0) {
      const extras = await prisma.jobApplication.findMany({
        where: { id: { in: ids } },
        select: { id: true, interviews: true, aadharNo: true, reason: true },
      });
      const extrasMap = new Map(extras.map((e) => [e.id, e]));
      response.data = response.data!.map((a: any) => {
        const extra = extrasMap.get(a.id);
        return extra
          ? {
              ...a,
              interviews: (extra.interviews as any[]) ?? [],
              aadharNo: extra.aadharNo ?? "",
              reason: extra.reason ?? "",
            }
          : a;
      });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function updateCandidateStatus(req: Request, res: Response) {
  try {
    const { id, status, remarks, interviewRound, feedback } = req.body;
    // fromPartial fills in every field the caller doesn't set (buyoutAmount,
    // noticePeriodWaived, etc. — UpdateStatusRequest is shared with the
    // resignation RPCs too) with its proto zero-value. Without it, an
    // omitted field is `undefined` on the plain object, and the generated
    // encoder's `!== 0`/`!== false` guard treats that as "set", then tries
    // to write `undefined` as a float/bool and throws
    // "Request message serialization failure: invalid float32: undefined".
    const response = await grpcCall(
      recruitmentClient,
      "updateApplicationStatus",
      recruitment.UpdateStatusRequest.fromPartial({
        id: id || "",
        status: status || "",
        remarks: remarks || "",
        interviewRound: interviewRound ? parseInt(String(interviewRound)) : 0,
        interviewFeedback: feedback || "",
      }),
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function hireCandidate(req: Request, res: Response) {
  try {
    const { id, remarks, salary, joining_date, reference_by } = req.body;
    const response = await grpcCall(
      recruitmentClient,
      "updateApplicationStatus",
      recruitment.UpdateStatusRequest.fromPartial({
        id: id || "",
        status: "Hired",
        remarks: remarks || "",
        salary: salary ? String(salary) : "",
        joiningDate: joining_date || "",
        referenceBy: reference_by || "",
      }),
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function rejectApplication(req: Request, res: Response) {
  try {
    // RejectModal.tsx submits this as "reason" (the form's user-facing
    // label); "remarks" is accepted too for callers that use that name.
    const { id, remarks, reason } = req.body;
    const response = await grpcCall(
      recruitmentClient,
      "updateApplicationStatus",
      recruitment.UpdateStatusRequest.fromPartial({
        id: id || "",
        status: "Rejected",
        remarks: remarks || reason || "",
      }),
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function addResignation(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      reason,
      lastDate,
      resignationDate,
      overallJobSatisfaction,
      suggestions,
      exitType,
    } = req.body;
    const response = (await grpcCall(recruitmentClient, "submitResignation", {
      userId: user!.userId,
      reason: reason || "",
      lastDate: lastDate || "",
      resignationDate: resignationDate || new Date().toISOString(),
      overallJobSatisfaction: overallJobSatisfaction
        ? parseFloat(overallJobSatisfaction)
        : 0,
      suggestions: suggestions || "",
      exitType: exitType || "voluntary",
    })) as any;
    return apiResponse(res, grpcToHttpStatus(response.status), response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

/** GET /my-resignation — the caller's own most recent resignation, if any. */
export async function getMyResignation(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = (await grpcCall(recruitmentClient, "getMyResignation", {
      userId: user!.userId,
    })) as any;
    return apiResponse(res, grpcToHttpStatus(response.status), response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function viewResignations(req: Request, res: Response) {
  const authReq = req as AuthRequest;
  const { user } = authReq;
  try {
    const privileged = await isPrivileged(authReq);
    const userId =
      privileged && req.query.userId ? String(req.query.userId) : user!.userId;

    const response = (await grpcCall(recruitmentClient, "listResignations", {
      ...parsePagination(req.query, 10),
      userId,
      status: String(req.query.status || ""),
      username: String(req.query.search || ""),
    })) as any;

    const records: any[] = response?.data ?? [];
    if (records.length > 0) {
      const userIds = [
        ...new Set(records.map((r: any) => r.userId).filter(Boolean)),
      ] as string[];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          username: true,
          first_name: true,
          last_name: true,
        },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      response.data = records.map((r: any) => {
        const userInfo = userMap.get(r.userId);
        return {
          ...r,
          username: userInfo?.username ?? r.userId,
          firstName: userInfo?.first_name,
          lastName: userInfo?.last_name,
        };
      });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("GET /view-resignations error:", { error });
    return handleError(res, error);
  }
}

export async function approveResignation(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      lastWorkingDay,
      comments,
      noticePeriodWaived,
      buyoutAmount,
      relievedFromDutyOn,
    } = req.body ?? {};
    const tenantId = user!.tenantId;
    if (!tenantId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "No active tenant.",
      });
    }
    const privileged = await isPrivileged(req as AuthRequest);
    const result = await actOnApprovalForEntity(
      tenantId,
      "resignation",
      String(req.params._id),
      user!.userId,
      "approved",
      comments || undefined,
      privileged,
      { lastWorkingDay, noticePeriodWaived, buyoutAmount, relievedFromDutyOn },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: result.isFinal
        ? "Resignation approved."
        : "Approved — forwarded to the next approver.",
      data: result,
    });
  } catch (error) {
    return handleActionError(res, error);
  }
}

export async function rejectResignation(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { rejectionReason, comments } = req.body ?? {};
    const tenantId = user!.tenantId;
    if (!tenantId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "No active tenant.",
      });
    }
    const privileged = await isPrivileged(req as AuthRequest);
    const result = await actOnApprovalForEntity(
      tenantId,
      "resignation",
      String(req.params._id),
      user!.userId,
      "rejected",
      comments || undefined,
      privileged,
      { rejectionReason },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: result.isFinal
        ? "Resignation rejected."
        : "Rejected — forwarded to the next approver.",
      data: result,
    });
  } catch (error) {
    return handleActionError(res, error);
  }
}

export async function withdrawResignation(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    // findFirst (not findUnique) so tenantId is enforced — tenants without a
    // dedicated DB share the master DB, where `id` alone doesn't prevent
    // reading another tenant's resignation.
    const resignation = await prisma.resignation.findFirst({
      where: { id: String(req.params._id), tenantId: user?.tenantId },
      select: { userId: true },
    });
    if (!resignation)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Resignation not found",
      });

    const callerIsSuperUser = await isSuperUser(user!.userId);
    if (!callerIsSuperUser && user!.userId !== resignation.userId)
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });

    // Was previously (incorrectly) calling rejectResignation with
    // status: "Withdrawn", which that handler silently ignored and always
    // recorded as "Rejected". WithdrawResignation is the real fix.
    //
    // userId is omitted entirely for a superuser withdrawing on someone
    // else's behalf — the gRPC handler's ownership check
    // (resignation.userId !== userId) only runs when userId is present, so
    // sending the superuser's own id here (as before) would always trip it
    // and reject a withdrawal this route just authorized above.
    const response = (await grpcCall(recruitmentClient, "withdrawResignation", {
      id: req.params._id,
      ...(callerIsSuperUser ? {} : { userId: user!.userId }),
    })) as any;
    return apiResponse(res, grpcToHttpStatus(response.status), response);
  } catch (error: unknown) {
    return handleError(res, error);
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
    // "Closed"/"Hired" are not real JobOpening.status values (real ones:
    // Active/Expired/Deleted) — a job whose deadline has passed but is
    // already marked Expired/Deleted has already been handled and
    // shouldn't be flagged as needing action.
    const overdueJobs = jobs.filter(
      (j) =>
        j.applicationDeadline < now &&
        !["Expired", "Deleted"].includes(j.status),
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
  } catch (error: unknown) {
    logger.error("job-openings-insights error:", { error });
    return handleError(res, error);
  }
}

// Schedule and reschedule both write to the same round slot — upserting by
// roundNumber (instead of blindly appending) keeps `interviews.length`
// equal to the number of distinct rounds, which JobApplications.tsx relies
// on to compute "the next round to schedule". Appending on reschedule used
// to inflate that count and permanently desync round numbers from array
// position for the rest of the application's lifecycle.
function upsertInterviewRound(
  interviews: any[],
  roundNumber: number,
  entry: Record<string, any>,
) {
  const idx = interviews.findIndex((i: any) => i.roundNumber === roundNumber);
  if (idx >= 0) {
    interviews[idx] = { ...interviews[idx], ...entry, roundNumber };
  } else {
    interviews.push({ roundNumber, ...entry });
  }
  return interviews;
}

// Interview date/time is stored as a "YYYYMMDDTHHmmss" string (see
// ScheduleInterviewModal.tsx). Returns null for missing/unparseable input.
function parseInterviewTime(value: unknown): dayjs.Dayjs | null {
  if (!value || typeof value !== "string") return null;
  const parsed = dayjs(value, "YYYYMMDDTHHmmss");
  return parsed.isValid() ? parsed : null;
}

export async function scheduleInterview(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      _id,
      roundNumber = 1,
      interviewStartTime,
      interviewEndTime,
      interviewer,
    } = req.body;
    const app = await prisma.jobApplication.findUnique({ where: { id: _id } });
    if (!app)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Application not found",
      });

    if (app.status === "Hired" || app.status === "Rejected") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `This candidate has already been ${app.status} and cannot be scheduled for another interview.`,
      });
    }

    if (user?.tenantId) {
      const activeSettings = await getActiveSettings(user.tenantId);
      const maxRounds =
        activeSettings?.maxInterviewRounds ??
        SETTINGS_DEFAULTS.maxInterviewRounds;
      if (roundNumber > maxRounds) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: `This tenant allows a maximum of ${maxRounds} interview round${maxRounds === 1 ? "" : "s"}.`,
        });
      }
    }

    const existingInterviews = Array.isArray(app.interviews)
      ? (app.interviews as any[])
      : [];

    // Each round must start strictly after the previous round's interview
    // ends — otherwise Round 2 could be scheduled for a slot that overlaps
    // or precedes Round 1's actual interview.
    if (roundNumber > 1) {
      const previousRound = existingInterviews.find(
        (i: any) => i.roundNumber === roundNumber - 1,
      );
      const previousEnd = parseInterviewTime(previousRound?.interviewEndTime);
      const newStart = parseInterviewTime(interviewStartTime);
      if (previousEnd && newStart && !newStart.isAfter(previousEnd)) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: `Round ${roundNumber} must be scheduled after Round ${roundNumber - 1}'s interview time (${previousEnd.format("DD MMM YYYY, HH:mm")}).`,
        });
      }
    }

    // Deliberately no separate interviewDate field — interviewStartTime is
    // the single source of truth for this round's date. A previous
    // interviewDate field (redundant with interviewStartTime) could drift
    // out of sync whenever only one of the two got updated (e.g. a direct
    // DB edit that only touched interviewStartTime/EndTime), which is
    // exactly what happened and caused the UI to show mismatched dates.
    const interviews = upsertInterviewRound(existingInterviews, roundNumber, {
      interviewStartTime,
      interviewEndTime,
      interviewer,
      interviewConducted: false,
    });

    await prisma.jobApplication.update({
      where: { id: _id },
      data: { interviews, status: `Round ${roundNumber} Scheduled` },
    });
    await cacheManager.invalidatePattern(
      `t:${user?.tenantId ?? "global"}:applications:*`,
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Interview scheduled successfully",
    });
  } catch (error: unknown) {
    logger.error("schedule-interview error:", { error });
    return handleError(res, error);
  }
}

export async function rescheduleInterview(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      _id,
      roundNumber,
      interviewStartTime,
      interviewEndTime,
      interviewer,
    } = req.body;
    if (!roundNumber) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "roundNumber is required to reschedule an interview",
      });
    }

    if (user?.tenantId) {
      const activeSettings = await getActiveSettings(user.tenantId);
      const maxRounds =
        activeSettings?.maxInterviewRounds ??
        SETTINGS_DEFAULTS.maxInterviewRounds;
      if (roundNumber > maxRounds) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: `This tenant allows a maximum of ${maxRounds} interview round${maxRounds === 1 ? "" : "s"}.`,
        });
      }
    }

    const app = await prisma.jobApplication.findUnique({ where: { id: _id } });
    if (!app)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Application not found",
      });

    if (app.status === "Hired" || app.status === "Rejected") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `This candidate has already been ${app.status} and cannot be rescheduled.`,
      });
    }

    const existingInterviews = Array.isArray(app.interviews)
      ? (app.interviews as any[])
      : [];
    const existingRound = existingInterviews.find(
      (i: any) => i.roundNumber === roundNumber,
    );
    // Defense in depth — the frontend already hides "Reschedule" once a
    // round is marked conducted, but a direct API call could still hit
    // this and silently flip an already-Completed/Cleared round back to
    // interviewConducted: false.
    if (existingRound?.interviewConducted) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Round ${roundNumber} has already been conducted and cannot be rescheduled.`,
      });
    }

    // Same "must start after the previous round ends" rule as scheduling a
    // new round applies here too.
    if (roundNumber > 1) {
      const previousRound = existingInterviews.find(
        (i: any) => i.roundNumber === roundNumber - 1,
      );
      const previousEnd = parseInterviewTime(previousRound?.interviewEndTime);
      const newStart = parseInterviewTime(interviewStartTime);
      if (previousEnd && newStart && !newStart.isAfter(previousEnd)) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: `Round ${roundNumber} must be scheduled after Round ${roundNumber - 1}'s interview time (${previousEnd.format("DD MMM YYYY, HH:mm")}).`,
        });
      }
    }

    const interviews = upsertInterviewRound(existingInterviews, roundNumber, {
      interviewStartTime,
      interviewEndTime,
      interviewer,
      interviewConducted: false,
    });

    await prisma.jobApplication.update({
      where: { id: _id },
      data: { interviews, status: `Round ${roundNumber} Rescheduled` },
    });
    await cacheManager.invalidatePattern(
      `t:${user?.tenantId ?? "global"}:applications:*`,
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Interview rescheduled successfully",
    });
  } catch (error: unknown) {
    logger.error("reschedule-interview error:", { error });
    return handleError(res, error);
  }
}

export async function reassignInterviewer(req: Request, res: Response) {
  const { user } = req as AuthRequest;
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
    await cacheManager.invalidatePattern(
      `t:${user?.tenantId ?? "global"}:applications:*`,
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Interviewer reassigned successfully",
    });
  } catch (error: unknown) {
    logger.error("reassign-interviewer error:", { error });
    return handleError(res, error);
  }
}

export async function getInterviewerList(_req: Request, res: Response) {
  try {
    // Scopeless permission strings are stored as exactly "Module:action"
    // (see togglePermission.tsx) — superusers implicitly have every
    // permission and aren't required to hold it explicitly.
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { isSuperUser: true },
          { permissions: { has: "JobOpenings:take_interview" } },
        ],
      },
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
  } catch (error: unknown) {
    logger.error("get-interviewer-list error:", { error });
    return handleError(res, error);
  }
}

export async function updateResignation(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { status: updateType, value } = req.body;
    // findFirst (not findUnique) so tenantId is enforced — tenants without a
    // dedicated DB share the master DB, where `id` alone doesn't prevent
    // acting on another tenant's resignation.
    const resignation = await prisma.resignation.findFirst({
      where: { id: String(req.params._id), tenantId: user?.tenantId },
    });
    if (!resignation)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Resignation not found",
      });

    const updateData: any = { lastUpdatedOn: new Date() };
    if (updateType === "Assets Returned") updateData.assetsReturned = value;
    else if (updateType === "FnF Done") updateData.fnfDone = value;
    else
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Unrecognized status "${updateType}" — expected "Assets Returned" or "FnF Done".`,
      });

    const updated = await prisma.resignation.update({
      where: { id: String(req.params._id) },
      data: updateData,
    });
    await cacheManager.invalidatePattern(
      `t:${user?.tenantId ?? "global"}:resignations:*`,
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Resignation updated successfully",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("update-resignation error:", { error });
    return handleError(res, error);
  }
}

export async function addExitFeedback(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    // tenantId scoped, and ordered so a rehired employee's most recent
    // Approved resignation (not an older one) is the one feedback attaches to.
    const resignation = await prisma.resignation.findFirst({
      where: {
        userId: user!.userId,
        tenantId: user?.tenantId,
        status: "Approved",
      },
      orderBy: { approvedOn: "desc" },
    });
    if (!resignation)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "You must have an approved resignation to submit exit feedback",
      });
    // qualityOfCommunication is only ever written here — unlike
    // overallJobSatisfaction, which submitResignation also accepts at
    // submission time, so it can't reliably signal "feedback already
    // submitted" (an employee rating satisfaction when resigning would be
    // permanently locked out of this endpoint otherwise).
    if (resignation.qualityOfCommunication)
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
    await cacheManager.invalidatePattern(
      `t:${user?.tenantId ?? "global"}:resignations:*`,
    );
    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Exit feedback submitted successfully",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("add-exit-feedback error:", { error });
    return handleError(res, error);
  }
}

export async function resignationInsights(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const tenantId = user?.tenantId;
    const [total, submitted, approved, rejected, withdrawn] = await Promise.all(
      [
        prisma.resignation.count({ where: { tenantId } }),
        prisma.resignation.count({ where: { tenantId, status: "Submitted" } }),
        prisma.resignation.count({ where: { tenantId, status: "Approved" } }),
        prisma.resignation.count({ where: { tenantId, status: "Rejected" } }),
        prisma.resignation.count({ where: { tenantId, status: "Withdrawn" } }),
      ],
    );

    const processedTotal = approved + rejected;
    const approvalRate =
      processedTotal > 0 ? Math.round((approved / processedTotal) * 100) : 0;

    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const upcomingDepartures = await prisma.resignation.findMany({
      where: {
        tenantId,
        status: "Approved",
        lastWorkingDay: { lte: nextMonth, gte: new Date() },
      },
      select: { userId: true, lastWorkingDay: true },
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
          userId: r.userId,
          lastWorkingDay: r.lastWorkingDay,
        })),
      },
    });
  } catch (error: unknown) {
    logger.error("resignation-insights error:", { error });
    return handleError(res, error);
  }
}
