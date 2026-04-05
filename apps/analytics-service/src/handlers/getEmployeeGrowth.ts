import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const getEmployeeGrowth = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { startDate, endDate } = call.request;

    const cacheKey = `analytics:employeeGrowth:${startDate || ""}:${endDate || ""}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: any = {};
    if (startDate) where.createdAt = { gte: new Date(startDate) };
    if (endDate)
      where.createdAt = { ...where.createdAt, lte: new Date(endDate) };

    const employees = await prisma.user.findMany({
      where,
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const byMonth: Record<string, number> = {};
    for (const e of employees) {
      const month = e.createdAt?.toISOString().substring(0, 7) ?? "unknown";
      byMonth[month] = (byMonth[month] || 0) + 1;
    }

    const data = Object.entries(byMonth).map(([month, count]) => ({
      label: month,
      value: count,
      date: month,
    }));

    const response = {
      message: MESSAGES.EMPLOYEE_GROWTH_FETCHED,
      status: status.OK,
      data,
      total: employees.length,
    };
    await cacheManager.set(cacheKey, response, "analytics");
    return callback(null, response);
  } catch (err) {
    logger.error("GetEmployeeGrowth error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  }
};
