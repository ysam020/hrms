import { Request, Response } from "express";
import { salaryClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma, prisma as masterPrisma } from "@hrms/db";
import {
  apiResponse,
  RESPONSE_STATUS,
  deriveFromComponents,
  tenantFrom,
  tenantReplyTo,
  renderEmailHtml,
} from "@hrms/common";
import { notify } from "@hrms/notifications";
import { cacheManager } from "@hrms/cache";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { isSuperUser } from "../utils/user";
import { getActiveSettings } from "./tenantSettings";
import { classifyImpliedNonWorkingDays } from "../utils/payrollCalc";
import {
  calcMonthlyTds,
  getFinancialYear,
  remainingMonthsInFinancialYear,
  aggregateEarningsByCode,
  buildThisMonthComponents,
} from "../utils/tdsCalc";
import { jsPDF } from "jspdf";

// Owner/admin/hr (tenantRole) and superusers manage salary by default;
// SalaryManagement:update_salary lets a tenant grant that access to anyone
// else without handing out a full HR role.
async function canManageSalary(
  userId: string,
  tenantRole: string | null | undefined,
): Promise<boolean> {
  if (["owner", "admin", "hr"].includes(tenantRole ?? "")) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true, permissions: true },
  });
  if (user?.isSuperUser) return true;
  return (user?.permissions ?? []).includes("SalaryManagement:update_salary");
}

export async function updateSalary(req: Request, res: Response) {
  try {
    const { user } = req as AuthRequest;
    const allowed = await canManageSalary(user!.userId, user!.tenantRole);
    if (!allowed) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You do not have permission to manage salary structures",
      });
    }

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

export const MONTH_NAMES = [
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

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

/** Indian numbering (Crore/Lakh/Thousand) amount-in-words for the payslip's net-payable line. */
function numberToWordsIndian(amount: number): string {
  const twoDigits = (n: number): string => {
    if (n < 20) return ONES[n];
    const tens = TENS[Math.floor(n / 10)];
    const ones = n % 10;
    return ones ? `${tens}-${ONES[ones]}` : tens;
  };
  const threeDigits = (n: number): string => {
    if (n >= 100) {
      const rest = n % 100;
      return `${ONES[Math.floor(n / 100)]} Hundred${rest ? ` ${twoDigits(rest)}` : ""}`;
    }
    return twoDigits(n);
  };

  let n = Math.round(Math.abs(amount));
  if (n === 0) return "Zero";

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return parts.join(" ");
}

/** "Rs." avoids the ₹ glyph — not present in jsPDF's base14 helvetica encoding, would render as a missing-glyph box. */
export const formatINR = (n: number): string =>
  `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Password-protects every generated salary PDF (payslip, TDS worksheet) with
 * PAN + date of birth (DDMMYYYY, e.g. "AAAAA0000A10101993") — something only
 * the employee (or someone who already has their KYC details) would know.
 * Returns null when either piece is missing, which callers treat as a hard
 * block on generating the document rather than falling back to unencrypted.
 */
export function derivePdfPassword(
  panNo: string | null | undefined,
  dob: string | null | undefined,
): string | null {
  if (!panNo || !dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${panNo}${dd}${mm}${yyyy}`;
}

export interface SalarySlipResult {
  buffer: Buffer;
  employeeName: string;
  employeeUsername: string;
}

export interface PdfBuildError {
  error: string;
  status: "NOT_FOUND" | "BAD_REQUEST";
}

/**
 * Builds the salary slip PDF for one employee/period. Extracted out of the
 * generateSalarySlip Express handler so it's also callable from a
 * non-request context (payroll disbursement post-processing, an on-demand
 * "email me this payslip" endpoint) without needing a Request/Response.
 */
export async function buildSalarySlipPdf(
  requestedUserId: string,
  year: number,
  month: number,
  tenantId: string | null | undefined,
): Promise<SalarySlipResult | PdfBuildError> {
  const response: any = await grpcCall(salaryClient, "getPayslip", {
    userId: requestedUserId,
    year,
    month,
  });

  if (!response?.data?.salaryStructure) {
    return {
      error: "No salary data found for the selected period",
      status: "NOT_FOUND",
    };
  }

  const { employee, salaryStructure, attendanceSummary } = response.data;
  const employeeName =
    [employee?.firstName, employee?.lastName].filter(Boolean).join(" ") ||
    employee?.username ||
    "Employee";
  const monthLabel = `${MONTH_NAMES[(month - 1) % 12]} ${year}`;

  const pdfPassword = derivePdfPassword(employee?.panNo, employee?.dob);
  if (!pdfPassword) {
    return {
      error:
        "Cannot generate this payslip: PAN and date of birth must both be on file (used to password-protect the PDF). Complete KYC first.",
      status: "BAD_REQUEST",
    };
  }

  // ── Attendance-based salary recalculation ──────────────────────────────────
  // AttendanceRecord/LeaveBalance are business models — prismaWithTenant
  // routes them to the tenant-specific physical DB when the tenant has
  // one provisioned (Tenant.dbName), and falls back to the shared master
  // DB otherwise. The explicit tenantId filter is a no-op in the former
  // case (every row already belongs to this tenant) and required for
  // correctness in the latter.
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
  // Only populated on the legacy (no componentBreakdown) path — irrelevant
  // otherwise, since buildThisMonthComponents prefers componentBreakdown
  // when it's present and never reads this fallback in that case.
  let legacyEarningsForTds = {
    basicPay: 0,
    hra: 0,
    conveyance: 0,
    incentive: 0,
  };

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
      const prorationRatio = totalMonthDays > 0 ? paidDays / totalMonthDays : 1;
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
    legacyEarningsForTds = {
      basicPay: calcBasicPay,
      hra: calcHra,
      conveyance: calcConveyance,
      incentive: calcIncentive,
    };
  }

  // ── Salary advance EMI — itemized as its own deduction row instead of
  // being folded into a generic total. Disbursed months use the exact
  // amount that was actually deducted (PayrollLineItem.advanceDeduction /
  // SalaryStructure.advanceDeduction); an as-yet-undisbursed month
  // projects it from the employee's active advance the same way
  // initiatePayrollRun would compute it.
  let advanceDeductionAmount =
    (disbursedLineItem as any)?.advanceDeduction ??
    (salaryStructure as any).advanceDeduction ??
    0;
  if (!disbursedLineItem && !advanceDeductionAmount && tenantId) {
    const activeAdvance = await prisma.salaryAdvance.findFirst({
      where: {
        tenantId,
        userId: requestedUserId,
        status: { in: ["Approved", "Repaying"] },
      },
      select: { emiAmount: true, remainingAmount: true },
    });
    if (activeAdvance) {
      advanceDeductionAmount = Math.min(
        activeAdvance.emiAmount ?? 0,
        activeAdvance.remainingAmount ?? 0,
      );
    }
  }
  if (advanceDeductionAmount > 0) {
    deductionRows.push({
      label: "Salary Advance EMI",
      value: advanceDeductionAmount,
    });
  }

  // ── Income Tax (TDS) — a disbursed month uses the exact amount actually
  // withheld; an as-yet-undisbursed month previews it the same way
  // initiatePayrollRun would compute it (see that function's comment on
  // why TDS needs financial-year-to-date state, unlike PF/ESI/PT).
  let tdsAmount = (disbursedLineItem as any)?.tds ?? 0;
  if (!disbursedLineItem) {
    const financialYear = getFinancialYear(month, year);
    const fyStartYear = parseInt(financialYear.split("-")[0], 10);
    const remainingMonths = remainingMonthsInFinancialYear(month, year);

    const [taxSlabs, priorRuns, declarationRow, earningComponentDefs] =
      await Promise.all([
        tenantId
          ? (prisma as any).incomeTaxSlab.findMany({
              where: { tenantId, financialYear },
            })
          : Promise.resolve([]),
        tenantId
          ? prisma.payrollRun.findMany({
              where: {
                tenantId,
                status: { in: ["approved", "disbursed"] },
                OR: [
                  { year: fyStartYear, month: { gte: 4 } },
                  { year: fyStartYear + 1, month: { lte: 3 } },
                ],
              },
              select: { id: true, month: true, year: true },
            })
          : Promise.resolve([]),
        tenantId
          ? (prisma as any).taxDeclaration.findFirst({
              where: {
                tenantId,
                userId: requestedUserId,
                financialYear,
                status: { in: ["Declared", "ProofsSubmitted", "Verified"] },
              },
            })
          : Promise.resolve(null),
        tenantId
          ? (prisma as any).salaryComponentDefinition.findMany({
              where: { tenantId, type: "earning" },
              select: { code: true, name: true, isRecurring: true },
            })
          : Promise.resolve([]),
      ]);
    const priorRunIds = (priorRuns as any[])
      .filter((r) => r.year < year || (r.year === year && r.month < month))
      .map((r) => r.id);
    const priorLineItems = priorRunIds.length
      ? await prisma.payrollLineItem.findMany({
          where: {
            payrollRunId: { in: priorRunIds },
            userId: requestedUserId,
          },
          select: {
            componentBreakdown: true,
            basicPay: true,
            hra: true,
            conveyance: true,
            incentive: true,
            tds: true,
          },
        })
      : [];
    const ytdByCode = aggregateEarningsByCode(priorLineItems as any[]);
    const ytdTds = (priorLineItems as any[]).reduce(
      (s, li) => s + (li.tds ?? 0),
      0,
    );
    const thisMonthComponents = buildThisMonthComponents(
      componentBreakdown as any,
      legacyEarningsForTds,
      earningComponentDefs,
    );

    tdsAmount = calcMonthlyTds({
      regime: declarationRow ? "old" : "new",
      components: thisMonthComponents,
      ytdByCode,
      ytdTds,
      remainingMonths,
      slabs: taxSlabs,
      declaration: declarationRow
        ? {
            monthlyRent: (declarationRow as any).monthlyRent,
            isMetroCity: (declarationRow as any).isMetroCity,
            lineItems: (declarationRow as any).lineItems ?? [],
          }
        : undefined,
    });
  }
  if (tdsAmount > 0) {
    deductionRows.push({ label: "Income Tax (TDS)", value: tdsAmount });
  }

  const calcGrossEarnings = earningsRows.reduce((s, r) => s + r.value, 0);
  const calcTotalDed = deductionRows.reduce((s, r) => s + r.value, 0);
  const calcNetPayable = Math.max(0, calcGrossEarnings - calcTotalDed);

  const lopDays = Math.max(0, totalMonthDays - paidDays);

  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      })
    : null;

  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    encryption: {
      userPassword: pdfPassword,
      ownerPassword: pdfPassword,
      userPermissions: ["print", "copy"],
    },
  });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 15;
  const contentW = pageW - marginX * 2;

  const textDark: [number, number, number] = [30, 30, 30];
  const textGray: [number, number, number] = [110, 110, 110];
  const borderGray: [number, number, number] = [205, 205, 205];
  const headerGreen: [number, number, number] = [232, 247, 236];
  const accentGreen: [number, number, number] = [56, 142, 60];

  let curY = 18;

  // ─── Company header — name only, no logo ────────────────────────────────────
  doc.setTextColor(...textDark);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(tenant?.name || "Company", marginX, curY);
  curY += 8;
  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.3);
  doc.line(marginX, curY, marginX + contentW, curY);
  curY += 9;

  // ─── Title ───────────────────────────────────────────────────────────────────
  doc.setTextColor(...textDark);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`Payslip for the month of ${monthLabel}`, marginX, curY);
  curY += 9;

  doc.setTextColor(...accentGreen);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("PAY SUMMARY", marginX, curY);
  curY += 6;

  // ─── Pay summary: employee info (2 cols) + Paid Days / LOP Days boxes ──────
  const summaryTop = curY;
  const boxColW = 40;
  const infoColGap = 6;
  const infoColW = (contentW - boxColW - infoColGap * 2) / 2;
  const col1X = marginX;
  const col2X = marginX + infoColW + infoColGap;
  const boxX = marginX + contentW - boxColW;

  const infoRow = (
    x: number,
    y: number,
    label: string,
    value: string,
  ): void => {
    doc.setTextColor(...textDark);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(label, x, y);
    doc.text(":", x + 32, y);
    doc.setFont("helvetica", "bold");
    doc.text(value || "-", x + 36, y);
  };

  const col1Fields: [string, string][] = [
    ["Employee Name", employeeName],
    ["Designation", employee?.designation || "-"],
    [
      "Date of Joining",
      employee?.joiningDate
        ? new Date(employee.joiningDate).toLocaleDateString("en-GB")
        : "-",
    ],
  ];
  const col2Fields: [string, string][] = [
    ["Employee ID", employee?.username || "-"],
    ["UAN", employee?.uanNo || "-"],
    ["Bank Account No", employee?.bankAccountNo || "-"],
    ["PAN", employee?.panNo || "-"],
  ];

  const infoRowH = 7;
  col1Fields.forEach(([label, value], i) =>
    infoRow(col1X, summaryTop + i * infoRowH, label, value),
  );
  col2Fields.forEach(([label, value], i) =>
    infoRow(col2X, summaryTop + i * infoRowH, label, value),
  );

  // Paid Days / LOP Days boxes, stacked at the right.
  const dayBox = (y: number, label: string, value: string) => {
    const h = 11;
    doc.setDrawColor(...borderGray);
    doc.setLineWidth(0.3);
    doc.rect(boxX, y, boxColW, h);
    doc.setTextColor(...textGray);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(label, boxX + 3, y + 4.5);
    doc.setTextColor(...textDark);
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.text(value, boxX + 3, y + 9);
  };
  dayBox(
    summaryTop - 5,
    "Paid Days",
    String(paidDays % 1 === 0 ? paidDays : paidDays.toFixed(1)),
  );
  dayBox(
    summaryTop - 5 + 13,
    "LOP Days",
    String(lopDays % 1 === 0 ? lopDays : lopDays.toFixed(1)),
  );

  curY =
    summaryTop + Math.max(col1Fields.length, col2Fields.length) * infoRowH + 8;

  // ─── Earnings / Deductions two-column table ─────────────────────────────────
  const colGap = 4;
  const halfW = (contentW - colGap) / 2;
  const leftX = marginX;
  const rightX = marginX + halfW + colGap;
  const rowH = 7.5;

  doc.setFillColor(...headerGreen);
  doc.rect(leftX, curY, contentW, 8, "F");
  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.3);
  doc.line(rightX - colGap / 2, curY, rightX - colGap / 2, curY + 8);

  doc.setTextColor(...textDark);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("EARNINGS", leftX + 3, curY + 5.5);
  doc.text("AMOUNT", leftX + halfW - 3, curY + 5.5, { align: "right" });
  doc.text("DEDUCTIONS", rightX + 3, curY + 5.5);
  doc.text("AMOUNT", rightX + halfW - 3, curY + 5.5, { align: "right" });
  curY += 8;

  const tableTop = curY - 8;
  const maxRows = Math.max(earningsRows.length, deductionRows.length);

  for (let i = 0; i < maxRows; i++) {
    const textY = curY + 5.2;
    if (i < earningsRows.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...textDark);
      doc.text(earningsRows[i].label, leftX + 3, textY);
      doc.setFont("helvetica", "bold");
      doc.text(formatINR(earningsRows[i].value), leftX + halfW - 3, textY, {
        align: "right",
      });
    }
    if (i < deductionRows.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...textDark);
      doc.text(deductionRows[i].label, rightX + 3, textY);
      doc.setFont("helvetica", "bold");
      doc.text(formatINR(deductionRows[i].value), rightX + halfW - 3, textY, {
        align: "right",
      });
    }
    curY += rowH;
  }
  doc.line(rightX - colGap / 2, tableTop + 8, rightX - colGap / 2, curY);

  // Gross Earnings / Total Deductions summary row.
  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.3);
  doc.line(leftX, curY, leftX + contentW, curY);
  curY += 2;
  doc.setTextColor(...textDark);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.text("Gross Earnings", leftX, curY + 5);
  doc.text(formatINR(calcGrossEarnings), leftX + halfW - 3, curY + 5, {
    align: "right",
  });
  doc.text("Total Deductions", rightX, curY + 5);
  doc.text(formatINR(calcTotalDed), rightX + halfW - 3, curY + 5, {
    align: "right",
  });
  curY += 7;

  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.4);
  doc.rect(leftX, tableTop, contentW, curY - tableTop);

  // ─── Total Net Payable — dashed box with amount in words ───────────────────
  curY += 8;
  const netBoxH = 20;
  doc.setDrawColor(...accentGreen);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([1.5, 1.2], 0);
  doc.roundedRect(marginX, curY, contentW, netBoxH, 2, 2);
  doc.setLineDashPattern([], 0);

  const netWords = `(Indian Rupee ${numberToWordsIndian(calcNetPayable)} Only)`;
  doc.setTextColor(...textDark);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Total Net Payable ${formatINR(calcNetPayable)}`,
    pageW / 2,
    curY + 9,
    { align: "center" },
  );
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...textGray);
  doc.text(netWords, pageW / 2, curY + 14.5, { align: "center" });

  doc.setFontSize(7);
  doc.text(
    "**Total Net Payable = Gross Earnings - Total Deductions",
    pageW / 2,
    curY + netBoxH + 5,
    { align: "center" },
  );
  curY += netBoxH + 15;

  // ─── Footer ──────────────────────────────────────────────────────────────────
  doc.setTextColor(...textGray);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("-- This is a system-generated document. --", pageW / 2, curY, {
    align: "center",
  });

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  return {
    buffer: pdfBuffer,
    employeeName,
    employeeUsername: employee?.username ?? requestedUserId,
  };
}

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

    const result = await buildSalarySlipPdf(
      requestedUserId,
      year,
      month,
      user!.tenantId,
    );
    if ("error" in result) {
      return apiResponse(res, RESPONSE_STATUS[result.status], {
        message: result.error,
      });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="salary_slip_${result.employeeUsername}_${year}_${String(month).padStart(2, "0")}.pdf"`,
    );
    return res.send(result.buffer);
  } catch (error: unknown) {
    logger.error("generateSalarySlip error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /email-salary-slip — HR (or the employee themselves) triggers an
 * on-demand email of a payslip, reusing the same PDF builder used for the
 * download endpoint and the automatic post-disbursement send.
 */
export async function emailSalarySlip(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const requestedUserId = req.body.userId as string;
    const year = parseInt(String(req.body.year));
    const month = parseInt(String(req.body.month));

    if (!requestedUserId || !year || !month) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "userId, year and month are required",
      });
    }

    const superUser = await isSuperUser(user!.userId);
    if (!superUser && requestedUserId !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const [result, employee, tenant] = await Promise.all([
      buildSalarySlipPdf(requestedUserId, year, month, user!.tenantId),
      prisma.user.findUnique({
        where: { id: requestedUserId },
        select: { email: true },
      }),
      user!.tenantId
        ? masterPrisma.tenant.findUnique({
            where: { id: user!.tenantId },
            select: { name: true, helpEmail: true },
          })
        : Promise.resolve(null),
    ]);
    if ("error" in result) {
      return apiResponse(res, RESPONSE_STATUS[result.status], {
        message: result.error,
      });
    }
    if (!employee?.email) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "This employee has no email on file",
      });
    }

    const monthLabel = `${MONTH_NAMES[(month - 1) % 12]} ${year}`;
    const tenantName = tenant?.name ?? "your organisation";
    await notify({
      tenantId: user!.tenantId!,
      event: "salarySlip",
      email: {
        to: employee.email,
        subject: `Salary slip — ${monthLabel}`,
        html: renderEmailHtml({
          title: "Salary Slip",
          tenantName,
          bodyHtml: `<h2>Hello ${result.employeeName},</h2><p>Your salary slip for <strong>${monthLabel}</strong> is attached. The PDF is password-protected — use your PAN followed by your date of birth (DDMMYYYY) to open it.</p>`,
        }),
        from: tenantFrom(tenantName),
        replyTo: tenantReplyTo(tenant?.helpEmail),
        attachments: [
          {
            filename: `salary_slip_${result.employeeUsername}_${year}_${String(month).padStart(2, "0")}.pdf`,
            content: result.buffer.toString("base64"),
          },
        ],
      },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Salary slip emailed",
    });
  } catch (error: unknown) {
    logger.error("emailSalarySlip error:", { error });
    return handleError(res, error);
  }
}
