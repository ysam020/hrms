import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const listJobOpenings = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { jobStatus, search, page = 1, limit = 10 } = call.request;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 10;
    const skip = (pageNum - 1) * limitNum;

    const cacheKey = `jobOpenings:${jobStatus || "all"}:${search || ""}:p${pageNum}:l${limitNum}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: Record<string, any> = { status: { not: "deleted" } };
    if (jobStatus && jobStatus !== "all") where.status = jobStatus;
    if (search) {
      where.OR = [
        { jobTitle: { contains: search, mode: "insensitive" } },
        { jobDescription: { contains: search, mode: "insensitive" } },
        { hiringManager: { contains: search, mode: "insensitive" } },
      ];
    }

    const [jobOpenings, total] = await Promise.all([
      prisma.jobOpening.findMany({
        where,
        orderBy: { createdOn: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.jobOpening.count({ where }),
    ]);

    const data = jobOpenings.map((j) => ({
      id: j.id,
      jobTitle: j.jobTitle,
      numberOfVacancies: j.numberOfVacancies ?? 0,
      jobPostingDate: j.jobPostingDate ? j.jobPostingDate.toISOString() : "",
      applicationDeadline: j.applicationDeadline
        ? j.applicationDeadline.toISOString()
        : "",
      jobDescription: j.jobDescription || "",
      requiredSkills: j.requiredSkills || "",
      experience: j.experience ?? 0,
      budget: Array.isArray(j.budget) ? j.budget : [],
      department: j.department || "",
      hiringManager: j.hiringManager || "",
      candidatesHired: j.candidatesHired ?? 0,
      status: j.status || "",
      createdBy: j.createdBy || "",
      createdOn: j.createdOn ? j.createdOn.toISOString() : "",
    }));

    const response = {
      message: MESSAGES.JOB_OPENINGS_LISTED,
      status: status.OK,
      data,
      total,
    };
    await cacheManager.set(cacheKey, response, "recruitment");
    return callback(null, response);
  } catch (err) {
    logger.error("ListJobOpenings error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  }
};
