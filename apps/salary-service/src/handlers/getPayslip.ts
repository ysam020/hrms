import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

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
        salary: true, // full monthly CTC — used by gateway for pro-rata recalculation
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
      const monthStart = dayjs.utc(
        `${yearNum}-${String(monthNum).padStart(2, "0")}-01`,
      );
      const startDate = monthStart.toDate();
      const endDate = monthStart.endOf("month").toDate();
      const totalMonthDays = monthStart.daysInMonth();

      const [records, leaveBalance] = await Promise.all([
        prisma.attendanceRecord.findMany({
          where: { userId, date: { gte: startDate, lte: endDate } },
          select: { status: true },
        }),
        prisma.leaveBalance.findFirst({
          where: { userId },
          select: { balances: true },
        }),
      ]);

      // Count each attendance status separately so the PDF can display a full breakdown.
      let present = 0,
        late = 0,
        halfDay = 0,
        holiday = 0,
        wfh = 0,
        absentDays = 0;
      for (const r of records) {
        const s = (r.status ?? "").toLowerCase();
        if (s === "present") present++;
        else if (s === "late") late++;
        else if (s === "half day") halfDay++;
        else if (s === "holiday") holiday++;
        else if (s === "wfh") wfh++;
        else if (s === "absent") absentDays++;
      }

      // Paid leaves from LeaveBalance for this specific month.
      let paidLeaves = 0;
      if (leaveBalance?.balances && Array.isArray(leaveBalance.balances)) {
        const mb = (leaveBalance.balances as any[]).find(
          (b: any) =>
            String(b.year) === String(yearNum) &&
            String(b.month) === String(monthNum),
        );
        paidLeaves = mb?.usedPL ?? 0;
      }

      // Weighted paid days — same formula used by initiatePayrollRun.
      const paidDays = Math.min(
        present + late + halfDay * 0.5 + holiday + wfh + paidLeaves,
        totalMonthDays,
      );

      attendanceSummary = {
        month: monthNum,
        year: yearNum,
        totalMonthDays,
        presentDays: present + late, // physical presence (backward-compat field)
        halfDays: halfDay,
        holidayDays: holiday,
        wfhDays: wfh,
        paidLeaves,
        paidDays,
        absentDays,
      };
    }

    return callback(null, {
      message: MESSAGES.PAYSLIP_FETCHED,
      status: status.OK,
      data: {
        employee: {
          ...employee,
          joining_date: employee.joining_date?.toISOString() ?? null,
        },
        salaryStructure,
        attendanceSummary,
      },
    });
  } catch (err) {
    logger.error("GetPayslip error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
