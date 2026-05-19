import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const getRecruitmentAnalytics = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:recruitment`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const applications = await prisma.jobApplication.findMany({
      select: { status: true },
    });

    const byStatus: Record<string, number> = {};
    for (const a of applications) {
      const s = a.status || "Unknown";
      byStatus[s] = (byStatus[s] || 0) + 1;
    }

    const data = Object.entries(byStatus).map(([s, count]) => ({
      label: s,
      value: count,
      date: "",
    }));

    const response = {
      message: MESSAGES.RECRUITMENT_ANALYTICS_FETCHED,
      status: status.OK,
      data,
      total: applications.length,
    };
    await cacheManager.set(cacheKey, response, "analytics");
    return callback(null, response);
  } catch (err) {
    logger.error("GetRecruitmentAnalytics error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  }
};
