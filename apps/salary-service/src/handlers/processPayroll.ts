import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export const processPayroll = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { month, year, userIds } = call.request;

    if (!month || !year) {
      return callback(null, {
        message: MESSAGES.MONTH_YEAR_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const monthNum = parseInt(String(month));
    const yearNum = parseInt(String(year));

    const monthStart = dayjs.utc(
      `${yearNum}-${String(monthNum).padStart(2, "0")}-01`,
    );
    const monthEnd = monthStart.endOf("month");
    const lastDay = monthStart.daysInMonth();
    const startDate = monthStart.toDate();
    const endDate = monthEnd.toDate();

    const employeeWhere: any = { employeeStatus: "Active" };
    if (userIds && userIds.length > 0) employeeWhere.id = { in: userIds };

    const employees = await prisma.user.findMany({
      where: employeeWhere,
      select: {
        id: true,
        username: true,
        email: true,
        first_name: true,
        last_name: true,
      },
    });

    const payrollResults = [];

    for (const employee of employees) {
      try {
        const salaryStructure = await prisma.salaryStructure.findFirst({
          where: {
            userId: employee.id,
            month: monthNum,
            year: yearNum,
          },
          orderBy: { createdAt: "desc" },
        });

        if (!salaryStructure) {
          payrollResults.push({
            userId: employee.id,
            username: employee.username,
            status: "skipped",
            reason: "No salary structure",
          });
          continue;
        }

        const records = await prisma.attendanceRecord.findMany({
          where: {
            userId: employee.id,
            date: { gte: startDate, lte: endDate },
          },
        });

        const presentStatuses = ["present", "late", "half day"];
        const presentDays = records.filter((r) =>
          presentStatuses.includes((r.status ?? "").toLowerCase()),
        ).length;
        const halfDays = records.filter(
          (r) => (r.status ?? "").toLowerCase() === "half day",
        ).length;
        const effectiveDays = presentDays - halfDays * 0.5;

        const dailyNet = (salaryStructure.netPayable ?? 0) / lastDay;
        const lopDeduction = Math.max(0, (lastDay - effectiveDays) * dailyNet);
        const finalNet = Math.max(
          0,
          (salaryStructure.netPayable ?? 0) - lopDeduction,
        );

        payrollResults.push({
          userId: employee.id,
          username: employee.username,
          month: monthNum,
          year: yearNum,
          grossSalary: salaryStructure.grossSalary,
          deductions: (salaryStructure.deductions ?? 0) + lopDeduction,
          lopDeduction,
          netPayable: finalNet,
          presentDays: effectiveDays,
          totalDays: lastDay,
          status: "processed",
        });
      } catch (empErr) {
        logger.error(`Payroll error for ${employee.id}:`, { empErr });
        payrollResults.push({
          userId: employee.id,
          username: employee.username,
          status: "error",
          reason: String(empErr),
        });
      }
    }

    return callback(null, {
      message: MESSAGES.PAYROLL_PROCESSED,
      status: status.OK,
      data: payrollResults,
      processedCount: payrollResults.filter((r) => r.status === "processed")
        .length,
      skippedCount: payrollResults.filter((r) => r.status === "skipped").length,
      errorCount: payrollResults.filter((r) => r.status === "error").length,
    });
  } catch (err) {
    logger.error("ProcessPayroll error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
