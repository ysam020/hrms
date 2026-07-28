import { Request, Response } from "express";
import dayjs from "dayjs";
import path from "path";
import { randomUUID } from "crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { recruitment } from "@hrms/proto";
import { recruitmentClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import {
  prismaWithTenant as prisma,
  prisma as masterPrisma,
  canonicalizeEmail,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import {
  apiResponse,
  RESPONSE_STATUS,
  grpcToHttpStatus,
  tenantFrom,
  tenantReplyTo,
  renderEmailHtml,
  buildIcsInvite,
} from "@hrms/common";
import { notify } from "@hrms/notifications";
import { cacheManager } from "@hrms/cache";
import { handleError, handleActionError } from "../utils/handleError";
import { parsePagination, PAGINATION } from "../utils/pagination";
import { isSuperUser } from "../utils/user";
import { actOnApprovalForEntity, isPrivileged } from "./approvalChains";
import { getActiveSettings, SETTINGS_DEFAULTS } from "./tenantSettings";
import { createInterviewMeetEvent } from "../services/googleCalendar";
import { buildOfferLetterPdf } from "./offerLetter";
import { s3Client, S3_BUCKET, S3_URL_PREFIX, s3FileUrl } from "../config/s3";

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

export async function bulkDeleteJobOpenings(req: Request, res: Response) {
  try {
    const { ids } = req.body as { ids: string[] };

    const results = await Promise.allSettled(
      ids.map((id) => grpcCall(recruitmentClient, "deleteJobOpening", { id })),
    );
    const succeeded: string[] = [];
    const failed: { id: string; message: string }[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        succeeded.push(ids[i]);
      } else {
        failed.push({
          id: ids[i],
          message:
            result.reason instanceof Error
              ? result.reason.message
              : "Failed to delete",
        });
      }
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `${succeeded.length} job opening(s) deleted`,
      data: { succeeded, failed },
    });
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

    // resume is populated client-side from the presigned-upload response
    // (getResumeUploadUrl below), never uploaded inline — reject anything
    // that isn't a URL to this tenant's own job_applications/ prefix so an
    // anonymous caller can't stuff an arbitrary string into the field.
    if (
      resume &&
      !String(resume).startsWith(
        s3FileUrl(`job_applications/${getTenantId()}/`),
      )
    ) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid resume upload.",
      });
    }

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

/**
 * POST /public/careers/:slug/resume-upload-url
 * Public presigned-upload endpoint for the careers-page application form —
 * mirrors getPresignedUrl in handlers/general.ts, but scoped strictly to a
 * single PDF resume and reachable without authentication (a candidate has no
 * JWT). Keyed by the resolved tenant's id (set by resolvePublicTenant), not
 * the public slug, so applyForJob's ownership check above and
 * getResumeViewUrl below can compare stable ids.
 */
export async function getResumeUploadUrl(req: Request, res: Response) {
  try {
    const { fileName, fileType } = req.body;

    if (!fileName || !fileType) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "fileName and fileType are required",
      });
    }

    const ext = path.extname(fileName).toLowerCase();
    if (ext !== ".pdf" || fileType !== "application/pdf") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Only PDF files are accepted",
      });
    }

    const key = `job_applications/${getTenantId()}/${randomUUID()}.pdf`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: fileType,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pre-signed URL generated",
      data: { url, fileUrl: s3FileUrl(key) },
    });
  } catch (error: unknown) {
    logger.error("resume-upload-url error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /resume-view-url
 * The bucket has no public read access, so a job application's raw resume
 * URL 403s if loaded directly. Authorization is tenant-based rather than
 * ownership-based (applicants aren't system users) — the key embeds the
 * owning tenant's id, checked against the caller's own tenantId.
 */
export async function getResumeViewUrl(req: AuthRequest, res: Response) {
  try {
    const { fileUrl } = req.body as { fileUrl?: string };
    if (
      !fileUrl ||
      typeof fileUrl !== "string" ||
      !fileUrl.startsWith(S3_URL_PREFIX)
    ) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "A valid fileUrl is required",
      });
    }

    const key = decodeURIComponent(fileUrl.slice(S3_URL_PREFIX.length));
    if (!key.startsWith("job_applications/") || key.includes("..")) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Not allowed",
      });
    }

    // job_applications/{tenantId}/{file}
    const ownerTenantId = key.split("/")[1];
    if (ownerTenantId !== req.user!.tenantId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You don't have permission to view this file.",
      });
    }

    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pre-signed view URL generated",
      data: { url },
    });
  } catch (error: unknown) {
    logger.error("resume-view-url error:", { error });
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
    return apiResponse(
      res,
      grpcToHttpStatus((response as any).status),
      response,
    );
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function hireCandidate(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { id, remarks, salary, joining_date, reference_by, components } =
      req.body as {
        id?: string;
        remarks?: string;
        salary?: string | number;
        joining_date?: string;
        reference_by?: string;
        components?: recruitment.ComponentAmount[];
      };
    const response = await grpcCall(
      recruitmentClient,
      "updateApplicationStatus",
      recruitment.UpdateStatusRequest.fromPartial({
        id: id || "",
        status: "Hired",
        remarks: remarks ? String(remarks) : "",
        salary: salary ? String(salary) : "",
        joiningDate: joining_date || "",
        referenceBy: reference_by || "",
        components: components || [],
      }),
    );

    // Best-effort: the offer letter email is a side effect of a successful
    // hire, not the point of this endpoint — a PDF/email failure here must
    // never turn an otherwise-successful hire into a failed API response.
    // Only attempt it if the hire itself actually succeeded (grpc-js
    // status.OK === 0) — updateApplicationStatus rejects plenty of hire
    // attempts (no Cleared interview round, already Hired/Rejected, etc.),
    // and this must not fire for those.
    if (user?.tenantId && (response as any)?.status === 0) {
      try {
        const letter = await buildOfferLetterPdf(id || "", user.tenantId);
        if ("buffer" in letter) {
          await notify({
            tenantId: user.tenantId,
            event: "offerLetter",
            email: {
              to: letter.candidateEmail,
              subject: `Offer of Employment — ${letter.tenantName}`,
              html: renderEmailHtml({
                title: "Offer Letter",
                tenantName: letter.tenantName,
                bodyHtml: `<h2>Dear ${letter.candidateName},</h2><p>Congratulations! Please find your offer letter attached.</p>`,
              }),
              from: tenantFrom(letter.tenantName),
              replyTo: tenantReplyTo(letter.tenantHelpEmail ?? undefined),
              attachments: [
                {
                  filename: `offer_letter_${letter.referenceNumber}.pdf`,
                  content: letter.buffer.toString("base64"),
                },
              ],
            },
          });
        } else {
          logger.warn("Skipped offer letter email:", {
            applicationId: id,
            reason: letter.error,
          });
        }
      } catch (error) {
        logger.error("Failed to send offer letter email:", {
          error,
          applicationId: id,
        });
      }
    }

    return apiResponse(
      res,
      grpcToHttpStatus((response as any).status),
      response,
    );
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

// PUT /update-assigned-official-email — lets HR/IT record the company email
// being provisioned for a hire, before that person's first login, so
// join-request approval (approveJoinRequest in handlers/tenant.ts) can match
// by exact email instead of guessing from name similarity.
export async function updateAssignedOfficialEmail(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { id, assignedOfficialEmail } = req.body as {
      id?: string;
      assignedOfficialEmail?: string;
    };
    if (!id) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "id is required.",
      });
    }
    const application = await prisma.jobApplication.findUnique({
      where: { id },
      select: { tenantId: true, status: true },
    });
    if (!application || application.tenantId !== user?.tenantId) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Application not found.",
      });
    }
    if (application.status !== "Hired") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "An assigned official email can only be recorded for a Hired candidate.",
      });
    }
    const trimmed = assignedOfficialEmail?.trim();
    const updated = await prisma.jobApplication.update({
      where: { id },
      data: {
        assignedOfficialEmail: trimmed ? canonicalizeEmail(trimmed) : null,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { assignedOfficialEmail: updated.assignedOfficialEmail },
      message: "Assigned official email updated.",
    });
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
    return apiResponse(
      res,
      grpcToHttpStatus((response as any).status),
      response,
    );
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

export async function bulkApproveResignations(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      ids,
      comments,
      lastWorkingDay,
      noticePeriodWaived,
      buyoutAmount,
      relievedFromDutyOn,
    } = req.body as {
      ids: string[];
      comments?: string;
      lastWorkingDay?: string;
      noticePeriodWaived?: boolean;
      buyoutAmount?: number;
      relievedFromDutyOn?: string;
    };
    const tenantId = user!.tenantId;
    if (!tenantId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "No active tenant.",
      });
    }
    const privileged = await isPrivileged(req as AuthRequest);

    const succeeded: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
      try {
        await actOnApprovalForEntity(
          tenantId,
          "resignation",
          id,
          user!.userId,
          "approved",
          comments || undefined,
          privileged,
          {
            lastWorkingDay,
            noticePeriodWaived,
            buyoutAmount,
            relievedFromDutyOn,
          },
        );
        succeeded.push(id);
      } catch (err) {
        failed.push({
          id,
          message: err instanceof Error ? err.message : "Failed to approve",
        });
      }
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `${succeeded.length} resignation(s) approved`,
      data: { succeeded, failed },
    });
  } catch (error) {
    return handleActionError(res, error);
  }
}

export async function bulkRejectResignations(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { ids, comments, rejectionReason } = req.body as {
      ids: string[];
      comments?: string;
      rejectionReason?: string;
    };
    const tenantId = user!.tenantId;
    if (!tenantId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "No active tenant.",
      });
    }
    const privileged = await isPrivileged(req as AuthRequest);

    const succeeded: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
      try {
        await actOnApprovalForEntity(
          tenantId,
          "resignation",
          id,
          user!.userId,
          "rejected",
          comments || undefined,
          privileged,
          { rejectionReason },
        );
        succeeded.push(id);
      } catch (err) {
        failed.push({
          id,
          message: err instanceof Error ? err.message : "Failed to reject",
        });
      }
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `${succeeded.length} resignation(s) rejected`,
      data: { succeeded, failed },
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

// Thrown when the scheduling user hasn't connected Google Calendar and
// didn't supply a manual meeting link — distinct from a generic Error so the
// handlers can attach a structured `code` the frontend uses to show a
// "connect your calendar" prompt instead of a bare error toast (see
// CALENDAR_NOT_CONNECTED_CODE below), rather than string-matching the
// message. Deliberately no fallback to a fake/placeholder link: an interview
// invite without a real, joinable meeting link is worse than blocking the
// scheduling action outright.
class CalendarNotConnectedError extends Error {}
export const CALENDAR_NOT_CONNECTED_CODE = "CALENDAR_NOT_CONNECTED";

/**
 * Creates the actual Google Calendar event (with a real Meet link, on the
 * scheduling user's own connected calendar — see services/googleCalendar.ts
 * — per-user by design, never a shared/tenant-level identity) unless the
 * caller supplied a manual meeting link instead. When a real event is
 * created, Google itself emails every attendee its own native invitation
 * (sendUpdates: "all"); only the manual-meetLink fallback (no real event to
 * notify from) gets our own tenant-branded email with an .ics attachment.
 * Shared by scheduleInterview and rescheduleInterview since both need
 * identical behavior here, just triggered from different validation paths.
 */
async function scheduleMeetEventAndNotifyCandidate(options: {
  schedulerUserId: string;
  tenantId: string;
  applicationId: string;
  candidateEmail: string | null | undefined;
  candidateName: string;
  roundNumber: number;
  startTime: dayjs.Dayjs;
  endTime: dayjs.Dayjs;
  interviewer?: string;
  manualMeetLink?: string | null;
}): Promise<string | null> {
  const [scheduler, tenant, interviewerUser] = await Promise.all([
    masterPrisma.user.findUnique({
      where: { id: options.schedulerUserId },
      select: {
        googleCalendarRefreshToken: true,
        email: true,
        first_name: true,
        last_name: true,
        username: true,
      },
    }),
    masterPrisma.tenant.findUnique({
      where: { id: options.tenantId },
      select: { name: true, helpEmail: true },
    }),
    // interviewer is stored as a username (see getInterviewerList) — resolve
    // it to a real name/email so they can be added as an invite guest.
    options.interviewer
      ? prisma.user.findFirst({
          where: { username: options.interviewer },
          select: { email: true, first_name: true, last_name: true },
        })
      : Promise.resolve(null),
  ]);

  const interviewerName = interviewerUser
    ? [interviewerUser.first_name, interviewerUser.last_name]
        .filter(Boolean)
        .join(" ") || options.interviewer
    : options.interviewer;
  const interviewerEmail = interviewerUser?.email || null;

  const attendeeEmails = [
    ...(options.candidateEmail ? [options.candidateEmail] : []),
    ...(interviewerEmail ? [interviewerEmail] : []),
  ];

  let meetLink: string | null = options.manualMeetLink?.trim() || null;
  // True once a real event exists on the scheduler's own Google Calendar —
  // Google then emails every attendee its own native invitation (see
  // sendUpdates: "all" in services/googleCalendar.ts), so we skip sending
  // our own copy below to avoid double-inviting the candidate/interviewer.
  let invitedViaGoogleCalendar = false;
  if (!meetLink) {
    if (!scheduler?.googleCalendarRefreshToken) {
      throw new CalendarNotConnectedError(
        "Connect your Google Calendar before scheduling an interview.",
      );
    }
    const { meetLink: createdLink } = await createInterviewMeetEvent({
      encryptedRefreshToken: scheduler.googleCalendarRefreshToken,
      summary: `Interview: ${options.candidateName} — Round ${options.roundNumber}`,
      description: interviewerName
        ? `Interviewer: ${interviewerName}`
        : undefined,
      startTime: options.startTime.toDate(),
      endTime: options.endTime.toDate(),
      attendeeEmails,
    });
    meetLink = createdLink;
    invitedViaGoogleCalendar = true;
  }

  // Fallback path only: no real Calendar event exists (a manually pasted
  // meetLink) for Google to send its own invitation from, so we build and
  // send our own tenant-branded email with an .ics attachment instead.
  if (options.candidateEmail && !invitedViaGoogleCalendar) {
    const tenantName = tenant?.name ?? "the hiring team";
    // The organizer is the person who actually scheduled the interview (real
    // name + email) — this is a calendar-semantics field, distinct from the
    // email's tenant-branded From: sender. The interviewer is added as a
    // guest alongside the candidate so both show up under Gmail's "Guests".
    const schedulerName =
      [scheduler?.first_name, scheduler?.last_name].filter(Boolean).join(" ") ||
      scheduler?.username ||
      tenantName;
    const schedulerEmail =
      scheduler?.email || tenant?.helpEmail || "noreply@praesto.cloud";
    const icsInvite = buildIcsInvite({
      uid: `interview-${options.applicationId}-round-${options.roundNumber}@praesto.cloud`,
      summary: `Interview: ${options.candidateName} — Round ${options.roundNumber}`,
      description: interviewerName
        ? `Interviewer: ${interviewerName}`
        : undefined,
      location: meetLink,
      startTime: options.startTime.toDate(),
      endTime: options.endTime.toDate(),
      organizerEmail: schedulerEmail,
      organizerName: schedulerName,
      attendees: [
        { email: options.candidateEmail, name: options.candidateName },
        ...(interviewerEmail
          ? [{ email: interviewerEmail, name: interviewerName }]
          : []),
      ],
    });

    await notify({
      tenantId: options.tenantId,
      event: "interviewInvite",
      email: {
        to: options.candidateEmail,
        subject: `Interview invite: Round ${options.roundNumber} — ${tenantName}`,
        html: renderEmailHtml({
          title: "Interview Invite",
          tenantName,
          bodyHtml: `<h2>Hello ${options.candidateName},</h2>
<p>You've been scheduled for <strong>Round ${options.roundNumber}</strong> of your interview with <strong>${tenantName}</strong>.</p>
<p><strong>When:</strong> ${options.startTime.format("DD MMM YYYY, HH:mm")} – ${options.endTime.format("HH:mm")}</p>
${meetLink ? `<p><strong>Join via Google Meet:</strong> <a href="${meetLink}">${meetLink}</a></p>` : ""}`,
        }),
        from: tenantFrom(tenantName),
        replyTo: tenantReplyTo(tenant?.helpEmail),
        attachments: [
          {
            filename: "interview-invite.ics",
            content: Buffer.from(icsInvite, "utf8").toString("base64"),
            // Without this, Gmail/Outlook treat it as a generic downloadable
            // file — method=REQUEST (matching the METHOD:REQUEST already set
            // inside the .ics itself, see buildIcsInvite) is what makes mail
            // clients render the full interactive invite card (When/Guests/
            // Yes-No-Maybe) instead.
            contentType: 'text/calendar; charset="UTF-8"; method=REQUEST',
          },
        ],
      },
    }).catch((e: unknown) =>
      logger.warn("interview invite notify failed:", { e }),
    );
  }

  return meetLink;
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
      meetLink: manualMeetLink,
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

    const parsedStart = parseInterviewTime(interviewStartTime);
    const parsedEnd = parseInterviewTime(interviewEndTime);
    if (!parsedStart || !parsedEnd) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "A valid interview start and end time are required.",
      });
    }
    if (!user?.tenantId || !user.userId) {
      return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
        message: "Unauthorized",
      });
    }

    let meetLink: string | null;
    try {
      meetLink = await scheduleMeetEventAndNotifyCandidate({
        schedulerUserId: user.userId,
        tenantId: user.tenantId,
        applicationId: _id,
        candidateEmail: app.email,
        candidateName: app.name ?? "Candidate",
        roundNumber,
        startTime: parsedStart,
        endTime: parsedEnd,
        interviewer,
        manualMeetLink,
      });
    } catch (err) {
      if (err instanceof CalendarNotConnectedError) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: err.message,
          code: CALENDAR_NOT_CONNECTED_CODE,
        });
      }
      throw err;
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
      meetLink,
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
      data: { meetLink },
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
      meetLink: manualMeetLink,
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

    const parsedStart = parseInterviewTime(interviewStartTime);
    const parsedEnd = parseInterviewTime(interviewEndTime);
    if (!parsedStart || !parsedEnd) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "A valid interview start and end time are required.",
      });
    }
    if (!user?.tenantId || !user.userId) {
      return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
        message: "Unauthorized",
      });
    }

    let meetLink: string | null;
    try {
      meetLink = await scheduleMeetEventAndNotifyCandidate({
        schedulerUserId: user.userId,
        tenantId: user.tenantId,
        applicationId: _id,
        candidateEmail: app.email,
        candidateName: app.name ?? "Candidate",
        roundNumber,
        startTime: parsedStart,
        endTime: parsedEnd,
        interviewer,
        manualMeetLink,
      });
    } catch (err) {
      if (err instanceof CalendarNotConnectedError) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: err.message,
          code: CALENDAR_NOT_CONNECTED_CODE,
        });
      }
      throw err;
    }

    const interviews = upsertInterviewRound(existingInterviews, roundNumber, {
      interviewStartTime,
      interviewEndTime,
      interviewer,
      interviewConducted: false,
      meetLink,
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
      data: { meetLink },
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

    if (app.status === "Hired" || app.status === "Rejected") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `This candidate has already been ${app.status} and cannot be reassigned.`,
      });
    }

    const interviews = Array.isArray(app.interviews)
      ? (app.interviews as any[])
      : [];
    const round = interviews.find((i: any) => i.roundNumber === interviewRound);
    if (!round)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: `Interview round ${interviewRound} not found`,
      });

    // Same defense-in-depth as reschedule-interview above — the frontend
    // already hides reassignment once a round is marked conducted, but a
    // direct API call could otherwise silently swap the interviewer after
    // the interview already happened (and any feedback was recorded).
    if (round.interviewConducted) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Round ${interviewRound} has already been conducted and cannot be reassigned.`,
      });
    }

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
