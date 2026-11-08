import {
  computeMonthlyPaidDays,
  ledgerUsedPLFor,
  LEAVE_STATUSES_IN_EFFECT,
} from "@hrms/common";
import { readSensitiveForDisplay } from "@hrms/crypto";
import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toWireSalaryStructure } from "@hrms/common";
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

    let salaryStructure: any = await prisma.salaryStructure.findFirst({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    // SalaryStructure is the HR-configured salary and is never overwritten by
    // disbursement (see payrollDisbursement.ts) — so a past disbursed month
    // HR never separately re-edited won't have its own exact-period row here.
    // The actual paid amount for that period lives in PayrollLineItem
    // instead; synthesize an equivalent shape from it rather than reporting
    // "no salary data" for a month that was, in fact, paid.
    if (!salaryStructure && month && year) {
      const monthNum = parseInt(String(month));
      const yearNum = parseInt(String(year));
      const tenantId = getTenantId();
      const run = await prisma.payrollRun.findFirst({
        where: {
          tenantId,
          month: monthNum,
          year: yearNum,
          status: "disbursed",
        },
      });
      const lineItem = run
        ? await prisma.payrollLineItem.findFirst({
            where: { payrollRunId: run.id, userId },
          })
        : null;
      if (lineItem) {
        salaryStructure = {
          userId,
          month: monthNum,
          year: yearNum,
          grossSalary: lineItem.grossSalary,
          basicPay: lineItem.basicPay,
          hra: lineItem.hra,
          conveyance: lineItem.conveyance,
          incentive: lineItem.incentive,
          pf: lineItem.pf,
          esi: lineItem.esi,
          pt: lineItem.pt,
          deductions: lineItem.otherDeductions,
          grossEarnings: lineItem.grossSalary,
          netPayable: lineItem.netPayable,
          componentBreakdown: lineItem.componentBreakdown,
          advanceDeduction: lineItem.advanceDeduction,
          tds: lineItem.tds,
        };
      }
    }

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
        uan_no: true,
        bank_account_no: true,
        pan_no: true,
        dob: true, // used by the gateway to derive the PDF password (PAN + DDMMYYYY)
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

      const [records, leaveBalance, leaves, settings, holidayRows, exitRow] =
        await Promise.all([
          prisma.attendanceRecord.findMany({
            where: { userId, date: { gte: startDate, lte: endDate } },
            select: { status: true, date: true },
          }),
          prisma.leaveBalance?.findFirst
            ? prisma.leaveBalance.findFirst({
                where: { userId },
                select: { balances: true },
              })
            : Promise.resolve(null),
          prisma.leaveApplication?.findMany
            ? prisma.leaveApplication.findMany({
                where: {
                  userId,
                  status: { in: [...LEAVE_STATUSES_IN_EFFECT] },
                  from: { lte: endDate },
                  to: { gte: startDate },
                },
              })
            : Promise.resolve([]),
          (prisma as any).tenantSettings?.findFirst
            ? (prisma as any).tenantSettings.findFirst({
                where: { effectiveFrom: { lte: new Date() } },
                orderBy: { effectiveFrom: "desc" },
                select: { workWeekPattern: true, leavePolicies: true },
              })
            : Promise.resolve(null),
          (prisma as any).holiday?.findMany
            ? (prisma as any).holiday.findMany({ where: { year: yearNum } })
            : Promise.resolve([]),
          (prisma as any).resignation?.findFirst
            ? (prisma as any).resignation.findFirst({
                where: {
                  userId,
                  lastWorkingDay: { gte: startDate, lte: endDate },
                },
                select: { lastWorkingDay: true },
              })
            : Promise.resolve(null),
        ]);

      const inMonth = (d: Date) =>
        d.getUTCFullYear() === yearNum && d.getUTCMonth() + 1 === monthNum;
      const joined = employee.joining_date
        ? new Date(employee.joining_date)
        : null;
      const left = exitRow?.lastWorkingDay
        ? new Date(exitRow.lastWorkingDay)
        : null;
      const days = computeMonthlyPaidDays({
        year: yearNum,
        month: monthNum,
        workingDays: settings?.workWeekPattern?.workingDays ?? [1, 2, 3, 4, 5],
        holidayDateKeys: new Set<string>(
          ((holidayRows ?? []) as any[]).flatMap((r) =>
            (Array.isArray(r.holidays) ? r.holidays : []).map(
              (h: any) => h.date as string,
            ),
          ),
        ),
        attendance: records,
        leaves: (leaves ?? []) as any[],
        ledgerUsedPL: ledgerUsedPLFor(
          leaveBalance?.balances,
          yearNum,
          monthNum,
        ),
        policies: settings?.leavePolicies ?? [],
        startDay: joined && inMonth(joined) ? joined.getUTCDate() : 1,
        endDay: left && inMonth(left) ? left.getUTCDate() : totalMonthDays,
      });

      attendanceSummary = {
        month: monthNum,
        year: yearNum,
        totalMonthDays,
        presentDays: days.present + days.late, // physical presence (backward-compat field)
        halfDays: days.halfDay,
        holidayDays: days.holiday,
        weekOffDays: days.weekOff,
        wfhDays: days.wfh,
        paidLeaves: days.paidLeaves,
        paidDays: days.paidDays,
        absentDays: days.absent,
      };
    }

    return callback(null, {
      message: MESSAGES.PAYSLIP_FETCHED,
      status: status.OK,
      data: {
        // The Employee proto message's generated encode() reads camelCase
        // properties (firstName, panNo, ...) — Prisma's User model uses
        // snake_case column names, so this must be mapped explicitly rather
        // than spread as-is, or every snake_case field silently encodes as
        // empty (protobuf has no name-based passthrough, only field numbers).
        employee: {
          id: employee.id,
          username: employee.username,
          email: employee.email ?? "",
          firstName: employee.first_name ?? "",
          lastName: employee.last_name ?? "",
          department: employee.department ?? "",
          designation: employee.designation ?? "",
          joiningDate: employee.joining_date?.toISOString() ?? "",
          uanNo: readSensitiveForDisplay(employee.uan_no, "uan_no"),
          bankAccountNo: readSensitiveForDisplay(
            employee.bank_account_no,
            "bank_account_no",
          ),
          panNo: readSensitiveForDisplay(employee.pan_no, "pan_no"),
          dob: employee.dob?.toISOString() ?? "",
        },
        salaryStructure: toWireSalaryStructure(salaryStructure),
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
