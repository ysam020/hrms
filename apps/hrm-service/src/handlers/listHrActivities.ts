import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";

export const listHrActivities = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { status: filterStatus, page = 1, limit = 10 } = call.request;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 10;
    const skip = (pageNum - 1) * limitNum;

    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:hrActivities:${filterStatus || "all"}:p${pageNum}:l${limitNum}`;
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
        scheduledAt: a.scheduledAt.toISOString(),
        date: dayjs(a.scheduledAt).format("YYYY-MM-DD"),
        time: dayjs(a.scheduledAt).format("HH:mm"),
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
