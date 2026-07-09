import { Response } from "express";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { isSuperUser } from "../utils/user";

function requireTenantId(req: AuthRequest, res: Response): string | null {
  const { tenantId } = req.user!;
  if (!tenantId) {
    apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
    return null;
  }
  return tenantId;
}

async function isPrivileged(req: AuthRequest): Promise<boolean> {
  const { userId, tenantRole } = req.user!;
  const superUser = await isSuperUser(userId);
  return superUser || ["owner", "admin", "hr"].includes(tenantRole ?? "");
}

/**
 * PUT /resignations/:id/renegotiate-notice
 * Logs the change as an event (who asked, why) rather than silently
 * overwriting lastWorkingDay, so a date that moves twice (employee asks to
 * leave earlier, then manager asks them to stay) has an audit trail.
 */
export async function renegotiateNotice(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { userId } = req.user!;
    const { id: resignationId } = req.params as { id: string };
    const { newLastWorkingDay, reason } = req.body;

    const resignation = await (prisma as any).resignation.findFirst({
      where: { id: resignationId, tenantId },
    });
    if (!resignation) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Resignation not found.",
      });
    }
    if (!["Submitted", "Approved"].includes(resignation.status)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "Can only renegotiate notice on a submitted or approved resignation.",
      });
    }

    const [, event] = await Promise.all([
      (prisma as any).resignation.update({
        where: { id: resignationId },
        data: {
          lastWorkingDay: new Date(newLastWorkingDay),
          lastUpdatedOn: new Date(),
        },
      }),
      (prisma as any).resignationNoticeEvent.create({
        data: {
          tenantId,
          resignationId,
          previousLastWorkingDay: resignation.lastWorkingDay,
          newLastWorkingDay: new Date(newLastWorkingDay),
          reason: reason ?? null,
          changedBy: userId,
        },
      }),
    ]);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Last working day updated.",
      data: event,
    });
  } catch (error: unknown) {
    logger.error("renegotiateNotice error:", { error });
    return handleError(res, error);
  }
}

/** GET /resignations/:id/notice-events */
export async function listNoticeEvents(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { id: resignationId } = req.params as { id: string };
    const events = await (prisma as any).resignationNoticeEvent.findMany({
      where: { tenantId, resignationId },
      orderBy: { createdAt: "asc" },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: events });
  } catch (error: unknown) {
    logger.error("listNoticeEvents error:", { error });
    return handleError(res, error);
  }
}

/** PUT /resignations/:id/rehire-eligibility */
export async function setRehireEligibility(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can set rehire eligibility.",
    });
  }
  try {
    const { id: resignationId } = req.params as { id: string };
    const { rehireEligible } = req.body as { rehireEligible: boolean };
    const resignation = await (prisma as any).resignation.findFirst({
      where: { id: resignationId, tenantId },
    });
    if (!resignation) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Resignation not found.",
      });
    }
    const updated = await (prisma as any).resignation.update({
      where: { id: resignationId },
      data: { rehireEligible },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Rehire eligibility updated.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("setRehireEligibility error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /resignations/:id/fnf-settlement
 * Computes a draft settlement from the employee's leave balance (encashable
 * portion) and notice-period compliance. This is a first-pass calculation
 * meant for HR to review/adjust, not an auto-disbursement — payroll
 * integration (actual payout) lands with the Payroll module.
 */
export async function computeFnfSettlement(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can compute a settlement.",
    });
  }
  try {
    const { userId: createdBy } = req.user!;
    const { id: resignationId } = req.params as { id: string };

    const resignation = await (prisma as any).resignation.findFirst({
      where: { id: resignationId, tenantId },
    });
    if (!resignation) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Resignation not found.",
      });
    }

    const [latestSalary, leaveBalance, settings] = await Promise.all([
      (prisma as any).salaryStructure.findFirst({
        where: { tenantId, userId: resignation.userId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
      (prisma as any).leaveBalance.findFirst({
        where: { tenantId, userId: resignation.userId },
      }),
      (prisma as any).tenantSettings.findFirst({
        where: { tenantId, effectiveFrom: { lte: new Date() } },
        orderBy: { effectiveFrom: "desc" },
        select: { leavePolicies: true },
      }),
    ]);

    const grossPayable = latestSalary?.grossSalary ?? 0;
    const perDayRate = grossPayable > 0 ? grossPayable / 30 : 0;

    // Sum encashable leave across whichever types the tenant has configured
    // with encashment.enabled — 0 for tenants that haven't set this up.
    const leavePolicies = (settings?.leavePolicies as any[]) ?? [];
    const balances = (leaveBalance?.balances as Record<string, number>) ?? {};
    let leaveEncashmentAmount = 0;
    for (const policy of leavePolicies) {
      if (!policy.encashment?.enabled) continue;
      const available = balances[policy.key];
      if (typeof available !== "number") continue;
      const days = policy.encashment.maxDaysPerYear
        ? Math.min(available, policy.encashment.maxDaysPerYear)
        : available;
      const rate = policy.encashment.ratePerDay ?? perDayRate;
      leaveEncashmentAmount += days * rate;
    }

    // Notice shortfall: if the employee left before their resolved notice
    // period was served and it wasn't waived, deduct the shortfall in lieu.
    let noticeShortfallDeduction = 0;
    if (
      !resignation.noticePeriodWaived &&
      resignation.noticePeriodDays &&
      resignation.resignationDate &&
      resignation.lastWorkingDay
    ) {
      const servedDays = Math.round(
        (new Date(resignation.lastWorkingDay).getTime() -
          new Date(resignation.resignationDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const shortfallDays = Math.max(
        0,
        resignation.noticePeriodDays - servedDays,
      );
      noticeShortfallDeduction = shortfallDays * perDayRate;
    }

    const lineItems = [
      {
        label: "Leave encashment",
        type: "earning",
        amount: leaveEncashmentAmount,
      },
      {
        label: "Notice period shortfall",
        type: "deduction",
        amount: noticeShortfallDeduction,
      },
    ];
    const totalDeductions = noticeShortfallDeduction;
    const netPayable = leaveEncashmentAmount - totalDeductions;

    const settlement = await (prisma as any).fnfSettlement.upsert({
      where: { resignationId },
      update: {
        lineItems,
        leaveEncashmentAmount,
        noticeShortfallDeduction,
        grossPayable: leaveEncashmentAmount,
        totalDeductions,
        netPayable,
      },
      create: {
        tenantId,
        resignationId,
        userId: resignation.userId,
        lineItems,
        leaveEncashmentAmount,
        noticeShortfallDeduction,
        grossPayable: leaveEncashmentAmount,
        totalDeductions,
        netPayable,
        createdBy,
      },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Settlement computed.",
      data: settlement,
    });
  } catch (error: unknown) {
    logger.error("computeFnfSettlement error:", { error });
    return handleError(res, error);
  }
}

/** PUT /resignations/:id/fnf-settlement/approve */
export async function approveFnfSettlement(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can approve a settlement.",
    });
  }
  try {
    const { userId } = req.user!;
    const { id: resignationId } = req.params as { id: string };
    const settlement = await (prisma as any).fnfSettlement.findFirst({
      where: { resignationId, tenantId },
    });
    if (!settlement) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Settlement not found.",
      });
    }
    const updated = await (prisma as any).fnfSettlement.update({
      where: { id: settlement.id },
      data: { status: "approved", approvedBy: userId, approvedAt: new Date() },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Settlement approved.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("approveFnfSettlement error:", { error });
    return handleError(res, error);
  }
}
