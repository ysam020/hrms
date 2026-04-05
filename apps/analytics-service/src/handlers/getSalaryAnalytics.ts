import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const getSalaryAnalytics = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { year } = call.request;

    const cacheKey = `analytics:salary:${year || ""}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: any = {};
    if (year) where.year = parseInt(String(year));

    const salaries = await prisma.salaryStructure.findMany({
      where,
      select: { netPayable: true, month: true, year: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    const total = salaries.reduce((sum, s) => sum + (s.netPayable ?? 0), 0);

    const data = salaries.map((s) => ({
      label: `${s.year}-${String(s.month).padStart(2, "0")}`,
      value: s.netPayable ?? 0,
      date: `${s.year}-${String(s.month).padStart(2, "0")}`,
    }));

    const response = {
      message: MESSAGES.SALARY_ANALYTICS_FETCHED,
      status: status.OK,
      data,
      total,
    };
    await cacheManager.set(cacheKey, response, "salary");
    return callback(null, response);
  } catch (err) {
    logger.error("GetSalaryAnalytics error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  }
};
