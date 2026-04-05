import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const listApplications = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      jobTitleId,
      applicationStatus,
      page = 1,
      limit = 10,
    } = call.request;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 10;
    const skip = (pageNum - 1) * limitNum;

    const cacheKey = `applications:${jobTitleId || ""}:${applicationStatus || "all"}:p${pageNum}:l${limitNum}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: Record<string, any> = {};
    if (jobTitleId) where.jobTitleId = jobTitleId;
    if (applicationStatus && applicationStatus !== "all")
      where.status = applicationStatus;

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({ where, skip, take: limitNum }),
      prisma.jobApplication.count({ where }),
    ]);

    const response = {
      message: MESSAGES.APPLICATIONS_LISTED,
      status: status.OK,
      data: applications,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
    await cacheManager.set(cacheKey, response, "recruitment");
    return callback(null, response);
  } catch (err) {
    logger.error("ListApplications error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
