import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const getLeaveAnalytics = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { startDate, endDate } = call.request;

    const cacheKey = `analytics:leave:${startDate || ""}:${endDate || ""}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: any = {};
    if (startDate) where.from = { gte: startDate };
    if (endDate) where.to = { lte: endDate };

    const leaves = await prisma.leaveApplication.findMany({
      where,
      select: { leaveType: true, status: true },
    });

    const byType: Record<string, number> = {};
    for (const l of leaves) {
      byType[l.leaveType] = (byType[l.leaveType] || 0) + 1;
    }

    const data = Object.entries(byType).map(([type, count]) => ({
      label: type,
      value: count,
      date: "",
    }));

    const response = {
      message: MESSAGES.LEAVE_ANALYTICS_FETCHED,
      status: status.OK,
      data,
      total: leaves.length,
    };
    await cacheManager.set(cacheKey, response, "analytics");
    return callback(null, response);
  } catch (err) {
    logger.error("GetLeaveAnalytics error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  }
};
