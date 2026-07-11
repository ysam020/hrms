import { Request, Response } from "express";
import { salaryClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma } from "@hrms/db";
import {
  apiResponse,
  RESPONSE_STATUS,
  deriveFromComponents,
} from "@hrms/common";
import { cacheManager } from "@hrms/cache";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { isSuperUser } from "../utils/user";
import { getActiveSettings } from "./tenantSettings";
import { classifyImpliedNonWorkingDays } from "../utils/payrollCalc";
import { jsPDF } from "jspdf";

export async function updateSalary(req: Request, res: Response) {
  try {
    const { user } = req as AuthRequest;
    const { userId, year, month, salaryStructure } = req.body;
    let {
      basicPay,
      hra,
      conveyance,
      incentive,
      pf,
      esi,
      pt,
      deductions,
      components,
    } = salaryStructure;

    // Auto-derive any tenant-configured percent-of-basic component (Settings
    // → Payroll Components, calcType "percent_of_basic") that the caller
    // didn't already supply an amount for — otherwise those rules exist only
    // as config nobody ever applies, and HR has to hand-type every
    // percentage-based component for every employee.
    if (Array.isArray(components) && components.length > 0 && user?.tenantId) {
      const basicComponent = components.find((c: any) => c.code === "BASIC");
      const effectiveBasic =
        parseFloat(String(basicComponent?.amount ?? basicPay ?? 0)) || 0;
      if (effectiveBasic > 0) {
        const percentDefs = await (
          prisma as any
        ).salaryComponentDefinition.findMany({
          where: {
            tenantId: user.tenantId,
            calcType: "percent_of_basic",
            isActive: true,
          },
        });
        const presentCodes = new Set(components.map((c: any) => c.code));
        for (const def of percentDefs) {
          if (presentCodes.has(def.code)) continue; // caller already set it — don't override
          if (def.percentValue == null) continue;
          components = [
            ...components,
            {
              code: def.code,
              name: def.name,
              type: def.type,
              amount: Math.round((effectiveBasic * def.percentValue) / 100),
            },
          ];
        }
      }
    }
    const yearInt = parseInt(year);
    const monthInt = parseInt(month);
    const flatFields = {
      basicPay,
      hra,
      conveyance,
      incentive,
      pf,
      esi,
      pt,
      deductions,
      components,
    };

    // Check if a record exists for this period
    const existing: any = await grpcCall(salaryClient, "getSalaryStructure", {
      userId,
      year: yearInt,
      month: monthInt,
    });

    if (existing?.data?.id) {
      await grpcCall(salaryClient, "updateSalaryStructure", {
        id: existing.data.id,
        ...flatFields,
      });
    } else {
      await grpcCall(salaryClient, "createSalaryStructure", {
        userId,
        ...flatFields,
        month: monthInt,
        year: yearInt,
      });
    }

    // Keep User.salary in sync with the SalaryStructure so that salary-slip
    // generation and payroll-run proration always have a reliable CTC source
    // even before the first payroll run.
    let fullGross: number;
    let syncFields: Record<string, unknown>;
    if (components?.length) {
      const { legacy, grossEarnings } = deriveFromComponents(components);
      fullGross = grossEarnings;
      syncFields = {
        salaryBasicPay: legacy.basicPay,
        salaryHra: legacy.hra,
        salaryConveyance: legacy.conveyance,
        salaryPf: legacy.pf,
        salaryEsi: legacy.esi,
        salaryPt: legacy.pt,
        salaryComponentBreakdown: components,
      };
    } else {
      fullGross =
        (basicPay ?? 0) + (hra ?? 0) + (conveyance ?? 0) + (incentive ?? 0);
      syncFields = {
        salaryBasicPay: basicPay ?? undefined,
        salaryHra: hra ?? undefined,
        salaryConveyance: conveyance ?? undefined,
        salaryPf: pf ?? undefined,
        salaryEsi: esi ?? undefined,
        salaryPt: pt ?? undefined,
      };
    }

    if (fullGross > 0 && typeof (prisma.user as any)?.update === "function") {
      await prisma.user.update({
        where: { id: userId },
        data: {
          salary: fullGross,
          ...syncFields,
        },
      });
    }

    // Bust the cached employee-details payload so the Employee module reflects
    // the new salary structure immediately instead of the previously cached one.
    if (user?.tenantId) {
      await cacheManager.invalidatePattern(
        `t:${user.tenantId}:employee-details:*`,
      );
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Salary updated successfully",
    });
  } catch (error: unknown) {
    logger.error("updateSalary error:", { error });
    return handleError(res, error);
  }
}

export async function getUserSalary(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const requestedUserId = req.params.userId as string;
    const superUser = await isSuperUser(user!.userId);

    if (!superUser && requestedUserId !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const year = parseInt(String(req.params.year));
    const month = parseInt(String(req.params.month));

    const response: any = await grpcCall(salaryClient, "getSalaryStructure", {
      userId: requestedUserId,
      year,
      month,
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("getUserSalary error:", { error });
    return handleError(res, error);
  }
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export async function generateSalarySlip(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const requestedUserId = req.params.userId as string;
    const superUser = await isSuperUser(user!.userId);

    if (!superUser && requestedUserId !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const year = parseInt(String(req.params.year));
    const month = parseInt(String(req.params.month));

    const response: any = await grpcCall(salaryClient, "getPayslip", {
      userId: requestedUserId,
      year,
      month,
    });

    if (!response?.data?.salaryStructure) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "No salary data found for the selected period",
      });
    }

    const { employee, salaryStructure, attendanceSummary } = response.data;
    const employeeName =
      [employee?.first_name, employee?.last_name].filter(Boolean).join(" ") ||
      employee?.username ||
      "Employee";
    const monthLabel = `${MONTH_NAMES[(month - 1) % 12]} ${year}`;

    // ── Attendance-based salary recalculation ──────────────────────────────────
    // AttendanceRecord/LeaveBalance are business models — prismaWithTenant
    // routes them to the tenant-specific physical DB when the tenant has
    // one provisioned (Tenant.dbName), and falls back to the shared master
    // DB otherwise. The explicit tenantId filter is a no-op in the former
    // case (every row already belongs to this tenant) and required for
    // correctness in the latter.
    const tenantId = user!.tenantId;

    const totalMonthDays = new Date(year, month, 0).getDate(); // e.g. 30 for April

    const [attRecords, lbRecord, tenantSettings, holidayRecords] =
      await Promise.all([
        prisma.attendanceRecord.findMany({
          where: {
            tenantId,
            userId: requestedUserId,
            date: {
              gte: new Date(year, month - 1, 1),
              lte: new Date(year, month, 0, 23, 59, 59, 999),
            },
          },
          select: { status: true, date: true },
        }),
        prisma.leaveBalance.findFirst({
          where: { tenantId, userId: requestedUserId },
          select: { balances: true },
        }),
        tenantId ? getActiveSettings(tenantId) : Promise.resolve(null),
        (prisma as any).holiday.findMany({ where: { year } }),
      ]);
    const workingDays: number[] = (tenantSettings as any)?.workWeekPattern
      ?.workingDays ?? [1, 2, 3, 4, 5];
    const holidayDateKeys = new Set<string>(
      (holidayRecords as any[]).flatMap((r) =>
        (Array.isArray(r.holidays) ? r.holidays : []).map((h: any) => h.date),
      ),
    );

    // Count per-status attendance (case-insensitive to handle any capitalization).
    let attPresent = 0,
      attLate = 0,
      attHalfDay = 0,
      attHoliday = 0,
      attWeekOff = 0,
      attWfh = 0;
    const recordedDates = new Set<string>();
    for (const r of attRecords) {
      recordedDates.add(new Date(r.date).toISOString().slice(0, 10));
      const s = (r.status ?? "").toLowerCase();
      if (s === "present") attPresent++;
      else if (s === "late") attLate++;
      else if (s === "half day") attHalfDay++;
      else if (s === "holiday") attHoliday++;
      // Weekly offs (e.g. Sat/Sun) are non-working but still paid days.
      else if (s === "week off") attWeekOff++;
      else if (s === "wfh") attWfh++;
    }
    // Calendar-derived holidays/weekly offs — covers dates
    // reconcileAttendance.ts hasn't (yet) backfilled with an explicit
    // "Holiday"/"Week Off" record.
    const { impliedHolidays, impliedWeekOffs } = classifyImpliedNonWorkingDays(
      year,
      month,
      totalMonthDays,
      workingDays,
      holidayDateKeys,
      recordedDates,
    );
    attHoliday += impliedHolidays;
    attWeekOff += impliedWeekOffs;

    // Paid leaves from LeaveBalance.balances for this specific month.
    let paidLeaves = 0;
    if (lbRecord?.balances && Array.isArray(lbRecord.balances)) {
      const mb = (lbRecord.balances as any[]).find(
        (b: any) =>
          String(b.year) === String(year) && String(b.month) === String(month),
      );
      paidLeaves = mb?.usedPL ?? 0;
    }

    // Weighted paid days — same formula as initiatePayrollRun.
    const paidDays = Math.min(
      attPresent +
        attLate +
        attHalfDay * 0.5 +
        attHoliday +
        attWeekOff +
        attWfh +
        paidLeaves,
      totalMonthDays,
    );

    // If a real payroll run has already disbursed this exact month, its
    // PayrollLineItem holds the final, already-prorated amount that was
    // actually paid — use it as-is. Re-proportioning it again here (by the
    // same attendance ratio initiatePayrollRun already applied) would
    // silently under-report what the employee was actually paid.
    const disbursedRun = tenantId
      ? await prisma.payrollRun.findFirst({
          where: { tenantId, month, year, status: "disbursed" },
          select: { id: true },
        })
      : null;
    const disbursedLineItem = disbursedRun
      ? await prisma.payrollLineItem.findFirst({
          where: { payrollRunId: disbursedRun.id, userId: requestedUserId },
        })
      : null;

    // Tenant-configured components (including anything beyond the standard
    // 6 codes) — disbursedLineItem.componentBreakdown is a direct Prisma
    // read (already final, use as-is); salaryStructure.components is the
    // gRPC-wire-aliased form of SalaryStructure.componentBreakdown (prorate
    // by attendance for a preview payslip, same as the legacy path below).
    const componentBreakdown: Array<{
      code: string;
      name?: string;
      type: string;
      amount: number;
    }> | null =
      (disbursedLineItem as any)?.componentBreakdown ??
      (!disbursedLineItem ? (salaryStructure as any).components : null) ??
      null;

    let earningsRows: { label: string; value: number }[];
    let deductionRows: { label: string; value: number }[];

    if (componentBreakdown?.length) {
      const prorationRatio = disbursedLineItem
        ? 1
        : totalMonthDays > 0
          ? paidDays / totalMonthDays
          : 1;
      earningsRows = componentBreakdown
        .filter((c) => c.type === "earning")
        .map((c) => ({
          label: c.name || c.code,
          value: Math.round((c.amount ?? 0) * prorationRatio),
        }));
      deductionRows = componentBreakdown
        .filter((c) => c.type === "deduction")
        .map((c) => ({
          label: c.name || c.code,
          value: Math.round((c.amount ?? 0) * prorationRatio),
        }));
    } else {
      // Legacy fixed-column structure (componentBreakdown never saved for
      // this employee) — exact original behavior.
      let calcBasicPay: number,
        calcHra: number,
        calcConveyance: number,
        calcPf: number,
        calcEsi: number,
        calcPt: number,
        calcIncentive: number,
        calcOtherDed: number;

      if (disbursedLineItem) {
        calcBasicPay = disbursedLineItem.basicPay ?? 0;
        calcHra = disbursedLineItem.hra ?? 0;
        calcConveyance = disbursedLineItem.conveyance ?? 0;
        calcPf = disbursedLineItem.pf ?? 0;
        calcEsi = disbursedLineItem.esi ?? 0;
        calcPt = disbursedLineItem.pt ?? 0;
        calcIncentive = 0;
        calcOtherDed = disbursedLineItem.otherDeductions ?? 0;
      } else {
        // No disbursed run yet for this month — prorate the already-stored,
        // already-configured baseline salary structure by attendance instead
        // of recomputing Basic/HRA/Conveyance/PF/ESI/PT from a separate
        // hardcoded formula, so a preview payslip agrees with whatever was
        // actually configured for this employee (via the employee module or
        // the salary module).
        const prorationRatio =
          totalMonthDays > 0 ? paidDays / totalMonthDays : 1;
        calcBasicPay = Math.round(
          (salaryStructure.basicPay ?? 0) * prorationRatio,
        );
        calcHra = Math.round((salaryStructure.hra ?? 0) * prorationRatio);
        calcConveyance = Math.round(
          (salaryStructure.conveyance ?? 0) * prorationRatio,
        );
        calcPf = Math.round((salaryStructure.pf ?? 0) * prorationRatio);
        calcEsi = Math.round((salaryStructure.esi ?? 0) * prorationRatio);
        calcPt = Math.round((salaryStructure.pt ?? 0) * prorationRatio);
        calcIncentive = salaryStructure.incentive ?? 0;
        calcOtherDed = salaryStructure.deductions ?? 0;
      }

      earningsRows = [
        { label: "Basic Pay", value: calcBasicPay },
        { label: "HRA", value: calcHra },
        { label: "Conveyance Allowance", value: calcConveyance },
        { label: "Incentive", value: calcIncentive },
      ];
      deductionRows = [
        { label: "Provident Fund (PF)", value: calcPf },
        { label: "ESI", value: calcEsi },
        { label: "Professional Tax (PT)", value: calcPt },
        { label: "Other Deductions", value: calcOtherDed },
      ];
    }

    const calcGrossEarnings = earningsRows.reduce((s, r) => s + r.value, 0);
    const calcTotalDed = deductionRows.reduce((s, r) => s + r.value, 0);
    const calcNetPayable = Math.max(0, calcGrossEarnings - calcTotalDed);

    // ── Standard (unprorated) salary structure — the employee's configured
    // monthly baseline, as opposed to earningsRows/deductionRows above which
    // are this pay period's actual (possibly attendance-prorated) amounts.
    const structureComponents = (salaryStructure as any).components as
      | Array<{ code: string; name?: string; type: string; amount: number }>
      | undefined;

    let structureEarningsRows: { label: string; value: number }[];
    let structureDeductionRows: { label: string; value: number }[];

    if (structureComponents?.length) {
      structureEarningsRows = structureComponents
        .filter((c) => c.type === "earning")
        .map((c) => ({ label: c.name || c.code, value: c.amount ?? 0 }));
      structureDeductionRows = structureComponents
        .filter((c) => c.type === "deduction")
        .map((c) => ({ label: c.name || c.code, value: c.amount ?? 0 }));
    } else {
      structureEarningsRows = [
        { label: "Basic Pay", value: salaryStructure.basicPay ?? 0 },
        { label: "HRA", value: salaryStructure.hra ?? 0 },
        {
          label: "Conveyance Allowance",
          value: salaryStructure.conveyance ?? 0,
        },
        { label: "Incentive", value: salaryStructure.incentive ?? 0 },
      ];
      structureDeductionRows = [
        { label: "Provident Fund (PF)", value: salaryStructure.pf ?? 0 },
        { label: "ESI", value: salaryStructure.esi ?? 0 },
        { label: "Professional Tax (PT)", value: salaryStructure.pt ?? 0 },
        { label: "Other Deductions", value: salaryStructure.deductions ?? 0 },
      ];
    }
    const structureGrossSalary =
      salaryStructure.grossSalary ??
      structureEarningsRows.reduce((s, r) => s + r.value, 0);

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 15;
    const contentW = pageW - marginX * 2;

    const navyD: [number, number, number] = [15, 45, 96];
    const steel: [number, number, number] = [88, 148, 199];
    const powder: [number, number, number] = [176, 210, 235];
    const altRow: [number, number, number] = [240, 245, 252];
    const textDark: [number, number, number] = [25, 30, 50];
    const textMid: [number, number, number] = [80, 90, 110];
    const textLight: [number, number, number] = [150, 155, 170];

    const fillPoly = (pts: number[][], color: [number, number, number]) => {
      doc.setFillColor(...color);
      const [sx, sy] = pts[0];
      const moves: number[][] = [];
      for (let i = 1; i < pts.length; i++) {
        moves.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      }
      doc.lines(moves, sx, sy, [1, 1], "F", true);
    };

    // ─── Header bar ────────────────────────────────────────────────────────────
    doc.setFillColor(...navyD);
    doc.rect(0, 0, pageW, 20, "F");
    doc.setFillColor(...steel);
    doc.rect(0, 18, pageW, 2, "F");

    // Top-right corner decoration (on top of header)
    fillPoly(
      [
        [pageW - 38, 0],
        [pageW, 0],
        [pageW, 38],
      ],
      steel,
    );
    fillPoly(
      [
        [pageW - 48, 0],
        [pageW - 38, 0],
        [pageW, 38],
        [pageW, 48],
      ],
      powder,
    );

    // Logo: white circle with "P"
    doc.setFillColor(255, 255, 255);
    doc.circle(marginX + 5, 10, 5, "F");
    doc.setTextColor(...navyD);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text("P", marginX + 5, 13, { align: "center" });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Praesto", marginX + 12, 10.5);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...powder);
    doc.text("HRMS", marginX + 12, 15.5);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("SALARY SLIP", pageW - marginX - 52, 10.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...powder);
    doc.text(monthLabel.toUpperCase(), pageW - marginX - 52, 16);

    // ─── Employee name strip ────────────────────────────────────────────────────
    let curY = 26;

    doc.setFillColor(...powder);
    doc.rect(marginX, curY, contentW, 18, "F");
    doc.setFillColor(...steel);
    doc.rect(marginX, curY, 4, 18, "F");

    doc.setTextColor(...navyD);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(employeeName, marginX + 8, curY + 8);

    const subLine = [employee?.designation, employee?.department]
      .filter(Boolean)
      .join(" • ");
    if (subLine) {
      doc.setTextColor(...textMid);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.text(subLine, marginX + 8, curY + 14.5);
    }

    curY += 22;

    // ─── Employee info grid (2 × 2) ─────────────────────────────────────────────
    const infoItems = [
      { label: "USERNAME", value: employee?.username || "-" },
      { label: "PAY PERIOD", value: monthLabel },
      { label: "DEPARTMENT", value: employee?.department || "-" },
      { label: "DESIGNATION", value: employee?.designation || "-" },
    ];
    const cellW = contentW / 2;
    const cellH = 15;

    doc.setDrawColor(...powder);
    doc.setLineWidth(0.4);
    doc.rect(marginX, curY, contentW, 2 * cellH);

    infoItems.forEach((item, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = marginX + col * cellW;
      const y = curY + row * cellH;

      if (row > 0 && col === 0) {
        doc.setDrawColor(...powder);
        doc.setLineWidth(0.3);
        doc.line(marginX, y, marginX + contentW, y);
      }

      doc.setTextColor(...textLight);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(item.label, x + 4, y + 5.5);

      doc.setTextColor(...textDark);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      doc.text(item.value, x + 4, y + 12);
    });

    doc.setDrawColor(...powder);
    doc.setLineWidth(0.3);
    doc.line(marginX + cellW, curY, marginX + cellW, curY + 2 * cellH);

    curY += 2 * cellH + 10;

    // ─── Two-column salary table ─────────────────────────────────────────────────
    const colGap = 5;
    const halfW = (contentW - colGap) / 2;
    const leftX = marginX;
    const rightX = marginX + halfW + colGap;
    const rowH = 10;

    doc.setTextColor(...textMid);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text("THIS MONTH'S PAYSLIP", leftX, curY);
    curY += 5;

    const tableTop = curY;

    // Column headers
    doc.setFillColor(...steel);
    doc.rect(leftX, curY, halfW, 8, "F");
    doc.setFillColor(...navyD);
    doc.rect(rightX, curY, halfW, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text("EARNINGS", leftX + 4, curY + 5.5);
    doc.text("AMOUNT", leftX + halfW - 4, curY + 5.5, { align: "right" });
    doc.text("DEDUCTIONS", rightX + 4, curY + 5.5);
    doc.text("AMOUNT", rightX + halfW - 4, curY + 5.5, { align: "right" });

    curY += 8;

    const maxRows = Math.max(earningsRows.length, deductionRows.length);

    for (let i = 0; i < maxRows; i++) {
      if (i % 2 === 0) {
        doc.setFillColor(...altRow);
        doc.rect(leftX, curY, halfW, rowH, "F");
        doc.rect(rightX, curY, halfW, rowH, "F");
      }

      const textY = curY + 6.5;

      if (i < earningsRows.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...textDark);
        doc.text(earningsRows[i].label, leftX + 4, textY);
        doc.setFont("helvetica", "bold");
        doc.text(earningsRows[i].value.toFixed(2), leftX + halfW - 4, textY, {
          align: "right",
        });
      }

      if (i < deductionRows.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...textDark);
        doc.text(deductionRows[i].label, rightX + 4, textY);
        doc.setFont("helvetica", "bold");
        doc.text(deductionRows[i].value.toFixed(2), rightX + halfW - 4, textY, {
          align: "right",
        });
      }

      // Row separator — subtle horizontal rule under each row for a cleaner,
      // more official grid look.
      doc.setDrawColor(...powder);
      doc.setLineWidth(0.2);
      doc.line(leftX, curY + rowH, leftX + halfW, curY + rowH);
      doc.line(rightX, curY + rowH, rightX + halfW, curY + rowH);

      curY += rowH;
    }

    // Totals row — always use the attendance-derived values computed above.
    const grossEarnings = calcGrossEarnings;
    const totalDeductions = calcTotalDed;

    doc.setFillColor(...powder);
    doc.rect(leftX, curY, halfW, 9, "F");
    doc.rect(rightX, curY, halfW, 9, "F");
    doc.setTextColor(...navyD);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Gross Earnings", leftX + 4, curY + 6);
    doc.text(grossEarnings.toFixed(2), leftX + halfW - 4, curY + 6, {
      align: "right",
    });
    doc.text("Total Deductions", rightX + 4, curY + 6);
    doc.text(totalDeductions.toFixed(2), rightX + halfW - 4, curY + 6, {
      align: "right",
    });

    curY += 9;

    // Outer border + column divider around the whole header+rows+totals block.
    doc.setDrawColor(...steel);
    doc.setLineWidth(0.5);
    doc.rect(leftX, tableTop, contentW, curY - tableTop);
    doc.setDrawColor(...powder);
    doc.setLineWidth(0.3);
    doc.line(rightX - colGap / 2, tableTop, rightX - colGap / 2, curY);

    // ─── Net payable banner ─────────────────────────────────────────────────────
    const netPayable = calcNetPayable;
    curY += 6;

    doc.setFillColor(...navyD);
    doc.rect(marginX, curY, contentW, 18, "F");
    doc.setFillColor(...steel);
    doc.rect(marginX, curY, contentW, 2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text("NET PAYABLE FOR", marginX + 5, curY + 9);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(monthLabel.toUpperCase(), marginX + 5, curY + 15);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...powder);
    doc.text(
      `Rs. ${netPayable.toFixed(2)}`,
      marginX + contentW - 5,
      curY + 13,
      { align: "right" },
    );

    curY += 18;

    // ─── Attendance summary ─────────────────────────────────────────────────────
    {
      curY += 8;

      // 2-row grid: label row + value row, 6 columns.
      // All values come from the tenant-scoped attendance queries above — authoritative.
      const attItems = [
        { label: "PRESENT", value: String(attPresent + attLate) },
        { label: "HALF DAYS", value: String(attHalfDay) },
        { label: "HOLIDAYS/WFH", value: String(attHoliday + attWfh) },
        { label: "WEEK OFFS", value: String(attWeekOff) },
        { label: "PAID LEAVES", value: String(paidLeaves) },
        {
          label: `PAID / ${totalMonthDays} DAYS`,
          value: String(paidDays % 1 === 0 ? paidDays : paidDays.toFixed(1)),
        },
      ];

      const boxH = 22;
      doc.setFillColor(245, 248, 253);
      doc.rect(marginX, curY, contentW, boxH, "F");
      doc.setFillColor(...steel);
      doc.rect(marginX, curY, 3, boxH, "F");

      doc.setTextColor(...textMid);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text("ATTENDANCE SUMMARY", marginX + 7, curY + 6);

      const attColW = (contentW - 7) / attItems.length;
      attItems.forEach((item, i) => {
        const x = marginX + 7 + i * attColW;
        doc.setTextColor(...textLight);
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.text(item.label, x, curY + 13);
        doc.setTextColor(...textDark);
        doc.setFontSize(9.5);
        doc.setFont("helvetica", "bold");
        doc.text(item.value, x, curY + 19);
      });

      curY += boxH;
    }

    // ─── Salary structure (standard monthly, before proration) ─────────────────
    {
      const structRowH = 7;
      const maxStructRows = Math.max(
        structureEarningsRows.length,
        structureDeductionRows.length,
      );
      const neededHeight = 6 + 5 + 7 + maxStructRows * structRowH + 8 + 8;

      // Leave headroom only for the solid footer bar (pageH-15..pageH) plus a
      // small margin — the decorative corner polygons below only occupy the
      // bottom-left 35mm, not the full content width.
      if (curY + neededHeight > pageH - 20) {
        doc.addPage();
        curY = 20;
      } else {
        curY += 6;
      }

      doc.setTextColor(...textMid);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.text("SALARY STRUCTURE — STANDARD MONTHLY", marginX, curY);
      curY += 5;

      const structTop = curY;

      doc.setFillColor(...steel);
      doc.rect(leftX, curY, halfW, 7, "F");
      doc.setFillColor(...navyD);
      doc.rect(rightX, curY, halfW, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text("EARNINGS", leftX + 4, curY + 5);
      doc.text("AMOUNT", leftX + halfW - 4, curY + 5, { align: "right" });
      doc.text("DEDUCTIONS", rightX + 4, curY + 5);
      doc.text("AMOUNT", rightX + halfW - 4, curY + 5, { align: "right" });
      curY += 7;

      for (let i = 0; i < maxStructRows; i++) {
        const textY = curY + 5;
        if (i < structureEarningsRows.length) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...textDark);
          doc.text(structureEarningsRows[i].label, leftX + 4, textY);
          doc.setFont("helvetica", "bold");
          doc.text(
            structureEarningsRows[i].value.toFixed(2),
            leftX + halfW - 4,
            textY,
            { align: "right" },
          );
        }
        if (i < structureDeductionRows.length) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...textDark);
          doc.text(structureDeductionRows[i].label, rightX + 4, textY);
          doc.setFont("helvetica", "bold");
          doc.text(
            structureDeductionRows[i].value.toFixed(2),
            rightX + halfW - 4,
            textY,
            { align: "right" },
          );
        }
        curY += structRowH;
      }

      doc.setFillColor(...powder);
      doc.rect(leftX, curY, contentW, 8, "F");
      doc.setTextColor(...navyD);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.text("Gross Salary (Monthly)", leftX + 4, curY + 5.5);
      doc.text(
        structureGrossSalary.toFixed(2),
        leftX + contentW - 4,
        curY + 5.5,
        { align: "right" },
      );
      curY += 8;

      doc.setDrawColor(...steel);
      doc.setLineWidth(0.5);
      doc.rect(leftX, structTop, contentW, curY - structTop);
      doc.setDrawColor(...powder);
      doc.setLineWidth(0.3);
      doc.line(rightX - colGap / 2, structTop, rightX - colGap / 2, curY);

      doc.setTextColor(...textLight);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "italic");
      doc.text(
        "This is the configured monthly structure, before proration for the attendance/leave shown above.",
        marginX,
        curY + 4,
      );
      curY += 8;
    }

    // ─── Footer bar ─────────────────────────────────────────────────────────────
    fillPoly(
      [
        [0, pageH - 28],
        [0, pageH],
        [28, pageH],
      ],
      powder,
    );
    fillPoly(
      [
        [0, pageH - 35],
        [0, pageH - 28],
        [28, pageH],
        [35, pageH],
      ],
      steel,
    );

    doc.setFillColor(...navyD);
    doc.rect(0, pageH - 13, pageW, 13, "F");
    doc.setFillColor(...steel);
    doc.rect(0, pageH - 15, pageW, 2, "F");

    doc.setTextColor(...powder);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text(
      "This is a system-generated payslip and does not require a signature.",
      marginX,
      pageH - 6,
    );
    doc.text(
      `Generated on ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
      pageW - marginX,
      pageH - 6,
      { align: "right" },
    );

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="salary_slip_${employee?.username ?? requestedUserId}_${year}_${String(month).padStart(2, "0")}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error: unknown) {
    logger.error("generateSalarySlip error:", { error });
    return handleError(res, error);
  }
}
