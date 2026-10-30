import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

// Deliberately uncached. This feeds interview.interviewDate/Start/EndTime,
// which scheduleInterview/rescheduleInterview client-side validation and
// the "round can be marked Completed/Cleared after..." gate both depend on
// being correct *right now* — cacheManager.get() also warms a same-process
// in-memory copy (~5 min TTL) on every read, which a `redis-cli` flush
// can't touch, so out-of-band DB edits could leave this looking fresh in
// Redis but still stale in the running process. Application lists are
// low-traffic (HR viewing one job's candidates), so the read-latency cost
// of skipping the cache here is negligible next to that staleness risk.
export const listApplications = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      jobTitleId,
      applicationStatus,
      search,
      page = 1,
      limit = 10,
    } = call.request;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 10;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, any> = {};
    if (jobTitleId) where.jobTitleId = jobTitleId;
    if (applicationStatus && applicationStatus.toLowerCase() !== "all")
      where.status = applicationStatus;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({ where, skip, take: limitNum }),
      prisma.jobApplication.count({ where }),
    ]);

    const data = applications.map((a) => ({
      id: a.id,
      jobTitleId: a.jobTitleId || "",
      name: a.name || "",
      email: a.email || "",
      mobile: a.mobile || "",
      resume: a.resume || "",
      status: a.status || "",
      appliedAt: a.submittedAt ? a.submittedAt.toISOString() : "",
      resumeScore: a.resumeScore ?? 0,
      aiNotes: a.aiNotes || "",
      candidateId: a.candidateId || "",
      // Extra fields used by the frontend (not in proto, passed through as-is)
      interviews: a.interviews ?? [],
      reason: a.reason || "",
      assignedOfficialEmail: a.assignedOfficialEmail || "",
    }));

    const response = {
      message: MESSAGES.APPLICATIONS_LISTED,
      status: status.OK,
      data,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
    return callback(null, response);
  } catch (err) {
    logger.error("ListApplications error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
