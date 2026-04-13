import { Request, Response } from "express";
import { z } from "zod";
import { recruitmentCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS, errorMessage } from "@hrms/common";
import { validateBody } from "../middleware/validate";
import { resolveUsername, isSuperUser } from "../utils/userHelpers";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const jobOpeningSchema = z.object({
  jobTitle: z.string().min(1).max(200),
  jobDescription: z.string().max(5000).optional().default(""),
  requiredSkills: z.string().max(1000).optional().default(""),
  experience: z
    .union([z.string().max(20), z.number()])
    .transform(String)
    .optional()
    .default("0"),
  hiringManager: z.string().max(100).optional().default(""),
  applicationDeadline: z.string().max(50).optional().default(""),
  budget: z.array(z.number()).optional().default([]),
  numberOfVacancies: z.number().int().min(0).optional().default(0),
  jobStatus: z
    .enum(["Open", "Closed", "Active", "Hired"])
    .optional()
    .default("Open"),
  createdBy: z.string().max(100).optional().default(""),
});

const applyForJobSchema = z.object({
  jobId: z.string().min(1).max(100),
  applicantName: z.string().min(1).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(20).optional().default(""),
  resumeUrl: z.string().url().max(500).optional().or(z.literal("")).default(""),
  coverLetter: z.string().max(2000).optional().default(""),
});

const candidateIdSchema = z.object({
  id: z.string().min(1).max(100),
  remarks: z.string().max(500).optional().default(""),
});

const updateCandidateStatusSchema = candidateIdSchema.extend({
  status: z.string().min(1).max(50),
});

const addResignationSchema = z.object({
  reason: z.string().max(1000).optional().default(""),
  lastWorkingDate: z.string().max(50).optional().default(""),
});

const interviewSchema = z.object({
  _id: z.string().min(1).max(100),
  roundNumber: z.number().int().min(1).optional().default(1),
  interviewDateTime: z.string().max(50).optional(),
  interviewStartTime: z.string().max(20).optional(),
  interviewEndTime: z.string().max(20).optional(),
  interviewer: z.string().max(100).optional(),
});

const reassignInterviewerSchema = z.object({
  _id: z.string().min(1).max(100),
  interviewRound: z.number().int().min(1),
  interviewer: z.string().min(1).max(100),
});

const updateResignationSchema = z.object({
  reason: z.string().max(1000).optional(),
  lastWorkingDate: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
});

const exitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  feedback: z.string().max(2000).optional().default(""),
  suggestions: z.string().max(2000).optional().default(""),
});

export const validateAddJobOpening = validateBody(jobOpeningSchema);
export const validateEditJobOpening = validateBody(
  jobOpeningSchema.partial().extend({
    jobTitle: z.string().min(1).max(200).optional(),
  }),
);
export const validateApplyForJob = validateBody(applyForJobSchema);
export const validateUpdateCandidateStatus = validateBody(
  updateCandidateStatusSchema,
);
export const validateHireCandidate = validateBody(candidateIdSchema);
export const validateRejectApplication = validateBody(candidateIdSchema);
export const validateAddResignation = validateBody(addResignationSchema);
export const validateScheduleInterview = validateBody(interviewSchema);
export const validateRescheduleInterview = validateBody(interviewSchema);
export const validateReassignInterviewer = validateBody(
  reassignInterviewerSchema,
);
export const validateUpdateResignation = validateBody(updateResignationSchema);
export const validateExitFeedback = validateBody(exitFeedbackSchema);

export async function viewJobOpenings(req: Request, res: Response) {
  try {
    const response = await recruitmentCall("listJobOpenings", {
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
      jobStatus: req.query.status || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function viewJobOpening(req: Request, res: Response) {
  try {
    const response = await recruitmentCall("getJobOpening", {
      id: req.params.id,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
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
    const response = await recruitmentCall("createJobOpening", {
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
      message: errorMessage.GENERAL.INTERNAL_ERROR,
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
    const response = await recruitmentCall("updateJobOpening", {
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
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function deleteJobOpening(req: Request, res: Response) {
  try {
    const response = await recruitmentCall("deleteJobOpening", {
      id: req.params._id,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function publicCareers(_req: Request, res: Response) {
  try {
    const response = await recruitmentCall("listJobOpenings", {
      page: 1,
      limit: 100,
      jobStatus: "Open",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getJobTitles(_req: Request, res: Response) {
  try {
    const response = await recruitmentCall("listJobOpenings", {
      page: 1,
      limit: 1000,
      jobStatus: "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function applyForJob(req: Request, res: Response) {
  try {
    const { jobId, applicantName, email, phone, resumeUrl, coverLetter } =
      req.body;
    const response = await recruitmentCall("applyForJob", {
      jobId: jobId || "",
      applicantName: applicantName || "",
      email: email || "",
      phone: phone || "",
      resumeUrl: resumeUrl || "",
      coverLetter: coverLetter || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function viewApplications(req: Request, res: Response) {
  try {
    const response = await recruitmentCall("listApplications", {
      jobTitleId: req.params.id,
      status: req.query.status || "",
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function updateCandidateStatus(req: Request, res: Response) {
  try {
    const { id, status, remarks } = req.body;
    const response = await recruitmentCall("updateApplicationStatus", {
      id: id || "",
      status: status || "",
      remarks: remarks || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function hireCandidate(req: Request, res: Response) {
  try {
    const { id, remarks } = req.body;
    const response = await recruitmentCall("updateApplicationStatus", {
      id: id || "",
      status: "Hired",
      remarks: remarks || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function rejectApplication(req: Request, res: Response) {
  try {
    const { id, remarks } = req.body;
    const response = await recruitmentCall("updateApplicationStatus", {
      id: id || "",
      status: "Rejected",
      remarks: remarks || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function addResignation(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const username = await resolveUsername(user!.userId);
    if (!username)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });
    const { reason, lastWorkingDate } = req.body;
    const response = await recruitmentCall("submitResignation", {
      username,
      reason: reason || "",
      lastWorkingDate: lastWorkingDate || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
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

    const response = await recruitmentCall("listResignations", {
      page: parseInt(String(req.query.page || "1")),
      limit: Math.min(parseInt(String(req.query.limit || "10")), 100),
      username,
      status: String(req.query.status || ""),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    logger.error("GET /view-resignations error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function approveResignation(req: Request, res: Response) {
  try {
    const response = await recruitmentCall("approveResignation", {
      id: req.params._id,
      status: "Approved",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function rejectResignation(req: Request, res: Response) {
  try {
    const response = await recruitmentCall("rejectResignation", {
      id: req.params._id,
      status: "Rejected",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function withdrawResignation(req: Request, res: Response) {
  try {
    const response = await recruitmentCall("rejectResignation", {
      id: req.params._id,
      status: "Withdrawn",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function jobOpeningsInsights(_req: Request, res: Response) {
  try {
    const [total, open, closed, groups] = await Promise.all([
      prisma.jobOpening.count(),
      prisma.jobOpening.count({
        where: { status: { in: ["Open", "Active"] } },
      }),
      prisma.jobOpening.count({
        where: { status: { in: ["Closed", "Hired"] } },
      }),
      prisma.jobOpening.groupBy({ by: ["status"], _count: { id: true } }),
    ]);
    const statusBreakdown = groups.map((g: any) => ({
      status: g.status,
      count: g._count.id,
    }));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Job opening insights fetched",
      data: { total, open, closed, statusBreakdown },
    });
  } catch (err: any) {
    logger.error("job-openings-insights error:", { err });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
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
      message: errorMessage.GENERAL.INTERNAL_ERROR,
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
      message: errorMessage.GENERAL.INTERNAL_ERROR,
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
      message: errorMessage.GENERAL.INTERNAL_ERROR,
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
      message: errorMessage.GENERAL.INTERNAL_ERROR,
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
      message: errorMessage.GENERAL.INTERNAL_ERROR,
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
      message: errorMessage.GENERAL.INTERNAL_ERROR,
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
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}
