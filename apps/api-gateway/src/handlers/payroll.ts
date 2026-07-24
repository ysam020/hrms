/**
 * Payroll handler – gateway-direct (no separate gRPC service).
 *
 * Lifecycle:  draft → processing → approved → disbursed | cancelled
 *
 * Security notes:
 *  – Only HR/admin/owner may initiate or approve runs.
 *  – Runs are idempotent: @@unique([tenantId, month, year]) prevents duplicates.
 *  – Line-items are computed at initiation time from the *current* User salary
 *    snapshot + any pending SalaryAdvance EMIs; they are immutable after that.
 *  – Disbursement is a status flag only (no real bank call for test mode).
 *    Hook in RazorpayX Payouts here when ready for production.
 *  – Approval requires a different user than the initiator (four-eyes principle).
 */

import { Request, Response } from "express";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import {
  apiResponse,
  RESPONSE_STATUS,
  deriveFromComponents,
} from "@hrms/common";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { parsePagination } from "../utils/pagination";
import { emitWebhookEvent } from "../utils/webhookEmitter";
import { getActiveSettings } from "./tenantSettings";
import {
  calcStatutoryDeductions,
  groupSlabsByState,
  classifyImpliedNonWorkingDays,
} from "../utils/payrollCalc";
import {
  calcMonthlyTds,
  getFinancialYear,
  remainingMonthsInFinancialYear,
  aggregateEarningsByCode,
  buildThisMonthComponents,
} from "../utils/tdsCalc";

// Required for listPayrollRuns' month-name search (dayjs(str, [format...], true))
// below — without this, format-string parsing silently no-ops and every
// month-name search term falls through to the notes contains-match instead.
dayjs.extend(customParseFormat);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type AllowedRole = "owner" | "admin" | "hr" | "manager" | "employee";

// tenantRole comes from the JWT (resolved from TenantMembership at login) —
// User.role is a legacy, never-populated field and must not be used here
// (see the identical note in wfh.ts) — checking it silently denied every
// real owner/admin/hr account that only had tenantRole set, leaving just
// isSuperuser=true accounts able to touch payroll runs/salary advances.
async function assertRole(
  userId: string,
  tenantRole: string | null | undefined,
  allowed: AllowedRole[],
): Promise<boolean> {
  if (allowed.includes((tenantRole ?? "") as AllowedRole)) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true },
  });
  return user?.isSuperUser === true;
}

// Salary advance approval also admits holders of the standalone
// SalaryManagement:approve_advance permission, not just owner/admin/hr —
// mirrors the permissions-driven gate now applied on the frontend.
async function canApproveAdvances(
  userId: string,
  tenantRole: string | null | undefined,
): Promise<boolean> {
  if (await assertRole(userId, tenantRole, ["owner", "admin", "hr"])) {
    return true;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });
  return (user?.permissions ?? []).includes("SalaryManagement:approve_advance");
}

// SLA hours by priority (used by helpdesk too, kept here for co-location)
const SLA_HOURS: Record<string, number> = {
  critical: 4,
  high: 8,
  medium: 24,
  low: 72,
};
export { SLA_HOURS };

// ─────────────────────────────────────────────────────────────────────────────
// Payroll Run Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /payroll/runs
 * Initiates a new payroll run for the given month/year.
 * Computes line-items for all active employees at this point in time.
 */
export async function initiatePayrollRun(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const allowed = await assertRole(user!.userId, user!.tenantRole, [
      "owner",
      "admin",
      "hr",
    ]);
    if (!allowed) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Only HR, admin, or owner can initiate payroll runs",
      });
    }

    const {
      month,
      year,
      notes,
      payCycleId: requestedPayCycleId,
    } = req.body as {
      month: number;
      year: number;
      notes?: string;
      payCycleId?: string;
    };

    const tenantId = getTenantId();

    // Resolve the pay cycle this run is for — the tenant's explicitly
    // requested one, else its default active cycle. The run is stamped with
    // it either way, but @@unique([tenantId, month, year]) on PayrollRun
    // means true multi-cycle-per-month processing (a second, e.g. biweekly,
    // run within the same calendar month) isn't supported yet — see the
    // PayCycle model comment. Non-monthly cycles still get a run (so the
    // setting isn't simply ignored), just one per calendar month like every
    // other tenant, with a note flagging the mismatch.
    let payCycleWarning: string | undefined;
    let resolvedPayCycle: {
      id: string;
      frequency: string;
      name: string;
    } | null = null;
    if (tenantId) {
      resolvedPayCycle = requestedPayCycleId
        ? await (prisma as any).payCycle.findFirst({
            where: { id: requestedPayCycleId, tenantId, isActive: true },
          })
        : await (prisma as any).payCycle.findFirst({
            where: { tenantId, isDefault: true, isActive: true },
          });
      if (resolvedPayCycle && resolvedPayCycle.frequency !== "monthly") {
        payCycleWarning = `Pay cycle "${resolvedPayCycle.name}" is ${resolvedPayCycle.frequency}, but payroll runs are still processed one per calendar month — this run covers the full month, not a single ${resolvedPayCycle.frequency} period.`;
      }
    }

    // Guard: payroll can only be initiated for past months (never current or future).
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed
    if (year > currentYear || (year === currentYear && month >= currentMonth)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "Payroll can only be initiated for past months, not the current or future months.",
      });
    }

    // Guard: no duplicate run for the same period.
    const existing = await prisma.payrollRun.findUnique({
      where: { tenantId_month_year: { tenantId: tenantId!, month, year } },
    });
    if (existing) {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: `Payroll run for ${year}-${String(month).padStart(2, "0")} already exists (status: ${existing.status})`,
      });
    }

    // Fetch all active employees — their base (full-month) gross salary and,
    // when configured (Employee/Salary module), their own Basic/HRA/Conveyance
    // breakdown, which is prorated by attendance below instead of being
    // re-derived from a fixed split.
    const employees = await prisma.user.findMany({
      where: { employeeStatus: "Active" },
      select: {
        id: true,
        salary: true,
        salaryBasicPay: true,
        salaryHra: true,
        salaryConveyance: true,
        salaryComponentBreakdown: true,
      },
    });

    if (employees.length === 0) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "No active employees found to process payroll for",
      });
    }

    const empIds = employees.map((e) => e.id);

    // ── Attendance data for the payroll month ─────────────────────────────────
    // Date range: midnight on the 1st → 23:59:59.999 on the last day.
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const totalMonthDays = new Date(year, month, 0).getDate(); // e.g. 28/29/30/31

    const [attendanceRecords, leaveBalances, tenantSettings, holidayRecords] =
      await Promise.all([
        prisma.attendanceRecord.findMany({
          where: {
            userId: { in: empIds },
            date: { gte: monthStart, lte: monthEnd },
          },
          select: { userId: true, status: true, date: true },
        }),
        prisma.leaveBalance.findMany({
          where: { userId: { in: empIds } },
          select: { userId: true, balances: true },
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

    // Every date (any status) that already has an AttendanceRecord, per
    // employee — used to avoid double-counting a weekly off that
    // reconcileAttendance.ts has already backfilled explicitly.
    const recordedDatesByUser = new Map<string, Set<string>>();
    for (const r of attendanceRecords as any[]) {
      const key = new Date(r.date).toISOString().slice(0, 10);
      const set = recordedDatesByUser.get(r.userId) ?? new Set<string>();
      set.add(key);
      recordedDatesByUser.set(r.userId, set);
    }

    // Aggregate per-employee attendance counts.
    type AttAgg = {
      present: number;
      late: number;
      halfDay: number;
      holiday: number;
      weekOff: number;
      wfh: number;
    };
    const attByUser = new Map<string, AttAgg>();
    for (const emp of employees) {
      attByUser.set(emp.id, {
        present: 0,
        late: 0,
        halfDay: 0,
        holiday: 0,
        weekOff: 0,
        wfh: 0,
      });
    }
    for (const r of attendanceRecords as any[]) {
      const agg = attByUser.get(r.userId);
      if (!agg) continue;
      if (r.status === "Present") agg.present++;
      else if (r.status === "Late") agg.late++;
      else if (r.status === "Half Day") agg.halfDay++;
      else if (r.status === "Holiday") agg.holiday++;
      // Weekly offs (e.g. Sat/Sun) are non-working but still paid days —
      // reconcileAttendance.ts backfills them with this status per the
      // tenant's configured work-week pattern. Without counting them here,
      // every salaried employee's pay is systematically prorated down by
      // however many weekly-off days fall in the month.
      else if (r.status === "Week Off") agg.weekOff++;
      else if (r.status === "WFH") agg.wfh++;
    }

    // Calendar-derived holidays/weekly offs — covers dates
    // reconcileAttendance.ts hasn't (yet) backfilled with an explicit
    // "Holiday"/"Week Off" record.
    for (const emp of employees) {
      const agg = attByUser.get(emp.id)!;
      const recorded = recordedDatesByUser.get(emp.id) ?? new Set<string>();
      const { impliedHolidays, impliedWeekOffs } =
        classifyImpliedNonWorkingDays(
          year,
          month,
          totalMonthDays,
          workingDays,
          holidayDateKeys,
          recorded,
        );
      agg.holiday += impliedHolidays;
      agg.weekOff += impliedWeekOffs;
    }

    // Extract paid-leave count per employee for this month from LeaveBalance.balances JSON.
    const paidLeaveByUser = new Map<string, number>();
    for (const lb of leaveBalances as any[]) {
      if (!lb.balances || !Array.isArray(lb.balances)) continue;
      const mb = lb.balances.find(
        (b: any) =>
          String(b.year) === String(year) && String(b.month) === String(month),
      );
      paidLeaveByUser.set(lb.userId, mb?.usedPL ?? 0);
    }

    // Professional Tax — state-wise slabs when the tenant has configured them
    // (Settings → Payroll Components), falling back to the flat approximate
    // slab for states/tenants that haven't. See utils/payrollCalc.ts.
    const ptSlabs = tenantId
      ? await (prisma as any).professionalTaxSlab.findMany({
          where: { tenantId },
        })
      : [];
    const ptSlabsByState = groupSlabsByState(ptSlabs);

    // Work state is set once during org setup (Tenant.workState) and applies
    // to every employee's PT deduction, rather than being captured per employee.
    const tenantWorkState = tenantId
      ? ((
          await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { workState: true },
          })
        )?.workState ?? null)
      : null;

    // PF/ESI rates — tenant-configured SalaryComponentDefinition rows
    // (Settings → Payroll Components) when present, else the 12%/1.75%
    // defaults calcStatutoryDeductions already falls back to.
    const componentRates = tenantId
      ? await (prisma as any).salaryComponentDefinition.findMany({
          where: { tenantId, code: { in: ["PF", "ESI"] }, isActive: true },
          select: { code: true, percentValue: true },
        })
      : [];

    // Earning component definitions (labels + isRecurring) — used to build
    // each employee's this-month TDS input via buildThisMonthComponents.
    const earningComponentDefs = tenantId
      ? await (prisma as any).salaryComponentDefinition.findMany({
          where: { tenantId, type: "earning" },
          select: { code: true, name: true, isRecurring: true },
        })
      : [];

    // Fetch pending salary advances eligible for deduction this month.
    const advances = await prisma.salaryAdvance.findMany({
      where: { status: { in: ["Approved", "Repaying"] } },
      select: {
        id: true,
        userId: true,
        emiAmount: true,
        remainingAmount: true,
      },
    });
    const advanceMap = new Map<
      string,
      { id: string; emi: number; remaining: number }
    >();
    for (const adv of advances) {
      if (adv.emiAmount && adv.emiAmount > 0) {
        advanceMap.set(adv.userId, {
          id: adv.id,
          emi: adv.emiAmount,
          remaining: adv.remainingAmount ?? adv.emiAmount,
        });
      }
    }

    // ── Income Tax (TDS) — financial-year-to-date state + this employee's regime ──
    // TDS is an annual liability paid off monthly, unlike PF/ESI/PT which are
    // stateless — so unlike those, it needs what's already been withheld/earned
    // this financial year. There's no separate running-total model: prior
    // finalized (approved/disbursed) PayrollLineItem rows are immutable
    // snapshots, so summing them directly avoids a second source of truth that
    // could drift. See calcMonthlyTds in utils/tdsCalc.ts.
    const financialYear = getFinancialYear(month, year);
    const fyStartYear = parseInt(financialYear.split("-")[0], 10);
    const remainingMonths = remainingMonthsInFinancialYear(month, year);

    const [taxSlabs, priorRuns, declarations] = await Promise.all([
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
        ? (prisma as any).taxDeclaration.findMany({
            where: {
              tenantId,
              financialYear,
              userId: { in: empIds },
              status: { in: ["Declared", "ProofsSubmitted", "Verified"] },
            },
          })
        : Promise.resolve([]),
    ]);

    // Only runs strictly before the one being initiated now count as "prior".
    const priorRunIds = (priorRuns as any[])
      .filter((r) => r.year < year || (r.year === year && r.month < month))
      .map((r) => r.id);
    const priorLineItems = priorRunIds.length
      ? await prisma.payrollLineItem.findMany({
          where: { payrollRunId: { in: priorRunIds }, userId: { in: empIds } },
          select: {
            userId: true,
            componentBreakdown: true,
            basicPay: true,
            hra: true,
            conveyance: true,
            incentive: true,
            tds: true,
          },
        })
      : [];
    const priorLineItemsByUser = new Map<string, any[]>();
    const ytdTdsByUser = new Map<string, number>();
    for (const li of priorLineItems as any[]) {
      const list = priorLineItemsByUser.get(li.userId) ?? [];
      list.push(li);
      priorLineItemsByUser.set(li.userId, list);
      ytdTdsByUser.set(
        li.userId,
        (ytdTdsByUser.get(li.userId) ?? 0) + (li.tds ?? 0),
      );
    }
    const declarationByUser = new Map(
      (declarations as any[]).map((d) => [d.userId, d]),
    );

    // ── Build line-items (attendance-based pro-rata) ──────────────────────────
    let totalGross = 0;
    let totalNet = 0;
    let totalDeductions = 0;

    const lineItems = employees.map((emp) => {
      const fullGross = emp.salary ?? 0;

      // Paid days = present + late + halfDays×0.5 + holidays + weekly offs
      // + WFH days + paid leaves.
      const att = attByUser.get(emp.id) ?? {
        present: 0,
        late: 0,
        halfDay: 0,
        holiday: 0,
        weekOff: 0,
        wfh: 0,
      };
      const paidLeaves = paidLeaveByUser.get(emp.id) ?? 0;
      const paidDays = Math.min(
        att.present +
          att.late +
          att.halfDay * 0.5 +
          att.holiday +
          att.weekOff +
          att.wfh +
          paidLeaves,
        totalMonthDays, // cap at total days to avoid overrun
      );

      const prorationRatio = totalMonthDays > 0 ? paidDays / totalMonthDays : 1;

      let gross: number;
      let basicPay: number;
      let hra: number;
      let conveyance: number;
      let incentive = 0;
      let pf: number;
      let esi: number;
      let pt: number;
      let otherDeductions: number;
      let componentBreakdown: Record<string, unknown>[] | undefined;

      const rawBreakdown = emp.salaryComponentBreakdown;
      if (Array.isArray(rawBreakdown) && rawBreakdown.length > 0) {
        // Tenant-configured components (including anything beyond the
        // standard 6 codes) — prorate every component by attendance, then
        // override the 3 statutory codes with an authoritative recompute
        // (prorating gross/basic first, then recomputing PF/ESI/PT off
        // those, is more correct than prorating stale PF/ESI/PT amounts
        // directly — e.g. ESI's ₹21,000 eligibility threshold must be
        // checked against the prorated gross, not the full-month one).
        const prorated = (rawBreakdown as any[]).map((c) => ({
          code: c.code,
          name: c.name,
          type: c.type,
          amount: Math.round((Number(c.amount) || 0) * prorationRatio),
        }));

        const { legacy: proratedLegacy, grossEarnings: proratedGross } =
          deriveFromComponents(prorated);
        gross = proratedGross;
        basicPay = proratedLegacy.basicPay;

        const statutory = calcStatutoryDeductions(
          gross,
          basicPay,
          tenantWorkState,
          ptSlabsByState,
          componentRates,
        );

        componentBreakdown = prorated.map((c) => {
          if (c.code === "PF") return { ...c, amount: statutory.pf };
          if (c.code === "ESI") return { ...c, amount: statutory.esi };
          if (c.code === "PT") return { ...c, amount: statutory.pt };
          return c;
        });

        const { legacy: finalLegacy, totalDeductions: finalTotalDed } =
          deriveFromComponents(componentBreakdown as any[]);
        hra = finalLegacy.hra;
        conveyance = finalLegacy.conveyance;
        incentive = finalLegacy.incentive;
        pf = statutory.pf;
        esi = statutory.esi;
        pt = statutory.pt;
        otherDeductions = finalTotalDed - pf - esi - pt;
      } else {
        // Legacy fixed-column employee (componentBreakdown never saved) —
        // exact original behavior.
        gross =
          totalMonthDays > 0
            ? Math.round((fullGross * paidDays) / totalMonthDays)
            : fullGross;

        // Use the employee's own configured Basic/HRA/Conveyance (set via
        // the Employee/Salary module, itself tenant-rate-derived) prorated
        // by the same attendance ratio as gross — falling back to the
        // original fixed 50/25/25 split of pro-rata gross only when
        // nothing's been configured for this employee yet, so unconfigured
        // tenants see no change.
        basicPay =
          emp.salaryBasicPay != null
            ? Math.round(emp.salaryBasicPay * prorationRatio)
            : Math.round(gross * 0.5);
        hra =
          emp.salaryHra != null
            ? Math.round(emp.salaryHra * prorationRatio)
            : Math.round(gross * 0.25);
        conveyance =
          emp.salaryConveyance != null
            ? Math.round(emp.salaryConveyance * prorationRatio)
            : Math.round(gross * 0.25);

        const statutory = calcStatutoryDeductions(
          gross,
          basicPay,
          tenantWorkState,
          ptSlabsByState,
          componentRates,
        );
        pf = statutory.pf;
        esi = statutory.esi;
        pt = statutory.pt;
        otherDeductions = 0;
      }

      const adv = advanceMap.get(emp.id);
      const advanceDeduction = adv ? Math.min(adv.emi, adv.remaining) : 0;

      const declarationRow = declarationByUser.get(emp.id);
      const thisMonthComponents = buildThisMonthComponents(
        componentBreakdown as any,
        { basicPay, hra, conveyance, incentive },
        earningComponentDefs,
      );
      const ytdByCode = aggregateEarningsByCode(
        priorLineItemsByUser.get(emp.id) ?? [],
      );
      const ytdTds = ytdTdsByUser.get(emp.id) ?? 0;
      const tds = calcMonthlyTds({
        regime: declarationRow ? "old" : "new",
        components: thisMonthComponents,
        ytdByCode,
        ytdTds,
        remainingMonths,
        slabs: taxSlabs,
        declaration: declarationRow
          ? {
              monthlyRent: declarationRow.monthlyRent,
              isMetroCity: declarationRow.isMetroCity,
              lineItems: declarationRow.lineItems ?? [],
            }
          : undefined,
      });

      const totalDed = pf + esi + pt + otherDeductions + advanceDeduction + tds;
      const net = Math.max(0, gross - totalDed);

      totalGross += gross;
      totalDeductions += totalDed;
      totalNet += net;

      return {
        tenantId: tenantId ?? undefined,
        userId: emp.id,
        grossSalary: gross,
        basicPay,
        hra,
        conveyance,
        incentive,
        pf,
        esi,
        pt,
        advanceDeduction,
        tds,
        otherDeductions,
        totalDeductions: totalDed,
        componentBreakdown,
        netPayable: net,
      };
    });

    // Create run first, then line-items sequentially.
    // (MongoDB standalone does not support multi-document transactions.)
    const run = await prisma.payrollRun.create({
      data: {
        tenantId: tenantId ?? undefined,
        month,
        year,
        status: "draft",
        initiatedBy: user!.userId,
        totalGross,
        totalNet,
        totalDeductions,
        employeeCount: employees.length,
        notes: notes ?? null,
        payCycleId: resolvedPayCycle?.id ?? undefined,
      },
    });

    // createMany on MongoDB does not support skipDuplicates — plain createMany is fine here.
    if (lineItems.length > 0) {
      await prisma.payrollLineItem.createMany({
        data: lineItems.map((li) => ({ ...li, payrollRunId: run.id })) as any,
      });
    }

    logger.info(`Payroll run initiated: ${run.id} for ${year}-${month}`, {
      initiatedBy: user!.userId,
      employeeCount: employees.length,
    });

    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: `Payroll run created for ${year}-${String(month).padStart(2, "0")}`,
      data: {
        runId: run.id,
        status: run.status,
        employeeCount: employees.length,
        totalGross,
        totalNet,
        totalDeductions,
        payCycleId: resolvedPayCycle?.id ?? null,
        ...(payCycleWarning ? { warning: payCycleWarning } : {}),
      },
    });
  } catch (error) {
    logger.error("POST /payroll/runs error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /payroll/runs
 * Lists payroll runs with optional status filter.
 */
export async function listPayrollRuns(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const allowed = await assertRole(user!.userId, user!.tenantRole, [
      "owner",
      "admin",
      "hr",
    ]);
    if (!allowed) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Access restricted to HR, admin, or owner",
      });
    }

    const { status, search } = req.query as Record<string, string>;
    const { page, limit } = parsePagination(req.query);
    const skip = (page - 1) * limit;
    const take = limit;

    const where: any = { tenantId: getTenantId() };
    if (status) where.status = status;
    if (search) {
      const trimmed = search.trim();
      // Runs are identified by month/year, not a free-text name — resolve
      // the search term against that instead of a literal string match.
      // "2026" -> year only; "March"/"Mar"/"March 2026"/"Mar 2026" -> month
      // (+ year if included); anything else falls back to the notes field.
      const yearOnly = /^\d{4}$/.exec(trimmed);
      const parsedMonth = dayjs(
        trimmed,
        ["MMMM YYYY", "MMM YYYY", "MMMM", "MMM"],
        true,
      );
      if (yearOnly) {
        where.year = parseInt(trimmed, 10);
      } else if (parsedMonth.isValid()) {
        where.month = parsedMonth.month() + 1;
        if (/\d{4}/.test(trimmed)) where.year = parsedMonth.year();
      } else {
        where.notes = { contains: search, mode: "insensitive" };
      }
    }

    const [runs, total] = await Promise.all([
      prisma.payrollRun.findMany({
        where,
        orderBy: [{ year: "desc" }, { month: "desc" }],
        skip,
        take,
      }),
      prisma.payrollRun.count({ where }),
    ]);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Payroll runs retrieved",
      data: runs,
      total,
    });
  } catch (error) {
    logger.error("GET /payroll/runs error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /payroll/runs/:runId
 * Returns a run with its full line-items and employee names.
 */
export async function getPayrollRun(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const allowed = await assertRole(user!.userId, user!.tenantRole, [
      "owner",
      "admin",
      "hr",
    ]);
    if (!allowed) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const run = await prisma.payrollRun.findFirst({
      where: { id: String(req.params.runId), tenantId: getTenantId() },
      include: { lineItems: true },
    });
    if (!run) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Payroll run not found",
      });
    }

    // Enrich with employee names.
    const userIds = [
      ...new Set((run.lineItems as any[]).map((li: any) => li.userId)),
    ];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds as string[] } },
      select: {
        id: true,
        username: true,
        first_name: true,
        last_name: true,
        designation: true,
        department: true,
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enrichedItems = (run.lineItems as any[]).map((li: any) => ({
      ...li,
      employee: userMap.get(li.userId) ?? { id: li.userId },
    }));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Payroll run retrieved",
      data: { ...run, lineItems: enrichedItems },
    });
  } catch (error) {
    logger.error("GET /payroll/runs/:runId error:", { error });
    return handleError(res, error);
  }
}

/**
 * PATCH /payroll/runs/status
 * Transitions a run through its lifecycle.
 *
 * Body: { runId, status, notes? }
 * status is the TARGET status the caller wants to reach:
 *   "processing" → draft→processing (HR submits for review)
 *   "approved"   → processing→approved (four-eyes)
 *   "disbursed"  → approved→disbursed (marks as paid)
 *   "cancelled"  → any→cancelled
 */
export async function updatePayrollRunStatus(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { runId, status, notes } = req.body as {
      runId: string;
      status: string;
      notes?: string;
    };

    // Map target status → internal action name for the state machine.
    const statusToAction: Record<string, string> = {
      processing: "submit",
      approved: "approve",
      disbursed: "disburse",
      cancelled: "cancel",
    };
    const action = statusToAction[status];
    if (!action) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Invalid target status: ${status}`,
      });
    }

    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, tenantId: getTenantId() },
    });
    if (!run) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Payroll run not found",
      });
    }

    // Validate transitions.
    const validTransitions: Record<
      string,
      { from: string[]; toStatus: string; roles: AllowedRole[] }
    > = {
      submit: {
        from: ["draft"],
        toStatus: "processing",
        roles: ["owner", "admin", "hr"],
      },
      approve: {
        from: ["processing"],
        toStatus: "approved",
        roles: ["owner", "admin", "hr"],
      },
      // toStatus is "disbursing", not "disbursed" — disbursement now runs as
      // a background job (see payrollDisbursementWorker.ts); the job itself
      // moves the run to "disbursed" once the RazorpayX payout loop and
      // payslip generation actually complete. Retrying after a failure goes
      // through the dedicated retry-payouts endpoint below, not this one —
      // "disbursing"/"disbursement_failed" are deliberately not in `from`.
      disburse: {
        from: ["approved"],
        toStatus: "disbursing",
        roles: ["owner", "admin"],
      },
      cancel: {
        from: ["draft", "processing", "approved"],
        toStatus: "cancelled",
        roles: ["owner", "admin"],
      },
    };

    const transition = validTransitions[action];
    if (!transition) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Invalid action: ${action}`,
      });
    }
    if (!transition.from.includes((run as any).status)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Cannot ${action} a run with status '${(run as any).status}'`,
      });
    }

    const allowed = await assertRole(
      user!.userId,
      user!.tenantRole,
      transition.roles,
    );
    if (!allowed) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: `Only ${transition.roles.join("/")} can ${action} a payroll run`,
      });
    }

    // Four-eyes: final approval must be by a different user than the one who submitted.
    if (action === "approve" && (run as any).initiatedBy === user!.userId) {
      const isSU = await prisma.user.findUnique({
        where: { id: user!.userId },
        select: { isSuperUser: true },
      });
      if (!isSU?.isSuperUser) {
        return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
          message:
            "The initiator cannot approve their own payroll run (four-eyes policy)",
        });
      }
    }

    // ── Pre-flight for disburse: validate bank details BEFORE touching run status ──
    // Only enforced when RazorpayX is configured — dev/test environments without
    // the env vars skip this and do flag-only disbursement.
    if (action === "disburse" && process.env.RAZORPAY_X_KEY_ID) {
      const lineUserIds = await prisma.payrollLineItem.findMany({
        where: { payrollRunId: run.id },
        select: { userId: true },
      });
      const emps = await prisma.user.findMany({
        where: { id: { in: (lineUserIds as any[]).map((l: any) => l.userId) } },
        select: {
          id: true,
          username: true,
          bank_account_no: true,
          ifsc_code: true,
        },
      });
      const missing = emps.filter((e) => !e.bank_account_no || !e.ifsc_code);
      if (missing.length > 0) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message:
            "Cannot disburse: the following employees are missing bank account details. " +
            "Update their profiles before disbursing.",
          data: {
            missing: missing.map((e) => ({
              userId: e.id,
              username: e.username,
            })),
          },
        });
      }
    }

    const updateData: any = {
      status: transition.toStatus,
      ...(notes ? { notes } : {}),
    };
    if (action === "approve") {
      updateData.approvedBy = user!.userId;
      updateData.approvedAt = new Date();
    }
    // disbursedBy/disbursedAt are stamped by payrollDisbursementWorker.ts
    // once the job actually completes, not here — this CAS update only
    // moves the run into the in-flight "disbursing" state.

    // Update the run status (sequential — MongoDB standalone has no multi-doc
    // transactions). The `status` clause below is a compare-and-swap guard —
    // without it, two concurrent requests both pass the transition.from
    // check above and both proceed to run the effects further down (real
    // bank payouts for disburse), i.e. the same run gets processed twice.
    // If another request already won the race, Prisma throws P2025 (record
    // not found) since the where clause no longer matches.
    try {
      await prisma.payrollRun.update({
        where: { id: run.id, status: (run as any).status },
        data: updateData,
      });
    } catch (err: any) {
      if (err?.code === "P2025") {
        return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
          message:
            "This payroll run was already updated by another request. Please refresh and try again.",
        });
      }
      throw err;
    }

    // Disbursement itself (RazorpayX payout loop, advance reconciliation,
    // payslip generation) runs as a background job — see
    // payrollDisbursementWorker.ts. For a real employee count this is
    // 1,000+ sequential external calls, far too slow for this
    // request/response cycle; enqueue it and return immediately.
    if (action === "disburse") {
      try {
        const { getPayrollDisbursementQueue } = await import("@hrms/queue");
        await getPayrollDisbursementQueue().add("disburse", {
          tenantId: getTenantId()!,
          runId: run.id,
          disbursedBy: user!.userId,
        });
      } catch (enqueueErr) {
        // The CAS update above already committed status: "disbursing", but
        // no job was actually queued to process it — left as-is, the run
        // would be stranded forever (retry-payouts only accepts
        // disbursed/disbursement_failed, not disbursing). Roll the status
        // back to "approved" so the caller can safely retry the disburse
        // action itself. Safe without its own CAS guard: only this request
        // could have just set the run to "disbursing" (transition.from is
        // exclusively ["approved"], and no other code path writes
        // "disbursing"), so there's no concurrent writer to race with here.
        logger.error(
          `Payroll run ${run.id} failed to enqueue disburse job — rolling status back to approved`,
          { err: enqueueErr },
        );
        await prisma.payrollRun
          .update({
            where: { id: run.id, status: "disbursing" },
            data: { status: "approved" },
          })
          .catch((rollbackErr) => {
            logger.error(
              `Payroll run ${run.id} rollback to approved also failed — stuck in disbursing, needs manual intervention`,
              { err: rollbackErr },
            );
          });

        return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
          message:
            "Failed to start payroll disbursement. The run was not changed — please try again.",
        });
      }

      logger.info(`Payroll run ${run.id} → disbursing (job enqueued)`, {
        userId: user!.userId,
      });

      return apiResponse(res, RESPONSE_STATUS.ACCEPTED, {
        message:
          "Payroll disbursement started. Poll GET /payroll/runs/:runId for progress.",
        data: { runId: run.id, status: "disbursing" },
      });
    }

    // Fire webhook (disburse's own "payroll.disbursed" event fires from the
    // worker once the job actually completes, not here).
    if (action === "approve") {
      await emitWebhookEvent("payroll.approved", {
        runId: run.id,
        month: (run as any).month,
        year: (run as any).year,
        employeeCount: (run as any).employeeCount,
      });
    }

    logger.info(`Payroll run ${run.id} → ${transition.toStatus}`, {
      userId: user!.userId,
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `Payroll run ${action}d successfully`,
      data: { runId: run.id, status: transition.toStatus },
    });
  } catch (error) {
    logger.error("PATCH /payroll/runs/:runId/status error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /payroll/runs/:runId/retry-payouts
 * Re-runs disbursement for a run whose bank payouts didn't fully complete —
 * either some individual line items are still "failed" (run status stayed
 * "disbursed"), or the whole background job crashed/exhausted its BullMQ
 * retries (run status is "disbursement_failed"). Reuses the same
 * payrollDisbursementQueue job/worker: runPayrollDisbursement() only
 * (re-)processes line items not yet in a terminal payout state, so this is
 * safe to call repeatedly without double-paying anyone already paid.
 */
export async function retryFailedPayouts(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const allowed = await assertRole(user!.userId, user!.tenantRole, [
      "owner",
      "admin",
    ]);
    if (!allowed) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Only owner/admin can retry payroll payouts",
      });
    }

    const runId = String(req.params.runId);
    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, tenantId: getTenantId() },
    });
    if (!run) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Payroll run not found",
      });
    }

    // "disbursing" is deliberately excluded — a job is already in flight for
    // that state; enqueueing a second one would race the first.
    const retryableStatuses = ["disbursed", "disbursement_failed"];
    const previousStatus = (run as any).status;
    if (!retryableStatuses.includes(previousStatus)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Cannot retry payouts for a run with status '${previousStatus}'. Only ${retryableStatuses.join("/")} runs can be retried.`,
      });
    }

    const outstanding = await prisma.payrollLineItem.count({
      where: {
        payrollRunId: runId,
        OR: [
          { payoutStatus: "failed" },
          { payoutStatus: null },
          { payoutStatus: "pending" },
        ],
      },
    });
    if (outstanding === 0) {
      // A permanently_failed item (exhausted its automatic retry budget —
      // see payrollDisbursement.ts) deliberately does NOT count as
      // "outstanding" here, since re-enqueueing the same automatic retry
      // that already failed 5 times in a row isn't going to help. But it
      // also isn't "completed" — money never reached that employee, and
      // saying so here would hide a real problem from the admin calling
      // this endpoint.
      const permanentlyFailed = await prisma.payrollLineItem.count({
        where: { payrollRunId: runId, payoutStatus: "permanently_failed" },
      });
      if (permanentlyFailed > 0) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: `${permanentlyFailed} line item(s) have permanently failed after repeated attempts and need manual correction (e.g. fixing bank details) before they can be retried. Every other line item's payout already completed.`,
          data: { permanentlyFailed },
        });
      }
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "Nothing to retry — every line item's payout already completed.",
      });
    }

    // CAS the run to "disbursing" before enqueueing — the same in-flight
    // state the main disburse path uses. Without this, two concurrent
    // retry-payouts calls (two tabs, or two gateway instances behind a
    // load balancer) both pass the retryableStatuses check above and both
    // enqueue a job, racing each other's payout creation.
    try {
      await prisma.payrollRun.update({
        where: { id: run.id, status: previousStatus },
        data: { status: "disbursing" },
      });
    } catch (err: any) {
      if (err?.code === "P2025") {
        return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
          message:
            "This payroll run is already being retried by another request. Please refresh and try again.",
        });
      }
      throw err;
    }

    try {
      const { getPayrollDisbursementQueue } = await import("@hrms/queue");
      await getPayrollDisbursementQueue().add("disburse", {
        tenantId: getTenantId()!,
        runId: run.id,
        disbursedBy: user!.userId,
      });
    } catch (enqueueErr) {
      logger.error(
        `Payroll run ${run.id} failed to enqueue retry-payouts job — rolling status back to ${previousStatus}`,
        { err: enqueueErr },
      );
      await prisma.payrollRun
        .update({
          where: { id: run.id, status: "disbursing" },
          data: { status: previousStatus },
        })
        .catch((rollbackErr) => {
          logger.error(
            `Payroll run ${run.id} rollback to ${previousStatus} also failed — stuck in disbursing, needs manual intervention`,
            { err: rollbackErr },
          );
        });

      return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
        message:
          "Failed to retry payroll disbursement. The run was not changed — please try again.",
      });
    }

    logger.info(`Payroll run ${run.id}: retry-payouts enqueued`, {
      userId: user!.userId,
      outstanding,
    });

    return apiResponse(res, RESPONSE_STATUS.ACCEPTED, {
      message: `Retrying ${outstanding} outstanding payout(s). Poll GET /payroll/runs/:runId for progress.`,
      data: { runId: run.id, outstanding },
    });
  } catch (error) {
    logger.error("POST /payroll/runs/:runId/retry-payouts error:", { error });
    return handleError(res, error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Salary Advance Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /payroll/advances
 * Employee requests a salary advance.
 */
export async function requestSalaryAdvance(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { amount, reason, emiMonths } = req.body as {
      amount: number;
      reason: string;
      emiMonths: number;
    };

    // Only one active advance per employee.
    const active = await prisma.salaryAdvance.findFirst({
      where: {
        userId: user!.userId,
        status: { in: ["Pending", "Approved", "Repaying"] },
      },
    });
    if (active) {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: `You already have an active salary advance (status: ${(active as any).status})`,
      });
    }

    const emiAmount = parseFloat((amount / emiMonths).toFixed(2));

    const advance = await prisma.salaryAdvance.create({
      data: {
        tenantId: getTenantId() ?? undefined,
        userId: user!.userId,
        amount,
        reason,
        emiMonths,
        emiAmount,
        remainingAmount: amount,
        status: "Pending",
      },
    });

    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Salary advance requested",
      data: { advanceId: advance.id, amount, emiAmount, emiMonths },
    });
  } catch (error) {
    logger.error("POST /payroll/advances error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /payroll/advances
 * HR sees all advances; employees see their own.
 */
export async function listSalaryAdvances(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const isPrivileged = await canApproveAdvances(
      user!.userId,
      user!.tenantRole,
    );
    const { status, search } = req.query as Record<string, string>;
    const { page, limit } = parsePagination(req.query);
    const skip = (page - 1) * limit;
    const take = limit;

    const where: any = {};
    if (!isPrivileged) {
      // Only ever their own advances — a name search wouldn't reveal
      // anyone else's regardless, so it's not applied here.
      where.userId = user!.userId;
    } else if (search) {
      const matchingUsers = await prisma.user.findMany({
        where: {
          OR: [
            { first_name: { contains: search, mode: "insensitive" } },
            { last_name: { contains: search, mode: "insensitive" } },
            { username: { contains: search, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      where.userId = { in: matchingUsers.map((u) => u.id) };
    }
    if (status) where.status = status;

    const [advances, total] = await Promise.all([
      prisma.salaryAdvance.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.salaryAdvance.count({ where }),
    ]);

    // Enrich with usernames.
    const uids = [...new Set((advances as any[]).map((a: any) => a.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: uids as string[] } },
      select: { id: true, username: true, first_name: true, last_name: true },
    });
    const uMap = new Map(users.map((u) => [u.id, u]));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Salary advances retrieved",
      data: (advances as any[]).map((a: any) => ({
        ...a,
        employee: uMap.get(a.userId),
      })),
      total,
    });
  } catch (error) {
    logger.error("GET /payroll/advances error:", { error });
    return handleError(res, error);
  }
}

/**
 * PATCH /payroll/advances/:advanceId/status
 * HR approves or rejects a salary advance.
 */
export async function updateSalaryAdvanceStatus(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const allowed = await canApproveAdvances(user!.userId, user!.tenantRole);
    if (!allowed) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You do not have permission to update advance status",
      });
    }

    const { advanceId, action, emiAmount } = req.body as {
      advanceId: string;
      action: "approve" | "reject";
      emiAmount?: number;
    };

    const advance = await prisma.salaryAdvance.findFirst({
      where: { id: advanceId, tenantId: getTenantId() },
    });
    if (!advance) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Advance not found",
      });
    }
    if ((advance as any).status !== "Pending") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Cannot ${action} an advance with status '${(advance as any).status}'`,
      });
    }

    let updateData: any;
    if (action === "approve" && emiAmount !== undefined) {
      // HR can override the EMI amount.
      const months = Math.ceil((advance as any).amount / emiAmount);
      updateData = {
        status: "Approved",
        approvedBy: user!.userId,
        approvedAt: new Date(),
        emiAmount,
        emiMonths: months,
      };
    } else if (action === "approve") {
      updateData = {
        status: "Approved",
        approvedBy: user!.userId,
        approvedAt: new Date(),
      };
    } else {
      updateData = { status: "Rejected" };
    }

    // Compare-and-swap guard — same TOCTOU as payroll run status updates
    // (see updatePayrollRunStatus above): without the `status: "Pending"`
    // clause, two concurrent approve/reject requests both pass the check
    // above and both apply.
    try {
      await prisma.salaryAdvance.update({
        where: { id: advanceId, status: "Pending" },
        data: updateData,
      });
    } catch (err: any) {
      if (err?.code === "P2025") {
        return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
          message:
            "This advance was already updated by another request. Please refresh and try again.",
        });
      }
      throw err;
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `Salary advance ${action}d`,
    });
  } catch (error) {
    logger.error("PATCH /payroll/advances/:advanceId/status error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /payroll/my-payslips
 * Returns the current employee's payslips (from SalaryStructure).
 *
 * SalaryStructure is written by two different flows that share the same
 * table: HR editing an employee's salary config (Salary Management, which
 * defaults to the *current* month and can also target future months), and
 * payroll disbursement upserting a payslip snapshot per employee (see the
 * "Generate payslips" step above). Only the latter represents money that
 * was actually paid out, so a row must not be shown here unless a
 * PayrollRun for its (year, month) has actually reached "disbursed" —
 * otherwise employees see a "payslip" for a month payroll hasn't run yet.
 */
export async function getMyPayslips(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { page, limit } = parsePagination(req.query);
    const skip = (page - 1) * limit;

    const disbursedRuns = await prisma.payrollRun.findMany({
      where: { status: "disbursed" },
      select: { year: true, month: true },
    });
    const disbursedPeriods = new Set(
      disbursedRuns.map((r) => `${r.year}-${r.month}`),
    );

    const structures = await prisma.salaryStructure.findMany({
      where: { userId: user!.userId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    const allPayslips = structures.filter((s) =>
      disbursedPeriods.has(`${s.year}-${s.month}`),
    );
    const payslips = allPayslips.slice(skip, skip + limit);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Payslips retrieved",
      data: payslips,
      total: allPayslips.length,
    });
  } catch (error) {
    logger.error("GET /payroll/my-payslips error:", { error });
    return handleError(res, error);
  }
}
