import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const getSalaryAnalytics = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { year } = call.request;

    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:salary:${year || ""}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    // Actual disbursed payroll cost by month — sourced from PayrollLineItem
    // (the attendance-prorated amount actually paid), not SalaryStructure
    // (which only holds the HR-configured salary and is never touched by
    // disbursement; see payrollDisbursement.ts). Mongo's Prisma connector
    // can't join PayrollRun.year/month into a PayrollLineItem aggregate, so
    // this resolves in two queries and aggregates in JS, same pattern used
    // elsewhere for "latest row per user" (see analyticsRoutes.ts).
    const runWhere: any = { status: "disbursed" };
    if (year) runWhere.year = parseInt(String(year));

    const runs = await prisma.payrollRun.findMany({
      where: runWhere,
      select: { id: true, month: true, year: true },
    });
    const runById = new Map(runs.map((r) => [r.id, r]));

    const lineItems = await prisma.payrollLineItem.findMany({
      where: { payrollRunId: { in: runs.map((r) => r.id) } },
      select: { payrollRunId: true, netPayable: true },
    });

    const totalByPeriod = new Map<string, number>();
    for (const li of lineItems) {
      const run = runById.get(li.payrollRunId);
      if (!run) continue;
      const key = `${run.year}-${String(run.month).padStart(2, "0")}`;
      totalByPeriod.set(
        key,
        (totalByPeriod.get(key) ?? 0) + (li.netPayable ?? 0),
      );
    }

    const sortedKeys = [...totalByPeriod.keys()].sort();
    const data = sortedKeys.map((key) => ({
      label: key,
      value: totalByPeriod.get(key)!,
      date: key,
    }));
    const total = data.reduce((sum, d) => sum + d.value, 0);

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
