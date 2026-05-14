import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const getPayslip = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, month, year } = call.request;

    if (!userId) {
      return callback(null, {
        message: MESSAGES.USERNAME_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const where: any = { userId };
    if (month) where.month = parseInt(String(month));
    if (year) where.year = parseInt(String(year));

    const salaryStructure = await prisma.salaryStructure.findFirst({
      where,
      orderBy: { createdAt: "desc" },
    });

    if (!salaryStructure) {
      return callback(null, {
        message: MESSAGES.NO_SALARY_STRUCTURE_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const employee = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        first_name: true,
        last_name: true,
        department: true,
        designation: true,
        joining_date: true,
      },
    });

    if (!employee) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    let attendanceSummary = null;
    if (month && year) {
      const monthNum = parseInt(String(month));
      const yearNum = parseInt(String(year));
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);

      const records = await prisma.attendanceRecord.findMany({
        where: { userId, date: { gte: startDate, lte: endDate } },
      });

      const presentStatuses = ["present", "late", "half day"];
      attendanceSummary = {
        month: monthNum,
        year: yearNum,
        presentDays: records.filter((r) =>
          presentStatuses.includes((r.status ?? "").toLowerCase()),
        ).length,
        absentDays: records.filter(
          (r) => (r.status ?? "").toLowerCase() === "absent",
        ).length,
      };
    }

    return callback(null, {
      message: MESSAGES.PAYSLIP_FETCHED,
      status: status.OK,
      data: { employee, salaryStructure, attendanceSummary },
    });
  } catch (err) {
    logger.error("GetPayslip error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
