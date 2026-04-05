import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const listHrActivities = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { status: filterStatus, page = 1, limit = 10 } = call.request;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 10;
    const skip = (pageNum - 1) * limitNum;

    const cacheKey = `hrActivities:${filterStatus || "all"}:p${pageNum}:l${limitNum}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: Record<string, any> = {
      status: { not: "deleted" },
    };

    if (filterStatus && filterStatus !== "all") {
      where.status = filterStatus;
    }

    const [activities, total] = await Promise.all([
      prisma.hrActivity.findMany({
        where,
        orderBy: { createdOn: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.hrActivity.count({ where }),
    ]);

    const response = {
      message: MESSAGES.HR_ACTIVITIES_LISTED,
      status: status.OK,
      data: activities.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description || "",
        date: a.date || "",
        time: a.time || "",
        status: a.status || "",
        createdBy: a.createdBy || "",
        createdOn: a.createdOn ? a.createdOn.toISOString() : "",
      })),
      total,
    };

    await cacheManager.set(cacheKey, response, "hrActivity");
    return callback(null, response);
  } catch (err) {
    logger.error("ListHrActivities error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
