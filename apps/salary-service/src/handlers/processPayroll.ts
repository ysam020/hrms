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

    // Batch-fetch every employee's salary structure and attendance records
    // in two queries instead of two sequential round trips per employee
    // (previously 2n awaited queries for n employees), then index both into
    // Maps keyed by userId for O(1) lookup while iterating in memory below.
    const employeeIds = employees.map((e) => e.id);

    const [salaryStructures, attendanceRecords] =
      employeeIds.length > 0
        ? await Promise.all([
            prisma.salaryStructure.findMany({
              where: {
                userId: { in: employeeIds },
                month: monthNum,
                year: yearNum,
              },
              orderBy: { createdAt: "desc" },
            }),
            prisma.attendanceRecord.findMany({
              where: {
                userId: { in: employeeIds },
                date: { gte: startDate, lte: endDate },
              },
            }),
          ])
        : [[], []];

    // Results are ordered by createdAt desc, so the first entry seen per
    // userId is the latest one — matches the original findFirst semantics.
    const salaryStructureByUserId = new Map<
      string,
      (typeof salaryStructures)[number]
    >();
    for (const s of salaryStructures) {
      if (!salaryStructureByUserId.has(s.userId)) {
        salaryStructureByUserId.set(s.userId, s);
      }
    }

    const attendanceByUserId = new Map<string, typeof attendanceRecords>();
    for (const r of attendanceRecords) {
      const existing = attendanceByUserId.get(r.userId);
      if (existing) existing.push(r);
      else attendanceByUserId.set(r.userId, [r]);
    }

    for (const employee of employees) {
      try {
        const salaryStructure = salaryStructureByUserId.get(employee.id);

        if (!salaryStructure) {
          payrollResults.push({
            userId: employee.id,
            username: employee.username,
            status: "skipped",
            reason: "No salary structure",
          });
          continue;
        }

        const records = attendanceByUserId.get(employee.id) ?? [];

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
